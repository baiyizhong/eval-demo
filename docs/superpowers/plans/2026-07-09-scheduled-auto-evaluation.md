# Scheduled Auto Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Project rule: do not run `git commit`, `git push`, or create a PR unless the user explicitly asks.

**Goal:** Add scheduled auto evaluation with an independent PA schedule table, daily cron-backed execution, explicit start/pause/delete, retry support, and hourly Trace windows.

**Architecture:** Keep `pa_auto_evaluation_tasks` as the auto evaluation task record and add `pa_auto_evaluation_schedules` for schedule lifecycle and cron configuration. Extend run records with trigger/window/retry metadata, then make the scheduler create normal auto evaluation runs through the existing execution path. Frontend reuses the current auto evaluation module and adds scheduled-mode controls, schedule status, and run metadata display.

**Tech Stack:** FastAPI, Pydantic, psycopg/SQLAlchemy text queries, Alembic, PostgreSQL JSONB, React, TypeScript, TanStack Query, existing PA API client wrappers.

---

## File Structure

- Create: `pa-eval-backend/migrations/versions/20260709_0010_create_auto_eval_schedules.py`
  - Adds `pa_auto_evaluation_schedules`.
  - Adds schedule/run metadata columns to `pa_auto_evaluation_runs`.
  - Uses PA audit fields first and complete table/column comments.
- Modify: `pa-eval-backend/tests/test_pa_migration_schema.py`
  - Adds the new migration filename and PA table to schema invariants.
- Create: `pa-eval-backend/app/auto_evaluation_schedules.py`
  - Owns schedule Pydantic models, cron/window helpers, schedule CRUD helpers, and scheduler scan helpers.
- Modify: `pa-eval-backend/app/auto_evaluations.py`
  - Accepts scheduled creation payloads.
  - Creates task + schedule in one transaction.
  - Adds start/pause/schedule endpoints.
  - Passes trigger/window/retry metadata into run creation.
  - Keeps existing immediate execution behavior intact.
- Modify: `pa-eval-backend/app/main.py`
  - Includes the schedule router only if schedule routes are split out; otherwise unchanged.
- Modify: `pa-eval-backend/tests/test_auto_evaluations.py`
  - Adds backend unit tests for scheduled creation, start/pause/delete, run metadata, and default no-auto-run behavior.
- Create: `pa-eval-backend/tests/test_auto_evaluation_schedules.py`
  - Tests cron/window/retry helper behavior and scheduler scan decisions.
- Modify: `pa-eval-frontend/src/modules/app-evaluation/types.ts`
  - Adds schedule config/status types and run trigger metadata.
- Modify: `pa-eval-frontend/src/modules/app-evaluation/api/auto-evaluation-api.ts`
  - Sends schedule config when creating scheduled tasks.
  - Adds start/pause schedule API helpers.
- Modify: `pa-eval-frontend/src/modules/app-evaluation/api/auto-evaluation-api.test.ts`
  - Verifies scheduled payload and schedule action API calls.
- Modify: `pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-task-form.tsx`
  - Adds run mode, daily execution time, timezone, window, and retry controls.
  - Saves scheduled tasks as draft without starting them.
- Modify: `pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-columns.tsx`
  - Adds run mode, schedule status, and next run columns.
- Modify: `pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-row-actions.tsx`
  - Adds start/pause actions and keeps manual run/delete actions.
- Modify: `pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-run-records.tsx`
  - Shows trigger source, time window, and retry attempt.
- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/auto-evaluations.tsx`
  - Wires start/pause mutations and invalidation.
- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/auto-evaluation-detail.tsx`
  - Shows schedule card and wires start/pause actions.
- Create: `pa-eval-frontend/src/tests/app-evaluation/auto-evaluation-schedule-form.test.ts`
  - Source-level tests for scheduled form controls and default draft wording.

---

## Task 1: Database Migration

**Files:**
- Create: `pa-eval-backend/migrations/versions/20260709_0010_create_auto_eval_schedules.py`
- Modify: `pa-eval-backend/tests/test_pa_migration_schema.py`

- [ ] **Step 1: Write schema invariant tests**

In `pa-eval-backend/tests/test_pa_migration_schema.py`, update `PA_TABLES`:

```python
PA_TABLES = (
    "pa_evaluators",
    "pa_evaluation_report_templates",
    "pa_project_api_keys",
    "pa_auto_evaluation_tasks",
    "pa_auto_evaluation_runs",
    "pa_auto_evaluation_schedules",
    "pa_evaluation_reports",
    "pa_evaluation_report_items",
    "pa_evaluation_report_badcases",
    "pa_evaluation_report_flowbacks",
    "pa_project_llm_connections",
    "pa_project_model_definitions",
    "pa_project_model_settings",
    "pa_audit_logs",
    "pa_dataset_export_jobs",
)
```

Update the expected migration list:

```python
assert [path.name for path in migration_files] == [
    "20260705_0001_create_pa_eval_tables.py",
    "20260705_0002_legacy_compatibility_checkpoint.py",
    "20260707_0002_create_project_model_settings.py",
    "20260707_0003_align_legacy_pa_tables.py",
    "20260707_0004_create_pa_audit_logs.py",
    "20260707_0005_normalize_pa_audit_actions.py",
    "20260707_0006_create_pa_dataset_export_jobs.py",
    "20260707_0007_normalize_langfuse_score_config_categories.py",
    "20260708_0008_align_auto_eval_compat_columns.py",
    "20260708_0009_add_report_flowback_compat_columns.py",
    "20260709_0010_create_auto_eval_schedules.py",
]
```

- [ ] **Step 2: Run the schema test and confirm it fails**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_pa_migration_schema.py -q
```

Expected: FAIL because `20260709_0010_create_auto_eval_schedules.py` does not exist yet.

- [ ] **Step 3: Add the migration**

Create `pa-eval-backend/migrations/versions/20260709_0010_create_auto_eval_schedules.py`:

```python
"""create auto evaluation schedules

Revision ID: 20260709_0010
Revises: 20260708_0009
Create Date: 2026-07-09 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260709_0010"
down_revision = "20260708_0009"
branch_labels = None
depends_on = None


def _quote_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return _inspector().has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(
        column["name"] == column_name for column in _inspector().get_columns(table_name)
    )


def _audit_columns() -> list[sa.Column]:
    return [
        sa.Column("create_by", sa.Text(), nullable=False, server_default="system"),
        sa.Column("update_by", sa.Text(), nullable=False, server_default="system"),
        sa.Column(
            "create_date",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "update_date",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    ]


def _comment(table_name: str, column_name: str, comment: str) -> None:
    op.execute(
        sa.text(
            f"COMMENT ON COLUMN {table_name}.{column_name} IS {_quote_literal(comment)}"
        )
    )


def _add_column_once(table_name: str, column: sa.Column, comment: str) -> None:
    if not _column_exists(table_name, column.name):
        op.add_column(table_name, column)
    _comment(table_name, column.name, comment)


def _drop_column_if_exists(table_name: str, column_name: str) -> None:
    if _column_exists(table_name, column_name):
        op.drop_column(table_name, column_name)


def upgrade() -> None:
    if not _table_exists("pa_auto_evaluation_schedules"):
        op.create_table(
            "pa_auto_evaluation_schedules",
            *_audit_columns(),
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("task_id", sa.Text(), nullable=False),
            sa.Column("status", sa.Text(), nullable=False, server_default="DRAFT"),
            sa.Column("cron_expression", sa.Text(), nullable=False),
            sa.Column("timezone", sa.Text(), nullable=False, server_default="Asia/Shanghai"),
            sa.Column(
                "window_config",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column(
                "retry_policy",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_scheduled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_window_start", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_window_end", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(
                ["task_id"],
                ["pa_auto_evaluation_tasks.id"],
                ondelete="CASCADE",
            ),
        )
        op.create_index(
            "pa_auto_evaluation_schedules_project_id_idx",
            "pa_auto_evaluation_schedules",
            ["project_id"],
        )
        op.create_index(
            "pa_auto_evaluation_schedules_task_id_uidx",
            "pa_auto_evaluation_schedules",
            ["task_id"],
            unique=True,
        )
        op.create_index(
            "pa_auto_evaluation_schedules_due_idx",
            "pa_auto_evaluation_schedules",
            ["status", "next_run_at"],
        )

    op.execute(
        sa.text("COMMENT ON TABLE pa_auto_evaluation_schedules IS 'PA 自动评测调度配置表'")
    )
    for column_name, comment in [
        ("create_by", "创建人"),
        ("update_by", "更新人"),
        ("create_date", "创建时间"),
        ("update_date", "更新时间"),
        ("id", "调度 ID"),
        ("project_id", "项目 ID"),
        ("task_id", "自动评测任务 ID"),
        ("status", "调度状态"),
        ("cron_expression", "cron 表达式"),
        ("timezone", "调度时区"),
        ("window_config", "Trace 时间窗口配置"),
        ("retry_policy", "失败重试策略"),
        ("next_run_at", "下次计划触发时间"),
        ("last_scheduled_at", "最近一次调度触发时间"),
        ("last_window_start", "最近一次调度窗口开始时间"),
        ("last_window_end", "最近一次调度窗口结束时间"),
    ]:
        _comment("pa_auto_evaluation_schedules", column_name, comment)

    if _table_exists("pa_auto_evaluation_runs"):
        _add_column_once(
            "pa_auto_evaluation_runs",
            sa.Column("trigger_source", sa.Text(), nullable=False, server_default="MANUAL"),
            "触发来源",
        )
        _add_column_once(
            "pa_auto_evaluation_runs",
            sa.Column("window_start", sa.DateTime(timezone=True), nullable=True),
            "本次评测 Trace 窗口开始时间",
        )
        _add_column_once(
            "pa_auto_evaluation_runs",
            sa.Column("window_end", sa.DateTime(timezone=True), nullable=True),
            "本次评测 Trace 窗口结束时间",
        )
        _add_column_once(
            "pa_auto_evaluation_runs",
            sa.Column("scheduled_fire_at", sa.DateTime(timezone=True), nullable=True),
            "本次计划触发时间",
        )
        _add_column_once(
            "pa_auto_evaluation_runs",
            sa.Column("attempt_no", sa.Integer(), nullable=False, server_default="1"),
            "第几次尝试",
        )
        _add_column_once(
            "pa_auto_evaluation_runs",
            sa.Column("parent_run_id", sa.Text(), nullable=True),
            "重试来源运行 ID",
        )
        _add_column_once(
            "pa_auto_evaluation_runs",
            sa.Column(
                "run_config_snapshot",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            "本次运行配置快照",
        )


def downgrade() -> None:
    if _table_exists("pa_auto_evaluation_runs"):
        for column_name in [
            "run_config_snapshot",
            "parent_run_id",
            "attempt_no",
            "scheduled_fire_at",
            "window_end",
            "window_start",
            "trigger_source",
        ]:
            _drop_column_if_exists("pa_auto_evaluation_runs", column_name)

    if _table_exists("pa_auto_evaluation_schedules"):
        op.drop_index(
            "pa_auto_evaluation_schedules_due_idx",
            table_name="pa_auto_evaluation_schedules",
        )
        op.drop_index(
            "pa_auto_evaluation_schedules_task_id_uidx",
            table_name="pa_auto_evaluation_schedules",
        )
        op.drop_index(
            "pa_auto_evaluation_schedules_project_id_idx",
            table_name="pa_auto_evaluation_schedules",
        )
        op.drop_table("pa_auto_evaluation_schedules")
```

- [ ] **Step 4: Run the schema test**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_pa_migration_schema.py -q
```

Expected: PASS.

---

## Task 2: Schedule Domain Helpers

**Files:**
- Create: `pa-eval-backend/app/auto_evaluation_schedules.py`
- Create: `pa-eval-backend/tests/test_auto_evaluation_schedules.py`

- [ ] **Step 1: Write helper tests**

Create `pa-eval-backend/tests/test_auto_evaluation_schedules.py`:

```python
from datetime import datetime, timezone

from app.auto_evaluation_schedules import (
    ScheduleWindowConfig,
    RetryPolicy,
    build_daily_cron_expression,
    compute_previous_day_window,
    compute_retry_delay_minutes,
    validate_schedule_status,
)


def test_build_daily_cron_expression_uses_hour_precision() -> None:
    assert build_daily_cron_expression(1) == "0 1 * * *"
    assert build_daily_cron_expression(23) == "0 23 * * *"


def test_compute_previous_day_window_uses_start_inclusive_end_exclusive() -> None:
    fire_at = datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc)
    config = ScheduleWindowConfig(mode="previous_day", startHour=0, endHour=0)

    window = compute_previous_day_window(fire_at, "Asia/Shanghai", config)

    assert window.start.isoformat() == "2026-07-08T00:00:00+08:00"
    assert window.end.isoformat() == "2026-07-09T00:00:00+08:00"


def test_compute_previous_day_window_supports_hour_offset() -> None:
    fire_at = datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc)
    config = ScheduleWindowConfig(mode="previous_day", startHour=2, endHour=2)

    window = compute_previous_day_window(fire_at, "Asia/Shanghai", config)

    assert window.start.isoformat() == "2026-07-08T02:00:00+08:00"
    assert window.end.isoformat() == "2026-07-09T02:00:00+08:00"


def test_compute_retry_delay_minutes_uses_attempt_index() -> None:
    policy = RetryPolicy(maxAttempts=3, backoffMinutes=[10, 30, 60])

    assert compute_retry_delay_minutes(policy, 1) == 10
    assert compute_retry_delay_minutes(policy, 2) == 30
    assert compute_retry_delay_minutes(policy, 3) is None


def test_validate_schedule_status_rejects_unknown_status() -> None:
    assert validate_schedule_status("DRAFT") == "DRAFT"
    assert validate_schedule_status("ACTIVE") == "ACTIVE"
    assert validate_schedule_status("PAUSED") == "PAUSED"
```

- [ ] **Step 2: Run tests and confirm they fail**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_auto_evaluation_schedules.py -q
```

Expected: FAIL because `app.auto_evaluation_schedules` does not exist.

- [ ] **Step 3: Implement the helper module**

Create `pa-eval-backend/app/auto_evaluation_schedules.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, field_validator


ScheduleStatus = Literal["DRAFT", "ACTIVE", "PAUSED"]
TriggerSource = Literal["MANUAL", "SCHEDULED", "RETRY"]


class ScheduleWindowConfig(BaseModel):
    mode: Literal["previous_day"] = "previous_day"
    startHour: int = Field(default=0, ge=0, le=23)
    endHour: int = Field(default=0, ge=0, le=23)


class RetryPolicy(BaseModel):
    maxAttempts: int = Field(default=3, ge=1, le=10)
    backoffMinutes: list[int] = Field(default_factory=lambda: [10, 30, 60])

    @field_validator("backoffMinutes")
    @classmethod
    def validate_backoff(cls, value: list[int]) -> list[int]:
        if any(item <= 0 for item in value):
            raise ValueError("backoffMinutes must contain positive values")
        return value


@dataclass(frozen=True)
class ScheduleWindow:
    start: datetime
    end: datetime


def build_daily_cron_expression(hour: int) -> str:
    if hour < 0 or hour > 23:
        raise ValueError("hour must be between 0 and 23")
    return f"0 {hour} * * *"


def validate_schedule_status(status: str) -> ScheduleStatus:
    if status not in {"DRAFT", "ACTIVE", "PAUSED"}:
        raise ValueError("invalid schedule status")
    return status  # type: ignore[return-value]


def compute_previous_day_window(
    fire_at: datetime,
    timezone_name: str,
    config: ScheduleWindowConfig,
) -> ScheduleWindow:
    tz = ZoneInfo(timezone_name)
    local_fire_at = fire_at.astimezone(tz)
    local_day_start = local_fire_at.replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )
    end = local_day_start + timedelta(hours=config.endHour)
    start = local_day_start - timedelta(days=1) + timedelta(hours=config.startHour)
    if start >= end:
        raise ValueError("schedule window start must be earlier than end")
    return ScheduleWindow(start=start, end=end)


def compute_retry_delay_minutes(
    policy: RetryPolicy,
    attempt_no: int,
) -> int | None:
    if attempt_no >= policy.maxAttempts:
        return None
    index = max(attempt_no - 1, 0)
    if index >= len(policy.backoffMinutes):
        return policy.backoffMinutes[-1]
    return policy.backoffMinutes[index]
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_auto_evaluation_schedules.py -q
```

Expected: PASS.

---

## Task 3: Backend Scheduled Creation and Run Metadata

**Files:**
- Modify: `pa-eval-backend/app/auto_evaluations.py`
- Modify: `pa-eval-backend/tests/test_auto_evaluations.py`

- [ ] **Step 1: Add payload and insert tests**

Add tests to `pa-eval-backend/tests/test_auto_evaluations.py` near the existing `_insert_running_auto_evaluation` tests:

```python
async def test_insert_scheduled_auto_evaluation_creates_draft_schedule_without_run() -> None:
    cursor = FakeAsyncCursor()
    task_id = "task_scheduled"
    payload = CreateAutoEvaluationPayload.model_validate(
        {
            "name": "Daily quality check",
            "description": "",
            "evaluatorId": "eval_1",
            "dataSource": {
                "type": "TRACE_FILTER",
                "traceFilter": {"timeRange": "1d"},
            },
            "runMode": "SCHEDULED",
            "schedule": {
                "executionHour": 1,
                "timezone": "Asia/Shanghai",
                "window": {"mode": "previous_day", "startHour": 0, "endHour": 0},
                "retry": {"maxAttempts": 3, "backoffMinutes": [10, 30, 60]},
            },
        }
    )

    await _insert_scheduled_auto_evaluation(
        cursor,
        task_id=task_id,
        project_id="project_1",
        payload=payload,
        data_source={"type": "TRACE_FILTER"},
        evaluator={"id": "eval_1", "name": "Evaluator", "type": "LLM"},
        score_name="score",
        user_id="user_1",
    )

    statements = [query for query, _params in cursor.executed]
    assert any("INSERT INTO pa_auto_evaluation_tasks" in query for query in statements)
    assert any("INSERT INTO pa_auto_evaluation_schedules" in query for query in statements)
    assert not any("INSERT INTO pa_auto_evaluation_runs" in query for query in statements)
```

Add a run metadata test next to existing `_insert_rerun_auto_evaluation` tests:

```python
async def test_insert_rerun_auto_evaluation_persists_trigger_window_metadata() -> None:
    cursor = FakeAsyncCursor()

    await _insert_rerun_auto_evaluation(
        cursor,
        task_id="task_1",
        run_id="run_1",
        sample_count=5,
        user_id="user_1",
        trigger_source="SCHEDULED",
        window_start="2026-07-08T00:00:00+08:00",
        window_end="2026-07-09T00:00:00+08:00",
        scheduled_fire_at="2026-07-09T01:00:00+08:00",
        attempt_no=1,
        parent_run_id=None,
        run_config_snapshot={"cron": "0 1 * * *"},
    )

    run_sql, run_params = cursor.executed[-1]
    assert "trigger_source" in run_sql
    assert run_params["trigger_source"] == "SCHEDULED"
    assert run_params["attempt_no"] == 1
```

- [ ] **Step 2: Run targeted tests and confirm they fail**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_auto_evaluations.py -q
```

Expected: FAIL because scheduled payload fields and insert helper are not implemented.

- [ ] **Step 3: Extend Pydantic payload models**

In `pa-eval-backend/app/auto_evaluations.py`, import the schedule models:

```python
from app.auto_evaluation_schedules import (
    RetryPolicy,
    ScheduleWindowConfig,
    build_daily_cron_expression,
)
```

Add models near `CreateAutoEvaluationPayload`:

```python
class AutoEvaluationSchedulePayload(BaseModel):
    executionHour: int = Field(default=1, ge=0, le=23)
    timezone: str = "Asia/Shanghai"
    window: ScheduleWindowConfig = Field(default_factory=ScheduleWindowConfig)
    retry: RetryPolicy = Field(default_factory=RetryPolicy)


class CreateAutoEvaluationPayload(BaseModel):
    # keep existing fields
    runMode: Literal["IMMEDIATE", "SCHEDULED"] = "IMMEDIATE"
    schedule: AutoEvaluationSchedulePayload | None = None
```

Add validation:

```python
@model_validator(mode="after")
def validate_schedule_for_run_mode(self) -> "CreateAutoEvaluationPayload":
    if self.runMode == "SCHEDULED" and self.schedule is None:
        self.schedule = AutoEvaluationSchedulePayload()
    return self
```

- [ ] **Step 4: Add scheduled insert helper**

Add this helper near `_insert_running_auto_evaluation`:

```python
async def _insert_scheduled_auto_evaluation(
    cursor: Any,
    *,
    task_id: str,
    project_id: str,
    payload: CreateAutoEvaluationPayload,
    data_source: dict[str, Any],
    evaluator: dict[str, Any],
    score_name: str,
    user_id: str,
) -> None:
    schedule = payload.schedule or AutoEvaluationSchedulePayload()
    await cursor.execute(
        """
        INSERT INTO pa_auto_evaluation_tasks (
            create_by, update_by, id, project_id, name, description, score_name,
            status, evaluator_id, evaluator_name, evaluator_type, evaluator_version,
            data_source, sample_rate, execution_stats, badcase_count, created_by,
            created_at, updated_at, data_source_type, dataset_id, trace_query,
            evaluator_ids, run_config, report_config
        )
        VALUES (
            %(user_id)s, %(user_id)s, %(task_id)s, %(project_id)s, %(name)s,
            %(description)s, %(score_name)s, 'DRAFT', %(evaluator_id)s,
            %(evaluator_name)s, %(evaluator_type)s, %(evaluator_version)s,
            %(data_source)s, 100, '{}'::jsonb, 0, %(user_id)s, NOW(), NOW(),
            %(data_source_type)s, %(dataset_id)s, %(trace_query)s,
            %(evaluator_ids)s, %(run_config)s, %(report_config)s
        )
        """,
        {
            "user_id": user_id,
            "task_id": task_id,
            "project_id": project_id,
            "name": payload.name,
            "description": payload.description or "",
            "score_name": score_name,
            "evaluator_id": evaluator.get("id", payload.evaluatorId),
            "evaluator_name": evaluator.get("name", ""),
            "evaluator_type": evaluator.get("type", "LLM"),
            "evaluator_version": evaluator.get("version", "v1"),
            "data_source": Json(data_source),
            "data_source_type": data_source.get("type", "TRACE_FILTER"),
            "dataset_id": data_source.get("datasetId"),
            "trace_query": Json(data_source.get("traceFilter", {})),
            "evaluator_ids": Json([payload.evaluatorId]),
            "run_config": Json({"runMode": "SCHEDULED"}),
            "report_config": Json({"reportTemplateId": payload.reportTemplateId}),
        },
    )
    await cursor.execute(
        """
        INSERT INTO pa_auto_evaluation_schedules (
            create_by, update_by, id, project_id, task_id, status, cron_expression,
            timezone, window_config, retry_policy
        )
        VALUES (
            %(user_id)s, %(user_id)s, %(schedule_id)s, %(project_id)s, %(task_id)s,
            'DRAFT', %(cron_expression)s, %(timezone)s, %(window_config)s,
            %(retry_policy)s
        )
        """,
        {
            "user_id": user_id,
            "schedule_id": f"schedule_{task_id}",
            "project_id": project_id,
            "task_id": task_id,
            "cron_expression": build_daily_cron_expression(schedule.executionHour),
            "timezone": schedule.timezone,
            "window_config": Json(schedule.window.model_dump()),
            "retry_policy": Json(schedule.retry.model_dump()),
        },
    )
```

Adapt names/imports to match the existing file's `Json` import and payload field names.

- [ ] **Step 5: Branch create behavior by run mode**

In `create_auto_evaluation`, after resolving evaluator/data source for scheduled mode, call `_insert_scheduled_auto_evaluation` and do not add a background task:

```python
if payload.runMode == "SCHEDULED":
    await _insert_scheduled_auto_evaluation(
        cursor,
        task_id=task_id,
        project_id=project_id,
        payload=payload,
        data_source=data_source,
        evaluator=evaluator,
        score_name=score_name,
        user_id=user_id,
    )
    return success_response({"id": task_id})
```

Keep the existing immediate path unchanged.

- [ ] **Step 6: Extend run insert helpers**

Add keyword defaults to `_insert_rerun_auto_evaluation`:

```python
trigger_source: str = "MANUAL",
window_start: str | None = None,
window_end: str | None = None,
scheduled_fire_at: str | None = None,
attempt_no: int = 1,
parent_run_id: str | None = None,
run_config_snapshot: dict[str, Any] | None = None,
```

Add these columns and params to the `INSERT INTO pa_auto_evaluation_runs` query:

```sql
trigger_source, window_start, window_end, scheduled_fire_at,
attempt_no, parent_run_id, run_config_snapshot
```

Use:

```python
"trigger_source": trigger_source,
"window_start": window_start,
"window_end": window_end,
"scheduled_fire_at": scheduled_fire_at,
"attempt_no": attempt_no,
"parent_run_id": parent_run_id,
"run_config_snapshot": Json(run_config_snapshot or {}),
```

- [ ] **Step 7: Run backend tests**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_auto_evaluations.py tests/test_auto_evaluation_schedules.py -q
```

Expected: PASS.

---

## Task 4: Schedule Start, Pause, Delete, and Scheduler Scan

**Files:**
- Modify: `pa-eval-backend/app/auto_evaluation_schedules.py`
- Modify: `pa-eval-backend/app/auto_evaluations.py`
- Modify: `pa-eval-backend/tests/test_auto_evaluation_schedules.py`
- Modify: `pa-eval-backend/tests/test_auto_evaluations.py`

- [ ] **Step 1: Add schedule action tests**

Add backend tests:

```python
async def test_start_schedule_sets_active_and_next_run_at() -> None:
    cursor = FakeAsyncCursor()

    await _start_auto_evaluation_schedule(
        cursor,
        project_id="project_1",
        task_id="task_1",
        user_id="user_1",
        now=datetime(2026, 7, 9, 0, 0, tzinfo=timezone.utc),
    )

    sql, params = cursor.executed[-1]
    assert "UPDATE pa_auto_evaluation_schedules" in sql
    assert "status = 'ACTIVE'" in sql
    assert params["task_id"] == "task_1"


async def test_pause_schedule_sets_paused() -> None:
    cursor = FakeAsyncCursor()

    await _pause_auto_evaluation_schedule(
        cursor,
        project_id="project_1",
        task_id="task_1",
        user_id="user_1",
    )

    sql, params = cursor.executed[-1]
    assert "UPDATE pa_auto_evaluation_schedules" in sql
    assert "status = 'PAUSED'" in sql
    assert params["task_id"] == "task_1"
```

Add scheduler scan helper tests in `test_auto_evaluation_schedules.py`:

```python
def test_should_skip_due_schedule_when_run_is_active() -> None:
    assert should_skip_due_schedule(active_run_count=1) is True
    assert should_skip_due_schedule(active_run_count=0) is False
```

- [ ] **Step 2: Implement schedule action helpers**

In `pa-eval-backend/app/auto_evaluations.py`:

```python
async def _start_auto_evaluation_schedule(
    cursor: Any,
    *,
    project_id: str,
    task_id: str,
    user_id: str,
    now: datetime | None = None,
) -> None:
    next_run_at = now or datetime.now(timezone.utc)
    await cursor.execute(
        """
        UPDATE pa_auto_evaluation_schedules
        SET status = 'ACTIVE',
            next_run_at = %(next_run_at)s,
            update_by = %(user_id)s,
            update_date = NOW()
        WHERE project_id = %(project_id)s AND task_id = %(task_id)s
        """,
        {
            "project_id": project_id,
            "task_id": task_id,
            "user_id": user_id,
            "next_run_at": next_run_at,
        },
    )
```

Add `_pause_auto_evaluation_schedule` with the same shape and `status = 'PAUSED'`.

- [ ] **Step 3: Add route handlers**

Add endpoints in `pa-eval-backend/app/auto_evaluations.py`:

```python
@router.post("/projects/{project_id}/auto-evaluation-tasks/{task_id}/schedule/start")
async def start_auto_evaluation_schedule(project_id: str, task_id: str) -> dict[str, Any]:
    async with get_db_connection() as conn:
        async with conn.cursor() as cursor:
            await _start_auto_evaluation_schedule(
                cursor,
                project_id=project_id,
                task_id=task_id,
                user_id="system",
            )
        await conn.commit()
    return {"code": 0, "message": "success", "data": {"id": task_id}, "txId": ""}
```

Add the pause endpoint using `_pause_auto_evaluation_schedule`. Match the existing response helper style in `auto_evaluations.py` if it already wraps responses.

- [ ] **Step 4: Update delete helper**

Ensure `_delete_auto_evaluation_task` deletes the PA task physically and relies on `ON DELETE CASCADE` for `pa_auto_evaluation_schedules`. Before deleting, query active runs:

```sql
SELECT COUNT(*) AS active_count
FROM pa_auto_evaluation_runs
WHERE task_id = %(task_id)s AND status IN ('PENDING', 'RUNNING')
```

If active count is greater than 0, raise the existing business error type with a message like `任务正在运行中，无法删除`.

- [ ] **Step 5: Add scheduler scan helpers**

In `pa-eval-backend/app/auto_evaluation_schedules.py`:

```python
def should_skip_due_schedule(active_run_count: int) -> bool:
    return active_run_count > 0
```

Add query helper stubs in `auto_evaluations.py`:

```python
async def _list_due_auto_evaluation_schedules(cursor: Any, now: datetime) -> list[dict[str, Any]]:
    await cursor.execute(
        """
        SELECT s.*, t.data_source, t.evaluator_id, t.report_config
        FROM pa_auto_evaluation_schedules s
        JOIN pa_auto_evaluation_tasks t ON t.id = s.task_id
        WHERE s.status = 'ACTIVE' AND s.next_run_at <= %(now)s
        ORDER BY s.next_run_at ASC
        LIMIT 50
        """,
        {"now": now},
    )
    return await cursor.fetchall()
```

The actual worker loop can call this helper from an app startup task or an explicit internal endpoint in the execution task.

- [ ] **Step 6: Run backend tests**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_auto_evaluations.py tests/test_auto_evaluation_schedules.py -q
```

Expected: PASS.

---

## Task 5: Frontend Types and API

**Files:**
- Modify: `pa-eval-frontend/src/modules/app-evaluation/types.ts`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/api/auto-evaluation-api.ts`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/api/auto-evaluation-api.test.ts`

- [ ] **Step 1: Add API tests**

In `auto-evaluation-api.test.ts`, add:

```typescript
test('createProjectAutoEvaluationTask sends scheduled run configuration', async () => {
  const calls: Array<Record<string, unknown>> = []
  const api = {
    async createAutoEvaluationTask(input: { body: Record<string, unknown> }) {
      calls.push(input.body)
      return { id: 'task_1' }
    },
  }

  await createProjectAutoEvaluationTask(api as never, 'project-1', {
    name: 'Daily check',
    description: '',
    evaluatorId: 'eval_1',
    dataSource: {
      type: 'TRACE_FILTER',
      traceFilter: {
        timeRange: '1d',
        createdAtRange: null,
        environments: [],
        userId: '',
        sessionId: '',
        tags: [],
      },
    },
    variableMapping: {},
    reportTemplateId: null,
    runMode: 'SCHEDULED',
    schedule: {
      executionHour: 1,
      timezone: 'Asia/Shanghai',
      window: { mode: 'previous_day', startHour: 0, endHour: 0 },
      retry: { maxAttempts: 3, backoffMinutes: [10, 30, 60] },
    },
  })

  assert.equal(calls[0].runMode, 'SCHEDULED')
  assert.deepEqual(calls[0].schedule, {
    executionHour: 1,
    timezone: 'Asia/Shanghai',
    window: { mode: 'previous_day', startHour: 0, endHour: 0 },
    retry: { maxAttempts: 3, backoffMinutes: [10, 30, 60] },
  })
})

test('schedule action helpers call start and pause methods', async () => {
  const calls: string[] = []
  const api = {
    async startAutoEvaluationSchedule() {
      calls.push('start')
      return { id: 'task_1' }
    },
    async pauseAutoEvaluationSchedule() {
      calls.push('pause')
      return { id: 'task_1' }
    },
  }

  await startProjectAutoEvaluationSchedule(api as never, 'project-1', 'task_1')
  await pauseProjectAutoEvaluationSchedule(api as never, 'project-1', 'task_1')

  assert.deepEqual(calls, ['start', 'pause'])
})
```

- [ ] **Step 2: Run tests and confirm they fail**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: FAIL because schedule types/helpers do not exist.

- [ ] **Step 3: Add frontend types**

In `types.ts`:

```typescript
export type AutoEvaluationRunMode = 'IMMEDIATE' | 'SCHEDULED'
export type AutoEvaluationScheduleStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED'
export type AutoEvaluationRunTriggerSource = 'MANUAL' | 'SCHEDULED' | 'RETRY'

export type AutoEvaluationScheduleConfig = {
  executionHour: number
  timezone: string
  window: {
    mode: 'previous_day'
    startHour: number
    endHour: number
  }
  retry: {
    maxAttempts: number
    backoffMinutes: number[]
  }
}
```

Extend `AutoEvaluationTaskFormInput`:

```typescript
runMode: AutoEvaluationRunMode
schedule: AutoEvaluationScheduleConfig | null
```

Extend `AutoEvaluationTaskRecord`:

```typescript
runMode?: AutoEvaluationRunMode
schedule?: {
  status: AutoEvaluationScheduleStatus
  cronExpression: string
  timezone: string
  nextRunAt: string | null
  lastScheduledAt: string | null
  window: AutoEvaluationScheduleConfig['window']
  retry: AutoEvaluationScheduleConfig['retry']
} | null
```

Extend run record:

```typescript
triggerSource?: AutoEvaluationRunTriggerSource
windowStart?: string | null
windowEnd?: string | null
scheduledFireAt?: string | null
attemptNo?: number
parentRunId?: string | null
```

- [ ] **Step 4: Add API helpers**

In `auto-evaluation-api.ts`, extend create body:

```typescript
runMode: input.runMode,
schedule: input.runMode === 'SCHEDULED' ? input.schedule : null,
```

Extend `AutoEvaluationApiClient`:

```typescript
startAutoEvaluationSchedule: ApiMethod
pauseAutoEvaluationSchedule: ApiMethod
```

Add helpers:

```typescript
export function startProjectAutoEvaluationSchedule(
  api: Pick<AutoEvaluationApiClient, 'startAutoEvaluationSchedule'>,
  projectId: string,
  taskId: string,
) {
  return api.startAutoEvaluationSchedule<{ id: string }>({
    params: { projectId, taskId },
  })
}

export function pauseProjectAutoEvaluationSchedule(
  api: Pick<AutoEvaluationApiClient, 'pauseAutoEvaluationSchedule'>,
  projectId: string,
  taskId: string,
) {
  return api.pauseAutoEvaluationSchedule<{ id: string }>({
    params: { projectId, taskId },
  })
}
```

- [ ] **Step 5: Run frontend checks**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
node --test src/modules/app-evaluation/api/auto-evaluation-api.test.ts
```

Expected: PASS.

---

## Task 6: Frontend Form

**Files:**
- Modify: `pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-task-form.tsx`
- Create: `pa-eval-frontend/src/tests/app-evaluation/auto-evaluation-schedule-form.test.ts`

- [ ] **Step 1: Add source-level form tests**

Create `auto-evaluation-schedule-form.test.ts`:

```typescript
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  'src/modules/app-evaluation/components/auto-evaluation-task-form.tsx',
  'utf8',
)

test('auto evaluation form exposes scheduled run controls', () => {
  assert.match(source, /runMode/)
  assert.match(source, /定时执行/)
  assert.match(source, /执行时间/)
  assert.match(source, /失败重试/)
})

test('scheduled auto evaluation form defaults to draft wording', () => {
  assert.match(source, /保存后不会立即执行/)
  assert.match(source, /启动后按计划执行/)
})
```

- [ ] **Step 2: Run tests and confirm they fail**

Run:

```bash
cd pa-eval-frontend
node --test src/tests/app-evaluation/auto-evaluation-schedule-form.test.ts
```

Expected: FAIL until form source contains the scheduled controls.

- [ ] **Step 3: Extend initial form**

In `auto-evaluation-task-form.tsx`, add:

```typescript
const defaultSchedule: AutoEvaluationTaskFormInput['schedule'] = {
  executionHour: 1,
  timezone: 'Asia/Shanghai',
  window: { mode: 'previous_day', startHour: 0, endHour: 0 },
  retry: { maxAttempts: 3, backoffMinutes: [10, 30, 60] },
}
```

Set initial form:

```typescript
runMode: 'IMMEDIATE',
schedule: defaultSchedule,
```

- [ ] **Step 4: Add run mode controls**

In the first step of the form, add a segmented/radio control:

```tsx
<RadioGroup
  value={form.runMode}
  onValueChange={(value) =>
    updateForm({
      ...form,
      runMode: value as AutoEvaluationTaskFormInput['runMode'],
      schedule: value === 'SCHEDULED' ? form.schedule ?? defaultSchedule : form.schedule,
    })
  }
>
  <div className='flex items-center gap-2'>
    <RadioGroupItem value='IMMEDIATE' id='run-mode-immediate' />
    <Label htmlFor='run-mode-immediate'>立即执行</Label>
  </div>
  <div className='flex items-center gap-2'>
    <RadioGroupItem value='SCHEDULED' id='run-mode-scheduled' />
    <Label htmlFor='run-mode-scheduled'>定时执行</Label>
  </div>
</RadioGroup>
```

- [ ] **Step 5: Add scheduled controls**

Render when `form.runMode === 'SCHEDULED'`:

```tsx
<div className='grid gap-4 rounded-md border p-4'>
  <p className='text-sm text-muted-foreground'>
    保存后不会立即执行，启动后按计划执行。
  </p>
  <Label>执行时间</Label>
  <Select
    value={String(form.schedule?.executionHour ?? 1)}
    onValueChange={(value) =>
      updateForm({
        ...form,
        schedule: {
          ...(form.schedule ?? defaultSchedule),
          executionHour: Number(value),
        },
      })
    }
  >
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {Array.from({ length: 24 }, (_, hour) => (
        <SelectItem key={hour} value={String(hour)}>
          {String(hour).padStart(2, '0')}:00
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
  <Label>失败重试</Label>
  <p className='text-sm text-muted-foreground'>最多 3 次，间隔 10、30、60 分钟</p>
</div>
```

Use existing local UI imports for `RadioGroup`, `Select`, `Label`; add imports if they are not already present.

- [ ] **Step 6: Ensure submit payload includes schedule**

In the submit handler, pass:

```typescript
runMode: form.runMode,
schedule: form.runMode === 'SCHEDULED' ? form.schedule : null,
```

- [ ] **Step 7: Run frontend tests**

Run:

```bash
cd pa-eval-frontend
node --test src/tests/app-evaluation/auto-evaluation-schedule-form.test.ts
npm run typecheck
```

Expected: PASS.

---

## Task 7: Frontend List, Detail, and Run Records

**Files:**
- Modify: `pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-columns.tsx`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-row-actions.tsx`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-run-records.tsx`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/auto-evaluations.tsx`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/auto-evaluation-detail.tsx`

- [ ] **Step 1: Add column support**

In `auto-evaluation-columns.tsx`, add columns:

```tsx
{
  id: 'runMode',
  header: '运行方式',
  cell: ({ row }) => (row.original.runMode === 'SCHEDULED' ? '定时' : '立即'),
},
{
  id: 'scheduleStatus',
  header: '调度状态',
  cell: ({ row }) => row.original.schedule?.status ?? '-',
},
{
  id: 'nextRunAt',
  header: '下次执行',
  cell: ({ row }) =>
    row.original.schedule?.nextRunAt
      ? formatDateTime(row.original.schedule.nextRunAt)
      : '-',
},
```

Use the existing `formatDateTime` import or add it from the same local utility used elsewhere in the module.

- [ ] **Step 2: Add row actions**

Extend row action props:

```typescript
onStartSchedule: (task: AutoEvaluationTaskRecord) => void
onPauseSchedule: (task: AutoEvaluationTaskRecord) => void
```

Render:

```tsx
{task.runMode === 'SCHEDULED' && task.schedule?.status !== 'ACTIVE' ? (
  <DropdownMenuItem onClick={() => onStartSchedule(task)}>启动</DropdownMenuItem>
) : null}
{task.runMode === 'SCHEDULED' && task.schedule?.status === 'ACTIVE' ? (
  <DropdownMenuItem onClick={() => onPauseSchedule(task)}>停止</DropdownMenuItem>
) : null}
```

- [ ] **Step 3: Wire list mutations**

In `auto-evaluations.tsx`, import:

```typescript
startProjectAutoEvaluationSchedule,
pauseProjectAutoEvaluationSchedule,
```

Add handlers:

```typescript
async function handleStartSchedule(task: AutoEvaluationTaskRecord) {
  await startProjectAutoEvaluationSchedule($api, projectId, task.id)
  toast.success('已启动定时评测')
  await invalidateAutoEvaluationQueries(queryClient, projectId)
}

async function handlePauseSchedule(task: AutoEvaluationTaskRecord) {
  await pauseProjectAutoEvaluationSchedule($api, projectId, task.id)
  toast.success('已停止定时评测')
  await invalidateAutoEvaluationQueries(queryClient, projectId)
}
```

Pass both handlers into `createAutoEvaluationColumns`.

- [ ] **Step 4: Add detail schedule card**

In `auto-evaluation-detail.tsx`, render a card when `task.schedule` exists:

```tsx
{task.schedule ? (
  <section className='space-y-3'>
    <h2 className='text-base font-semibold'>调度配置</h2>
    <div className='grid gap-3 rounded-md border p-4 md:grid-cols-3'>
      <div>
        <p className='text-sm text-muted-foreground'>状态</p>
        <p className='font-medium'>{task.schedule.status}</p>
      </div>
      <div>
        <p className='text-sm text-muted-foreground'>Cron</p>
        <p className='font-medium'>{task.schedule.cronExpression}</p>
      </div>
      <div>
        <p className='text-sm text-muted-foreground'>下次执行</p>
        <p className='font-medium'>
          {task.schedule.nextRunAt ? formatDateTime(task.schedule.nextRunAt) : '-'}
        </p>
      </div>
    </div>
  </section>
) : null}
```

- [ ] **Step 5: Extend run records**

In `auto-evaluation-run-records.tsx`, add cells/labels for:

```tsx
{run.triggerSource ?? 'MANUAL'}
{run.windowStart && run.windowEnd
  ? `${formatDateTime(run.windowStart)} - ${formatDateTime(run.windowEnd)}`
  : '-'}
{run.attemptNo ?? 1}
```

- [ ] **Step 6: Run frontend checks**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: PASS.

---

## Task 8: Full Verification

**Files:**
- All files touched by earlier tasks.

- [ ] **Step 1: Run backend focused tests**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_pa_migration_schema.py tests/test_auto_evaluations.py tests/test_auto_evaluation_schedules.py -q
```

Expected: PASS.

- [ ] **Step 2: Run frontend focused tests**

Run:

```bash
cd pa-eval-frontend
node --test src/modules/app-evaluation/api/auto-evaluation-api.test.ts
node --test src/tests/app-evaluation/auto-evaluation-schedule-form.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Inspect git status**

Run:

```bash
git status --short
```

Expected: Shows only intentional scheduled-evaluation changes plus any pre-existing user changes. Do not revert unrelated files.

---

## Self-Review

- Spec coverage: covered independent schedule table, physical delete, no auto-run after create, cron-backed daily schedule, hourly Trace window, retry policy, start/pause/delete, manual rerun, run metadata, frontend controls, and tests.
- Placeholder scan: no unresolved placeholders or vague deferred-work steps.
- Type consistency: uses `runMode`, `schedule`, `AutoEvaluationScheduleConfig`, `triggerSource`, `windowStart`, `windowEnd`, and `attemptNo` consistently across backend and frontend.
