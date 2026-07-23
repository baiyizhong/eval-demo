import asyncio
from datetime import datetime, timezone
from typing import Any, Mapping

import pytest

from app.evaluation_runtime.executors import (
    BatchSplitExecutionError,
    EvaluateBatchExecutor,
    NonRetryableExecutionError,
)
from app.evaluation_runtime.models import EvaluationJob, JobStatus, JobType
from app.evaluation_runtime.storage import ManifestStorage, ObjectIntegrityError

from tests.evaluation_runtime.test_storage import FakeObjectStoreClient


def _job(**overrides: Any) -> EvaluationJob:
    now = datetime(2026, 7, 23, tzinfo=timezone.utc)
    values: dict[str, Any] = {
        "create_by": "user-1",
        "update_by": "worker-1",
        "create_date": now,
        "update_date": now,
        "id": "evaluate-job-1",
        "project_id": "project-1",
        "task_id": "task-1",
        "run_id": "run-1",
        "parent_job_id": "prepare-job-1",
        "job_type": JobType.EVALUATE_BATCH,
        "routing_key": "tenant-a",
        "batch_start": 11,
        "batch_end": 13,
        "idempotency_key": "evaluate-idem",
        "status": JobStatus.RUNNING,
        "priority": 7,
        "attempt_count": 1,
        "max_attempts": 5,
        "next_attempt_at": now,
        "lease_owner": "worker-1",
        "lease_expires_at": now,
        "heartbeat_at": now,
        "payload": {},
        "result_summary": {},
        "raw_result_object_key": None,
        "error_code": None,
        "error_message": None,
    }
    values.update(overrides)
    return EvaluationJob(**values)


class ConfigRepository:
    def __init__(self, snapshot: Mapping[str, Any] | None) -> None:
        self.snapshot = snapshot

    async def get_run_config_snapshot(
        self, run_id: str
    ) -> Mapping[str, Any] | None:
        assert run_id == "run-1"
        return self.snapshot


class RecordingGuard:
    def __init__(self, events: list[str]) -> None:
        self.events = events

    async def checkpoint(self) -> None:
        self.events.append("checkpoint")


class RecordingAdapter:
    def __init__(
        self,
        events: list[str],
        *,
        results: list[Mapping[str, Any]] | None = None,
        error: Exception | None = None,
    ) -> None:
        self.events = events
        self.results = results
        self.error = error
        self.calls: list[tuple[Mapping[str, Any], list[Mapping[str, Any]]]] = []

    async def evaluate(
        self,
        config_snapshot: Mapping[str, Any],
        samples: list[Mapping[str, Any]],
        checkpoint: RecordingGuard,
    ) -> list[Mapping[str, Any]]:
        self.events.append("adapter")
        self.calls.append((config_snapshot, samples))
        if self.error is not None:
            raise self.error
        if self.results is not None:
            return self.results
        return [
            {
                "sampleId": sample["sampleId"],
                "status": "SUCCEEDED",
                "outputs": {"answer": sample["text"]},
                "scores": [{"name": "quality", "value": 1}],
                "error": None,
            }
            for sample in samples
        ]


class RecordingStorage(ManifestStorage):
    def __init__(self, client: FakeObjectStoreClient, events: list[str]) -> None:
        super().__init__(bucket="test-bucket", client=client)
        self.events = events

    async def put_result(self, *args: Any, **kwargs: Any) -> str:
        self.events.append("put-result")
        return await super().put_result(*args, **kwargs)


def _executor_fixture() -> tuple[
    EvaluateBatchExecutor,
    EvaluationJob,
    RecordingAdapter,
    RecordingGuard,
    FakeObjectStoreClient,
]:
    events: list[str] = []
    client = FakeObjectStoreClient()
    storage = RecordingStorage(client, events)
    manifest = asyncio.run(
        storage.put_manifest(
            "project-1",
            "run-1",
            [
                {"sampleId": "sample-10", "text": "a"},
                {"sampleId": "sample-11", "text": "b"},
                {"sampleId": "sample-12", "text": "c"},
                {"sampleId": "sample-13", "text": "d"},
            ],
            batch_size=4,
        )
    )
    shard = manifest.shards[0]
    adapter = RecordingAdapter(events)
    executor = EvaluateBatchExecutor(
        ConfigRepository({"evaluatorType": "llm", "model": "safe-model"}),
        storage,
        {"llm": adapter},
    )
    job = _job(
        batch_start=1,
        batch_end=3,
        payload={
            "shardObjectKey": shard.object_key,
            "shardHash": shard.shard_hash,
            "shardStart": shard.start,
            "shardEnd": shard.end,
            "contentHash": manifest.content_hash,
            "manifestHash": manifest.manifest_hash,
        },
    )
    return executor, job, adapter, RecordingGuard(events), client


def test_evaluate_batch_slices_relative_to_shard_and_writes_standard_results() -> None:
    executor, job, adapter, guard, client = _executor_fixture()

    outcome = asyncio.run(executor.execute(job, guard))

    _, samples = adapter.calls[0]
    assert [(sample["sampleId"], sample["globalIndex"]) for sample in samples] == [
        ("sample-11", 1),
        ("sample-12", 2),
    ]
    assert guard.events == [
        "checkpoint",
        "adapter",
        "checkpoint",
        "checkpoint",
        "put-result",
    ]
    assert outcome.result_summary == {
        "status": "evaluated",
        "sampleCount": 2,
        "succeededCount": 2,
        "failedCount": 0,
    }
    assert outcome.completed_count == 2
    assert outcome.failed_count == 0
    assert outcome.raw_result_object_key in client.objects
    assert len(outcome.followups) == 1
    followup = outcome.followups[0]
    assert followup.job_type is JobType.SYNC_SCORE_BATCH
    assert (followup.batch_start, followup.batch_end) == (1, 3)
    assert followup.payload["rawResultObjectKey"] == outcome.raw_result_object_key
    assert followup.payload["manifestHash"] == job.payload["manifestHash"]


def test_evaluate_batch_accepts_legacy_start_end_shard_payload() -> None:
    executor, job, adapter, guard, _ = _executor_fixture()
    payload = dict(job.payload)
    payload["start"] = payload.pop("shardStart")
    payload["end"] = payload.pop("shardEnd")
    legacy_job = _job(batch_start=1, batch_end=2, payload=payload)

    asyncio.run(executor.execute(legacy_job, guard))

    assert [sample["globalIndex"] for sample in adapter.calls[0][1]] == [1]


@pytest.mark.parametrize(
    "results",
    [
        [{"sampleId": "sample-11", "status": "SUCCEEDED"}],
        [
            {
                "sampleId": "wrong",
                "status": "SUCCEEDED",
                "outputs": {},
                "scores": [],
                "error": None,
            },
            {
                "sampleId": "sample-12",
                "status": "SUCCEEDED",
                "outputs": {},
                "scores": [],
                "error": None,
            },
        ],
    ],
)
def test_evaluate_batch_rejects_non_standard_or_misaligned_adapter_results(
    results: list[Mapping[str, Any]],
) -> None:
    executor, job, adapter, guard, _ = _executor_fixture()
    adapter.results = results

    with pytest.raises(NonRetryableExecutionError) as captured:
        asyncio.run(executor.execute(job, guard))

    assert not isinstance(captured.value, BatchSplitExecutionError)
    assert captured.value.error_code == "EVALUATOR_CONTRACT_ERROR"


def test_evaluate_batch_rejects_job_range_outside_shard_without_split() -> None:
    executor, job, _, guard, _ = _executor_fixture()
    invalid = _job(batch_start=0, batch_end=5, payload=job.payload)

    with pytest.raises(NonRetryableExecutionError) as captured:
        asyncio.run(executor.execute(invalid, guard))

    assert not isinstance(captured.value, BatchSplitExecutionError)
    assert captured.value.error_code == "INVALID_BATCH_RANGE"


def test_evaluate_batch_rejects_invalid_shard_descriptor_without_split() -> None:
    executor, job, _, guard, client = _executor_fixture()
    invalid_payload = dict(job.payload)
    invalid_payload["shardHash"] = "b" * 64

    with pytest.raises(NonRetryableExecutionError) as captured:
        asyncio.run(executor.execute(_job(payload=invalid_payload), guard))

    assert not isinstance(captured.value, BatchSplitExecutionError)
    assert captured.value.error_code == "INVALID_SHARD_DESCRIPTOR"
    assert client.get_bodies == []


def test_evaluate_batch_does_not_wrap_shard_metadata_corruption_as_split() -> None:
    executor, job, _, guard, client = _executor_fixture()
    object_key = job.payload["shardObjectKey"]
    client.objects[object_key]["metadata"]["sha256"] = "0" * 64

    with pytest.raises(ObjectIntegrityError):
        asyncio.run(executor.execute(job, guard))


def test_evaluate_batch_missing_sample_id_is_localizable_split_error() -> None:
    events: list[str] = []
    client = FakeObjectStoreClient()
    storage = RecordingStorage(client, events)
    manifest = asyncio.run(
        storage.put_manifest(
            "project-1",
            "run-1",
            [{"sampleId": "sample-0", "text": "ok"}, {"text": "bad"}],
        )
    )
    shard = manifest.shards[0]
    executor = EvaluateBatchExecutor(
        ConfigRepository({"evaluatorType": "llm"}),
        storage,
        {"llm": RecordingAdapter(events)},
    )
    job = _job(
        batch_start=0,
        batch_end=2,
        payload={
            "shardObjectKey": shard.object_key,
            "shardHash": shard.shard_hash,
            "shardStart": 0,
            "shardEnd": 2,
        },
    )

    with pytest.raises(BatchSplitExecutionError) as captured:
        asyncio.run(executor.execute(job, RecordingGuard(events)))

    assert captured.value.error_code == "INVALID_SAMPLE_MAPPING"


def test_evaluate_batch_counts_only_succeeded_results_as_completed() -> None:
    executor, job, adapter, guard, _ = _executor_fixture()
    adapter.results = [
        {
            "sampleId": "sample-11",
            "status": "SUCCEEDED",
            "outputs": {},
            "scores": [],
            "error": None,
        },
        {
            "sampleId": "sample-12",
            "status": "FAILED",
            "outputs": {},
            "scores": [],
            "error": {"code": "BAD_OUTPUT", "message": "invalid output"},
        },
    ]

    outcome = asyncio.run(executor.execute(job, guard))

    assert outcome.completed_count == 1
    assert outcome.failed_count == 1
    assert outcome.result_summary["succeededCount"] == 1
    assert outcome.result_summary["failedCount"] == 1


def test_provider_error_bubbles_without_becoming_batch_split_error() -> None:
    executor, job, adapter, guard, _ = _executor_fixture()
    adapter.error = TimeoutError("provider included secret prompt")

    with pytest.raises(TimeoutError):
        asyncio.run(executor.execute(job, guard))


def test_missing_or_unknown_evaluator_config_is_non_retryable() -> None:
    _, job, _, guard, _ = _executor_fixture()
    storage = ManifestStorage(bucket="test-bucket", client=FakeObjectStoreClient())
    executor = EvaluateBatchExecutor(ConfigRepository(None), storage, {})

    with pytest.raises(NonRetryableExecutionError) as captured:
        asyncio.run(executor.execute(job, guard))

    assert captured.value.error_code == "RUN_CONFIG_NOT_FOUND"

    unknown = EvaluateBatchExecutor(
        ConfigRepository({"evaluatorType": "unknown"}), storage, {}
    )
    with pytest.raises(NonRetryableExecutionError) as captured:
        asyncio.run(unknown.execute(job, guard))

    assert captured.value.error_code == "EVALUATOR_ADAPTER_NOT_FOUND"
