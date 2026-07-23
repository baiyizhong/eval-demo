import random
from collections.abc import Awaitable, Callable, Mapping
from typing import Any

from psycopg.types.json import Jsonb

from app.evaluation_runtime.idempotency import job_idempotency_key, stable_hash
from app.evaluation_runtime.models import EvaluationJob, JobStatus, JobType
from app.evaluation_runtime.storage import StoredManifest


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
    def __init__(
        self,
        connection_factory: ConnectionFactory,
        *,
        dispatch_visibility_seconds: int = 30,
    ) -> None:
        if dispatch_visibility_seconds <= 0:
            raise ValueError("dispatch_visibility_seconds must be positive")
        self._connection_factory = connection_factory
        self._dispatch_visibility_seconds = dispatch_visibility_seconds

    async def get_run_config_snapshot(
        self, run_id: str
    ) -> Mapping[str, Any] | None:
        row = await self._fetchone(
            """
            SELECT config_snapshot
            FROM pa_auto_evaluation_runs
            WHERE id = %(run_id)s
            """,
            {"run_id": run_id},
        )
        if row is None:
            return None
        snapshot = row.get("config_snapshot")
        return snapshot if isinstance(snapshot, Mapping) else None

    async def finalize_prepared_run(
        self,
        *,
        run_id: str,
        project_id: str,
        task_id: str,
        parent_job_id: str,
        actor: str,
        manifest: StoredManifest,
    ) -> bool:
        jobs = []
        for shard in manifest.shards:
            payload = {
                "shardObjectKey": shard.object_key,
                "shardHash": shard.shard_hash,
                "start": shard.start,
                "end": shard.end,
                "contentHash": manifest.content_hash,
                "manifestHash": manifest.manifest_hash,
            }
            idempotency_key = job_idempotency_key(
                run_id,
                JobType.EVALUATE_BATCH,
                batch_start=shard.start,
                batch_end=shard.end,
                payload=payload,
            )
            jobs.append(
                {
                    "id": f"pa-job-{stable_hash(idempotency_key)[:32]}",
                    "project_id": project_id,
                    "task_id": task_id,
                    "run_id": run_id,
                    "parent_job_id": parent_job_id,
                    "job_type": JobType.EVALUATE_BATCH.value,
                    "routing_key": "shared",
                    "batch_start": shard.start,
                    "batch_end": shard.end,
                    "idempotency_key": idempotency_key,
                    "status": JobStatus.PENDING.value,
                    "priority": 0,
                    "max_attempts": 5,
                    "payload": payload,
                    "actor": actor,
                }
            )

        connection = await self._connection_factory()
        async with connection as active_connection:
            async with active_connection.cursor() as cursor:
                await cursor.execute(
                    """
                    UPDATE pa_auto_evaluation_runs
                    SET sample_manifest_object_key = %(manifest_object_key)s,
                        sample_manifest_hash = %(manifest_hash)s,
                        sample_count = %(sample_count)s,
                        status = 'RUNNING',
                        started_at = COALESCE(started_at, NOW()),
                        update_by = %(actor)s,
                        update_date = NOW()
                    WHERE id = %(run_id)s
                      AND project_id = %(project_id)s
                      AND task_id = %(task_id)s
                      AND status IN ('QUEUED', 'RUNNING')
                      AND cancel_requested_at IS NULL
                      AND (
                          sample_manifest_hash IS NULL
                          OR (
                              sample_manifest_hash = %(manifest_hash)s
                              AND sample_manifest_object_key = %(manifest_object_key)s
                          )
                      )
                    RETURNING id
                    """,
                    {
                        "run_id": run_id,
                        "project_id": project_id,
                        "task_id": task_id,
                        "manifest_object_key": manifest.index_object_key,
                        "manifest_hash": manifest.manifest_hash,
                        "sample_count": manifest.total_count,
                        "actor": actor,
                    },
                )
                if await cursor.fetchone() is None:
                    return False
                await cursor.execute(
                    """
                    INSERT INTO pa_evaluation_jobs (
                        create_by, update_by, id, project_id, task_id, run_id,
                        parent_job_id, job_type, routing_key, batch_start,
                        batch_end, idempotency_key, status, priority,
                        max_attempts, payload
                    )
                    SELECT
                        item.actor, item.actor, item.id, item.project_id,
                        item.task_id, item.run_id, item.parent_job_id,
                        item.job_type, item.routing_key, item.batch_start,
                        item.batch_end, item.idempotency_key, item.status,
                        item.priority, item.max_attempts, item.payload
                    FROM jsonb_to_recordset(%(jobs)s::jsonb) AS item(
                        actor text,
                        id text,
                        project_id text,
                        task_id text,
                        run_id text,
                        parent_job_id text,
                        job_type text,
                        routing_key text,
                        batch_start integer,
                        batch_end integer,
                        idempotency_key text,
                        status text,
                        priority integer,
                        max_attempts integer,
                        payload jsonb
                    )
                    ON CONFLICT (idempotency_key) DO NOTHING
                    """,
                    {"jobs": Jsonb(jobs)},
                )
        return True

    async def list_dispatchable(self, *, limit: int) -> list[EvaluationJob]:
        if limit <= 0:
            raise ValueError("limit must be positive")
        rows = await self._fetchall(
            """
            WITH stale_candidates AS MATERIALIZED (
                SELECT id
                FROM pa_evaluation_jobs
                WHERE status = 'ENQUEUED'
                  AND update_date < NOW() - make_interval(
                      secs => %(visibility_seconds)s
                )
                ORDER BY priority DESC, update_date, id
                LIMIT %(limit)s
                FOR UPDATE SKIP LOCKED
            ),
            reserved_enqueued AS (
                UPDATE pa_evaluation_jobs AS job
                SET update_date = NOW()
                FROM stale_candidates AS candidate
                WHERE job.id = candidate.id
                  AND job.status = 'ENQUEUED'
                RETURNING job.*
            ),
            remaining_capacity AS (
                SELECT GREATEST(%(limit)s - COUNT(*), 0)::bigint AS slots
                FROM reserved_enqueued
            ),
            ready_jobs AS (
                SELECT job.*
                FROM pa_evaluation_jobs AS job
                WHERE job.status IN ('PENDING', 'RETRY_WAIT')
                  AND job.next_attempt_at <= NOW()
                ORDER BY job.priority DESC, job.next_attempt_at, job.id
                LIMIT (SELECT slots FROM remaining_capacity)
                FOR UPDATE OF job SKIP LOCKED
            )
            SELECT * FROM reserved_enqueued
            UNION ALL
            SELECT * FROM ready_jobs
            """,
            {
                "limit": limit,
                "visibility_seconds": self._dispatch_visibility_seconds,
            },
        )
        return [_evaluation_job(row) for row in rows]

    async def mark_enqueued_for_dispatch(
        self,
        job_id: str,
    ) -> EvaluationJob | None:
        row = await self._fetchone(
            """
            UPDATE pa_evaluation_jobs
            SET status = 'ENQUEUED',
                update_date = NOW()
            WHERE id = %(job_id)s
              AND status IN ('PENDING', 'RETRY_WAIT')
              AND next_attempt_at <= NOW()
            RETURNING *
            """,
            {"job_id": job_id},
        )
        return _evaluation_job(row) if row is not None else None

    async def requeue_expired_leases(
        self,
        *,
        limit: int,
        actor: str,
    ) -> list[EvaluationJob]:
        if limit <= 0:
            raise ValueError("limit must be positive")
        rows = await self._fetchall(
            """
            WITH candidate_jobs AS MATERIALIZED (
                SELECT job.id AS job_id, job.run_id
                FROM pa_evaluation_jobs AS job
                WHERE job.status = 'RUNNING'
                  AND job.lease_expires_at < NOW()
                ORDER BY job.lease_expires_at, job.id
                LIMIT %(limit)s
            ),
            locked_runs AS MATERIALIZED (
                SELECT run.id
                FROM pa_auto_evaluation_runs AS run
                JOIN (
                    SELECT DISTINCT run_id
                    FROM candidate_jobs
                ) AS candidate_runs
                  ON candidate_runs.run_id = run.id
                ORDER BY run.id
                FOR UPDATE OF run
            ),
            locked_jobs AS MATERIALIZED (
                SELECT job.id
                FROM pa_evaluation_jobs AS job
                JOIN candidate_jobs AS candidate
                  ON candidate.job_id = job.id
                JOIN locked_runs AS locked_run
                  ON locked_run.id = job.run_id
                WHERE job.status = 'RUNNING'
                  AND job.lease_expires_at < NOW()
                ORDER BY job.id
                FOR UPDATE OF job
            ),
            requeued AS (
                UPDATE pa_evaluation_jobs AS job
                SET status = CASE
                        WHEN job.attempt_count >= job.max_attempts THEN 'DEAD_LETTER'
                        ELSE 'RETRY_WAIT'
                    END,
                    next_attempt_at = CASE
                        WHEN job.attempt_count >= job.max_attempts
                            THEN job.next_attempt_at
                        ELSE NOW() + make_interval(
                            secs => LEAST(
                                300.0,
                                POWER(
                                    2.0,
                                    GREATEST(job.attempt_count, 1)::double precision
                                )
                            )
                        )
                    END,
                    lease_owner = NULL,
                    lease_expires_at = NULL,
                    heartbeat_at = NULL,
                    error_code = 'LEASE_EXPIRED',
                    error_message = 'Job lease expired',
                    update_by = %(actor)s,
                    update_date = NOW()
                FROM locked_jobs AS locked_job
                WHERE job.id = locked_job.id
                  AND job.status = 'RUNNING'
                  AND job.lease_expires_at < NOW()
                RETURNING job.*
            ),
            touched_runs AS (
                UPDATE pa_auto_evaluation_runs AS run
                SET update_by = %(actor)s,
                    update_date = NOW()
                FROM (
                    SELECT DISTINCT run_id
                    FROM requeued
                ) AS affected
                WHERE run.id = affected.run_id
                RETURNING run.id
            )
            SELECT requeued.*
            FROM requeued
            CROSS JOIN (
                SELECT COUNT(*) AS touched_count
                FROM touched_runs
            ) AS run_updates
            """,
            {"limit": limit, "actor": actor},
        )
        return [_evaluation_job(row) for row in rows]

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

    async def _fetchall(
        self,
        sql: str,
        params: dict[str, Any],
    ) -> list[Mapping[str, Any]]:
        connection = await self._connection_factory()
        async with connection as active_connection:
            async with active_connection.cursor() as cursor:
                await cursor.execute(sql, params)
                return list(await cursor.fetchall())
