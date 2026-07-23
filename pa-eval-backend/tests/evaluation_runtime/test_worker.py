import asyncio
from contextlib import suppress
from dataclasses import replace
from datetime import datetime, timezone
from typing import Any

import httpx
import pytest

import app.evaluation_runtime.worker as worker_module
from app.config import Settings
from app.evaluation_runtime.broker import BrokerMessage
from app.evaluation_runtime.executors import (
    BatchSplitExecutionError,
    ExecutionOutcome,
    NonRetryableExecutionError,
    ProjectApiCredentials,
    SyncScoreBatchExecutor,
)
from app.evaluation_runtime.models import EvaluationJob, JobStatus, JobType
from app.evaluation_runtime.worker import (
    EvaluationWorker,
    HeartbeatGuard,
    LeaseLostError,
)
from app.langfuse_client import LangfuseProjectApiClient


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


class RunnerBroker(FakeBroker):
    def __init__(
        self,
        events: list[str],
        *,
        stale_pages: list[tuple[str, list[BrokerMessage]]],
        new_pages: list[list[BrokerMessage]],
    ) -> None:
        super().__init__(events)
        self.stale_pages = list(stale_pages)
        self.new_pages = list(new_pages)
        self.claim_cursors: list[str] = []
        self.read_calls = 0

    async def claim_stale(
        self,
        routing_key: str,
        consumer_name: str,
        *,
        min_idle_ms: int,
        count: int,
        cursor: str,
    ) -> tuple[str, list[BrokerMessage]]:
        self.claim_cursors.append(cursor)
        return self.stale_pages.pop(0)

    async def read(
        self,
        routing_key: str,
        consumer_name: str,
        *,
        count: int,
        block_ms: int,
    ) -> list[BrokerMessage]:
        self.read_calls += 1
        return self.new_pages.pop(0)


class StoppingRunnerBroker(RunnerBroker):
    def __init__(self, *args: Any, stop_event: asyncio.Event, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.stop_event = stop_event

    async def read(self, *args: Any, **kwargs: Any) -> list[BrokerMessage]:
        messages = await super().read(*args, **kwargs)
        self.stop_event.set()
        return messages


class BlockingReadRunnerBroker(RunnerBroker):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.read_started = asyncio.Event()
        self.read_cancelled = asyncio.Event()
        self.stale_acked = asyncio.Event()
        self.second_stale_acked = asyncio.Event()
        self.active_reads = 0

    async def read(self, *args: Any, **kwargs: Any) -> list[BrokerMessage]:
        self.read_calls += 1
        self.active_reads += 1
        self.read_started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            self.read_cancelled.set()
            raise
        finally:
            self.active_reads -= 1

    async def ack(self, routing_key: str, message_id: str) -> int:
        result = await super().ack(routing_key, message_id)
        self.stale_acked.set()
        if self.ack_calls >= 2:
            self.second_stale_acked.set()
        return result


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
        self.cancel_attempts = 0
        self.report_count = 0
        self.lease_owner: str | None = None
        self.heartbeat_rejected = asyncio.Event()

    async def claim_job(
        self, job_id: str, worker_id: str, *, lease_seconds: int
    ) -> EvaluationJob | None:
        self.events.append("claim")
        if self.state is not JobStatus.ENQUEUED:
            return None
        self.state = JobStatus.RUNNING
        self.lease_owner = worker_id
        return self.job

    async def heartbeat(
        self, job_id: str, worker_id: str, *, lease_seconds: int
    ) -> bool:
        renewed = (
            self.state is JobStatus.RUNNING and self.lease_owner == worker_id
        )
        if not renewed:
            self.heartbeat_rejected.set()
        return renewed

    async def request_run_cancel(self) -> None:
        self.events.append("request-cancel")
        if self.state is JobStatus.RUNNING:
            self.state = JobStatus.CANCELLING

    async def mark_cancelled(
        self,
        job_id: str,
        worker_id: str,
    ) -> EvaluationJob | None:
        self.events.append("mark-cancelled")
        self.cancel_attempts += 1
        if (
            self.state is not JobStatus.CANCELLING
            or self.lease_owner != worker_id
            or self.reject_transition
        ):
            return None
        self.state = JobStatus.CANCELLED
        self.lease_owner = None
        self.report_count += 1
        return replace(self.job, status=JobStatus.CANCELLED, lease_owner=None)

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


class ConcurrentClaimRepository(FakeRepository):
    def __init__(self, events: list[str]) -> None:
        super().__init__(events)
        self._claim_lock = asyncio.Lock()
        self._both_started = asyncio.Event()
        self._claim_waiters = 0

    async def claim_job(
        self, job_id: str, worker_id: str, *, lease_seconds: int
    ) -> EvaluationJob | None:
        self.events.append("claim")
        self._claim_waiters += 1
        if self._claim_waiters == 2:
            self._both_started.set()
        await self._both_started.wait()
        async with self._claim_lock:
            if self.state is not JobStatus.ENQUEUED:
                return None
            self.state = JobStatus.RUNNING
            return replace(self.job, lease_owner=worker_id)


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
    *,
    worker_id: str = "worker-1",
    heartbeat_seconds: float = 10,
) -> EvaluationWorker:
    return EvaluationWorker(
        repository=repository,
        broker=broker,
        executors=executors,
        worker_id=worker_id,
        lease_seconds=30,
        heartbeat_seconds=heartbeat_seconds,
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


def test_runner_pages_stale_cursor_and_acks_terminal_replays_without_model() -> None:
    events: list[str] = []
    stale_one = BrokerMessage("old-1", MESSAGE.stream, "shared", "job-1")
    stale_two = BrokerMessage("old-2", MESSAGE.stream, "shared", "job-1")
    new_duplicate = BrokerMessage("new-1", MESSAGE.stream, "shared", "job-1")
    broker = RunnerBroker(
        events,
        stale_pages=[("7-0", [stale_one]), ("0-0", [stale_two])],
        new_pages=[[new_duplicate], []],
    )
    repository = FakeRepository(events)
    repository.state = JobStatus.SUCCEEDED
    executors = FakeExecutors(events, ExecutionOutcome({}))
    worker = _worker(repository, broker, executors)
    runner = worker_module.EvaluationWorkerRunner(
        worker=worker,
        broker=broker,
        routing_key="shared",
        consumer_name="worker-1",
        count=10,
        block_ms=1,
        stale_idle_ms=60_000,
        stale_poll_interval_seconds=0.01,
    )

    async def scenario() -> tuple[int, int]:
        return await runner.run_once(), await runner.run_once()

    processed = asyncio.run(scenario())

    assert processed == (2, 1)
    assert broker.claim_cursors == ["0-0", "7-0"]
    assert broker.read_calls == 2
    assert broker.ack_calls == 3
    assert executors.calls == 0


def test_runner_loop_stops_after_signaled_iteration() -> None:
    async def scenario() -> tuple[int, int]:
        events: list[str] = []
        stop_event = asyncio.Event()
        broker = StoppingRunnerBroker(
            events,
            stop_event=stop_event,
            stale_pages=[("0-0", [])],
            new_pages=[[BrokerMessage("new-1", MESSAGE.stream, "shared", None)]],
        )
        repository = FakeRepository(events)
        executors = FakeExecutors(events, ExecutionOutcome({}))
        runner = worker_module.EvaluationWorkerRunner(
            worker=_worker(repository, broker, executors),
            broker=broker,
            routing_key="shared",
            consumer_name="worker-1",
            count=10,
            block_ms=1,
            stale_idle_ms=60_000,
            stale_poll_interval_seconds=0.01,
        )

        await runner.run(stop_event)
        return broker.read_calls, broker.ack_calls

    assert asyncio.run(scenario()) == (1, 1)


def test_runner_handles_stale_while_new_read_blocks_and_stops_cleanly() -> None:
    async def scenario() -> tuple[int, bool, int]:
        events: list[str] = []
        stop_event = asyncio.Event()
        stale = BrokerMessage("old-1", MESSAGE.stream, "shared", "job-1")
        broker = BlockingReadRunnerBroker(
            events,
            stale_pages=[("0-0", [stale])],
            new_pages=[],
        )
        repository = FakeRepository(events)
        repository.state = JobStatus.SUCCEEDED
        executors = FakeExecutors(events, ExecutionOutcome({}))
        runner = worker_module.EvaluationWorkerRunner(
            worker=_worker(repository, broker, executors),
            broker=broker,
            routing_key="shared",
            consumer_name="worker-1",
            count=10,
            block_ms=0,
            stale_idle_ms=60_000,
            stale_poll_interval_seconds=0.01,
        )
        runner_task = asyncio.create_task(runner.run(stop_event))
        try:
            await asyncio.wait_for(broker.read_started.wait(), timeout=0.2)
            await asyncio.wait_for(broker.stale_acked.wait(), timeout=0.2)
            stop_event.set()
            await asyncio.wait_for(runner_task, timeout=0.2)
        finally:
            if not runner_task.done():
                runner_task.cancel()
            with suppress(asyncio.CancelledError):
                await runner_task
        return broker.ack_calls, broker.read_cancelled.is_set(), broker.active_reads

    assert asyncio.run(scenario()) == (1, True, 0)


def test_runner_pages_stale_cursor_while_new_read_remains_blocked() -> None:
    async def scenario() -> tuple[list[str], int, bool]:
        events: list[str] = []
        stop_event = asyncio.Event()
        broker = BlockingReadRunnerBroker(
            events,
            stale_pages=[
                (
                    "7-0",
                    [BrokerMessage("old-1", MESSAGE.stream, "shared", "job-1")],
                ),
                (
                    "0-0",
                    [BrokerMessage("old-2", MESSAGE.stream, "shared", "job-1")],
                ),
            ],
            new_pages=[],
        )
        repository = FakeRepository(events)
        repository.state = JobStatus.SUCCEEDED
        runner = worker_module.EvaluationWorkerRunner(
            worker=_worker(
                repository,
                broker,
                FakeExecutors(events, ExecutionOutcome({})),
            ),
            broker=broker,
            routing_key="shared",
            consumer_name="worker-1",
            count=1,
            block_ms=0,
            stale_idle_ms=60_000,
            stale_poll_interval_seconds=0.01,
        )
        runner_task = asyncio.create_task(runner.run(stop_event))
        try:
            await asyncio.wait_for(broker.second_stale_acked.wait(), timeout=0.2)
            stop_event.set()
            await asyncio.wait_for(runner_task, timeout=0.2)
        finally:
            if not runner_task.done():
                runner_task.cancel()
            with suppress(asyncio.CancelledError):
                await runner_task
        return broker.claim_cursors, broker.ack_calls, broker.read_cancelled.is_set()

    assert asyncio.run(scenario()) == (["0-0", "7-0"], 2, True)


def test_runner_rechecks_stale_after_completed_scan() -> None:
    async def scenario() -> tuple[list[str], int]:
        events: list[str] = []
        stop_event = asyncio.Event()
        broker = BlockingReadRunnerBroker(
            events,
            stale_pages=[
                (
                    "0-0",
                    [BrokerMessage("old-1", MESSAGE.stream, "shared", "job-1")],
                ),
                (
                    "0-0",
                    [BrokerMessage("old-2", MESSAGE.stream, "shared", "job-1")],
                ),
            ],
            new_pages=[],
        )
        repository = FakeRepository(events)
        repository.state = JobStatus.SUCCEEDED
        runner = worker_module.EvaluationWorkerRunner(
            worker=_worker(
                repository,
                broker,
                FakeExecutors(events, ExecutionOutcome({})),
            ),
            broker=broker,
            routing_key="shared",
            consumer_name="worker-1",
            count=1,
            block_ms=0,
            stale_idle_ms=60_000,
            stale_poll_interval_seconds=0.01,
        )
        runner_task = asyncio.create_task(runner.run(stop_event))
        try:
            await asyncio.wait_for(broker.second_stale_acked.wait(), timeout=0.2)
            stop_event.set()
            await asyncio.wait_for(runner_task, timeout=0.2)
        finally:
            if not runner_task.done():
                runner_task.cancel()
            with suppress(asyncio.CancelledError):
                await runner_task
        return broker.claim_cursors, broker.ack_calls

    assert asyncio.run(scenario()) == (["0-0", "0-0"], 2)


def test_runner_cancellation_cleans_blocking_new_read() -> None:
    async def scenario() -> tuple[bool, int]:
        events: list[str] = []
        broker = BlockingReadRunnerBroker(
            events,
            stale_pages=[("0-0", [])],
            new_pages=[],
        )
        runner = worker_module.EvaluationWorkerRunner(
            worker=_worker(
                FakeRepository(events),
                broker,
                FakeExecutors(events, ExecutionOutcome({})),
            ),
            broker=broker,
            routing_key="shared",
            consumer_name="worker-1",
            count=10,
            block_ms=0,
            stale_idle_ms=60_000,
            stale_poll_interval_seconds=0.01,
        )
        runner_task = asyncio.create_task(runner.run(asyncio.Event()))
        await asyncio.wait_for(broker.read_started.wait(), timeout=0.2)
        runner_task.cancel()
        with suppress(asyncio.CancelledError):
            await runner_task
        return broker.read_cancelled.is_set(), broker.active_reads

    assert asyncio.run(scenario()) == (True, 0)


def test_concurrent_workers_claim_once_and_execute_model_once() -> None:
    events: list[str] = []
    repository = ConcurrentClaimRepository(events)
    broker = FakeBroker(events)
    executors = FakeExecutors(events, ExecutionOutcome({"sampleCount": 4}))
    first = _worker(repository, broker, executors, worker_id="worker-a")
    second = _worker(repository, broker, executors, worker_id="worker-b")

    async def scenario() -> None:
        await asyncio.gather(
            first.handle_message(MESSAGE),
            second.handle_message(MESSAGE),
        )

    asyncio.run(scenario())

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


@pytest.mark.parametrize(
    ("error", "expected_code"),
    [
        (TimeoutError("secret"), "PROVIDER_TIMEOUT"),
        (ConnectionError("token"), "PROVIDER_UNAVAILABLE"),
        (
            httpx.ConnectError("connection contains credential"),
            "PROVIDER_UNAVAILABLE",
        ),
        (httpx.ReadTimeout("timeout contains credential"), "PROVIDER_TIMEOUT"),
    ],
)
def test_provider_failures_retry_without_split(
    error: Exception,
    expected_code: str,
) -> None:
    events: list[str] = []
    repository = FakeRepository(events)
    broker = FakeBroker(events)
    executors = FakeExecutors(events, error)

    asyncio.run(_worker(repository, broker, executors).handle_message(MESSAGE))

    assert repository.completed == []
    assert len(repository.retries) == 1
    assert repository.retries[0]["error_code"] == expected_code
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


class ScoreResultStorage:
    async def read_result(
        self,
        key: str,
        *,
        project_id: str,
        run_id: str,
        producer_job_id: str,
    ) -> dict[str, Any]:
        return {
            "results": [
                {
                    "sampleId": "sample-1",
                    "status": "SUCCEEDED",
                    "scores": [{"name": "quality", "value": 1}],
                }
            ]
        }


class ScoreCredentialProvider:
    async def get_project_credentials(
        self,
        project_id: str,
    ) -> ProjectApiCredentials:
        return ProjectApiCredentials("pk-project-1", "sk-project-1")


def _sync_score_job() -> EvaluationJob:
    return _job(
        job_type=JobType.SYNC_SCORE_BATCH,
        batch_end=1,
        parent_job_id="evaluate-job-1",
        payload={
            "rawResultObjectKey": "results/key.json.gz",
            "resultProducerJobId": "evaluate-job-1",
        },
    )


@pytest.mark.parametrize(
    ("failure", "expected_code"),
    [
        ("timeout", "PROVIDER_TIMEOUT"),
        ("connect", "PROVIDER_UNAVAILABLE"),
        ("server", "PROVIDER_UNAVAILABLE"),
        ("confirm_rate_limit", "PROVIDER_RATE_LIMIT"),
    ],
)
def test_real_score_client_transient_failures_flow_through_executor_to_worker_retry(
    monkeypatch: pytest.MonkeyPatch,
    failure: str,
    expected_code: str,
) -> None:
    request_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal request_count
        request_count += 1
        if failure == "timeout":
            raise httpx.ReadTimeout(
                "timeout contains credential",
                request=request,
            )
        if failure == "connect":
            raise httpx.ConnectError(
                "connect contains credential",
                request=request,
            )
        if failure == "server":
            return httpx.Response(
                503,
                json={"message": "response contains credential"},
            )
        if request_count == 1:
            return httpx.Response(409, json={"message": "conflict"})
        return httpx.Response(
            429,
            headers={"Retry-After": "0"},
            json={"message": "response contains credential"},
        )

    real_async_client = httpx.AsyncClient

    def client_factory(**kwargs: Any) -> httpx.AsyncClient:
        return real_async_client(
            transport=httpx.MockTransport(handler),
            **kwargs,
        )

    monkeypatch.setattr(
        "app.langfuse_client.httpx.AsyncClient",
        client_factory,
    )

    async def no_sleep(delay: float) -> None:
        return None

    events: list[str] = []
    job = _sync_score_job()
    repository = FakeRepository(events, job)
    broker = FakeBroker(events)
    executor = SyncScoreBatchExecutor(
        ScoreResultStorage(),
        LangfuseProjectApiClient(
            Settings(langfuse_base_url="http://langfuse.local")
        ),
        ScoreCredentialProvider(),
        max_rate_limit_retries=0,
        sleep=no_sleep,
    )

    asyncio.run(_worker(repository, broker, executor).handle_message(MESSAGE))

    assert repository.dead_letters == []
    assert repository.retries[0]["error_code"] == expected_code
    assert repository.retries[0]["error_message"] == (
        "Evaluation provider temporarily unavailable"
    )
    assert broker.ack_calls == 1


@pytest.mark.parametrize("status_code", [401, 403])
def test_real_score_client_auth_failures_dead_letter_without_retry(
    monkeypatch: pytest.MonkeyPatch,
    status_code: int,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            status_code,
            json={"message": "response contains credential"},
        )

    real_async_client = httpx.AsyncClient

    def client_factory(**kwargs: Any) -> httpx.AsyncClient:
        return real_async_client(
            transport=httpx.MockTransport(handler),
            **kwargs,
        )

    monkeypatch.setattr(
        "app.langfuse_client.httpx.AsyncClient",
        client_factory,
    )
    events: list[str] = []
    job = _sync_score_job()
    repository = FakeRepository(events, job)
    broker = FakeBroker(events)
    executor = SyncScoreBatchExecutor(
        ScoreResultStorage(),
        LangfuseProjectApiClient(
            Settings(langfuse_base_url="http://langfuse.local")
        ),
        ScoreCredentialProvider(),
        max_rate_limit_retries=0,
    )

    asyncio.run(_worker(repository, broker, executor).handle_message(MESSAGE))

    assert repository.retries == []
    assert repository.dead_letters[0]["error_code"] == (
        "PROVIDER_AUTHENTICATION_FAILED"
    )
    assert broker.ack_calls == 1


@pytest.mark.parametrize(
    ("status_code", "expected_code"),
    [
        (400, "PROVIDER_REQUEST_REJECTED"),
        (401, "PROVIDER_AUTHENTICATION_FAILED"),
        (403, "PROVIDER_AUTHENTICATION_FAILED"),
        (404, "PROVIDER_REQUEST_REJECTED"),
    ],
)
def test_deterministic_provider_http_failures_dead_letter_without_retry(
    status_code: int,
    expected_code: str,
) -> None:
    events: list[str] = []
    repository = FakeRepository(events)
    broker = FakeBroker(events)
    executors = FakeExecutors(events, ProviderHTTPError(status_code))

    asyncio.run(_worker(repository, broker, executors).handle_message(MESSAGE))

    assert repository.completed == []
    assert repository.retries == []
    assert repository.dead_letters[0]["error_code"] == expected_code
    assert repository.dead_letters[0]["error_message"] == "Evaluation job failed"


def test_unclassified_execution_error_dead_letters_instead_of_retry() -> None:
    events: list[str] = []
    repository = FakeRepository(events)
    broker = FakeBroker(events)
    executors = FakeExecutors(events, ValueError("programming error with token"))

    asyncio.run(_worker(repository, broker, executors).handle_message(MESSAGE))

    assert repository.retries == []
    assert repository.dead_letters[0]["error_code"] == "NON_RETRYABLE_EXECUTION"


def test_unclassified_provider_error_code_is_sanitized_before_persistence() -> None:
    events: list[str] = []
    repository = FakeRepository(events)
    broker = FakeBroker(events)
    executors = FakeExecutors(events, UnsafeProviderError("secret prompt"))

    asyncio.run(_worker(repository, broker, executors).handle_message(MESSAGE))

    assert repository.retries == []
    assert repository.dead_letters[0]["error_code"] == "NON_RETRYABLE_EXECUTION"
    assert "secret" not in repository.dead_letters[0]["error_message"]


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
    "error_code",
    ["EVALUATOR_CONTRACT_ERROR", "INVALID_SHARD_DESCRIPTOR", "INVALID_BATCH_RANGE"],
)
def test_global_execution_errors_never_create_split_tree(error_code: str) -> None:
    events: list[str] = []
    repository = FakeRepository(events)
    broker = FakeBroker(events)
    executors = FakeExecutors(
        events,
        NonRetryableExecutionError("global secret", error_code=error_code),
    )

    asyncio.run(_worker(repository, broker, executors).handle_message(MESSAGE))

    assert repository.completed == []
    assert repository.retries == []
    assert len(repository.dead_letters) == 1
    assert repository.dead_letters[0]["error_code"] == error_code


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
        failing = HeartbeatRepository([ConnectionError("one"), ConnectionError("two")])
        async with HeartbeatGuard(
            failing, "job-1", "worker-1", 0.001, lease_seconds=1
        ) as guard:
            await asyncio.sleep(0.01)
            with pytest.raises(LeaseLostError):
                await guard.checkpoint()

        recovering = HeartbeatRepository([ConnectionError("one"), True, True])
        async with HeartbeatGuard(
            recovering, "job-2", "worker-1", 0.001, lease_seconds=1
        ) as guard:
            await asyncio.sleep(0.006)
            await guard.checkpoint()

    asyncio.run(scenario())


def test_heartbeat_unexpected_error_propagates_instead_of_becoming_lease_loss() -> (
    None
):
    repository = HeartbeatRepository([ValueError("heartbeat programming error")])

    async def scenario() -> None:
        checkpoint_returned = False
        with pytest.raises(ValueError, match="heartbeat programming error"):
            async with HeartbeatGuard(
                repository,
                "job-1",
                "worker-1",
                0.001,
                lease_seconds=1,
            ) as guard:
                await asyncio.sleep(0.005)
                await guard.checkpoint()
                checkpoint_returned = True
        assert checkpoint_returned is False

    asyncio.run(scenario())


class RequestCancellationExecutors:
    def __init__(self, repository: FakeRepository, events: list[str]) -> None:
        self.repository = repository
        self.events = events

    async def execute(
        self,
        job: EvaluationJob,
        guard: HeartbeatGuard,
    ) -> ExecutionOutcome:
        self.events.extend(["start-heartbeat", "execute"])
        await self.repository.request_run_cancel()
        await asyncio.wait_for(
            self.repository.heartbeat_rejected.wait(),
            timeout=0.2,
        )
        await guard.checkpoint()
        raise AssertionError("cancelled checkpoint unexpectedly returned")


def test_running_cancel_closes_job_then_acks_and_allows_final_report() -> None:
    events: list[str] = []
    repository = FakeRepository(events)
    broker = FakeBroker(events)
    executors = RequestCancellationExecutors(repository, events)

    asyncio.run(
        _worker(
            repository,
            broker,
            executors,  # type: ignore[arg-type]
            heartbeat_seconds=0.001,
        ).handle_message(MESSAGE)
    )

    assert repository.state is JobStatus.CANCELLED
    assert repository.cancel_attempts == 1
    assert repository.report_count == 1
    assert broker.ack_calls == 1
    assert events[-2:] == ["mark-cancelled", "ack"]


def test_lease_lost_never_acks_or_transitions_business_state() -> None:
    events: list[str] = []
    repository = FakeRepository(events)
    broker = FakeBroker(events)
    executors = FakeExecutors(events, LeaseLostError("lost"))

    with pytest.raises(LeaseLostError):
        asyncio.run(_worker(repository, broker, executors).handle_message(MESSAGE))

    assert broker.ack_calls == 0
    assert repository.cancel_attempts == 1
    assert events[-1] == "mark-cancelled"
    assert repository.completed == []
    assert repository.retries == []
    assert repository.dead_letters == []
