import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.auth_context import CurrentUserContext, get_current_user_context
from app.errors import LangfuseUpstreamError
from app.langfuse_clickhouse import (
    LangfuseClickHouseReader,
    get_langfuse_clickhouse_reader,
)
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.langfuse.observability_adapter import LangfuseObservabilityAdapter
from app.response import success

router = APIRouter(prefix="/api/projects/{project_id}", tags=["observability"])
logger = logging.getLogger(__name__)
TRACE_TIME_RANGE_PATTERN = "^(1d|3d|7d|14d)$"


class TracePatchPayload(BaseModel):
    input: str = Field(default="", max_length=200000)
    output: str = Field(default="", max_length=200000)
    metadata: dict[str, Any] = Field(default_factory=dict)


def get_langfuse_observability_adapter(
    db_reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> LangfuseObservabilityAdapter:
    return LangfuseObservabilityAdapter(db_reader)


@router.get("/trace-metrics")
async def get_trace_metrics(
    project_id: str,
    time_range: str = Query(default="1d", alias="timeRange", pattern=TRACE_TIME_RANGE_PATTERN),
    environment: str = Query(default="all"),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    db_reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    observability_adapter: LangfuseObservabilityAdapter = Depends(
        get_langfuse_observability_adapter
    ),
) -> dict[str, Any]:
    await db_reader.ensure_project_visible(project_id, current_user.user_id)
    try:
        metrics = await observability_adapter.get_trace_metrics(
            project_id,
            current_user.user_id,
            time_range=time_range,
            environment=environment,
        )
    except LangfuseUpstreamError:
        logger.warning("Trace metrics unavailable; returning empty payload", exc_info=True)
        metrics = _empty_trace_metrics()
    return success(metrics)


@router.get("/traces")
async def list_traces(
    project_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200, alias="pageSize"),
    keyword: str | None = Query(default=None),
    environments: list[str] | None = Query(default=None),
    statuses: list[str] | None = Query(default=None),
    environments_bracket: list[str] | None = Query(
        default=None,
        alias="environments[]",
    ),
    statuses_bracket: list[str] | None = Query(default=None, alias="statuses[]"),
    tags: list[str] | None = Query(default=None),
    tags_bracket: list[str] | None = Query(default=None, alias="tags[]"),
    session_id: str | None = Query(default=None, alias="sessionId"),
    anchor_trace_id: str | None = Query(default=None, alias="anchorTraceId"),
    cursor_created_at: str | None = Query(default=None, alias="cursorCreatedAt"),
    cursor_trace_id: str | None = Query(default=None, alias="cursorTraceId"),
    user_id: str | None = Query(default=None, alias="userId"),
    business_id: str | None = Query(default=None, alias="businessId"),
    latency_min: int | None = Query(default=None, alias="latencyMin"),
    latency_max: int | None = Query(default=None, alias="latencyMax"),
    score_queue_id: str | None = Query(default=None, alias="scoreQueueId"),
    metadata_key: str | None = Query(default=None, alias="metadataKey"),
    metadata_value: str | None = Query(default=None, alias="metadataValue"),
    metadata_filters: str | None = Query(default=None, alias="metadataFilters"),
    input_filters: str | None = Query(default=None, alias="inputFilters"),
    output_filters: str | None = Query(default=None, alias="outputFilters"),
    categorical_score_filters: str | None = Query(
        default=None,
        alias="categoricalScoreFilters",
    ),
    numeric_score_filters: str | None = Query(default=None, alias="numericScoreFilters"),
    fields: str | None = Query(default=None),
    created_at_range: list[str] | None = Query(default=None, alias="createdAtRange"),
    created_at_range_bracket: list[str] | None = Query(
        default=None,
        alias="createdAtRange[]",
    ),
    time_range: str | None = Query(
        default=None,
        alias="timeRange",
        pattern=TRACE_TIME_RANGE_PATTERN,
    ),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    db_reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    observability_adapter: LangfuseObservabilityAdapter = Depends(
        get_langfuse_observability_adapter
    ),
) -> dict[str, Any]:
    project = await db_reader.get_project_for_user(project_id, current_user.user_id)
    resolved_statuses = _first_non_empty_list(statuses, statuses_bracket)
    resolved_environments = _first_non_empty_list(environments, environments_bracket)
    resolved_tags = _first_non_empty_list(tags, tags_bracket)
    resolved_created_at_range = _first_non_empty_list(
        created_at_range,
        created_at_range_bracket,
    )
    parsed_metadata_filters = _parse_metadata_filters(metadata_filters)
    parsed_input_filters = _parse_metadata_filters(input_filters)
    parsed_output_filters = _parse_metadata_filters(output_filters)
    parsed_categorical_score_filters = _parse_categorical_score_filters(
        categorical_score_filters,
    )
    parsed_numeric_score_filters = _parse_numeric_score_filters(numeric_score_filters)
    effective_time_range = _resolve_trace_time_range(
        time_range=time_range,
        created_at_range=resolved_created_at_range,
        keyword=keyword,
        statuses=resolved_statuses,
        environments=resolved_environments,
        session_id=session_id,
        user_id=user_id,
        business_id=business_id,
        latency_min=latency_min,
        latency_max=latency_max,
        score_queue_id=score_queue_id,
        metadata_key=metadata_key,
        metadata_value=metadata_value,
        metadata_filters=parsed_metadata_filters,
        categorical_score_filters=parsed_categorical_score_filters,
        numeric_score_filters=parsed_numeric_score_filters,
    )
    try:
        traces = await observability_adapter.list_traces(
            project_id,
            current_user.user_id,
            page=page,
            page_size=page_size,
            keyword=keyword,
            statuses=resolved_statuses,
            environments=resolved_environments,
            tags=resolved_tags,
            session_id=session_id,
            anchor_trace_id=anchor_trace_id,
            cursor_created_at=cursor_created_at,
            cursor_trace_id=cursor_trace_id,
            user_id_filter=user_id,
            business_id=business_id,
            latency_min=latency_min,
            latency_max=latency_max,
            score_queue_id=score_queue_id,
            metadata_key=metadata_key,
            metadata_value=metadata_value,
            metadata_filters=parsed_metadata_filters,
            input_filters=parsed_input_filters,
            output_filters=parsed_output_filters,
            categorical_score_filters=parsed_categorical_score_filters,
            numeric_score_filters=parsed_numeric_score_filters,
            fields=fields,
            created_at_range=resolved_created_at_range,
            time_range=effective_time_range,
        )
    except LangfuseUpstreamError:
        logger.warning("Trace list unavailable; returning empty payload", exc_info=True)
        traces = _empty_trace_list()
    return success(_trace_list_with_project_name(traces, project["name"]))


@router.get("/traces/{trace_id}")
async def get_trace(
    project_id: str,
    trace_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    db_reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    observability_adapter: LangfuseObservabilityAdapter = Depends(
        get_langfuse_observability_adapter
    ),
) -> dict[str, Any]:
    project = await db_reader.get_project_for_user(project_id, current_user.user_id)
    trace = await observability_adapter.get_trace(
        project_id,
        current_user.user_id,
        trace_id,
    )
    return success(_with_project_name(trace, project["name"]))


@router.get("/traces/{trace_id}/observations/{observation_id}")
async def get_trace_observation(
    project_id: str,
    trace_id: str,
    observation_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    db_reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    observability_adapter: LangfuseObservabilityAdapter = Depends(
        get_langfuse_observability_adapter
    ),
) -> dict[str, Any]:
    project = await db_reader.get_project_for_user(project_id, current_user.user_id)
    observation = await observability_adapter.get_observation(
        project_id,
        current_user.user_id,
        trace_id,
        observation_id,
    )
    return success(_with_project_name(observation, project["name"]))


@router.patch("/traces/{trace_id}")
async def patch_trace(
    project_id: str,
    trace_id: str,
    payload: TracePatchPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    db_reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    trace_reader: LangfuseClickHouseReader = Depends(get_langfuse_clickhouse_reader),
    observability_adapter: LangfuseObservabilityAdapter = Depends(
        get_langfuse_observability_adapter
    ),
) -> dict[str, Any]:
    await db_reader.ensure_project_visible(project_id, current_user.user_id)
    current_detail = await trace_reader.get_trace(project_id, trace_id)
    patched = await observability_adapter.patch_trace(
        project_id,
        current_user.user_id,
        trace_id,
        payload.model_dump(),
    )
    return success({**current_detail, **patched})


def _empty_trace_metrics() -> dict[str, Any]:
    return {
        "summary": {
            "total": 0,
            "success": 0,
            "failed": 0,
            "failureRate": 0,
            "averageLatency": 0,
            "p95Latency": 0,
            "totalChangeRate": 0,
        },
        "traceTrend": [],
        "latencyTrend": [],
        "environmentDistribution": [],
        "slowTraces": [],
    }


def _empty_trace_list() -> dict[str, Any]:
    return {"total": 0, "datas": []}


def _with_project_name(payload: dict[str, Any], project_name: str) -> dict[str, Any]:
    return {
        **payload,
        "projectName": payload.get("projectName") or project_name,
    }


def _trace_list_with_project_name(
    traces: dict[str, Any],
    project_name: str,
) -> dict[str, Any]:
    return {
        **traces,
        "datas": [
            _with_project_name(item, project_name)
            for item in traces.get("datas", [])
            if isinstance(item, dict)
        ],
    }


def _first_non_empty_list(
    primary: list[str] | None,
    fallback: list[str] | None,
) -> list[str] | None:
    return primary if primary else fallback


def _resolve_trace_time_range(
    *,
    time_range: str | None,
    created_at_range: list[str] | None,
    keyword: str | None,
    statuses: list[str] | None,
    environments: list[str] | None,
    session_id: str | None,
    user_id: str | None,
    business_id: str | None,
    latency_min: int | None,
    latency_max: int | None,
    score_queue_id: str | None,
    metadata_key: str | None,
    metadata_value: str | None,
    metadata_filters: list[dict[str, Any]] | None,
    categorical_score_filters: list[dict[str, Any]] | None,
    numeric_score_filters: list[dict[str, Any]] | None,
) -> str | None:
    if created_at_range:
        return None
    return time_range or "1d"


def _has_text(value: str | None) -> bool:
    return bool((value or "").strip())


def _parse_metadata_filters(value: str | None) -> list[dict[str, Any]] | None:
    if not value:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, list):
        return None
    filters: list[dict[str, Any]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key") or "").strip()
        if not key:
            continue
        operator = str(item.get("operator") or "contains").strip()
        if operator not in {"contains", "equals", "exists"}:
            operator = "contains"
        filters.append(
            {
                "key": key,
                "operator": operator,
                "value": str(item.get("value") or ""),
            }
        )
    return filters or None


def _parse_categorical_score_filters(value: str | None) -> list[dict[str, Any]] | None:
    parsed = _parse_json_filter_list(value)
    if parsed is None:
        return None
    filters: list[dict[str, Any]] = []
    for item in parsed:
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        operator = str(item.get("operator") or "equals").strip()
        if operator not in {"contains", "equals", "exists"}:
            operator = "equals"
        filters.append(
            {
                "name": name,
                "operator": operator,
                "value": str(item.get("value") or ""),
            }
        )
    return filters or None


def _parse_numeric_score_filters(value: str | None) -> list[dict[str, Any]] | None:
    parsed = _parse_json_filter_list(value)
    if parsed is None:
        return None
    filters: list[dict[str, Any]] = []
    for item in parsed:
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        try:
            score_value = float(item.get("value"))
        except (TypeError, ValueError):
            continue
        operator = str(item.get("operator") or "eq").strip()
        if operator not in {"eq", "gte", "lte", "gt", "lt"}:
            operator = "eq"
        filters.append({"name": name, "operator": operator, "value": score_value})
    return filters or None


def _parse_json_filter_list(value: str | None) -> list[dict[str, Any]] | None:
    if not value:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, list):
        return None
    return [item for item in parsed if isinstance(item, dict)]
