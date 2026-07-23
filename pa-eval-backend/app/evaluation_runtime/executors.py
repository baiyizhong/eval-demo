from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass
from typing import Any, Protocol

from app.evaluation_runtime.evaluator_adapters import (
    EvaluationCheckpoint,
    EvaluatorAdapter,
)
from app.evaluation_runtime.models import EvaluationJob, JobType
from app.evaluation_runtime.storage import (
    EmptyManifestError,
    ManifestStorage,
    ShardDescriptor,
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
class FollowupJobSpec:
    job_type: JobType
    batch_start: int | None
    batch_end: int | None
    payload: Mapping[str, Any]


@dataclass(frozen=True, slots=True)
class ExecutionOutcome:
    result_summary: Mapping[str, Any]
    raw_result_object_key: str | None = None
    followups: tuple[FollowupJobSpec, ...] = ()
    completed_count: int = 0
    failed_count: int = 0


class NonRetryableExecutionError(RuntimeError):
    retryable = False

    def __init__(self, message: str, *, error_code: str) -> None:
        super().__init__(message)
        self.error_code = error_code


class BatchSplitExecutionError(NonRetryableExecutionError):
    pass


class EvaluateBatchExecutor:
    def __init__(
        self,
        repository: PrepareRunRepository,
        storage: ManifestStorage,
        adapters: Mapping[str, EvaluatorAdapter],
    ) -> None:
        self._repository = repository
        self._storage = storage
        self._adapters = dict(adapters)

    async def execute(
        self,
        job: EvaluationJob,
        checkpoint: EvaluationCheckpoint,
    ) -> ExecutionOutcome:
        if job.job_type is not JobType.EVALUATE_BATCH:
            raise ValueError("EvaluateBatchExecutor only accepts EVALUATE_BATCH jobs")
        config_snapshot = await self._repository.get_run_config_snapshot(job.run_id)
        if config_snapshot is None:
            raise NonRetryableExecutionError(
                "run config snapshot is unavailable",
                error_code="RUN_CONFIG_NOT_FOUND",
            )
        evaluator_type = config_snapshot.get("evaluatorType")
        adapter = self._adapters.get(evaluator_type) if isinstance(
            evaluator_type, str
        ) else None
        if adapter is None:
            raise NonRetryableExecutionError(
                "evaluator adapter is unavailable",
                error_code="EVALUATOR_ADAPTER_NOT_FOUND",
            )

        shard = _job_shard(job)
        try:
            shard_samples = await self._storage.read_shard(shard)
        except ValueError as error:
            raise BatchSplitExecutionError(
                "evaluation shard mapping is invalid",
                error_code="INVALID_BATCH_MAPPING",
            ) from error
        batch_start, batch_end = _job_batch_range(job, shard)
        relative_start = batch_start - shard.start
        relative_end = batch_end - shard.start
        samples = _adapter_samples(
            shard_samples[relative_start:relative_end],
            batch_start=batch_start,
        )

        await checkpoint.checkpoint()
        raw_results = await adapter.evaluate(
            config_snapshot,
            samples,
            checkpoint,
        )
        await checkpoint.checkpoint()
        results = _standard_results(raw_results, samples)
        succeeded_count = sum(
            result["status"] == "SUCCEEDED" for result in results
        )
        failed_count = len(results) - succeeded_count
        result_document = {"results": results}
        await checkpoint.checkpoint()
        object_key = await self._storage.put_result(
            job.project_id,
            job.run_id,
            job.id,
            result_document,
        )
        followup_payload = {
            "rawResultObjectKey": object_key,
            "manifestHash": job.payload.get("manifestHash"),
            "contentHash": job.payload.get("contentHash"),
        }
        return ExecutionOutcome(
            result_summary={
                "status": "evaluated",
                "sampleCount": len(results),
                "succeededCount": succeeded_count,
                "failedCount": failed_count,
            },
            raw_result_object_key=object_key,
            followups=(
                FollowupJobSpec(
                    JobType.SYNC_SCORE_BATCH,
                    batch_start,
                    batch_end,
                    followup_payload,
                ),
            ),
            completed_count=succeeded_count,
            failed_count=failed_count,
        )


def _mapping_error() -> BatchSplitExecutionError:
    return BatchSplitExecutionError(
        "evaluation batch mapping is invalid",
        error_code="INVALID_BATCH_MAPPING",
    )


def _job_shard(job: EvaluationJob) -> ShardDescriptor:
    payload = job.payload
    shard_start = payload.get("shardStart", payload.get("start"))
    shard_end = payload.get("shardEnd", payload.get("end"))
    object_key = payload.get("shardObjectKey")
    shard_hash = payload.get("shardHash")
    if (
        isinstance(shard_start, bool)
        or not isinstance(shard_start, int)
        or isinstance(shard_end, bool)
        or not isinstance(shard_end, int)
        or not isinstance(object_key, str)
        or not isinstance(shard_hash, str)
    ):
        raise _mapping_error()
    return ShardDescriptor(
        start=shard_start,
        end=shard_end,
        object_key=object_key,
        shard_hash=shard_hash,
    )


def _job_batch_range(
    job: EvaluationJob,
    shard: ShardDescriptor,
) -> tuple[int, int]:
    start = job.batch_start
    end = job.batch_end
    if (
        isinstance(start, bool)
        or not isinstance(start, int)
        or isinstance(end, bool)
        or not isinstance(end, int)
        or start < shard.start
        or end > shard.end
        or end <= start
    ):
        raise _mapping_error()
    return start, end


def _adapter_samples(
    shard_samples: list[Mapping[str, Any]],
    *,
    batch_start: int,
) -> list[Mapping[str, Any]]:
    samples: list[Mapping[str, Any]] = []
    for offset, raw_sample in enumerate(shard_samples):
        if not isinstance(raw_sample, Mapping):
            raise _mapping_error()
        sample_id = raw_sample.get("sampleId")
        if not isinstance(sample_id, str) or not sample_id.strip():
            raise _mapping_error()
        samples.append({**raw_sample, "globalIndex": batch_start + offset})
    return samples


def _standard_results(
    raw_results: Any,
    samples: list[Mapping[str, Any]],
) -> list[Mapping[str, Any]]:
    if not isinstance(raw_results, (list, tuple)) or len(raw_results) != len(
        samples
    ):
        raise BatchSplitExecutionError(
            "evaluator result shape is invalid",
            error_code="INVALID_EVALUATION_RESULT",
        )
    required = {"sampleId", "status", "outputs", "scores", "error"}
    results: list[Mapping[str, Any]] = []
    for sample, result in zip(samples, raw_results, strict=True):
        if (
            not isinstance(result, Mapping)
            or not required.issubset(result)
            or result.get("sampleId") != sample["sampleId"]
            or not isinstance(result.get("status"), str)
        ):
            raise BatchSplitExecutionError(
                "evaluator result shape is invalid",
                error_code="INVALID_EVALUATION_RESULT",
            )
        results.append({key: result[key] for key in required})
    return results


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
