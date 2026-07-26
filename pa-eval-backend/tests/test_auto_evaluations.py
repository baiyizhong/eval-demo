import httpx
import pytest
from fastapi.testclient import TestClient

from app.auto_evaluations import (
    _build_dify_inputs_from_dataset_item,
    _build_report_from_template,
    _build_workflow_inputs,
    _build_workflow_headers,
    _complete_auto_evaluation_success,
    _create_report_flowback,
    _apply_auto_evaluation_badcase_config,
    _count_trace_generation_samples,
    _created_at_range_value,
    _ensure_report_exists,
    _get_path_value,
    _get_pa_evaluator,
    _get_project_default_eval_model,
    _insert_running_auto_evaluation,
    _list_trace_generation_samples,
    _normalize_dataset_item_sample,
    _to_trace_generation_sample,
    _parse_workflow_result,
    _preview_report_flowback,
    _resolve_mapping_template,
    _resolve_auto_evaluation_samples,
    _run_workflow_evaluator,
    _run_openjudge_batch_evaluator,
    _run_openjudge_evaluator,
    _run_auto_evaluation_background,
    _trace_time_range_condition,
    _trace_time_condition,
    _mark_auto_evaluation_failed,
    _update_auto_evaluation_progress,
    _sample_dataset_items,
    _delete_auto_evaluation_task,
    _to_report_badcase,
    _validate_workflow_evaluator_ready,
    _auto_evaluation_score_api_payload,
    _evaluation_report_score_item_is_badcase,
    _sync_auto_evaluation_scores_to_langfuse,
    AutoEvaluationBadcaseConfig,
    CreateAutoEvaluationPayload,
    EvaluationReportFlowbackPayload,
    TraceCountPayload,
)
from app.auth_context import get_current_user_context
from app.langfuse_clickhouse import LangfuseClickHouseReader
from app.langfuse_clickhouse import _score_numeric_value
from app.main import app
import app.auto_evaluations as auto_evaluations
from app.errors import BusinessError


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("name", "任务" * 21),
        ("description", "描述" * 101),
    ],
)
def test_rejects_auto_evaluation_fields_over_max_length(
    field: str,
    value: str,
) -> None:
    payload = {
        "name": "客服质量自动评测",
        "description": "检查客服回复",
        "evaluatorId": "evaluator-1",
    }
    payload[field] = value

    with pytest.raises(ValueError):
        CreateAutoEvaluationPayload.model_validate(payload)


class FakeCursor:
    def __init__(self, row=None, rows=None):
        self.row = row
        self.rows = rows or []
        self.sql = ""
        self.params = {}
        self.executions = []

    async def execute(self, sql, params):
        self.sql = sql
        self.params = params
        self.executions.append((sql, params))

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def fetchone(self):
        return self.row

    async def fetchall(self):
        return self.rows


class SequentialCursor:
    def __init__(self, rows_by_fetchall=None, rows_by_fetchone=None):
        self.rows_by_fetchall = list(rows_by_fetchall or [])
        self.rows_by_fetchone = list(rows_by_fetchone or [])
        self.executions = []

    async def execute(self, sql, params):
        self.executions.append((sql, params))

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def fetchone(self):
        if self.rows_by_fetchone:
            return self.rows_by_fetchone.pop(0)
        return None

    async def fetchall(self):
        if self.rows_by_fetchall:
            return self.rows_by_fetchall.pop(0)
        return []


def _jsonb_value(value):
    return getattr(value, "obj", value)


class FakeConnection:
    def __init__(self, cursor):
        self._cursor = cursor

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    def cursor(self):
        return self._cursor


class FakeBackgroundTasks:
    def __init__(self) -> None:
        self.tasks = []

    def add_task(self, func, *args, **kwargs) -> None:
        self.tasks.append((func, args, kwargs))


class FakeLangfuseScoreClient:
    def __init__(self) -> None:
        self.created_scores = []
        self.updated_score_configs = []

    async def create_score(self, public_key: str, secret_key: str, payload: dict):
        self.created_scores.append((public_key, secret_key, payload))
        return {"id": payload["id"]}

    async def update_score_config(
        self,
        public_key: str,
        secret_key: str,
        config_id: str,
        payload: dict,
    ):
        self.updated_score_configs.append(
            (public_key, secret_key, config_id, payload)
        )
        return {"id": config_id, **payload}


class FakeClickHouseScoreWriter:
    def __init__(self) -> None:
        self.upserted_scores = []

    async def upsert_score(
        self,
        project_id: str,
        user_id: str,
        score_request: dict,
        *,
        source: str = "API",
    ):
        self.upserted_scores.append((project_id, user_id, score_request, source))


@pytest.mark.anyio
async def test_clickhouse_score_queue_query_filters_report_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reader = LangfuseClickHouseReader(auto_evaluations.Settings())
    captured = {}

    async def fake_query(query: str, params: dict):
        captured["query"] = query
        captured["params"] = params
        return []

    monkeypatch.setattr(reader, "_query_json_each_row", fake_query)

    await reader.list_scores_by_queue(
        "project-1",
        "task-1",
        run_id="run-2",
    )

    assert "queue_id = {queue_id:String}" in captured["query"]
    assert "metadata['paAutoEvaluationRunId'] = {run_id:String}" in captured["query"]
    assert captured["params"] == {
        "project_id": "project-1",
        "queue_id": "task-1",
        "run_id": "run-2",
    }


@pytest.mark.anyio
async def test_clickhouse_trace_query_pushes_down_badcase_metadata_filter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reader = LangfuseClickHouseReader(auto_evaluations.Settings())
    captured = {}

    async def fake_query(query: str, params: dict):
        captured["query"] = query
        captured["params"] = params
        return []

    monkeypatch.setattr(reader, "_query_json_each_row", fake_query)

    await reader.list_traces(
        "project-1",
        page=1,
        page_size=10,
        metadata_filters=[
            {
                "key": "businessId",
                "operator": "equals",
                "value": "biz-1",
            }
        ],
    )

    assert "t.metadata[{metadata_filter_key_0:String}]" in captured["query"]
    assert "= {metadata_filter_value_0:String}" in captured["query"]
    assert captured["params"]["metadata_filter_key_0"] == "businessId"
    assert captured["params"]["metadata_filter_value_0"] == "biz-1"


@pytest.mark.anyio
async def test_clickhouse_trace_query_filters_by_trace_ids(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reader = LangfuseClickHouseReader(auto_evaluations.Settings())
    captured = {}

    async def fake_query(query: str, params: dict):
        captured.setdefault("queries", []).append(query)
        captured.setdefault("params", []).append(params)
        return []

    monkeypatch.setattr(reader, "_query_json_each_row", fake_query)

    rows = await reader.list_traces_by_ids(
        "project-1",
        ["trace-1", "trace-2", "trace-1"],
        fields="io,metadata",
    )

    assert rows == []
    assert (
        "t.id IN ({trace_id_0:String}, {trace_id_1:String})" in captured["queries"][0]
    )
    assert captured["params"][0]["trace_id_0"] == "trace-1"
    assert captured["params"][0]["trace_id_1"] == "trace-2"


@pytest.mark.anyio
async def test_list_evaluation_report_items_reads_scores_for_report_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = SequentialCursor(
        rows_by_fetchone=[
            {"id": "project-1"},
            {"exists": 1},
            {"source_task_id": "task-1", "run_id": "run-2"},
        ],
        rows_by_fetchall=[
            [
                {
                    "id": "item-1",
                    "source_id": "obs-1",
                    "trace_id": "trace-1",
                    "observation_id": "obs-1",
                    "result_type": "normal",
                    "execution_status": "COMPLETED",
                    "dataset_flowback_status": "NONE",
                }
            ]
        ],
    )
    captured = {}

    async def fake_connect(settings):
        return FakeConnection(cursor)

    class FakeReportScoreReader:
        def __init__(self, settings):
            pass

        async def list_scores_by_queue(
            self,
            project_id: str,
            queue_id: str,
            *,
            run_id: str | None = None,
        ):
            captured["project_id"] = project_id
            captured["queue_id"] = queue_id
            captured["run_id"] = run_id
            return [
                {
                    "id": "score-1",
                    "traceId": "trace-1",
                    "observationId": "obs-1",
                    "name": "quality",
                    "value": 1,
                    "metadata": {
                        "paAutoEvaluationRunId": "run-2",
                        "passed": True,
                    },
                    "createdAt": "2026-07-13T10:00:00Z",
                }
            ]

    monkeypatch.setattr(auto_evaluations, "_connect", fake_connect)
    monkeypatch.setattr(
        auto_evaluations,
        "LangfuseClickHouseReader",
        FakeReportScoreReader,
    )

    response = await auto_evaluations.list_evaluation_report_items(
        project_id="project-1",
        report_id="report-1",
        page=1,
        page_size=10,
        keyword=None,
        current_user=_override_current_user(),
        settings=auto_evaluations.Settings(),
    )

    assert captured == {
        "project_id": "project-1",
        "queue_id": "task-1",
        "run_id": "run-2",
    }
    assert response["data"]["total"] == 1
    assert response["data"]["datas"][0]["scores"][0]["name"] == "quality"


@pytest.mark.anyio
async def test_list_evaluation_report_badcases_attaches_current_run_scores(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = SequentialCursor(
        rows_by_fetchone=[
            {"id": "project-1"},
            {"exists": 1},
            {
                "source_task_id": "task-1",
                "run_id": "run-2",
                "score_name": "quality",
                "report_template_snapshot": {
                    "badcaseRule": {
                        "mode": "SCORE_THRESHOLD",
                        "operator": "LTE",
                        "threshold": 0.6,
                    }
                },
            },
        ],
        rows_by_fetchall=[
            [
                {
                    "id": "item-1",
                    "source_id": "obs-1",
                    "trace_id": "trace-1",
                    "observation_id": "obs-1",
                    "result_type": "badcase",
                    "execution_status": "COMPLETED",
                    "dataset_flowback_status": "NONE",
                }
            ]
        ],
    )
    captured = {}
    current_run_score = {
        "id": "score-current-run",
        "traceId": "trace-1",
        "observationId": "obs-1",
        "name": "quality",
        "value": 0.5,
        "metadata": {
            "paAutoEvaluationRunId": "run-2",
            "passed": False,
        },
        "createdAt": "2026-07-20T10:00:00Z",
    }

    async def fake_connect(settings):
        return FakeConnection(cursor)

    class FakeReportBadcaseReader:
        def __init__(self, settings):
            pass

        async def list_scores_by_queue(
            self,
            project_id: str,
            queue_id: str,
            *,
            run_id: str | None = None,
        ):
            captured["score_query"] = (project_id, queue_id, run_id)
            return [current_run_score]

        async def list_traces_by_ids(
            self,
            project_id: str,
            trace_ids: list[str],
            *,
            fields: str | None = None,
        ):
            captured["trace_query"] = (project_id, trace_ids, fields)
            return [
                {
                    "traceId": "trace-1",
                    "scores": [
                        {
                            "id": "score-other-task",
                            "name": "manual-quality",
                            "value": 1,
                        }
                    ],
                    "scoreSummary": "manual-quality: 1",
                }
            ]

    monkeypatch.setattr(auto_evaluations, "_connect", fake_connect)
    monkeypatch.setattr(
        auto_evaluations,
        "LangfuseClickHouseReader",
        FakeReportBadcaseReader,
    )

    response = await auto_evaluations.list_evaluation_report_badcases(
        project_id="project-1",
        report_id="report-1",
        page=1,
        page_size=10,
        keyword=None,
        current_user=_override_current_user(),
        settings=auto_evaluations.Settings(),
    )

    assert captured == {
        "score_query": ("project-1", "task-1", "run-2"),
        "trace_query": ("project-1", ["trace-1"], "io,metadata"),
    }
    assert response["data"]["total"] == 1
    assert response["data"]["datas"][0]["scores"] == [current_run_score]
    assert response["data"]["datas"][0]["scoreSummary"] == "quality: 0.5"


def _override_current_user():
    return auto_evaluations.CurrentUserContext(
        user_id="user-1",
        email="owner@example.com",
        name="Owner",
    )


def test_list_auto_evaluations_accepts_status_filter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = SequentialCursor(
        rows_by_fetchone=[{"total": 0}],
        rows_by_fetchall=[[]],
    )

    async def fake_connect(settings):
        return FakeConnection(cursor)

    async def fake_ensure_access(*args, **kwargs):
        return None

    monkeypatch.setattr(auto_evaluations, "_connect", fake_connect)
    monkeypatch.setattr(auto_evaluations, "_ensure_project_access", fake_ensure_access)
    app.dependency_overrides[get_current_user_context] = _override_current_user
    try:
        response = TestClient(app, raise_server_exceptions=False).get(
            "/api/projects/project-1/auto-evaluations",
            params={"page": 1, "pageSize": 10, "status": ["RUNNING", "FAILED"]},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["code"] == 0
    assert cursor.executions[-1][1]["status"] == ["RUNNING", "FAILED"]


@pytest.mark.anyio
async def test_rerun_auto_evaluation_creates_new_task_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    old_task_id = "paautoeval_old"
    new_task_id = "paautoeval_new"
    new_run_id = "parun_new"
    cursor = SequentialCursor(
        rows_by_fetchone=[
            {"id": "project-1", "name": "项目"},
            {
                "id": old_task_id,
                "project_id": "project-1",
                "name": "客服回复评测",
                "description": "原任务配置",
                "score_name": "quality",
                "score_mapping": {"score": "quality"},
                "status": "COMPLETED",
                "evaluator_id": "evaluator-1",
                "evaluator_name": "Dify 评估器",
                "evaluator_type": "WORKFLOW",
                "evaluator_version": "v3",
                "data_source": {"type": "TRACE_FILTER", "sampleCount": 1},
                "sample_rate": 100,
                "execution_stats": {"completed": 1},
                "badcase_count": 2,
                "report_template_id": "template-1",
                "report_template_snapshot": {
                    "id": "template-1",
                    "name": "模板",
                    "badcaseRule": {
                        "mode": "SCORE_THRESHOLD",
                        "operator": "LTE",
                        "threshold": 0.6,
                    },
                },
                "create_by": "creator@example.com",
                "create_date": None,
                "last_run_at": None,
                "update_date": None,
            },
            {
                "id": "evaluator-1",
                "name": "Dify 评估器",
                "type": "WORKFLOW",
                "provider": "DIFY",
                "version": 3,
                "variables": [],
                "output_variables": [],
                "config": {
                    "endpointUrl": "https://example.com/workflow",
                    "authToken": "secret",
                },
            },
        ]
    )
    background_tasks = FakeBackgroundTasks()

    async def fake_connect(settings):
        return FakeConnection(cursor)

    async def fake_resolve_samples(*args, **kwargs):
        return {"type": "TRACE_FILTER", "sampleCount": 1}, [
            {"source_trace_id": "trace-1", "input": {"input": "hello"}}
        ]

    async def fake_resolve_template_snapshot(*args, **kwargs):
        return {
            "id": "template-1",
            "name": "模板",
            "badcaseRule": {"mode": "SCORE_THRESHOLD"},
        }

    ids = iter([new_task_id, new_run_id])

    monkeypatch.setattr(auto_evaluations, "_connect", fake_connect)
    monkeypatch.setattr(
        auto_evaluations,
        "_resolve_auto_evaluation_samples",
        fake_resolve_samples,
    )
    monkeypatch.setattr(
        auto_evaluations,
        "_resolve_report_template_snapshot",
        fake_resolve_template_snapshot,
    )
    monkeypatch.setattr(auto_evaluations, "_new_id", lambda prefix: next(ids))

    response = await auto_evaluations.rerun_auto_evaluation(
        project_id="project-1",
        task_id=old_task_id,
        background_tasks=background_tasks,  # type: ignore[arg-type]
        current_user=_override_current_user(),
        settings=auto_evaluations.Settings(),
    )

    assert response["data"]["id"] == new_task_id
    assert response["data"]["id"] != old_task_id
    task_insert_sql, task_insert_params = next(
        (sql, params)
        for sql, params in cursor.executions
        if "INSERT INTO pa_auto_evaluation_tasks" in sql
    )
    assert "UPDATE pa_auto_evaluation_tasks" not in task_insert_sql
    assert task_insert_params["id"] == new_task_id
    assert task_insert_params["create_by"] == "owner@example.com"
    assert _jsonb_value(task_insert_params["score_mapping"]) == {"score": "quality"}
    run_insert_params = next(
        params
        for sql, params in cursor.executions
        if "INSERT INTO pa_auto_evaluation_runs" in sql
    )
    assert run_insert_params["task_id"] == new_task_id
    background_task = background_tasks.tasks[0]
    assert background_task[1][2] == new_task_id
    assert background_task[1][3] == new_run_id
    assert background_task[1][4].score_mapping == {"score": "quality"}
    assert (
        background_task[1][4].report_template_snapshot["badcaseRule"]["threshold"]
        == 0.6
    )


@pytest.mark.anyio
async def test_delete_auto_evaluation_task_physically_deletes_task_and_reports() -> (
    None
):
    cursor = FakeCursor({"id": "task-1"})

    await _delete_auto_evaluation_task(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="task-1",
    )

    task_sql, task_params = cursor.executions[0]
    report_sql, report_params = cursor.executions[1]
    assert "DELETE FROM pa_auto_evaluation_tasks" in task_sql
    assert "RETURNING id" in task_sql
    assert task_params == {"project_id": "project-1", "task_id": "task-1"}
    assert "DELETE FROM pa_evaluation_reports" in report_sql
    assert "source_task_id = %(task_id)s" in report_sql
    assert report_params == {"project_id": "project-1", "task_id": "task-1"}


@pytest.mark.anyio
async def test_ensure_report_exists_checks_report_identity() -> None:
    cursor = FakeCursor({"exists": 1})

    await _ensure_report_exists(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        report_id="report-1",
    )

    assert cursor.params == {
        "project_id": "project-1",
        "report_id": "report-1",
    }
    assert "deleted_at" not in cursor.sql


@pytest.mark.anyio
async def test_get_pa_evaluator_uses_visible_project_membership() -> None:
    cursor = FakeCursor(
        {
            "id": "evaluator-1",
            "name": "PA Eval Dify 工作流评估器",
            "type": "WORKFLOW",
            "provider": "DIFY",
            "version": 1,
            "variables": ["input", "output"],
            "config": {},
        }
    )

    evaluator = await _get_pa_evaluator(
        cursor,  # type: ignore[arg-type]
        evaluator_id="evaluator-1",
        user_id="user-1",
    )

    assert evaluator["id"] == "evaluator-1"
    assert cursor.params == {
        "evaluator_id": "evaluator-1",
        "user_id": "user-1",
    }
    assert "organization_memberships" in cursor.sql
    assert "project_memberships pm" in cursor.sql
    assert "om.role::text <> 'NONE'" in cursor.sql
    assert "pm.role::text <> 'NONE'" in cursor.sql
    assert "pe.project_id = %(project_id)s" not in cursor.sql


@pytest.mark.anyio
async def test_get_pa_evaluator_accepts_n8n_workflow() -> None:
    cursor = FakeCursor(
        {
            "id": "evaluator-1",
            "name": "PA Eval n8n 工作流评估器",
            "type": "WORKFLOW",
            "provider": "N8N",
            "version": 1,
            "variables": ["input", "output", "expected_output", "context"],
            "config": {},
        }
    )

    evaluator = await _get_pa_evaluator(
        cursor,  # type: ignore[arg-type]
        evaluator_id="evaluator-1",
        user_id="user-1",
    )

    assert evaluator["provider"] == "N8N"


@pytest.mark.anyio
async def test_get_pa_evaluator_rejects_invisible_evaluator() -> None:
    cursor = FakeCursor(None)

    with pytest.raises(BusinessError) as exc:
        await _get_pa_evaluator(
            cursor,  # type: ignore[arg-type]
            evaluator_id="missing-evaluator",
            user_id="user-1",
        )

    assert exc.value.code == 1006


def test_sample_dataset_items_uses_sample_rate() -> None:
    items = [{"id": f"item-{index}"} for index in range(10)]

    assert len(_sample_dataset_items(items, 100)) == 10
    assert len(_sample_dataset_items(items, 50)) == 5
    assert len(_sample_dataset_items(items, 1)) == 1


def test_build_dify_inputs_from_dataset_item_maps_langfuse_fields() -> None:
    inputs = _build_dify_inputs_from_dataset_item(
        {
            "input": {
                "input": "物流显示签收但我没收到货。",
                "output": "这不是我们的责任，你自己找快递。",
                "context": "物流异常客服",
            },
            "expected_output": "应表达理解并协助核实签收信息。",
        }
    )

    assert inputs == {
        "input": "物流显示签收但我没收到货。",
        "output": "这不是我们的责任，你自己找快递。",
        "expected_output": "应表达理解并协助核实签收信息。",
        "context": "物流异常客服",
    }


def test_trace_generation_sample_prefers_trace_payload_fields() -> None:
    sample = _to_trace_generation_sample(
        {
            "trace_id": "trace-1",
            "project_id": "project-1",
            "trace_name": "workflow",
            "trace_input": (
                '{"input":"用户问题","output":"候选回答",'
                '"expected_output":"期望答案","context":"业务上下文"}'
            ),
            "trace_output": '{"score":0.2}',
            "trace_metadata": {},
            "user_id": "pa-eval",
            "session_id": "",
            "tags": ["workflow"],
            "observation_id": "obs-1",
            "observation_name": "LLM Judge",
            "observation_input": "原始 observation 输入",
            "observation_output": "原始 observation 输出",
            "observation_metadata": {},
        }
    )

    assert sample["input"] == {
        "input": "用户问题",
        "output": "候选回答",
        "context": "业务上下文",
    }
    assert sample["expected_output"] == "期望答案"


@pytest.mark.anyio
async def test_count_trace_generation_samples_returns_zero_when_clickhouse_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _raise_clickhouse_error(settings, query):
        request = httpx.Request("POST", "http://localhost:8123")
        response = httpx.Response(502, request=request)
        raise httpx.HTTPStatusError(
            "ClickHouse unavailable",
            request=request,
            response=response,
        )

    monkeypatch.setattr(
        auto_evaluations,
        "_query_clickhouse_json_each_row",
        _raise_clickhouse_error,
    )

    count = await _count_trace_generation_samples(
        FakeCursor(),  # type: ignore[arg-type]
        project_id="project-1",
        data_source_payload={"type": "TRACE_FILTER", "timeRange": "7d"},
        settings=object(),  # type: ignore[arg-type]
    )

    assert count == 0


@pytest.mark.anyio
async def test_count_trace_generation_samples_uses_clickhouse_count_without_sample_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, str] = {}

    async def fake_query_clickhouse(settings, query):
        captured["query"] = query
        return [{"count": 1250}]

    monkeypatch.setattr(
        auto_evaluations,
        "_query_clickhouse_json_each_row",
        fake_query_clickhouse,
    )

    count = await _count_trace_generation_samples(
        FakeCursor(),  # type: ignore[arg-type]
        project_id="project-1",
        data_source_payload={
            "timeRange": "7d",
            "userId": "user-1",
            "sessionId": "session-1",
            "tags": ["refund"],
        },
        settings=auto_evaluations.Settings(
            langfuse_clickhouse_url="http://clickhouse.local:8123",
        ),
    )

    assert count == 1250
    assert "countDistinct(t.id) AS count" in captured["query"]
    assert "LIMIT 500" not in captured["query"]
    assert (
        "positionCaseInsensitive(ifNull(t.user_id, ''), 'user-1') > 0"
        in captured["query"]
    )
    assert (
        "positionCaseInsensitive(ifNull(t.session_id, ''), 'session-1') > 0"
        in captured["query"]
    )
    assert "has(t.tags, 'refund')" in captured["query"]
    assert "INTERVAL 7 DAY" in captured["query"]


@pytest.mark.anyio
async def test_clickhouse_trace_count_uses_half_open_fixed_range_and_all_tags(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, str] = {}

    async def fake_query_clickhouse(settings, query):
        captured["query"] = query
        return [{"count": 42}]

    monkeypatch.setattr(
        auto_evaluations,
        "_query_clickhouse_json_each_row",
        fake_query_clickhouse,
    )

    count = await _count_trace_generation_samples(
        FakeCursor(),  # type: ignore[arg-type]
        project_id="project-1",
        data_source_payload={
            "createdAtRange": [
                "2026-07-17T16:00:00Z",
                "2026-07-18T16:00:00Z",
            ],
            "tags": ["refund", "risk"],
        },
        settings=auto_evaluations.Settings(
            langfuse_clickhouse_url="http://clickhouse.local:8123",
        ),
    )

    assert count == 42
    assert "t.timestamp >= parseDateTimeBestEffort(" in captured["query"]
    assert "t.timestamp < parseDateTimeBestEffort(" in captured["query"]
    assert "t.timestamp <= parseDateTimeBestEffort(" not in captured["query"]
    assert "has(t.tags, 'refund')" in captured["query"]
    assert "has(t.tags, 'risk')" in captured["query"]


def test_trace_count_rejects_incomplete_fixed_time_range() -> None:
    with pytest.raises(ValueError, match="开始和结束时间"):
        TraceCountPayload(
            traceFilter={"createdAtRange": ["2026-07-17T16:00:00Z"]}
        )

    with pytest.raises(BusinessError, match="开始和结束时间"):
        _trace_time_condition(
            {"createdAtRange": ["2026-07-17T16:00:00Z", ""]}
        )


@pytest.mark.anyio
async def test_count_trace_generation_samples_uses_postgres_count_without_sample_limit() -> (
    None
):
    cursor = FakeCursor(row={"count": 1200})

    count = await _count_trace_generation_samples(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        data_source_payload={
            "timeRange": "",
            "createdAtRange": ["2026-07-05T00:00", "2026-07-08T00:00"],
            "userId": "user-1",
            "sessionId": "session-1",
            "tags": ["refund"],
        },
    )

    assert count == 1200
    assert "COUNT(*) AS count" in cursor.sql
    assert "LIMIT 500" not in cursor.sql
    assert "t.timestamp < %(created_at_to)s::timestamptz" in cursor.sql
    assert "t.timestamp <= %(created_at_to)s::timestamptz" not in cursor.sql
    assert cursor.params["user_id_like"] == "%user-1%"
    assert cursor.params["session_id_like"] == "%session-1%"
    assert cursor.params["tags"] == ["refund"]
    assert cursor.params["created_at_from"] == "2026-07-04T16:00:00Z"
    assert cursor.params["created_at_to"] == "2026-07-07T16:00:00Z"


@pytest.mark.anyio
async def test_list_trace_generation_samples_clickhouse_is_not_capped_at_500(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, str] = {}
    rows = [
        {
            "trace_id": f"trace-{index}",
            "project_id": "project-1",
            "observation_id": f"observation-{index}",
        }
        for index in range(750)
    ]

    async def fake_query_clickhouse(settings, query):
        captured["query"] = query
        return rows

    monkeypatch.setattr(
        auto_evaluations,
        "_query_clickhouse_json_each_row",
        fake_query_clickhouse,
    )

    samples = await _list_trace_generation_samples(
        FakeCursor(),  # type: ignore[arg-type]
        "project-1",
        {"type": "TRACE_FILTER", "timeRange": "7d"},
        auto_evaluations.Settings(),
    )

    assert len(samples) == 750
    assert "LIMIT 500" not in captured["query"]


@pytest.mark.anyio
async def test_list_trace_generation_samples_postgres_is_not_capped_at_500() -> None:
    rows = [
        {
            "trace_id": f"trace-{index}",
            "project_id": "project-1",
            "observation_id": f"observation-{index}",
        }
        for index in range(750)
    ]
    cursor = FakeCursor(rows=rows)

    samples = await _list_trace_generation_samples(
        cursor,  # type: ignore[arg-type]
        "project-1",
        {"type": "TRACE_FILTER", "timeRange": "7d"},
    )

    assert len(samples) == 750
    assert "LIMIT 500" not in cursor.sql


@pytest.mark.anyio
async def test_resolve_auto_evaluation_samples_returns_business_error_when_trace_query_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _raise_clickhouse_error(settings, query):
        request = httpx.Request("POST", "http://localhost:8123")
        response = httpx.Response(502, request=request)
        raise httpx.HTTPStatusError(
            "ClickHouse unavailable",
            request=request,
            response=response,
        )

    monkeypatch.setattr(
        auto_evaluations,
        "_query_clickhouse_json_each_row",
        _raise_clickhouse_error,
    )
    payload = CreateAutoEvaluationPayload.model_validate(
        {
            "name": "客服质检",
            "scoreName": "quality",
            "evaluatorId": "evaluator-1",
            "dataSource": {"type": "TRACE_FILTER", "timeRange": "7d"},
        }
    )

    with pytest.raises(BusinessError) as exc:
        await _resolve_auto_evaluation_samples(
            FakeCursor(),  # type: ignore[arg-type]
            "project-1",
            payload,
            "user-1",
            object(),  # type: ignore[arg-type]
        )

    assert exc.value.code == 4007
    assert exc.value.message == "Trace 过滤没有可用样本"


@pytest.mark.anyio
async def test_resolve_auto_evaluation_samples_caps_rerun_to_original_trace_sample_count(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_list_trace_generation_samples(*args: object, **kwargs: object):
        return [
            {
                "id": f"trace-sample-{index}",
                "source_trace_id": f"trace-{index}",
                "source_observation_id": f"obs-{index}",
            }
            for index in range(12)
        ]

    monkeypatch.setattr(
        auto_evaluations,
        "_list_trace_generation_samples",
        fake_list_trace_generation_samples,
    )
    payload = CreateAutoEvaluationPayload.model_validate(
        {
            "name": "客服质检",
            "scoreName": "quality",
            "evaluatorId": "evaluator-1",
            "sampleRate": 100,
            "dataSource": {
                "type": "TRACE_FILTER",
                "sampleCount": 5,
                "matchedTraceCount": 8,
                "traceFilter": {
                    "timeRange": "1d",
                    "createdAtRange": [],
                    "tags": [],
                },
            },
        }
    )

    data_source, samples = await _resolve_auto_evaluation_samples(
        FakeCursor(),  # type: ignore[arg-type]
        "project-1",
        payload,
        "user-1",
        object(),  # type: ignore[arg-type]
    )

    assert len(samples) == 5
    assert [sample["id"] for sample in samples] == [
        "trace-sample-0",
        "trace-sample-1",
        "trace-sample-2",
        "trace-sample-3",
        "trace-sample-4",
    ]
    assert data_source["sampleCount"] == 5
    assert data_source["matchedTraceCount"] == 12


@pytest.mark.anyio
async def test_resolve_auto_evaluation_samples_caps_rerun_to_original_dataset_sample_count(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_get_dataset_for_user(*args: object, **kwargs: object):
        return {"id": "dataset-1", "name": "客服数据集", "project_id": "project-1"}

    async def fake_list_active_dataset_items(*args: object, **kwargs: object):
        return [
            {
                "id": f"dataset-item-{index}",
                "input": {},
                "expected_output": "",
                "metadata": {},
            }
            for index in range(10)
        ]

    monkeypatch.setattr(
        auto_evaluations,
        "_get_dataset_for_user",
        fake_get_dataset_for_user,
    )
    monkeypatch.setattr(
        auto_evaluations,
        "_list_active_dataset_items",
        fake_list_active_dataset_items,
    )
    payload = CreateAutoEvaluationPayload.model_validate(
        {
            "name": "客服质检",
            "scoreName": "quality",
            "evaluatorId": "evaluator-1",
            "sampleRate": 100,
            "dataSource": {
                "type": "DATASET",
                "datasetId": "dataset-1",
                "datasetProjectId": "project-1",
                "sampleCount": 4,
                "totalItemCount": 8,
            },
        }
    )

    data_source, samples = await _resolve_auto_evaluation_samples(
        FakeCursor(),  # type: ignore[arg-type]
        "project-1",
        payload,
        "user-1",
        object(),  # type: ignore[arg-type]
    )

    assert len(samples) == 4
    assert [sample["id"] for sample in samples] == [
        "dataset-item-0",
        "dataset-item-1",
        "dataset-item-2",
        "dataset-item-3",
    ]
    assert data_source["sampleCount"] == 4
    assert data_source["totalItemCount"] == 10


def test_normalize_dataset_item_sample_exposes_sample_fields() -> None:
    sample = _normalize_dataset_item_sample(
        {
            "id": "item-1",
            "input": {
                "input": "怎么申请退款？",
                "output": "可在订单详情页提交退款申请。",
                "context": "客服场景",
            },
            "expected_output": "退款申请",
            "metadata": {"channel": "web"},
            "source_trace_id": "trace-1",
            "source_observation_id": "obs-1",
        }
    )

    assert sample["sourceType"] == "DATASET_ITEM"
    assert sample["sourceId"] == "item-1"
    assert sample["input"] == "怎么申请退款？"
    assert sample["output"] == "可在订单详情页提交退款申请。"
    assert sample["expectedOutput"] == "退款申请"
    assert sample["context"] == "客服场景"
    assert sample["metadata"] == {"channel": "web"}
    assert sample["trace"]["id"] == "trace-1"
    assert sample["observation"]["id"] == "obs-1"
    assert sample["datasetItem"]["id"] == "item-1"


def test_to_trace_generation_sample_exposes_sample_fields() -> None:
    sample = _to_trace_generation_sample(
        {
            "trace_id": "trace-1",
            "trace_name": "refund-flow",
            "trace_input": {"query": "怎么申请退款？"},
            "trace_output": {"answer": "旧输出"},
            "trace_metadata": {"channel": "web", "context": "客服场景"},
            "user_id": "user-1",
            "session_id": "session-1",
            "tags": ["refund"],
            "observation_id": "obs-1",
            "observation_name": "llm",
            "observation_input": "怎么申请退款？",
            "observation_output": "可在订单详情页提交退款申请。",
            "observation_metadata": {"model": "demo"},
        }
    )

    assert sample["sourceType"] == "TRACE_GENERATION"
    assert sample["sourceId"] == "trace-1"
    assert sample["id"] == "obs-1"
    assert sample["input"] == {
        "input": "怎么申请退款？",
        "output": "可在订单详情页提交退款申请。",
        "context": "客服场景",
    }
    assert sample["expected_output"] == ""
    assert sample["source_trace_id"] == "trace-1"
    assert sample["source_observation_id"] == "obs-1"
    assert sample["metadata"]["traceName"] == "refund-flow"
    assert sample["metadata"]["userId"] == "user-1"


def test_get_path_value_reads_nested_sample_paths() -> None:
    source = {"sample": {"metadata": {"channel": "web"}}}

    assert _get_path_value(source, "sample.metadata.channel") == "web"
    assert _get_path_value(source, "sample.metadata.missing") == ""


def test_resolve_mapping_template_replaces_sample_paths() -> None:
    sample = {
        "input": "问题",
        "output": "回答",
        "expectedOutput": "期望",
        "metadata": {"channel": "web"},
    }

    assert _resolve_mapping_template("{{ sample.input }}", sample) == "问题"
    assert (
        _resolve_mapping_template("渠道：{{ sample.metadata.channel }}", sample)
        == "渠道：web"
    )


def test_build_workflow_inputs_prefers_task_mapping_over_evaluator_mapping() -> None:
    sample = {
        "input": "问题",
        "output": "回答",
        "expectedOutput": "期望",
        "context": "上下文",
    }
    evaluator = {
        "variables": ["input", "answer"],
        "config": {
            "inputMapping": {
                "input": "{{ sample.input }}",
                "answer": "{{ sample.output }}",
            }
        },
    }

    inputs = _build_workflow_inputs(
        sample,
        evaluator,
        {"answer": "{{ sample.expectedOutput }}"},
    )

    assert inputs == {"input": "问题", "answer": "期望"}


@pytest.mark.anyio
async def test_list_trace_generation_samples_queries_last_generation_with_filters() -> (
    None
):
    cursor = FakeCursor(rows=[{"trace_id": "trace-1", "observation_id": "obs-1"}])

    samples = await _list_trace_generation_samples(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        data_source_payload={
            "traceName": "refund",
            "userId": "user-1",
            "sessionId": "session-1",
            "tags": ["refund"],
        },
    )

    assert len(samples) == 1
    assert "DISTINCT ON (t.id)" in cursor.sql
    assert "o.type = 'GENERATION'" in cursor.sql
    assert cursor.params["project_id"] == "project-1"
    assert cursor.params["trace_name_like"] == "%refund%"
    assert cursor.params["user_id_like"] == "%user-1%"
    assert cursor.params["session_id_like"] == "%session-1%"
    assert cursor.params["tags"] == ["refund"]


@pytest.mark.anyio
async def test_list_trace_generation_samples_filters_postgres_environments() -> None:
    cursor = FakeCursor(rows=[{"trace_id": "trace-1", "observation_id": "obs-1"}])

    await _list_trace_generation_samples(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        data_source_payload={
            "environments": ["production", "staging"],
        },
    )

    assert "COALESCE(t.environment, 'default')" in cursor.sql
    assert "ANY(%(environments)s::text[])" in cursor.sql
    assert cursor.params["environments"] == ["production", "staging"]


@pytest.mark.anyio
async def test_list_trace_generation_samples_filters_clickhouse_environments(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, str] = {}

    async def fake_query_clickhouse_json_each_row(settings, query):
        captured["query"] = query
        return [{"trace_id": "trace-1", "observation_id": "obs-1"}]

    monkeypatch.setattr(
        auto_evaluations,
        "_query_clickhouse_json_each_row",
        fake_query_clickhouse_json_each_row,
    )

    samples = await _list_trace_generation_samples(
        FakeCursor(),  # type: ignore[arg-type]
        project_id="project-1",
        data_source_payload={
            "environments": ["production"],
        },
        settings=auto_evaluations.Settings(
            langfuse_clickhouse_url="http://clickhouse.local:8123"
        ),
    )

    assert len(samples) == 1
    assert "t.environment IN ('production')" in captured["query"]


@pytest.mark.anyio
async def test_list_trace_generation_samples_queries_custom_created_at_range() -> None:
    cursor = FakeCursor(rows=[{"trace_id": "trace-1", "observation_id": "obs-1"}])

    await _list_trace_generation_samples(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        data_source_payload={
            "timeRange": "",
            "createdAtRange": ["2026-07-05T00:00", "2026-07-08T00:00"],
        },
    )

    assert "t.timestamp >= %(created_at_from)s::timestamptz" in cursor.sql
    assert "t.timestamp < %(created_at_to)s::timestamptz" in cursor.sql
    assert "t.timestamp <= %(created_at_to)s::timestamptz" not in cursor.sql
    assert cursor.params["created_at_from"] == "2026-07-04T16:00:00Z"
    assert cursor.params["created_at_to"] == "2026-07-07T16:00:00Z"


def test_created_at_range_value_treats_timezone_less_values_as_shanghai_time() -> None:
    assert (
        _created_at_range_value(["2026-07-17T19:00", "2026-07-17T20:00"], 0)
        == "2026-07-17T11:00:00Z"
    )
    assert (
        _created_at_range_value(["2026-07-17T19:00", "2026-07-17T20:00"], 1)
        == "2026-07-17T12:00:00Z"
    )
    assert (
        _created_at_range_value(["2026-07-17T11:00:00Z"], 0) == "2026-07-17T11:00:00Z"
    )


def test_parse_workflow_result_supports_n8n_direct_response() -> None:
    result = _parse_workflow_result(
        {"provider": "N8N"},
        {
            "score": 0.8,
            "passed": True,
            "reason": "命中规则",
        },
    )

    assert result == {
        "raw": {
            "score": 0.8,
            "passed": True,
            "reason": "命中规则",
        },
        "score": 0.8,
        "passed": True,
        "reason": "命中规则",
    }


def test_parse_workflow_result_derives_passed_when_dify_omits_passed() -> None:
    result = _parse_workflow_result(
        {"provider": "DIFY"},
        {
            "data": {
                "outputs": {
                    "score": 0.7,
                    "reason": "命中主要标准",
                }
            }
        },
    )

    assert result["score"] == 0.7
    assert result["passed"] is True
    assert result["reason"] == "命中主要标准"


def test_validate_workflow_evaluator_ready_requires_dify_api_key() -> None:
    with pytest.raises(BusinessError) as exc:
        _validate_workflow_evaluator_ready(
            {
                "provider": "DIFY",
                "config": {
                    "endpointUrl": "http://localhost/v1/workflows/run",
                    "authType": "BEARER",
                    "authToken": None,
                },
            }
        )

    assert exc.value.code == 4002
    assert exc.value.message == "Dify 评估器缺少工作流 API Key"


@pytest.mark.anyio
async def test_run_workflow_evaluator_requires_dify_api_key() -> None:
    with pytest.raises(BusinessError) as exc:
        await _run_workflow_evaluator(
            {
                "provider": "DIFY",
                "config": {
                    "endpointUrl": "http://localhost/v1/workflows/run",
                    "authType": "BEARER",
                    "authToken": None,
                },
            },
            {"input": "用户问题", "output": "模型回答"},
            auto_evaluations.Settings(),
        )

    assert exc.value.code == 4002
    assert exc.value.message == "Dify 评估器缺少工作流 API Key"


@pytest.mark.anyio
async def test_run_workflow_evaluator_reports_upstream_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeAsyncClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            pass

        async def __aenter__(self) -> "FakeAsyncClient":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def post(self, *args: object, **kwargs: object) -> httpx.Response:
            request = httpx.Request("POST", "http://workflow.local/run")
            return httpx.Response(401, request=request, text="unauthorized")

    monkeypatch.setattr(auto_evaluations.httpx, "AsyncClient", FakeAsyncClient)

    with pytest.raises(BusinessError) as exc:
        await _run_workflow_evaluator(
            {
                "provider": "DIFY",
                "config": {
                    "endpointUrl": "http://workflow.local/run",
                    "authType": "BEARER",
                    "authToken": "token",
                },
            },
            {"input": "用户问题", "output": "模型回答"},
            auto_evaluations.Settings(),
        )

    assert exc.value.code == 4003
    assert exc.value.message == "工作流调用失败：上游返回 401"


def test_parse_workflow_result_maps_dify_output_variables_to_scores() -> None:
    result = _parse_workflow_result(
        {"provider": "DIFY", "output_variables": ["quality_score", "risk_score"]},
        {
            "data": {
                "outputs": {
                    "quality_score": 0.82,
                    "risk_score": 0.2,
                    "reason": "质量较高，风险较低",
                }
            }
        },
        {
            "quality_score": {
                "scoreConfigId": "score-config-quality",
                "scoreConfigName": "回答质量",
            },
            "risk_score": {
                "scoreConfigId": "score-config-risk",
                "scoreConfigName": "风险分",
            },
        },
    )

    assert result["score"] == 0.82
    assert result["reason"] == "质量较高，风险较低"
    assert result["scores"] == [
        {
            "outputVariable": "quality_score",
            "scoreConfigId": "score-config-quality",
            "name": "回答质量",
            "value": 0.82,
            "passed": True,
        },
        {
            "outputVariable": "risk_score",
            "scoreConfigId": "score-config-risk",
            "name": "风险分",
            "value": 0.2,
            "passed": False,
        },
    ]


def test_parse_workflow_result_keeps_text_outputs_as_string_scores() -> None:
    result = _parse_workflow_result(
        {"provider": "DIFY", "output_variables": ["score", "reason"]},
        {
            "data": {
                "outputs": {
                    "score": 0.9,
                    "reason": "回答准确完整",
                }
            }
        },
        {
            "score": {
                "scoreConfigId": "score-config-number",
                "scoreConfigName": "数值",
            },
            "reason": {
                "scoreConfigId": "score-config-note",
                "scoreConfigName": "备注",
            },
        },
    )

    assert result["score"] == 0.9
    assert result["scores"] == [
        {
            "outputVariable": "score",
            "scoreConfigId": "score-config-number",
            "name": "数值",
            "value": 0.9,
            "passed": True,
        },
        {
            "outputVariable": "reason",
            "scoreConfigId": "score-config-note",
            "name": "备注",
            "stringValue": "回答准确完整",
            "passed": True,
        },
    ]


def test_parse_workflow_result_uses_score_mapping_when_output_variables_missing() -> (
    None
):
    result = _parse_workflow_result(
        {"provider": "DIFY"},
        {
            "data": {
                "outputs": {
                    "quality_score": 0.91,
                    "risk_reason": "无明显风险",
                }
            }
        },
        {
            "quality_score": {
                "scoreConfigId": "score-config-quality",
                "scoreConfigName": "回答质量",
            },
            "risk_reason": {
                "scoreConfigId": "score-config-risk-reason",
                "scoreConfigName": "风险说明",
            },
        },
    )

    assert result["score"] == 0.91
    assert result["scores"] == [
        {
            "outputVariable": "quality_score",
            "scoreConfigId": "score-config-quality",
            "name": "回答质量",
            "value": 0.91,
            "passed": True,
        },
        {
            "outputVariable": "risk_reason",
            "scoreConfigId": "score-config-risk-reason",
            "name": "风险说明",
            "stringValue": "无明显风险",
            "passed": True,
        },
    ]


def test_parse_workflow_result_accepts_object_output_variables() -> None:
    result = _parse_workflow_result(
        {
            "provider": "DIFY",
            "outputVariables": [
                {"variableName": "quality_score"},
                {"variableName": "risk_score"},
            ],
        },
        {
            "data": {
                "outputs": {
                    "quality_score": 0.87,
                    "risk_score": 0.34,
                }
            }
        },
        {
            "quality_score": {
                "scoreConfigId": "score-config-quality",
                "scoreConfigName": "回答质量",
            },
            "risk_score": {
                "scoreConfigId": "score-config-risk",
                "scoreConfigName": "风险分",
            },
        },
    )

    assert [score["outputVariable"] for score in result["scores"]] == [
        "quality_score",
        "risk_score",
    ]
    assert [score["value"] for score in result["scores"]] == [0.87, 0.34]


def test_parse_workflow_result_reads_output_mapping_from_raw_body() -> None:
    result = _parse_workflow_result(
        {
            "provider": "DIFY",
            "output_variables": ["quality_score"],
            "config": {
                "outputMapping": {
                    "quality_score": "$.data.outputs.nested.quality",
                }
            },
        },
        {
            "data": {
                "outputs": {
                    "nested": {
                        "quality": 0.93,
                    },
                }
            }
        },
        {
            "quality_score": {
                "scoreConfigId": "score-config-quality",
                "scoreConfigName": "回答质量",
            },
        },
    )

    assert result["score"] == 0.93
    assert result["scores"][0]["value"] == 0.93


def test_auto_evaluation_score_payload_includes_score_config_id() -> None:
    payload = _auto_evaluation_score_api_payload(
        project_id="project-1",
        task_id="task-1",
        run_id="run-1",
        score_name="回答质量",
        evaluator_id="evaluator-1",
        result={
            "sample": {
                "id": "sample-1",
                "source_trace_id": "trace-1",
                "source_observation_id": "obs-1",
            },
            "score": 0.82,
            "passed": True,
            "reason": "回答完整",
        },
        score_value=0.82,
        score_passed=True,
        score_config_id="score-config-quality",
    )

    assert payload is not None
    assert payload["configId"] == "score-config-quality"


def test_auto_evaluation_score_payload_uses_bound_categorical_config() -> None:
    payload = _auto_evaluation_score_api_payload(
        project_id="project-1",
        task_id="task-1",
        run_id="run-1",
        score_name="问题类型",
        evaluator_id="evaluator-1",
        result={
            "sample": {"id": "sample-1", "source_trace_id": "trace-1"},
            "score": 0.0,
            "passed": True,
            "reason": "分类命中",
        },
        score_value="答案事实错误",
        score_passed=True,
        score_config={
            "id": "score-config-category",
            "name": "问题类型",
            "dataType": "CATEGORICAL",
            "categories": [
                {"label": "工具调用错误", "value": 1},
                {"label": "答案事实错误", "value": 2},
            ],
        },
    )

    assert payload is not None
    assert payload["configId"] == "score-config-category"
    assert payload["dataType"] == "CATEGORICAL"
    assert payload["value"] == "答案事实错误"
    assert payload["stringValue"] == "答案事实错误"


def test_auto_evaluation_score_payload_uses_bound_boolean_and_text_configs() -> None:
    boolean_payload = _auto_evaluation_score_api_payload(
        project_id="project-1",
        task_id="task-1",
        run_id="run-1",
        score_name="是否通过",
        evaluator_id="evaluator-1",
        result={"sample": {"id": "sample-1", "source_trace_id": "trace-1"}},
        score_value="false",
        score_passed=False,
        score_config={
            "id": "score-config-bool",
            "name": "是否通过",
            "dataType": "BOOLEAN",
            "categories": [
                {"label": "通过", "value": 1},
                {"label": "不通过", "value": 0},
            ],
        },
    )
    text_payload = _auto_evaluation_score_api_payload(
        project_id="project-1",
        task_id="task-1",
        run_id="run-1",
        score_name="评审说明",
        evaluator_id="evaluator-1",
        result={"sample": {"id": "sample-1", "source_trace_id": "trace-1"}},
        score_value="回答引用来源不足",
        score_passed=True,
        score_config={
            "id": "score-config-text",
            "name": "评审说明",
            "dataType": "TEXT",
        },
    )

    assert boolean_payload is not None
    assert boolean_payload["dataType"] == "BOOLEAN"
    assert boolean_payload["value"] == 0
    assert boolean_payload["stringValue"] == "False"
    assert text_payload is not None
    assert text_payload["dataType"] == "TEXT"
    assert text_payload["value"] == "回答引用来源不足"
    assert text_payload["stringValue"] == "回答引用来源不足"


@pytest.mark.anyio
async def test_sync_auto_evaluation_repairs_legacy_boolean_config() -> None:
    cursor = SequentialCursor(
        rows_by_fetchall=[
            [
                {
                    "id": "score-config-bool",
                    "name": "是否通过",
                    "data_type": "BOOLEAN",
                    "min_value": None,
                    "max_value": None,
                    "categories": [
                        {"label": "通过", "value": 1},
                        {"label": "不通过", "value": 0},
                    ],
                }
            ]
        ],
        rows_by_fetchone=[
            {"public_key": "pk-lf-project", "secret_key": "sk-lf-project"},
        ],
    )
    langfuse_client = FakeLangfuseScoreClient()
    score_writer = FakeClickHouseScoreWriter()

    await _sync_auto_evaluation_scores_to_langfuse(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="task-1",
        run_id="run-1",
        score_name="是否通过",
        evaluator_id="evaluator-1",
        results=[
            {
                "sample": {"id": "sample-1", "source_trace_id": "trace-1"},
                "score": 0.0,
                "passed": False,
                "scores": [
                    {
                        "name": "是否通过",
                        "scoreConfigId": "score-config-bool",
                        "value": False,
                        "passed": False,
                    }
                ],
            }
        ],
        langfuse_client=langfuse_client,  # type: ignore[arg-type]
        score_writer=score_writer,  # type: ignore[arg-type]
        score_author_user_id="user-1",
    )

    assert langfuse_client.updated_score_configs == [
        (
            "pk-lf-project",
            "sk-lf-project",
            "score-config-bool",
            {
                "categories": [
                    {"label": "True", "value": 1},
                    {"label": "False", "value": 0},
                ]
            },
        )
    ]
    payload = langfuse_client.created_scores[0][2]
    assert payload["value"] == 0
    assert payload["stringValue"] == "False"
    assert not any(key.startswith("_pa") for key in payload)
    assert not any(key.startswith("_pa") for key in score_writer.upserted_scores[0][2])


def test_clickhouse_score_numeric_value_handles_non_numeric_score_values() -> None:
    assert (
        _score_numeric_value({"dataType": "CATEGORICAL", "value": "答案事实错误"}) == 0
    )
    assert _score_numeric_value({"dataType": "TEXT", "value": "人工备注"}) == 0
    assert _score_numeric_value({"dataType": "BOOLEAN", "value": 1}) == 1


@pytest.mark.anyio
async def test_sync_auto_evaluation_scores_uses_bound_score_config_data_types() -> None:
    cursor = SequentialCursor(
        rows_by_fetchall=[
            [
                {
                    "id": "score-config-category",
                    "name": "问题类型",
                    "data_type": "CATEGORICAL",
                    "min_value": None,
                    "max_value": None,
                    "categories": [
                        {"label": "工具调用错误", "value": 1},
                        {"label": "答案事实错误", "value": 2},
                    ],
                },
                {
                    "id": "score-config-text",
                    "name": "评审说明",
                    "data_type": "TEXT",
                    "min_value": None,
                    "max_value": None,
                    "categories": None,
                },
            ]
        ],
        rows_by_fetchone=[
            {"public_key": "pk-lf-project", "secret_key": "sk-lf-project"},
        ],
    )
    langfuse_client = FakeLangfuseScoreClient()
    score_writer = FakeClickHouseScoreWriter()

    await _sync_auto_evaluation_scores_to_langfuse(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="task-1",
        run_id="run-1",
        score_name="quality",
        evaluator_id="evaluator-1",
        results=[
            {
                "sample": {"id": "sample-1", "source_trace_id": "trace-1"},
                "score": 0.0,
                "passed": True,
                "reason": "完成",
                "scores": [
                    {
                        "name": "问题类型",
                        "scoreConfigId": "score-config-category",
                        "stringValue": "答案事实错误",
                        "passed": True,
                    },
                    {
                        "name": "评审说明",
                        "scoreConfigId": "score-config-text",
                        "stringValue": "回答引用来源不足",
                        "passed": True,
                    },
                ],
            }
        ],
        langfuse_client=langfuse_client,  # type: ignore[arg-type]
        score_writer=score_writer,  # type: ignore[arg-type]
        score_author_user_id="creator@163.com",
    )

    payloads = [item[2] for item in langfuse_client.created_scores]
    assert [(item["dataType"], item["value"]) for item in payloads] == [
        ("CATEGORICAL", "答案事实错误"),
        ("TEXT", "回答引用来源不足"),
    ]
    assert [item["stringValue"] for item in payloads] == [
        "答案事实错误",
        "回答引用来源不足",
    ]
    categorical_clickhouse_payload = score_writer.upserted_scores[0][2]
    assert categorical_clickhouse_payload["value"] == 2.0
    assert categorical_clickhouse_payload["stringValue"] == "答案事实错误"
    text_clickhouse_payload = score_writer.upserted_scores[1][2]
    assert text_clickhouse_payload["value"] == 0.0
    assert text_clickhouse_payload["stringValue"] == "回答引用来源不足"


@pytest.mark.anyio
async def test_sync_auto_evaluation_scores_skips_invalid_mapped_score_values() -> None:
    cursor = SequentialCursor(
        rows_by_fetchall=[
            [
                {
                    "id": "score-config-quality",
                    "name": "回答质量",
                    "data_type": "NUMERIC",
                    "min_value": 0,
                    "max_value": 1,
                    "categories": None,
                },
                {
                    "id": "score-config-reason",
                    "name": "评审理由",
                    "data_type": "NUMERIC",
                    "min_value": 0,
                    "max_value": 10,
                    "categories": None,
                },
            ]
        ],
        rows_by_fetchone=[
            {"public_key": "pk-lf-project", "secret_key": "sk-lf-project"},
        ],
    )
    langfuse_client = FakeLangfuseScoreClient()
    score_writer = FakeClickHouseScoreWriter()

    await _sync_auto_evaluation_scores_to_langfuse(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="task-1",
        run_id="run-1",
        score_name="quality",
        evaluator_id="evaluator-1",
        results=[
            {
                "sample": {"id": "sample-1", "source_trace_id": "trace-1"},
                "score": 0.8,
                "passed": True,
                "reason": "回答完整",
                "scores": [
                    {
                        "name": "回答质量",
                        "scoreConfigId": "score-config-quality",
                        "value": 0.8,
                        "passed": True,
                    },
                    {
                        "name": "评审理由",
                        "scoreConfigId": "score-config-reason",
                        "stringValue": "回答完整",
                        "passed": True,
                    },
                ],
            }
        ],
        langfuse_client=langfuse_client,  # type: ignore[arg-type]
        score_writer=score_writer,  # type: ignore[arg-type]
        score_author_user_id="creator@163.com",
    )

    assert [item[2]["name"] for item in langfuse_client.created_scores] == ["回答质量"]
    assert [item[2]["name"] for item in score_writer.upserted_scores] == ["回答质量"]


@pytest.mark.anyio
async def test_sync_auto_evaluation_scores_resolves_score_config_by_name() -> None:
    cursor = SequentialCursor(
        rows_by_fetchall=[
            [
                {
                    "id": "score-config-text",
                    "name": "评审说明",
                    "data_type": "TEXT",
                    "min_value": None,
                    "max_value": None,
                    "categories": None,
                },
            ]
        ],
        rows_by_fetchone=[
            {"public_key": "pk-lf-project", "secret_key": "sk-lf-project"},
        ],
    )
    langfuse_client = FakeLangfuseScoreClient()

    await _sync_auto_evaluation_scores_to_langfuse(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="task-1",
        run_id="run-1",
        score_name="quality",
        evaluator_id="evaluator-1",
        results=[
            {
                "sample": {"id": "sample-1", "source_trace_id": "trace-1"},
                "score": 0.0,
                "scores": [
                    {
                        "name": "评审说明",
                        "scoreConfigId": "评审说明",
                        "stringValue": "回答引用来源不足",
                        "passed": True,
                    },
                ],
            }
        ],
        langfuse_client=langfuse_client,  # type: ignore[arg-type]
    )

    payload = langfuse_client.created_scores[0][2]
    assert payload["configId"] == "score-config-text"
    assert payload["dataType"] == "TEXT"
    assert payload["stringValue"] == "回答引用来源不足"


def test_trace_time_range_condition_supports_auto_evaluation_quick_ranges() -> None:
    assert (
        _trace_time_range_condition("1d") == "AND t.timestamp >= now() - INTERVAL 1 DAY"
    )
    assert (
        _trace_time_range_condition("3d") == "AND t.timestamp >= now() - INTERVAL 3 DAY"
    )
    assert (
        _trace_time_range_condition("7d") == "AND t.timestamp >= now() - INTERVAL 7 DAY"
    )
    assert (
        _trace_time_range_condition("14d")
        == "AND t.timestamp >= now() - INTERVAL 14 DAY"
    )


def test_build_workflow_headers_supports_bearer_token() -> None:
    headers = _build_workflow_headers(
        {
            "config": {
                "authType": "BEARER",
                "authToken": "token-1",
            }
        }
    )

    assert headers == {"Authorization": "Bearer token-1"}


def test_build_report_from_template_applies_title_summary_sections_and_badcase_rule() -> (
    None
):
    report = _build_report_from_template(
        task_name="客服质检",
        score_name="quality",
        report_id="report-1",
        task_id="task-1",
        evaluator={"id": "evaluator-1"},
        data_source={"name": "baiyizhong-dataset"},
        input_mapping={"input": "{{ sample.input }}"},
        results=[
            {
                "score": 0.75,
                "passed": True,
                "raw": {"data": {"workflow_run_id": "run-1"}},
            },
            {
                "score": 0.5,
                "passed": True,
                "raw": {"data": {"workflow_run_id": "run-2"}},
            },
        ],
        template_snapshot={
            "id": "template-1",
            "name": "严格报告",
            "titleTemplate": "{taskName} 自定义报告",
            "summaryTemplate": (
                "样本 {sampleCount} 条，平均 {averageScore}，Badcase {badcaseCount} 条"
            ),
            "sections": {
                "metrics": True,
                "distribution": False,
                "groupAnalysis": True,
                "recommendations": False,
                "risks": True,
                "reproduction": False,
                "items": True,
                "badcases": True,
            },
            "badcaseRule": {
                "mode": "SCORE_THRESHOLD",
                "operator": "LTE",
                "threshold": 0.6,
            },
            "recommendations": ["模板建议"],
            "risks": ["模板风险"],
        },
    )

    assert report["title"] == "客服质检 自定义报告"
    assert report["badcaseCount"] == 1
    assert report["summary"] == "样本 2 条，平均 0.62，Badcase 1 条"
    assert report["distribution"] == []
    assert report["recommendations"] == []
    assert report["risks"] == ["模板风险"]
    assert report["reproduction"] == {}
    assert report["itemResults"] == ["normal", "badcase"]


def test_apply_auto_evaluation_badcase_config_overrides_template_threshold() -> None:
    snapshot = {
        "id": "template-1",
        "sections": {"badcases": False, "items": True},
        "badcaseRule": {"mode": "EVALUATOR_RESULT"},
    }

    result = _apply_auto_evaluation_badcase_config(
        snapshot,
        AutoEvaluationBadcaseConfig.model_validate(
            {
                "enabled": True,
                "operator": "LTE",
                "threshold": 0.72,
            }
        ),
    )

    assert result["sections"]["badcases"] is True
    assert result["badcaseRule"] == {
        "mode": "SCORE_THRESHOLD",
        "operator": "LTE",
        "threshold": 0.72,
    }


def test_evaluation_report_score_item_is_badcase_uses_score_threshold_rule() -> None:
    row = {
        "resultType": "normal",
        "scores": [
            {
                "name": "quality",
                "value": 0.5,
            },
        ],
    }

    assert _evaluation_report_score_item_is_badcase(
        row,
        score_name="quality",
        report_template_snapshot={
            "badcaseRule": {
                "mode": "SCORE_THRESHOLD",
                "operator": "LTE",
                "threshold": 0.6,
            }
        },
    )


def test_evaluation_report_score_item_is_badcase_falls_back_to_result_type() -> None:
    assert _evaluation_report_score_item_is_badcase(
        {"resultType": "badcase", "scores": []},
        score_name="quality",
        report_template_snapshot={"badcaseRule": {"mode": "EVALUATOR_RESULT"}},
    )


@pytest.mark.anyio
async def test_complete_auto_evaluation_success_persists_report_template_snapshot() -> (
    None
):
    cursor = FakeCursor({"create_date": None, "create_by": "creator@163.com"})
    payload = CreateAutoEvaluationPayload.model_validate(
        {
            "name": "客服质检",
            "scoreName": "quality",
            "evaluatorId": "evaluator-1",
            "dataSource": {"type": "DATASET", "datasetId": "dataset-1"},
            "reportTemplateId": "template-1",
            "reportTemplateSnapshot": {
                "id": "template-1",
                "name": "严格报告",
                "titleTemplate": "{taskName} 自定义报告",
                "summaryTemplate": "Badcase {badcaseCount} 条",
                "badcaseRule": {
                    "mode": "SCORE_THRESHOLD",
                    "operator": "LTE",
                    "threshold": 0.6,
                },
                "sections": {"recommendations": False},
            },
        }
    )

    await _complete_auto_evaluation_success(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="task-1",
        run_id="run-1",
        payload=payload,
        evaluator={"id": "evaluator-1", "variables": [], "config": {}},
        data_source={"name": "baiyizhong-dataset"},
        results=[
            {
                "sample": {
                    "id": "item-1",
                    "source_trace_id": "trace-1",
                    "source_observation_id": "obs-1",
                },
                "score": 0.5,
                "passed": True,
                "reason": "低于模板阈值",
                "raw": {"data": {"workflow_run_id": "run-1"}},
            }
        ],
        updated_by="admin@163.com",
    )

    report_sql, report_params = cursor.executions[1]
    badcase_sql, badcase_params = next(
        (
            execution
            for execution in cursor.executions
            if "pa_evaluation_report_badcases" in execution[0]
        )
    )
    assert "report_template_id" in report_sql
    assert "report_template_snapshot" in report_sql
    assert report_params["report_template_id"] == "template-1"
    assert _jsonb_value(report_params["report_template_snapshot"])["name"] == "严格报告"
    assert report_params["title"].endswith("自定义报告")
    assert _jsonb_value(report_params["recommendations"]) == []
    assert "INSERT INTO pa_evaluation_report_badcases" in badcase_sql
    assert badcase_params["score_value"] == 0.5


@pytest.mark.anyio
async def test_complete_auto_evaluation_success_does_not_mark_trace_metadata() -> None:
    cursor = FakeCursor(
        {
            "create_date": None,
            "create_by": "creator@163.com",
            "metadata": {"existing": "value"},
        }
    )
    payload = CreateAutoEvaluationPayload.model_validate(
        {
            "name": "客服质检",
            "scoreName": "quality",
            "evaluatorId": "evaluator-1",
            "dataSource": {"type": "DATASET", "datasetId": "dataset-1"},
            "reportTemplateSnapshot": {
                "badcaseRule": {
                    "mode": "SCORE_THRESHOLD",
                    "operator": "LTE",
                    "threshold": 0.6,
                },
                "sections": {"badcases": True},
            },
        }
    )

    await _complete_auto_evaluation_success(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="task-1",
        run_id="run-1",
        payload=payload,
        evaluator={"id": "evaluator-1", "variables": [], "config": {}},
        data_source={"name": "baiyizhong-dataset"},
        results=[
            {
                "sample": {
                    "id": "item-1",
                    "source_trace_id": "trace-1",
                    "source_observation_id": "obs-1",
                },
                "score": 0.5,
                "passed": True,
                "reason": "低于模板阈值",
                "raw": {"data": {"workflow_run_id": "run-1"}},
            }
        ],
        updated_by="admin@163.com",
    )

    assert not any("UPDATE traces" in sql for sql, _ in cursor.executions)


@pytest.mark.anyio
async def test_complete_auto_evaluation_success_accepts_camelcase_trace_sample_fields() -> (
    None
):
    cursor = FakeCursor(
        {
            "create_date": None,
            "create_by": "creator@163.com",
            "metadata": {"existing": "value"},
        }
    )
    payload = CreateAutoEvaluationPayload.model_validate(
        {
            "name": "客服质检",
            "scoreName": "quality",
            "evaluatorId": "evaluator-1",
            "dataSource": {"type": "TRACE_FILTER"},
            "reportTemplateSnapshot": {
                "badcaseRule": {
                    "mode": "SCORE_THRESHOLD",
                    "operator": "LTE",
                    "threshold": 0.6,
                },
                "sections": {"badcases": True},
            },
        }
    )

    await _complete_auto_evaluation_success(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="task-1",
        run_id="run-1",
        payload=payload,
        evaluator={"id": "evaluator-1", "variables": [], "config": {}},
        data_source={"name": "trace-filter"},
        results=[
            {
                "sample": {
                    "id": "obs-1",
                    "traceId": "trace-1",
                    "observationId": "obs-1",
                },
                "score": 0.5,
                "passed": True,
                "reason": "低于模板阈值",
                "raw": {"data": {"workflow_run_id": "run-1"}},
            }
        ],
        updated_by="admin@163.com",
    )

    item_insert = next(
        params
        for sql, params in cursor.executions
        if "INSERT INTO pa_evaluation_report_items" in sql
    )
    assert item_insert["trace_id"] == "trace-1"
    assert item_insert["observation_id"] == "obs-1"
    assert not any("UPDATE traces" in sql for sql, _ in cursor.executions)


def test_report_badcase_exposes_score_summary_json_from_other_scores() -> None:
    badcase = _to_report_badcase(
        {
            "id": "badcase-1",
            "report_id": "report-1",
            "trace_id": "trace-1",
            "observation_id": "obs-1",
            "dataset_item_id": "item-1",
            "score_name": "quality",
            "score_value": 0.5,
            "reason": "低于模板阈值",
            "comment": "Dify 工作流判定未通过。",
            "source_type": "AUTO_EVAL",
            "flowback_status": "NONE",
            "score_summary_scores": [
                {
                    "outputVariable": "score",
                    "name": "score",
                    "value": 0.5,
                },
                {
                    "outputVariable": "quality_score",
                    "name": "回答质量",
                    "value": 0.8,
                },
                {
                    "outputVariable": "risk_reason",
                    "name": "风险原因",
                    "stringValue": "命中风险规则",
                },
                {
                    "outputVariable": "reason",
                    "name": "reason",
                    "stringValue": "低于模板阈值",
                },
            ],
        }
    )

    assert badcase["scoreValue"] == 0.5
    assert badcase["reason"] == "低于模板阈值"
    assert badcase["scoreSummary"] == '{"回答质量": 0.8, "风险原因": "命中风险规则"}'


@pytest.mark.anyio
async def test_complete_auto_evaluation_success_respects_hidden_report_data_sections() -> (
    None
):
    cursor = FakeCursor({"create_date": None, "create_by": "creator@163.com"})
    payload = CreateAutoEvaluationPayload.model_validate(
        {
            "name": "客服质检",
            "scoreName": "quality",
            "evaluatorId": "evaluator-1",
            "reportTemplateId": "template-hidden-data",
            "reportTemplateSnapshot": {
                "id": "template-hidden-data",
                "name": "隐藏明细报告",
                "sections": {
                    "items": False,
                    "badcases": False,
                },
            },
        }
    )

    await _complete_auto_evaluation_success(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="task-1",
        run_id="run-1",
        payload=payload,
        evaluator={"id": "evaluator-1", "variables": [], "config": {}},
        data_source={"name": "baiyizhong-dataset"},
        results=[
            {
                "sample": {
                    "id": "item-1",
                    "source_trace_id": "trace-1",
                    "source_observation_id": "obs-1",
                },
                "score": 0.1,
                "passed": False,
                "reason": "评估器判定失败",
                "raw": {"data": {"workflow_run_id": "run-1"}},
            }
        ],
        updated_by="admin@163.com",
    )

    executed_sql = "\n".join(sql for sql, _params in cursor.executions)
    assert "INSERT INTO pa_evaluation_report_items" not in executed_sql
    assert "INSERT INTO pa_evaluation_report_badcases" not in executed_sql


@pytest.mark.anyio
async def test_complete_auto_evaluation_success_syncs_scores_to_langfuse_api() -> None:
    cursor = SequentialCursor(
        rows_by_fetchone=[
            {"create_date": None, "create_by": "creator@163.com"},
            {"public_key": "pk-lf-project", "secret_key": "sk-lf-project"},
        ]
    )
    langfuse_client = FakeLangfuseScoreClient()
    payload = CreateAutoEvaluationPayload.model_validate(
        {
            "name": "客服质检",
            "scoreName": "quality",
            "evaluatorId": "evaluator-1",
        }
    )

    await _complete_auto_evaluation_success(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="paautoeval-1",
        run_id="run-1",
        payload=payload,
        evaluator={"id": "evaluator-1", "variables": [], "config": {}},
        data_source={"name": "trace-filter"},
        results=[
            {
                "sample": {
                    "id": "sample-1",
                    "source_trace_id": "trace-1",
                    "source_observation_id": "obs-1",
                },
                "score": 0.86,
                "passed": True,
                "reason": "回答完整",
                "raw": {"data": {"workflow_run_id": "workflow-run-1"}},
            },
            {
                "sample": {
                    "id": "sample-2",
                    "source_trace_id": "",
                    "source_observation_id": "",
                },
                "score": 0.4,
                "passed": False,
                "reason": "无 trace 来源，跳过 Langfuse scores 同步",
                "raw": {},
            },
        ],
        updated_by="admin@163.com",
        langfuse_client=langfuse_client,  # type: ignore[arg-type]
    )

    assert langfuse_client.created_scores == [
        (
            "pk-lf-project",
            "sk-lf-project",
            {
                "id": langfuse_client.created_scores[0][2]["id"],
                "name": "quality",
                "value": 0.86,
                "dataType": "NUMERIC",
                "traceId": "trace-1",
                "observationId": "obs-1",
                "queueId": "paautoeval-1",
                "comment": "回答完整",
                "metadata": {
                    "paAutoEvaluationTaskId": "paautoeval-1",
                    "paAutoEvaluationRunId": "run-1",
                    "paEvaluationSampleId": "sample-1",
                    "evaluatorId": "evaluator-1",
                    "passed": True,
                },
            },
        )
    ]
    assert langfuse_client.created_scores[0][2]["id"].startswith("pa-auto-score-")


@pytest.mark.anyio
async def test_complete_auto_evaluation_success_upserts_scores_to_clickhouse() -> None:
    cursor = SequentialCursor(
        rows_by_fetchone=[
            {"create_date": None, "create_by": "creator@163.com"},
            {"public_key": "pk-lf-project", "secret_key": "sk-lf-project"},
        ]
    )
    langfuse_client = FakeLangfuseScoreClient()
    score_writer = FakeClickHouseScoreWriter()
    payload = CreateAutoEvaluationPayload.model_validate(
        {
            "name": "客服质检",
            "scoreName": "quality",
            "evaluatorId": "evaluator-1",
        }
    )

    await _complete_auto_evaluation_success(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="paautoeval-1",
        run_id="run-1",
        payload=payload,
        evaluator={"id": "evaluator-1", "variables": [], "config": {}},
        data_source={"name": "trace-filter"},
        results=[
            {
                "sample": {
                    "id": "sample-1",
                    "source_trace_id": "trace-1",
                    "source_observation_id": "obs-1",
                },
                "score": 0.86,
                "passed": True,
                "reason": "回答完整",
                "raw": {"data": {"workflow_run_id": "workflow-run-1"}},
            }
        ],
        updated_by="admin@163.com",
        langfuse_client=langfuse_client,  # type: ignore[arg-type]
        score_writer=score_writer,  # type: ignore[arg-type]
    )

    assert score_writer.upserted_scores == [
        (
            "project-1",
            "creator@163.com",
            langfuse_client.created_scores[0][2],
            "API",
        )
    ]
    assert score_writer.upserted_scores[0][2]["traceId"] == "trace-1"
    assert score_writer.upserted_scores[0][2]["observationId"] == "obs-1"


@pytest.mark.anyio
async def test_complete_auto_evaluation_success_expands_raw_outputs_to_item_scores_and_clickhouse() -> (
    None
):
    cursor = SequentialCursor(
        rows_by_fetchone=[
            {"create_date": None, "create_by": "creator@163.com"},
            {"public_key": "pk-lf-project", "secret_key": "sk-lf-project"},
        ]
    )
    langfuse_client = FakeLangfuseScoreClient()
    score_writer = FakeClickHouseScoreWriter()
    payload = CreateAutoEvaluationPayload.model_validate(
        {
            "name": "客服质检",
            "scoreName": "score",
            "scoreMapping": {
                "score": {
                    "scoreConfigId": "score-config-score",
                    "scoreConfigName": "score",
                },
                "passed": {
                    "scoreConfigId": "score-config-passed",
                    "scoreConfigName": "passed",
                },
                "reason": {
                    "scoreConfigId": "score-config-reason",
                    "scoreConfigName": "reason",
                },
                "risk_label": {
                    "scoreConfigId": "score-config-risk",
                    "scoreConfigName": "risk_label",
                },
            },
            "evaluatorId": "evaluator-1",
        }
    )

    await _complete_auto_evaluation_success(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="paautoeval-1",
        run_id="run-1",
        payload=payload,
        evaluator={"id": "evaluator-1", "variables": [], "config": {}},
        data_source={"name": "trace-filter"},
        results=[
            {
                "sample": {
                    "id": "sample-1",
                    "source_trace_id": "trace-1",
                    "source_observation_id": "obs-1",
                },
                "score": 0.86,
                "passed": True,
                "reason": "回答完整",
                "scores": [
                    {
                        "outputVariable": "score",
                        "scoreConfigId": "score-config-score",
                        "name": "score",
                        "value": 0.86,
                        "passed": True,
                    }
                ],
                "raw": {
                    "data": {
                        "outputs": {
                            "score": 0.86,
                            "passed": True,
                            "reason": "回答完整",
                            "risk_label": "low",
                        }
                    }
                },
            }
        ],
        updated_by="admin@163.com",
        langfuse_client=langfuse_client,  # type: ignore[arg-type]
        score_writer=score_writer,  # type: ignore[arg-type]
    )

    item_insert = next(
        params
        for sql, params in cursor.executions
        if "INSERT INTO pa_evaluation_report_items" in sql
    )
    item_scores = _jsonb_value(item_insert["scores"])
    assert [score["outputVariable"] for score in item_scores] == [
        "score",
        "passed",
        "reason",
        "risk_label",
    ]
    assert [score["name"] for score in item_scores] == [
        "score",
        "passed",
        "reason",
        "risk_label",
    ]
    assert len(score_writer.upserted_scores) == 4
    assert [item[2]["name"] for item in score_writer.upserted_scores] == [
        "score",
        "passed",
        "reason",
        "risk_label",
    ]


@pytest.mark.anyio
async def test_complete_auto_evaluation_success_maps_output_variables_to_bound_score_names() -> (
    None
):
    cursor = SequentialCursor(
        rows_by_fetchone=[
            {"create_date": None, "create_by": "creator@163.com"},
            {"public_key": "pk-lf-project", "secret_key": "sk-lf-project"},
        ]
    )
    langfuse_client = FakeLangfuseScoreClient()
    score_writer = FakeClickHouseScoreWriter()
    payload = CreateAutoEvaluationPayload.model_validate(
        {
            "name": "客服质检",
            "scoreName": "回答质量",
            "scoreMapping": {
                "quality_score": {
                    "scoreConfigId": "score-config-quality",
                    "scoreConfigName": "回答质量",
                },
                "risk_label": {
                    "scoreConfigId": "score-config-risk",
                    "scoreConfigName": "风险等级",
                },
            },
            "evaluatorId": "evaluator-1",
        }
    )

    await _complete_auto_evaluation_success(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="paautoeval-1",
        run_id="run-1",
        payload=payload,
        evaluator={"id": "evaluator-1", "variables": [], "config": {}},
        data_source={"name": "trace-filter"},
        results=[
            {
                "sample": {
                    "id": "sample-1",
                    "source_trace_id": "trace-1",
                    "source_observation_id": "obs-1",
                },
                "score": 0.91,
                "passed": True,
                "reason": "回答质量高，风险低",
                "scores": [
                    {
                        "outputVariable": "quality_score",
                        "scoreConfigId": "score-config-quality",
                        "name": "quality_score",
                        "value": 0.91,
                        "passed": True,
                    }
                ],
                "raw": {
                    "data": {
                        "outputs": {
                            "quality_score": 0.91,
                            "risk_label": "low",
                        }
                    }
                },
            }
        ],
        updated_by="admin@163.com",
        langfuse_client=langfuse_client,  # type: ignore[arg-type]
        score_writer=score_writer,  # type: ignore[arg-type]
    )

    item_insert = next(
        params
        for sql, params in cursor.executions
        if "INSERT INTO pa_evaluation_report_items" in sql
    )
    item_scores = _jsonb_value(item_insert["scores"])
    assert [score["name"] for score in item_scores] == ["回答质量", "风险等级"]
    assert [item[2]["name"] for item in score_writer.upserted_scores] == [
        "回答质量",
        "风险等级",
    ]


@pytest.mark.anyio
async def test_complete_auto_evaluation_success_marks_partial_failed_runs() -> None:
    cursor = FakeCursor({"create_date": None, "create_by": "creator@163.com"})
    payload = CreateAutoEvaluationPayload.model_validate(
        {
            "name": "客服质检",
            "scoreName": "quality",
            "evaluatorId": "evaluator-1",
        }
    )

    await _complete_auto_evaluation_success(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="task-1",
        run_id="run-1",
        payload=payload,
        evaluator={"id": "evaluator-1", "variables": [], "config": {}},
        data_source={"name": "trace-filter"},
        results=[
            {
                "sample": {"id": "sample-1", "source_trace_id": "trace-1"},
                "score": 0.86,
                "passed": True,
                "reason": "回答完整",
                "raw": {},
            }
        ],
        updated_by="admin@163.com",
        failed_count=2,
        error_message="部分样本执行失败",
    )

    task_sql, task_params = cursor.executions[-2]
    run_sql, run_params = cursor.executions[-1]
    assert "UPDATE pa_auto_evaluation_tasks" in task_sql
    assert task_params["status"] == "PARTIAL_FAILED"
    assert _jsonb_value(task_params["execution_stats"]) == {
        "pending": 0,
        "running": 0,
        "completed": 1,
        "failed": 2,
        "cancelled": 0,
    }
    assert "UPDATE pa_auto_evaluation_runs" in run_sql
    assert run_params["status"] == "PARTIAL_FAILED"
    assert run_params["completed_count"] == 1
    assert run_params["failed_count"] == 2
    assert run_params["error_message"] == "部分样本执行失败"


@pytest.mark.anyio
async def test_auto_evaluation_background_continues_after_sample_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    progress_calls = []
    complete_calls = []
    failed_calls = []

    async def fake_persist_progress(*args, **kwargs):
        progress_calls.append(kwargs)

    async def fake_run_workflow(evaluator, inputs, settings):
        if inputs["input"] == "timeout":
            raise httpx.TimeoutException("timeout")
        return {
            "raw": {"data": {"workflow_run_id": "run-ok"}},
            "score": 0.8,
            "passed": True,
            "reason": "ok",
        }

    async def fake_complete(cursor, **kwargs):
        complete_calls.append(kwargs)

    async def fake_mark_failed(cursor, **kwargs):
        failed_calls.append(kwargs)

    monkeypatch.setattr(
        auto_evaluations,
        "_persist_auto_evaluation_progress",
        fake_persist_progress,
    )
    monkeypatch.setattr(auto_evaluations, "_run_workflow_evaluator", fake_run_workflow)
    monkeypatch.setattr(
        auto_evaluations,
        "_complete_auto_evaluation_success",
        fake_complete,
    )
    monkeypatch.setattr(
        auto_evaluations, "_mark_auto_evaluation_failed", fake_mark_failed
    )

    async def fake_connect(settings):
        return FakeConnection(FakeCursor())

    monkeypatch.setattr(auto_evaluations, "_connect", fake_connect)

    await _run_auto_evaluation_background(
        settings=auto_evaluations.Settings(pa_eval_api_timeout=1),
        project_id="project-1",
        task_id="task-1",
        run_id="run-1",
        payload=CreateAutoEvaluationPayload.model_validate(
            {
                "name": "客服质检",
                "scoreName": "quality",
                "evaluatorId": "evaluator-1",
            }
        ),
        evaluator={"id": "evaluator-1", "variables": ["input"], "config": {}},
        samples=[
            {"id": "sample-timeout", "input": "timeout"},
            {"id": "sample-ok", "input": "ok"},
        ],
        data_source={"name": "trace-filter"},
        updated_by="admin@163.com",
    )

    assert failed_calls == []
    assert len(complete_calls) == 1
    assert complete_calls[0]["failed_count"] == 1
    assert complete_calls[0]["error_message"] == "部分样本执行失败：Dify 工作流调用超时"
    assert [result["sample"]["id"] for result in complete_calls[0]["results"]] == [
        "sample-ok"
    ]
    assert progress_calls[-1]["completed_count"] == 1
    assert progress_calls[-1]["failed_count"] == 1


@pytest.mark.anyio
async def test_preview_report_flowback_counts_duplicates_for_existing_dataset() -> None:
    cursor = SequentialCursor(
        rows_by_fetchall=[
            [
                {
                    "source_item_id": "badcase-1",
                    "source_dataset_item_id": "dataset-item-1",
                    "source_trace_id": "trace-1",
                    "source_observation_id": "obs-1",
                    "input": {"question": "如何退款"},
                    "output": {"answer": "请在订单详情提交退款"},
                    "expected_output": None,
                    "metadata": {"origin": "trace"},
                    "score_value": 0.42,
                    "reason": "答案不完整",
                    "comment": "缺少入口说明",
                    "score_summary": "quality: 0.42",
                    "prefer_trace_payload": True,
                    "result_type": "badcase",
                },
                {
                    "source_item_id": "badcase-2",
                    "source_dataset_item_id": "dataset-item-2",
                    "source_trace_id": "trace-2",
                    "source_observation_id": "",
                    "input": {"question": "怎么改地址"},
                    "output": {"answer": "请联系人工客服"},
                    "expected_output": None,
                    "metadata": {"origin": "trace"},
                    "score_value": 0.3,
                    "reason": "无效回复",
                    "comment": "",
                    "score_summary": "quality: 0.30",
                    "prefer_trace_payload": True,
                    "result_type": "badcase",
                },
            ],
            [
                {
                    "source_trace_id": "trace-1",
                    "source_observation_id": "",
                    "metadata": {},
                }
            ],
        ],
        rows_by_fetchone=[{"id": "dataset-1", "name": "生产 Badcase 集"}],
    )
    payload = EvaluationReportFlowbackPayload.model_validate(
        {
            "flowbackType": "BADCASE",
            "range": "BADCASE_ONLY",
            "selectedItemIds": [],
            "targetDataset": {"mode": "EXISTING", "datasetId": "dataset-1"},
            "dedupeStrategy": "SKIP_DUPLICATE",
        }
    )

    result = await _preview_report_flowback(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        report_id="report-1",
        payload=payload,
    )

    assert result == {
        "matchedCount": 2,
        "duplicateCount": 1,
        "willCreateCount": 1,
        "defaultDatasetName": "生产 Badcase 集",
    }
    duplicate_sql, duplicate_params = cursor.executions[-1]
    assert "dataset_items" in duplicate_sql
    assert duplicate_params["dataset_id"] == "dataset-1"


@pytest.mark.anyio
async def test_create_report_flowback_creates_dataset_items_and_updates_statuses() -> (
    None
):
    cursor = SequentialCursor(
        rows_by_fetchall=[
            [
                {
                    "source_item_id": "badcase-1",
                    "source_dataset_item_id": "dataset-item-1",
                    "source_trace_id": "trace-1",
                    "source_observation_id": "obs-1",
                    "input": {"question": "如何退款"},
                    "output": {"answer": "请在订单详情提交退款"},
                    "expected_output": None,
                    "metadata": {"origin": "trace"},
                    "score_value": 0.42,
                    "reason": "答案不完整",
                    "comment": "缺少入口说明",
                    "score_summary": "quality: 0.42",
                    "prefer_trace_payload": True,
                    "result_type": "badcase",
                }
            ],
            [],
        ],
        rows_by_fetchone=[],
    )
    payload = EvaluationReportFlowbackPayload.model_validate(
        {
            "flowbackType": "BADCASE",
            "range": "SELECTED",
            "selectedItemIds": ["badcase-1"],
            "targetDataset": {
                "mode": "CREATE",
                "name": "回流 Badcase 集",
                "description": "来自报告",
            },
            "dedupeStrategy": "SKIP_DUPLICATE",
        }
    )

    record = await _create_report_flowback(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        report_id="report-1",
        payload=payload,
        created_by="admin@example.com",
    )

    sql_text = "\n".join(sql for sql, _ in cursor.executions)
    assert "INSERT INTO datasets" in sql_text
    assert "INSERT INTO dataset_items" in sql_text
    assert "INSERT INTO pa_evaluation_report_flowbacks" in sql_text
    assert "UPDATE pa_evaluation_report_badcases" in sql_text
    assert "UPDATE pa_evaluation_reports" in sql_text
    assert record["successCount"] == 1
    assert record["requestedCount"] == 1
    assert record["targetDatasetName"] == "回流 Badcase 集"
    dataset_item_params = next(
        params
        for sql, params in cursor.executions
        if "INSERT INTO dataset_items" in sql
    )
    metadata = _jsonb_value(dataset_item_params["metadata"])
    input_payload = _jsonb_value(dataset_item_params["input"])
    expected_output_payload = _jsonb_value(dataset_item_params["expected_output"])
    assert input_payload == {
        "input": {"question": "如何退款"},
        "output": {"answer": "请在订单详情提交退款"},
    }
    assert expected_output_payload == {}
    assert metadata["origin"] == "trace"
    assert metadata["paEvaluationReport"]["reportId"] == "report-1"
    assert metadata["paEvaluationReport"]["sourceItemId"] == "badcase-1"
    assert dataset_item_params["source_trace_id"] == "trace-1"


@pytest.mark.anyio
async def test_insert_running_auto_evaluation_returns_before_report_generation() -> (
    None
):
    cursor = FakeCursor(None)

    await _insert_running_auto_evaluation(
        cursor,  # type: ignore[arg-type]
        task_id="task-1",
        run_id="run-1",
        project_id="project-1",
        name="客服回复评测",
        description="",
        score_name="quality",
        evaluator={
            "id": "evaluator-1",
            "name": "Dify 评估器",
            "type": "WORKFLOW",
            "version": 1,
        },
        data_source={"type": "DATASET", "sampleCount": 10},
        sample_rate=100,
        sample_count=10,
        report_template_id="default",
        report_template_snapshot={"id": "default", "name": "系统默认模板"},
        create_by="admin@163.com",
        now=None,
    )

    task_sql, task_params = cursor.executions[0]
    run_sql, run_params = cursor.executions[1]
    assert "INSERT INTO pa_auto_evaluation_tasks" in task_sql
    assert "create_by" in task_sql
    assert "create_date" in task_sql
    assert "update_by" in task_sql
    assert "update_date" in task_sql
    assert task_params["status"] == "RUNNING"
    assert task_params["latest_report_id"] is None
    assert task_params["report_template_id"] == "default"
    assert _jsonb_value(task_params["report_template_snapshot"])["id"] == "default"
    assert task_params["create_by"] == "admin@163.com"
    assert task_params["update_by"] == "admin@163.com"
    assert task_params["create_date"] == task_params["update_date"]
    assert _jsonb_value(task_params["execution_stats"]) == {
        "pending": 10,
        "running": 0,
        "completed": 0,
        "failed": 0,
        "cancelled": 0,
    }
    assert "INSERT INTO pa_auto_evaluation_runs" in run_sql
    assert "create_by" in run_sql
    assert "create_date" in run_sql
    assert "update_by" in run_sql
    assert "update_date" in run_sql
    assert run_params["status"] == "RUNNING"
    assert run_params["sample_count"] == 10
    assert run_params["ended_at"] is None
    assert run_params["create_by"] == "admin@163.com"
    assert run_params["update_by"] == "admin@163.com"


@pytest.mark.anyio
async def test_mark_auto_evaluation_failed_updates_task_and_run() -> None:
    cursor = FakeCursor(None)

    await _mark_auto_evaluation_failed(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="task-1",
        run_id="run-1",
        sample_count=10,
        message="Dify 工作流调用失败",
        updated_by="admin@163.com",
    )

    task_sql, task_params = cursor.executions[0]
    run_sql, run_params = cursor.executions[1]
    assert "UPDATE pa_auto_evaluation_tasks" in task_sql
    assert "update_by = %(update_by)s" in task_sql
    assert "update_date = %(update_date)s" in task_sql
    assert task_params["status"] == "FAILED"
    assert task_params["update_by"] == "admin@163.com"
    assert _jsonb_value(task_params["execution_stats"])["failed"] == 10
    assert "UPDATE pa_auto_evaluation_runs" in run_sql
    assert "update_by = %(update_by)s" in run_sql
    assert "update_date = %(update_date)s" in run_sql
    assert "completed_count = %(completed_count)s" in run_sql
    assert run_params["status"] == "FAILED"
    assert run_params["completed_count"] == 0
    assert run_params["error_message"] == "Dify 工作流调用失败"
    assert run_params["update_by"] == "admin@163.com"


@pytest.mark.anyio
async def test_update_auto_evaluation_progress_persists_intermediate_counts() -> None:
    cursor = FakeCursor(None)

    await _update_auto_evaluation_progress(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="task-1",
        run_id="run-1",
        sample_count=10,
        completed_count=3,
        failed_count=1,
        running_count=1,
        updated_by="admin@163.com",
    )

    task_sql, task_params = cursor.executions[0]
    run_sql, run_params = cursor.executions[1]
    assert "UPDATE pa_auto_evaluation_tasks" in task_sql
    assert task_params["status"] == "RUNNING"
    assert _jsonb_value(task_params["execution_stats"]) == {
        "pending": 5,
        "running": 1,
        "completed": 3,
        "failed": 1,
        "cancelled": 0,
    }
    assert "UPDATE pa_auto_evaluation_runs" in run_sql
    assert run_params["status"] == "RUNNING"
    assert run_params["completed_count"] == 3
    assert run_params["failed_count"] == 1


@pytest.mark.anyio
async def test_list_evaluation_report_items_returns_persisted_openjudge_details(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = SequentialCursor(
        rows_by_fetchone=[
            {"id": "project-1"},
            {"exists": 1},
            {"source_task_id": "task-1", "run_id": "run-2"},
        ],
        rows_by_fetchall=[
            [
                {
                    "id": "item-1",
                    "source_id": "dataset-item-1",
                    "trace_id": "trace-1",
                    "observation_id": None,
                    "input": {"conversation": [{"role": "user", "content": "我不吃花生"}]},
                    "output": {
                        "provider": "OPENJUDGE",
                        "runner": "GradingRunner",
                        "grader": "context_memory",
                        "graderResult": {
                            "score": 5,
                            "reason": "正确记住用户不吃花生",
                        },
                    },
                    "expected_output": {"memory": "不吃花生"},
                    "scores": [
                        {
                            "name": "openjudge_context_memory_score",
                            "value": 1.0,
                            "provider": "OPENJUDGE",
                            "runner": "GradingRunner",
                            "grader": "context_memory",
                        }
                    ],
                    "reason": "正确记住用户不吃花生",
                    "status": "COMPLETED",
                    "extra": {"resultType": "normal"},
                    "result_type": "normal",
                    "execution_status": "COMPLETED",
                    "dataset_flowback_status": "NONE",
                    "score_summary": "openjudge_context_memory_score=1",
                }
            ]
        ],
    )

    async def fake_connect(settings):
        return FakeConnection(cursor)

    class FakeReportScoreReader:
        def __init__(self, settings):
            pass

        async def list_scores_by_queue(
            self,
            project_id: str,
            queue_id: str,
            *,
            run_id: str | None = None,
        ):
            return []

    monkeypatch.setattr(auto_evaluations, "_connect", fake_connect)
    monkeypatch.setattr(
        auto_evaluations,
        "LangfuseClickHouseReader",
        FakeReportScoreReader,
    )

    response = await auto_evaluations.list_evaluation_report_items(
        project_id="project-1",
        report_id="report-1",
        page=1,
        page_size=10,
        keyword="花生",
        current_user=_override_current_user(),
        settings=auto_evaluations.Settings(),
    )

    assert response["data"]["total"] == 1
    item = response["data"]["datas"][0]
    assert item["reason"] == "正确记住用户不吃花生"
    assert item["input"]["conversation"][0]["content"] == "我不吃花生"
    assert item["expectedOutput"] == {"memory": "不吃花生"}
    assert item["scores"][0]["name"] == "openjudge_context_memory_score"
    assert item["rawResult"]["runner"] == "GradingRunner"
    assert item["rawResult"]["graderResult"]["reason"] == "正确记住用户不吃花生"


@pytest.mark.anyio
async def test_get_pa_evaluator_accepts_openjudge_sdk() -> None:
    cursor = FakeCursor(
        {
            "id": "evaluator-1",
            "name": "OpenJudge 评估器",
            "type": "SDK",
            "provider": "OPENJUDGE",
            "version": 1,
            "variables": ["input", "output", "expected_output"],
            "config": {"sdkPackage": "openjudge"},
        }
    )

    evaluator = await _get_pa_evaluator(
        cursor,  # type: ignore[arg-type]
        evaluator_id="evaluator-1",
        user_id="user-1",
    )

    assert evaluator["type"] == "SDK"
    assert evaluator["provider"] == "OPENJUDGE"


@pytest.mark.anyio
async def test_get_pa_evaluator_resolves_default_openjudge_for_project() -> None:
    cursor = SequentialCursor(
        rows_by_fetchone=[
            {"id": "project-1", "name": "默认项目"},
        ]
    )

    evaluator = await _get_pa_evaluator(
        cursor,  # type: ignore[arg-type]
        evaluator_id="paeval_default_openjudge",
        user_id="user-1",
        project_id="project-1",
    )

    assert evaluator["id"] == "paeval_default_openjudge"
    assert evaluator["type"] == "SDK"
    assert evaluator["provider"] == "OPENJUDGE"
    assert evaluator["config"]["sdkPackage"] == "openjudge"
    assert evaluator["output_variables"] == ["score"]
    assert "FROM pa_evaluators" not in cursor.executions[0][0]


@pytest.mark.anyio
async def test_get_pa_evaluator_resolves_default_openjudge_relevance_for_project() -> None:
    cursor = SequentialCursor(
        rows_by_fetchone=[
            {"id": "project-1", "name": "默认项目"},
        ]
    )

    evaluator = await _get_pa_evaluator(
        cursor,  # type: ignore[arg-type]
        evaluator_id="paeval_default_openjudge_relevance",
        user_id="user-1",
        project_id="project-1",
    )

    assert evaluator["id"] == "paeval_default_openjudge_relevance"
    assert evaluator["name"] == "OpenJudge 相关性评估器"
    assert evaluator["config"]["grader"] == "relevance"


@pytest.mark.anyio
async def test_get_pa_evaluator_resolves_default_openjudge_trajectory_for_project() -> None:
    cursor = SequentialCursor(
        rows_by_fetchone=[
            {"id": "project-1", "name": "默认项目"},
        ]
    )

    evaluator = await _get_pa_evaluator(
        cursor,  # type: ignore[arg-type]
        evaluator_id="paeval_default_openjudge_trajectory_accuracy",
        user_id="user-1",
        project_id="project-1",
    )

    assert evaluator["id"] == "paeval_default_openjudge_trajectory_accuracy"
    assert evaluator["name"] == "OpenJudge 工具调用轨迹评估器"
    assert evaluator["config"]["grader"] == "trajectory_accuracy"
    assert evaluator["config"]["scoreScaleMax"] == 3


def test_resolve_mapping_template_accepts_short_sample_paths() -> None:
    sample = {
        "input": {"question": "问题"},
        "output": "回答",
        "expectedOutput": "期望",
    }

    assert _resolve_mapping_template("input.question", sample) == "问题"
    assert _resolve_mapping_template("{input.question}", sample) == "问题"
    assert _resolve_mapping_template("{{ input.question }}", sample) == "问题"


@pytest.mark.anyio
async def test_run_openjudge_evaluator_uses_default_eval_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[dict] = []

    class FakeAsyncClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            self.kwargs = kwargs

        async def __aenter__(self) -> "FakeAsyncClient":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def post(self, url: str, **kwargs: object) -> httpx.Response:
            requests.append({"url": url, **kwargs})
            request = httpx.Request("POST", "https://llm.example.com/v1/chat/completions")
            return httpx.Response(
                200,
                request=request,
                json={
                    "choices": [
                        {
                            "message": {
                                "content": (
                                    '{"score":0.83,"passed":true,'
                                    '"reason":"回答覆盖关键退款路径"}'
                                )
                            }
                        }
                    ],
                    "usage": {"prompt_tokens": 12, "completion_tokens": 8},
                },
            )

    monkeypatch.setattr(auto_evaluations.httpx, "AsyncClient", FakeAsyncClient)

    result = await _run_openjudge_evaluator(
        {
            "id": "evaluator-1",
            "provider": "OPENJUDGE",
            "type": "SDK",
            "variables": ["input", "output", "expected_output", "context"],
            "config": {"sdkPackage": "openjudge"},
            "output_variables": ["score"],
        },
        {"input": "怎么退款？", "output": "订单页申请退款"},
        auto_evaluations.Settings(pa_eval_api_timeout=1),
        {
            "adapter": "openai",
            "provider": "OpenAI",
            "model": "gpt-4o-mini",
            "temperature": "0.2",
            "secretKey": "plain-secret",
            "baseUrl": "https://llm.example.com/v1",
        },
        {"score": {"scoreConfigName": "回答质量"}},
    )

    assert result["score"] == 0.83
    assert result["passed"] is True
    assert result["reason"] == "回答覆盖关键退款路径"
    assert requests[0]["url"] == "https://llm.example.com/v1/chat/completions"
    assert requests[0]["headers"]["Authorization"] == "Bearer plain-secret"
    assert requests[0]["json"]["model"] == "gpt-4o-mini"
    assert requests[0]["json"]["temperature"] == 0.2
    assert "怎么退款？" in requests[0]["json"]["messages"][1]["content"]


@pytest.mark.anyio
async def test_run_openjudge_batch_evaluator_uses_grading_runner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runner_calls: list[dict] = []

    class FakeGraderScore:
        def __init__(self, name: str, score: float, reason: str) -> None:
            self.name = name
            self.score = score
            self.reason = reason
            self.metadata = {"source": "fake-runner"}

        def model_dump(self) -> dict:
            return {
                "name": self.name,
                "score": self.score,
                "reason": self.reason,
                "metadata": self.metadata,
            }

    class FakeRunner:
        async def arun(self, dataset: list[dict]) -> dict:
            runner_calls.append({"dataset": dataset})
            return {
                "correctness": [
                    FakeGraderScore("correctness", 5, "完全符合预期"),
                    FakeGraderScore("correctness", 2, "缺少关键步骤"),
                ]
            }

    def fake_build_runner(evaluator: dict, settings, default_eval_model: dict):
        runner_calls.append(
            {
                "model": default_eval_model["model"],
                "sdkPackage": evaluator["config"]["sdkPackage"],
            }
        )
        return FakeRunner(), "correctness", 3

    monkeypatch.setattr(
        auto_evaluations,
        "_build_openjudge_grading_runner",
        fake_build_runner,
    )

    results, failed_count, error_messages = await _run_openjudge_batch_evaluator(
        {
            "id": "evaluator-1",
            "provider": "OPENJUDGE",
            "type": "SDK",
            "variables": ["input", "output", "expected_output", "context"],
            "config": {"sdkPackage": "openjudge"},
            "output_variables": ["score"],
        },
        [
            {
                "id": "sample-1",
                "input": {"input": "怎么退款？", "output": "订单页申请退款"},
            },
            {
                "id": "sample-2",
                "input": {"input": "怎么退货？", "output": "联系客服"},
            },
        ],
        CreateAutoEvaluationPayload.model_validate(
            {
                "name": "OpenJudge 批量评测",
                "scoreName": "score",
                "scoreMapping": {"score": {"scoreConfigName": "回答质量"}},
                "evaluatorId": "evaluator-1",
            }
        ),
        auto_evaluations.Settings(),
        {
            "adapter": "openai",
            "provider": "OpenAI",
            "model": "gpt-4o-mini",
            "temperature": "0.2",
            "secretKey": "plain-secret",
            "baseUrl": "https://llm.example.com/v1",
        },
    )

    assert failed_count == 0
    assert error_messages == []
    assert runner_calls[0] == {"model": "gpt-4o-mini", "sdkPackage": "openjudge"}
    assert runner_calls[1]["dataset"] == [
            {
                "input": "怎么退款？",
                "output": "订单页申请退款",
                "expected_output": "",
                "query": "怎么退款？",
                "response": "订单页申请退款",
                "reference_response": "",
                "context": "",
                "instruction": "怎么退款？",
                "history": [],
                "messages": [],
            },
            {
                "input": "怎么退货？",
                "output": "联系客服",
                "expected_output": "",
                "query": "怎么退货？",
                "response": "联系客服",
                "reference_response": "",
                "context": "",
                "instruction": "怎么退货？",
                "history": [],
                "messages": [],
        },
    ]
    assert [item["score"] for item in results] == [1.0, 0.4]
    assert [item["passed"] for item in results] == [True, False]
    assert results[0]["raw"]["runner"] == "GradingRunner"
    assert results[0]["raw"]["scoreScale"] == {"min": 1, "max": 5}
    assert "plain-secret" not in str(results)


@pytest.mark.anyio
async def test_run_openjudge_batch_evaluator_maps_conversation_history_alias(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runner_calls: list[dict] = []
    conversation = [
        {"role": "user", "content": "我要 200 元以内的车票"},
        {"role": "assistant", "content": "我会优先找 200 元以内的班次"},
        {"role": "user", "content": "最好下午 6 点前到"},
    ]

    class FakeRunner:
        async def arun(self, dataset: list[dict]) -> dict:
            runner_calls.append({"dataset": dataset})
            return {
                "context_memory": [
                    {
                        "name": "context_memory",
                        "score": 5,
                        "reason": "正确使用了历史约束",
                    }
                ]
            }

    def fake_build_runner(evaluator: dict, settings, default_eval_model: dict):
        return FakeRunner(), "context_memory", 3, 5

    monkeypatch.setattr(
        auto_evaluations,
        "_build_openjudge_grading_runner",
        fake_build_runner,
    )

    evaluator = auto_evaluations.default_openjudge_evaluator_for_run(
        "project-1",
        "paeval_default_openjudge_context_memory",
    )
    results, failed_count, error_messages = await _run_openjudge_batch_evaluator(
        evaluator,
        [
            {
                "id": "sample-1",
                "input": {
                    "conversation": conversation,
                    "input": "推荐 G7315 可以吗？",
                    "output": "可以，G7315 票价 180 元并且 17:40 到达。",
                },
            }
        ],
        CreateAutoEvaluationPayload.model_validate(
            {
                "name": "OpenJudge 多轮评测",
                "scoreName": "score",
                "evaluatorId": "paeval_default_openjudge_context_memory",
            }
        ),
        auto_evaluations.Settings(),
        {
            "adapter": "openai",
            "provider": "OpenAI",
            "model": "gpt-4o-mini",
            "secretKey": "plain-secret",
        },
    )

    assert failed_count == 0
    assert error_messages == []
    assert results[0]["reason"] == "正确使用了历史约束"
    assert runner_calls[0]["dataset"][0]["history"] == conversation
    assert runner_calls[0]["dataset"][0]["messages"] == conversation


@pytest.mark.anyio
async def test_run_openjudge_batch_evaluator_maps_trajectory_messages_alias(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runner_calls: list[dict] = []
    trajectory = [
        {"role": "user", "content": "查一下明天上海天气"},
        {
            "role": "assistant",
            "tool_calls": [{"function": {"name": "weather", "arguments": "{}"}}],
        },
        {"role": "tool", "content": "小雨，12 度"},
        {"role": "assistant", "content": "明天小雨，不建议晨跑。"},
    ]

    class FakeRunner:
        async def arun(self, dataset: list[dict]) -> dict:
            runner_calls.append({"dataset": dataset})
            return {
                "trajectory_accuracy": [
                    {
                        "name": "trajectory_accuracy",
                        "score": 3,
                        "reason": "正确调用天气工具",
                    }
                ]
            }

    def fake_build_runner(evaluator: dict, settings, default_eval_model: dict):
        return FakeRunner(), "trajectory_accuracy", 2, 3

    monkeypatch.setattr(
        auto_evaluations,
        "_build_openjudge_grading_runner",
        fake_build_runner,
    )

    evaluator = auto_evaluations.default_openjudge_evaluator_for_run(
        "project-1",
        "paeval_default_openjudge_trajectory_accuracy",
    )
    results, failed_count, error_messages = await _run_openjudge_batch_evaluator(
        evaluator,
        [
            {
                "id": "sample-1",
                "input": {
                    "trajectory": trajectory,
                    "input": "明天适合晨跑吗？",
                    "output": "不适合，小雨且气温低。",
                },
            }
        ],
        CreateAutoEvaluationPayload.model_validate(
            {
                "name": "OpenJudge 工具调用评测",
                "scoreName": "score",
                "evaluatorId": "paeval_default_openjudge_trajectory_accuracy",
            }
        ),
        auto_evaluations.Settings(),
        {
            "adapter": "openai",
            "provider": "OpenAI",
            "model": "gpt-4o-mini",
            "secretKey": "plain-secret",
        },
    )

    assert failed_count == 0
    assert error_messages == []
    assert results[0]["reason"] == "正确调用天气工具"
    assert runner_calls[0]["dataset"][0]["messages"] == trajectory


def test_openjudge_dataset_item_preserves_multiturn_and_trajectory_fields() -> None:
    history = [
        {"role": "user", "content": "我叫 John"},
        {"role": "assistant", "content": "好的，我记住了"},
    ]
    messages = [
        {"role": "user", "content": "查一下天气"},
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [{"function": {"name": "weather", "arguments": "{}"}}],
        },
        {"role": "tool", "content": "晴天"},
        {"role": "assistant", "content": "今天晴天"},
    ]

    item = auto_evaluations._openjudge_dataset_item(
        {
            "input": "我叫什么？",
            "output": "你叫 John",
            "history": auto_evaluations.json.dumps(history, ensure_ascii=False),
            "messages": auto_evaluations.json.dumps(messages, ensure_ascii=False),
        }
    )

    assert item["response"] == "你叫 John"
    assert item["history"] == history
    assert item["messages"] == messages


def test_openjudge_grader_output_uses_configured_score_scale() -> None:
    output = auto_evaluations._openjudge_grader_output(
        {"score": 3, "reason": "完成目标"},
        threshold=2,
        score_max=3,
    )

    assert output["score"] == 1.0
    assert output["passed"] is True
    assert output["rawScore"] == 3


@pytest.mark.anyio
async def test_get_project_default_eval_model_uses_project_model_setting() -> None:
    cursor = SequentialCursor(
        rows_by_fetchone=[
            {
                "llm_connection_id": "llm-key-1",
                "model": "gpt-4o-mini",
                "temperature": "0.1",
                "provider": "openai",
                "adapter": "openai",
                "secret_key": "plain-secret",
                "base_url": "https://llm.example.com/v1",
                "custom_models": ["fallback-model"],
                "with_default_models": True,
            }
        ]
    )

    model = await _get_project_default_eval_model(
        cursor,  # type: ignore[arg-type]
        "project-1",
        auto_evaluations.Settings(),
    )

    assert model == {
        "llmConnectionId": "llm-key-1",
        "provider": "openai",
        "adapter": "openai",
        "model": "gpt-4o-mini",
        "temperature": "0.1",
        "secretKey": "plain-secret",
        "baseUrl": "https://llm.example.com/v1",
        "withDefaultModels": True,
    }
    assert len(cursor.executions) == 1
    assert "JOIN llm_api_keys" in cursor.executions[0][0]
    assert cursor.executions[0][1]["project_id"] == "project-1"


@pytest.mark.anyio
async def test_get_project_default_eval_model_falls_back_to_langfuse_connection() -> None:
    cursor = SequentialCursor(
        rows_by_fetchone=[
            None,
            {
                "llm_connection_id": "llm-key-2",
                "model": None,
                "temperature": "0.2",
                "provider": "openai",
                "adapter": "openai",
                "secret_key": "plain-secret",
                "base_url": "https://llm.example.com/v1",
                "custom_models": ["gpt-4.1-mini"],
                "with_default_models": False,
            },
        ]
    )

    model = await _get_project_default_eval_model(
        cursor,  # type: ignore[arg-type]
        "project-1",
        auto_evaluations.Settings(),
    )

    assert model["llmConnectionId"] == "llm-key-2"
    assert model["model"] == "gpt-4.1-mini"
    assert model["secretKey"] == "plain-secret"
    assert len(cursor.executions) == 2
    assert "FROM llm_api_keys" in cursor.executions[1][0]


@pytest.mark.anyio
async def test_auto_evaluation_background_runs_openjudge_in_batch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    batch_calls = []
    progress_calls = []
    complete_calls = []
    failed_calls = []
    cursor = FakeCursor()

    async def fake_connect(settings):
        return FakeConnection(cursor)

    async def fake_get_default_model(cursor, project_id, settings):
        return {
            "adapter": "openai",
            "provider": "OpenAI",
            "model": "gpt-4o-mini",
            "secretKey": "plain-secret",
            "baseUrl": "https://llm.example.com/v1",
        }

    async def fake_batch(evaluator, samples, payload, settings, default_eval_model):
        batch_calls.append(
            {
                "evaluator": evaluator,
                "sampleIds": [sample["id"] for sample in samples],
                "model": default_eval_model["model"],
            }
        )
        return (
            [
                {
                    "sample": samples[0],
                    "normalizedSample": _normalize_dataset_item_sample(samples[0]),
                    "raw": {"runner": "GradingRunner"},
                    "score": 1.0,
                    "passed": True,
                    "reason": "ok",
                }
            ],
            0,
            [],
        )

    async def fake_persist_progress(*args, **kwargs):
        progress_calls.append(kwargs)

    async def fake_complete(cursor, **kwargs):
        complete_calls.append(kwargs)

    async def fake_mark_failed(cursor, **kwargs):
        failed_calls.append(kwargs)

    async def fail_single(*args, **kwargs):
        raise AssertionError("OpenJudge 不应走逐条执行路径")

    monkeypatch.setattr(auto_evaluations, "_connect", fake_connect)
    monkeypatch.setattr(
        auto_evaluations,
        "_get_project_default_eval_model",
        fake_get_default_model,
    )
    monkeypatch.setattr(auto_evaluations, "_run_openjudge_batch_evaluator", fake_batch)
    monkeypatch.setattr(auto_evaluations, "_run_openjudge_evaluator", fail_single)
    monkeypatch.setattr(
        auto_evaluations,
        "_persist_auto_evaluation_progress",
        fake_persist_progress,
    )
    monkeypatch.setattr(
        auto_evaluations,
        "_complete_auto_evaluation_success",
        fake_complete,
    )
    monkeypatch.setattr(auto_evaluations, "_mark_auto_evaluation_failed", fake_mark_failed)

    samples = [
        {"id": "sample-1", "input": {"input": "怎么退款？", "output": "订单页退款"}},
    ]
    await _run_auto_evaluation_background(
        settings=auto_evaluations.Settings(pa_eval_api_timeout=1),
        project_id="project-1",
        task_id="task-1",
        run_id="run-1",
        payload=CreateAutoEvaluationPayload.model_validate(
            {
                "name": "OpenJudge 批量评测",
                "scoreName": "quality",
                "evaluatorId": "evaluator-1",
            }
        ),
        evaluator={
            "id": "evaluator-1",
            "type": "SDK",
            "provider": "OPENJUDGE",
            "variables": ["input", "output"],
            "config": {"sdkPackage": "openjudge"},
        },
        samples=samples,
        data_source={"name": "trace-filter"},
        updated_by="admin@163.com",
    )

    assert batch_calls == [
        {
            "evaluator": {
                "id": "evaluator-1",
                "type": "SDK",
                "provider": "OPENJUDGE",
                "variables": ["input", "output"],
                "config": {"sdkPackage": "openjudge"},
            },
            "sampleIds": ["sample-1"],
            "model": "gpt-4o-mini",
        }
    ]
    assert failed_calls == []
    assert len(complete_calls) == 1
    assert complete_calls[0]["results"][0]["raw"]["runner"] == "GradingRunner"
    assert progress_calls[0]["running_count"] == 1
    assert progress_calls[-1]["completed_count"] == 1
