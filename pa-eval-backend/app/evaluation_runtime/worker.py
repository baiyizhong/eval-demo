import asyncio
from contextlib import suppress
import re
from typing import Any, Protocol

from httpx import ConnectError, TimeoutException
from psycopg import OperationalError

from app.evaluation_runtime.broker import BrokerMessage
from app.evaluation_runtime.executors import (
    BatchSplitExecutionError,
    ExecutionOutcome,
    FollowupJobSpec,
    NonRetryableExecutionError,
)
from app.evaluation_runtime.models import EvaluationJob, JobType


_ERROR_CODE_PATTERN = re.compile(r"[A-Z][A-Z0-9_]{0,63}\Z")


class LeaseLostError(RuntimeError):
    pass


class HeartbeatRepository(Protocol):
    async def heartbeat(
        self,
        job_id: str,
        worker_id: str,
        *,
        lease_seconds: int,
    ) -> bool: ...


class HeartbeatGuard:
    def __init__(
        self,
        repository: HeartbeatRepository,
        job_id: str,
        worker_id: str,
        interval_seconds: float,
        *,
        lease_seconds: int,
    ) -> None:
        if interval_seconds <= 0:
            raise ValueError("interval_seconds must be positive")
        if lease_seconds <= 0:
            raise ValueError("lease_seconds must be positive")
        self._repository = repository
        self._job_id = job_id
        self._worker_id = worker_id
        self._interval_seconds = interval_seconds
        self._lease_seconds = lease_seconds
        self._task: asyncio.Task[None] | None = None
        self._lost = False

    async def __aenter__(self) -> "HeartbeatGuard":
        self._task = asyncio.create_task(self._run())
        return self

    async def __aexit__(self, *args: object) -> None:
        if self._task is None:
            return None
        self._task.cancel()
        with suppress(asyncio.CancelledError):
            await self._task
        self._task = None
        return None

    async def checkpoint(self) -> None:
        if self._task is not None and self._task.done() and not self._task.cancelled():
            error = self._task.exception()
            if error is not None:
                raise error
        if self._lost:
            raise LeaseLostError("evaluation job lease was lost")

    async def _run(self) -> None:
        consecutive_errors = 0
        while True:
            await asyncio.sleep(self._interval_seconds)
            try:
                renewed = await self._repository.heartbeat(
                    self._job_id,
                    self._worker_id,
                    lease_seconds=self._lease_seconds,
                )
            except asyncio.CancelledError:
                raise
            except (ConnectionError, TimeoutError, OperationalError):
                consecutive_errors += 1
                if consecutive_errors >= 2:
                    self._lost = True
                    return
                continue
            if not renewed:
                self._lost = True
                return
            consecutive_errors = 0


class WorkerRepository(HeartbeatRepository, Protocol):
    async def claim_job(
        self,
        job_id: str,
        worker_id: str,
        *,
        lease_seconds: int,
    ) -> EvaluationJob | None: ...

    async def complete_with_followups(
        self,
        job: EvaluationJob,
        outcome: ExecutionOutcome,
        worker_id: str,
    ) -> EvaluationJob | None: ...

    async def schedule_retry(self, *args: Any, **kwargs: Any) -> EvaluationJob | None: ...

    async def mark_dead_letter(
        self, *args: Any, **kwargs: Any
    ) -> EvaluationJob | None: ...

    async def mark_cancelled(
        self,
        job_id: str,
        worker_id: str,
    ) -> EvaluationJob | None: ...


class WorkerBroker(Protocol):
    async def ack(self, routing_key: str, message_id: str) -> int: ...


class WorkerRunnerBroker(Protocol):
    async def read(
        self,
        routing_key: str,
        consumer_name: str,
        *,
        count: int,
        block_ms: int,
    ) -> list[BrokerMessage]: ...

    async def claim_stale(
        self,
        routing_key: str,
        consumer_name: str,
        *,
        min_idle_ms: int,
        count: int,
        cursor: str,
    ) -> tuple[str, list[BrokerMessage]]: ...


class MessageHandler(Protocol):
    async def handle_message(self, message: BrokerMessage) -> None: ...


class JobExecutors(Protocol):
    async def execute(
        self,
        job: EvaluationJob,
        guard: HeartbeatGuard,
    ) -> ExecutionOutcome: ...


class EvaluationWorkerRunner:
    def __init__(
        self,
        *,
        worker: MessageHandler,
        broker: WorkerRunnerBroker,
        routing_key: str,
        consumer_name: str,
        count: int,
        block_ms: int,
        stale_idle_ms: int,
        stale_poll_interval_seconds: float,
    ) -> None:
        if count <= 0:
            raise ValueError("count must be positive")
        if block_ms < 0:
            raise ValueError("block_ms must be non-negative")
        if stale_idle_ms < 0:
            raise ValueError("stale_idle_ms must be non-negative")
        if stale_poll_interval_seconds <= 0:
            raise ValueError("stale_poll_interval_seconds must be positive")
        self._worker = worker
        self._broker = broker
        self._routing_key = routing_key
        self._consumer_name = consumer_name
        self._count = count
        self._block_ms = block_ms
        self._stale_idle_ms = stale_idle_ms
        self._stale_cursor = "0-0"
        self._stale_poll_interval_seconds = stale_poll_interval_seconds

    async def run_once(self, stop_event: asyncio.Event | None = None) -> int:
        fetch_tasks: dict[asyncio.Task[Any], str] = {
            asyncio.create_task(
                self._broker.claim_stale(
                    self._routing_key,
                    self._consumer_name,
                    min_idle_ms=self._stale_idle_ms,
                    count=self._count,
                    cursor=self._stale_cursor,
                )
            ): "stale",
            asyncio.create_task(
                self._broker.read(
                    self._routing_key,
                    self._consumer_name,
                    count=self._count,
                    block_ms=self._block_ms,
                )
            ): "new",
        }
        stop_task = (
            asyncio.create_task(stop_event.wait())
            if stop_event is not None
            else None
        )
        processed = 0
        try:
            while fetch_tasks:
                waiters = set(fetch_tasks)
                if stop_task is not None:
                    waiters.add(stop_task)
                completed, _ = await asyncio.wait(
                    waiters,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in completed:
                    source = fetch_tasks.pop(task, None)
                    if source is None:
                        continue
                    if source == "stale":
                        self._stale_cursor, messages = task.result()
                    else:
                        messages = task.result()
                    for message in messages:
                        await self._worker.handle_message(message)
                    processed += len(messages)
                if stop_task is not None and stop_task in completed:
                    break
            return processed
        finally:
            cleanup_tasks = list(fetch_tasks)
            if stop_task is not None:
                cleanup_tasks.append(stop_task)
            for task in cleanup_tasks:
                task.cancel()
            if cleanup_tasks:
                await asyncio.gather(*cleanup_tasks, return_exceptions=True)

    async def run(self, stop_event: asyncio.Event) -> None:
        consumer_tasks = {
            asyncio.create_task(self._consume_new_messages(stop_event)),
            asyncio.create_task(self._consume_stale_messages(stop_event)),
        }
        stop_task = asyncio.create_task(stop_event.wait())
        tasks = {*consumer_tasks, stop_task}
        try:
            completed, _ = await asyncio.wait(
                tasks,
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in completed & consumer_tasks:
                task.result()
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _consume_new_messages(self, stop_event: asyncio.Event) -> None:
        while not stop_event.is_set():
            messages = await self._broker.read(
                self._routing_key,
                self._consumer_name,
                count=self._count,
                block_ms=self._block_ms,
            )
            for message in messages:
                await self._worker.handle_message(message)

    async def _consume_stale_messages(self, stop_event: asyncio.Event) -> None:
        while not stop_event.is_set():
            self._stale_cursor, messages = await self._broker.claim_stale(
                self._routing_key,
                self._consumer_name,
                min_idle_ms=self._stale_idle_ms,
                count=self._count,
                cursor=self._stale_cursor,
            )
            for message in messages:
                await self._worker.handle_message(message)
            if self._stale_cursor == "0-0":
                await asyncio.sleep(self._stale_poll_interval_seconds)


class EvaluationWorker:
    def __init__(
        self,
        *,
        repository: WorkerRepository,
        broker: WorkerBroker,
        executors: JobExecutors,
        worker_id: str,
        lease_seconds: int,
        heartbeat_seconds: float,
    ) -> None:
        if lease_seconds <= 0:
            raise ValueError("lease_seconds must be positive")
        if heartbeat_seconds <= 0:
            raise ValueError("heartbeat_seconds must be positive")
        self._repository = repository
        self._broker = broker
        self._executors = executors
        self._worker_id = worker_id
        self._lease_seconds = lease_seconds
        self._heartbeat_seconds = heartbeat_seconds

    async def handle_message(self, message: BrokerMessage) -> None:
        if message.job_id is None:
            await self._broker.ack(message.routing_key, message.message_id)
            return
        job = await self._repository.claim_job(
            message.job_id,
            self._worker_id,
            lease_seconds=self._lease_seconds,
        )
        if job is None:
            await self._broker.ack(message.routing_key, message.message_id)
            return

        try:
            async with HeartbeatGuard(
                self._repository,
                job.id,
                self._worker_id,
                self._heartbeat_seconds,
                lease_seconds=self._lease_seconds,
            ) as guard:
                try:
                    outcome = await self._executors.execute(job, guard)
                except LeaseLostError:
                    raise
                except BatchSplitExecutionError as error:
                    await self._handle_split_error(job, error, guard)
                except NonRetryableExecutionError as error:
                    await self._dead_letter(
                        job,
                        _safe_error_code(
                            error.error_code,
                            default="NON_RETRYABLE_EXECUTION",
                        ),
                        guard,
                    )
                except Exception as error:
                    if getattr(error, "retryable", True) is False:
                        await self._dead_letter(
                            job,
                            _error_code(error, default="NON_RETRYABLE_EXECUTION"),
                            guard,
                        )
                    elif _is_transient_provider_error(error):
                        await self._retry(job, error, guard)
                    else:
                        await self._dead_letter(
                            job,
                            _permanent_error_code(error),
                            guard,
                        )
                else:
                    await guard.checkpoint()
                    completed = await self._repository.complete_with_followups(
                        job,
                        outcome,
                        self._worker_id,
                    )
                    _require_transition(completed)
        except LeaseLostError:
            cancelled = await self._repository.mark_cancelled(
                job.id,
                self._worker_id,
            )
            if cancelled is None:
                raise
        await self._broker.ack(message.routing_key, message.message_id)

    async def _handle_split_error(
        self,
        job: EvaluationJob,
        error: BatchSplitExecutionError,
        guard: HeartbeatGuard,
    ) -> None:
        start = job.batch_start
        end = job.batch_end
        if start is None or end is None or end <= start:
            await self._dead_letter(
                job,
                _safe_error_code(
                    error.error_code,
                    default="INVALID_BATCH_MAPPING",
                ),
                guard,
            )
            return
        if end - start == 1:
            await guard.checkpoint()
            transitioned = await self._repository.mark_dead_letter(
                job.id,
                self._worker_id,
                error_code=_safe_error_code(
                    error.error_code,
                    default="INVALID_BATCH_MAPPING",
                ),
                error_message="Evaluation batch failed",
                failed_count=1,
            )
            _require_transition(transitioned)
            return

        midpoint = start + (end - start) // 2
        children = (
            FollowupJobSpec(
                JobType.EVALUATE_BATCH,
                start,
                midpoint,
                dict(job.payload),
            ),
            FollowupJobSpec(
                JobType.EVALUATE_BATCH,
                midpoint,
                end,
                dict(job.payload),
            ),
        )
        await guard.checkpoint()
        transitioned = await self._repository.complete_with_followups(
            job,
            ExecutionOutcome(
                {
                    "status": "split",
                    "batchStart": start,
                    "batchEnd": end,
                },
                followups=children,
            ),
            self._worker_id,
        )
        _require_transition(transitioned)

    async def _retry(
        self,
        job: EvaluationJob,
        error: Exception,
        guard: HeartbeatGuard,
    ) -> None:
        await guard.checkpoint()
        transitioned = await self._repository.schedule_retry(
            job.id,
            self._worker_id,
            attempt=job.attempt_count,
            error_code=_error_code(error, default="PROVIDER_UNAVAILABLE"),
            error_message="Evaluation provider temporarily unavailable",
        )
        _require_transition(transitioned)

    async def _dead_letter(
        self,
        job: EvaluationJob,
        error_code: str,
        guard: HeartbeatGuard,
    ) -> None:
        await guard.checkpoint()
        transitioned = await self._repository.mark_dead_letter(
            job.id,
            self._worker_id,
            error_code=error_code,
            error_message="Evaluation job failed",
        )
        _require_transition(transitioned)


def _require_transition(result: EvaluationJob | None) -> None:
    if result is None:
        raise LeaseLostError("evaluation job state transition was rejected")


def _error_code(error: Exception, *, default: str) -> str:
    explicit = getattr(error, "error_code", None)
    if isinstance(explicit, str):
        return _safe_error_code(explicit, default=default)
    status_code = _http_status(error)
    if status_code == 429:
        return "PROVIDER_RATE_LIMIT"
    if isinstance(status_code, int) and 500 <= status_code < 600:
        return "PROVIDER_UNAVAILABLE"
    if isinstance(error, (TimeoutError, TimeoutException)):
        return "PROVIDER_TIMEOUT"
    return default


def _is_transient_provider_error(error: Exception) -> bool:
    if getattr(error, "retryable", None) is True:
        return True
    if isinstance(
        error,
        (TimeoutError, ConnectionError, ConnectError, TimeoutException),
    ):
        return True
    status_code = _http_status(error)
    return status_code == 429 or (
        isinstance(status_code, int) and 500 <= status_code < 600
    )


def _permanent_error_code(error: Exception) -> str:
    status_code = _http_status(error)
    if status_code in {401, 403}:
        return "PROVIDER_AUTHENTICATION_FAILED"
    if isinstance(status_code, int) and 400 <= status_code < 500:
        return "PROVIDER_REQUEST_REJECTED"
    return _error_code(error, default="NON_RETRYABLE_EXECUTION")


def _http_status(error: Exception) -> Any:
    response_status = getattr(getattr(error, "response", None), "status_code", None)
    if response_status is not None:
        return response_status
    return getattr(error, "upstream_status_code", None)


def _safe_error_code(value: str, *, default: str) -> str:
    if _ERROR_CODE_PATTERN.fullmatch(value) is None:
        return default
    return value
