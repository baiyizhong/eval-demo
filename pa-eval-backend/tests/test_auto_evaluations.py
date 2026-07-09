from datetime import datetime, timezone

import httpx
import pytest

from app.auth_context import CurrentUserContext
from app.auto_evaluations import (
    _build_dify_inputs_from_dataset_item,
    _build_report_from_template,
    _build_workflow_inputs,
    _build_workflow_headers,
    _complete_auto_evaluation_success,
    _create_report_flowback,
    _count_trace_generation_samples,
    _ensure_report_exists,
    _fetch_task,
    _get_path_value,
    _get_pa_evaluator,
    _insert_scheduled_auto_evaluation,
    _insert_running_auto_evaluation,
    _insert_rerun_auto_evaluation,
    _list_due_auto_evaluation_schedules,
    _list_trace_generation_samples,
    _normalize_dataset_item_sample,
    _pause_auto_evaluation_schedule,
    _start_auto_evaluation_schedule,
    _to_trace_generation_sample,
    _to_task,
    _to_run,
    _parse_workflow_result,
    _preview_report_flowback,
    _resolve_mapping_template,
    _resolve_auto_evaluation_samples,
    _trace_time_range_condition,
    _mark_auto_evaluation_failed,
    _update_auto_evaluation_progress,
    _sample_dataset_items,
    _delete_auto_evaluation_task,
    rerun_auto_evaluation,
    count_trace_generation_samples,
    create_auto_evaluation,
    CreateAutoEvaluationPayload,
    EvaluationReportFlowbackPayload,
    TraceCountPayload,
)
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

    async def fetchone(self):
        if self.rows_by_fetchone:
            return self.rows_by_fetchone.pop(0)
        return None

    async def fetchall(self):
        if self.rows_by_fetchall:
            return self.rows_by_fetchall.pop(0)
        return []


class FakeCursorContext:
    def __init__(self, cursor):
        self.cursor = cursor

    async def __aenter__(self):
        return self.cursor

    async def __aexit__(self, exc_type, exc, tb):
        return None


class FakeConnection:
    def __init__(self, cursor):
        self.cursor_instance = cursor

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    def cursor(self):
        return FakeCursorContext(self.cursor_instance)


class FakeBackgroundTasks:
    def __init__(self):
        self.tasks = []

    def add_task(self, *args, **kwargs):
        self.tasks.append((args, kwargs))


class FakeTraceReader:
    def __init__(self, total: int = 0) -> None:
        self.total = total
        self.project_id = None
        self.kwargs = None

    async def count_traces(self, project_id: str, **kwargs):
        self.project_id = project_id
        self.kwargs = kwargs
        return self.total


def _jsonb_value(value):
    return getattr(value, "obj", value)


def test_to_task_maps_schedule_metadata() -> None:
    task = _to_task(
        {
            "id": "task-1",
            "project_id": "project-1",
            "name": "每日评测",
            "description": "daily",
            "score_name": "quality",
            "status": "READY",
            "evaluator_id": "eval-1",
            "evaluator_name": "Dify 评分器",
            "evaluator_type": "WORKFLOW",
            "evaluator_version": "v1",
            "data_source": {"type": "TRACE_FILTER", "name": "Trace", "sampleCount": 10},
            "sample_rate": 100,
            "execution_stats": {"completed": 0, "failed": 0},
            "badcase_count": 0,
            "create_by": "admin@163.com",
            "create_date": datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
            "last_run_at": None,
            "update_date": datetime(2026, 7, 9, 1, 5, tzinfo=timezone.utc),
            "schedule_status": "ACTIVE",
            "cron_expression": "0 1 * * *",
            "schedule_timezone": "Asia/Shanghai",
            "next_run_at": datetime(2026, 7, 10, 1, 0, tzinfo=timezone.utc),
            "last_scheduled_at": datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
            "window_config": {"mode": "previous_day", "startHour": 0, "endHour": 0},
            "retry_policy": {"maxAttempts": 3, "backoffMinutes": [10, 30, 60]},
        }
    )

    assert task["runMode"] == "SCHEDULED"
    assert task["schedule"] == {
        "status": "ACTIVE",
        "frequency": "DAILY",
        "cronExpression": "0 1 * * *",
        "timezone": "Asia/Shanghai",
        "nextRunAt": "2026-07-10T01:00:00.000Z",
        "lastScheduledAt": "2026-07-09T01:00:00.000Z",
        "window": {"mode": "previous_day", "startHour": 0, "endHour": 0},
        "retry": {"maxAttempts": 3, "backoffMinutes": [10, 30, 60]},
    }


def test_to_task_defaults_immediate_without_schedule_columns() -> None:
    task = _to_task(
        {
            "id": "task-1",
            "project_id": "project-1",
            "name": "手动评测",
            "description": "",
            "score_name": "quality",
            "status": "READY",
            "evaluator_id": "eval-1",
            "evaluator_name": "Dify 评分器",
            "evaluator_type": "WORKFLOW",
            "evaluator_version": "v1",
            "data_source": {},
            "sample_rate": 100,
            "execution_stats": {},
            "badcase_count": 0,
            "create_by": "admin@163.com",
            "create_date": datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
            "last_run_at": None,
            "update_date": datetime(2026, 7, 9, 1, 5, tzinfo=timezone.utc),
        }
    )

    assert task["runMode"] == "IMMEDIATE"
    assert task["schedule"] is None
    assert task["dataSource"] == {
        "type": "TRACE_FILTER",
        "name": "Trace 过滤",
        "sampleCount": 0,
    }
    assert task["executionStats"] == {
        "pending": 0,
        "running": 0,
        "completed": 0,
        "failed": 0,
        "cancelled": 0,
    }


def test_to_task_normalizes_empty_schedule_json_defaults() -> None:
    task = _to_task(
        {
            "id": "task-1",
            "project_id": "project-1",
            "name": "每日评测",
            "description": "",
            "score_name": "quality",
            "status": "DRAFT",
            "evaluator_id": "eval-1",
            "evaluator_name": "Dify 评分器",
            "evaluator_type": "WORKFLOW",
            "evaluator_version": "v1",
            "data_source": {},
            "sample_rate": 100,
            "execution_stats": {},
            "badcase_count": 0,
            "create_by": "admin@163.com",
            "create_date": datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
            "last_run_at": None,
            "update_date": datetime(2026, 7, 9, 1, 5, tzinfo=timezone.utc),
            "schedule_status": "DRAFT",
            "cron_expression": "0 1 * * *",
            "schedule_timezone": "Asia/Shanghai",
            "next_run_at": None,
            "last_scheduled_at": None,
            "window_config": {},
            "retry_policy": {},
        }
    )

    assert task["runMode"] == "SCHEDULED"
    assert task["schedule"]["window"] == {
        "mode": "previous_day",
        "startHour": 0,
        "endHour": 0,
    }
    assert task["schedule"]["retry"] == {
        "maxAttempts": 3,
        "backoffMinutes": [10, 30, 60],
    }
    assert task["dataSource"]["sampleCount"] == 0
    assert task["executionStats"]["completed"] == 0
    assert task["executionStats"]["failed"] == 0


def test_to_run_maps_schedule_run_metadata() -> None:
    run = _to_run(
        {
            "id": "run-1",
            "project_id": "project-1",
            "task_id": "task-1",
            "status": "COMPLETED",
            "trigger_source": "SCHEDULED",
            "window_start": datetime(2026, 7, 8, 0, 0, tzinfo=timezone.utc),
            "window_end": datetime(2026, 7, 9, 0, 0, tzinfo=timezone.utc),
            "scheduled_fire_at": datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
            "attempt_no": 2,
            "parent_run_id": "run-parent",
            "sample_count": 10,
            "completed_count": 10,
            "failed_count": 0,
            "badcase_count": 1,
            "started_at": datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
            "ended_at": datetime(2026, 7, 9, 1, 2, tzinfo=timezone.utc),
            "duration_text": "2 分 0 秒",
            "error_message": None,
        }
    )

    assert run["triggerSource"] == "SCHEDULED"
    assert run["windowStart"] == "2026-07-08T00:00:00.000Z"
    assert run["windowEnd"] == "2026-07-09T00:00:00.000Z"
    assert run["scheduledFireAt"] == "2026-07-09T01:00:00.000Z"
    assert run["attemptNo"] == 2
    assert run["parentRunId"] == "run-parent"


@pytest.mark.anyio
async def test_fetch_task_joins_schedule_metadata(monkeypatch) -> None:
    task_row = {
        "id": "task-1",
        "project_id": "project-1",
        "name": "每日评测",
        "description": "daily",
        "score_name": "quality",
        "status": "READY",
        "evaluator_id": "eval-1",
        "evaluator_name": "Dify 评分器",
        "evaluator_type": "WORKFLOW",
        "evaluator_version": "v1",
        "data_source": {"type": "TRACE_FILTER", "name": "Trace", "sampleCount": 10},
        "sample_rate": 100,
        "execution_stats": {"completed": 0, "failed": 0},
        "badcase_count": 0,
        "create_by": "admin@163.com",
        "create_date": datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
        "last_run_at": None,
        "update_date": datetime(2026, 7, 9, 1, 5, tzinfo=timezone.utc),
        "latest_report_id": None,
        "schedule_status": "ACTIVE",
        "cron_expression": "0 1 * * *",
        "schedule_timezone": "Asia/Shanghai",
        "next_run_at": datetime(2026, 7, 10, 1, 0, tzinfo=timezone.utc),
        "last_scheduled_at": None,
        "window_config": {"mode": "previous_day", "startHour": 0, "endHour": 0},
        "retry_policy": {"maxAttempts": 3, "backoffMinutes": [10, 30, 60]},
    }
    cursor = SequentialCursor(
        rows_by_fetchone=[
            {"id": "project-1", "name": "项目"},
            task_row,
        ]
    )

    async def fake_connect(settings):
        return FakeConnection(cursor)

    monkeypatch.setattr(auto_evaluations, "_connect", fake_connect)

    task = await _fetch_task(
        project_id="project-1",
        task_id="task-1",
        user_id="user-1",
        settings=object(),  # type: ignore[arg-type]
    )

    task_sql, task_params = cursor.executions[1]
    assert "LEFT JOIN pa_auto_evaluation_schedules s" in task_sql
    assert "s.status AS schedule_status" in task_sql
    assert "s.timezone AS schedule_timezone" in task_sql
    assert task_params == {"project_id": "project-1", "task_id": "task-1"}
    assert task["runMode"] == "SCHEDULED"
    assert task["schedule"]["status"] == "ACTIVE"
    assert task["schedule"]["frequency"] == "DAILY"
    assert task["schedule"]["cronExpression"] == "0 1 * * *"


@pytest.mark.anyio
async def test_delete_auto_evaluation_task_physically_deletes_task_and_reports() -> (
    None
):
    cursor = SequentialCursor(rows_by_fetchone=[{"id": "task-1"}])

    await _delete_auto_evaluation_task(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="task-1",
    )

    task_sql, task_params = cursor.executions[0]
    report_sql, report_params = cursor.executions[1]
    assert "DELETE FROM pa_auto_evaluation_tasks" in task_sql
    assert "NOT EXISTS" in task_sql
    assert "FROM pa_auto_evaluation_runs r" in task_sql
    assert "r.status IN ('PENDING', 'RUNNING')" in task_sql
    assert "RETURNING id" in task_sql
    assert task_params == {"project_id": "project-1", "task_id": "task-1"}
    assert "DELETE FROM pa_evaluation_reports" in report_sql
    assert "source_task_id = %(task_id)s" in report_sql
    assert report_params == {"project_id": "project-1", "task_id": "task-1"}


@pytest.mark.anyio
async def test_delete_auto_evaluation_task_rejects_active_run() -> None:
    cursor = SequentialCursor(rows_by_fetchone=[None, {"active_count": 1}])

    with pytest.raises(BusinessError) as exc:
        await _delete_auto_evaluation_task(
            cursor,  # type: ignore[arg-type]
            project_id="project-1",
            task_id="task-1",
        )

    assert exc.value.code == 4009
    assert exc.value.status_code == 409
    assert exc.value.message == "任务正在运行中，无法删除"
    assert len(cursor.executions) == 2
    assert "NOT EXISTS" in cursor.executions[0][0]
    assert "FROM pa_auto_evaluation_runs" in cursor.executions[1][0]


@pytest.mark.anyio
async def test_start_schedule_sets_active_and_next_run_at() -> None:
    cursor = SequentialCursor(
        rows_by_fetchone=[
            {"cron_expression": "0 1 * * *", "timezone": "Asia/Shanghai"},
            {"id": "schedule-1"},
        ]
    )
    now = datetime(2026, 7, 9, 0, 0, tzinfo=timezone.utc)

    await _start_auto_evaluation_schedule(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="task-1",
        user_id="admin@163.com",
        now=now,
    )

    select_sql, select_params = cursor.executions[0]
    update_sql, update_params = cursor.executions[1]
    assert "SELECT cron_expression, timezone" in select_sql
    assert select_params == {"project_id": "project-1", "task_id": "task-1"}
    assert "UPDATE pa_auto_evaluation_schedules" in update_sql
    assert "status = 'ACTIVE'" in update_sql
    assert "next_run_at = %(next_run_at)s" in update_sql
    assert "RETURNING id" in update_sql
    assert update_params == {
        "project_id": "project-1",
        "task_id": "task-1",
        "next_run_at": datetime(
            2026,
            7,
            10,
            1,
            0,
            tzinfo=update_params["next_run_at"].tzinfo,
        ),
        "update_by": "admin@163.com",
        "update_date": now,
    }
    assert update_params["next_run_at"].isoformat() == "2026-07-10T01:00:00+08:00"


@pytest.mark.anyio
async def test_start_schedule_raises_not_found_when_schedule_missing() -> None:
    cursor = SequentialCursor(rows_by_fetchone=[None])

    with pytest.raises(BusinessError) as exc:
        await _start_auto_evaluation_schedule(
            cursor,  # type: ignore[arg-type]
            project_id="project-1",
            task_id="task-1",
            user_id="admin@163.com",
            now=datetime(2026, 7, 9, 0, 0, tzinfo=timezone.utc),
        )

    assert exc.value.code == 4005
    assert exc.value.status_code == 404
    assert exc.value.message == "自动评测调度不存在"
    assert len(cursor.executions) == 1


@pytest.mark.anyio
async def test_pause_schedule_sets_paused() -> None:
    cursor = FakeCursor({"id": "schedule-1"})

    await _pause_auto_evaluation_schedule(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="task-1",
        user_id="admin@163.com",
    )

    assert "UPDATE pa_auto_evaluation_schedules" in cursor.sql
    assert "status = 'PAUSED'" in cursor.sql
    assert "RETURNING id" in cursor.sql
    assert cursor.params["project_id"] == "project-1"
    assert cursor.params["task_id"] == "task-1"
    assert cursor.params["update_by"] == "admin@163.com"
    assert isinstance(cursor.params["update_date"], datetime)


@pytest.mark.anyio
async def test_pause_schedule_raises_not_found_when_schedule_missing() -> None:
    cursor = FakeCursor(None)

    with pytest.raises(BusinessError) as exc:
        await _pause_auto_evaluation_schedule(
            cursor,  # type: ignore[arg-type]
            project_id="project-1",
            task_id="task-1",
            user_id="admin@163.com",
        )

    assert exc.value.code == 4005
    assert exc.value.status_code == 404
    assert exc.value.message == "自动评测调度不存在"
    assert "UPDATE pa_auto_evaluation_schedules" in cursor.sql


@pytest.mark.anyio
async def test_list_due_auto_evaluation_schedules_queries_active_due_schedules() -> None:
    now = datetime(2026, 7, 9, 0, 0, tzinfo=timezone.utc)
    rows = [{"id": "schedule-1", "task_id": "task-1"}]
    cursor = FakeCursor(rows=rows)

    result = await _list_due_auto_evaluation_schedules(
        cursor,  # type: ignore[arg-type]
        now,
    )

    assert result == rows
    assert "FROM pa_auto_evaluation_schedules s" in cursor.sql
    assert "JOIN pa_auto_evaluation_tasks t" in cursor.sql
    assert "s.status = 'ACTIVE'" in cursor.sql
    assert "s.next_run_at <= %(now)s" in cursor.sql
    assert "LIMIT 50" in cursor.sql
    assert "FOR UPDATE OF s SKIP LOCKED" in cursor.sql
    assert cursor.params == {"now": now}


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
async def test_auto_evaluation_clickhouse_query_disables_environment_proxy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        text = ""

        def raise_for_status(self) -> None:
            return None

    class FakeAsyncClient:
        def __init__(self, **kwargs) -> None:
            captured["client_kwargs"] = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, *args, **kwargs) -> FakeResponse:
            return FakeResponse()

    monkeypatch.setattr(auto_evaluations.httpx, "AsyncClient", FakeAsyncClient)

    await auto_evaluations._query_clickhouse_json_each_row(
        auto_evaluations.Settings(),
        "SELECT 1 FORMAT JSONEachRow",
    )

    assert captured["client_kwargs"]["trust_env"] is False


@pytest.mark.anyio
async def test_workflow_evaluator_disables_environment_proxy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200

        def json(self) -> dict[str, object]:
            return {"score": 1, "passed": True, "reason": "ok"}

    class FakeAsyncClient:
        def __init__(self, **kwargs) -> None:
            captured["client_kwargs"] = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, *args, **kwargs) -> FakeResponse:
            return FakeResponse()

    monkeypatch.setattr(auto_evaluations.httpx, "AsyncClient", FakeAsyncClient)

    await auto_evaluations._run_workflow_evaluator(
        {
            "provider": "N8N",
            "config": {
                "endpointUrl": "http://localhost/v1/workflows/run",
                "authType": "BEARER",
                "authToken": "token",
            },
        },
        {"input": "ping"},
        auto_evaluations.Settings(),
    )

    assert captured["client_kwargs"]["trust_env"] is False


@pytest.mark.anyio
async def test_dify_evaluator_disables_environment_proxy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200

        def json(self) -> dict[str, object]:
            return {
                "data": {
                    "outputs": {
                        "score": 1,
                        "passed": True,
                        "reason": "ok",
                    }
                }
            }

    class FakeAsyncClient:
        def __init__(self, **kwargs) -> None:
            captured["client_kwargs"] = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, *args, **kwargs) -> FakeResponse:
            return FakeResponse()

    monkeypatch.setattr(auto_evaluations.httpx, "AsyncClient", FakeAsyncClient)

    await auto_evaluations._run_dify_evaluator(
        {
            "config": {
                "endpointUrl": "http://localhost/v1/workflows/run",
                "authToken": "token",
            },
        },
        {"input": "ping"},
        auto_evaluations.Settings(),
    )

    assert captured["client_kwargs"]["trust_env"] is False


@pytest.mark.anyio
async def test_count_trace_endpoint_counts_all_clickhouse_traces_with_preview_filters(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = SequentialCursor(rows_by_fetchone=[{"id": "project-1", "name": "项目"}])
    trace_reader = FakeTraceReader(total=48)

    async def fake_connect(settings):
        return FakeConnection(cursor)

    monkeypatch.setattr(auto_evaluations, "_connect", fake_connect)

    response = await count_trace_generation_samples(
        "project-1",
        TraceCountPayload.model_validate(
            {
                "traceFilter": {
                    "type": "TRACE_FILTER",
                    "timeRange": "",
                    "createdAtRange": [
                        "2026-07-06T13:51",
                        "2026-07-09T13:51",
                    ],
                    "userId": "user-1",
                    "sessionId": "session-1",
                    "environments": ["default"],
                },
            }
        ),
        CurrentUserContext(user_id="user-1", email="admin@163.com"),
        object(),  # type: ignore[arg-type]
        trace_reader,  # type: ignore[arg-type]
    )

    assert response["data"]["count"] == 48
    assert trace_reader.project_id == "project-1"
    assert trace_reader.kwargs == {
        "keyword": None,
        "statuses": None,
        "environments": ["default"],
        "session_id": "session-1",
        "user_id": "user-1",
        "latency_min": None,
        "latency_max": None,
        "metadata_key": None,
        "metadata_value": None,
        "metadata_filters": None,
        "created_at_range": ["2026-07-06T13:51", "2026-07-09T13:51"],
        "time_range": None,
    }


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
async def test_list_trace_generation_samples_keeps_traces_without_generation() -> None:
    cursor = FakeCursor(
        rows=[
            {
                "trace_id": "trace-1",
                "project_id": "project-1",
                "trace_input": '{"input":"用户问题"}',
                "trace_output": '{"output":"候选回答"}',
                "trace_metadata": {"context": "业务上下文"},
                "observation_id": None,
                "observation_input": None,
                "observation_output": None,
                "observation_metadata": None,
            }
        ]
    )

    samples = await _list_trace_generation_samples(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        data_source_payload={"timeRange": "3d"},
    )

    assert len(samples) == 1
    assert "LEFT JOIN observations o" in cursor.sql
    assert "AND o.type = 'GENERATION'" in cursor.sql
    assert samples[0]["input"] == {
        "input": "用户问题",
        "output": "候选回答",
        "context": "业务上下文",
    }
    assert samples[0]["source_observation_id"] == ""


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
                    "expected_output": {"answer": "退款路径"},
                    "metadata": {"origin": "dataset"},
                    "score_value": 0.42,
                    "reason": "答案不完整",
                    "comment": "缺少入口说明",
                    "score_summary": "quality: 0.42",
                    "result_type": "badcase",
                },
                {
                    "source_item_id": "badcase-2",
                    "source_dataset_item_id": "dataset-item-2",
                    "source_trace_id": "trace-2",
                    "source_observation_id": "",
                    "input": {"question": "怎么改地址"},
                    "expected_output": None,
                    "metadata": {},
                    "score_value": 0.3,
                    "reason": "无效回复",
                    "comment": "",
                    "score_summary": "quality: 0.30",
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
                    "expected_output": {"answer": "退款路径"},
                    "metadata": {"origin": "dataset"},
                    "score_value": 0.42,
                    "reason": "答案不完整",
                    "comment": "缺少入口说明",
                    "score_summary": "quality: 0.42",
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
    assert "trigger_source" in run_sql
    assert "window_start" in run_sql
    assert "window_end" in run_sql
    assert "scheduled_fire_at" in run_sql
    assert "attempt_no" in run_sql
    assert "parent_run_id" in run_sql
    assert "run_config_snapshot" in run_sql
    assert "create_by" in run_sql
    assert "create_date" in run_sql
    assert "update_by" in run_sql
    assert "update_date" in run_sql
    assert run_params["status"] == "RUNNING"
    assert run_params["sample_count"] == 10
    assert run_params["trigger_source"] == "MANUAL"
    assert run_params["window_start"] is None
    assert run_params["window_end"] is None
    assert run_params["scheduled_fire_at"] is None
    assert run_params["attempt_no"] == 1
    assert run_params["parent_run_id"] is None
    assert _jsonb_value(run_params["run_config_snapshot"]) == {}
    assert run_params["ended_at"] is None
    assert run_params["create_by"] == "admin@163.com"
    assert run_params["update_by"] == "admin@163.com"


@pytest.mark.anyio
async def test_insert_scheduled_auto_evaluation_creates_task_and_schedule_only() -> None:
    cursor = FakeCursor(None)

    payload = CreateAutoEvaluationPayload.model_validate(
        {
            "name": "每日客服评测",
            "scoreName": "quality",
            "evaluatorId": "evaluator-1",
            "runMode": "SCHEDULED",
            "sampleRate": 50,
            "dataSource": {
                "type": "TRACE_FILTER",
                "traceFilter": {"traceName": "chat"},
            },
            "schedule": {
                "executionHour": 3,
                "timezone": "Asia/Shanghai",
                "window": {"mode": "previous_day", "startHour": 0, "endHour": 0},
                "retry": {"maxAttempts": 2, "backoffMinutes": [15]},
            },
        }
    )

    await _insert_scheduled_auto_evaluation(
        cursor,  # type: ignore[arg-type]
        task_id="task-1",
        schedule_id="schedule-1",
        project_id="project-1",
        payload=payload,
        evaluator={
            "id": "evaluator-1",
            "name": "Dify 评估器",
            "type": "WORKFLOW",
            "version": 1,
        },
        report_template_snapshot={"id": "default", "name": "系统默认模板"},
        create_by="admin@163.com",
        now=None,
    )

    assert len(cursor.executions) == 2
    task_sql, task_params = cursor.executions[0]
    schedule_sql, schedule_params = cursor.executions[1]
    sql_text = "\n".join(sql for sql, _ in cursor.executions)
    assert "INSERT INTO pa_auto_evaluation_tasks" in task_sql
    assert "INSERT INTO pa_auto_evaluation_schedules" in schedule_sql
    assert "INSERT INTO pa_auto_evaluation_runs" not in sql_text
    assert task_params["status"] == "DRAFT"
    assert task_params["last_run_at"] is None
    assert _jsonb_value(task_params["execution_stats"]) == {
        "pending": 0,
        "running": 0,
        "completed": 0,
        "failed": 0,
        "cancelled": 0,
    }
    assert _jsonb_value(task_params["data_source"]) == payload.data_source
    assert schedule_params["status"] == "DRAFT"
    assert schedule_params["cron_expression"] == "0 3 * * *"
    assert schedule_params["timezone"] == "Asia/Shanghai"
    assert _jsonb_value(schedule_params["window_config"]) == {
        "mode": "previous_day",
        "startHour": 0,
        "endHour": 0,
    }
    assert _jsonb_value(schedule_params["retry_policy"]) == {
        "maxAttempts": 2,
        "backoffMinutes": [15],
    }


@pytest.mark.anyio
async def test_insert_scheduled_auto_evaluation_unifies_hourly_frequency_window() -> None:
    cursor = FakeCursor(None)

    payload = CreateAutoEvaluationPayload.model_validate(
        {
            "name": "小时增量评测",
            "scoreName": "quality",
            "evaluatorId": "evaluator-1",
            "runMode": "SCHEDULED",
            "dataSource": {"type": "TRACE_FILTER"},
            "schedule": {
                "frequency": "HOURLY",
                "executionHour": 3,
                "timezone": "Asia/Shanghai",
                "window": {"mode": "previous_day", "startHour": 0, "endHour": 0},
            },
        }
    )

    await _insert_scheduled_auto_evaluation(
        cursor,  # type: ignore[arg-type]
        task_id="task-1",
        schedule_id="schedule-1",
        project_id="project-1",
        payload=payload,
        evaluator={
            "id": "evaluator-1",
            "name": "Dify 评估器",
            "type": "WORKFLOW",
            "version": 1,
        },
        report_template_snapshot={"id": "default", "name": "系统默认模板"},
        create_by="admin@163.com",
        now=None,
    )

    schedule_params = cursor.executions[1][1]
    assert schedule_params["cron_expression"] == "0 * * * *"
    assert _jsonb_value(schedule_params["window_config"]) == {
        "mode": "rolling_interval",
        "intervalMinutes": 60,
    }


@pytest.mark.anyio
async def test_insert_rerun_auto_evaluation_includes_run_metadata() -> None:
    cursor = FakeCursor(None)

    await _insert_rerun_auto_evaluation(
        cursor,  # type: ignore[arg-type]
        project_id="project-1",
        task_id="task-1",
        run_id="run-2",
        evaluator_id="evaluator-1",
        sample_rate=100,
        sample_count=3,
        execution_stats={
            "pending": 3,
            "running": 0,
            "completed": 0,
            "failed": 0,
            "cancelled": 0,
        },
        data_source={"type": "TRACE_FILTER", "sampleCount": 3},
        report_template_id="default",
        report_template_snapshot={"id": "default", "name": "系统默认模板"},
        updated_by="admin@163.com",
        now=None,
        trigger_source="SCHEDULED",
        attempt_no=2,
        parent_run_id="run-1",
        run_config_snapshot={"sampleRate": 100},
    )

    run_sql, run_params = cursor.executions[1]
    assert "INSERT INTO pa_auto_evaluation_runs" in run_sql
    assert "trigger_source" in run_sql
    assert "window_start" in run_sql
    assert "window_end" in run_sql
    assert "scheduled_fire_at" in run_sql
    assert "attempt_no" in run_sql
    assert "parent_run_id" in run_sql
    assert "run_config_snapshot" in run_sql
    assert run_params["trigger_source"] == "SCHEDULED"
    assert run_params["attempt_no"] == 2
    assert run_params["parent_run_id"] == "run-1"
    assert _jsonb_value(run_params["run_config_snapshot"]) == {"sampleRate": 100}


@pytest.mark.anyio
async def test_rerun_scheduled_auto_evaluation_uses_frequency_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    task_row = {
        "id": "task-1",
        "project_id": "project-1",
        "name": "小时增量评测",
        "description": "",
        "score_name": "quality",
        "status": "READY",
        "evaluator_id": "evaluator-1",
        "evaluator_name": "Dify 评估器",
        "evaluator_type": "WORKFLOW",
        "evaluator_version": "v1",
        "data_source": {
            "type": "TRACE_FILTER",
            "createdAtRange": [],
            "sampleCount": 0,
        },
        "sample_rate": 100,
        "execution_stats": {},
        "badcase_count": 0,
        "create_by": "admin@163.com",
        "create_date": datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
        "last_run_at": None,
        "update_date": datetime(2026, 7, 9, 1, 5, tzinfo=timezone.utc),
        "latest_report_id": None,
        "report_template_id": "default",
        "report_template_snapshot": {},
        "schedule_status": "ACTIVE",
        "cron_expression": "0 * * * *",
        "schedule_timezone": "Asia/Shanghai",
        "next_run_at": None,
        "last_scheduled_at": None,
        "window_config": {"mode": "rolling_interval", "intervalMinutes": 60},
        "retry_policy": {"maxAttempts": 3, "backoffMinutes": [10, 30, 60]},
    }
    cursor = SequentialCursor(
        rows_by_fetchone=[
            {"id": "project-1", "name": "项目"},
            task_row,
            {
                "id": "evaluator-1",
                "name": "Dify 评估器",
                "type": "WORKFLOW",
                "provider": "DIFY",
                "version": 1,
                "variables": [],
                "config": {},
            },
        ]
    )
    captured = {}

    async def fake_connect(settings):
        return FakeConnection(cursor)

    async def fake_resolve_samples(cursor, project_id, payload, user_id, settings):
        created_at_range = payload.data_source["createdAtRange"]
        start = datetime.fromisoformat(created_at_range[0])
        end = datetime.fromisoformat(created_at_range[1])
        captured["minutes"] = (end - start).total_seconds() / 60
        return (
            {**payload.data_source, "sampleCount": 1},
            [{"id": "sample-1", "input": "in", "output": "out"}],
        )

    async def fake_run_background(*args, **kwargs):
        return None

    monkeypatch.setattr(auto_evaluations, "_connect", fake_connect)
    monkeypatch.setattr(
        auto_evaluations,
        "_resolve_auto_evaluation_samples",
        fake_resolve_samples,
    )
    monkeypatch.setattr(
        auto_evaluations,
        "_run_auto_evaluation_background",
        fake_run_background,
    )

    background_tasks = FakeBackgroundTasks()
    await rerun_auto_evaluation(
        "project-1",
        "task-1",
        background_tasks,  # type: ignore[arg-type]
        CurrentUserContext(user_id="user-1", email="admin@163.com"),
        object(),  # type: ignore[arg-type]
    )

    assert captured["minutes"] == 60
    run_params = next(
        params
        for sql, params in cursor.executions
        if "INSERT INTO pa_auto_evaluation_runs" in sql
    )
    assert run_params["window_start"] is not None
    assert run_params["window_end"] is not None
    assert run_params["scheduled_fire_at"] is not None


@pytest.mark.anyio
async def test_create_scheduled_auto_evaluation_does_not_resolve_samples_or_enqueue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = SequentialCursor(
        rows_by_fetchone=[
            {"id": "project-1", "name": "项目"},
            {
                "id": "evaluator-1",
                "name": "Dify 评估器",
                "type": "WORKFLOW",
                "provider": "DIFY",
                "version": 1,
                "variables": [],
                "config": {},
            },
        ]
    )
    background_tasks = FakeBackgroundTasks()

    async def fake_connect(settings):
        return FakeConnection(cursor)

    async def fail_resolve_samples(*args, **kwargs):
        raise AssertionError("scheduled creation must not resolve samples")

    monkeypatch.setattr(auto_evaluations, "_connect", fake_connect)
    monkeypatch.setattr(
        auto_evaluations,
        "_resolve_auto_evaluation_samples",
        fail_resolve_samples,
    )

    payload = CreateAutoEvaluationPayload.model_validate(
        {
            "name": "每日客服评测",
            "scoreName": "quality",
            "evaluatorId": "evaluator-1",
            "runMode": "SCHEDULED",
            "reportTemplateId": "default",
            "dataSource": {"type": "TRACE_FILTER", "traceFilter": {"tags": ["chat"]}},
        }
    )

    response = await create_auto_evaluation(
        "project-1",
        payload,
        background_tasks,  # type: ignore[arg-type]
        CurrentUserContext(user_id="user-1", email="admin@163.com"),
        object(),  # type: ignore[arg-type]
    )

    sql_text = "\n".join(sql for sql, _ in cursor.executions)
    assert response["data"]["status"] == "DRAFT"
    assert response["data"]["lastRunAt"] is None
    assert "INSERT INTO pa_auto_evaluation_tasks" in sql_text
    assert "INSERT INTO pa_auto_evaluation_schedules" in sql_text
    assert "INSERT INTO pa_auto_evaluation_runs" not in sql_text
    schedule_params = next(
        params
        for sql, params in cursor.executions
        if "INSERT INTO pa_auto_evaluation_schedules" in sql
    )
    assert schedule_params["cron_expression"] == "0 1 * * *"
    assert schedule_params["timezone"] == "Asia/Shanghai"
    assert _jsonb_value(schedule_params["window_config"]) == {
        "mode": "previous_day",
        "startHour": 0,
        "endHour": 0,
    }
    assert _jsonb_value(schedule_params["retry_policy"]) == {
        "maxAttempts": 3,
        "backoffMinutes": [10, 30, 60],
    }
    assert background_tasks.tasks == []


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
