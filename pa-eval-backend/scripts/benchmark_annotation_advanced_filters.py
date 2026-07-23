"""Benchmark Plus-layer work for annotation advanced filters.

The baseline models the removed behavior: fetch every trace source, merge it into
annotation items, and filter in Python. The optimized path models the retained
Plus-layer work: serialize lightweight candidates for one ClickHouse external
table request and decode only the current page returned by ClickHouse.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import statistics
import time
import tracemalloc
from collections.abc import Callable
from pathlib import Path
from typing import Any

import anyio

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings  # noqa: E402
from app.langfuse_clickhouse import (  # noqa: E402
    LangfuseClickHouseReader,
    _annotation_external_candidate_tsv,
    _annotation_external_candidate_rows,
    _annotation_item_from_clickhouse_external_row,
)


def _candidate(index: int) -> dict[str, Any]:
    return {
        "id": f"item-{index}",
        "projectId": "project-1",
        "queueId": "queue-1",
        "objectId": f"trace-{index}",
        "objectType": "TRACE",
        "status": "PENDING",
        "completedAt": "",
        "completedBy": None,
        "assignee": None,
        "scores": [],
        "createdAt": "2026-07-01T00:00:00Z",
        "updatedAt": "2026-07-02T00:00:00Z",
    }


def _baseline(rows: int, match_every: int, page_size: int) -> tuple[int, int]:
    items = [_candidate(index) for index in range(rows)]
    matched: list[dict[str, Any]] = []
    returned_source_bytes = 0
    for index, item in enumerate(items):
        source = {
            "input": {"question": f"question trace-{index}"},
            "output": {
                "answer": "target" if index % match_every == 0 else "other"
            },
            "metadata": {"channel": "web", "sequence": index},
        }
        returned_source_bytes += len(
            json.dumps(source, ensure_ascii=False, separators=(",", ":"))
        )
        enriched = {**item, "source": source}
        if source["output"]["answer"] == "target":
            matched.append(enriched)
    return len(matched), returned_source_bytes + len(matched[:page_size])


def _optimized(rows: int, match_every: int, page_size: int) -> tuple[int, int]:
    candidates = [_candidate(index) for index in range(rows)]
    external_rows = _annotation_external_candidate_rows(candidates)
    external_bytes = len(_annotation_external_candidate_tsv(external_rows))
    page_payloads = []
    for index in range(0, min(rows, page_size * match_every), match_every):
        page_payloads.append(
            {
                "id": f"item-{index}",
                "projectId": "project-1",
                "queueId": "queue-1",
                "objectId": f"trace-{index}",
                "objectType": "TRACE",
                "status": "PENDING",
                "completedAt": "",
                "completedById": "",
                "completedByName": "",
                "completedByEmail": "",
                "assigneeId": "",
                "assigneeName": "",
                "assigneeEmail": "",
                "createdAt": "2026-07-01T00:00:00Z",
                "updatedAt": "2026-07-02T00:00:00Z",
                "sourceTitle": f"trace-{index}",
                "sourceInput": json.dumps({"question": f"question trace-{index}"}),
                "sourceOutput": json.dumps({"answer": "target"}),
                "sourceMetadata": json.dumps(
                    {"channel": "web", "sequence": index}
                ),
                "traceId": f"trace-{index}",
                "observationId": "",
                "sessionId": "",
                "userId": "",
                "sourceCreatedAt": "2026-07-01T00:00:00Z",
            }
        )
    decoded = [
        _annotation_item_from_clickhouse_external_row(
            payload,
            candidate=candidates[index * match_every],
        )
        for index, payload in enumerate(page_payloads)
    ]
    assert len(decoded) == min(page_size, (rows + match_every - 1) // match_every)
    return (rows + match_every - 1) // match_every, external_bytes


def _measure(
    operation: Callable[[], tuple[int, int]],
    repeats: int,
) -> dict[str, float | int]:
    elapsed: list[float] = []
    peaks: list[int] = []
    result: tuple[int, int] = (0, 0)
    for _ in range(repeats):
        tracemalloc.start()
        started = time.perf_counter()
        result = operation()
        elapsed.append((time.perf_counter() - started) * 1000)
        _, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        peaks.append(peak)
    sorted_elapsed = sorted(elapsed)
    p95_index = min(len(sorted_elapsed) - 1, round((len(sorted_elapsed) - 1) * 0.95))
    return {
        "medianMs": round(statistics.median(elapsed), 2),
        "p95Ms": round(sorted_elapsed[p95_index], 2),
        "peakMiB": round(statistics.median(peaks) / 1024 / 1024, 2),
        "matchedTotal": result[0],
        "transferBytes": result[1],
    }


async def _measure_async(
    operation: Callable[[], Any],
    repeats: int,
) -> dict[str, float | int]:
    elapsed: list[float] = []
    peaks: list[int] = []
    total = 0
    for _ in range(repeats):
        tracemalloc.start()
        started = time.perf_counter()
        total = int(await operation())
        elapsed.append((time.perf_counter() - started) * 1000)
        _, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        peaks.append(peak)
    return {
        "medianMs": round(statistics.median(elapsed), 2),
        "p95Ms": round(max(elapsed), 2),
        "peakMiB": round(statistics.median(peaks) / 1024 / 1024, 2),
        "matchedTotal": total,
    }


async def _live_benchmark(args: argparse.Namespace) -> None:
    reader = LangfuseClickHouseReader(Settings())
    projects = await reader._query_json_each_row(
        """
        SELECT project_id AS projectId, count() AS total
        FROM traces FINAL
        WHERE is_deleted = 0
        GROUP BY project_id
        ORDER BY total DESC
        LIMIT 1
        FORMAT JSONEachRow
        """,
        {},
    )
    if not projects:
        raise RuntimeError("ClickHouse 中没有可用于基准的 Trace")
    project_id = str(projects[0]["projectId"])
    rows = await reader._query_json_each_row(
        f"""
        SELECT id AS traceId, arrayElement(mapKeys(metadata), 1) AS metadataKey
        FROM traces FINAL
        WHERE project_id = {{project_id:String}}
          AND is_deleted = 0
          AND notEmpty(mapKeys(metadata))
        LIMIT {max(1, args.rows)}
        FORMAT JSONEachRow
        """,
        {"project_id": project_id},
    )
    metadata_key = next(
        (str(row["metadataKey"]) for row in rows if row.get("metadataKey")),
        "",
    )
    if not rows or not metadata_key:
        raise RuntimeError("ClickHouse 中没有带 metadata 的 Trace")
    candidates = [
        {
            **_candidate(index),
            "projectId": project_id,
            "objectId": str(row["traceId"]),
        }
        for index, row in enumerate(rows)
    ]

    async def baseline_operation() -> int:
        sources = await reader.list_trace_sources(
            project_id,
            [str(row["traceId"]) for row in rows],
        )
        return sum(
            metadata_key
            in (sources.get(str(row["traceId"]), {}).get("metadata") or {})
            for row in rows
        )

    async def optimized_operation() -> int:
        result = await reader.list_annotation_queue_items_page(
            project_id,
            candidates,
            page=1,
            page_size=args.page_size,
            filters={
                "metadata_filters": [
                    {"key": metadata_key, "operator": "exists", "value": ""}
                ]
            },
        )
        return int(result["total"])

    baseline = await _measure_async(baseline_operation, args.repeats)
    optimized = await _measure_async(optimized_operation, args.repeats)
    print(
        json.dumps(
            {
                "mode": "live-clickhouse-source-filter-stage",
                "candidates": len(rows),
                "pageSize": args.page_size,
                "baseline": baseline,
                "optimized": optimized,
                "sameTotal": baseline["matchedTotal"]
                == optimized["matchedTotal"],
                "medianSpeedup": round(
                    float(baseline["medianMs"]) / float(optimized["medianMs"]),
                    2,
                ),
                "baselineClickHouseRequests": math.ceil(len(rows) / 500),
                "optimizedClickHouseRequests": 1,
            },
            ensure_ascii=False,
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=20_000)
    parser.add_argument("--match-every", type=int, default=20)
    parser.add_argument("--page-size", type=int, default=50)
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--live", action="store_true")
    args = parser.parse_args()
    if args.live:
        anyio.run(_live_benchmark, args)
        return
    baseline = _measure(
        lambda: _baseline(args.rows, args.match_every, args.page_size),
        args.repeats,
    )
    optimized = _measure(
        lambda: _optimized(args.rows, args.match_every, args.page_size),
        args.repeats,
    )
    print(
        json.dumps(
            {
                "rows": args.rows,
                "matchRate": 1 / args.match_every,
                "pageSize": args.page_size,
                "baseline": baseline,
                "optimized": optimized,
                "medianSpeedup": round(
                    float(baseline["medianMs"]) / float(optimized["medianMs"]),
                    2,
                ),
                "peakMemoryReduction": round(
                    1 - float(optimized["peakMiB"]) / float(baseline["peakMiB"]),
                    4,
                ),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
