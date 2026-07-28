from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.consolidation.models import JobExecutionStatus, JobExecutionType
from app.consolidation.repository import ConsolidationRepository


class FakeCursor:
    def __init__(self, rows: list[dict[str, Any] | None] | None = None) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.rows = list(rows or [])

    async def execute(self, sql: str, params: dict[str, Any]) -> None:
        self.calls.append((sql, params))

    async def fetchone(self) -> dict[str, Any] | None:
        return self.rows.pop(0) if self.rows else None


@pytest.mark.anyio
async def test_upserts_resource_extension_with_project_scoped_unique_key() -> None:
    cursor = FakeCursor([{"id": "paext-1", "payload": {"model": "gpt-4.1"}}])
    repository = ConsolidationRepository(cursor)  # type: ignore[arg-type]

    row = await repository.upsert_resource_extension(
        extension_id="paext-1",
        project_id="project-1",
        resource_type="PROJECT",
        resource_id="project-1",
        extension_type="DEFAULT_EVALUATION_MODEL",
        schema_version=1,
        payload={
            "llmConnectionId": "connection-1",
            "model": "gpt-4.1",
            "temperature": "0.2",
        },
        actor="admin@example.com",
    )

    sql, params = cursor.calls[0]
    assert "ON CONFLICT (project_id, resource_type, resource_id, extension_type)" in sql
    assert "payload -> 'legacyId'" in sql
    assert "jsonb_build_object(" in sql
    assert "'legacyId', pa_resource_extensions.payload" in sql
    assert params["project_id"] == "project-1"
    assert params["payload"].obj["model"] == "gpt-4.1"
    assert row["id"] == "paext-1"


@pytest.mark.anyio
async def test_creates_idempotent_execution_without_opening_a_transaction() -> None:
    cursor = FakeCursor([{"id": "execution-1", "status": "PENDING"}])
    repository = ConsolidationRepository(cursor)  # type: ignore[arg-type]

    row = await repository.create_execution(
        execution_id="execution-1",
        project_id="project-1",
        job_type=JobExecutionType.DATASET_EXPORT,
        definition_id=None,
        idempotency_key="dataset-1:export-1",
        request_payload={"datasetId": "dataset-1", "format": "csv"},
        legacy_source_type="DATASET_EXPORT_JOB",
        legacy_source_id="export-1",
        actor="admin@example.com",
    )

    sql, params = cursor.calls[0]
    assert "INSERT INTO pa_job_executions" in sql
    assert "ON CONFLICT" in sql
    assert params["job_type"] == "DATASET_EXPORT"
    assert row["status"] == "PENDING"


@pytest.mark.anyio
async def test_job_upsert_preserves_legacy_only_rollback_snapshot() -> None:
    cursor = FakeCursor([{"id": "job-1"}])
    repository = ConsolidationRepository(cursor)  # type: ignore[arg-type]

    await repository.upsert_evaluation_job(
        job_id="job-1",
        project_id="project-1",
        name="job",
        description="",
        trigger_type="MANUAL",
        status="ACTIVE",
        configuration={},
        legacy_source_type="AUTO_EVALUATION_TASK",
        legacy_source_id="legacy-1",
        actor="owner",
    )

    sql = cursor.calls[0][0]
    normalized_sql = " ".join(sql.split())
    assert "schedule_config -> 'paLegacy'" in normalized_sql
    assert "jsonb_build_object( 'paLegacy'," in normalized_sql


@pytest.mark.anyio
async def test_claim_execution_uses_skip_locked_and_a_bounded_lease() -> None:
    cursor = FakeCursor([{"id": "execution-1", "status": "RUNNING"}])
    repository = ConsolidationRepository(cursor)  # type: ignore[arg-type]
    now = datetime(2026, 7, 23, tzinfo=UTC)

    row = await repository.claim_execution(
        job_types=[JobExecutionType.TRACE_DATASET_IMPORT],
        lock_owner="worker-1",
        lease_until=now + timedelta(seconds=120),
        now=now,
    )

    sql, params = cursor.calls[0]
    assert "FOR UPDATE SKIP LOCKED" in sql
    assert "lock_until IS NULL OR lock_until <= %(now)s" in sql
    assert params["lock_owner"] == "worker-1"
    assert row and row["id"] == "execution-1"


@pytest.mark.anyio
async def test_update_execution_requires_current_lock_owner() -> None:
    cursor = FakeCursor([{"id": "execution-1", "status": "SUCCEEDED"}])
    repository = ConsolidationRepository(cursor)  # type: ignore[arg-type]

    await repository.update_execution(
        execution_id="execution-1",
        project_id="project-1",
        status=JobExecutionStatus.SUCCEEDED,
        lock_owner="worker-1",
        completed_count=2,
        success_count=2,
        failure_count=0,
        result_payload={"exportedCount": 2},
        actor="worker-1",
    )

    sql, params = cursor.calls[0]
    assert "lock_owner = %(lock_owner)s" in sql
    assert params["project_id"] == "project-1"
    assert params["progress_percent"] == 100


@pytest.mark.anyio
async def test_sync_execution_from_legacy_does_not_require_worker_lease() -> None:
    cursor = FakeCursor([{"id": "execution-1", "status": "FAILED"}])
    repository = ConsolidationRepository(cursor)  # type: ignore[arg-type]

    await repository.sync_execution_from_legacy(
        execution_id="execution-1",
        project_id="project-1",
        status=JobExecutionStatus.FAILED,
        total_count=3,
        completed_count=3,
        success_count=2,
        failure_count=1,
        result_payload={"failedCount": 1},
        error_message="一个样本执行失败",
        actor="admin@example.com",
    )

    sql, params = cursor.calls[0]
    assert "lock_owner = %(lock_owner)s" not in sql
    assert "WHERE id = %(id)s AND project_id = %(project_id)s" in sql
    assert "result_payload = pa_job_executions.result_payload || %(result_payload)s" in sql
    assert params["progress_percent"] == 100


@pytest.mark.anyio
async def test_sync_execution_from_legacy_casts_nullable_lock_until() -> None:
    cursor = FakeCursor([{"id": "execution-1", "status": "RUNNING"}])
    repository = ConsolidationRepository(cursor)  # type: ignore[arg-type]
    lease_until = datetime(2026, 7, 23, 12, 2, tzinfo=UTC)

    await repository.sync_execution_from_legacy(
        execution_id="execution-1",
        project_id="project-1",
        status=JobExecutionStatus.RUNNING,
        total_count=3,
        completed_count=1,
        success_count=1,
        failure_count=0,
        result_payload={"completedCount": 1},
        actor="worker-1",
        lock_owner="worker-1",
        lock_until=lease_until,
    )

    sql, params = cursor.calls[0]
    assert "ELSE %(lock_until)s::timestamptz" in sql
    assert params["lock_until"] == lease_until


@pytest.mark.anyio
async def test_sync_execution_lease_from_legacy_mirrors_the_legacy_claim() -> None:
    cursor = FakeCursor([{"id": "execution-1", "status": "RUNNING"}])
    repository = ConsolidationRepository(cursor)  # type: ignore[arg-type]
    lease_until = datetime(2026, 7, 23, 12, 2, tzinfo=UTC)

    row = await repository.sync_execution_lease_from_legacy(
        execution_id="execution-1",
        project_id="project-1",
        lock_owner="worker-1",
        lease_until=lease_until,
        actor="worker-1",
        increment_attempt=True,
    )

    sql, params = cursor.calls[0]
    assert "status = 'RUNNING'" in sql
    assert "attempt_count = attempt_count + %(attempt_increment)s" in sql
    assert "WHERE id = %(id)s AND project_id = %(project_id)s" in sql
    assert params["lease_until"] == lease_until
    assert params["attempt_increment"] == 1
    assert row["status"] == "RUNNING"


@pytest.mark.anyio
async def test_sync_export_artifact_from_legacy_updates_scoped_artifact() -> None:
    cursor = FakeCursor([{"id": "execution-1", "artifact_name": "items.csv"}])
    repository = ConsolidationRepository(cursor)  # type: ignore[arg-type]

    row = await repository.sync_export_artifact_from_legacy(
        execution_id="execution-1",
        project_id="project-1",
        artifact_uri="exports/project-1/items.csv",
        artifact_name="items.csv",
        artifact_content_type="text/csv",
        artifact_size=128,
        actor="worker-1",
    )

    sql, params = cursor.calls[0]
    assert "artifact_uri = %(artifact_uri)s" in sql
    assert "WHERE id = %(id)s AND project_id = %(project_id)s" in sql
    assert params["artifact_size"] == 128
    assert row["artifact_name"] == "items.csv"


@pytest.mark.anyio
async def test_sync_evaluation_job_state_updates_only_project_scoped_definition() -> None:
    cursor = FakeCursor([{"id": "job-1", "status": "COMPLETED"}])
    repository = ConsolidationRepository(cursor)  # type: ignore[arg-type]

    await repository.sync_evaluation_job_state(
        job_id="job-1",
        project_id="project-1",
        status="COMPLETED",
        latest_execution_id="execution-1",
        latest_report_id="report-1",
        actor="admin@example.com",
    )

    sql, params = cursor.calls[0]
    assert "WHERE id = %(id)s AND project_id = %(project_id)s" in sql
    assert params["latest_report_id"] == "report-1"


@pytest.mark.anyio
async def test_archive_evaluation_job_disables_scheduler_without_deleting_history() -> None:
    cursor = FakeCursor([{"id": "job-1", "status": "DELETED"}])
    repository = ConsolidationRepository(cursor)  # type: ignore[arg-type]

    await repository.archive_evaluation_job(
        job_id="job-1",
        project_id="project-1",
        actor="admin@example.com",
    )

    sql, params = cursor.calls[0]
    assert "status = 'DELETED'" in sql
    assert "scheduler_enabled = FALSE" in sql
    assert "DELETE FROM" not in sql
    assert params["project_id"] == "project-1"
