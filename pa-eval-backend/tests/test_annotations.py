import anyio
from fastapi.testclient import TestClient

from app.auth_context import CurrentUserContext, get_current_user_context
from app.errors import BusinessError
from app.langfuse_clickhouse import get_langfuse_clickhouse_reader
from app.langfuse_client import get_langfuse_client
from app.annotations import _save_annotation_scores_with_langfuse_api
from app.langfuse_db import (
    LangfuseDatabaseReader,
    _annotation_score_api_payload,
    get_langfuse_db_reader,
)
from app.main import app


class FakeAnnotationDatabaseReader:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []

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


class FakeAnnotationTraceReader:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []
        self.source_calls: list[tuple[str, list[str]]] = []
        self.score_calls: list[tuple[str, str, str | None]] = []
        self.scores_by_queue: dict[str, list[dict]] = {}

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
        }

    async def list_trace_sources(
        self,
        project_id: str,
        trace_ids: list[str],
    ) -> dict[str, dict]:
        self.source_calls.append((project_id, trace_ids))
        return {
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

    async def list_scores_by_queue(
        self,
        project_id: str,
        queue_id: str,
        *,
        run_id: str | None = None,
    ) -> list[dict]:
        self.score_calls.append((project_id, queue_id, run_id))
        return self.scores_by_queue.get(queue_id, [])


class FakeLangfuseClient:
    def __init__(self) -> None:
        self.created_scores: list[tuple[str, str, dict]] = []

    async def create_score(
        self,
        public_key: str,
        secret_key: str,
        payload: dict,
    ) -> dict:
        self.created_scores.append((public_key, secret_key, payload))
        return {"id": payload["id"]}


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


def override_reader_and_trace_reader(
    fake_reader: FakeAnnotationDatabaseReader,
    fake_trace_reader: FakeAnnotationTraceReader,
    fake_langfuse_client: FakeLangfuseClient | None = None,
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


def test_boolean_score_config_keeps_editable_labels_with_fixed_boolean_values() -> None:
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
        {"label": "合格", "value": 1},
        {"label": "不合格", "value": 0},
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


def test_saves_annotation_scores_and_completes_queue_item() -> None:
    fake_reader = FakeAnnotationDatabaseReader()
    fake_langfuse_client = FakeLangfuseClient()
    override_reader_and_trace_reader(
        fake_reader,
        FakeAnnotationTraceReader(),
        fake_langfuse_client,
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


def test_saves_boolean_annotation_score_with_clickhouse_upsert_fallback() -> None:
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
                    "stringValue": "false",
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
    assert fake_score_writer.upserted_scores == [
        (
            "project-1",
            "user-1",
            fake_langfuse_client.created_scores[0][2],
        )
    ]


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
    assert fake_reader.calls[0] == ("list_items", ("project-1", "queue-1", "user-1"))
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
    assert len(fake_trace_reader.calls) == 10
    assert [trace_id for _, trace_id in fake_trace_reader.calls] == [
        f"trace-{index:04d}" for index in range(10, 20)
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
    assert fake_trace_reader.calls == []
    assert fake_trace_reader.source_calls == [
        ("project-1", [f"trace-{index:04d}" for index in range(1000)])
    ]


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
    assert fake_trace_reader.source_calls == [
        ("project-1", [f"trace-{index:04d}" for index in range(1000)])
    ]


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
    assert [trace_id for _, trace_id in fake_trace_reader.calls] == [
        f"trace-{index:04d}" for index in range(5)
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
        "prepare_scores",
        "get_project_api_key",
        "complete_item",
        "save_scores",
        "prepare_scores",
        "get_project_api_key",
        "complete_item",
        "save_scores",
    ]
    assert fake_reader.calls[1][1] == (
        "project-1",
        "queue-1",
        "item-1",
        "user-1",
        {
            "scores": [
                {
                    "configId": "score-1",
                    "value": 2.0,
                    "stringValue": "",
                    "comment": "同类错误统一低分",
                }
            ]
        },
    )
    assert fake_reader.calls[5][1][2] == "item-2"


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
        "prepare_scores",
        "get_project_api_key",
        "complete_item",
        "save_scores",
    ]
    assert fake_reader.calls[1][1] == (
        "project-1",
        "queue-1",
        "item-2",
        "user-1",
        {
            "scores": [
                {
                    "configId": "score-1",
                    "value": 5.0,
                    "stringValue": "",
                    "comment": "发票回答准确",
                }
            ]
        },
    )


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

    assert normalize("BOOLEAN", True, "") == (1.0, "true")
    assert normalize("BOOLEAN", 1, "") == (1.0, "true")
    assert normalize("BOOLEAN", "1", "") == (1.0, "true")
    assert normalize("BOOLEAN", "true", "") == (1.0, "true")
    assert normalize("BOOLEAN", "是", "") == (1.0, "true")

    assert normalize("BOOLEAN", False, "") == (0.0, "false")
    assert normalize("BOOLEAN", 0, "") == (0.0, "false")
    assert normalize("BOOLEAN", "0", "") == (0.0, "false")
    assert normalize("BOOLEAN", "false", "") == (0.0, "false")
    assert normalize("BOOLEAN", "否", "") == (0.0, "false")
    assert normalize("BOOLEAN", None, "") == (None, None)


def test_annotation_score_api_payload_keeps_boolean_string_value() -> None:
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
        string_value="true",
        comment="人工确认合格",
    )

    assert payload["value"] == 1
    assert payload["dataType"] == "BOOLEAN"
    assert payload["stringValue"] == "true"

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
        string_value="false",
        comment="人工确认不合格",
    )

    assert false_payload["value"] == 0
    assert false_payload["dataType"] == "BOOLEAN"
    assert false_payload["stringValue"] == "false"


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
    assert fake_reader.calls[0] == ("list_items", ("project-1", "queue-1", "user-1"))
