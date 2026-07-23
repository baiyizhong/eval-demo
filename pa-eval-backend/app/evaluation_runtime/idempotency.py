import hashlib
import json
from typing import Any, Mapping

from app.evaluation_runtime.models import JobType


def stable_hash(value: Any) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def job_idempotency_key(
    run_id: str,
    job_type: JobType | str,
    *,
    batch_start: int | None = None,
    batch_end: int | None = None,
    payload: Mapping[str, Any] | None = None,
) -> str:
    digest = stable_hash(
        {
            "run_id": run_id,
            "job_type": str(job_type),
            "batch_start": batch_start,
            "batch_end": batch_end,
            "payload": payload or {},
        }
    )
    return f"pa-job-{digest[:32]}"


def deterministic_score_id(run_id: str, sample_id: str, score_name: str) -> str:
    digest = stable_hash([run_id, sample_id, score_name])
    return f"pa-score-{digest[:32]}"
