import anyio
import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient

from app import langfuse_db
from app.auth_context import CurrentUserContext, get_current_user_context
from app.config import Settings
from app.errors import BusinessError
from app.langfuse_clickhouse import get_langfuse_clickhouse_reader
from app.langfuse_clickhouse import get_langfuse_clickhouse_score_writer
from app.langfuse_client import get_langfuse_client
from app.annotations import (
    AnnotationBatchFiltersPayload,
    _annotation_item_filter_counts,
    _enrich_annotation_items_with_clickhouse_scores,
    _filter_annotation_items,
    _prefill_annotation_scores_from_trace_rows,
    _save_annotation_scores_with_langfuse_api,
    execute_claimed_trace_bulk_job,
)
from app.langfuse_db import (
    LangfuseDatabaseReader,
    _annotation_score_api_payload,
    _copy_existing_annotation_scores_for_item,
    get_langfuse_db_reader,
)
from app.main import app


class FakeAnnotationDatabaseReader:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []
        self.trace_bulk_jobs: dict[str, dict] = {}

    async def create_trace_bulk_job_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.calls.append(("create_trace_bulk_job", (project_id, user_id, payload)))
        now = datetime.now(timezone.utc).isoformat()
        job_id = f"bulk-job-{len(self.trace_bulk_jobs) + 1}"
        row = {
            "id": job_id,
            "projectId": project_id,
            "userId": user_id,
            "jobType": payload["jobType"],
            "status": "PENDING",
            "selectionType": payload["selectionType"],
            "selectionPayload": payload["selectionPayload"],
            "operationPayload": payload["operationPayload"],
            "cursorPayload": {},
            "resultPayload": payload.get("resultPayload") or {},
            "totalCount": payload["totalCount"],
            "completedCount": 0,
            "successCount": 0,
            "failureCount": 0,
            "attemptCount": 0,
            "errorMessage": "",
            "createdAt": now,
            "updatedAt": now,
            "startedAt": "",
            "completedAt": "",
            "expiresAt": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
            "lockOwner": "",
            "lockUntil": "",
        }
        self.trace_bulk_jobs[job_id] = row
        return dict(row)

    async def get_trace_bulk_job_for_user(
        self,
        project_id: str,
        user_id: str,
        job_id: str,
    ) -> dict:
        self.calls.append(("get_trace_bulk_job", (project_id, user_id, job_id)))
        row = self.trace_bulk_jobs.get(job_id)
        if not row or row["projectId"] != project_id or row["userId"] != user_id:
            raise BusinessError(1033, "批量任务不存在或已过期", 404)
        return dict(row)

    async def claim_trace_bulk_job(
        self,
        job_id: str,
        lock_owner: str,
        lease_seconds: int,
    ) -> dict | None:
        self.calls.append(("claim_trace_bulk_job", (job_id, lock_owner, lease_seconds)))
        row = self.trace_bulk_jobs.get(job_id)
        if not row or row["status"] not in {"PENDING", "RUNNING"}:
            return None
        row.update(
            {
                "status": "RUNNING",
                "lockOwner": lock_owner,
                "attemptCount": row["attemptCount"] + 1,
                "startedAt": row["startedAt"] or datetime.now(timezone.utc).isoformat(),
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            }
        )
        return dict(row)

    async def claim_trace_bulk_jobs(
        self,
        lock_owner: str,
        lease_seconds: int,
        limit: int,
    ) -> list[dict]:
        claimed: list[dict] = []
        for job_id in list(self.trace_bulk_jobs):
            job = await self.claim_trace_bulk_job(job_id, lock_owner, lease_seconds)
            if job:
                claimed.append(job)
            if len(claimed) >= limit:
                break
        return claimed

    async def update_trace_bulk_job(
        self,
        job_id: str,
        lock_owner: str,
        updates: dict,
    ) -> dict:
        self.calls.append(("update_trace_bulk_job", (job_id, lock_owner, updates)))
        row = self.trace_bulk_jobs[job_id]
        row.update(updates)
        row["updatedAt"] = datetime.now(timezone.utc).isoformat()
        if row.get("status") in {"SUCCEEDED", "FAILED"}:
            row["lockOwner"] = ""
            row["lockUntil"] = ""
        return dict(row)

    async def list_annotation_queues_for_user(
        self,
        project_id: str,
        user_id: str,
    ) -> list[dict]:
        self.calls.append(("list_queues", (project_id, user_id)))
        return [
            {
                "id": "queue-1",
                "projectId": project_id,
                "name": "客服质量人工标注",
                "description": "覆盖差评和慢响应 trace",
                "scoreConfigIds": ["score-1"],
                "assigneeIds": ["user-1"],
                "completedCount": 1,
                "pendingCount": 2,
                "scoreConfigs": [
                    {
                        "id": "score-1",
                        "projectId": project_id,
                        "name": "准确性",
                        "dataType": "NUMERIC",
                        "description": "",
                        "minValue": 1,
                        "maxValue": 5,
                        "categories": [],
                        "archived": False,
                    }
                ],
                "assignees": [
                    {"id": "user-1", "name": "Octocat", "email": "octocat@example.com"}
                ],
                "createdAt": "2026-07-06T01:00:00.000Z",
                "updatedAt": "2026-07-06T02:00:00.000Z",
            }
        ]

    async def create_annotation_queue_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.calls.append(("create_queue", (project_id, user_id, payload)))
        return {
            "id": "queue-created",
            "projectId": project_id,
            "name": payload["name"],
            "description": payload["description"],
            "scoreConfigIds": payload["scoreConfigIds"],
            "assigneeIds": payload["assigneeIds"],
            "completedCount": 0,
            "pendingCount": 0,
            "scoreConfigs": [],
            "assignees": [],
            "createdAt": "2026-07-06T01:00:00.000Z",
            "updatedAt": "2026-07-06T01:00:00.000Z",
        }

    async def is_annotation_queue_name_available_for_user(
        self,
        project_id: str,
        user_id: str,
        name: str,
    ) -> bool:
        self.calls.append(("check_queue_name", (project_id, user_id, name)))
        return name != "客服质量人工标注"

    async def create_trace_annotation_task_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.calls.append(("create_trace_task", (project_id, user_id, payload)))
        return {"queueId": "queue-1", "createdCount": 2, "skippedCount": 1}

    async def ensure_default_score_config_for_user(
        self,
        project_id: str,
        user_id: str,
    ) -> dict:
        self.calls.append(("ensure_default_score_config", (project_id, user_id)))
        return {
            "id": "score-default",
            "projectId": project_id,
            "name": "人工质量评分",
            "dataType": "NUMERIC",
            "description": "Trace 人工标注默认评分指标",
            "minValue": 1,
            "maxValue": 5,
            "categories": [],
            "archived": False,
        }

    async def list_score_configs_for_user(
        self,
        project_id: str,
        user_id: str,
        *,
        include_archived: bool,
        keyword: str | None,
        page: int,
        page_size: int,
    ) -> dict:
        self.calls.append(
            (
                "list_score_configs",
                (project_id, user_id, include_archived, keyword, page, page_size),
            )
        )
        return {
            "total": 1,
            "datas": [
                {
                    "id": "score-default",
                    "projectId": project_id,
                    "name": "人工质量评分",
                    "dataType": "NUMERIC",
                    "description": "Trace 人工标注默认评分指标",
                    "minValue": 1,
                    "maxValue": 5,
                    "categories": [],
                    "archived": False,
                }
            ],
        }

    async def create_score_config_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.calls.append(("create_score_config", (project_id, user_id, payload)))
        return {
            "id": "score-created",
            "projectId": project_id,
            "name": payload["name"],
            "dataType": payload["dataType"],
            "description": payload["description"],
            "minValue": payload["minValue"],
            "maxValue": payload["maxValue"],
            "categories": payload["categories"],
            "archived": False,
        }

    async def update_score_config_for_user(
        self,
        project_id: str,
        config_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.calls.append(
            ("update_score_config", (project_id, config_id, user_id, payload))
        )
        return {
            "id": config_id,
            "projectId": project_id,
            "name": payload["name"],
            "dataType": payload["dataType"],
            "description": payload["description"],
            "minValue": payload["minValue"],
            "maxValue": payload["maxValue"],
            "categories": payload["categories"],
            "archived": False,
        }

    async def set_score_config_archived_for_user(
        self,
        project_id: str,
        config_id: str,
        user_id: str,
        archived: bool,
    ) -> dict:
        self.calls.append(
            ("set_score_config_archived", (project_id, config_id, user_id, archived))
        )
        return {
            "id": config_id,
            "projectId": project_id,
            "name": "准确性",
            "dataType": "NUMERIC",
            "description": "",
            "minValue": 1,
            "maxValue": 5,
            "categories": [],
            "archived": archived,
        }

    async def add_traces_to_dataset_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.calls.append(("add_traces_to_dataset", (project_id, user_id, payload)))
        return {
            "datasetId": payload["datasetId"],
            "successCount": len(payload["traces"]),
            "failureCount": 0,
            "itemIds": ["dataset-item-1"],
            "failures": [],
        }

    async def save_annotation_scores_for_user(
        self,
        project_id: str,
        queue_id: str,
        item_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.calls.append(
            ("save_scores", (project_id, queue_id, item_id, user_id, payload))
        )
        return {
            "id": item_id,
            "projectId": project_id,
            "queueId": queue_id,
            "objectId": "trace-1",
            "objectType": "TRACE",
            "status": "COMPLETED",
            "source": {
                "objectId": "trace-1",
                "objectType": "TRACE",
                "title": "trace-1",
                "input": {},
                "output": {},
                "metadata": {},
                "traceId": "trace-1",
                "observationId": "",
                "sessionId": "",
                "userId": "",
                "latencyMs": 0,
                "costUsd": 0,
                "createdAt": "2026-07-06T01:00:00.000Z",
            },
            "scores": [],
            "completedAt": "2026-07-06T02:00:00.000Z",
            "completedBy": {
                "id": "user-1",
                "name": "Octocat",
                "email": "octocat@example.com",
            },
            "createdAt": "2026-07-06T01:00:00.000Z",
            "updatedAt": "2026-07-06T02:00:00.000Z",
        }

    async def prepare_annotation_score_payloads_for_user(
        self,
        project_id: str,
        queue_id: str,
        item_id: str,
        user_id: str,
        payload: dict,
    ) -> list[dict]:
        self.calls.append(
            ("prepare_scores", (project_id, queue_id, item_id, user_id, payload))
        )
        return [
            {
                "id": "pa-ann-score-1",
                "name": "准确性",
                "traceId": "trace-1",
                "observationId": None,
                "value": 4,
                "dataType": "NUMERIC",
                "source": "ANNOTATION",
                "configId": "score-1",
                "queueId": queue_id,
                "comment": "回答准确",
                "metadata": {"annotationItemId": item_id},
            }
        ]

    async def prepare_annotation_score_payloads_batch_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
        items: list[dict],
    ) -> list[dict]:
        self.calls.append(
            ("prepare_scores_batch", (project_id, queue_id, user_id, items))
        )
        payloads: list[dict] = []
        for item in items:
            payloads.extend(
                await self.prepare_annotation_score_payloads_for_user(
                    project_id,
                    queue_id,
                    item["itemId"],
                    user_id,
                    item["scorePayload"],
                )
            )
        return payloads

    async def complete_annotation_queue_item_for_user(
        self,
        project_id: str,
        queue_id: str,
        item_id: str,
        user_id: str,
    ) -> dict:
        self.calls.append(("complete_item", (project_id, queue_id, item_id, user_id)))
        return await self.save_annotation_scores_for_user(
            project_id,
            queue_id,
            item_id,
            user_id,
            {"scores": []},
        )

    async def complete_annotation_queue_items_for_user(
        self,
        project_id: str,
        queue_id: str,
        item_ids: list[str],
        user_id: str,
    ) -> None:
        self.calls.append(("complete_items", (project_id, queue_id, item_ids, user_id)))

    async def get_project_api_key_credentials_for_user(
        self,
        project_id: str,
        user_id: str,
    ) -> dict[str, str]:
        self.calls.append(("get_project_api_key", (project_id, user_id)))
        return {"publicKey": "pk-lf-test", "secretKey": "sk-lf-test"}

    async def list_annotation_queue_items_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
    ) -> list[dict]:
        self.calls.append(("list_items", (project_id, queue_id, user_id)))
        return [
            {
                "id": "item-1",
                "projectId": project_id,
                "queueId": queue_id,
                "objectId": "trace-1",
                "objectType": "TRACE",
                "status": "PENDING",
                "source": {
                    "objectId": "trace-1",
                    "objectType": "TRACE",
                    "title": "trace-1",
                    "input": {},
                    "output": {},
                    "metadata": {},
                    "traceId": "trace-1",
                    "observationId": "",
                    "sessionId": "",
                    "userId": "",
                    "latencyMs": 0,
                    "costUsd": 0,
                    "createdAt": "2026-07-06T01:00:00.000Z",
                },
                "scores": [],
                "completedAt": "",
                "completedBy": None,
                "createdAt": "2026-07-06T01:00:00.000Z",
                "updatedAt": "2026-07-06T01:00:00.000Z",
            },
            {
                "id": "item-2",
                "projectId": project_id,
                "queueId": queue_id,
                "objectId": "trace-2",
                "objectType": "TRACE",
                "status": "PENDING",
                "source": {
                    "objectId": "trace-2",
                    "objectType": "TRACE",
                    "title": "trace-2",
                    "input": {"question": "如何修改发票抬头？"},
                    "output": {"answer": "进入订单详情修改"},
                    "metadata": {"environment": "production", "errorType": "billing"},
                    "traceId": "trace-2",
                    "observationId": "",
                    "sessionId": "session-2",
                    "userId": "user-2",
                    "latencyMs": 10,
                    "costUsd": 0,
                    "createdAt": "2026-07-06T01:10:00.000Z",
                },
                "scores": [],
                "completedAt": "",
                "completedBy": None,
                "createdAt": "2026-07-06T01:10:00.000Z",
                "updatedAt": "2026-07-06T01:10:00.000Z",
            },
            {
                "id": "item-done",
                "projectId": project_id,
                "queueId": queue_id,
                "objectId": "trace-done",
                "objectType": "TRACE",
                "status": "COMPLETED",
                "source": {
                    "objectId": "trace-done",
                    "objectType": "TRACE",
                    "title": "trace-done",
                    "input": {"question": "已完成样本"},
                    "output": {"answer": "已处理"},
                    "metadata": {"environment": "production"},
                    "traceId": "trace-done",
                    "observationId": "",
                    "sessionId": "session-done",
                    "userId": "user-done",
                    "latencyMs": 20,
                    "costUsd": 0,
                    "createdAt": "2026-07-06T01:20:00.000Z",
                },
                "scores": [],
                "completedAt": "2026-07-06T02:00:00.000Z",
                "completedBy": {
                    "id": "user-1",
                    "name": "Octocat",
                    "email": "octocat@example.com",
                },
                "createdAt": "2026-07-06T01:20:00.000Z",
                "updatedAt": "2026-07-06T02:00:00.000Z",
            },
        ]

    async def iter_annotation_queue_items_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
        *,
        batch_size: int = 500,
        **_: object,
    ):
        items = await self.list_annotation_queue_items_for_user(
            project_id, queue_id, user_id
        )
        for index in range(0, len(items), batch_size):
            yield items[index : index + batch_size]

    async def list_annotation_queue_items_page_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
        *,
        page: int,
        page_size: int,
        filters: dict,
    ) -> dict:
        self.calls.append(
            (
                "list_items_page",
                (project_id, queue_id, user_id, page, page_size, filters),
            )
        )
        items = await self.list_annotation_queue_items_for_user(
            project_id,
            queue_id,
            user_id,
        )
        filtered = _filter_annotation_items(
            items,
            AnnotationBatchFiltersPayload.model_validate(filters),
        )
        start = (page - 1) * page_size
        return {"total": len(filtered), "datas": filtered[start : start + page_size]}

    async def count_annotation_queue_item_filters_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
        *,
        filters: dict,
    ) -> dict:
        self.calls.append(
            ("count_item_filters", (project_id, queue_id, user_id, filters))
        )
        items = await self.list_annotation_queue_items_for_user(
            project_id,
            queue_id,
            user_id,
        )
        return _annotation_item_filter_counts(
            items,
            AnnotationBatchFiltersPayload.model_validate(filters),
        )

    async def get_annotation_queue_item_for_user(
        self,
        project_id: str,
        queue_id: str,
        item_id: str,
        user_id: str,
    ) -> dict:
        self.calls.append(("get_item", (project_id, queue_id, item_id, user_id)))
        items = await self.list_annotation_queue_items_for_user(
            project_id,
            queue_id,
            user_id,
        )
        return next(item for item in items if item["id"] == item_id)

    async def update_annotation_queue_item_assignees_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
        item_ids: list[str],
        assignee_user_id: str,
    ) -> dict:
        self.calls.append(
            (
                "update_item_assignees",
                (project_id, queue_id, user_id, item_ids, assignee_user_id),
            )
        )
        items = await self.list_annotation_queue_items_for_user(
            project_id,
            queue_id,
            user_id,
        )
        selected = [item for item in items if item["id"] in item_ids]
        updated_ids = [
            item["id"] for item in selected if item.get("status") == "PENDING"
        ]
        skipped_ids = [
            item["id"] for item in selected if item.get("status") == "COMPLETED"
        ]
        return {
            "assigneeUserId": assignee_user_id,
            "requestedCount": len(item_ids),
            "updatedCount": len(updated_ids),
            "skippedCount": len(skipped_ids),
            "updatedItemIds": updated_ids,
            "skippedItemIds": skipped_ids,
        }


class RecordingCursor:
    def __init__(self, rows: list[dict] | None = None) -> None:
        self.rows = rows or []
        self.executions: list[tuple[str, dict]] = []

    async def execute(self, sql: str, params: dict) -> None:
        self.executions.append((sql, params))

    async def fetchall(self) -> list[dict]:
        return self.rows


class FakeAnnotationTraceReader:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []
        self.list_calls: list[tuple[str, list[str], str | None]] = []
        self.source_calls: list[tuple[str, list[str]]] = []
        self.score_calls: list[tuple[str, str, str | None]] = []
        self.scores_by_queue: dict[str, list[dict]] = {}
        self.scores_by_trace: dict[str, list[dict]] = {}

    async def get_trace(self, project_id: str, trace_id: str) -> dict:
        self.calls.append((project_id, trace_id))
        return {
            "traceId": trace_id,
            "sessionId": "session-1",
            "projectId": project_id,
            "projectName": "",
            "environment": "default",
            "status": "success",
            "latency": 120,
            "createdAt": "2026-07-06T01:00:00.000Z",
            "updatedAt": "2026-07-06T01:00:01.000Z",
            "userId": "user-1",
            "businessId": "app-1",
            "tags": ["workflow"],
            "input": '{"question":"退款多久到账"}',
            "output": '{"answer":"通常 1-3 个工作日到账"}',
            "metadata": {"app_id": "app-1"},
            "callChain": [],
            "scores": self.scores_by_trace.get(trace_id, []),
        }

    async def list_traces_by_ids(
        self,
        project_id: str,
        trace_ids: list[str],
        *,
        fields: str | None = None,
    ) -> list[dict]:
        self.list_calls.append((project_id, trace_ids, fields))
        requested_fields = {
            field.strip().lower()
            for field in str(fields or "").split(",")
            if field.strip()
        }
        traces = [await self.get_trace(project_id, trace_id) for trace_id in trace_ids]
        if "scores" not in requested_fields:
            for trace in traces:
                trace.pop("scores", None)
        return traces

    async def list_trace_sources(
        self,
        project_id: str,
        trace_ids: list[str],
    ) -> dict[str, dict]:
        self.source_calls.append((project_id, trace_ids))
        sources = {
            trace_id: {
                "traceId": trace_id,
                "sessionId": "session-1",
                "projectId": project_id,
                "projectName": "",
                "environment": "default",
                "status": "success",
                "latency": 120,
                "createdAt": "2026-07-06T01:00:00.000Z",
                "updatedAt": "2026-07-06T01:00:01.000Z",
                "userId": "user-1",
                "businessId": "app-1",
                "tags": [],
                "input": {"question": f"问题 {trace_id}"},
                "output": {"answer": f"回答 {trace_id}"},
                "metadata": {
                    "app_id": "target-app" if trace_id == "trace-0999" else "other-app"
                },
            }
            for trace_id in trace_ids
        }
        if "trace-1" in sources:
            sources["trace-1"].update(
                {
                    "tags": ["workflow"],
                    "input": '{"question":"退款多久到账"}',
                    "output": '{"answer":"通常 1-3 个工作日到账"}',
                    "metadata": {"app_id": "app-1"},
                }
            )
        return sources

    async def list_scores_by_queue(
        self,
        project_id: str,
        queue_id: str,
        *,
        run_id: str | None = None,
        **_: object,
    ) -> list[dict]:
        self.score_calls.append((project_id, queue_id, run_id))
        return self.scores_by_queue.get(queue_id, [])


class FakeLangfuseClient:
    def __init__(self) -> None:
        self.created_scores: list[tuple[str, str, dict]] = []
        self.updated_score_configs: list[tuple[str, str, str, dict]] = []

    async def create_score(
        self,
        public_key: str,
        secret_key: str,
        payload: dict,
    ) -> dict:
        self.created_scores.append((public_key, secret_key, payload))
        return {"id": payload["id"]}

    async def update_score_config(
        self,
        public_key: str,
        secret_key: str,
        config_id: str,
        payload: dict,
    ) -> dict:
        self.updated_score_configs.append((public_key, secret_key, config_id, payload))
        return {"id": config_id, **payload}


class FakeClickHouseScoreWriter:
    def __init__(self) -> None:
        self.upserted_scores: list[tuple[str, str, dict]] = []

    async def upsert_annotation_score(
        self,
        project_id: str,
        user_id: str,
        score_request: dict,
    ) -> None:
        self.upserted_scores.append((project_id, user_id, score_request))


def override_reader(fake_reader: FakeAnnotationDatabaseReader) -> None:
    async def _override() -> LangfuseDatabaseReader:
        return fake_reader  # type: ignore[return-value]

    app.dependency_overrides[get_langfuse_db_reader] = _override
    app.dependency_overrides[get_langfuse_clickhouse_reader] = lambda: (
        FakeAnnotationTraceReader()
    )
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id="user-1",
        email="octocat@example.com",
        login="octocat",
    )
    app.dependency_overrides[get_langfuse_client] = lambda: FakeLangfuseClient()
    app.dependency_overrides[get_langfuse_clickhouse_score_writer] = lambda: (
        FakeClickHouseScoreWriter()
    )


def override_reader_and_trace_reader(
    fake_reader: FakeAnnotationDatabaseReader,
    fake_trace_reader: FakeAnnotationTraceReader,
    fake_langfuse_client: FakeLangfuseClient | None = None,
    fake_score_writer: FakeClickHouseScoreWriter | None = None,
) -> None:
    async def _override() -> LangfuseDatabaseReader:
        return fake_reader  # type: ignore[return-value]

    app.dependency_overrides[get_langfuse_db_reader] = _override
    app.dependency_overrides[get_langfuse_clickhouse_reader] = lambda: fake_trace_reader
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id="user-1",
        email="octocat@example.com",
        login="octocat",
    )
    app.dependency_overrides[get_langfuse_client] = lambda: (
        fake_langfuse_client or FakeLangfuseClient()
    )
    app.dependency_overrides[get_langfuse_clickhouse_score_writer] = lambda: (
        fake_score_writer or FakeClickHouseScoreWriter()
    )


def clear_overrides() -> None:
    app.dependency_overrides.clear()


def test_lists_project_annotation_queues_with_filters() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues",
            params={"keyword": "客服", "page": 1, "pageSize": 10},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"]["total"] == 1
    assert body["data"]["datas"][0]["id"] == "queue-1"
    assert fake_reader.calls[0] == ("list_queues", ("project-1", "user-1"))


def test_creates_project_annotation_queue() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    payload = {
        "name": "新增人工标注",
        "description": "人工复核",
        "scoreConfigIds": ["score-1"],
        "assigneeIds": ["user-1"],
        "assignmentStrategy": "average",
        "assignmentWeights": {"user-1": 1},
    }
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues",
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["id"] == "queue-created"
    assert fake_reader.calls[0] == (
        "create_queue",
        ("project-1", "user-1", payload),
    )


def test_checks_annotation_queue_name_availability_before_create() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/name-availability",
            params={"name": "  客服质量人工标注  "},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"] == {"available": False}
    assert fake_reader.calls[0] == (
        "check_queue_name",
        ("project-1", "user-1", "客服质量人工标注"),
    )


def test_creates_trace_annotation_task_with_real_queue_items() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    payload = {"traceIds": ["trace-1", "trace-2", "trace-1"]}
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/traces/annotation-task",
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"] == {
        "queueId": "queue-1",
        "createdCount": 2,
        "skippedCount": 1,
        "traceCount": 3,
    }
    assert fake_reader.calls[0] == (
        "create_trace_task",
        ("project-1", "user-1", payload),
    )


def test_creates_trace_annotation_task_in_existing_queue() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    payload = {"traceIds": ["trace-1"], "queueId": "queue-existing"}
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/traces/annotation-task",
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["queueId"] == "queue-1"
    assert fake_reader.calls[0] == (
        "create_trace_task",
        ("project-1", "user-1", payload),
    )


def test_creates_trace_annotation_task_job_and_reports_completion() -> None:
    class BatchAnnotationReader(FakeAnnotationDatabaseReader):
        async def create_trace_annotation_task_for_user(
            self,
            project_id: str,
            user_id: str,
            payload: dict,
        ) -> dict:
            self.calls.append(("create_trace_task", (project_id, user_id, payload)))
            return {
                "queueId": payload.get("queueId") or "queue-created",
                "createdCount": len(payload.get("traceIds") or []),
                "skippedCount": 0,
                "createdItems": [
                    {"itemId": f"item-{trace_id}", "traceId": trace_id}
                    for trace_id in payload.get("traceIds") or []
                ],
                "scoreConfigIds": [],
            }

    fake_reader = BatchAnnotationReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/traces/annotation-task-jobs",
            json={
                "traceIds": ["trace-1", "trace-2"],
                "queueId": "queue-1",
            },
        )
        assert response.status_code == 200
        job_id = response.json()["data"]["id"]

        job_response = TestClient(app).get(
            f"/api/projects/project-1/traces/annotation-task-jobs/{job_id}",
        )
    finally:
        clear_overrides()

    assert job_response.status_code == 200
    job = job_response.json()["data"]
    assert job["status"] == "SUCCEEDED"
    assert job["queueId"] == "queue-1"
    assert job["totalCount"] == 2
    assert job["createdCount"] == 2
    assert job["skippedCount"] == 0
    assert job["completedCount"] == 2
    assert job["percent"] == 100
    assert any(call[0] == "create_trace_bulk_job" for call in fake_reader.calls)
    assert any(call[0] == "get_trace_bulk_job" for call in fake_reader.calls)
    assert [call for call in fake_reader.calls if call[0] == "create_trace_task"] == [
        (
            "create_trace_task",
            (
                "project-1",
                "user-1",
                {"traceIds": ["trace-1", "trace-2"], "queueId": "queue-1"},
            ),
        )
    ]


def test_creates_trace_annotation_task_prefills_scores_from_trace_detail() -> None:
    class PrefillAnnotationReader(FakeAnnotationDatabaseReader):
        async def create_trace_annotation_task_for_user(
            self,
            project_id: str,
            user_id: str,
            payload: dict,
        ) -> dict:
            self.calls.append(("create_trace_task", (project_id, user_id, payload)))
            return {
                "queueId": "queue-new",
                "createdCount": 1,
                "skippedCount": 0,
                "createdItems": [{"itemId": "item-new", "traceId": "trace-1"}],
                "scoreConfigIds": ["score-1"],
            }

    fake_reader = PrefillAnnotationReader()
    fake_trace_reader = FakeAnnotationTraceReader()
    fake_trace_reader.scores_by_trace["trace-1"] = [
        {
            "id": "trace-score-1",
            "traceId": "trace-1",
            "name": "准确性",
            "value": 5,
            "source": "ANNOTATION",
            "comment": "Trace 页面当前评分",
            "configId": "score-1",
            "dataType": "NUMERIC",
            "stringValue": "",
            "queueId": "queue-old",
        }
    ]
    fake_langfuse_client = FakeLangfuseClient()
    fake_score_writer = FakeClickHouseScoreWriter()
    override_reader_and_trace_reader(
        fake_reader,
        fake_trace_reader,
        fake_langfuse_client,
        fake_score_writer,
    )

    payload = {"traceIds": ["trace-1"], "queueId": "queue-new"}
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/traces/annotation-task",
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"] == {
        "queueId": "queue-new",
        "createdCount": 1,
        "skippedCount": 0,
        "traceCount": 1,
    }
    assert fake_trace_reader.list_calls == [("project-1", ["trace-1"], "scores")]
    assert fake_reader.calls[1] == (
        "prepare_scores_batch",
        (
            "project-1",
            "queue-new",
            "user-1",
            [
                {
                    "itemId": "item-new",
                    "traceId": "trace-1",
                    "scorePayload": {
                        "scores": [
                            {
                                "configId": "score-1",
                                "value": 5,
                                "stringValue": "",
                                "comment": "Trace 页面当前评分",
                            }
                        ]
                    },
                }
            ],
        ),
    )
    assert [call[0] for call in fake_reader.calls] == [
        "create_trace_task",
        "prepare_scores_batch",
        "prepare_scores",
        "get_project_api_key",
    ]
    assert fake_langfuse_client.created_scores
    assert fake_score_writer.upserted_scores[0][2]["queueId"] == "queue-new"


def test_prefills_annotation_scores_with_bounded_concurrency_and_failure_details() -> (
    None
):
    class BatchReader(FakeAnnotationDatabaseReader):
        def __init__(self) -> None:
            super().__init__()
            self._settings = type(
                "Settings",
                (),
                {"pa_eval_annotation_score_concurrency": 2},
            )()

        async def prepare_annotation_score_payloads_batch_for_user(
            self,
            project_id: str,
            queue_id: str,
            user_id: str,
            items: list[dict],
        ) -> list[dict]:
            self.calls.append(
                ("prepare_scores_batch", (project_id, queue_id, user_id, items))
            )
            return [
                {
                    "id": f"score-{index}",
                    "name": "准确性",
                    "traceId": item["traceId"],
                    "value": index,
                    "dataType": "NUMERIC",
                    "source": "ANNOTATION",
                    "configId": "score-1",
                    "queueId": queue_id,
                    "metadata": {"annotationItemId": item["itemId"]},
                }
                for index, item in enumerate(items)
            ]

    class ConcurrentClient(FakeLangfuseClient):
        def __init__(self) -> None:
            super().__init__()
            self.active = 0
            self.max_active = 0

        async def create_score(
            self,
            public_key: str,
            secret_key: str,
            payload: dict,
        ) -> None:
            self.active += 1
            self.max_active = max(self.max_active, self.active)
            await anyio.sleep(0.01)
            self.active -= 1
            if payload["id"] == "score-1":
                raise RuntimeError("upstream failed")
            self.created_scores.append((public_key, secret_key, payload))

    reader = BatchReader()
    trace_reader = FakeAnnotationTraceReader()
    trace_reader.scores_by_trace = {
        f"trace-{index}": [{"configId": "score-1", "name": "准确性", "value": index}]
        for index in range(3)
    }
    client = ConcurrentClient()

    async def run_prefill() -> list[dict]:
        return await _prefill_annotation_scores_from_trace_rows(
            project_id="project-1",
            queue_id="queue-1",
            created_items=[
                {"itemId": f"item-{index}", "traceId": f"trace-{index}"}
                for index in range(3)
            ],
            score_config_ids=["score-1"],
            user_id="user-1",
            reader=reader,
            trace_reader=trace_reader,
            langfuse_client=client,
        )

    failures = anyio.run(run_prefill)

    assert client.max_active == 2
    assert len(client.created_scores) == 2
    assert failures == [
        {
            "scoreId": "score-1",
            "traceId": "trace-1",
            "reason": "upstream failed",
        }
    ]
    assert [call[0] for call in reader.calls] == [
        "prepare_scores_batch",
        "get_project_api_key",
    ]


def test_copies_existing_annotation_scores_for_new_queue_item() -> None:
    cursor = RecordingCursor(
        rows=[
            {
                "config_id": "score-1",
                "name": "准确性",
                "value": 4.0,
                "data_type": "NUMERIC",
                "string_value": None,
                "comment": "上一轮标注",
                "author_user_id": "annotator-1",
                "trace_id": "trace-1",
                "observation_id": None,
            },
            {
                "config_id": "score-2",
                "name": "结论",
                "value": 1.0,
                "data_type": "BOOLEAN",
                "string_value": "通过",
                "comment": "",
                "author_user_id": "annotator-2",
                "trace_id": "trace-1",
                "observation_id": None,
            },
        ]
    )

    async def _run_copy() -> int:
        return await _copy_existing_annotation_scores_for_item(
            cursor,  # type: ignore[arg-type]
            project_id="project-1",
            queue_id="queue-new",
            item_id="item-new",
            object_id="trace-1",
            object_type="TRACE",
            score_config_ids=["score-1", "score-2"],
        )

    copied_count = anyio.run(_run_copy)

    assert copied_count == 2
    assert len(cursor.executions) == 2
    _select_sql, select_params = cursor.executions[0]
    first_insert_sql, first_insert_params = cursor.executions[1]
    assert "SELECT DISTINCT ON (candidate.item_id, s.config_id)" in _select_sql
    assert "INSERT INTO scores" in first_insert_sql
    assert select_params["score_config_ids"] == ["score-1", "score-2"]
    assert first_insert_params["queue_id"] == "queue-new"
    assert first_insert_params["config_id_0"] == "score-1"
    assert first_insert_params["id_0"] != "score-1"
    assert first_insert_params["trace_id_0"] == "trace-1"
    assert first_insert_params["comment_0"] == "上一轮标注"
    assert first_insert_params["config_id_1"] == "score-2"


def test_ensures_default_score_config_for_manual_annotation_queue() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/score-configs/default",
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["id"] == "score-default"
    assert body["data"]["name"] == "人工质量评分"
    assert fake_reader.calls[0] == (
        "ensure_default_score_config",
        ("project-1", "user-1"),
    )


def test_lists_score_configs_with_pa_pagination() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/score-configs",
            params={
                "includeArchived": True,
                "keyword": "准确",
                "page": 2,
                "pageSize": 5,
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"] == {
        "total": 1,
        "datas": [
            {
                "id": "score-default",
                "projectId": "project-1",
                "name": "人工质量评分",
                "dataType": "NUMERIC",
                "description": "Trace 人工标注默认评分指标",
                "minValue": 1,
                "maxValue": 5,
                "categories": [],
                "archived": False,
            }
        ],
    }
    assert fake_reader.calls == [
        (
            "list_score_configs",
            ("project-1", "user-1", True, "准确", 2, 5),
        )
    ]


def test_creates_updates_and_archives_score_configs() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    payload = {
        "name": "准确性",
        "dataType": "NUMERIC",
        "description": "答案是否准确",
        "minValue": 1,
        "maxValue": 5,
        "categories": [],
    }
    try:
        client = TestClient(app)
        create_response = client.post(
            "/api/projects/project-1/score-configs",
            json=payload,
        )
        update_response = client.patch(
            "/api/projects/project-1/score-configs/score-created",
            json={**payload, "description": "更新说明"},
        )
        archive_response = client.post(
            "/api/projects/project-1/score-configs/score-created/archive"
        )
        restore_response = client.post(
            "/api/projects/project-1/score-configs/score-created/restore"
        )
    finally:
        clear_overrides()

    assert create_response.status_code == 200
    assert update_response.status_code == 200
    assert archive_response.status_code == 200
    assert restore_response.status_code == 200
    assert fake_reader.calls == [
        ("create_score_config", ("project-1", "user-1", payload)),
        (
            "update_score_config",
            (
                "project-1",
                "score-created",
                "user-1",
                {**payload, "description": "更新说明"},
            ),
        ),
        ("set_score_config_archived", ("project-1", "score-created", "user-1", True)),
        ("set_score_config_archived", ("project-1", "score-created", "user-1", False)),
    ]


def test_score_config_payload_uses_langfuse_category_objects() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    payload = {
        "name": "问题类型",
        "dataType": "CATEGORICAL",
        "description": "人工标注的问题分类",
        "minValue": None,
        "maxValue": None,
        "categories": [
            {"label": "工具调用错误", "value": 1},
            {"label": "答案事实错误", "value": 2},
        ],
    }
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/score-configs",
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_reader.calls[0] == (
        "create_score_config",
        ("project-1", "user-1", payload),
    )


def test_boolean_score_config_uses_langfuse_standard_categories() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/score-configs",
            json={
                "name": "是否合格",
                "dataType": "BOOLEAN",
                "description": "",
                "categories": [
                    {"label": "合格", "value": 99},
                    {"label": "不合格", "value": -1},
                ],
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_reader.calls[0][1][2]["categories"] == [
        {"label": "True", "value": 1},
        {"label": "False", "value": 0},
    ]


def test_rejects_invalid_categorical_score_config_categories() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/score-configs",
            json={
                "name": "问题类型",
                "dataType": "CATEGORICAL",
                "description": "",
                "categories": [
                    {"label": "重复", "value": 1},
                    {"label": "重复", "value": 2},
                ],
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 400
    assert response.json()["code"] != 0


def test_adds_selected_traces_to_dataset_with_trace_details() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    payload = {"datasetId": "dataset-1", "traceIds": ["trace-1"]}
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/traces/dataset-items",
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["successCount"] == 1
    assert fake_reader.calls[0][0] == "add_traces_to_dataset"
    assert fake_reader.calls[0][1][0:2] == ("project-1", "user-1")
    assert fake_reader.calls[0][1][2]["datasetId"] == "dataset-1"
    assert fake_reader.calls[0][1][2]["traces"][0]["traceId"] == "trace-1"
    assert fake_reader.calls[0][1][2]["traces"][0]["input"] == (
        '{"question":"退款多久到账"}'
    )


def test_adds_selected_traces_to_dataset_with_batch_trace_lookup() -> None:
    class BatchTraceReader:
        def __init__(self) -> None:
            self.calls: list[tuple[str, object]] = []

        async def get_trace(self, project_id: str, trace_id: str) -> dict:
            raise AssertionError("trace dataset import should not call get_trace")

        async def list_traces_by_ids(
            self,
            project_id: str,
            trace_ids: list[str],
            *,
            fields: str | None = None,
        ) -> list[dict]:
            self.calls.append(("list_traces_by_ids", (project_id, trace_ids, fields)))
            return [
                {
                    "traceId": trace_id,
                    "input": f'{{"question":"{trace_id}"}}',
                    "output": "{}",
                    "metadata": {},
                }
                for trace_id in trace_ids
                if trace_id != "missing-trace"
            ]

    fake_reader = FakeAnnotationDatabaseReader()
    trace_reader = BatchTraceReader()
    override_reader_and_trace_reader(fake_reader, trace_reader)

    payload = {
        "datasetId": "dataset-1",
        "traceIds": ["trace-1", "trace-2", "trace-1", "missing-trace"],
    }
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/traces/dataset-items",
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert trace_reader.calls == [
        (
            "list_traces_by_ids",
            ("project-1", ["trace-1", "trace-2", "missing-trace"], "io,metadata"),
        )
    ]
    assert fake_reader.calls[0][1][2]["traces"] == [
        {
            "traceId": "trace-1",
            "input": '{"question":"trace-1"}',
            "output": "{}",
            "metadata": {},
        },
        {
            "traceId": "trace-2",
            "input": '{"question":"trace-2"}',
            "output": "{}",
            "metadata": {},
        },
    ]
    assert response.json()["data"]["successCount"] == 2
    assert response.json()["data"]["failureCount"] == 1
    assert response.json()["data"]["failures"] == [
        {"traceId": "missing-trace", "reason": "Trace 不存在或无访问权限"}
    ]
    assert response.json()["data"]["traceCount"] == 4


def test_creates_trace_dataset_import_job_and_reports_completion() -> None:
    class BatchTraceReader:
        async def list_traces_by_ids(
            self,
            project_id: str,
            trace_ids: list[str],
            *,
            fields: str | None = None,
        ) -> list[dict]:
            return [
                {
                    "traceId": trace_id,
                    "input": f'{{"question":"{trace_id}"}}',
                    "output": "{}",
                    "metadata": {},
                }
                for trace_id in trace_ids
                if trace_id != "missing-trace"
            ]

    fake_reader = FakeAnnotationDatabaseReader()
    override_reader_and_trace_reader(fake_reader, BatchTraceReader())

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/traces/dataset-import-jobs",
            json={
                "datasetId": "dataset-1",
                "traceIds": ["trace-1", "missing-trace"],
            },
        )
        assert response.status_code == 200
        job_id = response.json()["data"]["id"]

        job_response = TestClient(app).get(
            f"/api/projects/project-1/traces/dataset-import-jobs/{job_id}",
        )
    finally:
        clear_overrides()

    assert job_response.status_code == 200
    job = job_response.json()["data"]
    assert job["status"] == "SUCCEEDED"
    assert job["datasetId"] == "dataset-1"
    assert job["totalCount"] == 2
    assert job["successCount"] == 1
    assert job["failureCount"] == 1
    assert job["completedCount"] == 2
    assert job["percent"] == 100
    assert job["failures"] == [
        {"traceId": "missing-trace", "reason": "Trace 不存在或无访问权限"}
    ]
    assert any(call[0] == "create_trace_bulk_job" for call in fake_reader.calls)
    assert any(call[0] == "get_trace_bulk_job" for call in fake_reader.calls)


def test_resumes_claimed_dataset_import_job_from_persisted_cursor() -> None:
    class BatchTraceReader:
        def __init__(self) -> None:
            self.trace_ids: list[str] = []

        async def list_traces_by_ids(
            self,
            project_id: str,
            trace_ids: list[str],
            *,
            fields: str | None = None,
        ) -> list[dict]:
            self.trace_ids.extend(trace_ids)
            return [
                {
                    "traceId": trace_id,
                    "input": {},
                    "output": {},
                    "metadata": {},
                }
                for trace_id in trace_ids
            ]

    fake_reader = FakeAnnotationDatabaseReader()
    trace_reader = BatchTraceReader()
    job = anyio.run(
        fake_reader.create_trace_bulk_job_for_user,
        "project-1",
        "user-1",
        {
            "jobType": "DATASET_IMPORT",
            "selectionType": "EXPLICIT",
            "selectionPayload": {"traceIds": ["trace-1", "trace-2", "trace-3"]},
            "operationPayload": {"datasetId": "dataset-1"},
            "resultPayload": {"itemIds": ["existing-item"], "failures": []},
            "totalCount": 3,
        },
    )
    stored = fake_reader.trace_bulk_jobs[job["id"]]
    stored.update(
        {
            "status": "RUNNING",
            "cursorPayload": {"offset": 2},
            "completedCount": 2,
            "successCount": 2,
            "lockOwner": "worker-1",
        }
    )

    anyio.run(
        execute_claimed_trace_bulk_job,
        dict(stored),
        fake_reader,
        trace_reader,
        FakeLangfuseClient(),
        FakeClickHouseScoreWriter(),
        "worker-1",
    )

    assert trace_reader.trace_ids == ["trace-3"]
    assert fake_reader.trace_bulk_jobs[job["id"]]["status"] == "SUCCEEDED"
    assert fake_reader.trace_bulk_jobs[job["id"]]["completedCount"] == 3


def test_creates_dataset_import_job_from_trace_filter_snapshot() -> None:
    class FilterTraceReader:
        def __init__(self) -> None:
            self.count_filters: list[dict] = []
            self.batch_filters: list[dict] = []

        async def count_traces(self, project_id: str, **filters: object) -> int:
            self.count_filters.append(filters)
            return 2

        async def list_trace_ids_for_bulk(
            self,
            project_id: str,
            *,
            filters: dict,
            cursor: dict,
            excluded_trace_ids: list[str],
            limit: int,
        ) -> dict:
            self.batch_filters.append(filters)
            return {
                "traceIds": ["trace-1", "trace-2"],
                "cursor": {"createdAt": "2026-07-19T00:00:00Z", "traceId": "trace-2"},
                "hasMore": False,
            }

        async def list_traces_by_ids(
            self,
            project_id: str,
            trace_ids: list[str],
            *,
            fields: str | None = None,
        ) -> list[dict]:
            return [
                {
                    "traceId": trace_id,
                    "input": {},
                    "output": {},
                    "metadata": {},
                }
                for trace_id in trace_ids
            ]

    fake_reader = FakeAnnotationDatabaseReader()
    trace_reader = FilterTraceReader()
    override_reader_and_trace_reader(fake_reader, trace_reader)
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/traces/dataset-import-jobs",
            json={
                "datasetId": "dataset-1",
                "selection": {
                    "type": "FILTER",
                    "filters": {"timeRange": "7d", "statuses": ["failed"]},
                    "excludedTraceIds": [],
                },
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["totalCount"] == 2
    assert trace_reader.count_filters == [{"time_range": "7d", "statuses": ["failed"]}]
    assert trace_reader.batch_filters == [{"time_range": "7d", "statuses": ["failed"]}]
    create_call = next(
        call for call in fake_reader.calls if call[0] == "create_trace_bulk_job"
    )
    assert create_call[1][2]["selectionType"] == "FILTER"


def test_add_traces_to_dataset_skips_existing_dataset_trace_items(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Cursor:
        def __init__(self) -> None:
            self.queries: list[tuple[str, dict]] = []
            self._fetchone_row: dict | None = None
            self._fetchall_rows: list[dict] = []

        async def __aenter__(self) -> "Cursor":
            return self

        async def __aexit__(self, *args) -> None:
            return None

        async def execute(self, sql: str, params: dict | None = None) -> None:
            params = params or {}
            self.queries.append((sql, params))
            if "FROM datasets" in sql:
                self._fetchone_row = {"id": params["dataset_id"]}
            elif "FROM dataset_items" in sql and "source_trace_id = ANY" in sql:
                self._fetchall_rows = [{"source_trace_id": "trace-1"}]

        async def fetchone(self) -> dict | None:
            return self._fetchone_row

        async def fetchall(self) -> list[dict]:
            return self._fetchall_rows

    class Connection:
        def __init__(self, cursor: Cursor) -> None:
            self._cursor = cursor

        async def __aenter__(self) -> "Connection":
            return self

        async def __aexit__(self, *args) -> None:
            return None

        def cursor(self) -> Cursor:
            return self._cursor

    cursor = Cursor()

    async def fake_connect(*args, **kwargs) -> Connection:
        return Connection(cursor)

    async def fake_get_project_for_user(self, cursor, project_id, user_id):
        return {"id": project_id}

    monkeypatch.setattr(
        langfuse_db.psycopg.AsyncConnection,
        "connect",
        fake_connect,
    )
    monkeypatch.setattr(
        LangfuseDatabaseReader,
        "_get_project_for_user",
        fake_get_project_for_user,
    )
    monkeypatch.setattr(
        langfuse_db,
        "_new_langfuse_id",
        lambda prefix: f"{prefix}-new",
    )

    reader = LangfuseDatabaseReader(
        langfuse_db.Settings(langfuse_database_url="postgres://test")
    )
    result = anyio.run(
        reader.add_traces_to_dataset_for_user,
        "project-1",
        "user-1",
        {
            "datasetId": "dataset-1",
            "traces": [
                {"traceId": "trace-1", "input": "{}", "output": "{}", "metadata": {}},
                {"traceId": "trace-2", "input": "{}", "output": "{}", "metadata": {}},
            ],
        },
    )

    insert_queries = [
        (sql, params)
        for sql, params in cursor.queries
        if "INSERT INTO dataset_items" in sql
    ]
    assert len(insert_queries) == 1
    assert insert_queries[0][1]["source_trace_id_0"] == "trace-2"
    assert result["successCount"] == 1
    assert result["itemIds"] == ["datasetitem-new"]


def test_saves_annotation_scores_and_completes_queue_item() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    fake_langfuse_client = FakeLangfuseClient()
    fake_score_writer = FakeClickHouseScoreWriter()
    override_reader_and_trace_reader(
        fake_reader,
        FakeAnnotationTraceReader(),
        fake_langfuse_client,
        fake_score_writer,
    )

    payload = {
        "scores": [
            {
                "configId": "score-1",
                "value": 4,
                "stringValue": "",
                "comment": "回答准确",
            }
        ]
    }
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/items/item-1/scores",
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "COMPLETED"
    assert fake_reader.calls[0] == (
        "prepare_scores",
        ("project-1", "queue-1", "item-1", "user-1", payload),
    )
    assert fake_reader.calls[1] == ("get_project_api_key", ("project-1", "user-1"))
    assert fake_langfuse_client.created_scores == [
        (
            "pk-lf-test",
            "sk-lf-test",
            {
                "id": "pa-ann-score-1",
                "name": "准确性",
                "traceId": "trace-1",
                "observationId": None,
                "value": 4,
                "dataType": "NUMERIC",
                "source": "ANNOTATION",
                "configId": "score-1",
                "queueId": "queue-1",
                "comment": "回答准确",
                "metadata": {"annotationItemId": "item-1"},
            },
        )
    ]
    assert fake_reader.calls[2] == (
        "complete_item",
        ("project-1", "queue-1", "item-1", "user-1"),
    )
    assert fake_score_writer.upserted_scores == []


def test_saves_boolean_annotation_score_without_clickhouse_double_write() -> None:
    class BooleanAnnotationReader(FakeAnnotationDatabaseReader):
        async def prepare_annotation_score_payloads_for_user(
            self,
            project_id: str,
            queue_id: str,
            item_id: str,
            user_id: str,
            payload: dict,
        ) -> list[dict]:
            self.calls.append(
                ("prepare_scores", (project_id, queue_id, item_id, user_id, payload))
            )
            return [
                {
                    "id": "pa-ann-score-bool",
                    "name": "内容是否全",
                    "traceId": "trace-1",
                    "observationId": None,
                    "value": 0,
                    "stringValue": "False",
                    "dataType": "BOOLEAN",
                    "source": "ANNOTATION",
                    "configId": "score-bool",
                    "queueId": queue_id,
                    "comment": "",
                    "metadata": {"annotationItemId": item_id},
                }
            ]

    fake_reader = BooleanAnnotationReader()
    fake_langfuse_client = FakeLangfuseClient()
    fake_score_writer = FakeClickHouseScoreWriter()
    score_payload = {
        "scores": [
            {
                "configId": "score-bool",
                "value": False,
                "stringValue": "",
                "comment": "",
            }
        ]
    }

    async def _run_save() -> None:
        await _save_annotation_scores_with_langfuse_api(
            project_id="project-1",
            queue_id="queue-1",
            item_id="item-1",
            user_id="user-1",
            score_payload=score_payload,
            reader=fake_reader,  # type: ignore[arg-type]
            langfuse_client=fake_langfuse_client,  # type: ignore[arg-type]
            score_writer=fake_score_writer,  # type: ignore[arg-type]
        )

    anyio.run(_run_save)

    assert fake_langfuse_client.created_scores[0][2]["value"] == 0
    assert fake_langfuse_client.created_scores[0][2]["stringValue"] == "False"
    assert fake_score_writer.upserted_scores == []


def test_previews_annotation_batch_scope_without_overwriting_completed_items() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    payload = {
        "filters": {
            "keyword": "trace",
            "status": ["PENDING", "COMPLETED"],
            "objectType": ["TRACE"],
        },
        "limit": 2,
    }
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/batch-preview",
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["totalCount"] == 3
    assert body["pendingCount"] == 2
    assert body["completedCount"] == 1
    assert [item["id"] for item in body["samples"]] == ["item-1", "item-2"]
    assert "待标注 2 条" in body["filterSummary"]
    assert fake_reader.calls[0] == ("list_items", ("project-1", "queue-1", "user-1"))


def test_previews_annotation_batch_with_time_and_metadata_filters() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/batch-preview",
            json={
                "filters": {
                    "status": ["PENDING"],
                    "objectType": ["TRACE"],
                    "createdAtFrom": "2026-07-06T01:05:00.000Z",
                    "createdAtTo": "2026-07-06T01:15:00.000Z",
                    "metadataFilter": {
                        "key": "errorType",
                        "operator": "equals",
                        "value": "billing",
                    },
                },
                "limit": 5,
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["totalCount"] == 1
    assert body["pendingCount"] == 1
    assert [item["id"] for item in body["samples"]] == ["item-2"]
    assert "Metadata：errorType equals" in body["filterSummary"]


def test_previews_annotation_batch_with_multiple_metadata_filters() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/batch-preview",
            json={
                "filters": {
                    "status": ["PENDING"],
                    "metadataFilters": [
                        {
                            "key": "environment",
                            "operator": "equals",
                            "value": "production",
                        },
                        {
                            "key": "errorType",
                            "operator": "exists",
                        },
                    ],
                },
                "limit": 5,
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["totalCount"] == 1
    assert body["pendingCount"] == 1
    assert [item["id"] for item in body["samples"]] == ["item-2"]
    assert "Metadata：2 个条件" in body["filterSummary"]


def test_lists_annotation_items_with_multiple_metadata_filters() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/queue-1/items",
            params={
                "status": "PENDING",
                "metadataFilters": (
                    '[{"key":"environment","operator":"equals","value":"production"},'
                    '{"key":"errorType","operator":"exists"}]'
                ),
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["total"] == 1
    assert [item["id"] for item in body["datas"]] == ["item-2"]


def test_counts_annotation_item_filters_across_all_matching_items() -> None:
    class FilterCountReader(FakeAnnotationDatabaseReader):
        async def list_annotation_queue_items_for_user(
            self,
            project_id: str,
            queue_id: str,
            user_id: str,
        ) -> list[dict]:
            self.calls.append(("list_items", (project_id, queue_id, user_id)))
            base = await super().list_annotation_queue_items_for_user(
                project_id,
                queue_id,
                user_id,
            )
            return [
                {
                    **base[0],
                    "assignee": {
                        "id": "user-1",
                        "name": "Octocat",
                        "email": "octocat@example.com",
                    },
                },
                {
                    **base[1],
                    "assignee": {
                        "id": "user-2",
                        "name": "Reviewer",
                        "email": "reviewer@example.com",
                    },
                },
                {**base[2], "assignee": None},
                {
                    **base[0],
                    "id": "item-observation",
                    "objectId": "observation-1",
                    "objectType": "OBSERVATION",
                    "status": "PENDING",
                    "assignee": {
                        "id": "user-2",
                        "name": "Reviewer",
                        "email": "reviewer@example.com",
                    },
                    "source": {
                        **base[0]["source"],
                        "objectId": "observation-1",
                        "objectType": "OBSERVATION",
                        "title": "observation billing",
                    },
                },
                {
                    **base[0],
                    "id": "item-session",
                    "objectId": "session-1",
                    "objectType": "SESSION",
                    "status": "COMPLETED",
                    "source": {
                        **base[0]["source"],
                        "objectId": "session-1",
                        "objectType": "SESSION",
                        "title": "session billing",
                    },
                },
            ]

    fake_reader = FilterCountReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/queue-1/items/filter-counts",
            params={"status": "PENDING", "objectType": "OBSERVATION"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_reader.calls[0][0] == "count_item_filters"
    assert response.json()["data"] == {
        "status": {"PENDING": 1, "COMPLETED": 0},
        "objectType": {"TRACE": 2, "OBSERVATION": 1, "SESSION": 0},
        "assigneeIds": {"user-1": 0, "user-2": 1},
    }


def test_lists_annotation_items_with_input_and_output_filters() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/queue-1/items",
            params={
                "status": "PENDING",
                "inputFilters": '[{"key":"question","operator":"contains","value":"发票"}]',
                "outputFilters": '[{"key":"answer","operator":"contains","value":"订单详情"}]',
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["total"] == 1
    assert [item["id"] for item in body["datas"]] == ["item-2"]


def test_lists_annotation_items_enriches_empty_trace_source() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/queue-1/items",
            params={"status": "PENDING"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    item = next(row for row in body["datas"] if row["id"] == "item-1")
    assert item["source"]["input"] == '{"question":"退款多久到账"}'
    assert item["source"]["output"] == '{"answer":"通常 1-3 个工作日到账"}'
    assert item["source"]["metadata"] == {"app_id": "app-1"}
    assert item["source"]["sessionId"] == "session-1"
    assert item["source"]["userId"] == "user-1"


def test_lists_annotation_items_uses_latest_clickhouse_scores() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    fake_trace_reader = FakeAnnotationTraceReader()
    fake_trace_reader.scores_by_queue["queue-1"] = [
        {
            "id": "score-latest",
            "traceId": "trace-done",
            "observationId": "",
            "name": "准确性",
            "value": 5,
            "source": "ANNOTATION",
            "comment": "来自 ClickHouse 的最新评分",
            "metadata": {"annotationItemId": "item-done"},
            "authorUserId": "user-1",
            "configId": "score-1",
            "dataType": "NUMERIC",
            "stringValue": "",
            "longStringValue": "",
            "queueId": "queue-1",
            "createdAt": "2026-07-06T03:00:00.000Z",
            "updatedAt": "2026-07-06T03:00:00.000Z",
        }
    ]
    override_reader_and_trace_reader(fake_reader, fake_trace_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/queue-1/items",
            params={"status": "COMPLETED"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    item = response.json()["data"]["datas"][0]
    assert item["id"] == "item-done"
    assert item["scores"] == fake_trace_reader.scores_by_queue["queue-1"]


def test_large_annotation_export_score_enrichment_scopes_each_score_query() -> None:
    class RecordingScoreReader:
        def __init__(self) -> None:
            self.calls: list[dict] = []

        async def list_scores_by_queue(
            self,
            project_id: str,
            queue_id: str,
            **kwargs: object,
        ) -> list[dict]:
            self.calls.append(kwargs)
            return []

    trace_reader = RecordingScoreReader()
    items = [
        {
            "id": f"item-{index}",
            "objectId": f"trace-{index}",
            "objectType": "TRACE",
            "scores": [],
        }
        for index in range(1001)
    ]

    result = anyio.run(
        _enrich_annotation_items_with_clickhouse_scores,
        "project-1",
        "queue-1",
        items,
        trace_reader,
    )

    assert result == items
    assert len(trace_reader.calls) == 3
    assert all(len(call["annotation_item_ids"]) <= 500 for call in trace_reader.calls)
    assert [
        item_id
        for call in trace_reader.calls
        for item_id in call["annotation_item_ids"]
    ] == [f"item-{index}" for index in range(1001)]


def test_gets_annotation_item_enriches_only_current_trace_source() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    fake_trace_reader = FakeAnnotationTraceReader()
    override_reader_and_trace_reader(fake_reader, fake_trace_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/queue-1/items/item-1"
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    item = response.json()["data"]
    assert item["id"] == "item-1"
    assert item["source"]["input"] == '{"question":"退款多久到账"}'
    assert item["source"]["output"] == '{"answer":"通常 1-3 个工作日到账"}'
    assert item["source"]["metadata"] == {"app_id": "app-1"}
    assert fake_trace_reader.calls == [("project-1", "trace-1")]


def test_gets_annotation_item_uses_latest_clickhouse_scores() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    fake_trace_reader = FakeAnnotationTraceReader()
    fake_trace_reader.scores_by_queue["queue-1"] = [
        {
            "id": "score-latest",
            "traceId": "trace-done",
            "observationId": "",
            "name": "准确性",
            "value": 5,
            "source": "ANNOTATION",
            "comment": "来自 ClickHouse 的最新评分",
            "metadata": {"annotationItemId": "item-done"},
            "authorUserId": "user-1",
            "configId": "score-1",
            "dataType": "NUMERIC",
            "stringValue": "",
            "longStringValue": "",
            "queueId": "queue-1",
            "createdAt": "2026-07-06T03:00:00.000Z",
            "updatedAt": "2026-07-06T03:00:00.000Z",
        }
    ]
    override_reader_and_trace_reader(fake_reader, fake_trace_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/queue-1/items/item-done"
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    item = response.json()["data"]
    assert item["id"] == "item-done"
    assert item["scores"] == fake_trace_reader.scores_by_queue["queue-1"]


def test_lists_large_annotation_queue_enriches_only_current_page() -> None:
    class LargeQueueReader(FakeAnnotationDatabaseReader):
        async def list_annotation_queue_items_for_user(
            self,
            project_id: str,
            queue_id: str,
            user_id: str,
        ) -> list[dict]:
            self.calls.append(("list_items", (project_id, queue_id, user_id)))
            return [
                {
                    "id": f"item-{index:04d}",
                    "projectId": project_id,
                    "queueId": queue_id,
                    "objectId": f"trace-{index:04d}",
                    "objectType": "TRACE",
                    "status": "PENDING",
                    "source": {
                        "objectId": f"trace-{index:04d}",
                        "objectType": "TRACE",
                        "title": f"trace-{index:04d}",
                        "input": {},
                        "output": {},
                        "metadata": {"app_id": "target-app"} if index == 999 else {},
                        "traceId": f"trace-{index:04d}",
                        "observationId": "",
                        "sessionId": "",
                        "userId": "",
                        "latencyMs": 0,
                        "costUsd": 0,
                        "createdAt": "2026-07-06T01:00:00.000Z",
                    },
                    "scores": [],
                    "completedAt": "",
                    "completedBy": None,
                    "assignee": None,
                    "createdAt": "2026-07-06T01:00:00.000Z",
                    "updatedAt": "2026-07-06T01:00:00.000Z",
                }
                for index in range(1000)
            ]

    fake_reader = LargeQueueReader()
    fake_trace_reader = FakeAnnotationTraceReader()
    override_reader_and_trace_reader(fake_reader, fake_trace_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/queue-1/items",
            params={"page": 2, "pageSize": 10},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["total"] == 1000
    assert [item["id"] for item in body["datas"]] == [
        f"item-{index:04d}" for index in range(10, 20)
    ]
    assert fake_trace_reader.calls == []
    assert fake_trace_reader.source_calls == [
        ("project-1", [f"trace-{index:04d}" for index in range(10, 20)])
    ]


def test_counts_large_annotation_queue_filters_without_trace_enrichment() -> None:
    class LargeQueueReader(FakeAnnotationDatabaseReader):
        async def list_annotation_queue_items_for_user(
            self,
            project_id: str,
            queue_id: str,
            user_id: str,
        ) -> list[dict]:
            self.calls.append(("list_items", (project_id, queue_id, user_id)))
            return [
                {
                    "id": f"item-{index:04d}",
                    "projectId": project_id,
                    "queueId": queue_id,
                    "objectId": f"trace-{index:04d}",
                    "objectType": "TRACE",
                    "status": "PENDING" if index % 2 == 0 else "COMPLETED",
                    "source": {
                        "objectId": f"trace-{index:04d}",
                        "objectType": "TRACE",
                        "title": f"trace-{index:04d}",
                        "input": {},
                        "output": {},
                        "metadata": {"app_id": "target-app"} if index == 999 else {},
                        "traceId": f"trace-{index:04d}",
                        "observationId": "",
                        "sessionId": "",
                        "userId": "",
                        "latencyMs": 0,
                        "costUsd": 0,
                        "createdAt": "2026-07-06T01:00:00.000Z",
                    },
                    "scores": [],
                    "completedAt": "",
                    "completedBy": None,
                    "assignee": {"id": "user-1", "name": "Octocat", "email": ""},
                    "createdAt": "2026-07-06T01:00:00.000Z",
                    "updatedAt": "2026-07-06T01:00:00.000Z",
                }
                for index in range(1000)
            ]

    fake_reader = LargeQueueReader()
    fake_trace_reader = FakeAnnotationTraceReader()
    override_reader_and_trace_reader(fake_reader, fake_trace_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/queue-1/items/filter-counts"
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["status"] == {"PENDING": 500, "COMPLETED": 500}
    assert fake_trace_reader.calls == []


def test_lists_large_annotation_queue_with_metadata_filter_uses_batch_trace_sources() -> (
    None
):
    class LargeQueueReader(FakeAnnotationDatabaseReader):
        async def list_annotation_queue_items_for_user(
            self,
            project_id: str,
            queue_id: str,
            user_id: str,
        ) -> list[dict]:
            self.calls.append(("list_items", (project_id, queue_id, user_id)))
            return [
                {
                    "id": f"item-{index:04d}",
                    "projectId": project_id,
                    "queueId": queue_id,
                    "objectId": f"trace-{index:04d}",
                    "objectType": "TRACE",
                    "status": "PENDING",
                    "source": {
                        "objectId": f"trace-{index:04d}",
                        "objectType": "TRACE",
                        "title": f"trace-{index:04d}",
                        "input": {},
                        "output": {},
                        "metadata": {"app_id": "target-app"} if index == 999 else {},
                        "traceId": f"trace-{index:04d}",
                        "observationId": "",
                        "sessionId": "",
                        "userId": "",
                        "latencyMs": 0,
                        "costUsd": 0,
                        "createdAt": "2026-07-06T01:00:00.000Z",
                    },
                    "scores": [],
                    "completedAt": "",
                    "completedBy": None,
                    "assignee": None,
                    "createdAt": "2026-07-06T01:00:00.000Z",
                    "updatedAt": "2026-07-06T01:00:00.000Z",
                }
                for index in range(1000)
            ]

    fake_reader = LargeQueueReader()
    fake_trace_reader = FakeAnnotationTraceReader()
    override_reader_and_trace_reader(fake_reader, fake_trace_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/queue-1/items",
            params={
                "page": 1,
                "pageSize": 10,
                "metadataFilters": (
                    '[{"key":"app_id","operator":"equals","value":"target-app"}]'
                ),
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["total"] == 1
    assert [item["id"] for item in body["datas"]] == ["item-0999"]
    assert fake_trace_reader.source_calls == []
    assert fake_trace_reader.calls == []


def test_counts_large_annotation_queue_with_metadata_filter_uses_batch_trace_sources() -> (
    None
):
    class LargeQueueReader(FakeAnnotationDatabaseReader):
        async def list_annotation_queue_items_for_user(
            self,
            project_id: str,
            queue_id: str,
            user_id: str,
        ) -> list[dict]:
            self.calls.append(("list_items", (project_id, queue_id, user_id)))
            return [
                {
                    "id": f"item-{index:04d}",
                    "projectId": project_id,
                    "queueId": queue_id,
                    "objectId": f"trace-{index:04d}",
                    "objectType": "TRACE",
                    "status": "PENDING" if index % 2 == 0 else "COMPLETED",
                    "source": {
                        "objectId": f"trace-{index:04d}",
                        "objectType": "TRACE",
                        "title": f"trace-{index:04d}",
                        "input": {},
                        "output": {},
                        "metadata": {"app_id": "target-app"} if index == 999 else {},
                        "traceId": f"trace-{index:04d}",
                        "observationId": "",
                        "sessionId": "",
                        "userId": "",
                        "latencyMs": 0,
                        "costUsd": 0,
                        "createdAt": "2026-07-06T01:00:00.000Z",
                    },
                    "scores": [],
                    "completedAt": "",
                    "completedBy": None,
                    "assignee": None,
                    "createdAt": "2026-07-06T01:00:00.000Z",
                    "updatedAt": "2026-07-06T01:00:00.000Z",
                }
                for index in range(1000)
            ]

    fake_reader = LargeQueueReader()
    fake_trace_reader = FakeAnnotationTraceReader()
    override_reader_and_trace_reader(fake_reader, fake_trace_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/queue-1/items/filter-counts",
            params={
                "metadataFilters": (
                    '[{"key":"app_id","operator":"equals","value":"target-app"}]'
                ),
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["status"] == {"PENDING": 0, "COMPLETED": 1}
    assert fake_trace_reader.calls == []
    assert fake_trace_reader.source_calls == []


def test_previews_large_annotation_batch_enriches_only_preview_samples() -> None:
    class LargeQueueReader(FakeAnnotationDatabaseReader):
        async def list_annotation_queue_items_for_user(
            self,
            project_id: str,
            queue_id: str,
            user_id: str,
        ) -> list[dict]:
            self.calls.append(("list_items", (project_id, queue_id, user_id)))
            return [
                {
                    "id": f"item-{index:04d}",
                    "projectId": project_id,
                    "queueId": queue_id,
                    "objectId": f"trace-{index:04d}",
                    "objectType": "TRACE",
                    "status": "PENDING",
                    "source": {
                        "objectId": f"trace-{index:04d}",
                        "objectType": "TRACE",
                        "title": f"trace-{index:04d}",
                        "input": {},
                        "output": {},
                        "metadata": {},
                        "traceId": f"trace-{index:04d}",
                        "observationId": "",
                        "sessionId": "",
                        "userId": "",
                        "latencyMs": 0,
                        "costUsd": 0,
                        "createdAt": "2026-07-06T01:00:00.000Z",
                    },
                    "scores": [],
                    "completedAt": "",
                    "completedBy": None,
                    "assignee": None,
                    "createdAt": "2026-07-06T01:00:00.000Z",
                    "updatedAt": "2026-07-06T01:00:00.000Z",
                }
                for index in range(1000)
            ]

    fake_reader = LargeQueueReader()
    fake_trace_reader = FakeAnnotationTraceReader()
    override_reader_and_trace_reader(fake_reader, fake_trace_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/batch-preview",
            json={
                "filters": {"status": ["PENDING"], "objectType": ["TRACE"]},
                "limit": 5,
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["totalCount"] == 1000
    assert body["pendingCount"] == 1000
    assert [item["id"] for item in body["samples"]] == [
        f"item-{index:04d}" for index in range(5)
    ]
    assert fake_trace_reader.calls == []
    assert fake_trace_reader.source_calls == [
        ("project-1", [f"trace-{index:04d}" for index in range(5)])
    ]


def test_bulk_saves_annotation_scores_only_for_pending_filtered_items() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    scores = [
        {
            "configId": "score-1",
            "value": 2,
            "stringValue": "",
            "comment": "同类错误统一低分",
        }
    ]
    payload = {
        "filters": {
            "keyword": "trace",
            "status": ["PENDING", "COMPLETED"],
            "objectType": ["TRACE"],
        },
        "scores": scores,
        "expectedPendingCount": 2,
        "confirmLargeBatch": False,
    }
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/batch-scores",
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["successCount"] == 2
    assert body["failureCount"] == 0
    assert body["skippedCount"] == 1
    assert body["successItemIds"] == ["item-1", "item-2"]
    assert body["failures"] == []
    assert [call[0] for call in fake_reader.calls] == [
        "list_items",
        "prepare_scores_batch",
        "prepare_scores",
        "prepare_scores",
        "get_project_api_key",
        "complete_items",
    ]
    assert [item["itemId"] for item in fake_reader.calls[1][1][3]] == [
        "item-1",
        "item-2",
    ]
    assert fake_reader.calls[-1][1][2] == ["item-1", "item-2"]


def test_bulk_saves_completed_annotation_scores_in_match_count_mode() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/batch-scores",
            json={
                "filters": {"itemIds": ["item-done"]},
                "scores": [
                    {
                        "configId": "score-1",
                        "value": 3,
                        "stringValue": "",
                        "comment": "补充指标",
                    }
                ],
                "expectedMatchCount": 1,
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["successCount"] == 1
    assert body["failureCount"] == 0
    assert body["skippedCount"] == 0
    assert body["successItemIds"] == ["item-done"]
    assert [call[0] for call in fake_reader.calls] == [
        "list_items",
        "prepare_scores_batch",
        "prepare_scores",
        "get_project_api_key",
        "complete_items",
    ]
    assert fake_reader.calls[1][1][3][0]["itemId"] == "item-done"


def test_bulk_saves_mixed_annotation_statuses_in_match_count_mode() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/batch-scores",
            json={
                "filters": {"itemIds": ["item-1", "item-done"]},
                "scores": [
                    {
                        "configId": "score-1",
                        "value": 4,
                        "stringValue": "",
                        "comment": "统一调整",
                    }
                ],
                "expectedMatchCount": 2,
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["successCount"] == 2
    assert body["failureCount"] == 0
    assert body["skippedCount"] == 0
    assert body["successItemIds"] == ["item-1", "item-done"]


def test_bulk_rejects_changed_selected_count_in_match_count_mode() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/batch-scores",
            json={
                "filters": {"itemIds": ["item-done"]},
                "scores": [
                    {
                        "configId": "score-1",
                        "value": 3,
                        "stringValue": "",
                        "comment": "补充指标",
                    }
                ],
                "expectedMatchCount": 2,
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == 1027
    assert body["message"] == "批量标注选中数据已变化，请刷新列表后重试"


def test_bulk_saves_large_annotation_batch_by_item_ids_without_trace_enrichment() -> (
    None
):
    class LargeQueueReader(FakeAnnotationDatabaseReader):
        async def list_annotation_queue_items_for_user(
            self,
            project_id: str,
            queue_id: str,
            user_id: str,
        ) -> list[dict]:
            self.calls.append(("list_items", (project_id, queue_id, user_id)))
            return [
                {
                    "id": f"item-{index:04d}",
                    "projectId": project_id,
                    "queueId": queue_id,
                    "objectId": f"trace-{index:04d}",
                    "objectType": "TRACE",
                    "status": "PENDING",
                    "source": {
                        "objectId": f"trace-{index:04d}",
                        "objectType": "TRACE",
                        "title": f"trace-{index:04d}",
                        "input": {},
                        "output": {},
                        "metadata": {},
                        "traceId": f"trace-{index:04d}",
                        "observationId": "",
                        "sessionId": "",
                        "userId": "",
                        "latencyMs": 0,
                        "costUsd": 0,
                        "createdAt": "2026-07-06T01:00:00.000Z",
                    },
                    "scores": [],
                    "completedAt": "",
                    "completedBy": None,
                    "assignee": None,
                    "createdAt": "2026-07-06T01:00:00.000Z",
                    "updatedAt": "2026-07-06T01:00:00.000Z",
                }
                for index in range(1000)
            ]

    scores = [
        {
            "configId": "score-1",
            "value": 3,
            "stringValue": "",
            "comment": "批量保存当前页选中项",
        }
    ]
    target_ids = ["item-0001", "item-0003", "item-0005"]
    fake_reader = LargeQueueReader()
    fake_trace_reader = FakeAnnotationTraceReader()
    override_reader_and_trace_reader(fake_reader, fake_trace_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/batch-scores",
            json={
                "filters": {"status": ["PENDING"], "itemIds": target_ids},
                "scores": scores,
                "expectedPendingCount": len(target_ids),
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["successCount"] == len(target_ids)
    assert body["successItemIds"] == target_ids
    assert fake_trace_reader.calls == []


def test_bulk_saves_annotation_scores_with_input_output_filters() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    scores = [
        {
            "configId": "score-1",
            "value": 5,
            "stringValue": "",
            "comment": "发票回答准确",
        }
    ]
    payload = {
        "filters": {
            "status": ["PENDING"],
            "inputFilters": [
                {"key": "question", "operator": "contains", "value": "发票"}
            ],
            "outputFilters": [
                {"key": "answer", "operator": "contains", "value": "订单详情"}
            ],
        },
        "scores": scores,
        "expectedPendingCount": 1,
    }
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/batch-scores",
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["successCount"] == 1
    assert body["successItemIds"] == ["item-2"]
    assert [call[0] for call in fake_reader.calls] == [
        "list_items",
        "prepare_scores_batch",
        "prepare_scores",
        "get_project_api_key",
        "complete_items",
    ]
    assert fake_reader.calls[1][1][3][0]["itemId"] == "item-2"


def test_bulk_updates_annotation_item_assignees_skips_completed_items() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).patch(
            "/api/projects/project-1/annotation-queues/queue-1/items/assignees",
            json={
                "itemIds": ["item-1", "item-done"],
                "assigneeUserId": "user-2",
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()["data"]
    assert body == {
        "assigneeUserId": "user-2",
        "requestedCount": 2,
        "updatedCount": 1,
        "skippedCount": 1,
        "updatedItemIds": ["item-1"],
        "skippedItemIds": ["item-done"],
    }
    assert fake_reader.calls[0] == (
        "update_item_assignees",
        (
            "project-1",
            "queue-1",
            "user-1",
            ["item-1", "item-done"],
            "user-2",
        ),
    )


def test_normalizes_boolean_annotation_score_values() -> None:
    normalize = LangfuseDatabaseReader._normalize_score_value

    assert normalize("BOOLEAN", True, "") == (1.0, "True")
    assert normalize("BOOLEAN", 1, "") == (1.0, "True")
    assert normalize("BOOLEAN", "1", "") == (1.0, "True")
    assert normalize("BOOLEAN", "true", "") == (1.0, "True")
    assert normalize("BOOLEAN", "是", "") == (1.0, "True")

    assert normalize("BOOLEAN", False, "") == (0.0, "False")
    assert normalize("BOOLEAN", 0, "") == (0.0, "False")
    assert normalize("BOOLEAN", "0", "") == (0.0, "False")
    assert normalize("BOOLEAN", "false", "") == (0.0, "False")
    assert normalize("BOOLEAN", "否", "") == (0.0, "False")
    assert normalize("BOOLEAN", None, "") == (None, None)


def test_normalizes_boolean_annotation_score_to_langfuse_standard_labels() -> None:
    config = {
        "data_type": "BOOLEAN",
        "categories": [
            {"label": "通过", "value": 1},
            {"label": "不通过", "value": 0},
        ],
    }

    assert LangfuseDatabaseReader._normalize_score_value(config, True, "") == (
        1.0,
        "True",
    )
    assert LangfuseDatabaseReader._normalize_score_value(config, False, "") == (
        0.0,
        "False",
    )


def test_annotation_score_api_payload_uses_boolean_value_label_pairs() -> None:
    payload = _annotation_score_api_payload(
        project_id="project-1",
        queue_id="queue-1",
        item_id="item-1",
        user_id="user-1",
        trace_id="trace-1",
        observation_id=None,
        session_id=None,
        config={"name": "是否合格", "data_type": "BOOLEAN"},
        config_id="score-bool",
        value=1.0,
        string_value="通过",
        comment="人工确认合格",
    )

    assert payload["value"] == 1
    assert payload["dataType"] == "BOOLEAN"
    assert payload["stringValue"] == "True"

    false_payload = _annotation_score_api_payload(
        project_id="project-1",
        queue_id="queue-1",
        item_id="item-1",
        user_id="user-1",
        trace_id="trace-1",
        observation_id=None,
        session_id=None,
        config={"name": "是否合格", "data_type": "BOOLEAN"},
        config_id="score-bool",
        value=0.0,
        string_value="不通过",
        comment="人工确认不合格",
    )

    assert false_payload["value"] == 0
    assert false_payload["dataType"] == "BOOLEAN"
    assert false_payload["stringValue"] == "False"


def test_repairs_legacy_boolean_config_before_saving_annotation_score() -> None:
    class LegacyBooleanAnnotationReader(FakeAnnotationDatabaseReader):
        async def prepare_annotation_score_payloads_for_user(
            self,
            project_id: str,
            queue_id: str,
            item_id: str,
            user_id: str,
            payload: dict,
        ) -> list[dict]:
            self.calls.append(
                ("prepare_scores", (project_id, queue_id, item_id, user_id, payload))
            )
            return [
                _annotation_score_api_payload(
                    project_id=project_id,
                    queue_id=queue_id,
                    item_id=item_id,
                    user_id=user_id,
                    trace_id="trace-1",
                    observation_id=None,
                    session_id=None,
                    config={
                        "name": "是否合格",
                        "data_type": "BOOLEAN",
                        "categories": [
                            {"label": "合格", "value": 1},
                            {"label": "不合格", "value": 0},
                        ],
                    },
                    config_id="score-bool",
                    value=1.0,
                    string_value="合格",
                    comment="",
                )
            ]

    fake_reader = LegacyBooleanAnnotationReader()
    fake_langfuse_client = FakeLangfuseClient()
    fake_score_writer = FakeClickHouseScoreWriter()

    async def _run_save() -> None:
        await _save_annotation_scores_with_langfuse_api(
            project_id="project-1",
            queue_id="queue-1",
            item_id="item-1",
            user_id="user-1",
            score_payload={"scores": []},
            reader=fake_reader,  # type: ignore[arg-type]
            langfuse_client=fake_langfuse_client,  # type: ignore[arg-type]
            score_writer=fake_score_writer,  # type: ignore[arg-type]
        )

    anyio.run(_run_save)

    assert fake_langfuse_client.updated_score_configs == [
        (
            "pk-lf-test",
            "sk-lf-test",
            "score-bool",
            {
                "categories": [
                    {"label": "True", "value": 1},
                    {"label": "False", "value": 0},
                ]
            },
        )
    ]
    langfuse_payload = fake_langfuse_client.created_scores[0][2]
    assert langfuse_payload["value"] == 1
    assert langfuse_payload["stringValue"] == "True"
    assert not any(key.startswith("_pa") for key in langfuse_payload)
    assert fake_score_writer.upserted_scores == []


def test_saves_multiple_annotation_scores_concurrently_without_double_write() -> None:
    class MultipleScoreReader(FakeAnnotationDatabaseReader):
        async def prepare_annotation_score_payloads_for_user(
            self,
            project_id: str,
            queue_id: str,
            item_id: str,
            user_id: str,
            payload: dict,
        ) -> list[dict]:
            self.calls.append(
                ("prepare_scores", (project_id, queue_id, item_id, user_id, payload))
            )
            return [
                _annotation_score_api_payload(
                    project_id=project_id,
                    queue_id=queue_id,
                    item_id=item_id,
                    user_id=user_id,
                    trace_id="trace-1",
                    observation_id=None,
                    session_id=None,
                    config={
                        "name": "问题类型",
                        "data_type": "CATEGORICAL",
                        "categories": [
                            {"label": "正常", "value": 1},
                            {"label": "事实错误", "value": 2},
                        ],
                    },
                    config_id="score-category",
                    value=2.0,
                    string_value="事实错误",
                    comment="",
                ),
                _annotation_score_api_payload(
                    project_id=project_id,
                    queue_id=queue_id,
                    item_id=item_id,
                    user_id=user_id,
                    trace_id="trace-1",
                    observation_id=None,
                    session_id=None,
                    config={"name": "评审说明", "data_type": "TEXT"},
                    config_id="score-text",
                    value=0.0,
                    string_value="回答缺少来源",
                    comment="",
                ),
            ]

    class ConcurrentLangfuseClient(FakeLangfuseClient):
        def __init__(self) -> None:
            super().__init__()
            self.active = 0
            self.max_active = 0

        async def create_score(
            self,
            public_key: str,
            secret_key: str,
            payload: dict,
        ) -> dict:
            self.active += 1
            self.max_active = max(self.max_active, self.active)
            await anyio.sleep(0.01)
            self.created_scores.append((public_key, secret_key, payload))
            self.active -= 1
            return {"id": payload["id"]}

    fake_reader = MultipleScoreReader()
    fake_langfuse_client = ConcurrentLangfuseClient()
    fake_score_writer = FakeClickHouseScoreWriter()

    async def _run_save() -> None:
        await _save_annotation_scores_with_langfuse_api(
            project_id="project-1",
            queue_id="queue-1",
            item_id="item-1",
            user_id="user-1",
            score_payload={"scores": []},
            reader=fake_reader,  # type: ignore[arg-type]
            langfuse_client=fake_langfuse_client,  # type: ignore[arg-type]
            score_writer=fake_score_writer,  # type: ignore[arg-type]
        )

    anyio.run(_run_save)

    assert fake_langfuse_client.max_active == 2
    langfuse_payloads = {
        payload["configId"]: payload
        for _public_key, _secret_key, payload in fake_langfuse_client.created_scores
    }
    assert langfuse_payloads["score-category"]["value"] == "事实错误"
    assert langfuse_payloads["score-category"]["stringValue"] == "事实错误"
    assert langfuse_payloads["score-text"]["value"] == "回答缺少来源"
    assert langfuse_payloads["score-text"]["stringValue"] == "回答缺少来源"

    assert fake_score_writer.upserted_scores == []


def test_normalizes_categorical_annotation_score_with_langfuse_category() -> None:
    config = {
        "data_type": "CATEGORICAL",
        "categories": [
            {"label": "工具调用错误", "value": 1},
            {"label": "答案事实错误", "value": 2},
        ],
    }

    assert LangfuseDatabaseReader._normalize_score_value(
        config,
        2,
        "答案事实错误",
    ) == (2.0, "答案事实错误")
    assert LangfuseDatabaseReader._normalize_score_value(
        config,
        None,
        "工具调用错误",
    ) == (1.0, "工具调用错误")


def test_normalizes_text_annotation_score_value_like_langfuse() -> None:
    assert LangfuseDatabaseReader._normalize_score_value(
        {"data_type": "TEXT"},
        None,
        "需要复核引用来源",
    ) == (0.0, "需要复核引用来源")


def test_rejects_overlong_text_annotation_score_value() -> None:
    try:
        LangfuseDatabaseReader._normalize_score_value(
            {"data_type": "TEXT"},
            None,
            "x" * 501,
        )
    except BusinessError as exc:
        assert exc.code == 1026
    else:
        raise AssertionError("expected BusinessError for overlong text score")


def test_lists_annotation_queue_items_with_large_page_size_for_navigation() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/queue-1/items",
            params={"page": 1, "pageSize": 5000},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["datas"][0]["id"] == "item-1"
    assert fake_reader.calls[0][0] == "list_items_page"


def test_annotation_page_uses_light_candidates_then_current_page_details(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reader = LangfuseDatabaseReader(Settings())
    queries: list[tuple[str, dict]] = []
    detail_rows = [
        {
            "id": item_id,
            "project_id": "project-1",
            "queue_id": "queue-1",
            "object_id": trace_id,
            "object_type": "TRACE",
            "status": "PENDING",
            "completed_at": None,
            "created_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
            "updated_at": datetime(2026, 7, 2, tzinfo=timezone.utc),
            "scores": [],
            "has_scores": False,
            "source_title": trace_id,
            "source_input": {},
            "source_output": {},
            "source_metadata": {},
            "trace_id": trace_id,
            "observation_id": "",
            "session_id": "",
            "user_id": "",
            "latency_ms": 0,
            "cost_usd": 0,
            "source_created_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
        }
        for item_id, trace_id in (("item-1", "trace-1"), ("item-2", "trace-2"))
    ]

    async def get_queue(*_args: object) -> dict:
        return {"id": "queue-1"}

    async def fetch(sql: str, params: dict) -> list[dict]:
        queries.append((sql, params))
        if "COUNT(*)::int AS total" in sql:
            return [{"total": 2}]
        if "SELECT item.id" in sql:
            return [{"id": "item-2"}, {"id": "item-1"}]
        return detail_rows

    monkeypatch.setattr(reader, "get_annotation_queue_for_user", get_queue)
    monkeypatch.setattr(reader, "_fetch_all", fetch)

    async def run_query() -> dict:
        return await reader.list_annotation_queue_items_page_for_user(
            "project-1",
            "queue-1",
            "user-1",
            page=1,
            page_size=2,
            filters={},
        )

    result = anyio.run(run_query)

    assert result["total"] == 2
    assert [item["id"] for item in result["datas"]] == ["item-2", "item-1"]
    assert len(queries) == 3
    for sql, _params in queries[:2]:
        assert "trace_latency" not in sql
        assert "trace_cost" not in sql
        assert "JSONB_AGG" not in sql
    detail_sql, detail_params = queries[2]
    assert "aqi.id = ANY(%(page_item_ids)s)" in detail_sql
    assert detail_params["page_item_ids"] == ["item-2", "item-1"]
