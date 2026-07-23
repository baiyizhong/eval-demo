import asyncio
import os
import uuid
from datetime import datetime, timezone
from typing import Any

import psycopg
import pytest
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.evaluation_runtime.models import EvaluationJob, JobStatus, JobType
from app.evaluation_runtime.repository import JobRepository, retry_delay_seconds
from app.evaluation_runtime.storage import ShardDescriptor, StoredManifest


class FakeCursor:
    def __init__(self, rows: list[dict[str, Any] | None] | None = None) -> None:
        self.rows = list(rows or [])
        self.executions: list[tuple[str, dict[str, Any]]] = []

    async def __aenter__(self) -> "FakeCursor":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def execute(self, sql: str, params: dict[str, Any]) -> None:
        self.executions.append((sql, params))

    async def fetchone(self) -> dict[str, Any] | None:
        return self.rows.pop(0) if self.rows else None

    async def fetchall(self) -> list[dict[str, Any]]:
        rows = [row for row in self.rows if row is not None]
        self.rows.clear()
        return rows


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self._cursor = cursor
        self.entered = 0
        self.exited = 0

    async def __aenter__(self) -> "FakeConnection":
        self.entered += 1
        return self

    async def __aexit__(self, *args: object) -> None:
        self.exited += 1

    def cursor(self) -> FakeCursor:
        return self._cursor


class FakeConnectionWrapper:
    def __init__(self, active_connection: FakeConnection) -> None:
        self.active_connection = active_connection

    async def __aenter__(self) -> FakeConnection:
        return self.active_connection

    async def __aexit__(self, *args: object) -> None:
        return None


def _job_row(**overrides: Any) -> dict[str, Any]:
    now = datetime(2026, 7, 23, tzinfo=timezone.utc)
    row: dict[str, Any] = {
        "create_by": "user-1",
        "update_by": "user-1",
        "create_date": now,
        "update_date": now,
        "id": "job-1",
        "project_id": "project-1",
        "task_id": "task-1",
        "run_id": "run-1",
        "parent_job_id": None,
        "job_type": "EVALUATE_BATCH",
        "routing_key": "shared",
        "batch_start": 0,
        "batch_end": 10,
        "idempotency_key": "idem-secret-value",
        "status": "ENQUEUED",
        "priority": 2,
        "attempt_count": 0,
        "max_attempts": 5,
        "next_attempt_at": now,
        "lease_owner": None,
        "lease_expires_at": None,
        "heartbeat_at": None,
        "payload": {"sample_ids": ["sample-1"]},
        "result_summary": {},
        "raw_result_object_key": None,
        "error_code": None,
        "error_message": None,
    }
    row.update(overrides)
    return row


def _job(**overrides: Any) -> EvaluationJob:
    row = _job_row(**overrides)
    row["job_type"] = JobType(row["job_type"])
    row["status"] = JobStatus(row["status"])
    return EvaluationJob(**row)


def _repository(
    rows: list[dict[str, Any] | None] | None = None,
) -> tuple[JobRepository, FakeConnection, FakeCursor]:
    cursor = FakeCursor(rows)
    connection = FakeConnection(cursor)

    async def connection_factory() -> FakeConnection:
        return connection

    return JobRepository(connection_factory), connection, cursor


def _jsonb_value(value: Any) -> Any:
    return getattr(value, "obj", value)


def test_create_job_uses_idempotent_insert_without_overwriting_existing_row() -> None:
    repository, _, cursor = _repository([_job_row()])

    created = asyncio.run(repository.create_job(_job()))

    assert created is not None
    assert created.id == "job-1"
    sql, params = cursor.executions[0]
    conflict_clause = sql.split("ON CONFLICT", maxsplit=1)[1]
    assert "(idempotency_key) DO UPDATE" in conflict_clause
    assert "idempotency_key = pa_evaluation_jobs.idempotency_key" in conflict_clause
    assert "payload =" not in conflict_clause
    assert "status =" not in conflict_clause
    assert "idem-secret-value" not in sql
    assert "FROM pa_auto_evaluation_runs" in sql
    assert "status IN ('QUEUED', 'RUNNING')" in sql
    assert "FOR UPDATE" in sql
    assert params["idempotency_key"] == "idem-secret-value"
    assert _jsonb_value(params["payload"]) == {"sample_ids": ["sample-1"]}


def test_create_job_returns_none_when_run_is_cancelling() -> None:
    repository, _, cursor = _repository([None])

    created = asyncio.run(repository.create_job(_job()))

    assert created is None
    sql, params = cursor.executions[0]
    assert "status IN ('QUEUED', 'RUNNING')" in sql
    assert "CANCELLING" not in sql
    assert params["run_id"] == "run-1"


def test_claim_job_is_one_conditional_update_and_increments_attempt_only_on_claim() -> (
    None
):
    claimed_row = _job_row(status="RUNNING", attempt_count=1, lease_owner="worker-a")
    repository, _, cursor = _repository([claimed_row])

    claimed = asyncio.run(repository.claim_job("job-1", "worker-a", lease_seconds=120))

    assert claimed is not None
    assert claimed.status is JobStatus.RUNNING
    assert claimed.attempt_count == 1
    assert len(cursor.executions) == 1
    sql, params = cursor.executions[0]
    assert "attempt_count = attempt_count + 1" in sql
    assert "status = 'ENQUEUED'" in sql
    assert "lease_expires_at IS NULL OR lease_expires_at < NOW()" in sql
    assert "worker-a" not in sql
    assert params == {
        "job_id": "job-1",
        "worker_id": "worker-a",
        "lease_seconds": 120,
    }


def test_claim_job_returns_none_for_terminal_duplicate_without_extra_write() -> None:
    repository, _, cursor = _repository([None])

    claimed = asyncio.run(repository.claim_job("job-1", "worker-b", lease_seconds=120))

    assert claimed is None
    assert len(cursor.executions) == 1


def test_claim_job_rejects_jobs_at_max_attempts_before_increment() -> None:
    repository, _, cursor = _repository([None])

    claimed = asyncio.run(repository.claim_job("job-1", "worker-b", lease_seconds=120))

    assert claimed is None
    sql, _ = cursor.executions[0]
    assert "attempt_count < max_attempts" in sql


def test_heartbeat_requires_running_job_owner_and_extends_lease() -> None:
    repository, _, cursor = _repository([{"id": "job-1"}, None])

    renewed = asyncio.run(repository.heartbeat("job-1", "worker-a", lease_seconds=60))
    rejected = asyncio.run(repository.heartbeat("job-1", "worker-b", lease_seconds=60))

    assert renewed is True
    assert rejected is False
    sql, params = cursor.executions[0]
    assert "status = 'RUNNING'" in sql
    assert "lease_owner = %(worker_id)s" in sql
    assert "lease_expires_at = NOW() + make_interval" in sql
    assert params["worker_id"] == "worker-a"


def test_mark_succeeded_requires_running_owner_and_clears_lease() -> None:
    succeeded_row = _job_row(
        status="SUCCEEDED", attempt_count=1, result_summary={"scores": 10}
    )
    repository, _, cursor = _repository([succeeded_row])

    result = asyncio.run(
        repository.mark_succeeded(
            "job-1",
            "worker-a",
            result_summary={"scores": 10},
            raw_result_object_key="results/job-1.json",
        )
    )

    assert result is not None
    assert result.status is JobStatus.SUCCEEDED
    sql, params = cursor.executions[0]
    assert "status = 'RUNNING'" in sql
    assert "lease_owner = %(worker_id)s" in sql
    assert "lease_owner = NULL" in sql
    assert _jsonb_value(params["result_summary"]) == {"scores": 10}


def test_retry_delay_uses_bounded_full_jitter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[tuple[float, float]] = []

    def fake_uniform(lower: float, upper: float) -> float:
        captured.append((lower, upper))
        return lower

    monkeypatch.setattr(
        "app.evaluation_runtime.repository.random.uniform", fake_uniform
    )

    assert retry_delay_seconds(3, base=2.0, cap=300.0) == 4.0
    assert captured == [(4.0, 8.0)]


def test_schedule_retry_checks_owner_and_does_not_change_attempt_count() -> None:
    retry_row = _job_row(
        status="RETRY_WAIT",
        attempt_count=2,
        error_code="RATE_LIMIT",
        error_message="quota exhausted",
    )
    repository, _, cursor = _repository([retry_row])

    result = asyncio.run(
        repository.schedule_retry(
            "job-1",
            "worker-a",
            attempt=2,
            error_code="RATE_LIMIT",
            error_message="quota exhausted",
        )
    )

    assert result is not None
    sql, params = cursor.executions[0]
    assert "status = 'RUNNING'" in sql
    assert "lease_owner = %(worker_id)s" in sql
    assert "SET attempt_count" not in sql
    assert "quota exhausted" not in sql
    assert 2.0 <= params["delay_seconds"] <= 4.0


def test_schedule_retry_moves_exhausted_job_to_dead_letter_atomically() -> None:
    dead_row = _job_row(status="DEAD_LETTER", attempt_count=5, max_attempts=5)
    repository, _, cursor = _repository([dead_row])

    result = asyncio.run(
        repository.schedule_retry(
            "job-1",
            "worker-a",
            attempt=5,
            error_code="RATE_LIMIT",
            error_message="still exhausted",
        )
    )

    assert result is not None
    assert result.status is JobStatus.DEAD_LETTER
    sql, _ = cursor.executions[0]
    assert "WHEN attempt_count >= max_attempts THEN 'DEAD_LETTER'" in sql
    assert "ELSE 'RETRY_WAIT'" in sql


def test_mark_dead_letter_only_updates_running_owner() -> None:
    dead_row = _job_row(
        status="DEAD_LETTER",
        attempt_count=5,
        error_code="INVALID_CONFIG",
        error_message="invalid evaluator",
    )
    repository, _, cursor = _repository([dead_row])

    result = asyncio.run(
        repository.mark_dead_letter(
            "job-1",
            "worker-a",
            error_code="INVALID_CONFIG",
            error_message="invalid evaluator",
        )
    )

    assert result is not None
    sql, params = cursor.executions[0]
    assert "status = 'RUNNING'" in sql
    assert "lease_owner = %(worker_id)s" in sql
    assert "invalid evaluator" not in sql
    assert params["error_code"] == "INVALID_CONFIG"


def test_request_run_cancel_updates_run_and_cancellable_jobs_in_one_transaction() -> (
    None
):
    repository, connection, cursor = _repository([{"id": "run-1"}])

    updated = asyncio.run(repository.request_run_cancel("run-1", "user-9"))

    assert updated is True
    assert connection.entered == 1
    assert connection.exited == 1
    assert len(cursor.executions) == 2
    run_sql, run_params = cursor.executions[0]
    jobs_sql, jobs_params = cursor.executions[1]
    assert "UPDATE pa_auto_evaluation_runs" in run_sql
    assert "SET status = 'CANCELLING'" in run_sql
    assert "cancel_requested_at = COALESCE(cancel_requested_at, NOW())" in run_sql
    assert "status IN ('QUEUED', 'RUNNING', 'CANCELLING')" in run_sql
    assert "UPDATE pa_evaluation_jobs" in jobs_sql
    assert "WHEN status = 'RUNNING' THEN 'CANCELLING'" in jobs_sql
    assert "ELSE 'CANCELLED'" in jobs_sql
    assert "SUCCEEDED" not in jobs_sql
    assert run_params == jobs_params == {"run_id": "run-1", "actor": "user-9"}


def test_request_run_cancel_is_idempotent_while_run_is_cancelling() -> None:
    repository, _, cursor = _repository([{"id": "run-1"}, {"id": "run-1"}])

    first = asyncio.run(repository.request_run_cancel("run-1", "user-9"))
    second = asyncio.run(repository.request_run_cancel("run-1", "user-9"))

    assert first is True
    assert second is True
    assert len(cursor.executions) == 4
    assert all(
        "status IN ('QUEUED', 'RUNNING', 'CANCELLING')" in sql
        for sql, _ in cursor.executions[::2]
    )


def test_mark_cancelled_requires_cancelling_owner_and_clears_lease() -> None:
    repository, _, cursor = _repository([{"id": "job-1"}, None])

    cancelled = asyncio.run(repository.mark_cancelled("job-1", "worker-a"))
    rejected = asyncio.run(repository.mark_cancelled("job-1", "worker-b"))

    assert cancelled is True
    assert rejected is False
    sql, params = cursor.executions[0]
    assert "status = 'CANCELLED'" in sql
    assert "status = 'CANCELLING'" in sql
    assert "lease_owner = %(worker_id)s" in sql
    assert "lease_owner = NULL" in sql
    assert "lease_expires_at = NULL" in sql
    assert "heartbeat_at = NULL" in sql
    assert params == {"job_id": "job-1", "worker_id": "worker-a"}


def test_request_run_cancel_does_not_touch_jobs_for_terminal_run() -> None:
    repository, _, cursor = _repository([None])

    updated = asyncio.run(repository.request_run_cancel("run-1", "user-9"))

    assert updated is False
    assert len(cursor.executions) == 1


def test_repository_uses_connection_returned_by_pool_wrapper() -> None:
    cursor = FakeCursor([_job_row()])
    active_connection = FakeConnection(cursor)
    wrapper = FakeConnectionWrapper(active_connection)

    async def connection_factory() -> FakeConnectionWrapper:
        return wrapper

    repository = JobRepository(connection_factory)

    created = asyncio.run(repository.create_job(_job()))

    assert created is not None
    assert created.id == "job-1"


def test_requeue_dead_letter_resets_attempts_and_clears_error_and_lease() -> None:
    pending_row = _job_row(status="PENDING", attempt_count=0)
    repository, _, cursor = _repository([pending_row])

    result = asyncio.run(repository.requeue_dead_letter("job-1", "operator-1"))

    assert result is not None
    sql, params = cursor.executions[0]
    assert "status = 'DEAD_LETTER'" in sql
    assert "attempt_count = 0" in sql
    assert "lease_owner = NULL" in sql
    assert "lease_expires_at = NULL" in sql
    assert "heartbeat_at = NULL" in sql
    assert "error_code = NULL" in sql
    assert "error_message = NULL" in sql
    assert "pa_auto_evaluation_runs" in sql
    assert "status IN ('QUEUED', 'RUNNING')" in sql
    assert params == {"job_id": "job-1", "actor": "operator-1"}


def test_requeue_dead_letter_returns_none_when_run_is_cancelling() -> None:
    repository, _, cursor = _repository([None])

    result = asyncio.run(repository.requeue_dead_letter("job-1", "operator-1"))

    assert result is None
    sql, _ = cursor.executions[0]
    assert "status IN ('QUEUED', 'RUNNING')" in sql


def test_list_dispatchable_reserves_stale_enqueued_and_lists_due_new_jobs() -> None:
    pending = _job_row(id="job-pending", status="PENDING")
    stale = _job_row(id="job-stale", status="ENQUEUED")
    repository, _, cursor = _repository([pending, stale])

    jobs = asyncio.run(repository.list_dispatchable(limit=25))

    assert [job.id for job in jobs] == ["job-pending", "job-stale"]
    sql, params = cursor.executions[0]
    assert "status = 'ENQUEUED'" in sql
    assert "update_date < NOW() - make_interval" in sql
    assert "FOR UPDATE SKIP LOCKED" in sql
    assert "LIMIT %(limit)s\n                FOR UPDATE SKIP LOCKED" in sql
    assert (
        "LIMIT (SELECT slots FROM remaining_capacity)\n"
        "                FOR UPDATE OF job SKIP LOCKED"
    ) in sql
    assert "SET update_date = NOW()" in sql
    assert "status IN ('PENDING', 'RETRY_WAIT')" in sql
    assert "next_attempt_at <= NOW()" in sql
    assert params == {"limit": 25, "visibility_seconds": 30}


def test_list_dispatchable_rejects_invalid_limit() -> None:
    repository, _, cursor = _repository()

    with pytest.raises(ValueError, match="limit must be positive"):
        asyncio.run(repository.list_dispatchable(limit=0))

    assert cursor.executions == []


def test_mark_enqueued_for_dispatch_is_a_single_conditional_transition() -> None:
    enqueued = _job_row(status="ENQUEUED")
    repository, _, cursor = _repository([enqueued, None])

    first = asyncio.run(repository.mark_enqueued_for_dispatch("job-1"))
    duplicate = asyncio.run(repository.mark_enqueued_for_dispatch("job-1"))

    assert first is not None
    assert first.status is JobStatus.ENQUEUED
    assert duplicate is None
    sql, params = cursor.executions[0]
    assert "SET status = 'ENQUEUED'" in sql
    assert "status IN ('PENDING', 'RETRY_WAIT')" in sql
    assert "next_attempt_at <= NOW()" in sql
    assert params == {"job_id": "job-1"}


def test_requeue_expired_leases_retries_or_dead_letters_and_touches_runs() -> None:
    retrying = _job_row(
        id="job-retry",
        status="RETRY_WAIT",
        attempt_count=2,
        lease_owner=None,
    )
    dead = _job_row(
        id="job-dead",
        status="DEAD_LETTER",
        attempt_count=5,
        max_attempts=5,
        lease_owner=None,
    )
    repository, _, cursor = _repository([retrying, dead])

    jobs = asyncio.run(
        repository.requeue_expired_leases(limit=50, actor="lease-reaper")
    )

    assert [job.status for job in jobs] == [
        JobStatus.RETRY_WAIT,
        JobStatus.DEAD_LETTER,
    ]
    sql, params = cursor.executions[0]
    assert "status = 'RUNNING'" in sql
    assert "lease_expires_at < NOW()" in sql
    assert "locked_runs AS MATERIALIZED" in sql
    assert "locked_jobs AS MATERIALIZED" in sql
    candidate_sql, after_candidates = sql.split(
        "locked_runs AS MATERIALIZED", maxsplit=1
    )
    locked_runs_sql, locked_jobs_sql = after_candidates.split(
        "locked_jobs AS MATERIALIZED", maxsplit=1
    )
    locked_jobs_only, _ = locked_jobs_sql.split("requeued AS", maxsplit=1)
    assert "FOR UPDATE" not in candidate_sql
    assert "SELECT job.id AS job_id, job.run_id" in candidate_sql
    assert "LIMIT %(limit)s" in candidate_sql
    assert "ORDER BY run.id" in locked_runs_sql
    assert "FOR UPDATE OF run" in locked_runs_sql
    assert locked_runs_sql.index("ORDER BY run.id") < locked_runs_sql.index(
        "FOR UPDATE OF run"
    )
    assert "JOIN locked_runs" in locked_jobs_only
    assert "ORDER BY job.id" in locked_jobs_only
    assert "FOR UPDATE OF job" in locked_jobs_only
    assert locked_jobs_only.index("ORDER BY job.id") < locked_jobs_only.index(
        "FOR UPDATE OF job"
    )
    assert "job.status = 'RUNNING'" in locked_jobs_only
    assert "job.lease_expires_at < NOW()" in locked_jobs_only
    assert sql.index("locked_runs AS MATERIALIZED") < sql.index(
        "locked_jobs AS MATERIALIZED"
    ) < sql.index("requeued AS")
    assert "WHEN job.attempt_count >= job.max_attempts THEN 'DEAD_LETTER'" in sql
    assert "ELSE 'RETRY_WAIT'" in sql
    assert "next_attempt_at" in sql
    assert "lease_owner = NULL" in sql
    assert "lease_expires_at = NULL" in sql
    assert "heartbeat_at = NULL" in sql
    assert "UPDATE pa_auto_evaluation_runs" in sql
    assert "update_date = NOW()" in sql
    assert params == {"limit": 50, "actor": "lease-reaper"}


def test_requeue_expired_leases_rejects_invalid_limit() -> None:
    repository, _, cursor = _repository()

    with pytest.raises(ValueError, match="limit must be positive"):
        asyncio.run(repository.requeue_expired_leases(limit=0, actor="reaper"))

    assert cursor.executions == []


def _stored_manifest() -> StoredManifest:
    return StoredManifest(
        index_object_key=(
            "manifests/project-1/run-1/manifest-hash/index.json"
        ),
        manifest_hash="manifest-hash",
        total_count=150,
        batch_size=100,
        shards=(
            ShardDescriptor(
                start=0,
                end=100,
                object_key="manifests/project-1/run-1/batches/0-100-a.jsonl.gz",
                shard_hash="a" * 64,
            ),
            ShardDescriptor(
                start=100,
                end=150,
                object_key=(
                    "manifests/project-1/run-1/batches/100-150-b.jsonl.gz"
                ),
                shard_hash="b" * 64,
            ),
        ),
    )


def test_get_run_config_snapshot_uses_parameterized_read() -> None:
    snapshot = {"dataSource": {"type": "DATASET"}}
    repository, _, cursor = _repository([{"config_snapshot": snapshot}])

    result = asyncio.run(repository.get_run_config_snapshot("run-1"))

    assert result == snapshot
    sql, params = cursor.executions[0]
    assert "SELECT config_snapshot" in sql
    assert "FROM pa_auto_evaluation_runs" in sql
    assert "run-1" not in sql
    assert params == {"run_id": "run-1"}


def test_finalize_prepared_run_updates_run_and_bulk_inserts_in_one_transaction() -> (
    None
):
    repository, connection, cursor = _repository([{"id": "run-1"}])
    manifest = _stored_manifest()

    finalized = asyncio.run(
        repository.finalize_prepared_run(
            run_id="run-1",
            project_id="project-1",
            task_id="task-1",
            parent_job_id="prepare-job-1",
            actor="worker-1",
            manifest=manifest,
        )
    )

    assert finalized is True
    assert connection.entered == connection.exited == 1
    assert len(cursor.executions) == 2
    run_sql, run_params = cursor.executions[0]
    jobs_sql, jobs_params = cursor.executions[1]
    assert "UPDATE pa_auto_evaluation_runs" in run_sql
    assert "status = 'RUNNING'" in run_sql
    assert "sample_manifest_object_key = %(manifest_object_key)s" in run_sql
    assert "sample_manifest_hash = %(manifest_hash)s" in run_sql
    assert "sample_count = %(sample_count)s" in run_sql
    assert "status IN ('QUEUED', 'RUNNING')" in run_sql
    assert "cancel_requested_at IS NULL" in run_sql
    assert "sample_manifest_hash IS NULL" in run_sql
    assert "sample_manifest_hash = %(manifest_hash)s" in run_sql
    assert run_params["manifest_object_key"] == manifest.index_object_key
    assert run_params["manifest_hash"] == manifest.manifest_hash
    assert run_params["sample_count"] == 150

    assert jobs_sql.count("INSERT INTO pa_evaluation_jobs") == 1
    assert "jsonb_to_recordset" in jobs_sql
    assert "ON CONFLICT (idempotency_key) DO NOTHING" in jobs_sql
    assert "DO UPDATE" not in jobs_sql
    jobs = _jsonb_value(jobs_params["jobs"])
    assert len(jobs) == 2
    assert jobs[0]["payload"] == {
        "shardObjectKey": manifest.shards[0].object_key,
        "shardHash": manifest.shards[0].shard_hash,
        "start": 0,
        "end": 100,
        "manifestHash": manifest.manifest_hash,
    }
    assert jobs[1]["batch_start"] == 100
    assert jobs[1]["batch_end"] == 150
    assert jobs[0]["idempotency_key"] != jobs[1]["idempotency_key"]
    assert jobs_params == {"jobs": jobs_params["jobs"]}


def test_finalize_prepared_run_duplicate_manifest_never_overwrites_existing_jobs() -> (
    None
):
    repository, _, cursor = _repository([{"id": "run-1"}, {"id": "run-1"}])
    kwargs = {
        "run_id": "run-1",
        "project_id": "project-1",
        "task_id": "task-1",
        "parent_job_id": "prepare-job-1",
        "actor": "worker-1",
        "manifest": _stored_manifest(),
    }

    assert asyncio.run(repository.finalize_prepared_run(**kwargs)) is True
    assert asyncio.run(repository.finalize_prepared_run(**kwargs)) is True

    bulk_sql = [
        sql
        for sql, _ in cursor.executions
        if "INSERT INTO pa_evaluation_jobs" in sql
    ]
    assert len(bulk_sql) == 2
    assert all("ON CONFLICT (idempotency_key) DO NOTHING" in sql for sql in bulk_sql)
    assert all("DO UPDATE" not in sql for sql in bulk_sql)


def test_finalize_prepared_run_cancel_gate_skips_bulk_insert() -> None:
    repository, connection, cursor = _repository([None])

    finalized = asyncio.run(
        repository.finalize_prepared_run(
            run_id="run-1",
            project_id="project-1",
            task_id="task-1",
            parent_job_id="prepare-job-1",
            actor="worker-1",
            manifest=_stored_manifest(),
        )
    )

    assert finalized is False
    assert connection.entered == connection.exited == 1
    assert len(cursor.executions) == 1
    sql, _ = cursor.executions[0]
    assert "status IN ('QUEUED', 'RUNNING')" in sql
    assert "cancel_requested_at IS NULL" in sql


@pytest.mark.skipif(
    not os.getenv("PA_EVAL_TEST_DATABASE_URL"),
    reason="未配置独立测试库 PA_EVAL_TEST_DATABASE_URL，跳过真实 PostgreSQL 并发测试",
)
def test_real_postgres_duplicate_create_and_concurrent_claim() -> None:
    database_url = os.environ["PA_EVAL_TEST_DATABASE_URL"]

    async def connection_factory() -> psycopg.AsyncConnection[Any]:
        return await psycopg.AsyncConnection.connect(
            database_url,
            row_factory=dict_row,
        )

    async def scenario() -> None:
        repository = JobRepository(connection_factory)
        suffix = uuid.uuid4().hex
        project_id = f"test-project-{suffix}"
        task_id = f"test-task-{suffix}"
        run_id = f"test-run-{suffix}"
        now = datetime.now(timezone.utc)
        async with await connection_factory() as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    INSERT INTO pa_auto_evaluation_tasks (
                        id, project_id, name, description, score_name,
                        score_mapping, status, data_source_type, dataset_id,
                        trace_query, evaluator_ids, run_config, report_config,
                        evaluator_id, evaluator_name, evaluator_type,
                        evaluator_version, data_source, sample_rate,
                        execution_stats, badcase_count, latest_report_id,
                        report_template_id, report_template_snapshot,
                        create_by, last_run_at, create_date, update_by,
                        update_date
                    ) VALUES (
                        %(task_id)s, %(project_id)s, 'repository test', '',
                        'relevance', %(score_mapping)s, 'RUNNING', 'DATASET',
                        NULL, %(trace_query)s, %(evaluator_ids)s,
                        %(run_config)s, %(report_config)s, 'test-evaluator',
                        'test evaluator', 'LLM', 'v1', %(data_source)s, 100,
                        %(execution_stats)s, 0, NULL, NULL,
                        %(report_template_snapshot)s, 'pytest', %(now)s,
                        %(now)s, 'pytest', %(now)s
                    )
                    """,
                    {
                        "task_id": task_id,
                        "project_id": project_id,
                        "score_mapping": Jsonb({}),
                        "trace_query": Jsonb({}),
                        "evaluator_ids": Jsonb(["test-evaluator"]),
                        "run_config": Jsonb({}),
                        "report_config": Jsonb({}),
                        "data_source": Jsonb({"type": "DATASET"}),
                        "execution_stats": Jsonb({}),
                        "report_template_snapshot": Jsonb({}),
                        "now": now,
                    },
                )
                await cursor.execute(
                    """
                    INSERT INTO pa_auto_evaluation_runs (
                        id, project_id, task_id, status, sample_count,
                        completed_count, failed_count, badcase_count,
                        started_at, ended_at, duration_text, create_by,
                        create_date, update_by, update_date
                    ) VALUES (
                        %(run_id)s, %(project_id)s, %(task_id)s, 'RUNNING',
                        1, 0, 0, 0, %(now)s, NULL, '运行中', 'pytest',
                        %(now)s, 'pytest', %(now)s
                    )
                    """,
                    {
                        "run_id": run_id,
                        "project_id": project_id,
                        "task_id": task_id,
                        "now": now,
                    },
                )

        job = _job(
            id=f"test-job-{suffix}",
            project_id=project_id,
            task_id=task_id,
            run_id=run_id,
            idempotency_key=f"test-idempotency-{suffix}",
        )
        duplicate = _job(
            id=f"test-job-duplicate-{suffix}",
            project_id=project_id,
            task_id=task_id,
            run_id=run_id,
            idempotency_key=job.idempotency_key,
            status="PENDING",
            payload={"must_not": "overwrite"},
        )
        try:
            first = await repository.create_job(job)
            second = await repository.create_job(duplicate)
            assert first.id == second.id == job.id
            assert second.status is JobStatus.ENQUEUED
            assert second.payload == job.payload

            claimed = await asyncio.gather(
                repository.claim_job(job.id, "worker-a", lease_seconds=120),
                repository.claim_job(job.id, "worker-b", lease_seconds=120),
            )
            assert sum(item is not None for item in claimed) == 1
            winner = next(item for item in claimed if item is not None)
            assert winner.attempt_count == 1
            assert winner.lease_owner is not None
            succeeded = await repository.mark_succeeded(
                job.id,
                winner.lease_owner,
                result_summary={"scores": 1},
            )
            assert succeeded is not None
            assert succeeded.status is JobStatus.SUCCEEDED
            duplicate_claim = await repository.claim_job(
                job.id, "worker-c", lease_seconds=120
            )
            assert duplicate_claim is None

            async with await connection_factory() as connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        """
                        SELECT status, attempt_count
                        FROM pa_evaluation_jobs
                        WHERE id = %(job_id)s
                        """,
                        {"job_id": job.id},
                    )
                    persisted = await cursor.fetchone()
            assert persisted == {"status": "SUCCEEDED", "attempt_count": 1}
        finally:
            async with await connection_factory() as connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        "DELETE FROM pa_evaluation_jobs WHERE id = %(job_id)s",
                        {"job_id": job.id},
                    )
                    await cursor.execute(
                        "DELETE FROM pa_auto_evaluation_runs WHERE id = %(run_id)s",
                        {"run_id": run_id},
                    )
                    await cursor.execute(
                        "DELETE FROM pa_auto_evaluation_tasks WHERE id = %(task_id)s",
                        {"task_id": task_id},
                    )

    asyncio.run(scenario())
