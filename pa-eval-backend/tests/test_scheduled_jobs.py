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
    _build_auto_evaluation_payload_from_job,
    _build_experiment_execution_name,
    _build_job_triggered_auto_evaluation_name,
    _compute_next_run_at,
    _compute_trace_window,
    _normalize_auto_evaluation_data_source,
    _normalize_variable_mapping,
    _scheduled_job_insert_params,
    _scheduled_job_write_row,
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
        if "RETURNING" in sql and "pa_job_executions" in sql:
            self._next_fetchone = {
                "id": (params or {}).get("id"),
                "legacy_source_id": (params or {}).get("legacy_source_id"),
            }
        elif "RETURNING" in sql and "pa_evaluation_jobs" in sql:
            self._next_fetchone = {"id": (params or {}).get("id")}
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


def test_due_job_claim_ignores_expired_running_execution_leases() -> None:
    sql = _build_due_job_claim_sql()

    assert "execution.lock_until > %(now)s" in sql


def test_job_triggered_auto_evaluation_name_uses_required_format() -> None:
    name = _build_job_triggered_auto_evaluation_name(
        "每日客服质量评测",
        datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
        "Asia/Shanghai",
    )

    assert name == "【JOB触发】每日客服质量评测-202607090900"


def test_job_triggered_auto_evaluation_name_truncates_long_job_name() -> None:
    name = _build_job_triggered_auto_evaluation_name(
        "批量定时任务-7132048-12-超长任务名称",
        datetime(2026, 7, 29, 7, 35, tzinfo=timezone.utc),
        "Asia/Shanghai",
    )

    assert len(name) <= 40
    assert name.startswith("【JOB触发】")
    assert name.endswith("-202607291535")


def test_scheduled_job_insert_params_persists_score_mapping() -> None:
    payload = scheduled_jobs.CreateScheduledJobPayload.model_validate(
        {
            "name": "每日质量评测",
            "description": "",
            "scoreName": "quality",
            "scoreMapping": {
                "quality_score": {
                    "scoreConfigId": "score-config-quality",
                    "scoreConfigName": "回答质量",
                }
            },
            "runMode": "ONCE",
            "frequency": {"kind": "ONCE", "runAt": "2026-07-10T10:00:00+08:00"},
            "evaluatorId": "evaluator-1",
            "dataSource": {"type": "TRACE_FILTER"},
        }
    )

    params = _scheduled_job_insert_params(
        job_id="pajob-1",
        project_id="project-1",
        payload=payload,
        evaluator={
            "id": "evaluator-1",
            "name": "Dify 评估器",
            "type": "WORKFLOW",
            "provider": "DIFY",
            "version": 1,
            "variables": ["input"],
            "output_variables": ["quality_score"],
        },
        report_template_snapshot={"id": "default"},
        next_run_at=None,
        user=scheduled_jobs.CurrentUserContext(
            user_id="user-1",
            email="owner@example.com",
        ),
        now=datetime(2026, 7, 9, tzinfo=timezone.utc),
    )

    assert params["score_mapping"].obj == {
        "quality_score": {
            "scoreConfigId": "score-config-quality",
            "scoreConfigName": "回答质量",
        }
    }
    assert params["evaluator_snapshot"].obj["outputVariables"] == ["quality_score"]


def test_run_experiment_payload_persists_binding_without_evaluator_lookup() -> None:
    payload = scheduled_jobs.CreateScheduledJobPayload.model_validate(
        {
            "taskType": "RUN_EXPERIMENT",
            "binding": {
                "type": "RUN_EXPERIMENT",
                "targetId": "scene-1",
                "targetName": "客服召回场景",
                "targetDescription": "按场景运行试验",
            },
            "name": "每周场景回归",
            "description": "",
            "runMode": "RECURRING",
            "frequency": {"kind": "DAILY", "timeOfDay": "09:00"},
        }
    )

    params = _scheduled_job_insert_params(
        job_id="pajob-1",
        project_id="project-1",
        payload=payload,
        evaluator={},
        report_template_snapshot={},
        next_run_at=None,
        user=scheduled_jobs.CurrentUserContext(
            user_id="user-1",
            email="owner@example.com",
        ),
        now=datetime(2026, 7, 9, tzinfo=timezone.utc),
    )

    assert params["score_name"] == ""
    assert params["evaluator_id"] == ""
    assert params["report_template_id"] is None
    assert params["frequency"].obj == {"kind": "DAILY", "timeOfDay": "09:00"}
    assert params["badcase_config"].obj == {"enabled": False, "threshold": None}


def test_scheduled_job_write_row_carries_run_experiment_binding() -> None:
    payload = scheduled_jobs.CreateScheduledJobPayload.model_validate(
        {
            "taskType": "RUN_EXPERIMENT",
            "binding": {
                "type": "RUN_EXPERIMENT",
                "targetId": "scene-1",
                "targetName": "客服召回场景",
                "targetDescription": "按场景运行试验",
            },
            "name": "每周场景回归",
            "runMode": "ONCE",
            "frequency": {"kind": "ONCE", "runAt": "2026-07-10T10:00:00+08:00"},
        }
    )

    row = _scheduled_job_write_row(
        job_id="pajob-1",
        project_id="project-1",
        payload=payload,
        evaluator={},
        report_template_snapshot={},
        next_run_at=None,
        status="NOT_STARTED",
        user=scheduled_jobs.CurrentUserContext(
            user_id="user-1",
            email="owner@example.com",
        ),
    )

    assert row["task_type"] == "RUN_EXPERIMENT"
    assert row["binding"] == {
        "type": "RUN_EXPERIMENT",
        "targetId": "scene-1",
        "targetName": "客服召回场景",
        "targetDescription": "按场景运行试验",
    }
    assert row["evaluator_id"] == ""
    assert row["report_template_id"] is None


def test_consolidated_scheduled_job_select_reads_task_type_and_binding() -> None:
    sql = scheduled_jobs._consolidated_scheduled_job_select_sql()

    assert "job.schedule_config ->> 'taskType'" in sql
    assert "AS task_type" in sql
    assert "job.schedule_config -> 'binding'" in sql
    assert "AS binding" in sql
    assert "'AUTO_EVALUATION'::text AS task_type" not in sql


def test_consolidated_execution_log_select_reads_task_type_and_experiment_fields() -> None:
    sql = scheduled_jobs._consolidated_execution_log_select_sql()

    assert "execution.request_payload ->> 'taskType'" in sql
    assert "AS task_type" in sql
    assert "execution.request_payload ->> 'sceneName' AS scene_name" in sql
    assert "execution.result_payload ->> 'experimentReportId' AS experiment_report_id" in sql
    assert "'AUTO_EVALUATION'::text AS task_type" not in sql


def test_to_scheduled_job_includes_binding_snapshot() -> None:
    job = scheduled_jobs._to_scheduled_job(
        {
            "id": "pajob-1",
            "project_id": "project-1",
            "task_type": "RUN_EXPERIMENT",
            "binding": {
                "type": "RUN_EXPERIMENT",
                "targetId": "scene-1",
                "targetName": "客服召回场景",
                "targetDescription": "按场景运行试验",
            },
            "run_mode": "ONCE",
            "frequency": {"kind": "ONCE", "runAt": "2026-07-10T10:00:00+08:00"},
            "status": "NOT_STARTED",
        }
    )

    assert job["type"] == "RUN_EXPERIMENT"
    assert job["binding"]["targetId"] == "scene-1"


def test_build_experiment_execution_name_uses_job_and_scene_name() -> None:
    assert _build_experiment_execution_name(
        "每周场景回归",
        "客服召回场景",
        datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
        "Asia/Shanghai",
    ) == "【定时试验】客服召回场景-202607090900"


def test_build_auto_evaluation_payload_from_job_carries_score_mapping() -> None:
    payload = _build_auto_evaluation_payload_from_job(
        {
            "description": "",
            "score_name": "quality",
            "score_mapping": {
                "quality_score": {
                    "scoreConfigId": "score-config-quality",
                    "scoreConfigName": "回答质量",
                }
            },
            "timezone": "Asia/Shanghai",
            "evaluator_id": "evaluator-1",
            "sample_rate": 100,
            "variable_mapping": {},
            "data_source": {"type": "TRACE_FILTER"},
            "report_template_id": "default",
            "report_template_snapshot": {"id": "default"},
        },
        "【JOB触发】每日质量评测-202607090900",
        datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
    )

    assert payload.score_mapping == {
        "quality_score": {
            "scoreConfigId": "score-config-quality",
            "scoreConfigName": "回答质量",
        }
    }


def test_due_job_claim_sql_uses_postgres_skip_locked_and_lease() -> None:
    sql = _build_due_job_claim_sql()

    assert "FOR UPDATE SKIP LOCKED" in sql
    assert "update_date <= %(stale_before)s" in sql
    assert "scheduler_enabled IS TRUE" in sql
    assert "NOT EXISTS" in sql
    assert "pa_job_executions" in sql
    assert "execution.status = 'RUNNING'" in sql
    assert "RETURNING job.*" in sql


def test_scheduled_job_update_preserves_runtime_and_creator_state() -> None:
    payload = scheduled_jobs.UpdateScheduledJobPayload.model_validate(
        {
            "name": "每日评测",
            "scoreName": "quality",
            "runMode": "RECURRING",
            "frequency": {"kind": "EVERY_MINUTES", "intervalMinutes": 10},
            "evaluatorId": "evaluator-1",
            "dataSource": {"type": "TRACE_FILTER"},
        }
    )
    row = _scheduled_job_write_row(
        job_id="job-1",
        project_id="project-1",
        payload=payload,
        evaluator={
            "id": "evaluator-1",
            "name": "Evaluator",
            "type": "WORKFLOW",
            "provider": "DIFY",
            "version": 1,
        },
        report_template_snapshot={"id": "default"},
        next_run_at=None,
        status="SUCCEEDED",
        user=scheduled_jobs.CurrentUserContext(
            user_id="editor-1",
            email="editor@example.com",
            name="Editor",
        ),
        existing={
            "created_user_id": "creator-1",
            "last_run_at": "last-run",
            "latest_execution_id": "execution-1",
            "latest_report_id": "report-1",
        },
    )

    assert row["created_user_id"] == "creator-1"
    assert row["last_run_at"] == "last-run"
    assert row["latest_execution_id"] == "execution-1"
    assert row["latest_report_id"] == "report-1"


def test_unsupported_cron_expression_is_rejected() -> None:
    with pytest.raises(ValueError):
        _compute_next_run_at(
            ScheduledJobFrequencyPayload(kind="CRON", expression="* * 1 1 1"),
            "Asia/Shanghai",
            datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
        )


@pytest.mark.anyio
async def test_failed_trigger_does_not_overwrite_a_paused_scheduled_job() -> None:
    cursor = FakeCursor()

    await scheduled_jobs._mark_scheduled_job_trigger_failed(
        cursor,
        project_id="project-1",
        job={
            "id": "job-1",
            "run_mode": "RECURRING",
            "frequency": {"kind": "EVERY_MINUTES", "intervalMinutes": 10},
            "timezone": "Asia/Shanghai",
        },
        log_id="log-1",
        fire_at=datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
        fire_key="fire-1",
        started_at=datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
        error_message="failed",
        updated_by="worker",
    )

    updates = [sql for sql, _ in cursor.executions if "UPDATE pa_evaluation_jobs" in sql]
    assert len(updates) == 1
    assert "status != 'PAUSED'" in updates[0]
    assert "latest_execution_id" in updates[0]


@pytest.mark.anyio
async def test_completion_callback_does_not_overwrite_a_paused_scheduled_job(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class TaskCursor(FakeCursor):
        async def execute(
            self, sql: str, params: dict[str, Any] | None = None
        ) -> None:
            await super().execute(sql, params)
            if "legacy_source_type = 'AUTO_EVALUATION_TASK'" in sql:
                self._next_fetchone = {
                    "status": "COMPLETED",
                    "latest_report_id": "report-1",
                    "sample_count": 3,
                }

    cursor = TaskCursor()

    async def fake_connect(settings: Settings) -> FakeConnection:
        return FakeConnection(cursor)

    monkeypatch.setattr(scheduled_jobs, "_connect", fake_connect)

    await scheduled_jobs._sync_execution_log_from_auto_evaluation(
        Settings(),
        project_id="project-1",
        job_id="job-1",
        log_id="log-1",
        auto_task_id="task-1",
        updated_by="worker",
        started_at=datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
    )

    updates = [sql for sql, _ in cursor.executions if "UPDATE pa_evaluation_jobs" in sql]
    assert len(updates) == 1
    assert "status != 'PAUSED'" in updates[0]
    assert "latest_execution_id" in updates[0]


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
        if "UPDATE pa_job_executions" in sql
        and params.get("status") == "FAILED"
    ]
    job_updates = [
        (sql, params)
        for sql, params in cursor.executions
        if "UPDATE pa_evaluation_jobs" in sql and params.get("status") == "FAILED"
    ]

    assert failure_updates
    assert job_updates
    assert "evaluator provider unavailable" in failure_updates[-1][1]["error_message"]
    assert job_updates[-1][1]["next_run_at"] is not None


@pytest.mark.anyio
async def test_trigger_run_experiment_executes_scene_and_marks_log_succeeded(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = FakeCursor()

    async def fake_connect(settings: Settings) -> FakeConnection:
        return FakeConnection(cursor)

    class FakeSceneExperimentReader:
        def __init__(self, settings: Settings) -> None:
            self.settings = settings

        async def get_resource_extension(self, **kwargs: Any) -> dict[str, Any] | None:
            return {
                "payload": {
                    "id": "scene-1",
                    "enabled": True,
                    "supportsScheduledExecution": True,
                    "datasetId": "dataset-1",
                    "defaultScheduledWebhookIds": ["webhook-1"],
                    "webhooks": [{"id": "webhook-1", "name": "Webhook 1"}],
                    "evaluatorIds": ["eval-1"],
                    "runParameters": {
                        "concurrency": 5,
                        "timeoutSeconds": 30,
                        "retryCount": 2,
                        "rounds": 1,
                    },
                }
            }

    async def fake_run_scene_experiment(**kwargs: Any) -> dict[str, Any]:
        payload = kwargs["payload"]
        assert payload.scene_id == "scene-1"
        assert payload.webhook_ids == ["webhook-1"]
        assert payload.evaluator_ids == ["eval-1"]
        return {
            "group": {"id": "experiment_group_1"},
            "reports": [
                {
                    "id": "experiment_report_1",
                    "itemCount": 2,
                    "successfulItemCount": 2,
                    "failedItemCount": 0,
                }
            ],
        }

    monkeypatch.setattr(scheduled_jobs, "_connect", fake_connect)
    monkeypatch.setattr(
        scheduled_jobs,
        "LangfuseDatabaseReader",
        FakeSceneExperimentReader,
    )
    monkeypatch.setattr(scheduled_jobs, "run_scene_experiment", fake_run_scene_experiment)

    await scheduled_jobs._trigger_scheduled_job(
        settings=Settings(pa_eval_scheduler_instance_id="test-scheduler"),
        project_id="project-1",
        job={
            "id": "pajob_1",
            "project_id": "project-1",
            "name": "每日场景试验",
            "description": "",
            "task_type": "RUN_EXPERIMENT",
            "binding": {
                "type": "RUN_EXPERIMENT",
                "targetId": "scene-1",
                "targetName": "客服场景",
                "targetDescription": "",
                "sceneSnapshot": {
                    "id": "scene-1",
                    "datasetId": "dataset-1",
                    "defaultScheduledWebhookIds": ["webhook-1"],
                    "webhooks": [{"id": "webhook-1", "name": "Webhook 1"}],
                    "evaluatorIds": ["eval-1"],
                    "runParameters": {
                        "concurrency": 5,
                        "timeoutSeconds": 30,
                        "retryCount": 2,
                        "rounds": 1,
                    },
                },
            },
            "run_mode": "RECURRING",
            "frequency": {"kind": "EVERY_MINUTES", "intervalMinutes": 10},
            "timezone": "Asia/Shanghai",
            "created_user_id": "user-1",
            "create_by": "owner@example.com",
        },
        trigger_type="JOB",
        triggered_by="owner@example.com",
        scheduled_fire_at=datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
        manual_fire_key=None,
    )

    succeeded_execution_updates = [
        (sql, params)
        for sql, params in cursor.executions
        if "UPDATE pa_job_executions" in sql
        and params.get("status") == "SUCCEEDED"
    ]
    job_updates = [
        (sql, params)
        for sql, params in cursor.executions
        if "UPDATE pa_evaluation_jobs" in sql and params.get("status") == "SUCCEEDED"
    ]

    assert succeeded_execution_updates
    result_payload = succeeded_execution_updates[-1][1]["result_payload"].obj
    assert result_payload["experimentGroupId"] == "experiment_group_1"
    assert result_payload["reportIds"] == ["experiment_report_1"]
    assert job_updates
    assert job_updates[-1][1]["report_id"] == "experiment_report_1"
    assert job_updates[-1][1]["next_run_at"] is not None


@pytest.mark.anyio
async def test_trigger_recovers_expired_execution_with_same_fire_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class StaleExecutionCursor(FakeCursor):
        async def execute(
            self, sql: str, params: dict[str, Any] | None = None
        ) -> None:
            await super().execute(sql, params)
            if "INSERT INTO pa_job_executions" in sql:
                self._next_fetchone = {
                    "id": "paexec_scheduled_old-log",
                    "legacy_source_id": "old-log",
                    "status": "RUNNING",
                    "lock_until": datetime(2026, 7, 9, 0, 59, tzinfo=timezone.utc),
                }
            elif "status = 'RUNNING'" in sql and "lock_until <=" in sql:
                self._next_fetchone = {"id": "paexec_scheduled_old-log"}

    cursor = StaleExecutionCursor()
    evaluator_lookups = 0

    async def fake_connect(settings: Settings) -> FakeConnection:
        return FakeConnection(cursor)

    async def track_evaluator_lookup(*args: object, **kwargs: object) -> dict[str, Any]:
        nonlocal evaluator_lookups
        evaluator_lookups += 1
        return {}

    monkeypatch.setattr(scheduled_jobs, "_connect", fake_connect)
    monkeypatch.setattr(scheduled_jobs, "_get_pa_evaluator", track_evaluator_lookup)

    await scheduled_jobs._trigger_scheduled_job(
        settings=Settings(pa_eval_scheduler_instance_id="test-scheduler"),
        project_id="project-1",
        job={
            "id": "pajob_1",
            "project_id": "project-1",
            "name": "每日质量评测",
            "run_mode": "RECURRING",
            "frequency": {"kind": "EVERY_MINUTES", "intervalMinutes": 10},
            "timezone": "Asia/Shanghai",
            "evaluator_id": "evaluator-1",
            "created_user_id": "user-1",
        },
        trigger_type="JOB",
        triggered_by="owner@example.com",
        scheduled_fire_at=datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
        manual_fire_key=None,
    )

    failed_execution_updates = [
        (sql, params)
        for sql, params in cursor.executions
        if "UPDATE pa_job_executions" in sql and "lock_until <=" in sql
    ]
    advanced_job_updates = [
        params
        for sql, params in cursor.executions
        if "UPDATE pa_evaluation_jobs" in sql and params.get("status") == "FAILED"
    ]
    assert failed_execution_updates[-1][1]["id"] == "paexec_scheduled_old-log"
    assert advanced_job_updates[-1]["next_run_at"] is not None
    assert evaluator_lookups == 0
    stale_update_sql = next(
        sql
        for sql, _ in cursor.executions
        if "UPDATE pa_job_executions" in sql and "lock_until <=" in sql
    )
    assert "status = 'RUNNING'" in stale_update_sql
    assert "lock_owner = ''" in stale_update_sql
    assert "lock_owner = NULL" not in stale_update_sql


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("existing_status", "existing_lock_until"),
    [
        ("SUCCEEDED", datetime(2026, 7, 9, 0, 59, tzinfo=timezone.utc)),
        ("RUNNING", datetime(2099, 7, 9, 1, 0, tzinfo=timezone.utc)),
    ],
)
async def test_trigger_does_not_fail_completed_or_leased_execution_on_fire_key_conflict(
    monkeypatch: pytest.MonkeyPatch,
    existing_status: str,
    existing_lock_until: datetime,
) -> None:
    class ConflictCursor(FakeCursor):
        async def execute(
            self, sql: str, params: dict[str, Any] | None = None
        ) -> None:
            await super().execute(sql, params)
            if "INSERT INTO pa_job_executions" in sql:
                self._next_fetchone = {
                    "id": "paexec_scheduled_existing-log",
                    "legacy_source_id": "existing-log",
                    "status": existing_status,
                    "lock_until": existing_lock_until,
                }

    cursor = ConflictCursor()

    async def fake_connect(settings: Settings) -> FakeConnection:
        return FakeConnection(cursor)

    monkeypatch.setattr(scheduled_jobs, "_connect", fake_connect)

    await scheduled_jobs._trigger_scheduled_job(
        settings=Settings(pa_eval_scheduler_instance_id="test-scheduler"),
        project_id="project-1",
        job={
            "id": "pajob_1",
            "project_id": "project-1",
            "name": "每日质量评测",
            "run_mode": "RECURRING",
            "frequency": {"kind": "EVERY_MINUTES", "intervalMinutes": 10},
            "timezone": "Asia/Shanghai",
            "evaluator_id": "evaluator-1",
            "created_user_id": "user-1",
        },
        trigger_type="JOB",
        triggered_by="owner@example.com",
        scheduled_fire_at=datetime(2026, 7, 9, 1, 0, tzinfo=timezone.utc),
        manual_fire_key=None,
    )

    assert not any(
        params.get("status") == "FAILED" for _, params in cursor.executions
    )
    assert not any("UPDATE pa_evaluation_jobs" in sql for sql, _ in cursor.executions)


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
async def test_consolidated_scheduled_job_logs_read_from_job_executions(
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
        keyword=None,
        status=[],
        trigger_type=[],
        current_user=scheduled_jobs.CurrentUserContext(
            user_id="user-1",
            email="owner@example.com",
            name="Owner",
        ),
        settings=Settings(),
    )

    sql_text = "\n".join(sql for sql, _ in cursor.executions)
    assert "FROM pa_job_executions execution" in sql_text


@pytest.mark.anyio
async def test_delete_scheduled_job_does_not_run_execution_log_read_query(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = FakeCursor()
    cursor._next_fetchone = {"id": "job-1"}

    async def fake_connect(settings: Settings) -> FakeConnection:
        return FakeConnection(cursor)

    async def fake_ensure_access(*args: object, **kwargs: object) -> None:
        return None

    monkeypatch.setattr(scheduled_jobs, "_connect", fake_connect)
    monkeypatch.setattr(scheduled_jobs, "_ensure_project_access", fake_ensure_access)

    response = await scheduled_jobs.delete_scheduled_job(
        project_id="project-1",
        job_id="job-1",
        current_user=scheduled_jobs.CurrentUserContext(
            user_id="user-1",
            email="owner@example.com",
            name="Owner",
        ),
        settings=Settings(),
    )

    sql_text = "\n".join(sql for sql, _ in cursor.executions)
    assert response["data"] == {"id": "job-1"}
    assert "DELETE FROM pa_job_executions" in sql_text
    assert "DELETE FROM pa_evaluation_jobs" in sql_text
    assert "FROM pa_job_executions execution" not in sql_text

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


@pytest.mark.anyio
async def test_list_scheduled_job_logs_searches_joined_auto_evaluation_task_name(
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
        keyword="自动评测任务A",
        status=[],
        trigger_type=[],
        current_user=scheduled_jobs.CurrentUserContext(
            user_id="user-1",
            email="owner@example.com",
            name="Owner",
        ),
        settings=Settings(),
    )

    count_sql = cursor.executions[-2][0]
    select_sql = cursor.executions[-1][0]
    assert "FROM pa_job_executions execution" in count_sql
    assert "FROM pa_job_executions execution" in select_sql
    assert "autoEvaluationTaskName" in select_sql
    assert "auto_evaluation_task_name ILIKE %(like)s" in count_sql
