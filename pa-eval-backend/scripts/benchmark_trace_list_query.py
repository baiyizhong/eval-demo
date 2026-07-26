#!/usr/bin/env python3
import argparse
import json
import math
import os
import statistics
import sys
from pathlib import Path
from time import perf_counter
from typing import Any

source_root = os.environ.get("PA_EVAL_BENCHMARK_SOURCE_ROOT")
sys.path.insert(0, source_root or str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.auth_context import CurrentUserContext, get_current_user_context  # noqa: E402
from app.config import Settings  # noqa: E402
from app.langfuse_clickhouse import (  # noqa: E402
    LangfuseClickHouseReader,
    get_langfuse_clickhouse_reader,
)
from app.langfuse_db import (  # noqa: E402
    LangfuseDatabaseReader,
    get_langfuse_db_reader,
)
from app.main import app  # noqa: E402


class _VisibleProjectReader:
    async def get_project_for_user(self, project_id: str, _user_id: str) -> dict:
        return {"id": project_id, "name": "Trace benchmark"}


def summarize(samples_ms: list[float]) -> dict[str, float]:
    ordered = sorted(samples_ms)
    p95_index = max(0, math.ceil(len(ordered) * 0.95) - 1)
    return {
        "minMs": round(ordered[0], 3),
        "medianMs": round(statistics.median(ordered), 3),
        "p95Ms": round(ordered[p95_index], 3),
        "maxMs": round(ordered[-1], 3),
    }


def _clear_count_cache(reader: LangfuseClickHouseReader) -> bool:
    cache = getattr(reader, "_trace_count_cache", None)
    if cache is None:
        return False
    cache.clear()
    return True


def run_benchmark(
    *,
    project_id: str,
    iterations: int,
    page_size: int,
    time_range: str,
) -> dict[str, Any]:
    reader = LangfuseClickHouseReader(Settings())
    fake_db = _VisibleProjectReader()

    async def db_override() -> LangfuseDatabaseReader:
        return fake_db  # type: ignore[return-value]

    async def trace_override() -> LangfuseClickHouseReader:
        return reader

    app.dependency_overrides[get_langfuse_db_reader] = db_override
    app.dependency_overrides[get_langfuse_clickhouse_reader] = trace_override
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id="benchmark-user",
        email="benchmark@localhost",
    )
    client = TestClient(app)
    params = {
        "page": 1,
        "pageSize": page_size,
        "timeRange": time_range,
        "fields": "io,metadata",
    }

    def request_once() -> tuple[float, int, int]:
        started_at = perf_counter()
        response = client.get(f"/api/projects/{project_id}/traces", params=params)
        elapsed_ms = (perf_counter() - started_at) * 1000
        response.raise_for_status()
        payload = response.json()
        if payload.get("code") != 0:
            raise RuntimeError(f"Trace API returned error: {payload.get('message')}")
        data = payload.get("data") or {}
        return elapsed_ms, int(data.get("total") or 0), len(data.get("datas") or [])

    try:
        cold_samples: list[float] = []
        totals: set[int] = set()
        row_counts: set[int] = set()
        cache_supported = _clear_count_cache(reader)
        for _ in range(iterations):
            _clear_count_cache(reader)
            elapsed_ms, total, rows = request_once()
            cold_samples.append(elapsed_ms)
            totals.add(total)
            row_counts.add(rows)

        _clear_count_cache(reader)
        request_once()
        warm_samples: list[float] = []
        for _ in range(iterations):
            elapsed_ms, total, rows = request_once()
            warm_samples.append(elapsed_ms)
            totals.add(total)
            row_counts.add(rows)
    finally:
        app.dependency_overrides.clear()

    return {
        "projectId": project_id,
        "iterations": iterations,
        "pageSize": page_size,
        "timeRange": time_range,
        "countCacheSupported": cache_supported,
        "totals": sorted(totals),
        "rowCounts": sorted(row_counts),
        "cold": summarize(cold_samples),
        "warm": summarize(warm_samples),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Benchmark the Trace list FastAPI endpoint against ClickHouse."
    )
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--iterations", type=int, default=5)
    parser.add_argument("--page-size", type=int, default=10)
    parser.add_argument("--time-range", default="14d")
    args = parser.parse_args()
    if args.iterations < 1:
        parser.error("--iterations must be greater than zero")
    print(
        json.dumps(
            run_benchmark(
                project_id=args.project_id,
                iterations=args.iterations,
                page_size=args.page_size,
                time_range=args.time_range,
            ),
            ensure_ascii=False,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
