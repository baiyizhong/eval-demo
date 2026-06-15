from fastapi import APIRouter, Query, Response, status

from eval_platform_api.api.routes._langfuse import (
    build_configured_langfuse_client,
    langfuse_not_configured_response,
    langfuse_request_failed_response,
)
from eval_platform_api.core.config import get_settings
from eval_platform_api.schemas.common import ResponseEnvelope
from eval_platform_api.services.langfuse_client import LangfuseAPIError

router = APIRouter(prefix="/api/projects/{project_id}/traces", tags=["traces"])


@router.get("", response_model=ResponseEnvelope[list[dict]])
async def list_traces(
    project_id: str,
    response: Response,
    limit: int = Query(default=50, ge=1, le=100),
    page: int = Query(default=1, ge=1),
) -> ResponseEnvelope[list[dict]]:
    settings = get_settings()
    client = build_configured_langfuse_client(settings)
    if client is None:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return langfuse_not_configured_response()

    try:
        payload = await client.list_traces(limit=limit, page=page)
    except LangfuseAPIError:
        response.status_code = status.HTTP_502_BAD_GATEWAY
        return langfuse_request_failed_response()

    traces = payload.get("data", [])
    if not isinstance(traces, list):
        traces = []

    return ResponseEnvelope(
        data=[_trace_item(trace) for trace in traces if isinstance(trace, dict)],
        meta={
            "project_id": project_id,
            "source": "langfuse",
            "pagination": payload.get("meta", {}),
        },
    )


def _trace_item(trace: dict) -> dict:
    return {
        "id": trace.get("id"),
        "name": trace.get("name"),
        "timestamp": trace.get("timestamp"),
        "user_id": trace.get("userId"),
        "session_id": trace.get("sessionId"),
        "input": trace.get("input"),
        "output": trace.get("output"),
    }
