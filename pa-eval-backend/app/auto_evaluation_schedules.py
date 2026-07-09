from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, field_validator

ScheduleFrequency = Literal["HALF_HOURLY", "HOURLY", "DAILY"]
ScheduleStatus = Literal["DRAFT", "ACTIVE", "PAUSED"]
TriggerSource = Literal["MANUAL", "SCHEDULED", "RETRY"]


class ScheduleWindowConfig(BaseModel):
    mode: Literal["rolling_interval", "previous_day"] = "rolling_interval"
    intervalMinutes: int = Field(default=60, ge=1, le=1440)
    startHour: int = Field(default=0, ge=0, le=23)
    endHour: int = Field(default=0, ge=0, le=23)


class RetryPolicy(BaseModel):
    maxAttempts: int = Field(default=3, ge=1, le=10)
    backoffMinutes: list[int] = Field(default_factory=lambda: [10, 30, 60])

    @field_validator("backoffMinutes")
    @classmethod
    def validate_backoff_minutes(cls, value: list[int]) -> list[int]:
        if not value:
            raise ValueError("backoffMinutes must not be empty")
        if any(minutes <= 0 for minutes in value):
            raise ValueError("backoffMinutes must contain positive integers")
        return value


@dataclass(frozen=True)
class ScheduleWindow:
    start: datetime
    end: datetime


def build_daily_cron_expression(hour: int) -> str:
    if hour < 0 or hour > 23:
        raise ValueError("hour must be between 0 and 23")
    return f"0 {hour} * * *"


def build_schedule_cron_expression(
    frequency: ScheduleFrequency,
    hour: int = 1,
) -> str:
    if frequency == "HALF_HOURLY":
        return "*/30 * * * *"
    if frequency == "HOURLY":
        return "0 * * * *"
    return build_daily_cron_expression(hour)


def compute_next_daily_fire_at(
    cron_expression: str,
    timezone_name: str,
    now: datetime,
) -> datetime:
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must be a timezone-aware datetime")

    parts = cron_expression.split()
    if len(parts) != 5 or parts[0] != "0" or parts[2:] != ["*", "*", "*"]:
        raise ValueError("cron_expression must be daily cron like '0 H * * *'")

    try:
        hour = int(parts[1])
    except ValueError as exc:
        raise ValueError("cron hour must be an integer") from exc
    if hour < 0 or hour > 23:
        raise ValueError("cron hour must be between 0 and 23")

    timezone = ZoneInfo(timezone_name)
    local_now = now.astimezone(timezone)
    candidate = datetime.combine(
        local_now.date(),
        datetime.min.time().replace(hour=hour),
        tzinfo=timezone,
    )
    if candidate <= local_now:
        candidate += timedelta(days=1)
    return candidate


def compute_next_fire_at(
    cron_expression: str,
    timezone_name: str,
    now: datetime,
) -> datetime:
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must be a timezone-aware datetime")

    parts = cron_expression.split()
    if len(parts) != 5:
        raise ValueError("cron_expression must have five fields")

    timezone = ZoneInfo(timezone_name)
    local_now = now.astimezone(timezone)
    minute, hour, day, month, weekday = parts
    if (day, month, weekday) != ("*", "*", "*"):
        raise ValueError("cron_expression must use daily or interval wildcard fields")

    if minute == "*/30" and hour == "*":
        base = local_now.replace(second=0, microsecond=0)
        if local_now.minute < 30:
            candidate = base.replace(minute=30)
        else:
            candidate = (base.replace(minute=0) + timedelta(hours=1))
        if candidate <= local_now:
            candidate += timedelta(minutes=30)
        return candidate

    if minute == "0" and hour == "*":
        candidate = local_now.replace(minute=0, second=0, microsecond=0)
        if candidate <= local_now:
            candidate += timedelta(hours=1)
        return candidate

    return compute_next_daily_fire_at(cron_expression, timezone_name, now)


def validate_schedule_status(status: str) -> ScheduleStatus:
    if status not in {"DRAFT", "ACTIVE", "PAUSED"}:
        raise ValueError("status must be one of DRAFT, ACTIVE, PAUSED")
    return status  # type: ignore[return-value]


def compute_previous_day_window(
    fire_at: datetime,
    timezone_name: str,
    config: ScheduleWindowConfig,
) -> ScheduleWindow:
    if fire_at.tzinfo is None or fire_at.utcoffset() is None:
        raise ValueError("fire_at must be a timezone-aware datetime")

    timezone = ZoneInfo(timezone_name)
    local_fire_at = fire_at.astimezone(timezone)
    current_day = local_fire_at.date()
    previous_day = current_day - timedelta(days=1)

    start = datetime.combine(
        previous_day,
        datetime.min.time().replace(hour=config.startHour),
        tzinfo=timezone,
    )
    end = datetime.combine(
        current_day,
        datetime.min.time().replace(hour=config.endHour),
        tzinfo=timezone,
    )
    if start >= end:
        raise ValueError("schedule window start must be before end")
    return ScheduleWindow(start=start, end=end)


def compute_rolling_interval_window(
    fire_at: datetime,
    timezone_name: str,
    config: ScheduleWindowConfig,
) -> ScheduleWindow:
    if fire_at.tzinfo is None or fire_at.utcoffset() is None:
        raise ValueError("fire_at must be a timezone-aware datetime")
    timezone = ZoneInfo(timezone_name)
    end = fire_at.astimezone(timezone)
    start = end - timedelta(minutes=config.intervalMinutes)
    return ScheduleWindow(start=start, end=end)


def compute_schedule_window(
    fire_at: datetime,
    timezone_name: str,
    config: ScheduleWindowConfig,
) -> ScheduleWindow:
    if config.mode == "rolling_interval":
        return compute_rolling_interval_window(fire_at, timezone_name, config)
    return compute_previous_day_window(fire_at, timezone_name, config)


def compute_retry_delay_minutes(
    policy: RetryPolicy,
    attempt_no: int,
) -> int | None:
    if attempt_no < 1:
        raise ValueError("attempt_no must be greater than or equal to 1")
    if attempt_no >= policy.maxAttempts:
        return None
    index = attempt_no - 1
    if index >= len(policy.backoffMinutes):
        return policy.backoffMinutes[-1]
    return policy.backoffMinutes[index]


def should_skip_due_schedule(active_run_count: int) -> bool:
    return active_run_count > 0
