import asyncio
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Mapping

import pytest

from app.evaluation_runtime.executors import (
    NonRetryableExecutionError,
    PrepareRunExecutor,
)
from app.evaluation_runtime.models import EvaluationJob, JobStatus, JobType
from app.evaluation_runtime.storage import ManifestStorage

from tests.evaluation_runtime.test_storage import FakeObjectStoreClient


def _prepare_job() -> EvaluationJob:
    now = datetime(2026, 7, 23, tzinfo=timezone.utc)
    return EvaluationJob(
        create_by="user-1",
        update_by="worker-1",
        create_date=now,
        update_date=now,
        id="prepare-job-1",
        project_id="project-1",
        task_id="task-1",
        run_id="run-1",
        parent_job_id=None,
        job_type=JobType.PREPARE_RUN,
        routing_key="shared",
        batch_start=None,
        batch_end=None,
        idempotency_key="prepare-idempotency",
        status=JobStatus.RUNNING,
        priority=0,
        attempt_count=1,
        max_attempts=5,
        next_attempt_at=now,
        lease_owner="worker-1",
        lease_expires_at=now,
        heartbeat_at=now,
        payload={},
        result_summary={},
        raw_result_object_key=None,
        error_code=None,
        error_message=None,
    )


class FakeSampleSource:
    def __init__(self, samples: list[Mapping[str, Any]]) -> None:
        self.samples = samples
        self.configs: list[Mapping[str, Any]] = []

    async def iter_samples(
        self, config_snapshot: Mapping[str, Any]
    ) -> AsyncIterator[Mapping[str, Any]]:
        self.configs.append(config_snapshot)
        for sample in self.samples:
            yield sample


class FakeRepository:
    def __init__(
        self,
        config_snapshot: Mapping[str, Any] | None,
        *,
        finalize_result: bool = True,
        events: list[str] | None = None,
    ) -> None:
        self.config_snapshot = config_snapshot
        self.finalize_result = finalize_result
        self.events = events
        self.finalize_calls: list[dict[str, Any]] = []

    async def get_run_config_snapshot(
        self, run_id: str
    ) -> Mapping[str, Any] | None:
        assert run_id == "run-1"
        return self.config_snapshot

    async def finalize_prepared_run(self, **kwargs: Any) -> bool:
        if self.events is not None:
            self.events.append("finalize")
        self.finalize_calls.append(kwargs)
        return self.finalize_result


class EventObjectStoreClient(FakeObjectStoreClient):
    def __init__(self, events: list[str]) -> None:
        super().__init__()
        self.events = events

    def put_object(self, **kwargs: Any) -> dict[str, Any]:
        self.events.append(f"put:{kwargs['Key']}")
        return super().put_object(**kwargs)


def test_prepare_run_streams_snapshot_then_finalizes_after_index_upload() -> None:
    events: list[str] = []
    source = FakeSampleSource([{"id": index} for index in range(150)])
    repository = FakeRepository(
        {"dataSource": {"type": "DATASET", "datasetId": "dataset-1"}},
        events=events,
    )
    storage = ManifestStorage(
        bucket="test-bucket", client=EventObjectStoreClient(events)
    )
    executor = PrepareRunExecutor(
        repository=repository,
        storage=storage,
        sample_source=source,
        batch_size=100,
    )

    outcome = asyncio.run(executor.execute(_prepare_job()))

    assert source.configs == [repository.config_snapshot]
    assert len(repository.finalize_calls) == 1
    finalize = repository.finalize_calls[0]
    assert finalize["run_id"] == "run-1"
    assert finalize["project_id"] == "project-1"
    assert finalize["task_id"] == "task-1"
    assert finalize["parent_job_id"] == "prepare-job-1"
    assert finalize["actor"] == "worker-1"
    assert finalize["manifest"].total_count == 150
    assert events[-1] == "finalize"
    assert events[-2].endswith("/index.json")
    assert outcome.result_summary == {
        "sampleCount": 150,
        "batchCount": 2,
        "manifestHash": finalize["manifest"].manifest_hash,
    }
    assert outcome.raw_result_object_key == finalize["manifest"].index_object_key


def test_prepare_run_upload_failure_does_not_finalize_database() -> None:
    source = FakeSampleSource([{"id": index} for index in range(150)])
    repository = FakeRepository({"dataSource": {"type": "TRACE"}})
    storage = ManifestStorage(
        bucket="test-bucket", client=FakeObjectStoreClient(fail_on_put=2)
    )
    executor = PrepareRunExecutor(repository, storage, source, batch_size=100)

    with pytest.raises(RuntimeError, match="object store unavailable"):
        asyncio.run(executor.execute(_prepare_job()))

    assert repository.finalize_calls == []


def test_prepare_run_empty_source_is_explicit_non_retryable_failure() -> None:
    source = FakeSampleSource([])
    repository = FakeRepository({"dataSource": {"type": "DATASET"}})
    client = FakeObjectStoreClient()
    executor = PrepareRunExecutor(
        repository,
        ManifestStorage(bucket="test-bucket", client=client),
        source,
    )

    with pytest.raises(NonRetryableExecutionError, match="empty") as captured:
        asyncio.run(executor.execute(_prepare_job()))

    assert captured.value.retryable is False
    assert captured.value.error_code == "EMPTY_SAMPLE_SOURCE"
    assert client.put_calls == []
    assert repository.finalize_calls == []


def test_prepare_run_rejects_missing_or_cancelled_run_without_batch_jobs() -> None:
    source = FakeSampleSource([{"id": 1}])
    missing_repository = FakeRepository(None)
    missing_executor = PrepareRunExecutor(
        missing_repository,
        ManifestStorage(bucket="test-bucket", client=FakeObjectStoreClient()),
        source,
    )

    with pytest.raises(NonRetryableExecutionError, match="run config"):
        asyncio.run(missing_executor.execute(_prepare_job()))
    assert missing_repository.finalize_calls == []

    cancelled_repository = FakeRepository(
        {"dataSource": {"type": "DATASET"}}, finalize_result=False
    )
    cancelled_executor = PrepareRunExecutor(
        cancelled_repository,
        ManifestStorage(bucket="test-bucket", client=FakeObjectStoreClient()),
        source,
    )
    with pytest.raises(NonRetryableExecutionError, match="no longer active"):
        asyncio.run(cancelled_executor.execute(_prepare_job()))
    assert len(cancelled_repository.finalize_calls) == 1


def test_prepare_run_only_accepts_prepare_jobs() -> None:
    job = _prepare_job()
    invalid_job = EvaluationJob(
        **{
            field: getattr(job, field)
            for field in job.__dataclass_fields__
            if field != "job_type"
        },
        job_type=JobType.EVALUATE_BATCH,
    )
    executor = PrepareRunExecutor(
        FakeRepository({}),
        ManifestStorage(bucket="test-bucket", client=FakeObjectStoreClient()),
        FakeSampleSource([{"id": 1}]),
    )

    with pytest.raises(ValueError, match="PREPARE_RUN"):
        asyncio.run(executor.execute(invalid_job))
