"""Langfuse Public API adapter for the existing PA observability contract."""

from datetime import UTC, datetime, timedelta
import json
from typing import Any, Protocol


class _ProjectClientProvider(Protocol):
    async def project_public_client_for_user(
        self,
        project_id: str,
        user_id: str,
    ) -> Any: ...


class LangfuseObservabilityAdapter:
    def __init__(self, project_clients: _ProjectClientProvider) -> None:
        self._project_clients = project_clients

    async def list_traces(
        self,
        project_id: str,
        user_id: str,
        *,
        page: int,
        page_size: int,
        keyword: str | None = None,
        statuses: list[str] | None = None,
        environments: list[str] | None = None,
        tags: list[str] | None = None,
        session_id: str | None = None,
        anchor_trace_id: str | None = None,
        cursor_created_at: str | None = None,
        cursor_trace_id: str | None = None,
        user_id_filter: str | None = None,
        business_id: str | None = None,
        latency_min: int | None = None,
        latency_max: int | None = None,
        metadata_key: str | None = None,
        metadata_value: str | None = None,
        metadata_filters: list[dict[str, Any]] | None = None,
        input_filters: list[dict[str, Any]] | None = None,
        output_filters: list[dict[str, Any]] | None = None,
        categorical_score_filters: list[dict[str, Any]] | None = None,
        numeric_score_filters: list[dict[str, Any]] | None = None,
        score_queue_id: str | None = None,
        fields: str | None = None,
        created_at_range: list[str] | None = None,
        time_range: str | None = None,
        **_unsupported_filters: Any,
    ) -> dict[str, Any]:
        public_filter = _build_trace_filter(
            keyword=keyword,
            statuses=statuses,
            environments=environments,
            tags=tags,
            session_id=session_id,
            user_id=user_id_filter,
            business_id=business_id,
            latency_min=latency_min,
            latency_max=latency_max,
            metadata_key=metadata_key,
            metadata_value=metadata_value,
            metadata_filters=metadata_filters,
            created_at_range=created_at_range,
            time_range=time_range,
        )
        client = await self._project_clients.project_public_client_for_user(
            project_id,
            user_id,
        )
        async with client:
            if anchor_trace_id:
                anchor = await client.get_trace(anchor_trace_id, fields="core")
                anchor_timestamp = str(
                    anchor.get("timestamp") or anchor.get("createdAt") or ""
                )
                if anchor_timestamp:
                    public_filter.append(_datetime_filter("<=", anchor_timestamp))
            elif cursor_created_at:
                public_filter.append(_datetime_filter("<", cursor_created_at))
            candidate_sets: list[set[str]] = []
            if input_filters or output_filters:
                candidate_sets.append(
                    await _matching_io_trace_ids(
                        client,
                        input_filters=input_filters,
                        output_filters=output_filters,
                    )
                )
            if categorical_score_filters or numeric_score_filters or score_queue_id:
                candidate_sets.append(
                    await _matching_score_trace_ids(
                        client,
                        categorical_filters=categorical_score_filters,
                        numeric_filters=numeric_score_filters,
                        queue_id=score_queue_id,
                    )
                )
            if candidate_sets:
                candidate_ids = set.intersection(*candidate_sets)
                if not candidate_ids:
                    return {"total": 0, "datas": []}
                public_filter.append(
                    {
                        "type": "stringOptions",
                        "column": "id",
                        "operator": "any of",
                        "value": sorted(candidate_ids),
                    }
                )
            response = await client.list_traces(
                page=page,
                limit=page_size,
                fields=fields or "core,io,scores,observations,metrics",
                filter=public_filter or None,
            )
        data = response.get("data") or []
        meta = response.get("meta") if isinstance(response.get("meta"), dict) else {}
        return {
            "total": int(meta.get("totalItems") or meta.get("total") or len(data)),
            "datas": [
                _to_pa_trace(item, project_id=project_id)
                for item in data
                if isinstance(item, dict)
            ],
        }

    async def get_trace(
        self,
        project_id: str,
        user_id: str,
        trace_id: str,
    ) -> dict[str, Any]:
        raw = await self._get_public_trace(project_id, user_id, trace_id)
        trace = _to_pa_trace(raw, project_id=project_id)
        trace.update(
            {
                "updatedAt": str(
                    raw.get("updatedAt")
                    or raw.get("timestamp")
                    or raw.get("createdAt")
                    or ""
                ),
                "input": _format_payload(raw.get("input")),
                "output": _format_payload(raw.get("output")),
                "metadata": raw.get("metadata") or {},
                "callChain": [
                    _to_pa_observation(
                        observation,
                        project_id=project_id,
                        trace_id=trace_id,
                        scores=raw.get("scores") or [],
                    )
                    for observation in raw.get("observations") or []
                    if isinstance(observation, dict)
                ],
            }
        )
        return trace

    async def get_trace_metrics(
        self,
        project_id: str,
        user_id: str,
        *,
        time_range: str,
        environment: str,
    ) -> dict[str, Any]:
        days = int(time_range.removesuffix("d"))
        to_timestamp = datetime.now(UTC)
        from_timestamp = to_timestamp - timedelta(days=days)
        base_query: dict[str, Any] = {
            "view": "observations",
            "filters": [],
            "fromTimestamp": from_timestamp.isoformat(),
            "toTimestamp": to_timestamp.isoformat(),
        }
        if environment != "all":
            base_query["filters"] = [
                {
                    "type": "stringOptions",
                    "column": "environment",
                    "operator": "any of",
                    "value": [environment],
                }
            ]
        client = await self._project_clients.project_public_client_for_user(
            project_id,
            user_id,
        )
        async with client:
            summary_response = await client.query_metrics(
                {
                    **base_query,
                    "dimensions": [],
                    "metrics": [
                        {"measure": "count", "aggregation": "count"},
                        {"measure": "latency", "aggregation": "avg"},
                        {"measure": "latency", "aggregation": "p95"},
                    ],
                }
            )
            level_response = await client.query_metrics(
                {
                    **base_query,
                    "dimensions": [{"field": "level"}],
                    "metrics": [{"measure": "count", "aggregation": "count"}],
                }
            )
            trend_response = await client.query_metrics(
                {
                    **base_query,
                    "dimensions": [],
                    "metrics": [
                        {"measure": "count", "aggregation": "count"},
                        {"measure": "latency", "aggregation": "avg"},
                        {"measure": "latency", "aggregation": "p95"},
                    ],
                    "timeDimension": {"granularity": "hour"},
                }
            )
            environment_response = await client.query_metrics(
                {
                    **base_query,
                    "dimensions": [{"field": "environment"}],
                    "metrics": [{"measure": "count", "aggregation": "count"}],
                }
            )
        summary_row = _first_metric_row(summary_response)
        total = _metric_int(summary_row, "count_count")
        level_rows = _metric_rows(level_response)
        failed = sum(
            _metric_int(row, "count_count")
            for row in level_rows
            if str(row.get("level") or "").upper() == "ERROR"
        )
        success = max(0, total - failed)
        trend_rows = _metric_rows(trend_response)
        return {
            "summary": {
                "total": total,
                "success": success,
                "failed": failed,
                "failureRate": failed / total if total else 0,
                "averageLatency": _metric_int(summary_row, "avg_latency"),
                "p95Latency": _metric_int(summary_row, "p95_latency"),
                "totalChangeRate": 0,
            },
            "traceTrend": [
                {
                    "time": str(row.get("time_dimension") or ""),
                    "total": _metric_int(row, "count_count"),
                    "failed": 0,
                }
                for row in trend_rows
            ],
            "latencyTrend": [
                {
                    "time": str(row.get("time_dimension") or ""),
                    "averageLatency": _metric_int(row, "avg_latency"),
                    "p95Latency": _metric_int(row, "p95_latency"),
                }
                for row in trend_rows
            ],
            "environmentDistribution": [
                {
                    "environment": str(row.get("environment") or "default"),
                    "count": _metric_int(row, "count_count"),
                }
                for row in _metric_rows(environment_response)
            ],
            "slowTraces": [],
        }

    async def get_observation(
        self,
        project_id: str,
        user_id: str,
        trace_id: str,
        observation_id: str,
    ) -> dict[str, Any]:
        raw = await self._get_public_trace(project_id, user_id, trace_id)
        for observation in raw.get("observations") or []:
            if isinstance(observation, dict) and observation.get("id") == observation_id:
                return _to_pa_observation(
                    observation,
                    project_id=project_id,
                    trace_id=trace_id,
                    scores=raw.get("scores") or [],
                )
        from app.errors import BusinessError

        raise BusinessError(1010, "Observation 不存在或无访问权限", 404)

    async def patch_trace(
        self,
        project_id: str,
        user_id: str,
        trace_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        raw = await self._get_public_trace(project_id, user_id, trace_id)
        patch_payload = {
            "id": trace_id,
            "timestamp": str(
                raw.get("timestamp") or raw.get("createdAt") or datetime.now(UTC).isoformat()
            ),
            "name": raw.get("name"),
            "externalId": raw.get("externalId"),
            "input": payload.get("input") or "",
            "output": payload.get("output") or "",
            "sessionId": raw.get("sessionId"),
            "userId": raw.get("userId"),
            "environment": raw.get("environment") or "default",
            "metadata": payload.get("metadata") or {},
            "release": raw.get("release"),
            "version": raw.get("version"),
            "public": raw.get("public"),
            "tags": raw.get("tags") or [],
        }
        client = await self._project_clients.project_public_client_for_user(
            project_id,
            user_id,
        )
        async with client:
            await client.upsert_trace(patch_payload)
        return {
            "traceId": trace_id,
            "input": patch_payload["input"],
            "output": patch_payload["output"],
            "metadata": patch_payload["metadata"],
            "updatedAt": datetime.now(UTC).isoformat(),
        }

    async def _get_public_trace(
        self,
        project_id: str,
        user_id: str,
        trace_id: str,
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id,
            user_id,
        )
        async with client:
            return await client.get_trace(
                trace_id,
                fields="core,io,scores,observations,metrics",
            )


def _build_trace_filter(
    *,
    keyword: str | None,
    statuses: list[str] | None,
    environments: list[str] | None,
    tags: list[str] | None,
    session_id: str | None,
    user_id: str | None,
    business_id: str | None,
    latency_min: int | None,
    latency_max: int | None,
    metadata_key: str | None,
    metadata_value: str | None,
    metadata_filters: list[dict[str, Any]] | None,
    created_at_range: list[str] | None,
    time_range: str | None,
) -> list[dict[str, Any]]:
    filters: list[dict[str, Any]] = []
    if keyword:
        filters.append(_string_filter("name", "contains", keyword))
    normalized_statuses = {status.lower() for status in statuses or []}
    if normalized_statuses == {"failed"}:
        filters.append(
            {
                "type": "stringOptions",
                "column": "level",
                "operator": "any of",
                "value": ["ERROR"],
            }
        )
    elif normalized_statuses == {"success"}:
        filters.append(
            {
                "type": "stringOptions",
                "column": "level",
                "operator": "none of",
                "value": ["ERROR"],
            }
        )
    if environments:
        filters.append(
            {
                "type": "stringOptions",
                "column": "environment",
                "operator": "any of",
                "value": environments,
            }
        )
    if tags:
        filters.append(
            {
                "type": "arrayOptions",
                "column": "tags",
                "operator": "all of",
                "value": tags,
            }
        )
    if session_id:
        filters.append(_string_filter("sessionId", "contains", session_id))
    if user_id:
        filters.append(_string_filter("userId", "contains", user_id))
    if business_id:
        filters.append(_metadata_filter("businessId", "contains", business_id))
    if latency_min is not None:
        filters.append(_number_filter("latency", ">=", latency_min / 1000))
    if latency_max is not None:
        filters.append(_number_filter("latency", "<=", latency_max / 1000))
    if metadata_key and metadata_value is not None:
        filters.append(
            _metadata_filter(metadata_key, "contains", metadata_value)
        )
    for item in metadata_filters or []:
        operator = {
            "equals": "=",
            "contains": "contains",
            "exists": "is not null",
        }.get(str(item.get("operator") or "contains"), "contains")
        if operator == "is not null":
            filters.append(
                {
                    "type": "null",
                    "column": "metadata",
                    "key": str(item.get("key") or ""),
                    "operator": operator,
                }
            )
        else:
            filters.append(
                _metadata_filter(
                    str(item.get("key") or ""),
                    operator,
                    item.get("value") or "",
                )
            )
    if created_at_range and len(created_at_range) >= 2:
        filters.append(_datetime_filter(">=", created_at_range[0]))
        filters.append(_datetime_filter("<=", created_at_range[1]))
    elif time_range:
        days = int(time_range.removesuffix("d"))
        start = datetime.now(UTC) - timedelta(days=days)
        filters.append(_datetime_filter(">=", start.isoformat()))
    return filters


def _string_filter(column: str, operator: str, value: str) -> dict[str, Any]:
    return {"type": "string", "column": column, "operator": operator, "value": value}


def _number_filter(column: str, operator: str, value: float) -> dict[str, Any]:
    return {"type": "number", "column": column, "operator": operator, "value": value}


def _datetime_filter(operator: str, value: str) -> dict[str, Any]:
    return {
        "type": "datetime",
        "column": "timestamp",
        "operator": operator,
        "value": value,
    }


def _metadata_filter(key: str, operator: str, value: Any) -> dict[str, Any]:
    return {
        "type": "stringObject",
        "column": "metadata",
        "key": key,
        "operator": operator,
        "value": str(value),
    }


def _to_pa_trace(item: dict[str, Any], *, project_id: str) -> dict[str, Any]:
    observations = item.get("observations") or []
    failed = any(
        isinstance(observation, dict)
        and str(observation.get("level") or "").upper() == "ERROR"
        for observation in observations
    )
    scores = item.get("scores") or []
    return {
        "traceId": str(item.get("id") or ""),
        "sessionId": str(item.get("sessionId") or ""),
        "projectId": str(item.get("projectId") or project_id),
        "projectName": "",
        "environment": str(item.get("environment") or "default"),
        "status": "failed" if failed else "success",
        "latency": max(0, round(float(item.get("latency") or 0) * 1000)),
        "createdAt": str(item.get("timestamp") or item.get("createdAt") or ""),
        "userId": str(item.get("userId") or ""),
        "businessId": _business_id(item.get("metadata")),
        "tags": item.get("tags") or [],
        "scores": scores,
        "scoreSummary": _score_summary(scores),
    }


def _business_id(metadata: Any) -> str:
    if not isinstance(metadata, dict):
        return ""
    return str(
        metadata.get("businessId")
        or metadata.get("business_id")
        or metadata.get("app_id")
        or ""
    )


def _score_summary(scores: Any) -> str:
    if not isinstance(scores, list):
        return ""
    parts = []
    for score in scores:
        if not isinstance(score, dict) or not score.get("name"):
            continue
        value = score.get("value")
        parts.append(f"{score['name']}: {value}")
    return ", ".join(parts)


def _to_pa_observation(
    observation: dict[str, Any],
    *,
    project_id: str,
    trace_id: str,
    scores: list[dict[str, Any]],
) -> dict[str, Any]:
    observation_id = str(observation.get("id") or "")
    observation_scores = [
        score
        for score in scores
        if isinstance(score, dict) and _score_observation_id(score) == observation_id
    ]
    return {
        "id": observation_id,
        "traceId": str(observation.get("traceId") or trace_id),
        "projectId": str(observation.get("projectId") or project_id),
        "projectName": "",
        "parentObservationId": observation.get("parentObservationId"),
        "type": str(observation.get("type") or ""),
        "name": str(observation.get("name") or ""),
        "level": str(observation.get("level") or "DEFAULT"),
        "statusMessage": str(observation.get("statusMessage") or ""),
        "startTime": str(observation.get("startTime") or ""),
        "endTime": str(observation.get("endTime") or ""),
        "input": _format_payload(observation.get("input")),
        "output": _format_payload(observation.get("output")),
        "metadata": observation.get("metadata") or {},
        "usageDetails": observation.get("usageDetails") or {},
        "providedUsageDetails": observation.get("providedUsageDetails") or {},
        "costDetails": observation.get("costDetails") or {},
        "providedCostDetails": observation.get("providedCostDetails") or {},
        "totalCost": float(observation.get("totalCost") or 0),
        "scores": observation_scores,
        "scoreSummary": _score_summary(observation_scores),
    }


def _score_observation_id(score: dict[str, Any]) -> str:
    if score.get("observationId"):
        return str(score["observationId"])
    subject = score.get("subject")
    if isinstance(subject, dict) and subject.get("kind") == "observation":
        return str(subject.get("id") or "")
    return ""


def _format_payload(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return value
        return json.dumps(parsed, ensure_ascii=False, indent=2)
    return json.dumps(value, ensure_ascii=False, indent=2)


def _metric_rows(response: dict[str, Any]) -> list[dict[str, Any]]:
    data = response.get("data") or []
    return [row for row in data if isinstance(row, dict)]


def _first_metric_row(response: dict[str, Any]) -> dict[str, Any]:
    rows = _metric_rows(response)
    return rows[0] if rows else {}


def _metric_int(row: dict[str, Any], field: str) -> int:
    return round(float(row.get(field) or 0))


async def _matching_io_trace_ids(
    client: Any,
    *,
    input_filters: list[dict[str, Any]] | None,
    output_filters: list[dict[str, Any]] | None,
) -> set[str]:
    public_filter: list[dict[str, Any]] = []
    for column, filters in (
        ("input", input_filters or []),
        ("output", output_filters or []),
    ):
        for item in filters:
            operator = str(item.get("operator") or "contains")
            if operator == "exists":
                public_filter.append(
                    {
                        "type": "null",
                        "column": column,
                        "operator": "is not null",
                    }
                )
            else:
                public_filter.append(
                    {
                        "type": "string",
                        "column": column,
                        "operator": "matches" if item.get("value") else "contains",
                        "value": str(item.get("value") or ""),
                    }
                )
    cursor: str | None = None
    trace_ids: set[str] = set()
    while True:
        kwargs: dict[str, Any] = {
            "limit": 1000,
            "fields": "core,io",
            "filter": public_filter,
        }
        if cursor:
            kwargs["cursor"] = cursor
        response = await client.list_observations(**kwargs)
        for observation in response.get("data") or []:
            if not isinstance(observation, dict):
                continue
            if _payload_matches_filters(observation.get("input"), input_filters) and (
                _payload_matches_filters(observation.get("output"), output_filters)
            ):
                trace_id = str(observation.get("traceId") or "")
                if trace_id:
                    trace_ids.add(trace_id)
        meta = response.get("meta") if isinstance(response.get("meta"), dict) else {}
        cursor = str(meta.get("cursor") or "") or None
        if not cursor:
            return trace_ids


async def _matching_score_trace_ids(
    client: Any,
    *,
    categorical_filters: list[dict[str, Any]] | None,
    numeric_filters: list[dict[str, Any]] | None,
    queue_id: str | None,
) -> set[str]:
    filters = [
        (item, "CATEGORICAL") for item in categorical_filters or []
    ] + [(item, "NUMERIC") for item in numeric_filters or []]
    if not filters:
        filters = [({}, "")]
    matches: list[set[str]] = []
    for item, data_type in filters:
        kwargs: dict[str, Any] = {
            "limit": 100,
            "fields": "details,subject,annotation",
        }
        if item.get("name"):
            kwargs["name"] = str(item["name"])
        if data_type:
            kwargs["data_type"] = data_type
        operator = str(item.get("operator") or "equals")
        if data_type == "NUMERIC":
            if operator == "gte":
                kwargs["value_min"] = float(item.get("value") or 0)
            elif operator == "lte":
                kwargs["value_max"] = float(item.get("value") or 0)
            elif operator == "equals":
                kwargs["value"] = str(item.get("value"))
        elif data_type == "CATEGORICAL" and operator == "equals":
            kwargs["value"] = str(item.get("value") or "")
        if queue_id:
            kwargs["queue_id"] = queue_id
        trace_ids: set[str] = set()
        cursor: str | None = None
        while True:
            page_kwargs = dict(kwargs)
            if cursor:
                page_kwargs["cursor"] = cursor
            response = await client.list_scores(**page_kwargs)
            for score in response.get("data") or []:
                if not isinstance(score, dict) or not _score_matches_filter(score, item):
                    continue
                trace_id = _score_trace_id(score)
                if trace_id:
                    trace_ids.add(trace_id)
            meta = response.get("meta") if isinstance(response.get("meta"), dict) else {}
            cursor = str(meta.get("cursor") or "") or None
            if not cursor:
                break
        matches.append(trace_ids)
    return set.intersection(*matches) if matches else set()


def _payload_matches_filters(
    payload: Any,
    filters: list[dict[str, Any]] | None,
) -> bool:
    if not filters:
        return True
    parsed = payload
    if isinstance(payload, str):
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            parsed = payload
    for item in filters:
        key = str(item.get("key") or "")
        value = parsed.get(key) if key and isinstance(parsed, dict) else parsed
        operator = str(item.get("operator") or "contains")
        if operator == "exists" and value is None:
            return False
        if operator == "equals" and str(value) != str(item.get("value") or ""):
            return False
        if operator == "contains" and str(item.get("value") or "") not in str(value):
            return False
    return True


def _score_matches_filter(score: dict[str, Any], item: dict[str, Any]) -> bool:
    if not item:
        return True
    expected = item.get("value")
    actual = score.get("value")
    operator = str(item.get("operator") or "equals")
    if operator == "contains":
        return str(expected or "") in str(actual or "")
    if operator == "equals":
        return str(actual) == str(expected)
    if operator == "gte":
        return float(actual) >= float(expected)
    if operator == "lte":
        return float(actual) <= float(expected)
    return True


def _score_trace_id(score: dict[str, Any]) -> str:
    subject = score.get("subject")
    if not isinstance(subject, dict):
        return str(score.get("traceId") or "")
    if subject.get("kind") == "trace":
        return str(subject.get("id") or "")
    return str(subject.get("traceId") or "")
