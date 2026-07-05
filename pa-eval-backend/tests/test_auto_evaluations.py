import pytest

from app.auto_evaluations import (
    _build_dify_inputs_from_dataset_item,
    _build_workflow_inputs,
    _build_workflow_headers,
    _ensure_report_exists,
    _get_path_value,
    _get_pa_evaluator,
    _insert_running_auto_evaluation,
    _list_trace_generation_samples,
    _normalize_dataset_item_sample,
    _to_trace_generation_sample,
    _parse_workflow_result,
    _resolve_mapping_template,
    _mark_auto_evaluation_failed,
    _sample_dataset_items,
    _soft_delete_auto_evaluation_task,
)
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

    async def fetchone(self):
        return self.row

    async def fetchall(self):
        return self.rows


def _jsonb_value(value):
    return getattr(value, "obj", value)


@pytest.mark.anyio
async def test_soft_delete_auto_evaluation_task_hides_task_and_reports() -> None:
    cursor = FakeCursor({"id": "task-1"})

    await _soft_delete_auto_evaluation_task(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="task-1",
    )

    task_sql, task_params = cursor.executions[0]
    report_sql, report_params = cursor.executions[1]
    assert "UPDATE pa_auto_evaluation_tasks" in task_sql
    assert "deleted_at = NOW()" in task_sql
    assert "AND deleted_at IS NULL" in task_sql
    assert task_params == {"project_id": "project-1", "task_id": "task-1"}
    assert "UPDATE pa_evaluation_reports" in report_sql
    assert "source_task_id = %(task_id)s" in report_sql
    assert report_params == {"project_id": "project-1", "task_id": "task-1"}


@pytest.mark.anyio
async def test_ensure_report_exists_ignores_soft_deleted_reports() -> None:
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
    assert "deleted_at IS NULL" in cursor.sql


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
async def test_list_trace_generation_samples_queries_last_generation_with_filters() -> None:
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


@pytest.mark.anyio
async def test_insert_running_auto_evaluation_returns_before_report_generation() -> None:
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
        created_by="admin@163.com",
        now=None,
    )

    task_sql, task_params = cursor.executions[0]
    run_sql, run_params = cursor.executions[1]
    assert "INSERT INTO pa_auto_evaluation_tasks" in task_sql
    assert task_params["status"] == "RUNNING"
    assert task_params["latest_report_id"] is None
    assert _jsonb_value(task_params["execution_stats"]) == {
        "pending": 10,
        "running": 0,
        "completed": 0,
        "failed": 0,
        "cancelled": 0,
    }
    assert "INSERT INTO pa_auto_evaluation_runs" in run_sql
    assert run_params["status"] == "RUNNING"
    assert run_params["sample_count"] == 10
    assert run_params["ended_at"] is None


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
    )

    task_sql, task_params = cursor.executions[0]
    run_sql, run_params = cursor.executions[1]
    assert "UPDATE pa_auto_evaluation_tasks" in task_sql
    assert task_params["status"] == "FAILED"
    assert _jsonb_value(task_params["execution_stats"])["failed"] == 10
    assert "UPDATE pa_auto_evaluation_runs" in run_sql
    assert run_params["status"] == "FAILED"
    assert run_params["error_message"] == "Dify 工作流调用失败"
