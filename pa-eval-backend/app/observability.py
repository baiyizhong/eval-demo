from typing import Any

from fastapi import APIRouter, Depends, Query

from app.auth_context import CurrentUserContext, get_current_user_context
from app.errors import UnsupportedOperationError
from app.langfuse_clickhouse import (
    LangfuseClickHouseReader,
    get_langfuse_clickhouse_reader,
)
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.response import success

router = APIRouter(prefix="/api/projects/{project_id}", tags=["observability"])


@router.get("/trace-metrics")
async def get_trace_metrics(
    project_id: str,
    time_range: str = Query(default="24h", alias="timeRange", pattern="^(24h|7d|30d)$"),
    environment: str = Query(default="all"),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    db_reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    trace_reader: LangfuseClickHouseReader = Depends(get_langfuse_clickhouse_reader),
) -> dict[str, Any]:
    await db_reader.ensure_project_visible(project_id, current_user.user_id)
    return success(
        await trace_reader.get_trace_metrics(
            project_id,
            time_range=time_range,
            environment=environment,
        )
    )


@router.get("/traces")
async def list_traces(
    project_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200, alias="pageSize"),
    keyword: str | None = Query(default=None),
    environments: list[str] | None = Query(default=None),
    statuses: list[str] | None = Query(default=None),
    session_id: str | None = Query(default=None, alias="sessionId"),
    user_id: str | None = Query(default=None, alias="userId"),
    latency_min: int | None = Query(default=None, alias="latencyMin"),
    latency_max: int | None = Query(default=None, alias="latencyMax"),
    metadata_key: str | None = Query(default=None, alias="metadataKey"),
    metadata_value: str | None = Query(default=None, alias="metadataValue"),
    created_at_range: list[str] | None = Query(default=None, alias="createdAtRange"),
    time_range: str | None = Query(default=None, alias="timeRange", pattern="^(24h|7d|30d)$"),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    db_reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    trace_reader: LangfuseClickHouseReader = Depends(get_langfuse_clickhouse_reader),
) -> dict[str, Any]:
    await db_reader.ensure_project_visible(project_id, current_user.user_id)
    return success(
        await trace_reader.list_traces(
            project_id,
            page=page,
            page_size=page_size,
            keyword=keyword,
            statuses=statuses,
            environments=environments,
            session_id=session_id,
            user_id=user_id,
            latency_min=latency_min,
            latency_max=latency_max,
            metadata_key=metadata_key,
            metadata_value=metadata_value,
            created_at_range=created_at_range,
            time_range=time_range,
        )
    )


@router.get("/traces/{trace_id}")
async def get_trace(
    project_id: str,
    trace_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    db_reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    trace_reader: LangfuseClickHouseReader = Depends(get_langfuse_clickhouse_reader),
) -> dict[str, Any]:
    await db_reader.ensure_project_visible(project_id, current_user.user_id)
    return success(await trace_reader.get_trace(project_id, trace_id))


@router.patch("/traces/{trace_id}")
async def patch_trace(project_id: str, trace_id: str) -> dict[str, Any]:
    raise UnsupportedOperationError("Trace 更新暂未接入 Langfuse API")
