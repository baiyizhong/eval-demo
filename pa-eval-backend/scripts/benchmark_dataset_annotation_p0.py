#!/usr/bin/env python3
"""Read-only benchmark for dataset and annotation P0 query paths."""

import argparse
import asyncio
import json
import math
import os
import statistics
import sys
from pathlib import Path
from time import perf_counter
from typing import Any, Awaitable, Callable

source_root = os.environ.get("PA_EVAL_BENCHMARK_SOURCE_ROOT")
sys.path.insert(0, source_root or str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.auth_context import CurrentUserContext, get_current_user_context  # noqa: E402
from app.config import Settings  # noqa: E402
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader  # noqa: E402
from app.main import app  # noqa: E402


def summarize(samples: list[float]) -> dict[str, float]:
    ordered = sorted(samples)
    p95_index = max(0, math.ceil(len(ordered) * 0.95) - 1)
    return {
        "medianMs": round(statistics.median(ordered), 2),
        "p95Ms": round(ordered[p95_index], 2),
        "minMs": round(ordered[0], 2),
        "maxMs": round(ordered[-1], 2),
    }


async def discover_scope(reader: LangfuseDatabaseReader) -> dict[str, Any]:
    users = await reader._fetch_all(
        "SELECT id FROM users ORDER BY admin DESC NULLS LAST, created_at LIMIT 1",
        {},
    )
    queues = await reader._fetch_all(
        """
        SELECT aqi.project_id, aqi.queue_id, COUNT(*)::int AS item_count
        FROM annotation_queue_items aqi
        GROUP BY aqi.project_id, aqi.queue_id
        ORDER BY item_count DESC
        LIMIT 1
        """,
        {},
    )
    datasets = await reader._fetch_all(
        """
        SELECT di.project_id, di.dataset_id, COUNT(*)::int AS item_count
        FROM dataset_items di
        WHERE di.valid_to IS NULL
        GROUP BY di.project_id, di.dataset_id
        ORDER BY item_count DESC
        LIMIT 1
        """,
        {},
    )
    if not users or not queues or not datasets:
        raise RuntimeError("缺少可用于基准测试的用户、人工标注队列或数据集")
    return {
        "userId": str(users[0]["id"]),
        "annotationProjectId": str(queues[0]["project_id"]),
        "queueId": str(queues[0]["queue_id"]),
        "annotationItems": int(queues[0]["item_count"]),
        "datasetProjectId": str(datasets[0]["project_id"]),
        "datasetId": str(datasets[0]["dataset_id"]),
        "datasetItems": int(datasets[0]["item_count"]),
    }


async def measure_async(
    operation: Callable[[], Awaitable[Any]], iterations: int
) -> dict[str, float]:
    samples: list[float] = []
    for _ in range(iterations):
        started_at = perf_counter()
        await operation()
        samples.append((perf_counter() - started_at) * 1000)
    return summarize(samples)


async def benchmark_dataset_scan(
    reader: LangfuseDatabaseReader,
    scope: dict[str, Any],
    iterations: int,
) -> dict[str, Any]:
    counts: list[int] = []

    async def scan() -> None:
        count = 0
        async for batch in reader.iter_dataset_items_for_export(
            scope["datasetProjectId"],
            scope["datasetId"],
            scope["userId"],
            batch_size=1000,
        ):
            count += len(batch)
        counts.append(count)

    timing = await measure_async(scan, iterations)
    return {**timing, "rowCounts": sorted(set(counts))}


def benchmark_annotation_endpoints(
    reader: LangfuseDatabaseReader,
    scope: dict[str, Any],
    iterations: int,
) -> dict[str, Any]:
    async def reader_override() -> LangfuseDatabaseReader:
        return reader

    app.dependency_overrides[get_langfuse_db_reader] = reader_override
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id=scope["userId"], email="benchmark@localhost"
    )
    client = TestClient(app)
    base = (
        f"/api/projects/{scope['annotationProjectId']}"
        f"/annotation-queues/{scope['queueId']}"
    )
    deep_page = max(1, math.ceil(scope["annotationItems"] / 10))

    def request(
        path: str, *, params: dict[str, Any] | None = None
    ) -> tuple[float, int]:
        started_at = perf_counter()
        response = client.get(path, params=params)
        elapsed = (perf_counter() - started_at) * 1000
        response.raise_for_status()
        payload = response.json()
        if payload.get("code") != 0:
            raise RuntimeError(payload.get("message") or "接口基准请求失败")
        return elapsed, len((payload.get("data") or {}).get("datas") or [])

    def post(path: str, body: dict[str, Any]) -> tuple[float, int]:
        started_at = perf_counter()
        response = client.post(path, json=body)
        elapsed = (perf_counter() - started_at) * 1000
        response.raise_for_status()
        payload = response.json()
        if payload.get("code") != 0:
            raise RuntimeError(payload.get("message") or "接口基准请求失败")
        return elapsed, int((payload.get("data") or {}).get("totalCount") or 0)

    try:
        results: dict[str, Any] = {"deepPage": deep_page}
        for name, params in (
            ("listFirstPage", {"page": 1, "pageSize": 10}),
            ("listDeepPage", {"page": deep_page, "pageSize": 10}),
        ):
            samples = [
                request(f"{base}/items", params=params)[0] for _ in range(iterations)
            ]
            results[name] = summarize(samples)
        preview_samples: list[float] = []
        preview_counts: list[int] = []
        for _ in range(iterations):
            elapsed, count = post(f"{base}/batch-preview", {"filters": {}, "limit": 5})
            preview_samples.append(elapsed)
            preview_counts.append(count)
        results["batchPreview"] = {
            **summarize(preview_samples),
            "totalCounts": sorted(set(preview_counts)),
        }
        return results
    finally:
        app.dependency_overrides.clear()


async def run(iterations: int) -> dict[str, Any]:
    reader = LangfuseDatabaseReader(Settings())
    scope = await discover_scope(reader)
    dataset = await benchmark_dataset_scan(reader, scope, iterations)
    annotation = await asyncio.to_thread(
        benchmark_annotation_endpoints, reader, scope, iterations
    )
    return {
        "scope": scope,
        "iterations": iterations,
        "datasetExportScan": dataset,
        **annotation,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--iterations", type=int, default=3)
    args = parser.parse_args()
    if args.iterations < 1:
        parser.error("--iterations must be positive")
    print(
        json.dumps(
            asyncio.run(run(args.iterations)), ensure_ascii=False, sort_keys=True
        )
    )


if __name__ == "__main__":
    main()
