import json
from datetime import datetime, timedelta
from typing import Any

import httpx
from fastapi import Depends

from app.config import Settings, get_settings
from app.errors import BusinessError, LangfuseUpstreamError


class LangfuseClickHouseReader:
    def __init__(self, settings: Settings) -> None:
        self._url = settings.langfuse_clickhouse_url
        self._user = settings.langfuse_clickhouse_user
        self._password = settings.langfuse_clickhouse_password
        self._timeout = settings.pa_eval_api_timeout

    async def list_traces(
        self,
        project_id: str,
        *,
        page: int,
        page_size: int,
        keyword: str | None = None,
        statuses: list[str] | None = None,
        environments: list[str] | None = None,
        session_id: str | None = None,
        user_id: str | None = None,
        latency_min: int | None = None,
        latency_max: int | None = None,
        metadata_key: str | None = None,
        metadata_value: str | None = None,
        metadata_filters: list[dict[str, Any]] | None = None,
        created_at_range: list[str] | None = None,
        time_range: str | None = None,
    ) -> dict[str, Any]:
        start_time, end_time = _resolve_time_window(
            time_range=time_range,
            created_at_range=created_at_range,
        )
        rows = await self._fetch_trace_rows(
            project_id,
            start_time=start_time,
            end_time=end_time,
            environments=_normalize_environments(environments),
        )
        filtered = [
            row
            for row in rows
            if _matches_trace(
                row,
                keyword=keyword,
                statuses=statuses,
                environments=environments,
                session_id=session_id,
                user_id=user_id,
                latency_min=latency_min,
                latency_max=latency_max,
                metadata_key=metadata_key,
                metadata_value=metadata_value,
                metadata_filters=metadata_filters,
            )
        ]
        start = (page - 1) * page_size
        return {
            "total": len(filtered),
            "datas": [self._to_trace_row(row) for row in filtered[start : start + page_size]],
        }

    async def get_trace_metrics(
        self,
        project_id: str,
        *,
        time_range: str = "24h",
        environment: str = "all",
    ) -> dict[str, Any]:
        start_time, end_time = _resolve_time_window(time_range=time_range)
        rows = await self._fetch_trace_rows(
            project_id,
            start_time=start_time,
            end_time=end_time,
            environments=_normalize_environments([environment]),
        )
        latencies = sorted(max(0, int(row.get("latency") or 0)) for row in rows)
        failed = sum(1 for row in rows if row.get("status") == "failed")
        success = sum(1 for row in rows if row.get("status") == "success")
        total = len(rows)
        p95_index = max(0, int(total * 0.95 + 0.9999) - 1)

        return {
            "summary": {
                "total": total,
                "success": success,
                "failed": failed,
                "failureRate": failed / total if total else 0,
                "averageLatency": round(sum(latencies) / total) if total else 0,
                "p95Latency": latencies[p95_index] if latencies else 0,
                "totalChangeRate": 0,
            },
            "traceTrend": _build_trace_trend(rows),
            "latencyTrend": _build_latency_trend(rows),
            "environmentDistribution": _build_environment_distribution(rows),
            "slowTraces": [
                self._to_trace_row(row)
                for row in sorted(rows, key=lambda item: item.get("latency") or 0, reverse=True)[:5]
            ],
        }

    async def get_trace(self, project_id: str, trace_id: str) -> dict[str, Any]:
        trace_rows = await self._query_json_each_row(
            """
            SELECT
                id AS traceId,
                project_id AS projectId,
                name,
                environment,
                user_id AS userId,
                session_id AS sessionId,
                timestamp AS createdAt,
                updated_at AS updatedAt,
                input,
                output,
                metadata,
                tags
            FROM traces
            WHERE project_id = {project_id:String}
              AND id = {trace_id:String}
              AND is_deleted = 0
            LIMIT 1
            FORMAT JSONEachRow
            """,
            {"project_id": project_id, "trace_id": trace_id},
        )
        if not trace_rows:
            raise BusinessError(
                code=4004,
                message="Trace 不存在或无访问权限",
                status_code=404,
            )

        observations = await self._query_json_each_row(
            """
            SELECT
                id,
                parent_observation_id AS parentObservationId,
                type,
                name,
                level,
                start_time AS startTime,
                end_time AS endTime,
                input,
                output,
                usage_details AS usageDetails,
                provided_usage_details AS providedUsageDetails,
                total_cost AS totalCost
            FROM observations
            WHERE project_id = {project_id:String}
              AND trace_id = {trace_id:String}
              AND is_deleted = 0
            ORDER BY start_time ASC, id ASC
            FORMAT JSONEachRow
            """,
            {"project_id": project_id, "trace_id": trace_id},
        )

        trace = trace_rows[0]
        row = {
            **trace,
            "status": _trace_status_from_metadata(trace.get("metadata") or {}, False),
            "latency": _latency_from_observations(trace, observations),
        }
        return {
            **self._to_trace_row(row),
            "updatedAt": _format_clickhouse_datetime(trace.get("updatedAt")),
            "input": _format_payload(trace.get("input")),
            "output": _format_payload(trace.get("output")),
            "metadata": trace.get("metadata") or {},
            "callChain": _build_call_chain(observations),
        }

    async def _fetch_trace_rows(
        self,
        project_id: str,
        *,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        environments: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        filters = ["t.project_id = {project_id:String}", "t.is_deleted = 0"]
        params: dict[str, Any] = {"project_id": project_id}
        if start_time is not None:
            filters.append("t.timestamp >= {start_time:DateTime64(3)}")
            params["start_time"] = start_time
        if end_time is not None:
            filters.append("t.timestamp < {end_time:DateTime64(3)}")
            params["end_time"] = end_time
        normalized_environments = _normalize_environments(environments)
        if normalized_environments:
            environment_placeholders = []
            for index, environment in enumerate(normalized_environments):
                param_key = f"environment_{index}"
                environment_placeholders.append(f"{{{param_key}:String}}")
                params[param_key] = environment
            filters.append(f"t.environment IN ({', '.join(environment_placeholders)})")

        where_clause = "\n              AND ".join(filters)
        query = """
            WITH observation_summary AS (
                SELECT
                    project_id,
                    trace_id,
                    max(end_time) AS lastEndTime,
                    max(if(level IN ('ERROR', 'WARNING'), 1, 0)) AS hasIssue
                FROM observations
                WHERE project_id = {project_id:String}
                  AND is_deleted = 0
                GROUP BY project_id, trace_id
            )
            SELECT
                t.id AS traceId,
                t.project_id AS projectId,
                t.name AS name,
                t.environment AS environment,
                t.user_id AS userId,
                t.session_id AS sessionId,
                t.timestamp AS createdAt,
                t.updated_at AS updatedAt,
                t.metadata AS metadata,
                t.tags AS tags,
                if(
                    lower(t.metadata['status']) IN ('failed', 'error')
                    OR observation_summary.hasIssue = 1,
                    'failed',
                    if(lower(t.metadata['status']) IN ('running', 'pending'), 'running', 'success')
                ) AS status,
                greatest(
                    0,
                    toUnixTimestamp64Milli(coalesce(observation_summary.lastEndTime, t.updated_at))
                    - toUnixTimestamp64Milli(t.timestamp)
                ) AS latency
            FROM traces t
            LEFT JOIN observation_summary
              ON observation_summary.project_id = t.project_id
             AND observation_summary.trace_id = t.id
            WHERE __WHERE_CLAUSE__
            ORDER BY t.timestamp DESC, t.id DESC
            FORMAT JSONEachRow
            """.replace("__WHERE_CLAUSE__", where_clause)
        return await self._query_json_each_row(query, params)

    async def _query_json_each_row(
        self,
        query: str,
        params: dict[str, Any],
    ) -> list[dict[str, Any]]:
        request_params = {
            "user": self._user,
            "password": self._password,
            **{f"param_{key}": value for key, value in params.items()},
        }
        try:
            async with httpx.AsyncClient(
                timeout=self._timeout,
                trust_env=False,
            ) as client:
                response = await client.post(
                    self._url,
                    params=request_params,
                    content=query,
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise LangfuseUpstreamError("Langfuse ClickHouse 查询失败") from exc

        lines = [line for line in response.text.splitlines() if line.strip()]
        return [json.loads(line) for line in lines]

    @staticmethod
    def _to_trace_row(row: dict[str, Any]) -> dict[str, Any]:
        metadata = row.get("metadata") or {}
        business_id = ""
        if isinstance(metadata, dict):
            business_id = (
                metadata.get("businessId")
                or metadata.get("business_id")
                or metadata.get("app_id")
                or ""
            )

        return {
            "traceId": row["traceId"],
            "sessionId": row.get("sessionId") or "",
            "projectId": row["projectId"],
            "projectName": "",
            "environment": row.get("environment") or "default",
            "status": row.get("status") or "unknown",
            "latency": max(0, int(row.get("latency") or 0)),
            "createdAt": _format_clickhouse_datetime(row.get("createdAt")),
            "userId": row.get("userId") or "",
            "businessId": str(business_id),
            "tags": row.get("tags") or [],
        }


def _matches_trace(
    row: dict[str, Any],
    *,
    keyword: str | None,
    statuses: list[str] | None,
    environments: list[str] | None,
    session_id: str | None,
    user_id: str | None,
    latency_min: int | None,
    latency_max: int | None,
    metadata_key: str | None,
    metadata_value: str | None,
    metadata_filters: list[dict[str, Any]] | None = None,
) -> bool:
    metadata = row.get("metadata") or {}
    needle = (keyword or "").strip().lower()
    if needle and needle not in row["traceId"].lower() and needle not in (row.get("sessionId") or "").lower():
        return False
    if statuses and row.get("status") not in statuses:
        return False
    if environments and row.get("environment") not in environments:
        return False
    if session_id and session_id not in (row.get("sessionId") or ""):
        return False
    if user_id and user_id not in (row.get("userId") or ""):
        return False
    latency = int(row.get("latency") or 0)
    if latency_min is not None and latency < latency_min:
        return False
    if latency_max is not None and latency > latency_max:
        return False
    if metadata_key:
        if not isinstance(metadata, dict) or metadata_key not in metadata:
            return False
        if metadata_value and metadata_value not in str(metadata.get(metadata_key) or ""):
            return False
    for metadata_filter in metadata_filters or []:
        key = str(metadata_filter.get("key") or "")
        operator = str(metadata_filter.get("operator") or "contains")
        value = str(metadata_filter.get("value") or "")
        if not isinstance(metadata, dict) or key not in metadata:
            return False
        actual = str(metadata.get(key) or "")
        if operator == "equals" and actual != value:
            return False
        if operator == "contains" and value not in actual:
            return False
    return True


def _normalize_environments(environments: list[str] | None) -> list[str] | None:
    values = [
        value.strip()
        for value in environments or []
        if value and value.strip() and value.strip() != "all"
    ]
    return values or None


def _resolve_time_window(
    *,
    time_range: str | None = None,
    created_at_range: list[str] | None = None,
) -> tuple[datetime | None, datetime | None]:
    if created_at_range:
        start_time = _parse_filter_datetime(created_at_range[0], range_side="start")
        end_time = (
            _parse_filter_datetime(created_at_range[1], range_side="end")
            if len(created_at_range) > 1
            else None
        )
        return start_time, end_time

    if not time_range:
        return None, None

    durations = {
        "24h": timedelta(hours=24),
        "7d": timedelta(days=7),
        "30d": timedelta(days=30),
    }
    duration = durations.get(time_range)
    if duration is None:
        return None, None
    return datetime.utcnow() - duration, None


def _parse_filter_datetime(
    value: str | None,
    *,
    range_side: str,
) -> datetime | None:
    if not value:
        return None

    normalized = value.strip().replace("T", " ").replace("Z", "")
    if not normalized:
        return None
    if len(normalized) == 10:
        normalized = (
            f"{normalized} 00:00:00"
            if range_side == "start"
            else f"{normalized} 23:59:59.999"
        )
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _trace_status_from_metadata(metadata: dict[str, Any], has_issue: bool) -> str:
    status = str(metadata.get("status") or "").lower()
    if status in {"failed", "error"} or has_issue:
        return "failed"
    if status in {"running", "pending"}:
        return "running"
    if status in {"", "succeeded", "success"}:
        return "success"
    return "unknown"


def _latency_from_observations(
    trace: dict[str, Any],
    observations: list[dict[str, Any]],
) -> int:
    starts = [_parse_clickhouse_datetime(trace.get("createdAt"))]
    ends = [_parse_clickhouse_datetime(trace.get("updatedAt"))]
    for observation in observations:
        starts.append(_parse_clickhouse_datetime(observation.get("startTime")))
        ends.append(_parse_clickhouse_datetime(observation.get("endTime")))

    valid_starts = [value for value in starts if value is not None]
    valid_ends = [value for value in ends if value is not None]
    if not valid_starts or not valid_ends:
        return 0
    return max(0, round((max(valid_ends) - min(valid_starts)).total_seconds() * 1000))


def _build_call_chain(observations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    nodes_by_id: dict[str, dict[str, Any]] = {}
    roots: list[dict[str, Any]] = []

    for observation in observations:
        usage = observation.get("usageDetails") or observation.get("providedUsageDetails") or {}
        start = _parse_clickhouse_datetime(observation.get("startTime"))
        end = _parse_clickhouse_datetime(observation.get("endTime"))
        duration = ""
        if start and end:
            duration = f"{max(0, round((end - start).total_seconds() * 1000))}ms"
        node = {
            "id": observation["id"],
            "type": _to_chain_node_type(observation.get("type"), observation.get("name")),
            "title": observation.get("name") or observation.get("type") or "Observation",
            "duration": duration,
            "tokensIn": int(usage.get("input") or usage.get("prompt_tokens") or 0),
            "tokensOut": int(usage.get("output") or usage.get("completion_tokens") or 0),
            "tokensTotal": int(usage.get("total") or usage.get("total_tokens") or 0),
            "tags": [observation.get("level") or "DEFAULT"],
            "children": [],
        }
        nodes_by_id[node["id"]] = node

    for observation in observations:
        node = nodes_by_id[observation["id"]]
        parent_id = observation.get("parentObservationId")
        if parent_id and parent_id in nodes_by_id:
            nodes_by_id[parent_id]["children"].append(node)
        else:
            roots.append(node)

    return roots


def _to_chain_node_type(raw_type: str | None, name: str | None) -> str:
    value = (raw_type or "").lower()
    title = (name or "").lower()
    if value == "generation":
        return "llm"
    if "parse" in title:
        return "parser"
    if "judge" in title or "eval" in title:
        return "eval"
    return value or "chain"


def _build_trace_trend(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = _bucket_hour(row.get("createdAt"))
        bucket = buckets.setdefault(key, {"time": key, "total": 0, "failed": 0})
        bucket["total"] += 1
        if row.get("status") == "failed":
            bucket["failed"] += 1
    return [buckets[key] for key in sorted(buckets)]


def _build_latency_trend(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, list[int]] = {}
    for row in rows:
        buckets.setdefault(_bucket_hour(row.get("createdAt")), []).append(
            max(0, int(row.get("latency") or 0))
        )
    points = []
    for key in sorted(buckets):
        latencies = sorted(buckets[key])
        p95_index = max(0, int(len(latencies) * 0.95 + 0.9999) - 1)
        points.append(
            {
                "time": key,
                "averageLatency": round(sum(latencies) / len(latencies)),
                "p95Latency": latencies[p95_index],
            }
        )
    return points


def _build_environment_distribution(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for row in rows:
        env = row.get("environment") or "default"
        counts[env] = counts.get(env, 0) + 1
    return [{"environment": key, "count": counts[key]} for key in sorted(counts)]


def _bucket_hour(value: Any) -> str:
    parsed = _parse_clickhouse_datetime(value)
    if not parsed:
        return "unknown"
    return parsed.strftime("%m-%d %H:00")


def _format_payload(value: Any) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, indent=2)
    try:
        return json.dumps(json.loads(value), ensure_ascii=False, indent=2)
    except json.JSONDecodeError:
        return value


def _format_clickhouse_datetime(value: Any) -> str:
    parsed = _parse_clickhouse_datetime(value)
    if not parsed:
        return str(value or "")
    return f"{parsed.isoformat(timespec='milliseconds')}Z"


def _parse_clickhouse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str) or not value:
        return None
    normalized = value.replace("T", " ").replace("Z", "")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


async def get_langfuse_clickhouse_reader(
    settings: Settings = Depends(get_settings),
) -> LangfuseClickHouseReader:
    return LangfuseClickHouseReader(settings)
