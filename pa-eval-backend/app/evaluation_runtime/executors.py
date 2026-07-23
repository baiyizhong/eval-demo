from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass
from typing import Any, Protocol

from app.evaluation_runtime.models import EvaluationJob, JobType
from app.evaluation_runtime.storage import (
    EmptyManifestError,
    ManifestStorage,
    StoredManifest,
)


class SampleSource(Protocol):
    def iter_samples(
        self, config_snapshot: Mapping[str, Any]
    ) -> AsyncIterator[Mapping[str, Any]]: ...


class PrepareRunRepository(Protocol):
    async def get_run_config_snapshot(
        self, run_id: str
    ) -> Mapping[str, Any] | None: ...

    async def finalize_prepared_run(
        self,
        *,
        run_id: str,
        project_id: str,
        task_id: str,
        parent_job_id: str,
        actor: str,
        manifest: StoredManifest,
    ) -> bool: ...


@dataclass(frozen=True, slots=True)
class ExecutionOutcome:
    result_summary: Mapping[str, Any]
    raw_result_object_key: str | None = None


class NonRetryableExecutionError(RuntimeError):
    retryable = False

    def __init__(self, message: str, *, error_code: str) -> None:
        super().__init__(message)
        self.error_code = error_code


class PrepareRunExecutor:
    def __init__(
        self,
        repository: PrepareRunRepository,
        storage: ManifestStorage,
        sample_source: SampleSource,
        *,
        batch_size: int = 100,
    ) -> None:
        if batch_size <= 0:
            raise ValueError("batch_size must be positive")
        self._repository = repository
        self._storage = storage
        self._sample_source = sample_source
        self._batch_size = batch_size

    async def execute(self, job: EvaluationJob) -> ExecutionOutcome:
        if job.job_type is not JobType.PREPARE_RUN:
            raise ValueError("PrepareRunExecutor only accepts PREPARE_RUN jobs")
        config_snapshot = await self._repository.get_run_config_snapshot(job.run_id)
        if config_snapshot is None:
            raise NonRetryableExecutionError(
                "run config snapshot is unavailable",
                error_code="RUN_CONFIG_NOT_FOUND",
            )
        try:
            manifest = await self._storage.put_manifest(
                job.project_id,
                job.run_id,
                self._sample_source.iter_samples(config_snapshot),
                batch_size=self._batch_size,
            )
        except EmptyManifestError as error:
            raise NonRetryableExecutionError(
                "sample source is empty",
                error_code="EMPTY_SAMPLE_SOURCE",
            ) from error

        finalized = await self._repository.finalize_prepared_run(
            run_id=job.run_id,
            project_id=job.project_id,
            task_id=job.task_id,
            parent_job_id=job.id,
            actor=job.lease_owner or job.update_by,
            manifest=manifest,
        )
        if not finalized:
            raise NonRetryableExecutionError(
                "run is no longer active",
                error_code="RUN_NOT_ACTIVE",
            )
        return ExecutionOutcome(
            result_summary={
                "sampleCount": manifest.total_count,
                "batchCount": len(manifest.shards),
                "contentHash": manifest.content_hash,
                "manifestHash": manifest.manifest_hash,
            },
            raw_result_object_key=manifest.index_object_key,
        )
