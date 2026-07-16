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
    _ensure_report_exists,
    _get_path_value,
    _get_pa_evaluator,
    _insert_running_auto_evaluation,
    _list_trace_generation_samples,
    _normalize_dataset_item_sample,
    _to_trace_generation_sample,
    _parse_workflow_result,
    _preview_report_flowback,
    _resolve_mapping_template,
    _resolve_auto_evaluation_samples,
    _run_auto_evaluation_background,
    _trace_time_range_condition,
    _mark_auto_evaluation_failed,
    _update_auto_evaluation_progress,
    _sample_dataset_items,
    _delete_auto_evaluation_task,
    _to_report_badcase,
    AutoEvaluationBadcaseConfig,
    CreateAutoEvaluationPayload,
    EvaluationReportFlowbackPayload,
)
from app.auth_context import get_current_user_context
from app.langfuse_clickhouse import LangfuseClickHouseReader
from app.main import app
import app.auto_evaluations as auto_evaluations
from app.errors import BusinessError


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


class FakeLangfuseScoreClient:
    def __init__(self) -> None:
        self.created_scores = []

    async def create_score(self, public_key: str, secret_key: str, payload: dict):
        self.created_scores.append((public_key, secret_key, payload))
        return {"id": payload["id"]}


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
async def test_list_trace_generation_samples_queries_custom_created_at_range() -> (
    None
):
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
    assert "t.timestamp <= %(created_at_to)s::timestamptz" in cursor.sql
    assert cursor.params["created_at_from"] == "2026-07-05T00:00"
    assert cursor.params["created_at_to"] == "2026-07-08T00:00"


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
    badcase_sql, badcase_params = cursor.executions[3]
    assert "report_template_id" in report_sql
    assert "report_template_snapshot" in report_sql
    assert report_params["report_template_id"] == "template-1"
    assert _jsonb_value(report_params["report_template_snapshot"])["name"] == "严格报告"
    assert report_params["title"].endswith("自定义报告")
    assert _jsonb_value(report_params["recommendations"]) == []
    assert "INSERT INTO pa_evaluation_report_badcases" in badcase_sql
    assert badcase_params["score_value"] == 0.5


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
    monkeypatch.setattr(auto_evaluations, "_mark_auto_evaluation_failed", fake_mark_failed)

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
