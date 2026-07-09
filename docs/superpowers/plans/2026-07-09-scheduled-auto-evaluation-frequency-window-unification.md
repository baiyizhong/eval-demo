# Scheduled Auto Evaluation Frequency Window Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Unify scheduled auto evaluation frequency and Trace data window so half-hourly and hourly schedules evaluate only their incremental interval, while daily schedules keep the previous natural day window.

**Architecture:** Extend the existing Plus-layer schedule helper as the single source of truth for cron generation, next fire time, and Trace window calculation. Keep frontend schedule UX frequency-driven: users select a frequency, and the Trace window becomes read-only derived text. Preserve manual immediate runs as fixed-window runs.

**Tech Stack:** FastAPI, Pydantic, psycopg, PostgreSQL JSONB, React, TypeScript, Vitest/node:test-style source tests.

---

## File Map

- Modify `pa-eval-backend/app/auto_evaluation_schedules.py`: add frequency constants, rolling interval window config, cron generation, next-fire parsing for `*/30`, `0 *`, and daily cron, plus unified scheduled window computation.
- Modify `pa-eval-backend/app/auto_evaluations.py`: accept `schedule.frequency`, normalize schedule windows, save rolling interval configs, use unified next-fire logic when starting schedules, and return schedule data to the frontend.
- Modify `pa-eval-backend/tests/test_auto_evaluation_schedules.py`: cover cron generation, next fire time, rolling interval windows, previous-day daily windows, and validation.
- Modify `pa-eval-frontend/src/modules/app-evaluation/types.ts`: add frequency and rolling interval schedule window types.
- Modify `pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-task-form.tsx`: replace editable Trace window time inputs with execution frequency controls and read-only derived Trace range text.
- Modify `pa-eval-frontend/src/modules/app-evaluation/views/auto-evaluation-detail.tsx`: display rolling interval windows correctly.
- Modify `pa-eval-frontend/src/tests/app-evaluation/auto-evaluation-schedule-form.test.ts`: update source assertions to the unified frequency/window UX.

## Task 1: Backend Schedule Helper

**Files:**
- Modify: `pa-eval-backend/app/auto_evaluation_schedules.py`
- Test: `pa-eval-backend/tests/test_auto_evaluation_schedules.py`

- [x] **Step 1: Write failing schedule helper tests**

Add tests for:

```python
def test_build_cron_expression_for_supported_frequencies() -> None:
    assert build_schedule_cron_expression("HALF_HOURLY", 1) == "*/30 * * * *"
    assert build_schedule_cron_expression("HOURLY", 1) == "0 * * * *"
    assert build_schedule_cron_expression("DAILY", 1) == "0 1 * * *"
```

```python
def test_compute_next_fire_at_supports_half_hourly_and_hourly() -> None:
    now = datetime(2026, 7, 9, 4, 10, tzinfo=timezone.utc)
    half_hourly = compute_next_fire_at("*/30 * * * *", "Asia/Shanghai", now)
    hourly = compute_next_fire_at("0 * * * *", "Asia/Shanghai", now)
    assert half_hourly.isoformat() == "2026-07-09T12:30:00+08:00"
    assert hourly.isoformat() == "2026-07-09T13:00:00+08:00"
```

```python
def test_compute_schedule_window_uses_rolling_interval() -> None:
    window = compute_schedule_window(
        datetime(2026, 7, 9, 5, 0, tzinfo=timezone.utc),
        "Asia/Shanghai",
        ScheduleWindowConfig(mode="rolling_interval", intervalMinutes=60),
    )
    assert window.start.isoformat() == "2026-07-09T12:00:00+08:00"
    assert window.end.isoformat() == "2026-07-09T13:00:00+08:00"
```

- [x] **Step 2: Run failing backend schedule tests**

Run: `cd pa-eval-backend && uv run pytest tests/test_auto_evaluation_schedules.py -q`

Expected: FAIL because new helper names and rolling interval mode do not exist yet.

- [x] **Step 3: Implement helper changes**

Implement:

```python
ScheduleFrequency = Literal["HALF_HOURLY", "HOURLY", "DAILY"]

class ScheduleWindowConfig(BaseModel):
    mode: Literal["rolling_interval", "previous_day"] = "rolling_interval"
    intervalMinutes: int = Field(default=60, ge=1, le=1440)
    startHour: int = Field(default=0, ge=0, le=23)
    endHour: int = Field(default=0, ge=0, le=23)

def build_schedule_cron_expression(frequency: ScheduleFrequency, hour: int = 1) -> str:
    if frequency == "HALF_HOURLY":
        return "*/30 * * * *"
    if frequency == "HOURLY":
        return "0 * * * *"
    return build_daily_cron_expression(hour)
```

Add `compute_next_fire_at()` that accepts `*/30 * * * *`, `0 * * * *`, and delegates daily cron to the existing daily calculation. Add `compute_rolling_interval_window()` and `compute_schedule_window()` that dispatch by `config.mode`.

- [x] **Step 4: Run backend schedule tests**

Run: `cd pa-eval-backend && uv run pytest tests/test_auto_evaluation_schedules.py -q`

Expected: PASS.

## Task 2: Backend API and Persistence

**Files:**
- Modify: `pa-eval-backend/app/auto_evaluations.py`
- Test: `pa-eval-backend/tests/test_auto_evaluations.py`

- [x] **Step 1: Add API-facing schedule frequency support**

Update `ScheduleConfig`:

```python
class ScheduleConfig(BaseModel):
    frequency: ScheduleFrequency = Field(default="DAILY")
    execution_hour: int = Field(default=1, alias="executionHour", ge=0, le=23)
    timezone: str = Field(default="Asia/Shanghai", min_length=1)
    window: ScheduleWindowConfig | None = None
    retry: RetryPolicy = Field(default_factory=RetryPolicy)
```

Normalize the effective window in a model validator:

```python
if self.frequency == "HALF_HOURLY":
    self.window = ScheduleWindowConfig(mode="rolling_interval", intervalMinutes=30)
elif self.frequency == "HOURLY":
    self.window = ScheduleWindowConfig(mode="rolling_interval", intervalMinutes=60)
else:
    self.window = ScheduleWindowConfig(mode="previous_day", startHour=0, endHour=0)
```

- [x] **Step 2: Save unified cron/window config**

Replace `build_daily_cron_expression(schedule.execution_hour)` with:

```python
build_schedule_cron_expression(schedule.frequency, schedule.execution_hour)
```

Persist `window_config` from the normalized schedule window. Do not add a database migration unless tests show existing JSONB fields cannot carry the new shape.

- [x] **Step 3: Start schedules with unified next-fire logic**

Replace `compute_next_daily_fire_at(...)` with `compute_next_fire_at(...)` in `_start_auto_evaluation_schedule()`.

- [x] **Step 4: Normalize schedule records for frontend**

Update `_normalize_schedule_window()` to preserve:

```python
{"mode": "rolling_interval", "intervalMinutes": 30}
{"mode": "rolling_interval", "intervalMinutes": 60}
{"mode": "previous_day", "startHour": 0, "endHour": 0}
```

Add a `_derive_schedule_frequency(cron_expression, window_config)` helper returning `HALF_HOURLY`, `HOURLY`, or `DAILY`, and include `"frequency"` in the schedule object returned by `_to_task()`.

- [x] **Step 5: Run backend tests**

Run: `cd pa-eval-backend && uv run pytest tests/test_auto_evaluation_schedules.py tests/test_auto_evaluations.py -q`

Expected: PASS.

## Task 3: Frontend Types and Form UX

**Files:**
- Modify: `pa-eval-frontend/src/modules/app-evaluation/types.ts`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-task-form.tsx`
- Test: `pa-eval-frontend/src/tests/app-evaluation/auto-evaluation-schedule-form.test.ts`

- [x] **Step 1: Update TypeScript schedule types**

Use:

```ts
export type AutoEvaluationScheduleFrequency = 'HALF_HOURLY' | 'HOURLY' | 'DAILY'

export type AutoEvaluationScheduleWindow =
  | { mode: 'rolling_interval'; intervalMinutes: number }
  | { mode: 'previous_day'; startHour: number; endHour: number }

export type AutoEvaluationScheduleConfig = {
  frequency: AutoEvaluationScheduleFrequency
  executionHour: number
  timezone: string
  window: AutoEvaluationScheduleWindow
  retry: AutoEvaluationScheduleRetry
}
```

- [x] **Step 2: Replace editable Trace window controls**

Change scheduled Trace UI from time inputs to read-only derived copy:

```tsx
<Field label='Trace 数据范围' description={getScheduleTraceWindowDescription(schedule)}>
  <div className='rounded-md border p-3 text-sm'>
    {getScheduleTraceWindowSummary(schedule)}
  </div>
</Field>
```

Add frequency selection in scheduled config:

```tsx
<ToggleGroup type='single' value={schedule.frequency} onValueChange={...}>
  <ToggleGroupItem value='HALF_HOURLY'>每 30 分钟</ToggleGroupItem>
  <ToggleGroupItem value='HOURLY'>每小时</ToggleGroupItem>
  <ToggleGroupItem value='DAILY'>每天</ToggleGroupItem>
</ToggleGroup>
```

When frequency changes, update `window` to `rolling_interval(30)`, `rolling_interval(60)`, or `previous_day`.

- [x] **Step 3: Update preview range calculation**

Replace `createSchedulePreviewTraceDateTimeRange(schedule.window)` with a function that accepts the whole schedule:

```ts
function createSchedulePreviewTraceDateTimeRange(schedule: AutoEvaluationScheduleConfig) {
  if (schedule.frequency === 'HALF_HOURLY') return createRollingPreviewRange(30)
  if (schedule.frequency === 'HOURLY') return createRollingPreviewRange(60)
  return createPreviousDayPreviewRange()
}
```

- [x] **Step 4: Update frontend source tests**

Assertions should require:

```ts
assert.match(source, /frequency:\s*'DAILY'/)
assert.match(source, /每 30 分钟/)
assert.match(source, /每小时/)
assert.match(source, /Trace 数据范围/)
assert.match(source, /rolling_interval/)
assert.doesNotMatch(source, /parseScheduleTimeInput/)
assert.doesNotMatch(source, /step=\{3600\}/)
```

- [x] **Step 5: Run frontend tests**

Run: `cd pa-eval-frontend && npm test -- src/tests/app-evaluation/auto-evaluation-schedule-form.test.ts`

Expected: PASS.

## Task 4: Detail Display and Verification

**Files:**
- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/auto-evaluation-detail.tsx`
- Test: `pa-eval-frontend/src/tests/app-evaluation/auto-evaluation-schedule-list-detail.test.ts`

- [x] **Step 1: Display rolling interval windows**

Update detail helpers so:

```ts
rolling_interval + 30 => '触发前 30 分钟'
rolling_interval + 60 => '触发前 1 小时'
previous_day => '上一自然日 00:00 - 当天 00:00'
```

- [x] **Step 2: Update list/detail source tests**

Assert detail source contains `rolling_interval`, `触发前 30 分钟`, and `上一自然日`.

- [x] **Step 3: Run combined verification**

Run:

```bash
cd pa-eval-backend && uv run pytest tests/test_auto_evaluation_schedules.py tests/test_auto_evaluations.py -q
cd ../pa-eval-frontend && npm test -- src/tests/app-evaluation/auto-evaluation-schedule-form.test.ts src/tests/app-evaluation/auto-evaluation-schedule-list-detail.test.ts
```

Expected: PASS.

## Notes

- Do not modify `langfuse/` or `dify/`.
- Do not commit, push, or create PRs unless the user explicitly asks.
- Do not add Alembic migrations for this change unless a new physical column becomes necessary; JSONB `window_config` already supports the new window shape.
