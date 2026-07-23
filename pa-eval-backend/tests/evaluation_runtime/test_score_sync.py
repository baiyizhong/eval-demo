import asyncio
from datetime import datetime, timezone
from typing import Any, Mapping

import pytest

from app.evaluation_runtime.executors import (
    ProjectApiCredentials,
    SyncScoreBatchExecutor,
    build_score_payload,
)
from app.evaluation_runtime.idempotency import deterministic_score_id
from app.evaluation_runtime.models import EvaluationJob, JobStatus, JobType
from app.errors import LangfuseProjectCredentialsError
from app.langfuse_client import LangfuseRateLimitError


_RESULT_KEY = "results/project-1/run-1/evaluate-job-1/" + "a" * 64 + ".json.gz"


def _job(**overrides: Any) -> EvaluationJob:
    now = datetime(2026, 7, 24, tzinfo=timezone.utc)
    values: dict[str, Any] = {
        "create_by": "user-1",
        "update_by": "worker-1",
        "create_date": now,
        "update_date": now,
        "id": "sync-job-1",
        "project_id": "project-1",
        "task_id": "task-1",
        "run_id": "run-1",
        "parent_job_id": "evaluate-job-1",
        "job_type": JobType.SYNC_SCORE_BATCH,
        "routing_key": "tenant-a",
        "batch_start": 0,
        "batch_end": 100,
        "idempotency_key": "sync-idem",
        "status": JobStatus.RUNNING,
        "priority": 7,
        "attempt_count": 1,
        "max_attempts": 5,
        "next_attempt_at": now,
        "lease_owner": "worker-1",
        "lease_expires_at": now,
        "heartbeat_at": now,
        "payload": {
            "rawResultObjectKey": _RESULT_KEY,
            "resultProducerJobId": "evaluate-job-1",
        },
        "result_summary": {},
        "raw_result_object_key": None,
        "error_code": None,
        "error_message": None,
    }
    values.update(overrides)
    return EvaluationJob(**values)


class ResultStorage:
    def __init__(self, result: Mapping[str, Any]) -> None:
        self.result = result
        self.reads: list[dict[str, str]] = []

    async def read_result(
        self,
        key: str,
        *,
        project_id: str,
        run_id: str,
        producer_job_id: str,
    ) -> Mapping[str, Any]:
        self.reads.append(
            {
                "key": key,
                "projectId": project_id,
                "runId": run_id,
                "producerJobId": producer_job_id,
            }
        )
        return self.result


class CredentialProvider:
    def __init__(self, credentials: ProjectApiCredentials | None = None) -> None:
        self.credentials = credentials or ProjectApiCredentials(
            public_key="pk-project-1",
            secret_key="sk-project-1",
        )
        self.project_ids: list[str] = []

    async def get_project_credentials(
        self,
        project_id: str,
    ) -> ProjectApiCredentials | None:
        self.project_ids.append(project_id)
        return self.credentials


class RecordingGuard:
    def __init__(self) -> None:
        self.count = 0

    async def checkpoint(self) -> None:
        self.count += 1


class PartialClient:
    def __init__(self, *, fail_from: int | None = None) -> None:
        self.fail_from = fail_from
        self.calls: list[dict[str, Any]] = []
        self.active = 0
        self.max_active = 0

    async def create_score(
        self,
        public_key: str,
        secret_key: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        assert public_key == "pk-project-1"
        assert secret_key == "sk-project-1"
        call_index = len(self.calls)
        self.calls.append(payload)
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        await asyncio.sleep(0)
        self.active -= 1
        if self.fail_from is not None and call_index >= self.fail_from:
            raise TimeoutError("upstream timed out")
        return {"id": f"remote-{payload['id']}"}


def _results(count: int) -> Mapping[str, Any]:
    return {
        "results": [
            {
                "sampleId": f"sample-{index}",
                "status": "SUCCEEDED",
                "outputs": {},
                "scores": [
                    {
                        "name": "quality",
                        "value": index / 100,
                        "traceId": f"trace-{index}",
                    }
                ],
                "error": None,
            }
            for index in range(count)
        ]
    }


def test_build_score_payload_uses_deterministic_id_and_pa_metadata() -> None:
    job = _job()
    sample = {"sampleId": "sample-9"}
    score = {
        "name": "quality",
        "value": 0.75,
        "traceId": "trace-9",
        "metadata": {"safe": "value"},
    }

    payload = build_score_payload(job, sample, score)

    assert payload["id"] == deterministic_score_id(
        job.run_id, sample["sampleId"], score["name"]
    )
    assert payload["metadata"] == {
        "safe": "value",
        "paAutoEvaluationRunId": job.run_id,
        "paEvaluationJobId": "evaluate-job-1",
        "paEvaluationSampleId": sample["sampleId"],
    }
    assert payload["traceId"] == "trace-9"


def test_partial_success_followup_retries_only_unconfirmed_scores() -> None:
    client = PartialClient(fail_from=60)
    storage = ResultStorage(_results(100))
    executor = SyncScoreBatchExecutor(
        storage,
        client,
        CredentialProvider(),
        max_concurrency=8,
    )
    job = _job()

    first = asyncio.run(executor.execute(job, RecordingGuard()))

    assert client.max_active <= 8
    assert first.result_summary["confirmedCount"] == 60
    assert len(first.result_summary["confirmedScores"]) == 60
    assert first.result_summary["confirmedScores"][0] == {
        "scoreId": deterministic_score_id("run-1", "sample-0", "quality"),
        "remoteObjectId": (
            "remote-" + deterministic_score_id("run-1", "sample-0", "quality")
        ),
    }
    assert len(first.followups) == 1
    retry_spec = first.followups[0]
    assert retry_spec.job_type is JobType.SYNC_SCORE_BATCH
    assert retry_spec.payload["rawResultObjectKey"] == _RESULT_KEY
    assert retry_spec.payload["resultProducerJobId"] == "evaluate-job-1"
    assert len(retry_spec.payload["pendingScoreIds"]) == 40

    client.fail_from = None
    client.calls = []
    retry_job = _job(
        id="sync-job-2",
        parent_job_id=job.id,
        payload=retry_spec.payload,
    )
    second = asyncio.run(executor.execute(retry_job, RecordingGuard()))

    assert len(client.calls) == 40
    assert {call["id"] for call in client.calls} == set(
        retry_spec.payload["pendingScoreIds"]
    )
    assert second.result_summary["confirmedCount"] == 40
    assert second.followups == ()


def test_duplicate_score_is_confirmed_with_remote_object_id() -> None:
    class DuplicateClient:
        async def create_score(
            self,
            public_key: str,
            secret_key: str,
            payload: dict[str, Any],
        ) -> dict[str, Any]:
            return {"id": "remote-existing-score", "duplicate": True}

    outcome = asyncio.run(
        SyncScoreBatchExecutor(
            ResultStorage(_results(1)),
            DuplicateClient(),
            CredentialProvider(),
        ).execute(_job(batch_end=1), RecordingGuard())
    )

    assert outcome.result_summary["confirmedScores"] == [
        {
            "scoreId": deterministic_score_id("run-1", "sample-0", "quality"),
            "remoteObjectId": "remote-existing-score",
        }
    ]


def test_rate_limit_waits_retry_after_before_retrying() -> None:
    sleeps: list[float] = []

    class RateLimitedClient:
        def __init__(self) -> None:
            self.calls = 0

        async def create_score(
            self,
            public_key: str,
            secret_key: str,
            payload: dict[str, Any],
        ) -> dict[str, Any]:
            self.calls += 1
            if self.calls == 1:
                raise LangfuseRateLimitError(retry_after_seconds=2.5)
            return {"id": payload["id"]}

    async def fake_sleep(delay: float) -> None:
        sleeps.append(delay)

    client = RateLimitedClient()
    outcome = asyncio.run(
        SyncScoreBatchExecutor(
            ResultStorage(_results(1)),
            client,
            CredentialProvider(),
            sleep=fake_sleep,
        ).execute(_job(batch_end=1), RecordingGuard())
    )

    assert client.calls == 2
    assert sleeps == [2.5]
    assert outcome.result_summary["confirmedCount"] == 1


def test_consecutive_rate_limits_use_latest_delay_and_stop_at_bound() -> None:
    sleeps: list[float] = []

    class RateLimitedClient:
        def __init__(self) -> None:
            self.calls = 0

        async def create_score(
            self,
            public_key: str,
            secret_key: str,
            payload: dict[str, Any],
        ) -> dict[str, Any]:
            self.calls += 1
            raise LangfuseRateLimitError(
                retry_after_seconds=float(self.calls)
            )

    async def fake_sleep(delay: float) -> None:
        sleeps.append(delay)

    client = RateLimitedClient()
    executor = SyncScoreBatchExecutor(
        ResultStorage(_results(1)),
        client,
        CredentialProvider(),
        max_rate_limit_retries=2,
        sleep=fake_sleep,
    )

    with pytest.raises(LangfuseRateLimitError):
        asyncio.run(executor.execute(_job(batch_end=1), RecordingGuard()))

    assert client.calls == 3
    assert sleeps == [1.0, 2.0]


def test_missing_credentials_fail_without_calling_langfuse() -> None:
    client = PartialClient()
    provider = CredentialProvider()
    provider.credentials = None
    executor = SyncScoreBatchExecutor(
        ResultStorage(_results(1)),
        client,
        provider,
    )

    with pytest.raises(LangfuseProjectCredentialsError):
        asyncio.run(executor.execute(_job(batch_end=1), RecordingGuard()))

    assert client.calls == []


def test_credentials_are_never_persisted_in_outcome_or_followup() -> None:
    outcome = asyncio.run(
        SyncScoreBatchExecutor(
            ResultStorage(_results(2)),
            PartialClient(fail_from=1),
            CredentialProvider(),
        ).execute(_job(batch_end=2), RecordingGuard())
    )

    persisted = repr((outcome.result_summary, outcome.followups))
    assert "pk-project-1" not in persisted
    assert "sk-project-1" not in persisted


def test_multi_level_pending_followups_keep_original_result_producer() -> None:
    storage = ResultStorage(_results(3))
    client = PartialClient(fail_from=1)
    executor = SyncScoreBatchExecutor(
        storage,
        client,
        CredentialProvider(),
    )

    first = asyncio.run(executor.execute(_job(batch_end=3), RecordingGuard()))
    client.calls = []
    second = asyncio.run(
        executor.execute(
            _job(
                id="sync-job-2",
                parent_job_id="sync-job-1",
                batch_end=3,
                payload=first.followups[0].payload,
            ),
            RecordingGuard(),
        )
    )

    assert second.followups[0].payload["resultProducerJobId"] == (
        "evaluate-job-1"
    )
    assert {read["producerJobId"] for read in storage.reads} == {
        "evaluate-job-1"
    }


def test_sync_source_has_no_direct_langfuse_database_writer() -> None:
    from pathlib import Path

    source = Path("app/evaluation_runtime/executors.py").read_text()
    forbidden = (
        "ClickHouse",
        "clickhouse",
        "score_writer",
        "auto_evaluations",
        "INSERT INTO scores",
        "UPDATE scores",
    )

    assert all(token not in source for token in forbidden)


def test_sync_rejects_wrong_job_type() -> None:
    executor = SyncScoreBatchExecutor(
        ResultStorage(_results(1)),
        PartialClient(),
        CredentialProvider(),
    )

    with pytest.raises(ValueError, match="SYNC_SCORE_BATCH"):
        asyncio.run(
            executor.execute(
                _job(job_type=JobType.EVALUATE_BATCH),
                RecordingGuard(),
            )
        )
