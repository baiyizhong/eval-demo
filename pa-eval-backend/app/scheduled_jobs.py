import asyncio
import logging
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.auth_context import CurrentUserContext, get_current_user_context
from app.auto_evaluations import (
    CreateAutoEvaluationPayload,
    _connect,
    _ensure_project_access,
    _format_datetime,
    _get_pa_evaluator,
    _insert_running_auto_evaluation,
    _new_id,
    _resolve_auto_evaluation_samples,
    _resolve_report_template_snapshot,
    _run_auto_evaluation_background,
    _validate_workflow_evaluator_ready,
)
from app.config import Settings, get_settings
from app.consolidation.models import JobExecutionStatus, JobExecutionType
from app.consolidation.repository import ConsolidationRepository
from app.errors import BusinessError
from app.response import success

router = APIRouter(prefix="/api/projects/{project_id}", tags=["scheduled-jobs"])
logger = logging.getLogger(__name__)

ScheduledJobTaskType = Literal["AUTO_EVALUATION"]
ScheduledJobRunMode = Literal["ONCE", "RECURRING"]
ScheduledJobStatus = Literal["NOT_STARTED", "RUNNING", "PAUSED", "SUCCEEDED", "FAILED"]
ScheduledJobLogStatus = Literal["RUNNING", "SUCCEEDED", "FAILED"]
ScheduledJobTriggerType = Literal["MANUAL", "JOB"]


@dataclass
class SchedulerHandle:
    task: asyncio.Task[None] | None
    stop_event: asyncio.Event | None

    async def stop(self) -> None:
        if self.stop_event is not None:
            self.stop_event.set()
        if self.task is not None:
            self.task.cancel()
            with suppress(asyncio.CancelledError):
                await self.task


class ScheduledJobFrequencyPayload(BaseModel):
    kind: Literal["ONCE", "EVERY_MINUTES", "EVERY_HOURS", "DAILY", "WEEKLY", "CRON"]
    run_at: str | None = Field(default=None, alias="runAt")
    interval_minutes: int | None = Field(default=None, alias="intervalMinutes", ge=1)
    interval_hours: int | None = Field(default=None, alias="intervalHours", ge=1)
    time_of_day: str | None = Field(default=None, alias="timeOfDay")
    weekdays: list[int] = Field(default_factory=list)
    expression: str | None = None
    description: str | None = None

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def validate_frequency(self) -> "ScheduledJobFrequencyPayload":
        if self.kind == "ONCE" and not self.run_at:
            raise ValueError("单次执行必须选择执行时间")
        if self.kind == "EVERY_MINUTES" and not self.interval_minutes:
            raise ValueError("分钟间隔必须大于 0")
        if self.kind == "EVERY_HOURS" and not self.interval_hours:
            raise ValueError("小时间隔必须大于 0")
        if self.kind in {"DAILY", "WEEKLY"} and not _is_valid_time_of_day(
            self.time_of_day or ""
        ):
            raise ValueError("执行时间格式必须为 HH:mm")
        if self.kind == "WEEKLY":
            if not self.weekdays:
                raise ValueError("每周执行必须选择星期")
            if any(weekday < 0 or weekday > 6 for weekday in self.weekdays):
                raise ValueError("星期取值必须在 0 到 6 之间")
        if self.kind == "CRON" and not (self.expression or "").strip():
            raise ValueError("Cron 表达式不能为空")
        return self


class ScheduledJobTraceWindowPayload(BaseModel):
    mode: Literal["FIXED", "ROLLING", "PREVIOUS_DAY"]
    start_at: str | None = Field(default=None, alias="startAt")
    end_at: str | None = Field(default=None, alias="endAt")
    amount: int | None = Field(default=None, ge=1)
    unit: Literal["minutes", "hours", "days"] | None = None

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def validate_trace_window(self) -> "ScheduledJobTraceWindowPayload":
        if self.mode == "FIXED" and (not self.start_at or not self.end_at):
            raise ValueError("固定窗口必须包含开始和结束时间")
        if self.mode == "ROLLING" and (not self.amount or not self.unit):
            raise ValueError("滚动窗口必须包含数量和单位")
        return self


class CreateScheduledJobPayload(BaseModel):
    task_type: ScheduledJobTaskType = Field(default="AUTO_EVALUATION", alias="taskType")
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    score_name: str = Field(alias="scoreName", min_length=1)
    score_mapping: dict[str, Any] = Field(default_factory=dict, alias="scoreMapping")
    run_mode: ScheduledJobRunMode = Field(alias="runMode")
    frequency: ScheduledJobFrequencyPayload
    timezone_name: str = Field(default="Asia/Shanghai", alias="timezone")
    evaluator_id: str = Field(alias="evaluatorId", min_length=1)
    variable_mapping: dict[str, Any] = Field(
        default_factory=dict,
        alias="variableMapping",
    )
    data_source: dict[str, Any] = Field(alias="dataSource")
    sample_rate: int = Field(default=100, alias="sampleRate", ge=1, le=100)
    report_template_id: str | None = Field(default=None, alias="reportTemplateId")
    badcase: dict[str, Any] = Field(default_factory=dict)
    scheduler_enabled: bool = Field(default=True, alias="schedulerEnabled")

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def validate_payload(self) -> "CreateScheduledJobPayload":
        if self.task_type != "AUTO_EVALUATION":
            raise ValueError("当前仅支持自动评测定时任务")
        if self.run_mode == "ONCE" and self.frequency.kind != "ONCE":
            raise ValueError("单次任务必须使用 ONCE 频率")
        if self.run_mode == "RECURRING" and self.frequency.kind == "ONCE":
            raise ValueError("周期任务不能使用 ONCE 频率")
        if (
            self.run_mode == "RECURRING"
            and str(self.data_source.get("type")) == "DATASET"
        ):
            raise ValueError("周期性定时任务仅支持 Trace 过滤数据来源")
        return self


class UpdateScheduledJobPayload(CreateScheduledJobPayload):
    status: ScheduledJobStatus | None = None


def start_scheduled_job_scheduler(settings: Settings) -> SchedulerHandle:
    if not settings.pa_eval_scheduler_enabled:
        return SchedulerHandle(task=None, stop_event=None)

    stop_event = asyncio.Event()
    task = asyncio.create_task(_scheduler_loop(settings, stop_event))
    return SchedulerHandle(task=task, stop_event=stop_event)


async def _scheduler_loop(settings: Settings, stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            now = datetime.now(timezone.utc)
            claimed_jobs = await _claim_due_scheduled_jobs(settings, now)
            for job in claimed_jobs:
                asyncio.create_task(_execute_claimed_scheduled_job(settings, job, now))
        except Exception:
            logger.exception("Scheduled job poll failed")

        try:
            await asyncio.wait_for(
                stop_event.wait(),
                timeout=settings.pa_eval_scheduler_poll_interval_seconds,
            )
        except asyncio.TimeoutError:
            continue


async def _claim_due_scheduled_jobs(
    settings: Settings,
    now: datetime,
) -> list[dict[str, Any]]:
    lease_until = now + timedelta(seconds=settings.pa_eval_scheduler_lease_seconds)
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                _build_due_job_claim_sql(),
                {
                    "now": now,
                    "lease_until": lease_until,
                    "stale_before": now
                    - timedelta(seconds=settings.pa_eval_scheduler_lease_seconds),
                    "lock_owner": settings.scheduler_instance_id,
                    "limit": settings.pa_eval_scheduler_batch_size,
                },
            )
            return list(await cursor.fetchall())


def _build_due_job_claim_sql() -> str:
    return """
        WITH due_jobs AS (
            SELECT id
            FROM pa_evaluation_jobs job
            WHERE scheduler_enabled IS TRUE
              AND trigger_type = 'SCHEDULED'
              AND legacy_source_type = 'SCHEDULED_JOB'
              AND status <> 'DELETED'
              AND (status <> 'RUNNING' OR update_date <= %(stale_before)s)
              AND next_run_at IS NOT NULL
              AND next_run_at <= %(now)s
              AND NOT EXISTS (
                SELECT 1
                FROM pa_job_executions execution
                WHERE execution.definition_id = job.id
                  AND execution.status = 'RUNNING'
                  AND (
                      execution.lock_until IS NULL
                      OR execution.lock_until > %(now)s
                  )
              )
            ORDER BY next_run_at ASC, id ASC
            LIMIT %(limit)s
            FOR UPDATE SKIP LOCKED
        )
        UPDATE pa_evaluation_jobs job
        SET status = 'RUNNING',
            update_by = %(lock_owner)s,
            update_date = %(now)s
        FROM due_jobs
        WHERE job.id = due_jobs.id
        RETURNING job.*
        """


async def _execute_claimed_scheduled_job(
    settings: Settings,
    job: dict[str, Any],
    now: datetime,
) -> None:
    job = _scheduled_job_from_consolidated_row(job)
    await _trigger_scheduled_job(
        settings=settings,
        project_id=job["project_id"],
        job=job,
        trigger_type="JOB",
        triggered_by=job.get("create_by") or "scheduler",
        scheduled_fire_at=job["next_run_at"] or now,
        manual_fire_key=None,
    )


def _scheduled_job_from_consolidated_row(row: dict[str, Any]) -> dict[str, Any]:
    schedule_config = row.get("schedule_config") or {}
    evaluator_ids = row.get("evaluator_ids") or []
    return {
        **row,
        "id": row.get("legacy_source_id") or row.get("id"),
        "task_type": "AUTO_EVALUATION",
        "run_mode": schedule_config.get("runMode") or "ONCE",
        "frequency": schedule_config.get("frequency") or {},
        "created_user_id": schedule_config.get("createdUserId") or "",
        "evaluator_id": evaluator_ids[0] if evaluator_ids else "",
        "latest_auto_evaluation_task_id": None,
    }


@router.get("/scheduled-jobs")
async def list_scheduled_jobs(
    project_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200, alias="pageSize"),
    keyword: str | None = Query(default=None),
    status: list[ScheduledJobStatus] = Query(default_factory=list),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    offset = (page - 1) * page_size
    like = f"%{keyword or ''}%"
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            base_sql = _consolidated_scheduled_job_select_sql()
            params = {
                "project_id": project_id,
                "keyword": keyword or "",
                "like": like,
                "status": status,
                "limit": page_size,
                "offset": offset,
            }
            filters = """
                WHERE (%(keyword)s = '' OR name ILIKE %(like)s OR description ILIKE %(like)s)
                  AND (cardinality(%(status)s::text[]) = 0 OR status = ANY(%(status)s::text[]))
            """
            await cursor.execute(
                f"SELECT COUNT(*)::int AS total FROM ({base_sql}) consolidated {filters}",
                params,
            )
            total = (await cursor.fetchone() or {}).get("total", 0)
            await cursor.execute(
                f"""
                SELECT * FROM ({base_sql}) consolidated
                {filters}
                ORDER BY update_date DESC, id DESC
                LIMIT %(limit)s OFFSET %(offset)s
                """,
                params,
            )
            rows = await cursor.fetchall()
    return success({"total": total, "datas": [_to_scheduled_job(row) for row in rows]})


async def _sync_consolidated_scheduled_job(
    cursor: Any,
    *,
    row: dict[str, Any],
    actor: str,
) -> None:
    await ConsolidationRepository(cursor).upsert_evaluation_job(
        job_id=f"paejob_scheduled_{row['id']}",
        project_id=row["project_id"],
        name=row["name"],
        description=row.get("description") or "",
        trigger_type="SCHEDULED",
        status=row["status"],
        configuration={
            "scoreName": row.get("score_name") or "",
            "evaluatorIds": [row["evaluator_id"]],
            "evaluatorSnapshot": row.get("evaluator_snapshot") or {},
            "dataSource": row.get("data_source") or {},
            "variableMapping": row.get("variable_mapping") or {},
            "scoreMapping": row.get("score_mapping") or {},
            "sampleRate": row.get("sample_rate") or 100,
            "reportTemplateId": row.get("report_template_id"),
            "reportTemplateSnapshot": row.get("report_template_snapshot") or {},
            "badcaseConfig": row.get("badcase_config") or {},
            "scheduleConfig": {
                "runMode": row.get("run_mode"),
                "frequency": row.get("frequency") or {},
                "createdUserId": row.get("created_user_id") or "",
            },
            "timezone": row.get("timezone") or "Asia/Shanghai",
            "schedulerEnabled": bool(row.get("scheduler_enabled")),
            "nextRunAt": row.get("next_run_at"),
            "lastRunAt": row.get("last_run_at"),
            "latestExecutionId": row.get("latest_execution_id"),
            "latestReportId": row.get("latest_report_id"),
        },
        legacy_source_type="SCHEDULED_JOB",
        legacy_source_id=row["id"],
        actor=actor,
    )


def _scheduled_job_write_row(
    *,
    job_id: str,
    project_id: str,
    payload: CreateScheduledJobPayload,
    evaluator: dict[str, Any],
    report_template_snapshot: dict[str, Any],
    next_run_at: datetime | None,
    status: ScheduledJobStatus,
    user: CurrentUserContext,
    existing: dict[str, Any] | None = None,
) -> dict[str, Any]:
    current = existing or {}
    return {
        "id": job_id,
        "project_id": project_id,
        "name": payload.name,
        "description": payload.description,
        "score_name": payload.score_name,
        "score_mapping": payload.score_mapping,
        "run_mode": payload.run_mode,
        "frequency": payload.frequency.model_dump(by_alias=True),
        "timezone": payload.timezone_name,
        "status": status,
        "scheduler_enabled": payload.scheduler_enabled,
        "next_run_at": next_run_at,
        "evaluator_id": evaluator["id"],
        "evaluator_snapshot": {
            "id": evaluator["id"],
            "name": evaluator["name"],
            "type": evaluator["type"],
            "provider": evaluator["provider"],
            "version": evaluator["version"],
            "variables": evaluator.get("variables") or [],
            "outputVariables": evaluator.get("output_variables")
            or evaluator.get("outputVariables")
            or [],
        },
        "variable_mapping": _normalize_variable_mapping(payload.variable_mapping),
        "data_source": payload.data_source,
        "sample_rate": payload.sample_rate,
        "report_template_id": report_template_snapshot["id"],
        "report_template_snapshot": report_template_snapshot,
        "badcase_config": payload.badcase,
        "created_user_id": current.get("created_user_id") or user.user_id,
        "last_run_at": current.get("last_run_at"),
        "latest_execution_id": current.get("latest_execution_id"),
        "latest_report_id": current.get("latest_report_id"),
    }


async def _fetch_scheduled_job_with_cursor(
    cursor: Any,
    project_id: str,
    job_id: str,
) -> dict[str, Any]:
    await cursor.execute(
        _consolidated_scheduled_job_select_sql()
        + " AND job.legacy_source_id = %(job_id)s LIMIT 1",
        {"project_id": project_id, "job_id": job_id},
    )
    row = await cursor.fetchone()
    if row is None:
        raise BusinessError(4100, "定时任务不存在或无访问权限", 404)
    return row


def _consolidated_scheduled_job_select_sql() -> str:
    return """
        SELECT
            job.legacy_source_id AS id,
            job.project_id,
            'AUTO_EVALUATION'::text AS task_type,
            job.name,
            job.description,
            job.score_name,
            job.score_mapping,
            COALESCE(job.schedule_config ->> 'runMode', 'ONCE') AS run_mode,
            COALESCE(job.schedule_config -> 'frequency', '{}'::jsonb) AS frequency,
            job.timezone,
            job.status,
            job.scheduler_enabled,
            job.next_run_at,
            job.evaluator_ids ->> 0 AS evaluator_id,
            job.evaluator_snapshot,
            job.variable_mapping,
            job.data_source,
            job.sample_rate,
            job.report_template_id,
            job.report_template_snapshot,
            job.badcase_config,
            job.schedule_config ->> 'createdUserId' AS created_user_id,
            COALESCE(
                NULLIF(latest.result_payload ->> 'autoEvaluationTaskId', ''),
                NULLIF(latest.request_payload ->> 'autoEvaluationTaskId', '')
            )
                AS latest_auto_evaluation_task_id,
            job.last_run_at,
            job.latest_execution_id,
            job.latest_report_id,
            job.create_by,
            job.create_date,
            job.update_by,
            job.update_date
        FROM pa_evaluation_jobs job
        LEFT JOIN pa_job_executions latest
          ON latest.id = job.latest_execution_id
         AND latest.project_id = job.project_id
        WHERE job.project_id = %(project_id)s
          AND job.trigger_type = 'SCHEDULED'
          AND job.legacy_source_type = 'SCHEDULED_JOB'
          AND job.status <> 'DELETED'
    """


def _consolidated_execution_log_select_sql() -> str:
    return """
        SELECT
            execution.legacy_source_id AS id,
            execution.project_id,
            execution.request_payload ->> 'scheduledJobId' AS scheduled_job_id,
            execution.request_payload ->> 'scheduledJobName' AS scheduled_job_name,
            'AUTO_EVALUATION'::text AS task_type,
            execution.request_payload ->> 'triggerType' AS trigger_type,
            COALESCE(
                NULLIF(execution.result_payload ->> 'autoEvaluationTaskId', ''),
                NULLIF(execution.request_payload ->> 'autoEvaluationTaskId', '')
            ) AS auto_evaluation_task_id,
            execution.request_payload ->> 'autoEvaluationTaskName'
                AS auto_evaluation_task_name,
            execution.request_payload ->> 'autoEvaluationTaskName'
                AS resolved_auto_evaluation_task_name,
            execution.result_payload ->> 'reportId' AS evaluation_report_id,
            execution.status,
            execution.total_count AS sample_count,
            execution.started_at,
            execution.completed_at AS ended_at,
            ''::text AS duration_text,
            NULLIF(execution.error_message, '') AS error_message,
            execution.create_date,
            execution.update_date
        FROM pa_job_executions execution
        WHERE execution.project_id = %(project_id)s
          AND execution.job_type = 'SCHEDULED_EVALUATION'
          AND execution.legacy_source_type = 'SCHEDULED_JOB_EXECUTION_LOG'
    """


@router.post("/scheduled-jobs")
async def create_scheduled_job(
    project_id: str,
    payload: CreateScheduledJobPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    job_id = _new_id("pajob")
    next_run_at = _compute_next_run_at(payload.frequency, payload.timezone_name, now)

    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            evaluator = await _get_pa_evaluator(
                cursor,
                payload.evaluator_id,
                current_user.user_id,
            )
            report_template_snapshot = await _resolve_report_template_snapshot(
                cursor,
                project_id=project_id,
                template_id=payload.report_template_id,
            )
            await _sync_consolidated_scheduled_job(
                cursor,
                row=_scheduled_job_write_row(
                    job_id=job_id,
                    project_id=project_id,
                    payload=payload,
                    evaluator=evaluator,
                    report_template_snapshot=report_template_snapshot,
                    next_run_at=next_run_at,
                    status="NOT_STARTED",
                    user=current_user,
                ),
                actor=current_user.email,
            )
            row = await _fetch_scheduled_job_with_cursor(cursor, project_id, job_id)

    return success(_to_scheduled_job(row or {}))


@router.patch("/scheduled-jobs/{job_id}")
async def update_scheduled_job(
    project_id: str,
    job_id: str,
    payload: UpdateScheduledJobPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    next_run_at = (
        None
        if payload.status == "PAUSED"
        else _compute_next_run_at(payload.frequency, payload.timezone_name, now)
    )

    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            evaluator = await _get_pa_evaluator(
                cursor,
                payload.evaluator_id,
                current_user.user_id,
            )
            report_template_snapshot = await _resolve_report_template_snapshot(
                cursor,
                project_id=project_id,
                template_id=payload.report_template_id,
            )
            existing = await _fetch_scheduled_job_with_cursor(cursor, project_id, job_id)
            await _sync_consolidated_scheduled_job(
                cursor,
                row=_scheduled_job_write_row(
                    job_id=job_id,
                    project_id=project_id,
                    payload=payload,
                    evaluator=evaluator,
                    report_template_snapshot=report_template_snapshot,
                    next_run_at=next_run_at,
                    status=payload.status or existing["status"],
                    user=current_user,
                    existing=existing,
                ),
                actor=current_user.email,
            )
            row = await _fetch_scheduled_job_with_cursor(cursor, project_id, job_id)

    return success(_to_scheduled_job(row))


@router.post("/scheduled-jobs/{job_id}/pause")
async def pause_scheduled_job(
    project_id: str,
    job_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    row = await _set_scheduled_job_status(
        project_id,
        job_id,
        status="PAUSED",
        next_run_at=None,
        user=current_user,
        settings=settings,
    )
    return success(_to_scheduled_job(row))


@router.post("/scheduled-jobs/{job_id}/resume")
async def resume_scheduled_job(
    project_id: str,
    job_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    job = await _fetch_scheduled_job(project_id, job_id, current_user.user_id, settings)
    next_run_at = _compute_next_run_at(
        ScheduledJobFrequencyPayload(**(job.get("frequency") or {})),
        job.get("timezone") or "Asia/Shanghai",
        datetime.now(timezone.utc),
    )
    row = await _set_scheduled_job_status(
        project_id,
        job_id,
        status="NOT_STARTED",
        next_run_at=next_run_at,
        user=current_user,
        settings=settings,
    )
    return success(_to_scheduled_job(row))


@router.delete("/scheduled-jobs/{job_id}")
async def delete_scheduled_job(
    project_id: str,
    job_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            await cursor.execute(
                """
                DELETE FROM pa_job_executions
                WHERE project_id = %(project_id)s
                  AND definition_id = 'paejob_scheduled_' || %(job_id)s
                """,
                {"project_id": project_id, "job_id": job_id},
            )
            await cursor.execute(
                """
                DELETE FROM pa_evaluation_jobs
                WHERE project_id = %(project_id)s
                  AND legacy_source_type = 'SCHEDULED_JOB'
                  AND legacy_source_id = %(job_id)s
                RETURNING legacy_source_id AS id
                """,
                {"project_id": project_id, "job_id": job_id},
            )
            row = await cursor.fetchone()
            if row is None:
                raise BusinessError(4100, "定时任务不存在或无访问权限", 404)
    return success({"id": job_id})


@router.post("/scheduled-jobs/{job_id}/run")
async def run_scheduled_job_manually(
    project_id: str,
    job_id: str,
    background_tasks: BackgroundTasks,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    job = await _fetch_scheduled_job(project_id, job_id, current_user.user_id, settings)
    fire_key = f"manual:{uuid4().hex}"
    background_tasks.add_task(
        _trigger_scheduled_job,
        settings,
        project_id,
        job,
        "MANUAL",
        current_user.email,
        datetime.now(timezone.utc),
        fire_key,
    )
    return success({"id": job_id, "status": "RUNNING"})


@router.post("/scheduled-jobs/{job_id}/trigger")
async def trigger_scheduled_job(
    project_id: str,
    job_id: str,
    background_tasks: BackgroundTasks,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    job = await _fetch_scheduled_job(project_id, job_id, current_user.user_id, settings)
    background_tasks.add_task(
        _trigger_scheduled_job,
        settings,
        project_id,
        job,
        "JOB",
        current_user.email,
        job.get("next_run_at") or datetime.now(timezone.utc),
        None,
    )
    return success({"id": job_id, "status": "RUNNING"})


@router.get("/scheduled-job-logs")
async def list_scheduled_job_logs(
    project_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200, alias="pageSize"),
    job_id: str | None = Query(default=None, alias="jobId"),
    keyword: str | None = Query(default=None),
    status: list[ScheduledJobLogStatus] = Query(default_factory=list),
    trigger_type: list[ScheduledJobTriggerType] = Query(
        default_factory=list,
        alias="triggerType",
    ),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    offset = (page - 1) * page_size
    like = f"%{keyword or ''}%"
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, current_user.user_id)
            base_sql = _consolidated_execution_log_select_sql()
            params = {
                "project_id": project_id,
                "job_id": job_id or "",
                "keyword": keyword or "",
                "like": like,
                "status": status,
                "trigger_type": trigger_type,
                "limit": page_size,
                "offset": offset,
            }
            filters = """
                WHERE (%(job_id)s = '' OR scheduled_job_id = %(job_id)s)
                  AND (
                    %(keyword)s = ''
                    OR scheduled_job_name ILIKE %(like)s
                    OR auto_evaluation_task_name ILIKE %(like)s
                  )
                  AND (cardinality(%(status)s::text[]) = 0 OR status = ANY(%(status)s::text[]))
                  AND (cardinality(%(trigger_type)s::text[]) = 0 OR trigger_type = ANY(%(trigger_type)s::text[]))
            """
            await cursor.execute(
                f"SELECT COUNT(*)::int AS total FROM ({base_sql}) consolidated {filters}",
                params,
            )
            total = (await cursor.fetchone() or {}).get("total", 0)
            await cursor.execute(
                f"""
                SELECT * FROM ({base_sql}) consolidated
                {filters}
                ORDER BY started_at DESC, id DESC
                LIMIT %(limit)s OFFSET %(offset)s
                """,
                params,
            )
            rows = await cursor.fetchall()
    return success({"total": total, "datas": [_to_execution_log(row) for row in rows]})


async def _trigger_scheduled_job(
    settings: Settings,
    project_id: str,
    job: dict[str, Any],
    trigger_type: ScheduledJobTriggerType,
    triggered_by: str,
    scheduled_fire_at: datetime,
    manual_fire_key: str | None,
) -> None:
    fire_at = _ensure_aware_datetime(scheduled_fire_at)
    fire_key = manual_fire_key or _build_fire_key(job["id"], fire_at)
    log_id = _new_id("pajoblog")
    now = datetime.now(timezone.utc)
    lease_until = now + timedelta(seconds=settings.pa_eval_scheduler_lease_seconds)
    auto_task_id = _new_id("paautoeval")
    run_id = _new_id("parun")
    auto_task_name = (
        _build_job_triggered_auto_evaluation_name(
            job["name"],
            fire_at,
            job.get("timezone") or "Asia/Shanghai",
        )
        if trigger_type == "JOB"
        else f"{job['name']}-手动运行"
    )

    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            execution = await ConsolidationRepository(cursor).create_execution(
                execution_id=f"paexec_scheduled_{log_id}",
                project_id=project_id,
                job_type=JobExecutionType.SCHEDULED_EVALUATION,
                definition_id=f"paejob_scheduled_{job['id']}",
                idempotency_key=fire_key,
                request_payload={
                    "scheduledJobId": job["id"],
                    "fireKey": fire_key,
                    "autoEvaluationTaskId": "",
                    "scheduledJobName": job["name"],
                    "triggerType": trigger_type,
                    "autoEvaluationTaskName": auto_task_name,
                    "scheduledFireAt": fire_at.isoformat(),
                },
                legacy_source_type="SCHEDULED_JOB_EXECUTION_LOG",
                legacy_source_id=log_id,
                actor=triggered_by,
            )
            if execution.get("legacy_source_id") != log_id:
                stale_log_id = str(execution.get("legacy_source_id") or "")
                existing_lock_until = execution.get("lock_until")
                if (
                    stale_log_id
                    and execution.get("status") == "RUNNING"
                    and isinstance(existing_lock_until, datetime)
                    and _ensure_aware_datetime(existing_lock_until) <= now
                ):
                    await _mark_scheduled_job_trigger_failed(
                        cursor,
                        project_id=project_id,
                        job=job,
                        log_id=stale_log_id,
                        fire_at=fire_at,
                        fire_key=fire_key,
                        started_at=now,
                        error_message="定时执行租约过期，已终止旧执行并推进调度",
                        updated_by=triggered_by,
                        expired_before=now,
                    )
                return
            await ConsolidationRepository(cursor).sync_execution_from_legacy(
                execution_id=f"paexec_scheduled_{log_id}",
                project_id=project_id,
                status=JobExecutionStatus.RUNNING,
                total_count=0,
                completed_count=0,
                success_count=0,
                failure_count=0,
                result_payload={},
                actor=triggered_by,
                lock_owner=settings.scheduler_instance_id,
                lock_until=lease_until,
            )

            try:
                evaluator = await _get_pa_evaluator(
                    cursor,
                    job["evaluator_id"],
                    job["created_user_id"],
                )
                _validate_workflow_evaluator_ready(evaluator)
                payload = _build_auto_evaluation_payload_from_job(
                    job,
                    auto_task_name,
                    fire_at,
                )
                data_source, samples = await _resolve_auto_evaluation_samples(
                    cursor,
                    project_id,
                    payload,
                    job["created_user_id"],
                    settings,
                )
                report_template_snapshot = await _resolve_report_template_snapshot(
                    cursor,
                    project_id=project_id,
                    template_id=payload.report_template_id,
                )
                payload = payload.model_copy(
                    update={
                        "report_template_id": report_template_snapshot["id"],
                        "report_template_snapshot": report_template_snapshot,
                    }
                )
                await _insert_running_auto_evaluation(
                    cursor,
                    task_id=auto_task_id,
                    run_id=run_id,
                    project_id=project_id,
                    name=payload.name,
                    description=payload.description,
                    score_name=payload.score_name,
                    score_mapping=payload.score_mapping,
                    evaluator=evaluator,
                    data_source=data_source,
                    sample_rate=payload.sample_rate,
                    sample_count=len(samples),
                    report_template_id=payload.report_template_id,
                    report_template_snapshot=report_template_snapshot,
                    create_by=triggered_by,
                    now=now,
                )
                await ConsolidationRepository(cursor).sync_execution_from_legacy(
                    execution_id=f"paexec_scheduled_{log_id}",
                    project_id=project_id,
                    status=JobExecutionStatus.RUNNING,
                    total_count=len(samples),
                    completed_count=0,
                    success_count=0,
                    failure_count=0,
                    result_payload={
                        "autoEvaluationTaskId": auto_task_id,
                        "autoEvaluationRunId": run_id,
                    },
                    actor=triggered_by,
                    lock_owner=settings.scheduler_instance_id,
                    lock_until=lease_until,
                )
                next_run_at = _next_run_after_trigger(job, fire_at)
                await cursor.execute(
                    """
                    UPDATE pa_evaluation_jobs
                    SET latest_execution_id = %(execution_id)s,
                        last_run_at = %(last_run_at)s,
                        next_run_at = %(next_run_at)s,
                        update_by = %(update_by)s,
                        update_date = %(update_date)s
                    WHERE project_id = %(project_id)s
                      AND legacy_source_type = 'SCHEDULED_JOB'
                      AND legacy_source_id = %(job_id)s
                    """,
                    {
                        "project_id": project_id,
                        "job_id": job["id"],
                        "execution_id": f"paexec_scheduled_{log_id}",
                        "last_run_at": now,
                        "next_run_at": next_run_at,
                        "update_by": triggered_by,
                        "update_date": now,
                    },
                )
            except Exception as exc:
                logger.exception(
                    "Scheduled job setup failed", extra={"job_id": job["id"]}
                )
                await _mark_scheduled_job_trigger_failed(
                    cursor,
                    project_id=project_id,
                    job=job,
                    log_id=log_id,
                    fire_at=fire_at,
                    fire_key=fire_key,
                    started_at=now,
                    error_message=_safe_error_message(exc),
                    updated_by=triggered_by,
                )
                return

    try:
        await _run_auto_evaluation_background(
            settings,
            project_id,
            auto_task_id,
            run_id,
            payload,
            evaluator,
            samples,
            data_source,
            triggered_by,
        )
    except Exception as exc:
        logger.exception("Scheduled job execution failed", extra={"job_id": job["id"]})
        async with await _connect(settings) as connection:
            async with connection.cursor() as cursor:
                await _mark_scheduled_job_trigger_failed(
                    cursor,
                    project_id=project_id,
                    job=job,
                    log_id=log_id,
                    fire_at=fire_at,
                    fire_key=fire_key,
                    started_at=now,
                    error_message=_safe_error_message(exc),
                    updated_by=triggered_by,
                )
        return
    await _sync_execution_log_from_auto_evaluation(
        settings,
        project_id=project_id,
        job_id=job["id"],
        log_id=log_id,
        auto_task_id=auto_task_id,
        updated_by=triggered_by,
        started_at=now,
    )


async def _mark_scheduled_job_trigger_failed(
    cursor: Any,
    *,
    project_id: str,
    job: dict[str, Any],
    log_id: str,
    fire_at: datetime,
    fire_key: str,
    started_at: datetime,
    error_message: str,
    updated_by: str,
    expired_before: datetime | None = None,
) -> bool:
    ended_at = datetime.now(timezone.utc)
    next_run_at = _next_run_after_trigger(job, fire_at)
    execution_id = f"paexec_scheduled_{log_id}"
    if expired_before is None:
        repository = ConsolidationRepository(cursor)
        await repository.sync_execution_from_legacy(
            execution_id=execution_id,
            project_id=project_id,
            status=JobExecutionStatus.FAILED,
            total_count=0,
            completed_count=0,
            success_count=0,
            failure_count=1,
            result_payload={"fireKey": fire_key},
            error_message=error_message,
            actor=updated_by,
        )
    else:
        await cursor.execute(
            """
            UPDATE pa_job_executions
            SET status = 'FAILED',
                completed_count = GREATEST(completed_count, total_count),
                failure_count = GREATEST(failure_count, 1),
                progress_percent = 100,
                result_payload = result_payload || jsonb_build_object(
                    'fireKey', %(fire_key)s
                ),
                error_message = %(error_message)s,
                completed_at = %(completed_at)s,
                lock_owner = '',
                lock_until = NULL,
                update_by = %(update_by)s,
                update_date = %(update_date)s
            WHERE id = %(id)s
              AND project_id = %(project_id)s
              AND legacy_source_type = 'SCHEDULED_JOB_EXECUTION_LOG'
              AND status = 'RUNNING'
              AND lock_until <= %(expired_before)s
            RETURNING id
            """,
            {
                "id": execution_id,
                "project_id": project_id,
                "fire_key": fire_key,
                "error_message": error_message,
                "completed_at": ended_at,
                "update_by": updated_by,
                "update_date": ended_at,
                "expired_before": expired_before,
            },
        )
        if await cursor.fetchone() is None:
            return False
    await cursor.execute(
        """
        UPDATE pa_evaluation_jobs
        SET status = %(status)s,
            latest_execution_id = %(latest_execution_id)s,
            last_run_at = %(last_run_at)s,
            next_run_at = %(next_run_at)s,
            update_by = %(update_by)s,
            update_date = %(update_date)s
        WHERE project_id = %(project_id)s
          AND legacy_source_type = 'SCHEDULED_JOB'
          AND legacy_source_id = %(job_id)s
          AND status != 'PAUSED'
        """,
        {
            "project_id": project_id,
            "job_id": job["id"],
            "status": "FAILED",
            "latest_execution_id": f"paexec_scheduled_{log_id}",
            "last_run_at": ended_at,
            "next_run_at": next_run_at,
            "update_by": updated_by,
            "update_date": ended_at,
        },
    )
    return True


def _safe_error_message(exc: Exception) -> str:
    message = str(exc).strip() or exc.__class__.__name__
    return message[:1000]


async def _sync_execution_log_from_auto_evaluation(
    settings: Settings,
    *,
    project_id: str,
    job_id: str,
    log_id: str,
    auto_task_id: str,
    updated_by: str,
    started_at: datetime,
) -> None:
    ended_at = datetime.now(timezone.utc)
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                SELECT job.status, job.latest_report_id,
                       COALESCE(execution.total_count, 0) AS sample_count
                FROM pa_evaluation_jobs job
                LEFT JOIN pa_job_executions execution
                  ON execution.project_id = job.project_id
                 AND execution.id = job.latest_execution_id
                WHERE job.project_id = %(project_id)s
                  AND job.legacy_source_type = 'AUTO_EVALUATION_TASK'
                  AND job.legacy_source_id = %(auto_task_id)s
                LIMIT 1
                """,
                {"project_id": project_id, "auto_task_id": auto_task_id},
            )
            task = await cursor.fetchone() or {}
            report_id = task.get("latest_report_id")
            status = "SUCCEEDED" if task.get("status") == "COMPLETED" else "FAILED"
            sample_count = int(task.get("sample_count") or 0)
            repository = ConsolidationRepository(cursor)
            await repository.sync_execution_from_legacy(
                execution_id=f"paexec_scheduled_{log_id}",
                project_id=project_id,
                status=(
                    JobExecutionStatus.SUCCEEDED
                    if status == "SUCCEEDED"
                    else JobExecutionStatus.FAILED
                ),
                total_count=sample_count,
                completed_count=sample_count,
                success_count=sample_count if status == "SUCCEEDED" else 0,
                failure_count=0 if status == "SUCCEEDED" else max(sample_count, 1),
                result_payload={
                    "autoEvaluationTaskId": auto_task_id,
                    "reportId": report_id or "",
                },
                error_message="" if status == "SUCCEEDED" else "自动评测执行失败",
                actor=updated_by,
            )
            await cursor.execute(
                """
                UPDATE pa_evaluation_jobs
                SET status = %(status)s,
                    latest_execution_id = %(latest_execution_id)s,
                    latest_report_id = %(report_id)s,
                    last_run_at = %(last_run_at)s,
                    update_by = %(update_by)s,
                    update_date = %(update_date)s
                WHERE project_id = %(project_id)s
                  AND legacy_source_type = 'SCHEDULED_JOB'
                  AND legacy_source_id = %(job_id)s
                  AND status != 'PAUSED'
                """,
                {
                    "project_id": project_id,
                    "job_id": job_id,
                    "status": status,
                    "latest_execution_id": f"paexec_scheduled_{log_id}",
                    "report_id": report_id,
                    "last_run_at": ended_at,
                    "update_by": updated_by,
                    "update_date": ended_at,
                },
            )


def _scheduled_job_insert_params(
    *,
    job_id: str,
    project_id: str,
    payload: CreateScheduledJobPayload,
    evaluator: dict[str, Any],
    report_template_snapshot: dict[str, Any],
    next_run_at: datetime | None,
    user: CurrentUserContext,
    now: datetime,
) -> dict[str, Any]:
    return {
        "id": job_id,
        "project_id": project_id,
        "name": payload.name,
        "description": payload.description,
        "score_name": payload.score_name,
        "score_mapping": Jsonb(payload.score_mapping),
        "run_mode": payload.run_mode,
        "frequency": Jsonb(payload.frequency.model_dump(by_alias=True)),
        "timezone": payload.timezone_name,
        "scheduler_enabled": payload.scheduler_enabled,
        "next_run_at": next_run_at,
        "evaluator_id": evaluator["id"],
        "evaluator_snapshot": Jsonb(
            {
                "id": evaluator["id"],
                "name": evaluator["name"],
                "type": evaluator["type"],
                "provider": evaluator["provider"],
                "version": evaluator["version"],
                "variables": evaluator.get("variables") or [],
                "outputVariables": evaluator.get("output_variables")
                or evaluator.get("outputVariables")
                or [],
            }
        ),
        "variable_mapping": Jsonb(
            _normalize_variable_mapping(payload.variable_mapping)
        ),
        "data_source": Jsonb(payload.data_source),
        "sample_rate": payload.sample_rate,
        "report_template_id": report_template_snapshot["id"],
        "report_template_snapshot": Jsonb(report_template_snapshot),
        "badcase_config": Jsonb(payload.badcase),
        "created_user_id": user.user_id,
        "create_by": user.email,
        "create_date": now,
        "update_by": user.email,
        "update_date": now,
    }


def _build_auto_evaluation_payload_from_job(
    job: dict[str, Any],
    auto_task_name: str,
    fire_at: datetime,
) -> CreateAutoEvaluationPayload:
    data_source = _normalize_auto_evaluation_data_source(
        job.get("data_source") or {},
        timezone_name=job.get("timezone") or "Asia/Shanghai",
        fire_at=fire_at,
    )
    return CreateAutoEvaluationPayload(
        name=auto_task_name,
        description=job.get("description") or "",
        scoreName=job["score_name"],
        scoreMapping=job.get("score_mapping") or {},
        evaluatorId=job["evaluator_id"],
        sampleRate=job["sample_rate"],
        variableMapping=job.get("variable_mapping") or {},
        dataSource=data_source,
        reportTemplateId=job.get("report_template_id"),
        reportTemplateSnapshot=job.get("report_template_snapshot") or {},
    )


def _normalize_auto_evaluation_data_source(
    data_source: dict[str, Any],
    *,
    timezone_name: str,
    fire_at: datetime,
) -> dict[str, Any]:
    if data_source.get("type") == "DATASET":
        return {
            "type": "DATASET",
            "datasetId": data_source.get("datasetId"),
            "projectId": data_source.get("projectId"),
        }

    trace_filter = data_source.get("traceFilter")
    filter_payload = trace_filter if isinstance(trace_filter, dict) else data_source
    trace_window_payload = data_source.get("traceWindow")
    trace_window = (
        ScheduledJobTraceWindowPayload(**trace_window_payload)
        if isinstance(trace_window_payload, dict)
        else None
    )
    created_at_range = filter_payload.get("createdAtRange") or []
    if trace_window is not None:
        created_at_range = list(
            _compute_trace_window(trace_window, timezone_name, fire_at)
        )

    return {
        "type": "TRACE_FILTER",
        "traceName": _normalize_trace_name(
            filter_payload.get("traceName") or filter_payload.get("name")
        ),
        "userId": filter_payload.get("userId") or "",
        "sessionId": filter_payload.get("sessionId") or "",
        "tags": filter_payload.get("tags") or [],
        "createdAtRange": created_at_range,
    }


def _normalize_trace_name(value: Any) -> str:
    trace_name = value.strip() if isinstance(value, str) else ""
    return "" if trace_name == "默认 Trace 过滤" else trace_name


def _normalize_variable_mapping(mapping: dict[str, Any]) -> dict[str, Any]:
    aliases = {
        "trace.input": "{{ sample.input }}",
        "dataset.input": "{{ sample.input }}",
        "trace.output": "{{ sample.output }}",
        "dataset.output": "{{ sample.output }}",
        "trace.expectedoutput": "{{ sample.expectedOutput }}",
        "dataset.expectedoutput": "{{ sample.expectedOutput }}",
        "trace.expected_output": "{{ sample.expectedOutput }}",
        "dataset.expected_output": "{{ sample.expectedOutput }}",
        "trace.context": "{{ sample.context }}",
        "dataset.context": "{{ sample.context }}",
        "trace.conversation_context": "{{ sample.context }}",
        "dataset.conversation_context": "{{ sample.context }}",
        "trace.trace_id": "{{ sample.trace.id }}",
        "trace.session_id": "{{ sample.metadata.sessionId }}",
        "trace.user_id": "{{ sample.metadata.userId }}",
    }
    normalized: dict[str, Any] = {}
    for key, value in mapping.items():
        if isinstance(value, str):
            normalized[key] = aliases.get(value.lower(), value)
        else:
            normalized[key] = value
    return normalized


def _compute_next_run_at(
    frequency: ScheduledJobFrequencyPayload,
    timezone_name: str,
    now: datetime,
) -> datetime | None:
    aware_now = _ensure_aware_datetime(now)
    timezone_info = ZoneInfo(timezone_name)
    local_now = aware_now.astimezone(timezone_info)

    if frequency.kind == "ONCE":
        run_at = _parse_datetime(frequency.run_at or "").astimezone(timezone_info)
        return run_at if run_at > local_now else None
    if frequency.kind == "EVERY_MINUTES":
        return local_now + timedelta(minutes=frequency.interval_minutes or 1)
    if frequency.kind == "EVERY_HOURS":
        return local_now + timedelta(hours=frequency.interval_hours or 1)
    if frequency.kind == "DAILY":
        candidate = _local_time_candidate(local_now, frequency.time_of_day or "00:00")
        return candidate if candidate > local_now else candidate + timedelta(days=1)
    if frequency.kind == "WEEKLY":
        weekdays = frequency.weekdays or [local_now.weekday()]
        target_weekdays = {_frontend_weekday_to_python(weekday) for weekday in weekdays}
        for offset in range(8):
            candidate = _local_time_candidate(
                local_now + timedelta(days=offset),
                frequency.time_of_day or "00:00",
            )
            if candidate.weekday() in target_weekdays and candidate > local_now:
                return candidate
        return None
    return _compute_next_cron_run_at(
        frequency.expression or "",
        timezone_name,
        aware_now,
    )


def _compute_next_cron_run_at(
    expression: str,
    timezone_name: str,
    now: datetime,
) -> datetime:
    parts = expression.split()
    if len(parts) != 5:
        raise ValueError("Cron 表达式必须包含 5 个字段")

    minute, hour, day, month, weekday = parts
    if day != "*" or month != "*":
        raise ValueError("当前 Cron 仅支持每日或每周表达式")

    timezone_info = ZoneInfo(timezone_name)
    local_now = now.astimezone(timezone_info)
    if minute.startswith("*/") and hour == "*" and weekday == "*":
        step = int(minute[2:])
        if step <= 0:
            raise ValueError("Cron 分钟间隔必须大于 0")
        return local_now + timedelta(minutes=step)
    if minute.isdigit() and hour == "*" and weekday == "*":
        candidate = local_now.replace(
            minute=int(minute),
            second=0,
            microsecond=0,
        )
        return candidate if candidate > local_now else candidate + timedelta(hours=1)
    if minute.isdigit() and hour.isdigit():
        candidate = _local_time_candidate(
            local_now, f"{int(hour):02d}:{int(minute):02d}"
        )
        if weekday == "*":
            return candidate if candidate > local_now else candidate + timedelta(days=1)
        target_weekdays = _cron_weekdays(weekday)
        for offset in range(8):
            weekly_candidate = _local_time_candidate(
                local_now + timedelta(days=offset),
                f"{int(hour):02d}:{int(minute):02d}",
            )
            if (
                weekly_candidate.weekday() in target_weekdays
                and weekly_candidate > local_now
            ):
                return weekly_candidate
    raise ValueError("当前 Cron 表达式暂不支持")


def _compute_trace_window(
    trace_window: ScheduledJobTraceWindowPayload,
    timezone_name: str,
    fire_at: datetime,
) -> tuple[str, str]:
    timezone_info = ZoneInfo(timezone_name)
    local_fire_at = _ensure_aware_datetime(fire_at).astimezone(timezone_info)
    if trace_window.mode == "FIXED":
        start = _parse_datetime(trace_window.start_at or "").astimezone(timezone_info)
        end = _parse_datetime(trace_window.end_at or "").astimezone(timezone_info)
    elif trace_window.mode == "PREVIOUS_DAY":
        current_day = local_fire_at.date()
        start = datetime.combine(
            current_day - timedelta(days=1),
            datetime.min.time(),
            tzinfo=timezone_info,
        )
        end = datetime.combine(
            current_day,
            datetime.min.time(),
            tzinfo=timezone_info,
        )
    else:
        units = {
            "minutes": timedelta(minutes=trace_window.amount or 1),
            "hours": timedelta(hours=trace_window.amount or 1),
            "days": timedelta(days=trace_window.amount or 1),
        }
        end = local_fire_at
        start = end - units[trace_window.unit or "minutes"]
    if start >= end:
        raise ValueError("Trace 时间窗口开始时间必须早于结束时间")
    return start.isoformat(), end.isoformat()


def _next_run_after_trigger(job: dict[str, Any], fire_at: datetime) -> datetime | None:
    frequency = ScheduledJobFrequencyPayload(**(job.get("frequency") or {}))
    if frequency.kind == "ONCE":
        return None
    return _compute_next_run_at(
        frequency,
        job.get("timezone") or "Asia/Shanghai",
        fire_at + timedelta(seconds=1),
    )


def _build_fire_key(job_id: str, scheduled_fire_at: datetime) -> str:
    return f"{job_id}:{_ensure_aware_datetime(scheduled_fire_at).isoformat()}"


def _build_job_triggered_auto_evaluation_name(
    job_name: str,
    triggered_at: datetime,
    timezone_name: str,
) -> str:
    local_time = _ensure_aware_datetime(triggered_at).astimezone(
        ZoneInfo(timezone_name)
    )
    return f"【JOB触发】{job_name}-{local_time.strftime('%Y%m%d%H%M')}"


def _duration_text(started_at: datetime, ended_at: datetime) -> str:
    seconds = max(0, int((ended_at - started_at).total_seconds()))
    if seconds < 60:
        return f"{seconds} 秒"
    minutes, remaining_seconds = divmod(seconds, 60)
    return f"{minutes} 分 {remaining_seconds} 秒"


def _is_valid_time_of_day(value: str) -> bool:
    parts = value.split(":")
    if len(parts) != 2 or not all(part.isdigit() for part in parts):
        return False
    hour, minute = (int(part) for part in parts)
    return 0 <= hour <= 23 and 0 <= minute <= 59


def _local_time_candidate(local_now: datetime, time_of_day: str) -> datetime:
    hour, minute = (int(part) for part in time_of_day.split(":"))
    return local_now.replace(hour=hour, minute=minute, second=0, microsecond=0)


def _cron_weekdays(value: str) -> set[int]:
    values = [item.strip() for item in value.split(",") if item.strip()]
    if not values:
        raise ValueError("Cron 星期字段不能为空")
    weekdays: set[int] = set()
    for item in values:
        if not item.isdigit():
            raise ValueError("Cron 星期字段必须是数字")
        cron_weekday = int(item)
        if cron_weekday < 0 or cron_weekday > 6:
            raise ValueError("Cron 星期字段必须在 0 到 6 之间")
        weekdays.add(6 if cron_weekday == 0 else cron_weekday - 1)
    return weekdays


def _frontend_weekday_to_python(weekday: int) -> int:
    return 6 if weekday == 0 else weekday - 1


def _parse_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return _ensure_aware_datetime(parsed)


def _ensure_aware_datetime(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)
    return value


async def _fetch_scheduled_job(
    project_id: str,
    job_id: str,
    user_id: str,
    settings: Settings,
) -> dict[str, Any]:
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, user_id)
            return await _fetch_scheduled_job_with_cursor(cursor, project_id, job_id)


async def _set_scheduled_job_status(
    project_id: str,
    job_id: str,
    *,
    status: ScheduledJobStatus,
    next_run_at: datetime | None,
    user: CurrentUserContext,
    settings: Settings,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    async with await _connect(settings) as connection:
        async with connection.cursor() as cursor:
            await _ensure_project_access(cursor, project_id, user.user_id)
            await cursor.execute(
                """
                UPDATE pa_evaluation_jobs
                SET status = %(status)s,
                    next_run_at = %(next_run_at)s,
                    update_by = %(update_by)s,
                    update_date = %(update_date)s
                WHERE project_id = %(project_id)s
                  AND legacy_source_type = 'SCHEDULED_JOB'
                  AND legacy_source_id = %(job_id)s
                RETURNING *
                """,
                {
                    "project_id": project_id,
                    "job_id": job_id,
                    "status": status,
                    "next_run_at": next_run_at,
                    "update_by": user.email,
                    "update_date": now,
                },
            )
            row = await cursor.fetchone()
            if row is None:
                raise BusinessError(4100, "定时任务不存在或无访问权限", 404)
            return await _fetch_scheduled_job_with_cursor(cursor, project_id, job_id)


def _to_scheduled_job(row: dict[str, Any]) -> dict[str, Any]:
    evaluator = row.get("evaluator_snapshot") or {}
    return {
        "id": row.get("id"),
        "projectId": row.get("project_id"),
        "type": row.get("task_type") or "AUTO_EVALUATION",
        "name": row.get("name") or "",
        "description": row.get("description") or "",
        "scoreName": row.get("score_name") or "",
        "scoreMapping": row.get("score_mapping") or {},
        "runMode": row.get("run_mode") or "ONCE",
        "frequency": row.get("frequency") or {},
        "timezone": row.get("timezone") or "Asia/Shanghai",
        "status": row.get("status") or "NOT_STARTED",
        "schedulerEnabled": bool(row.get("scheduler_enabled", True)),
        "dataSource": row.get("data_source") or {},
        "evaluator": {
            "id": evaluator.get("id") or row.get("evaluator_id"),
            "name": evaluator.get("name") or "",
            "provider": evaluator.get("provider") or "",
            "description": evaluator.get("description") or "",
            "variables": evaluator.get("variables") or [],
            "outputVariables": evaluator.get("outputVariables") or [],
            "updatedAt": "",
        },
        "variableMapping": row.get("variable_mapping") or {},
        "reportTemplateId": row.get("report_template_id") or "default",
        "sampleRate": row.get("sample_rate") or 100,
        "badcase": row.get("badcase_config") or {},
        "nextRunAt": _format_datetime(row["next_run_at"])
        if row.get("next_run_at")
        else None,
        "lastRunAt": _format_datetime(row["last_run_at"])
        if row.get("last_run_at")
        else None,
        "latestAutoEvaluationTaskId": row.get("latest_auto_evaluation_task_id"),
        "latestReportId": row.get("latest_report_id"),
        "createdBy": row.get("create_by") or "",
        "createdAt": _format_datetime(row["create_date"])
        if row.get("create_date")
        else "",
        "updatedAt": _format_datetime(row["update_date"])
        if row.get("update_date")
        else "",
    }


def _to_execution_log(row: dict[str, Any]) -> dict[str, Any]:
    auto_task_id = row.get("auto_evaluation_task_id")
    report_id = row.get("evaluation_report_id")
    project_id = row.get("project_id")
    duration_text = row.get("duration_text") or ""
    if not duration_text and row.get("started_at") and row.get("ended_at"):
        duration_text = _duration_text(row["started_at"], row["ended_at"])
    return {
        "id": row.get("id"),
        "projectId": project_id,
        "taskId": row.get("scheduled_job_id"),
        "taskName": row.get("scheduled_job_name"),
        "taskType": row.get("task_type") or "AUTO_EVALUATION",
        "triggerType": row.get("trigger_type"),
        "autoEvaluationTaskName": row.get("resolved_auto_evaluation_task_name")
        or row.get("auto_evaluation_task_name")
        or "",
        "autoEvaluationTaskPath": (
            f"/projects/{project_id}/evaluation/auto-evaluations/{auto_task_id}"
            if auto_task_id
            else None
        ),
        "evaluationReportPath": (
            f"/projects/{project_id}/evaluation/reports/{report_id}"
            if report_id
            else None
        ),
        "status": row.get("status"),
        "sampleCount": row.get("sample_count") or 0,
        "startedAt": _format_datetime(row["started_at"])
        if row.get("started_at")
        else "",
        "endedAt": _format_datetime(row["ended_at"]) if row.get("ended_at") else None,
        "durationText": duration_text,
        "errorMessage": row.get("error_message"),
    }
