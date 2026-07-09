from datetime import datetime, timezone

import pytest

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
        "tags": ["customer"],
        "createdAtRange": [
            "2026-07-08T00:00:00+08:00",
            "2026-07-09T00:00:00+08:00",
        ],
    }


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
    assert "RETURNING sj.*" in sql


def test_unsupported_cron_expression_is_rejected() -> None:
    with pytest.raises(ValueError):
        _compute_next_run_at(
            ScheduledJobFrequencyPayload(kind="CRON", expression="* * 1 1 1"),
            "Asia/Shanghai",
            datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
        )
