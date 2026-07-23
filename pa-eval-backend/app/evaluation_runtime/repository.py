import random
from collections.abc import Awaitable, Callable, Mapping
from typing import Any

from psycopg.types.json import Jsonb

from app.evaluation_runtime.models import EvaluationJob, JobStatus, JobType


ConnectionFactory = Callable[[], Awaitable[Any]]


def retry_delay_seconds(
    attempt: int,
    *,
    base: float = 2.0,
    cap: float = 300.0,
) -> float:
    exponential = min(cap, base ** max(attempt, 1))
    return random.uniform(exponential * 0.5, exponential)


def _evaluation_job(row: Mapping[str, Any]) -> EvaluationJob:
    values = dict(row)
    values["job_type"] = JobType(values["job_type"])
    values["status"] = JobStatus(values["status"])
    return EvaluationJob(**values)


class JobRepository:
    def __init__(self, connection_factory: ConnectionFactory) -> None:
        self._connection_factory = connection_factory

    async def create_job(self, job: EvaluationJob) -> EvaluationJob | None:
        sql = """
            INSERT INTO pa_evaluation_jobs (
                create_by, update_by, create_date, update_date,
                id, project_id, task_id, run_id, parent_job_id, job_type,
                routing_key, batch_start, batch_end, idempotency_key, status,
                priority, attempt_count, max_attempts, next_attempt_at,
                lease_owner, lease_expires_at, heartbeat_at, payload,
                result_summary, raw_result_object_key, error_code, error_message
            )
            SELECT
                %(create_by)s, %(update_by)s, %(create_date)s, %(update_date)s,
                %(id)s, %(project_id)s, %(task_id)s, %(run_id)s,
                %(parent_job_id)s, %(job_type)s, %(routing_key)s,
                %(batch_start)s, %(batch_end)s, %(idempotency_key)s,
                %(status)s, %(priority)s, %(attempt_count)s, %(max_attempts)s,
                %(next_attempt_at)s, %(lease_owner)s, %(lease_expires_at)s,
                %(heartbeat_at)s, %(payload)s, %(result_summary)s,
                %(raw_result_object_key)s, %(error_code)s, %(error_message)s
            FROM pa_auto_evaluation_runs AS active_run
            WHERE active_run.id = %(run_id)s
              AND active_run.status IN ('QUEUED', 'RUNNING')
            FOR UPDATE OF active_run
            ON CONFLICT (idempotency_key) DO UPDATE
            SET idempotency_key = pa_evaluation_jobs.idempotency_key
            RETURNING *
        """
        params = {
            "create_by": job.create_by,
            "update_by": job.update_by,
            "create_date": job.create_date,
            "update_date": job.update_date,
            "id": job.id,
            "project_id": job.project_id,
            "task_id": job.task_id,
            "run_id": job.run_id,
            "parent_job_id": job.parent_job_id,
            "job_type": job.job_type.value,
            "routing_key": job.routing_key,
            "batch_start": job.batch_start,
            "batch_end": job.batch_end,
            "idempotency_key": job.idempotency_key,
            "status": job.status.value,
            "priority": job.priority,
            "attempt_count": job.attempt_count,
            "max_attempts": job.max_attempts,
            "next_attempt_at": job.next_attempt_at,
            "lease_owner": job.lease_owner,
            "lease_expires_at": job.lease_expires_at,
            "heartbeat_at": job.heartbeat_at,
            "payload": Jsonb(dict(job.payload)),
            "result_summary": Jsonb(dict(job.result_summary)),
            "raw_result_object_key": job.raw_result_object_key,
            "error_code": job.error_code,
            "error_message": job.error_message,
        }
        row = await self._fetchone(sql, params)
        return _evaluation_job(row) if row is not None else None

    async def claim_job(
        self,
        job_id: str,
        worker_id: str,
        *,
        lease_seconds: int,
    ) -> EvaluationJob | None:
        if lease_seconds <= 0:
            raise ValueError("lease_seconds must be positive")
        row = await self._fetchone(
            """
            UPDATE pa_evaluation_jobs
            SET status = 'RUNNING',
                lease_owner = %(worker_id)s,
                lease_expires_at = NOW() + make_interval(
                    secs => %(lease_seconds)s
                ),
                heartbeat_at = NOW(),
                attempt_count = attempt_count + 1,
                update_by = %(worker_id)s,
                update_date = NOW()
            WHERE id = %(job_id)s
              AND status = 'ENQUEUED'
              AND attempt_count < max_attempts
              AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
            RETURNING *
            """,
            {
                "job_id": job_id,
                "worker_id": worker_id,
                "lease_seconds": lease_seconds,
            },
        )
        return _evaluation_job(row) if row is not None else None

    async def heartbeat(
        self,
        job_id: str,
        worker_id: str,
        *,
        lease_seconds: int,
    ) -> bool:
        if lease_seconds <= 0:
            raise ValueError("lease_seconds must be positive")
        row = await self._fetchone(
            """
            UPDATE pa_evaluation_jobs
            SET heartbeat_at = NOW(),
                lease_expires_at = NOW() + make_interval(
                    secs => %(lease_seconds)s
                ),
                update_by = %(worker_id)s,
                update_date = NOW()
            WHERE id = %(job_id)s
              AND status = 'RUNNING'
              AND lease_owner = %(worker_id)s
            RETURNING id
            """,
            {
                "job_id": job_id,
                "worker_id": worker_id,
                "lease_seconds": lease_seconds,
            },
        )
        return row is not None

    async def mark_succeeded(
        self,
        job_id: str,
        worker_id: str,
        *,
        result_summary: Mapping[str, Any],
        raw_result_object_key: str | None = None,
    ) -> EvaluationJob | None:
        row = await self._fetchone(
            """
            UPDATE pa_evaluation_jobs
            SET status = 'SUCCEEDED',
                result_summary = %(result_summary)s,
                raw_result_object_key = %(raw_result_object_key)s,
                lease_owner = NULL,
                lease_expires_at = NULL,
                heartbeat_at = NULL,
                error_code = NULL,
                error_message = NULL,
                update_by = %(worker_id)s,
                update_date = NOW()
            WHERE id = %(job_id)s
              AND status = 'RUNNING'
              AND lease_owner = %(worker_id)s
            RETURNING *
            """,
            {
                "job_id": job_id,
                "worker_id": worker_id,
                "result_summary": Jsonb(dict(result_summary)),
                "raw_result_object_key": raw_result_object_key,
            },
        )
        return _evaluation_job(row) if row is not None else None

    async def schedule_retry(
        self,
        job_id: str,
        worker_id: str,
        *,
        attempt: int,
        error_code: str,
        error_message: str,
        base: float = 2.0,
        cap: float = 300.0,
    ) -> EvaluationJob | None:
        delay_seconds = retry_delay_seconds(attempt, base=base, cap=cap)
        row = await self._fetchone(
            """
            UPDATE pa_evaluation_jobs
            SET status = CASE
                    WHEN attempt_count >= max_attempts THEN 'DEAD_LETTER'
                    ELSE 'RETRY_WAIT'
                END,
                next_attempt_at = CASE
                    WHEN attempt_count >= max_attempts THEN next_attempt_at
                    ELSE NOW() + make_interval(secs => %(delay_seconds)s)
                END,
                lease_owner = NULL,
                lease_expires_at = NULL,
                heartbeat_at = NULL,
                error_code = %(error_code)s,
                error_message = %(error_message)s,
                update_by = %(worker_id)s,
                update_date = NOW()
            WHERE id = %(job_id)s
              AND status = 'RUNNING'
              AND lease_owner = %(worker_id)s
            RETURNING *
            """,
            {
                "job_id": job_id,
                "worker_id": worker_id,
                "delay_seconds": delay_seconds,
                "error_code": error_code,
                "error_message": error_message,
            },
        )
        return _evaluation_job(row) if row is not None else None

    async def mark_dead_letter(
        self,
        job_id: str,
        worker_id: str,
        *,
        error_code: str,
        error_message: str,
    ) -> EvaluationJob | None:
        row = await self._fetchone(
            """
            UPDATE pa_evaluation_jobs
            SET status = 'DEAD_LETTER',
                lease_owner = NULL,
                lease_expires_at = NULL,
                heartbeat_at = NULL,
                error_code = %(error_code)s,
                error_message = %(error_message)s,
                update_by = %(worker_id)s,
                update_date = NOW()
            WHERE id = %(job_id)s
              AND status = 'RUNNING'
              AND lease_owner = %(worker_id)s
            RETURNING *
            """,
            {
                "job_id": job_id,
                "worker_id": worker_id,
                "error_code": error_code,
                "error_message": error_message,
            },
        )
        return _evaluation_job(row) if row is not None else None

    async def mark_cancelled(self, job_id: str, worker_id: str) -> bool:
        row = await self._fetchone(
            """
            UPDATE pa_evaluation_jobs
            SET status = 'CANCELLED',
                lease_owner = NULL,
                lease_expires_at = NULL,
                heartbeat_at = NULL,
                update_by = %(worker_id)s,
                update_date = NOW()
            WHERE id = %(job_id)s
              AND status = 'CANCELLING'
              AND lease_owner = %(worker_id)s
            RETURNING id
            """,
            {"job_id": job_id, "worker_id": worker_id},
        )
        return row is not None

    async def request_run_cancel(self, run_id: str, actor: str) -> bool:
        connection = await self._connection_factory()
        async with connection as active_connection:
            async with active_connection.cursor() as cursor:
                params = {"run_id": run_id, "actor": actor}
                await cursor.execute(
                    """
                    UPDATE pa_auto_evaluation_runs
                    SET status = 'CANCELLING',
                        cancel_requested_at = COALESCE(cancel_requested_at, NOW()),
                        update_by = %(actor)s,
                        update_date = NOW()
                    WHERE id = %(run_id)s
                      AND status IN ('QUEUED', 'RUNNING', 'CANCELLING')
                    RETURNING id
                    """,
                    params,
                )
                run = await cursor.fetchone()
                if run is None:
                    return False
                await cursor.execute(
                    """
                    UPDATE pa_evaluation_jobs
                    SET status = CASE
                            WHEN status = 'RUNNING' THEN 'CANCELLING'
                            ELSE 'CANCELLED'
                        END,
                        lease_owner = CASE
                            WHEN status = 'RUNNING' THEN lease_owner
                            ELSE NULL
                        END,
                        lease_expires_at = CASE
                            WHEN status = 'RUNNING' THEN lease_expires_at
                            ELSE NULL
                        END,
                        heartbeat_at = CASE
                            WHEN status = 'RUNNING' THEN heartbeat_at
                            ELSE NULL
                        END,
                        update_by = %(actor)s,
                        update_date = NOW()
                    WHERE run_id = %(run_id)s
                      AND status IN (
                          'PENDING', 'ENQUEUED', 'RETRY_WAIT',
                          'DEAD_LETTER', 'RUNNING'
                      )
                    """,
                    params,
                )
        return True

    async def requeue_dead_letter(
        self,
        job_id: str,
        actor: str,
    ) -> EvaluationJob | None:
        row = await self._fetchone(
            """
            WITH active_run AS MATERIALIZED (
                SELECT run.id
                FROM pa_auto_evaluation_runs AS run
                JOIN pa_evaluation_jobs AS candidate_job
                  ON candidate_job.run_id = run.id
                WHERE candidate_job.id = %(job_id)s
                  AND run.status IN ('QUEUED', 'RUNNING')
                FOR UPDATE OF run
            )
            UPDATE pa_evaluation_jobs AS job
            SET status = 'PENDING',
                attempt_count = 0,
                next_attempt_at = NOW(),
                lease_owner = NULL,
                lease_expires_at = NULL,
                heartbeat_at = NULL,
                error_code = NULL,
                error_message = NULL,
                update_by = %(actor)s,
                update_date = NOW()
            FROM active_run
            WHERE job.id = %(job_id)s
              AND job.status = 'DEAD_LETTER'
              AND job.run_id = active_run.id
            RETURNING job.*
            """,
            {"job_id": job_id, "actor": actor},
        )
        return _evaluation_job(row) if row is not None else None

    async def _fetchone(
        self,
        sql: str,
        params: dict[str, Any],
    ) -> Mapping[str, Any] | None:
        connection = await self._connection_factory()
        async with connection as active_connection:
            async with active_connection.cursor() as cursor:
                await cursor.execute(sql, params)
                return await cursor.fetchone()
