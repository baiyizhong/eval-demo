from datetime import datetime
from typing import Any, Protocol

from psycopg.types.json import Jsonb

from app.consolidation.models import (
    JobExecutionStatus,
    JobExecutionType,
    ResourceExtensionType,
    validate_execution_payload,
    validate_resource_extension,
)


class AsyncCursor(Protocol):
    async def execute(self, sql: str, params: dict[str, Any]) -> None: ...

    async def fetchone(self) -> dict[str, Any] | None: ...


class ConsolidationRepository:
    """Consolidated writes that participate in the caller's transaction."""

    def __init__(self, cursor: AsyncCursor) -> None:
        self._cursor = cursor

    async def upsert_resource_extension(
        self,
        *,
        extension_id: str,
        project_id: str,
        resource_type: str,
        resource_id: str,
        extension_type: ResourceExtensionType | str,
        schema_version: int,
        payload: dict[str, Any],
        actor: str,
    ) -> dict[str, Any]:
        normalized_type = ResourceExtensionType(extension_type)
        validated_payload = validate_resource_extension(normalized_type, payload)
        await self._cursor.execute(
            """
            INSERT INTO pa_resource_extensions (
                create_by, update_by, id, project_id, resource_type, resource_id,
                extension_type, schema_version, payload, status
            ) VALUES (
                %(actor)s, %(actor)s, %(id)s, %(project_id)s, %(resource_type)s,
                %(resource_id)s, %(extension_type)s, %(schema_version)s,
                %(payload)s, 'ACTIVE'
            )
            ON CONFLICT (project_id, resource_type, resource_id, extension_type)
            DO UPDATE SET
                update_by = EXCLUDED.update_by,
                update_date = NOW(),
                schema_version = EXCLUDED.schema_version,
                payload = CASE
                    WHEN pa_resource_extensions.payload ? 'legacyId'
                    THEN EXCLUDED.payload || jsonb_build_object(
                        'legacyId', pa_resource_extensions.payload -> 'legacyId'
                    )
                    ELSE EXCLUDED.payload
                END,
                status = 'ACTIVE'
            RETURNING *
            """,
            {
                "actor": actor,
                "id": extension_id,
                "project_id": project_id,
                "resource_type": resource_type,
                "resource_id": resource_id,
                "extension_type": normalized_type.value,
                "schema_version": schema_version,
                "payload": Jsonb(validated_payload),
            },
        )
        row = await self._cursor.fetchone()
        if row is None:
            raise RuntimeError("资源扩展写入后未返回记录")
        return row

    async def upsert_evaluation_job(
        self,
        *,
        job_id: str,
        project_id: str,
        name: str,
        description: str,
        trigger_type: str,
        status: str,
        configuration: dict[str, Any],
        legacy_source_type: str,
        legacy_source_id: str,
        actor: str,
    ) -> dict[str, Any]:
        await self._cursor.execute(
            """
            INSERT INTO pa_evaluation_jobs (
                create_by, update_by, id, project_id, name, description,
                trigger_type, status, score_name, evaluator_ids,
                evaluator_snapshot, data_source, variable_mapping, score_mapping,
                sample_rate, report_template_id, report_template_snapshot,
                badcase_config, schedule_config, timezone, scheduler_enabled,
                next_run_at, last_run_at, latest_execution_id, latest_report_id,
                legacy_source_type, legacy_source_id
            ) VALUES (
                %(actor)s, %(actor)s, %(id)s, %(project_id)s, %(name)s,
                %(description)s, %(trigger_type)s, %(status)s, %(score_name)s,
                %(evaluator_ids)s, %(evaluator_snapshot)s, %(data_source)s,
                %(variable_mapping)s, %(score_mapping)s, %(sample_rate)s,
                %(report_template_id)s, %(report_template_snapshot)s,
                %(badcase_config)s, %(schedule_config)s, %(timezone)s,
                %(scheduler_enabled)s, %(next_run_at)s, %(last_run_at)s,
                %(latest_execution_id)s, %(latest_report_id)s,
                %(legacy_source_type)s, %(legacy_source_id)s
            )
            ON CONFLICT (project_id, legacy_source_type, legacy_source_id)
            DO UPDATE SET
                update_by = EXCLUDED.update_by,
                update_date = NOW(),
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                status = EXCLUDED.status,
                score_name = EXCLUDED.score_name,
                evaluator_ids = EXCLUDED.evaluator_ids,
                evaluator_snapshot = EXCLUDED.evaluator_snapshot,
                data_source = EXCLUDED.data_source,
                variable_mapping = EXCLUDED.variable_mapping,
                score_mapping = EXCLUDED.score_mapping,
                sample_rate = EXCLUDED.sample_rate,
                report_template_id = EXCLUDED.report_template_id,
                report_template_snapshot = EXCLUDED.report_template_snapshot,
                badcase_config = EXCLUDED.badcase_config,
                schedule_config = CASE
                    WHEN pa_evaluation_jobs.schedule_config ? 'paLegacy'
                    THEN EXCLUDED.schedule_config || jsonb_build_object(
                        'paLegacy',
                        pa_evaluation_jobs.schedule_config -> 'paLegacy'
                    )
                    ELSE EXCLUDED.schedule_config
                END,
                timezone = EXCLUDED.timezone,
                scheduler_enabled = EXCLUDED.scheduler_enabled,
                next_run_at = EXCLUDED.next_run_at,
                last_run_at = EXCLUDED.last_run_at,
                latest_execution_id = EXCLUDED.latest_execution_id,
                latest_report_id = EXCLUDED.latest_report_id
            RETURNING *
            """,
            {
                "actor": actor,
                "id": job_id,
                "project_id": project_id,
                "name": name,
                "description": description,
                "trigger_type": trigger_type,
                "status": status,
                "score_name": configuration.get("scoreName") or "",
                "evaluator_ids": Jsonb(configuration.get("evaluatorIds") or []),
                "evaluator_snapshot": Jsonb(configuration.get("evaluatorSnapshot") or {}),
                "data_source": Jsonb(configuration.get("dataSource") or {}),
                "variable_mapping": Jsonb(configuration.get("variableMapping") or {}),
                "score_mapping": Jsonb(configuration.get("scoreMapping") or {}),
                "sample_rate": int(configuration.get("sampleRate") or 100),
                "report_template_id": configuration.get("reportTemplateId"),
                "report_template_snapshot": Jsonb(configuration.get("reportTemplateSnapshot") or {}),
                "badcase_config": Jsonb(configuration.get("badcaseConfig") or {}),
                "schedule_config": Jsonb(configuration.get("scheduleConfig") or {}),
                "timezone": configuration.get("timezone") or "Asia/Shanghai",
                "scheduler_enabled": bool(configuration.get("schedulerEnabled")),
                "next_run_at": configuration.get("nextRunAt"),
                "last_run_at": configuration.get("lastRunAt"),
                "latest_execution_id": configuration.get("latestExecutionId"),
                "latest_report_id": configuration.get("latestReportId"),
                "legacy_source_type": legacy_source_type,
                "legacy_source_id": legacy_source_id,
            },
        )
        row = await self._cursor.fetchone()
        if row is None:
            raise RuntimeError("评测定义写入后未返回记录")
        return row

    async def create_execution(
        self,
        *,
        execution_id: str,
        project_id: str,
        job_type: JobExecutionType | str,
        definition_id: str | None,
        idempotency_key: str,
        request_payload: dict[str, Any],
        legacy_source_type: str,
        legacy_source_id: str,
        actor: str,
        expires_at: datetime | None = None,
    ) -> dict[str, Any]:
        normalized_type = JobExecutionType(job_type)
        validated_payload = validate_execution_payload(normalized_type, request_payload)
        await self._cursor.execute(
            """
            INSERT INTO pa_job_executions (
                create_by, update_by, id, project_id, job_type, definition_id,
                status, schema_version, idempotency_key, request_payload,
                expires_at, legacy_source_type, legacy_source_id
            ) VALUES (
                %(actor)s, %(actor)s, %(id)s, %(project_id)s, %(job_type)s,
                %(definition_id)s, 'PENDING', 1, %(idempotency_key)s,
                %(request_payload)s, %(expires_at)s, %(legacy_source_type)s,
                %(legacy_source_id)s
            )
            ON CONFLICT DO NOTHING
            RETURNING *
            """,
            {
                "actor": actor,
                "id": execution_id,
                "project_id": project_id,
                "job_type": normalized_type.value,
                "definition_id": definition_id,
                "idempotency_key": idempotency_key,
                "request_payload": Jsonb(validated_payload),
                "expires_at": expires_at,
                "legacy_source_type": legacy_source_type,
                "legacy_source_id": legacy_source_id,
            },
        )
        row = await self._cursor.fetchone()
        if row is None:
            await self._cursor.execute(
                """
                SELECT *
                FROM pa_job_executions
                WHERE project_id = %(project_id)s
                  AND (
                    (legacy_source_type = %(legacy_source_type)s
                     AND legacy_source_id = %(legacy_source_id)s)
                    OR (%(idempotency_key)s <> ''
                        AND job_type = %(job_type)s
                        AND definition_id IS NOT DISTINCT FROM %(definition_id)s
                        AND idempotency_key = %(idempotency_key)s)
                  )
                ORDER BY create_date ASC, id ASC
                LIMIT 1
                """,
                {
                    "project_id": project_id,
                    "legacy_source_type": legacy_source_type,
                    "legacy_source_id": legacy_source_id,
                    "idempotency_key": idempotency_key,
                    "job_type": normalized_type.value,
                    "definition_id": definition_id,
                },
            )
            row = await self._cursor.fetchone()
        if row is None:
            raise RuntimeError("任务执行写入后未返回记录")
        return row

    async def claim_execution(
        self,
        *,
        job_types: list[JobExecutionType],
        lock_owner: str,
        lease_until: datetime,
        now: datetime,
    ) -> dict[str, Any] | None:
        await self._cursor.execute(
            """
            WITH candidate AS (
                SELECT id
                FROM pa_job_executions
                WHERE job_type = ANY(%(job_types)s)
                  AND status IN ('PENDING', 'RUNNING', 'FAILED')
                  AND (lock_until IS NULL OR lock_until <= %(now)s)
                  AND (expires_at IS NULL OR expires_at > %(now)s)
                ORDER BY create_date, id
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            UPDATE pa_job_executions execution
            SET status = 'RUNNING',
                started_at = COALESCE(started_at, %(now)s),
                attempt_count = attempt_count + 1,
                lock_owner = %(lock_owner)s,
                lock_until = %(lease_until)s,
                update_by = %(lock_owner)s,
                update_date = %(now)s
            FROM candidate
            WHERE execution.id = candidate.id
            RETURNING execution.*
            """,
            {
                "job_types": [job_type.value for job_type in job_types],
                "lock_owner": lock_owner,
                "lease_until": lease_until,
                "now": now,
            },
        )
        return await self._cursor.fetchone()

    async def update_execution(
        self,
        *,
        execution_id: str,
        project_id: str,
        status: JobExecutionStatus | str,
        lock_owner: str,
        completed_count: int,
        success_count: int,
        failure_count: int,
        result_payload: dict[str, Any],
        actor: str,
        total_count: int | None = None,
        error_code: str = "",
        error_message: str = "",
        cursor_payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        normalized_status = JobExecutionStatus(status)
        if total_count is None:
            total_count = max(completed_count, success_count + failure_count)
        progress_percent = (
            100
            if normalized_status
            in {
                JobExecutionStatus.SUCCEEDED,
                JobExecutionStatus.PARTIAL_FAILED,
                JobExecutionStatus.FAILED,
                JobExecutionStatus.CANCELLED,
            }
            else min(100, round(completed_count * 100 / total_count))
            if total_count > 0
            else 0
        )
        await self._cursor.execute(
            """
            UPDATE pa_job_executions
            SET status = %(status)s,
                total_count = %(total_count)s,
                completed_count = %(completed_count)s,
                success_count = %(success_count)s,
                failure_count = %(failure_count)s,
                progress_percent = %(progress_percent)s,
                cursor_payload = %(cursor_payload)s,
                result_payload = pa_job_executions.result_payload || %(result_payload)s,
                error_code = %(error_code)s,
                error_message = %(error_message)s,
                completed_at = CASE WHEN %(terminal)s THEN NOW() ELSE completed_at END,
                lock_owner = CASE WHEN %(terminal)s THEN '' ELSE lock_owner END,
                lock_until = CASE WHEN %(terminal)s THEN NULL ELSE lock_until END,
                update_by = %(actor)s,
                update_date = NOW()
            WHERE id = %(id)s
              AND project_id = %(project_id)s
              AND lock_owner = %(lock_owner)s
            RETURNING *
            """,
            {
                "id": execution_id,
                "project_id": project_id,
                "status": normalized_status.value,
                "total_count": total_count,
                "completed_count": completed_count,
                "success_count": success_count,
                "failure_count": failure_count,
                "progress_percent": progress_percent,
                "cursor_payload": Jsonb(cursor_payload or {}),
                "result_payload": Jsonb(result_payload),
                "error_code": error_code,
                "error_message": error_message,
                "terminal": normalized_status
                in {
                    JobExecutionStatus.SUCCEEDED,
                    JobExecutionStatus.PARTIAL_FAILED,
                    JobExecutionStatus.FAILED,
                    JobExecutionStatus.CANCELLED,
                },
                "lock_owner": lock_owner,
                "actor": actor,
            },
        )
        row = await self._cursor.fetchone()
        if row is None:
            raise RuntimeError("任务执行不存在、项目不匹配或租约已失效")
        return row

    async def get_execution(
        self,
        *,
        execution_id: str,
        project_id: str,
    ) -> dict[str, Any] | None:
        await self._cursor.execute(
            """
            SELECT *
            FROM pa_job_executions
            WHERE id = %(id)s AND project_id = %(project_id)s
            LIMIT 1
            """,
            {"id": execution_id, "project_id": project_id},
        )
        return await self._cursor.fetchone()

    async def sync_execution_from_legacy(
        self,
        *,
        execution_id: str,
        project_id: str,
        status: JobExecutionStatus | str,
        total_count: int,
        completed_count: int,
        success_count: int,
        failure_count: int,
        result_payload: dict[str, Any],
        actor: str,
        error_message: str = "",
        cursor_payload: dict[str, Any] | None = None,
        lock_owner: str = "",
        lock_until: datetime | None = None,
    ) -> dict[str, Any]:
        normalized_status = JobExecutionStatus(status)
        terminal = normalized_status in {
            JobExecutionStatus.SUCCEEDED,
            JobExecutionStatus.PARTIAL_FAILED,
            JobExecutionStatus.FAILED,
            JobExecutionStatus.CANCELLED,
        }
        progress_percent = (
            100
            if terminal
            else min(100, round(completed_count * 100 / total_count))
            if total_count > 0
            else 0
        )
        await self._cursor.execute(
            """
            UPDATE pa_job_executions
            SET status = %(status)s,
                total_count = %(total_count)s,
                completed_count = %(completed_count)s,
                success_count = %(success_count)s,
                failure_count = %(failure_count)s,
                progress_percent = %(progress_percent)s,
                cursor_payload = %(cursor_payload)s,
                result_payload = pa_job_executions.result_payload || %(result_payload)s,
                error_message = %(error_message)s,
                completed_at = CASE WHEN %(terminal)s THEN NOW() ELSE completed_at END,
                lock_owner = CASE WHEN %(terminal)s THEN '' ELSE %(lock_owner)s END,
                lock_until = CASE
                    WHEN %(terminal)s THEN NULL::timestamptz
                    ELSE %(lock_until)s::timestamptz
                END,
                update_by = %(actor)s,
                update_date = NOW()
            WHERE id = %(id)s AND project_id = %(project_id)s
            RETURNING *
            """,
            {
                "id": execution_id,
                "project_id": project_id,
                "status": normalized_status.value,
                "total_count": total_count,
                "completed_count": completed_count,
                "success_count": success_count,
                "failure_count": failure_count,
                "progress_percent": progress_percent,
                "cursor_payload": Jsonb(cursor_payload or {}),
                "result_payload": Jsonb(result_payload),
                "error_message": error_message,
                "terminal": terminal,
                "lock_owner": lock_owner,
                "lock_until": lock_until,
                "actor": actor,
            },
        )
        row = await self._cursor.fetchone()
        if row is None:
            raise RuntimeError("统一任务执行记录不存在")
        return row

    async def sync_execution_lease_from_legacy(
        self,
        *,
        execution_id: str,
        project_id: str,
        lock_owner: str,
        lease_until: datetime,
        actor: str,
        increment_attempt: bool,
    ) -> dict[str, Any]:
        """Mirror a successful legacy claim or renewal without competing for work."""
        await self._cursor.execute(
            """
            UPDATE pa_job_executions
            SET status = 'RUNNING',
                started_at = COALESCE(started_at, NOW()),
                attempt_count = attempt_count + %(attempt_increment)s,
                lock_owner = %(lock_owner)s,
                lock_until = %(lease_until)s,
                update_by = %(actor)s,
                update_date = NOW()
            WHERE id = %(id)s AND project_id = %(project_id)s
            RETURNING *
            """,
            {
                "id": execution_id,
                "project_id": project_id,
                "lock_owner": lock_owner,
                "lease_until": lease_until,
                "attempt_increment": 1 if increment_attempt else 0,
                "actor": actor,
            },
        )
        row = await self._cursor.fetchone()
        if row is None:
            raise RuntimeError("统一任务执行记录不存在")
        return row

    async def sync_export_artifact_from_legacy(
        self,
        *,
        execution_id: str,
        project_id: str,
        artifact_uri: str,
        artifact_name: str,
        artifact_content_type: str,
        artifact_size: int,
        actor: str,
        artifact_checksum: str = "",
    ) -> dict[str, Any]:
        await self._cursor.execute(
            """
            UPDATE pa_job_executions
            SET artifact_uri = %(artifact_uri)s,
                artifact_name = %(artifact_name)s,
                artifact_content_type = %(artifact_content_type)s,
                artifact_size = %(artifact_size)s,
                artifact_checksum = %(artifact_checksum)s,
                update_by = %(actor)s,
                update_date = NOW()
            WHERE id = %(id)s AND project_id = %(project_id)s
            RETURNING *
            """,
            {
                "id": execution_id,
                "project_id": project_id,
                "artifact_uri": artifact_uri,
                "artifact_name": artifact_name,
                "artifact_content_type": artifact_content_type,
                "artifact_size": max(0, artifact_size),
                "artifact_checksum": artifact_checksum,
                "actor": actor,
            },
        )
        row = await self._cursor.fetchone()
        if row is None:
            raise RuntimeError("统一任务执行记录不存在")
        return row

    async def sync_evaluation_job_state(
        self,
        *,
        job_id: str,
        project_id: str,
        status: str,
        latest_execution_id: str,
        latest_report_id: str | None,
        actor: str,
    ) -> dict[str, Any]:
        await self._cursor.execute(
            """
            UPDATE pa_evaluation_jobs
            SET status = %(status)s,
                latest_execution_id = %(latest_execution_id)s,
                latest_report_id = %(latest_report_id)s,
                last_run_at = NOW(),
                update_by = %(actor)s,
                update_date = NOW()
            WHERE id = %(id)s AND project_id = %(project_id)s
            RETURNING *
            """,
            {
                "id": job_id,
                "project_id": project_id,
                "status": status,
                "latest_execution_id": latest_execution_id,
                "latest_report_id": latest_report_id,
                "actor": actor,
            },
        )
        row = await self._cursor.fetchone()
        if row is None:
            raise RuntimeError("统一评测定义不存在")
        return row

    async def archive_evaluation_job(
        self,
        *,
        job_id: str,
        project_id: str,
        actor: str,
    ) -> dict[str, Any]:
        await self._cursor.execute(
            """
            UPDATE pa_evaluation_jobs
            SET status = 'DELETED',
                scheduler_enabled = FALSE,
                next_run_at = NULL,
                update_by = %(actor)s,
                update_date = NOW()
            WHERE id = %(id)s AND project_id = %(project_id)s
            RETURNING *
            """,
            {
                "id": job_id,
                "project_id": project_id,
                "actor": actor,
            },
        )
        row = await self._cursor.fetchone()
        if row is None:
            raise RuntimeError("统一评测定义不存在")
        return row
