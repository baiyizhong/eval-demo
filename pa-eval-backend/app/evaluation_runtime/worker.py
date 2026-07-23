import asyncio
from contextlib import suppress
import re
from typing import Any, Protocol

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
            except Exception:
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


class WorkerBroker(Protocol):
    async def ack(self, routing_key: str, message_id: str) -> int: ...


class JobExecutors(Protocol):
    async def execute(
        self,
        job: EvaluationJob,
        guard: HeartbeatGuard,
    ) -> ExecutionOutcome: ...


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
                else:
                    await self._retry(job, error, guard)
            else:
                await guard.checkpoint()
                completed = await self._repository.complete_with_followups(
                    job,
                    outcome,
                    self._worker_id,
                )
                _require_transition(completed)
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
    status_code = getattr(getattr(error, "response", None), "status_code", None)
    if status_code == 429:
        return "PROVIDER_RATE_LIMIT"
    if isinstance(status_code, int) and status_code >= 500:
        return "PROVIDER_UNAVAILABLE"
    if isinstance(error, TimeoutError):
        return "PROVIDER_TIMEOUT"
    return default


def _safe_error_code(value: str, *, default: str) -> str:
    if _ERROR_CODE_PATTERN.fullmatch(value) is None:
        return default
    return value
