from fastapi import APIRouter

from eval_platform_api.schemas.common import ResponseEnvelope

router = APIRouter(prefix="/api/projects/{project_id}/evaluators", tags=["evaluators"])


@router.get("", response_model=ResponseEnvelope[list[dict]])
async def list_evaluators(project_id: str) -> ResponseEnvelope[list[dict]]:
    return ResponseEnvelope(data=[], meta={"project_id": project_id})
