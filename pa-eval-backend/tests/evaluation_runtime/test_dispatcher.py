import asyncio
from collections.abc import Iterable
from datetime import datetime, timezone
from typing import Any

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.evaluation_runtime.dispatcher import JobDispatcher, LeaseReaper
from app.evaluation_runtime.models import EvaluationJob, JobStatus, JobType


def _job(**overrides: Any) -> EvaluationJob:
    now = datetime(2026, 7, 23, tzinfo=timezone.utc)
    values: dict[str, Any] = {
        "create_by": "user-1",
        "update_by": "user-1",
        "create_date": now,
        "update_date": now,
        "id": "job-1",
        "project_id": "project-1",
        "task_id": "task-1",
        "run_id": "run-1",
        "parent_job_id": None,
        "job_type": JobType.EVALUATE_BATCH,
        "routing_key": "shared",
        "batch_start": 0,
        "batch_end": 10,
        "idempotency_key": "idempotency-key",
        "status": JobStatus.PENDING,
        "priority": 0,
        "attempt_count": 0,
        "max_attempts": 5,
        "next_attempt_at": now,
        "lease_owner": None,
        "lease_expires_at": None,
        "heartbeat_at": None,
        "payload": {},
        "result_summary": {},
        "raw_result_object_key": None,
        "error_code": None,
        "error_message": None,
    }
    values.update(overrides)
    return EvaluationJob(**values)


class FakeBroker:
    def __init__(self, failures: int = 0) -> None:
        self.failures = failures
        self.published: list[tuple[str, str]] = []

    async def publish(self, routing_key: str, job_id: str) -> str:
        if self.failures:
            self.failures -= 1
            raise RuntimeError("redis unavailable")
        self.published.append((routing_key, job_id))
        return f"{len(self.published)}-0"


class SequencedRepository:
    def __init__(
        self,
        batches: Iterable[list[EvaluationJob]],
        *,
        marked: EvaluationJob | None = None,
        mark_error: Exception | None = None,
    ) -> None:
        self.batches = list(batches)
        self.marked = marked
        self.mark_error = mark_error
        self.mark_calls: list[str] = []
        self.list_limits: list[int] = []

    async def list_dispatchable(self, *, limit: int) -> list[EvaluationJob]:
        self.list_limits.append(limit)
        return self.batches.pop(0) if self.batches else []

    async def mark_enqueued_for_dispatch(
        self, job_id: str
    ) -> EvaluationJob | None:
        self.mark_calls.append(job_id)
        if self.mark_error is not None:
            raise self.mark_error
        return self.marked


def test_runtime_settings_validate_heartbeat_and_lease_relationship() -> None:
    settings = Settings(
        _env_file=None,
        pa_eval_job_heartbeat_seconds=30,
        pa_eval_job_lease_seconds=120,
    )

    assert settings.pa_eval_redis_url == "redis://localhost:6379/0"
    assert settings.pa_eval_runtime_stream_prefix == "pa-eval:jobs"
    assert settings.pa_eval_runtime_consumer_group == "pa-eval-workers"
    assert settings.pa_eval_runtime_mode == "legacy"
    assert settings.pa_eval_job_batch_size == 100
    assert settings.pa_eval_dispatch_visibility_seconds == 30

    with pytest.raises(ValidationError, match="heartbeat.*2.*lease"):
        Settings(
            _env_file=None,
            pa_eval_job_heartbeat_seconds=60,
            pa_eval_job_lease_seconds=120,
        )


def test_dispatcher_does_not_publish_when_crash_happens_before_mark() -> None:
    pending = _job(status=JobStatus.PENDING)
    repository = SequencedRepository(
        [[pending]], mark_error=RuntimeError("database unavailable")
    )
    broker = FakeBroker()
    dispatcher = JobDispatcher(repository, broker, batch_size=10)

    with pytest.raises(RuntimeError, match="database unavailable"):
        asyncio.run(dispatcher.dispatch_once())

    assert pending.status is JobStatus.PENDING
    assert broker.published == []


def test_dispatcher_republishes_stale_enqueued_after_publish_failure() -> None:
    pending = _job(status=JobStatus.PENDING)
    enqueued = _job(status=JobStatus.ENQUEUED)
    repository = SequencedRepository(
        [[pending], [enqueued]],
        marked=enqueued,
    )
    broker = FakeBroker(failures=1)
    dispatcher = JobDispatcher(repository, broker, batch_size=10)

    with pytest.raises(RuntimeError, match="redis unavailable"):
        asyncio.run(dispatcher.dispatch_once())

    assert repository.mark_calls == ["job-1"]
    assert enqueued.status is JobStatus.ENQUEUED
    assert asyncio.run(dispatcher.dispatch_once()) == 1
    assert repository.mark_calls == ["job-1"]
    assert broker.published == [("shared", "job-1")]


def test_dispatcher_does_not_publish_before_visibility_window() -> None:
    repository = SequencedRepository([[]])
    broker = FakeBroker()
    dispatcher = JobDispatcher(repository, broker, batch_size=17)

    assert asyncio.run(dispatcher.dispatch_once()) == 0
    assert repository.list_limits == [17]
    assert broker.published == []


def test_concurrent_dispatchers_only_publish_one_new_job() -> None:
    class RacingRepository:
        def __init__(self) -> None:
            self.status = JobStatus.PENDING
            self.lock = asyncio.Lock()

        async def list_dispatchable(self, *, limit: int) -> list[EvaluationJob]:
            return [_job(status=JobStatus.PENDING)]

        async def mark_enqueued_for_dispatch(
            self, job_id: str
        ) -> EvaluationJob | None:
            async with self.lock:
                if self.status is not JobStatus.PENDING:
                    return None
                self.status = JobStatus.ENQUEUED
                return _job(status=JobStatus.ENQUEUED)

    async def scenario() -> tuple[list[int], FakeBroker]:
        repository = RacingRepository()
        broker = FakeBroker()
        first = JobDispatcher(repository, broker, batch_size=10)
        second = JobDispatcher(repository, broker, batch_size=10)
        counts = await asyncio.gather(first.dispatch_once(), second.dispatch_once())
        return counts, broker

    counts, broker = asyncio.run(scenario())

    assert sum(counts) == 1
    assert broker.published == [("shared", "job-1")]


def test_reaper_returns_number_of_expired_jobs_processed() -> None:
    class FakeRepository:
        def __init__(self) -> None:
            self.calls: list[tuple[int, str]] = []

        async def requeue_expired_leases(
            self, *, limit: int, actor: str
        ) -> list[EvaluationJob]:
            self.calls.append((limit, actor))
            return [
                _job(id="job-retry", status=JobStatus.RETRY_WAIT),
                _job(id="job-dead", status=JobStatus.DEAD_LETTER),
            ]

    repository = FakeRepository()
    reaper = LeaseReaper(repository, batch_size=33, actor="runtime-reaper")

    assert asyncio.run(reaper.reap_once()) == 2
    assert repository.calls == [(33, "runtime-reaper")]
