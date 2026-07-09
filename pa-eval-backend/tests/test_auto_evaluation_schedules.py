from datetime import datetime, tzinfo, timezone

import pytest
from pydantic import ValidationError

from app.auto_evaluation_schedules import (
    RetryPolicy,
    ScheduleWindowConfig,
    build_daily_cron_expression,
    build_schedule_cron_expression,
    compute_next_fire_at,
    compute_next_daily_fire_at,
    compute_previous_day_window,
    compute_retry_delay_minutes,
    compute_schedule_window,
    should_skip_due_schedule,
    validate_schedule_status,
)


class NoOffsetTimezone(tzinfo):
    def utcoffset(self, dt: datetime | None) -> None:
        return None


def test_build_daily_cron_expression() -> None:
    assert build_daily_cron_expression(0) == "0 0 * * *"
    assert build_daily_cron_expression(23) == "0 23 * * *"

    with pytest.raises(ValueError):
        build_daily_cron_expression(-1)
    with pytest.raises(ValueError):
        build_daily_cron_expression(24)


def test_build_schedule_cron_expression_for_supported_frequencies() -> None:
    assert build_schedule_cron_expression("HALF_HOURLY", 1) == "*/30 * * * *"
    assert build_schedule_cron_expression("HOURLY", 1) == "0 * * * *"
    assert build_schedule_cron_expression("DAILY", 1) == "0 1 * * *"


def test_compute_next_daily_fire_at_uses_next_day_when_today_fire_time_passed() -> None:
    fire_at = compute_next_daily_fire_at(
        "0 1 * * *",
        "Asia/Shanghai",
        datetime(2026, 7, 9, 0, 0, tzinfo=timezone.utc),
    )

    assert fire_at.isoformat() == "2026-07-10T01:00:00+08:00"


def test_compute_next_daily_fire_at_uses_today_when_fire_time_not_passed() -> None:
    fire_at = compute_next_daily_fire_at(
        "0 1 * * *",
        "Asia/Shanghai",
        datetime(2026, 7, 8, 16, 0, tzinfo=timezone.utc),
    )

    assert fire_at.isoformat() == "2026-07-09T01:00:00+08:00"


def test_compute_next_fire_at_supports_half_hourly_and_hourly() -> None:
    now = datetime(2026, 7, 9, 4, 10, tzinfo=timezone.utc)

    half_hourly = compute_next_fire_at("*/30 * * * *", "Asia/Shanghai", now)
    hourly = compute_next_fire_at("0 * * * *", "Asia/Shanghai", now)

    assert half_hourly.isoformat() == "2026-07-09T12:30:00+08:00"
    assert hourly.isoformat() == "2026-07-09T13:00:00+08:00"


def test_compute_next_daily_fire_at_rejects_naive_now() -> None:
    with pytest.raises(ValueError):
        compute_next_daily_fire_at("0 1 * * *", "Asia/Shanghai", datetime(2026, 7, 9))


def test_compute_previous_day_window_uses_default_hours() -> None:
    window = compute_previous_day_window(
        datetime(2026, 7, 9, 6, 30, tzinfo=timezone.utc),
        "Asia/Shanghai",
        ScheduleWindowConfig(),
    )

    assert window.start.isoformat() == "2026-07-08T00:00:00+08:00"
    assert window.end.isoformat() == "2026-07-09T00:00:00+08:00"
    assert window.start.tzinfo is not None
    assert window.end.tzinfo is not None


def test_compute_schedule_window_uses_rolling_interval() -> None:
    window = compute_schedule_window(
        datetime(2026, 7, 9, 5, 0, tzinfo=timezone.utc),
        "Asia/Shanghai",
        ScheduleWindowConfig(mode="rolling_interval", intervalMinutes=60),
    )

    assert window.start.isoformat() == "2026-07-09T12:00:00+08:00"
    assert window.end.isoformat() == "2026-07-09T13:00:00+08:00"


def test_compute_previous_day_window_applies_hour_offsets() -> None:
    window = compute_previous_day_window(
        datetime(2026, 7, 9, 20, 0, tzinfo=timezone.utc),
        "America/Los_Angeles",
        ScheduleWindowConfig(startHour=8, endHour=2),
    )

    assert window.start.isoformat() == "2026-07-08T08:00:00-07:00"
    assert window.end.isoformat() == "2026-07-09T02:00:00-07:00"


def test_compute_previous_day_window_rejects_naive_fire_at() -> None:
    with pytest.raises(ValueError):
        compute_previous_day_window(
            datetime(2026, 7, 9, 6, 30),
            "Asia/Shanghai",
            ScheduleWindowConfig(),
        )

    with pytest.raises(ValueError):
        compute_previous_day_window(
            datetime(2026, 7, 9, 6, 30, tzinfo=NoOffsetTimezone()),
            "Asia/Shanghai",
            ScheduleWindowConfig(),
        )


def test_schedule_window_config_validates_hour_range() -> None:
    with pytest.raises(ValidationError):
        ScheduleWindowConfig(startHour=-1)
    with pytest.raises(ValidationError):
        ScheduleWindowConfig(endHour=24)


def test_compute_retry_delay_minutes_uses_policy_and_last_backoff() -> None:
    policy = RetryPolicy(maxAttempts=4, backoffMinutes=[5, 15])

    assert compute_retry_delay_minutes(policy, 1) == 5
    assert compute_retry_delay_minutes(policy, 2) == 15
    assert compute_retry_delay_minutes(policy, 3) == 15
    assert compute_retry_delay_minutes(policy, 4) is None

    with pytest.raises(ValueError):
        compute_retry_delay_minutes(policy, 0)


def test_retry_policy_defaults_and_validation() -> None:
    assert RetryPolicy().backoffMinutes == [10, 30, 60]

    with pytest.raises(ValidationError):
        RetryPolicy(maxAttempts=0)
    with pytest.raises(ValidationError):
        RetryPolicy(maxAttempts=11)
    with pytest.raises(ValidationError):
        RetryPolicy(backoffMinutes=[10, 0])


def test_validate_schedule_status_allows_only_known_values() -> None:
    assert validate_schedule_status("DRAFT") == "DRAFT"
    assert validate_schedule_status("ACTIVE") == "ACTIVE"
    assert validate_schedule_status("PAUSED") == "PAUSED"

    with pytest.raises(ValueError):
        validate_schedule_status("DELETED")


def test_should_skip_due_schedule_when_active_run_exists() -> None:
    assert should_skip_due_schedule(0) is False
    assert should_skip_due_schedule(1) is True
    assert should_skip_due_schedule(2) is True
