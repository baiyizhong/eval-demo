from fastapi import APIRouter

from eval_platform_api.schemas.common import ResponseEnvelope
from eval_platform_api.schemas.projects import (
    ProjectConnectionTestRequest,
    ProjectConnectionTestResponse,
)
from eval_platform_api.services.langfuse_client import LangfuseClient

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post(
    "/connection/test",
    response_model=ResponseEnvelope[ProjectConnectionTestResponse],
)
async def test_project_connection(
    payload: ProjectConnectionTestRequest,
) -> ResponseEnvelope[ProjectConnectionTestResponse]:
    client = LangfuseClient(
        base_url=str(payload.langfuse_base_url),
        public_key=payload.langfuse_public_key,
        secret_key=payload.langfuse_secret_key,
    )
    ok = await client.test_connection()
    return ResponseEnvelope(
        data=ProjectConnectionTestResponse(
            ok=ok,
            base_url=str(payload.langfuse_base_url),
        )
    )
