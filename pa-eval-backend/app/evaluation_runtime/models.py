from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any, Mapping


class JobType(StrEnum):
    PREPARE_RUN = "PREPARE_RUN"
    EVALUATE_BATCH = "EVALUATE_BATCH"
    SYNC_SCORE_BATCH = "SYNC_SCORE_BATCH"
    GENERATE_REPORT = "GENERATE_REPORT"
    FLOWBACK_BATCH = "FLOWBACK_BATCH"


class JobStatus(StrEnum):
    PENDING = "PENDING"
    ENQUEUED = "ENQUEUED"
    RUNNING = "RUNNING"
    RETRY_WAIT = "RETRY_WAIT"
    CANCELLING = "CANCELLING"
    SUCCEEDED = "SUCCEEDED"
    DEAD_LETTER = "DEAD_LETTER"
    CANCELLED = "CANCELLED"


ALLOWED_TRANSITIONS: dict[JobStatus, frozenset[JobStatus]] = {
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


@dataclass(frozen=True, slots=True)
class EvaluationJob:
    create_by: str
    update_by: str
    create_date: datetime
    update_date: datetime
    id: str
    project_id: str
    task_id: str
    run_id: str
    parent_job_id: str | None
    job_type: JobType
    routing_key: str
    batch_start: int | None
    batch_end: int | None
    idempotency_key: str
    status: JobStatus
    priority: int
    attempt_count: int
    max_attempts: int
    next_attempt_at: datetime
    lease_owner: str | None
    lease_expires_at: datetime | None
    heartbeat_at: datetime | None
    payload: Mapping[str, Any]
    result_summary: Mapping[str, Any]
    raw_result_object_key: str | None
    error_code: str | None
    error_message: str | None

    def can_transition_to(self, target: JobStatus) -> bool:
        return target in ALLOWED_TRANSITIONS[self.status]


@dataclass(frozen=True, slots=True)
class RetryDecision:
    retry: bool
    delay_seconds: float | None = None
    reason: str | None = None

    def __post_init__(self) -> None:
        if not self.retry and self.delay_seconds is not None:
            raise ValueError("retry=False requires delay_seconds to be None")
        if self.delay_seconds is not None and self.delay_seconds < 0:
            raise ValueError("delay_seconds must be non-negative")
