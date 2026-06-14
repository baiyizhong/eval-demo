from fastapi import APIRouter

from eval_platform_api.schemas.common import ResponseEnvelope

router = APIRouter(prefix="/api/projects/{project_id}/reports", tags=["reports"])


@router.get("/{task_id}", response_model=ResponseEnvelope[dict])
async def get_report(project_id: str, task_id: str) -> ResponseEnvelope[dict]:
    return ResponseEnvelope(
        data={"task_id": task_id, "summary": {}},
        meta={"project_id": project_id},
    )
