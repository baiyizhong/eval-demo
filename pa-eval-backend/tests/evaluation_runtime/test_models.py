from dataclasses import FrozenInstanceError, fields
from datetime import UTC, datetime

import pytest

from app.evaluation_runtime.models import (
    ALLOWED_TRANSITIONS,
    EvaluationJob,
    JobStatus,
    JobType,
    RetryDecision,
)


def _job(*, status: JobStatus = JobStatus.PENDING) -> EvaluationJob:
    now = datetime.now(UTC)
    return EvaluationJob(
        create_by="tester",
        update_by="tester",
        create_date=now,
        update_date=now,
        id="job-1",
        project_id="project-1",
        task_id="task-1",
        run_id="run-1",
        parent_job_id=None,
        job_type=JobType.PREPARE_RUN,
        routing_key="shared",
        batch_start=None,
        batch_end=None,
        idempotency_key="prepare:run-1",
        status=status,
        priority=0,
        attempt_count=0,
        max_attempts=5,
        next_attempt_at=now,
        lease_owner=None,
        lease_expires_at=None,
        heartbeat_at=None,
        payload={"run_id": "run-1"},
        result_summary={},
        raw_result_object_key=None,
        error_code=None,
        error_message=None,
    )


def test_job_types_and_statuses_are_stable_string_enums() -> None:
    assert [item.value for item in JobType] == [
        "PREPARE_RUN",
        "EVALUATE_BATCH",
        "SYNC_SCORE_BATCH",
        "GENERATE_REPORT",
        "FLOWBACK_BATCH",
    ]
    assert [item.value for item in JobStatus] == [
        "PENDING",
        "ENQUEUED",
        "RUNNING",
        "RETRY_WAIT",
        "CANCELLING",
        "SUCCEEDED",
        "DEAD_LETTER",
        "CANCELLED",
    ]
    assert str(JobType.PREPARE_RUN) == "PREPARE_RUN"
    assert str(JobStatus.SUCCEEDED) == "SUCCEEDED"


def test_allowed_transitions_match_runtime_state_machine() -> None:
    assert ALLOWED_TRANSITIONS == {
        JobStatus.PENDING: frozenset({JobStatus.ENQUEUED, JobStatus.CANCELLED}),
        JobStatus.ENQUEUED: frozenset({JobStatus.RUNNING, JobStatus.CANCELLED}),
        JobStatus.RUNNING: frozenset(
            {
                JobStatus.SUCCEEDED,
                JobStatus.RETRY_WAIT,
                JobStatus.DEAD_LETTER,
                JobStatus.CANCELLING,
            }
        ),
        JobStatus.RETRY_WAIT: frozenset({JobStatus.ENQUEUED, JobStatus.CANCELLED}),
        JobStatus.CANCELLING: frozenset({JobStatus.CANCELLED}),
        JobStatus.SUCCEEDED: frozenset(),
        JobStatus.DEAD_LETTER: frozenset({JobStatus.PENDING, JobStatus.CANCELLED}),
        JobStatus.CANCELLED: frozenset(),
    }


def test_evaluation_job_covers_table_columns_and_checks_transitions() -> None:
    expected_fields = {
        "create_by",
        "update_by",
        "create_date",
        "update_date",
        "id",
        "project_id",
        "task_id",
        "run_id",
        "parent_job_id",
        "job_type",
        "routing_key",
        "batch_start",
        "batch_end",
        "idempotency_key",
        "status",
        "priority",
        "attempt_count",
        "max_attempts",
        "next_attempt_at",
        "lease_owner",
        "lease_expires_at",
        "heartbeat_at",
        "payload",
        "result_summary",
        "raw_result_object_key",
        "error_code",
        "error_message",
    }
    job = _job()

    assert {field.name for field in fields(job)} == expected_fields
    assert job.can_transition_to(JobStatus.ENQUEUED)
    assert not job.can_transition_to(JobStatus.SUCCEEDED)
    with pytest.raises(FrozenInstanceError):
        job.status = JobStatus.RUNNING  # type: ignore[misc]


def test_retry_decision_rejects_inconsistent_delay() -> None:
    assert RetryDecision(retry=True, delay_seconds=2.5).delay_seconds == 2.5
    assert RetryDecision(retry=True).delay_seconds is None
    assert RetryDecision(retry=False).delay_seconds is None

    with pytest.raises(ValueError, match="retry=False"):
        RetryDecision(retry=False, delay_seconds=0)
    with pytest.raises(ValueError, match="non-negative"):
        RetryDecision(retry=True, delay_seconds=-0.1)
