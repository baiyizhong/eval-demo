from urllib.parse import urlsplit

from fastapi import APIRouter, Response, status

from eval_platform_api.api.routes._langfuse import (
    build_configured_langfuse_client,
    langfuse_not_configured_response,
    langfuse_request_failed_response,
)
from eval_platform_api.core.config import get_settings
from eval_platform_api.schemas.common import ErrorEnvelope, ResponseEnvelope
from eval_platform_api.schemas.projects import (
    ProjectListItem,
    ProjectConnectionTestRequest,
    ProjectConnectionTestResponse,
)
from eval_platform_api.services.langfuse_client import LangfuseAPIError, LangfuseClient

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _url_origin(url: str) -> tuple[str, str, int | None]:
    parsed = urlsplit(url)
    return parsed.scheme, parsed.hostname or "", parsed.port


def _project_description(project: dict) -> str | None:
    metadata = project.get("metadata")
    if isinstance(metadata, dict):
        description = metadata.get("description")
        if isinstance(description, str) and description.strip():
            return description
    organization = project.get("organization")
    if isinstance(organization, dict):
        organization_name = organization.get("name")
        if isinstance(organization_name, str) and organization_name.strip():
            return f"Langfuse 项目，所属组织：{organization_name}"
    return "Langfuse 项目"


def _organization_name(project: dict) -> str | None:
    organization = project.get("organization")
    if not isinstance(organization, dict):
        return None
    name = organization.get("name")
    return name if isinstance(name, str) else None


@router.get("", response_model=ResponseEnvelope[list[ProjectListItem]])
async def list_projects(response: Response) -> ResponseEnvelope[list[ProjectListItem]]:
    settings = get_settings()
    client = build_configured_langfuse_client(settings)
    if client is None:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return langfuse_not_configured_response()

    try:
        projects = await client.list_projects()
        trace_summary = await client.get_trace_summary()
    except LangfuseAPIError:
        response.status_code = status.HTTP_502_BAD_GATEWAY
        return langfuse_request_failed_response()

    items = [
        ProjectListItem(
            id=str(project.get("id", "")),
            name=str(project.get("name") or project.get("id") or "未命名项目"),
            description=_project_description(project),
            status="active",
            trace_count=trace_summary["trace_count"],
            created_at=None,
            last_active_at=trace_summary["last_active_at"],
            langfuse_base_url=settings.langfuse_default_base_url,
            organization_name=_organization_name(project),
        )
        for project in projects
        if project.get("id")
    ]
    return ResponseEnvelope(
        data=items,
        meta={"source": "langfuse", "base_url": str(settings.langfuse_default_base_url)},
    )


@router.post(
    "/connection/test",
    response_model=ResponseEnvelope[ProjectConnectionTestResponse],
)
async def test_project_connection(
    payload: ProjectConnectionTestRequest,
    response: Response,
) -> ResponseEnvelope[ProjectConnectionTestResponse]:
    requested_base_url = str(payload.langfuse_base_url)
    settings = get_settings()
    allowed_base_url = str(settings.langfuse_default_base_url)

    if _url_origin(requested_base_url) != _url_origin(allowed_base_url):
        response.status_code = status.HTTP_400_BAD_REQUEST
        return ResponseEnvelope(
            error=ErrorEnvelope(
                code="invalid_langfuse_base_url",
                message="Langfuse base URL must match the configured origin.",
            )
        )

    client = LangfuseClient(
        base_url=requested_base_url,
        public_key=payload.langfuse_public_key,
        secret_key=payload.langfuse_secret_key.get_secret_value(),
    )
    ok = await client.test_connection()
    return ResponseEnvelope(
        data=ProjectConnectionTestResponse(
            ok=ok,
            base_url=requested_base_url,
        )
    )
