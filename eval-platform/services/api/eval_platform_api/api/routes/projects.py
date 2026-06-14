from urllib.parse import urlsplit

from fastapi import APIRouter, Response, status

from eval_platform_api.core.config import get_settings
from eval_platform_api.schemas.common import ErrorEnvelope, ResponseEnvelope
from eval_platform_api.schemas.projects import (
    ProjectConnectionTestRequest,
    ProjectConnectionTestResponse,
)
from eval_platform_api.services.langfuse_client import LangfuseClient

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _url_origin(url: str) -> tuple[str, str, int | None]:
    parsed = urlsplit(url)
    return parsed.scheme, parsed.hostname or "", parsed.port


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
