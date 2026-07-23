import asyncio
from dataclasses import replace
from datetime import datetime, timezone
from typing import Any

import pytest

from app.evaluation_runtime.broker import BrokerMessage
from app.evaluation_runtime.executors import (
    BatchSplitExecutionError,
    ExecutionOutcome,
    NonRetryableExecutionError,
)
from app.evaluation_runtime.models import EvaluationJob, JobStatus, JobType
from app.evaluation_runtime.worker import (
    EvaluationWorker,
    HeartbeatGuard,
    LeaseLostError,
)


def _job(**overrides: Any) -> EvaluationJob:
    now = datetime(2026, 7, 23, tzinfo=timezone.utc)
    values: dict[str, Any] = {
        "create_by": "user-1",
        "update_by": "worker-1",
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
        "batch_end": 4,
        "idempotency_key": "idem",
        "status": JobStatus.RUNNING,
        "priority": 3,
        "attempt_count": 1,
        "max_attempts": 5,
        "next_attempt_at": now,
        "lease_owner": "worker-1",
        "lease_expires_at": now,
        "heartbeat_at": now,
        "payload": {
            "shardObjectKey": "manifests/project-1/run-1/batches/0-4-x.jsonl.gz",
            "shardHash": "a" * 64,
            "shardStart": 0,
            "shardEnd": 4,
            "contentHash": "content",
            "manifestHash": "manifest",
        },
        "result_summary": {},
        "raw_result_object_key": None,
        "error_code": None,
        "error_message": None,
    }
    values.update(overrides)
    return EvaluationJob(**values)


MESSAGE = BrokerMessage("1-0", "pa-eval:jobs:shared", "shared", "job-1")


class FakeBroker:
    def __init__(self, events: list[str], *, fail_ack_once: bool = False) -> None:
        self.events = events
        self.fail_ack_once = fail_ack_once
        self.ack_calls = 0

    async def ack(self, routing_key: str, message_id: str) -> int:
        self.events.append("ack")
        self.ack_calls += 1
        if self.fail_ack_once and self.ack_calls == 1:
            raise OSError("redis unavailable")
        return 1


class FakeRepository:
    def __init__(
        self,
        events: list[str],
        job: EvaluationJob | None = None,
        *,
        reject_transition: bool = False,
    ) -> None:
        self.events = events
        self.job = job or _job()
        self.state = JobStatus.ENQUEUED
        self.reject_transition = reject_transition
        self.completed: list[ExecutionOutcome] = []
        self.retries: list[dict[str, Any]] = []
        self.dead_letters: list[dict[str, Any]] = []

    async def claim_job(
        self, job_id: str, worker_id: str, *, lease_seconds: int
    ) -> EvaluationJob | None:
        self.events.append("claim")
        if self.state is not JobStatus.ENQUEUED:
            return None
        self.state = JobStatus.RUNNING
        return self.job

    async def heartbeat(
        self, job_id: str, worker_id: str, *, lease_seconds: int
    ) -> bool:
        return self.state is JobStatus.RUNNING

    async def complete_with_followups(
        self, job: EvaluationJob, outcome: ExecutionOutcome, worker_id: str
    ) -> EvaluationJob | None:
        self.events.extend(["persist-result", "create-next-job", "mark-succeeded"])
        if self.state is not JobStatus.RUNNING or self.reject_transition:
            return None
        self.completed.append(outcome)
        self.state = JobStatus.SUCCEEDED
        return replace(job, status=JobStatus.SUCCEEDED, lease_owner=None)

    async def schedule_retry(self, *args: Any, **kwargs: Any) -> EvaluationJob | None:
        self.events.append("schedule-retry")
        self.retries.append(kwargs)
        if self.state is not JobStatus.RUNNING or self.reject_transition:
            return None
        self.state = JobStatus.RETRY_WAIT
        return replace(self.job, status=JobStatus.RETRY_WAIT, lease_owner=None)

    async def mark_dead_letter(
        self, *args: Any, **kwargs: Any
    ) -> EvaluationJob | None:
        self.events.append("dead-letter")
        self.dead_letters.append(kwargs)
        if self.state is not JobStatus.RUNNING or self.reject_transition:
            return None
        self.state = JobStatus.DEAD_LETTER
        return replace(self.job, status=JobStatus.DEAD_LETTER, lease_owner=None)


class FakeExecutors:
    def __init__(self, events: list[str], result: Any) -> None:
        self.events = events
        self.result = result
        self.calls = 0

    async def execute(self, job: EvaluationJob, guard: HeartbeatGuard) -> Any:
        self.events.extend(["start-heartbeat", "execute"])
        self.calls += 1
        if isinstance(self.result, BaseException):
            raise self.result
        return self.result


class ProviderHTTPError(RuntimeError):
    def __init__(self, status_code: int) -> None:
        super().__init__("provider response includes secret")
        self.response = type("Response", (), {"status_code": status_code})()


class UnsafeProviderError(RuntimeError):
    error_code = "token-secret-value"


def _worker(
    repository: FakeRepository,
    broker: FakeBroker,
    executors: FakeExecutors,
) -> EvaluationWorker:
    return EvaluationWorker(
        repository=repository,
        broker=broker,
        executors=executors,
        worker_id="worker-1",
        lease_seconds=30,
        heartbeat_seconds=10,
    )


def test_worker_commits_result_and_followup_before_ack() -> None:
    events: list[str] = []
    outcome = ExecutionOutcome({"sampleCount": 4})
    repository = FakeRepository(events)
    broker = FakeBroker(events)
    executors = FakeExecutors(events, outcome)

    asyncio.run(_worker(repository, broker, executors).handle_message(MESSAGE))

    assert events == [
        "claim",
        "start-heartbeat",
        "execute",
        "persist-result",
        "create-next-job",
        "mark-succeeded",
        "ack",
    ]


def test_ack_failure_leaves_message_replay_safe_without_second_execution() -> None:
    events: list[str] = []
    repository = FakeRepository(events)
    broker = FakeBroker(events, fail_ack_once=True)
    executors = FakeExecutors(events, ExecutionOutcome({"sampleCount": 4}))
    worker = _worker(repository, broker, executors)

    with pytest.raises(OSError, match="redis unavailable"):
        asyncio.run(worker.handle_message(MESSAGE))
    asyncio.run(worker.handle_message(MESSAGE))

    assert executors.calls == 1
    assert broker.ack_calls == 2
    assert repository.state is JobStatus.SUCCEEDED


def test_terminal_duplicate_is_acked_without_execution() -> None:
    events: list[str] = []
    repository = FakeRepository(events)
    repository.state = JobStatus.SUCCEEDED
    broker = FakeBroker(events)
    executors = FakeExecutors(events, ExecutionOutcome({}))

    asyncio.run(_worker(repository, broker, executors).handle_message(MESSAGE))

    assert events == ["claim", "ack"]
    assert executors.calls == 0


def test_malformed_message_is_acked_without_claim() -> None:
    events: list[str] = []
    repository = FakeRepository(events)
    broker = FakeBroker(events)
    executors = FakeExecutors(events, ExecutionOutcome({}))
    malformed = BrokerMessage(
        "2-0", "pa-eval:jobs:shared", "shared", None, "MALFORMED_JOB_MESSAGE"
    )

    asyncio.run(_worker(repository, broker, executors).handle_message(malformed))

    assert events == ["ack"]


def test_deterministic_batch_error_splits_parent_into_stable_halves() -> None:
    events: list[str] = []
    repository = FakeRepository(events)
    broker = FakeBroker(events)
    executors = FakeExecutors(
        events,
        BatchSplitExecutionError("bad mapping with secret", error_code="BAD_MAPPING"),
    )

    asyncio.run(_worker(repository, broker, executors).handle_message(MESSAGE))

    outcome = repository.completed[0]
    assert outcome.result_summary == {"status": "split", "batchStart": 0, "batchEnd": 4}
    assert outcome.completed_count == 0
    assert [(item.batch_start, item.batch_end) for item in outcome.followups] == [
        (0, 2),
        (2, 4),
    ]
    assert all(item.job_type is JobType.EVALUATE_BATCH for item in outcome.followups)
    assert all(item.payload == repository.job.payload for item in outcome.followups)
    assert events[-1] == "ack"


def test_single_sample_mapping_error_dead_letters_and_counts_failure() -> None:
    events: list[str] = []
    job = _job(batch_start=8, batch_end=9)
    repository = FakeRepository(events, job)
    broker = FakeBroker(events)
    executors = FakeExecutors(
        events, BatchSplitExecutionError("bad sample", error_code="BAD_SAMPLE")
    )

    asyncio.run(_worker(repository, broker, executors).handle_message(MESSAGE))

    assert repository.dead_letters[0]["failed_count"] == 1
    assert repository.dead_letters[0]["error_message"] == "Evaluation batch failed"
    assert events[-1] == "ack"


@pytest.mark.parametrize("error", [TimeoutError("secret"), ConnectionError("token")])
def test_provider_failures_retry_without_split(error: Exception) -> None:
    events: list[str] = []
    repository = FakeRepository(events)
    broker = FakeBroker(events)
    executors = FakeExecutors(events, error)

    asyncio.run(_worker(repository, broker, executors).handle_message(MESSAGE))

    assert repository.completed == []
    assert len(repository.retries) == 1
    assert "secret" not in repository.retries[0]["error_message"]
    assert "token" not in repository.retries[0]["error_message"]
    assert events[-1] == "ack"


@pytest.mark.parametrize(
    ("status_code", "expected_code"),
    [(429, "PROVIDER_RATE_LIMIT"), (503, "PROVIDER_UNAVAILABLE")],
)
def test_provider_http_failures_retry_without_split(
    status_code: int,
    expected_code: str,
) -> None:
    events: list[str] = []
    repository = FakeRepository(events)
    broker = FakeBroker(events)
    executors = FakeExecutors(events, ProviderHTTPError(status_code))

    asyncio.run(_worker(repository, broker, executors).handle_message(MESSAGE))

    assert repository.completed == []
    assert repository.dead_letters == []
    assert repository.retries[0]["error_code"] == expected_code
    assert repository.retries[0]["error_message"] == (
        "Evaluation provider temporarily unavailable"
    )


def test_provider_error_code_is_sanitized_before_persistence() -> None:
    events: list[str] = []
    repository = FakeRepository(events)
    broker = FakeBroker(events)
    executors = FakeExecutors(events, UnsafeProviderError("secret prompt"))

    asyncio.run(_worker(repository, broker, executors).handle_message(MESSAGE))

    assert repository.retries[0]["error_code"] == "PROVIDER_UNAVAILABLE"
    assert "secret" not in repository.retries[0]["error_message"]


def test_non_retryable_config_error_dead_letters_without_split() -> None:
    events: list[str] = []
    repository = FakeRepository(events)
    broker = FakeBroker(events)
    executors = FakeExecutors(
        events,
        NonRetryableExecutionError("config has token", error_code="INVALID_CONFIG"),
    )

    asyncio.run(_worker(repository, broker, executors).handle_message(MESSAGE))

    assert repository.completed == []
    assert repository.retries == []
    assert repository.dead_letters[0]["error_code"] == "INVALID_CONFIG"
    assert repository.dead_letters[0]["error_message"] == "Evaluation job failed"


@pytest.mark.parametrize(
    "execution_result",
    [
        ExecutionOutcome({"sampleCount": 4}),
        TimeoutError("provider secret"),
        NonRetryableExecutionError("config secret", error_code="INVALID_CONFIG"),
    ],
)
def test_rejected_state_transition_never_acks(
    execution_result: object,
) -> None:
    events: list[str] = []
    repository = FakeRepository(events, reject_transition=True)
    broker = FakeBroker(events)
    executors = FakeExecutors(events, execution_result)

    with pytest.raises(LeaseLostError):
        asyncio.run(_worker(repository, broker, executors).handle_message(MESSAGE))

    assert broker.ack_calls == 0


class HeartbeatRepository:
    def __init__(self, responses: list[bool | Exception]) -> None:
        self.responses = responses
        self.calls = 0

    async def heartbeat(self, *args: Any, **kwargs: Any) -> bool:
        self.calls += 1
        response = self.responses.pop(0) if self.responses else True
        if isinstance(response, Exception):
            raise response
        return response


def test_heartbeat_false_marks_lease_lost_and_context_cleans_task() -> None:
    repository = HeartbeatRepository([False])

    async def scenario() -> None:
        guard = HeartbeatGuard(
            repository, "job-1", "worker-1", 0.001, lease_seconds=1
        )
        async with guard:
            await asyncio.sleep(0.01)
            with pytest.raises(LeaseLostError):
                await guard.checkpoint()
        calls_after_exit = repository.calls
        await asyncio.sleep(0.005)
        assert repository.calls == calls_after_exit

    asyncio.run(scenario())


def test_two_consecutive_heartbeat_network_errors_lose_lease_but_one_recovers() -> None:
    async def scenario() -> None:
        failing = HeartbeatRepository([OSError("one"), OSError("two")])
        async with HeartbeatGuard(
            failing, "job-1", "worker-1", 0.001, lease_seconds=1
        ) as guard:
            await asyncio.sleep(0.01)
            with pytest.raises(LeaseLostError):
                await guard.checkpoint()

        recovering = HeartbeatRepository([OSError("one"), True, True])
        async with HeartbeatGuard(
            recovering, "job-2", "worker-1", 0.001, lease_seconds=1
        ) as guard:
            await asyncio.sleep(0.006)
            await guard.checkpoint()

    asyncio.run(scenario())


def test_lease_lost_never_acks_or_transitions_business_state() -> None:
    events: list[str] = []
    repository = FakeRepository(events)
    broker = FakeBroker(events)
    executors = FakeExecutors(events, LeaseLostError("lost"))

    with pytest.raises(LeaseLostError):
        asyncio.run(_worker(repository, broker, executors).handle_message(MESSAGE))

    assert broker.ack_calls == 0
    assert repository.completed == []
    assert repository.retries == []
    assert repository.dead_letters == []
