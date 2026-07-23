import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any, Protocol

from app.evaluation_runtime.evaluator_adapters import (
    EvaluationCheckpoint,
    EvaluatorAdapter,
)
from app.evaluation_runtime.models import EvaluationJob, JobType
from app.evaluation_runtime.idempotency import deterministic_score_id
from app.evaluation_runtime.storage import (
    EmptyManifestError,
    ManifestStorage,
    ShardDescriptor,
    StoredManifest,
)
from app.langfuse_client import LangfuseRateLimitError


SCORE_SYNC_BATCH_SIZE = 100


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


class ResultStorage(Protocol):
    async def read_result(self, object_key: str) -> Mapping[str, Any]: ...


class ScoreApiClient(Protocol):
    async def create_score(
        self,
        project_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]: ...


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


def build_score_payload(
    job: EvaluationJob,
    sample: Mapping[str, Any],
    score: Mapping[str, Any],
) -> dict[str, Any]:
    sample_id = sample.get("sampleId")
    score_name = score.get("name")
    if not isinstance(sample_id, str) or not sample_id.strip():
        raise ValueError("sampleId is required")
    if not isinstance(score_name, str) or not score_name.strip():
        raise ValueError("score name is required")
    metadata = score.get("metadata")
    payload_metadata = dict(metadata) if isinstance(metadata, Mapping) else {}
    payload_metadata.update(
        {
            "paAutoEvaluationRunId": job.run_id,
            "paEvaluationJobId": job.id,
            "paEvaluationSampleId": sample_id,
        }
    )
    payload: dict[str, Any] = {
        "id": deterministic_score_id(job.run_id, sample_id, score_name),
        "name": score_name,
        "value": score.get("value"),
        "metadata": payload_metadata,
    }
    for key in (
        "traceId",
        "observationId",
        "sessionId",
        "dataType",
        "stringValue",
        "comment",
        "configId",
    ):
        if key in score and score[key] is not None:
            payload[key] = score[key]
    return payload


class SyncScoreBatchExecutor:
    def __init__(
        self,
        storage: ResultStorage,
        client: ScoreApiClient,
        *,
        max_concurrency: int = 10,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        if max_concurrency <= 0 or max_concurrency > SCORE_SYNC_BATCH_SIZE:
            raise ValueError("max_concurrency must be between 1 and 100")
        self._storage = storage
        self._client = client
        self._max_concurrency = max_concurrency
        self._sleep = sleep

    async def execute(
        self,
        job: EvaluationJob,
        checkpoint: EvaluationCheckpoint,
    ) -> ExecutionOutcome:
        if job.job_type is not JobType.SYNC_SCORE_BATCH:
            raise ValueError("SyncScoreBatchExecutor only accepts SYNC_SCORE_BATCH jobs")
        object_key = job.payload.get("rawResultObjectKey")
        if not isinstance(object_key, str) or not object_key:
            raise NonRetryableExecutionError(
                "evaluation result object key is unavailable",
                error_code="RESULT_OBJECT_NOT_FOUND",
            )
        await checkpoint.checkpoint()
        document = await self._storage.read_result(object_key)
        payloads = _score_payloads(job, document)
        pending_ids = job.payload.get("pendingScoreIds")
        if pending_ids is not None:
            if not isinstance(pending_ids, (list, tuple)) or any(
                not isinstance(item, str) for item in pending_ids
            ):
                raise NonRetryableExecutionError(
                    "pending score confirmation state is invalid",
                    error_code="INVALID_SCORE_CONFIRMATION_STATE",
                )
            pending_set = set(pending_ids)
            payloads = [payload for payload in payloads if payload["id"] in pending_set]
            if {payload["id"] for payload in payloads} != pending_set:
                raise NonRetryableExecutionError(
                    "pending score confirmation state is invalid",
                    error_code="INVALID_SCORE_CONFIRMATION_STATE",
                )

        confirmed: list[dict[str, str]] = []
        failed_ids: list[str] = []
        failures: list[BaseException] = []
        semaphore = asyncio.Semaphore(self._max_concurrency)
        for start in range(0, len(payloads), SCORE_SYNC_BATCH_SIZE):
            batch = payloads[start : start + SCORE_SYNC_BATCH_SIZE]
            results = await asyncio.gather(
                *(
                    self._create_score(job.project_id, payload, semaphore)
                    for payload in batch
                ),
                return_exceptions=True,
            )
            for payload, result in zip(batch, results, strict=True):
                if isinstance(result, BaseException):
                    failed_ids.append(payload["id"])
                    failures.append(result)
                    continue
                remote_id = result.get("id")
                confirmed.append(
                    {
                        "scoreId": payload["id"],
                        "remoteObjectId": (
                            remote_id if isinstance(remote_id, str) else payload["id"]
                        ),
                    }
                )
            await checkpoint.checkpoint()

        if failures and not confirmed:
            raise failures[0]
        followups: tuple[FollowupJobSpec, ...] = ()
        if failed_ids:
            retry_payload = dict(job.payload)
            retry_payload["pendingScoreIds"] = failed_ids
            followups = (
                FollowupJobSpec(
                    JobType.SYNC_SCORE_BATCH,
                    job.batch_start,
                    job.batch_end,
                    retry_payload,
                ),
            )
        return ExecutionOutcome(
            result_summary={
                "status": "partially_synced" if failed_ids else "synced",
                "requestedCount": len(payloads),
                "confirmedCount": len(confirmed),
                "pendingCount": len(failed_ids),
                "confirmedScores": confirmed,
            },
            followups=followups,
        )

    async def _create_score(
        self,
        project_id: str,
        payload: dict[str, Any],
        semaphore: asyncio.Semaphore,
    ) -> dict[str, Any]:
        async with semaphore:
            try:
                return await self._client.create_score(project_id, payload)
            except LangfuseRateLimitError as error:
                await self._sleep(error.retry_after_seconds)
                return await self._client.create_score(project_id, payload)


def _score_payloads(
    job: EvaluationJob,
    document: Mapping[str, Any],
) -> list[dict[str, Any]]:
    raw_results = document.get("results")
    if not isinstance(raw_results, list):
        raise NonRetryableExecutionError(
            "evaluation result object is invalid",
            error_code="INVALID_RESULT_OBJECT",
        )
    payloads: dict[str, dict[str, Any]] = {}
    for sample in raw_results:
        if not isinstance(sample, Mapping):
            raise NonRetryableExecutionError(
                "evaluation result object is invalid",
                error_code="INVALID_RESULT_OBJECT",
            )
        if sample.get("status") != "SUCCEEDED":
            continue
        scores = sample.get("scores")
        if not isinstance(scores, list):
            raise NonRetryableExecutionError(
                "evaluation result object is invalid",
                error_code="INVALID_RESULT_OBJECT",
            )
        try:
            for score in scores:
                if not isinstance(score, Mapping):
                    raise ValueError("score must be a mapping")
                payload = build_score_payload(job, sample, score)
                payloads[payload["id"]] = payload
        except ValueError as error:
            raise NonRetryableExecutionError(
                "evaluation result object is invalid",
                error_code="INVALID_RESULT_OBJECT",
            ) from error
    return list(payloads.values())


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
            raise NonRetryableExecutionError(
                "evaluation shard descriptor is invalid",
                error_code="INVALID_SHARD_DESCRIPTOR",
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


def _sample_mapping_error() -> BatchSplitExecutionError:
    return BatchSplitExecutionError(
        "evaluation sample mapping is invalid",
        error_code="INVALID_SAMPLE_MAPPING",
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
        raise NonRetryableExecutionError(
            "evaluation shard descriptor is invalid",
            error_code="INVALID_SHARD_DESCRIPTOR",
        )
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
        raise NonRetryableExecutionError(
            "evaluation batch range is invalid",
            error_code="INVALID_BATCH_RANGE",
        )
    return start, end


def _adapter_samples(
    shard_samples: list[Mapping[str, Any]],
    *,
    batch_start: int,
) -> list[Mapping[str, Any]]:
    samples: list[Mapping[str, Any]] = []
    for offset, raw_sample in enumerate(shard_samples):
        if not isinstance(raw_sample, Mapping):
            raise _sample_mapping_error()
        sample_id = raw_sample.get("sampleId")
        if not isinstance(sample_id, str) or not sample_id.strip():
            raise _sample_mapping_error()
        samples.append({**raw_sample, "globalIndex": batch_start + offset})
    return samples


def _standard_results(
    raw_results: Any,
    samples: list[Mapping[str, Any]],
) -> list[Mapping[str, Any]]:
    if not isinstance(raw_results, (list, tuple)) or len(raw_results) != len(
        samples
    ):
        raise NonRetryableExecutionError(
            "evaluator result shape is invalid",
            error_code="EVALUATOR_CONTRACT_ERROR",
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
            raise NonRetryableExecutionError(
                "evaluator result shape is invalid",
                error_code="EVALUATOR_CONTRACT_ERROR",
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
