from datetime import datetime, timezone
from typing import Any

import pytest

from app.config import Settings
import app.scheduled_jobs as scheduled_jobs
from app.scheduled_jobs import (
    ScheduledJobFrequencyPayload,
    ScheduledJobTraceWindowPayload,
    _build_due_job_claim_sql,
    _build_fire_key,
    _build_job_triggered_auto_evaluation_name,
    _compute_next_run_at,
    _compute_trace_window,
    _normalize_auto_evaluation_data_source,
    _normalize_variable_mapping,
)


class FakeCursor:
    def __init__(self) -> None:
        self.executions: list[tuple[str, dict[str, Any]]] = []
        self._next_fetchone: dict[str, Any] | None = None

    async def __aenter__(self) -> "FakeCursor":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def execute(self, sql: str, params: dict[str, Any] | None = None) -> None:
        self.executions.append((sql, params or {}))
        if "INSERT INTO pa_scheduled_job_execution_logs" in sql:
            self._next_fetchone = {"id": "pajoblog_failure"}
        elif "SELECT COUNT" in sql:
            self._next_fetchone = {"total": 0}
        else:
            self._next_fetchone = None

    async def fetchone(self) -> dict[str, Any] | None:
        value = self._next_fetchone
        self._next_fetchone = None
        return value

    async def fetchall(self) -> list[dict[str, Any]]:
        return []


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self._cursor = cursor

    async def __aenter__(self) -> "FakeConnection":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    def cursor(self) -> FakeCursor:
        return self._cursor


def test_compute_next_run_at_supports_daily_frequency() -> None:
    next_run_at = _compute_next_run_at(
        ScheduledJobFrequencyPayload(kind="DAILY", timeOfDay="01:00"),
        "Asia/Shanghai",
        datetime(2026, 7, 9, 12, 0, tzinfo=timezone.utc),
    )

    assert next_run_at.isoformat() == "2026-07-10T01:00:00+08:00"


def test_compute_next_run_at_supports_weekly_frequency() -> None:
    next_run_at = _compute_next_run_at(
        ScheduledJobFrequencyPayload(kind="WEEKLY", weekdays=[1], timeOfDay="09:30"),
        "Asia/Shanghai",
        datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
    )

    assert next_run_at.isoformat() == "2026-07-13T09:30:00+08:00"


def test_compute_trace_window_supports_previous_day() -> None:
    window = _compute_trace_window(
        ScheduledJobTraceWindowPayload(mode="PREVIOUS_DAY"),
        "Asia/Shanghai",
        datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
    )

    assert window == (
        "2026-07-08T00:00:00+08:00",
        "2026-07-09T00:00:00+08:00",
    )


def test_compute_trace_window_supports_rolling_hours() -> None:
    window = _compute_trace_window(
        ScheduledJobTraceWindowPayload(mode="ROLLING", amount=2, unit="hours"),
        "Asia/Shanghai",
        datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
    )

    assert window == (
        "2026-07-09T07:00:00+08:00",
        "2026-07-09T09:00:00+08:00",
    )


def test_normalize_auto_evaluation_data_source_applies_dynamic_trace_window() -> None:
    data_source = _normalize_auto_evaluation_data_source(
        {
            "type": "TRACE_FILTER",
            "traceWindow": {"mode": "PREVIOUS_DAY"},
            "traceFilter": {
                "name": "客服 Trace",
                "environments": ["production"],
                "userId": "user-1",
                "sessionId": "session-1",
                "tags": ["customer"],
            },
        },
        timezone_name="Asia/Shanghai",
        fire_at=datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
    )

    assert data_source == {
        "type": "TRACE_FILTER",
        "traceName": "客服 Trace",
        "userId": "user-1",
        "sessionId": "session-1",
        "environments": ["production"],
        "tags": ["customer"],
        "createdAtRange": [
            "2026-07-08T00:00:00+08:00",
            "2026-07-09T00:00:00+08:00",
        ],
    }


def test_normalize_auto_evaluation_data_source_ignores_default_trace_filter_label() -> (
    None
):
    data_source = _normalize_auto_evaluation_data_source(
        {
            "type": "TRACE_FILTER",
            "traceFilter": {
                "name": "默认 Trace 过滤",
                "userId": "",
                "sessionId": "",
                "tags": [],
            },
        },
        timezone_name="Asia/Shanghai",
        fire_at=datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
    )

    assert data_source["traceName"] == ""


def test_normalize_variable_mapping_accepts_frontend_mapping_fields() -> None:
    assert _normalize_variable_mapping(
        {
            "input": "Trace.input",
            "output": "Dataset.output",
            "expected_output": "Dataset.expectedOutput",
            "context": "Trace.conversation_context",
        }
    ) == {
        "input": "{{ sample.input }}",
        "output": "{{ sample.output }}",
        "expected_output": "{{ sample.expectedOutput }}",
        "context": "{{ sample.context }}",
    }


def test_fire_key_is_stable_for_same_scheduled_fire_time() -> None:
    fire_at = datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc)

    assert _build_fire_key("pajob_1", fire_at) == _build_fire_key(
        "pajob_1",
        fire_at,
    )


def test_job_triggered_auto_evaluation_name_uses_required_format() -> None:
    name = _build_job_triggered_auto_evaluation_name(
        "每日客服质量评测",
        datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
        "Asia/Shanghai",
    )

    assert name == "【JOB触发】每日客服质量评测-202607090900"


def test_due_job_claim_sql_uses_postgres_skip_locked_and_lease() -> None:
    sql = _build_due_job_claim_sql()

    assert "FOR UPDATE SKIP LOCKED" in sql
    assert "lock_until" in sql
    assert "scheduler_enabled IS TRUE" in sql
    assert "NOT EXISTS" in sql
    assert "pa_scheduled_job_execution_logs" in sql
    assert "logs.status = 'RUNNING'" in sql
    assert "RETURNING sj.*" in sql


def test_unsupported_cron_expression_is_rejected() -> None:
    with pytest.raises(ValueError):
        _compute_next_run_at(
            ScheduledJobFrequencyPayload(kind="CRON", expression="* * 1 1 1"),
            "Asia/Shanghai",
            datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
        )


@pytest.mark.anyio
async def test_trigger_marks_execution_log_failed_when_auto_evaluation_setup_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = FakeCursor()

    async def fake_connect(settings: Settings) -> FakeConnection:
        return FakeConnection(cursor)

    async def fail_get_evaluator(*args: object, **kwargs: object) -> dict[str, Any]:
        raise RuntimeError("evaluator provider unavailable")

    monkeypatch.setattr(scheduled_jobs, "_connect", fake_connect)
    monkeypatch.setattr(scheduled_jobs, "_get_pa_evaluator", fail_get_evaluator)

    await scheduled_jobs._trigger_scheduled_job(
        settings=Settings(pa_eval_scheduler_instance_id="test-scheduler"),
        project_id="project-1",
        job={
            "id": "pajob_1",
            "project_id": "project-1",
            "name": "每日质量评测",
            "description": "",
            "score_name": "quality",
            "run_mode": "RECURRING",
            "frequency": {"kind": "EVERY_MINUTES", "intervalMinutes": 10},
            "timezone": "Asia/Shanghai",
            "evaluator_id": "evaluator-1",
            "created_user_id": "user-1",
            "variable_mapping": {},
            "data_source": {
                "type": "TRACE_FILTER",
                "traceWindow": {"mode": "PREVIOUS_DAY"},
            },
            "sample_rate": 100,
            "report_template_id": "default",
            "report_template_snapshot": {"id": "default"},
            "badcase_config": {},
            "create_by": "owner@example.com",
        },
        trigger_type="JOB",
        triggered_by="owner@example.com",
        scheduled_fire_at=datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
        manual_fire_key=None,
    )

    failure_updates = [
        (sql, params)
        for sql, params in cursor.executions
        if "UPDATE pa_scheduled_job_execution_logs" in sql
        and params.get("status") == "FAILED"
    ]
    job_updates = [
        (sql, params)
        for sql, params in cursor.executions
        if "UPDATE pa_scheduled_jobs" in sql and params.get("status") == "FAILED"
    ]

    assert failure_updates
    assert job_updates
    assert "evaluator provider unavailable" in failure_updates[-1][1]["error_message"]
    assert job_updates[-1][1]["next_run_at"] is not None


@pytest.mark.anyio
async def test_list_scheduled_jobs_passes_status_filter_to_query(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = FakeCursor()

    async def fake_connect(settings: Settings) -> FakeConnection:
        return FakeConnection(cursor)

    async def fake_ensure_access(*args: object, **kwargs: object) -> None:
        return None

    monkeypatch.setattr(scheduled_jobs, "_connect", fake_connect)
    monkeypatch.setattr(scheduled_jobs, "_ensure_project_access", fake_ensure_access)

    await scheduled_jobs.list_scheduled_jobs(
        project_id="project-1",
        page=1,
        page_size=10,
        keyword="质量",
        status=["RUNNING", "FAILED"],
        current_user=scheduled_jobs.CurrentUserContext(
            user_id="user-1",
            email="owner@example.com",
            name="Owner",
        ),
        settings=Settings(),
    )

    select_params = cursor.executions[-1][1]
    assert select_params["status"] == ["RUNNING", "FAILED"]


@pytest.mark.anyio
async def test_list_scheduled_job_logs_passes_status_and_trigger_filters_to_query(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = FakeCursor()

    async def fake_connect(settings: Settings) -> FakeConnection:
        return FakeConnection(cursor)

    async def fake_ensure_access(*args: object, **kwargs: object) -> None:
        return None

    monkeypatch.setattr(scheduled_jobs, "_connect", fake_connect)
    monkeypatch.setattr(scheduled_jobs, "_ensure_project_access", fake_ensure_access)

    await scheduled_jobs.list_scheduled_job_logs(
        project_id="project-1",
        page=1,
        page_size=10,
        job_id=None,
        keyword="每日",
        status=["FAILED"],
        trigger_type=["JOB"],
        current_user=scheduled_jobs.CurrentUserContext(
            user_id="user-1",
            email="owner@example.com",
            name="Owner",
        ),
        settings=Settings(),
    )

    select_params = cursor.executions[-1][1]
    assert select_params["status"] == ["FAILED"]
    assert select_params["trigger_type"] == ["JOB"]
