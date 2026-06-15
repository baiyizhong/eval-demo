from fastapi import APIRouter, status

from eval_platform_api.schemas.common import ResponseEnvelope
from eval_platform_api.schemas.tasks import TaskCreateRequest, TaskCreateResponse
from eval_platform_api.services.tasks import build_task_items
from eval_platform_api.models.platform import uuid_hex

router = APIRouter(prefix="/api/projects/{project_id}/tasks", tags=["tasks"])


@router.get("", response_model=ResponseEnvelope[list[dict]])
async def list_tasks(project_id: str) -> ResponseEnvelope[list[dict]]:
    return ResponseEnvelope(data=[], meta={"project_id": project_id})


@router.post(
    "",
    response_model=ResponseEnvelope[TaskCreateResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_task(
    project_id: str,
    payload: TaskCreateRequest,
) -> ResponseEnvelope[TaskCreateResponse]:
    items = build_task_items(payload)
    return ResponseEnvelope(
        data=TaskCreateResponse(
            task_id=uuid_hex(),
            status="pending",
            item_count=len(items),
        ),
        meta={"project_id": project_id},
    )
