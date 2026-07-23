from typing import Any

from app.evaluation_runtime.models import JobStatus


class JobDispatcher:
    def __init__(
        self,
        repository: Any,
        broker: Any,
        *,
        batch_size: int,
    ) -> None:
        if batch_size <= 0:
            raise ValueError("batch_size must be positive")
        self._repository = repository
        self._broker = broker
        self._batch_size = batch_size

    async def dispatch_once(self) -> int:
        jobs = await self._repository.list_dispatchable(limit=self._batch_size)
        published = 0
        for job in jobs:
            dispatch_job = job
            if job.status is not JobStatus.ENQUEUED:
                dispatch_job = await self._repository.mark_enqueued_for_dispatch(
                    job.id
                )
                if dispatch_job is None:
                    continue
            await self._broker.publish(dispatch_job.routing_key, dispatch_job.id)
            published += 1
        return published


class LeaseReaper:
    def __init__(
        self,
        repository: Any,
        *,
        batch_size: int,
        actor: str,
    ) -> None:
        if batch_size <= 0:
            raise ValueError("batch_size must be positive")
        self._repository = repository
        self._batch_size = batch_size
        self._actor = actor

    async def reap_once(self) -> int:
        jobs = await self._repository.requeue_expired_leases(
            limit=self._batch_size,
            actor=self._actor,
        )
        return len(jobs)
