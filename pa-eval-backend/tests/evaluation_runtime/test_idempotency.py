from app.evaluation_runtime.idempotency import (
    deterministic_score_id,
    job_idempotency_key,
    stable_hash,
)
from app.evaluation_runtime.models import JobType


def test_stable_hash_ignores_mapping_order() -> None:
    assert stable_hash({"b": 2, "a": 1}) == stable_hash({"a": 1, "b": 2})


def test_stable_hash_preserves_non_ascii_values() -> None:
    assert stable_hash({"name": "评测"}) == (
        "7ae95f0a76ae5078e329574524f63e4619a849f010424d7a45856544430c6556"
    )


def test_job_idempotency_key_is_stable_for_equivalent_payloads() -> None:
    first = job_idempotency_key(
        "run-1",
        JobType.EVALUATE_BATCH,
        batch_start=0,
        batch_end=10,
        payload={"b": 2, "a": 1},
    )
    second = job_idempotency_key(
        "run-1",
        JobType.EVALUATE_BATCH,
        batch_start=0,
        batch_end=10,
        payload={"a": 1, "b": 2},
    )

    assert first == second
    assert first.startswith("pa-job-")
    assert first != job_idempotency_key(
        "run-1",
        JobType.EVALUATE_BATCH,
        batch_start=10,
        batch_end=20,
        payload={"a": 1, "b": 2},
    )


def test_score_id_is_stable_per_run_sample_and_score() -> None:
    first = deterministic_score_id("run-1", "sample-9", "relevance")
    second = deterministic_score_id("run-1", "sample-9", "relevance")

    assert first == second
    assert first.startswith("pa-score-")
    assert first != deterministic_score_id("run-2", "sample-9", "relevance")


def test_score_id_does_not_collide_when_components_contain_separator() -> None:
    assert deterministic_score_id("run:1", "sample-9", "relevance") != (
        deterministic_score_id("run", "1:sample-9", "relevance")
    )
