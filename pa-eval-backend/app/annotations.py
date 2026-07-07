from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, Query
from pydantic import BaseModel, Field

from app.auth_context import CurrentUserContext, get_current_user_context
from app.errors import BusinessError
from app.langfuse_clickhouse import (
    LangfuseClickHouseReader,
    get_langfuse_clickhouse_reader,
)
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.response import success

router = APIRouter(prefix="/api/projects/{project_id}", tags=["annotations"])

AnnotationObjectType = Literal["TRACE", "OBSERVATION", "SESSION"]
AnnotationItemStatus = Literal["PENDING", "COMPLETED"]
ScoreConfigDataType = Literal["NUMERIC", "CATEGORICAL", "BOOLEAN", "TEXT"]


class AnnotationQueuePayload(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    score_config_ids: list[str] = Field(min_length=1, alias="scoreConfigIds")
    assignee_ids: list[str] = Field(default_factory=list, alias="assigneeIds")


class ScoreConfigPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    data_type: ScoreConfigDataType = Field(alias="dataType")
    description: str = Field(default="", max_length=1000)
    min_value: float | None = Field(default=None, alias="minValue")
    max_value: float | None = Field(default=None, alias="maxValue")
    categories: list[str] = Field(default_factory=list)


class AnnotationQueueItemPayload(BaseModel):
    object_id: str = Field(min_length=1, alias="objectId")
    object_type: AnnotationObjectType = Field(alias="objectType")


class AnnotationTraceTaskPayload(BaseModel):
    trace_ids: list[str] = Field(min_length=1, alias="traceIds")
    queue_id: str | None = Field(default=None, alias="queueId")
    queue_name: str | None = Field(default=None, alias="queueName")


class TraceDatasetItemsPayload(BaseModel):
    dataset_id: str = Field(min_length=1, alias="datasetId")
    trace_ids: list[str] = Field(min_length=1, alias="traceIds")


class AnnotationScoreInput(BaseModel):
    config_id: str = Field(min_length=1, alias="configId")
    value: float | bool | None = None
    string_value: str = Field(default="", alias="stringValue")
    comment: str = ""


class AnnotationScorePayload(BaseModel):
    scores: list[AnnotationScoreInput] = Field(default_factory=list)


class DeleteItemsPayload(BaseModel):
    item_ids: list[str] = Field(min_length=1, alias="itemIds")


class AddAnnotationItemToDatasetPayload(BaseModel):
    dataset_id: str = Field(min_length=1, alias="datasetId")
    input: Any
    expected_output: Any = Field(alias="expectedOutput")
    metadata: dict[str, Any] = Field(default_factory=dict)


def _paginate(items: list[dict[str, Any]], page: int, page_size: int) -> dict[str, Any]:
    start = (page - 1) * page_size
    return {"total": len(items), "datas": items[start : start + page_size]}


def _matches_queue_keyword(item: dict[str, Any], keyword: str | None) -> bool:
    if not keyword:
        return True
    needle = keyword.lower()
    return any(
        needle in str(value or "").lower()
        for value in [item.get("id"), item.get("name"), item.get("description")]
    )


def _matches_item_keyword(item: dict[str, Any], keyword: str | None) -> bool:
    if not keyword:
        return True
    needle = keyword.lower()
    source = item.get("source") or {}
    return any(
        needle in str(value or "").lower()
        for value in [
            item.get("id"),
            item.get("objectId"),
            item.get("objectType"),
            source.get("title"),
            source.get("traceId"),
            source.get("sessionId"),
            source.get("userId"),
            source.get("input"),
            source.get("output"),
            source.get("metadata"),
        ]
    )


def _queue_payload(payload: AnnotationQueuePayload) -> dict[str, Any]:
    return {
        "name": payload.name.strip(),
        "description": payload.description,
        "scoreConfigIds": payload.score_config_ids,
        "assigneeIds": payload.assignee_ids,
    }


def _score_config_payload(payload: ScoreConfigPayload) -> dict[str, Any]:
    return {
        "name": payload.name.strip(),
        "dataType": payload.data_type,
        "description": payload.description,
        "minValue": payload.min_value,
        "maxValue": payload.max_value,
        "categories": payload.categories,
    }


def _first_non_empty_list(
    primary: list[Any] | None,
    fallback: list[Any] | None,
) -> list[Any] | None:
    return primary if primary else fallback


@router.get("/score-configs")
async def list_score_configs(
    project_id: str,
    include_archived: bool = Query(default=False, alias="includeArchived"),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    configs = await reader.list_score_configs_for_user(
        project_id,
        current_user.user_id,
        include_archived=include_archived,
    )
    return success(configs)


@router.post("/score-configs/default")
async def ensure_default_score_config(
    project_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    config = await reader.ensure_default_score_config_for_user(
        project_id,
        current_user.user_id,
    )
    return success(config)


@router.post("/score-configs")
async def create_score_config(
    project_id: str,
    payload: ScoreConfigPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    config = await reader.create_score_config_for_user(
        project_id,
        current_user.user_id,
        _score_config_payload(payload),
    )
    return success(config)


@router.patch("/score-configs/{config_id}")
async def update_score_config(
    project_id: str,
    config_id: str,
    payload: ScoreConfigPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    config = await reader.update_score_config_for_user(
        project_id,
        config_id,
        current_user.user_id,
        _score_config_payload(payload),
    )
    return success(config)


@router.post("/score-configs/{config_id}/archive")
async def archive_score_config(
    project_id: str,
    config_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    config = await reader.set_score_config_archived_for_user(
        project_id,
        config_id,
        current_user.user_id,
        True,
    )
    return success(config)


@router.post("/score-configs/{config_id}/restore")
async def restore_score_config(
    project_id: str,
    config_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    config = await reader.set_score_config_archived_for_user(
        project_id,
        config_id,
        current_user.user_id,
        False,
    )
    return success(config)


@router.get("/annotation-users")
async def list_annotation_users(
    project_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    users = await reader.list_project_users_for_user(project_id, current_user.user_id)
    return success(users)


@router.get("/annotation-queues")
async def list_annotation_queues(
    project_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200, alias="pageSize"),
    keyword: str | None = Query(default=None),
    assignee_ids: list[str] | None = Query(default=None, alias="assigneeIds"),
    pending_state: list[str] | None = Query(default=None, alias="pendingState"),
    assignee_ids_bracket: list[str] | None = Query(
        default=None,
        alias="assigneeIds[]",
    ),
    pending_state_bracket: list[str] | None = Query(
        default=None,
        alias="pendingState[]",
    ),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    queues = await reader.list_annotation_queues_for_user(
        project_id,
        current_user.user_id,
    )
    filtered = [queue for queue in queues if _matches_queue_keyword(queue, keyword)]
    effective_assignee_ids = _first_non_empty_list(
        assignee_ids,
        assignee_ids_bracket,
    )
    effective_pending_state = _first_non_empty_list(
        pending_state,
        pending_state_bracket,
    )
    if effective_assignee_ids:
        assignees = set(effective_assignee_ids)
        filtered = [
            queue
            for queue in filtered
            if assignees.intersection(set(queue.get("assigneeIds") or []))
        ]
    if effective_pending_state:
        states = set(effective_pending_state)
        if "hasPending" in states:
            filtered = [queue for queue in filtered if queue["pendingCount"] > 0]
        elif "completed" in states:
            filtered = [queue for queue in filtered if queue["pendingCount"] == 0]
    return success(_paginate(filtered, page, page_size))


@router.post("/annotation-queues")
async def create_annotation_queue(
    project_id: str,
    payload: AnnotationQueuePayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    queue = await reader.create_annotation_queue_for_user(
        project_id,
        current_user.user_id,
        _queue_payload(payload),
    )
    return success(queue)


@router.get("/annotation-queues/{queue_id}")
async def get_annotation_queue(
    project_id: str,
    queue_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    queue = await reader.get_annotation_queue_for_user(
        project_id,
        queue_id,
        current_user.user_id,
    )
    return success(queue)


@router.patch("/annotation-queues/{queue_id}")
async def update_annotation_queue(
    project_id: str,
    queue_id: str,
    payload: AnnotationQueuePayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    queue = await reader.update_annotation_queue_for_user(
        project_id,
        queue_id,
        current_user.user_id,
        _queue_payload(payload),
    )
    return success(queue)


@router.delete("/annotation-queues/{queue_id}")
async def delete_annotation_queue(
    project_id: str,
    queue_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    await reader.delete_annotation_queue_for_user(
        project_id,
        queue_id,
        current_user.user_id,
    )
    return success({"id": queue_id})


@router.get("/annotation-queues/{queue_id}/metrics")
async def get_annotation_queue_metrics(
    project_id: str,
    queue_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    metrics = await reader.get_annotation_queue_metrics_for_user(
        project_id,
        queue_id,
        current_user.user_id,
    )
    return success(metrics)


@router.get("/annotation-queues/{queue_id}/items")
async def list_annotation_queue_items(
    project_id: str,
    queue_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=5000, alias="pageSize"),
    keyword: str | None = Query(default=None),
    status: list[AnnotationItemStatus] | None = Query(default=None),
    object_type: list[AnnotationObjectType] | None = Query(
        default=None,
        alias="objectType",
    ),
    completed_by: list[str] | None = Query(default=None, alias="completedBy"),
    status_bracket: list[AnnotationItemStatus] | None = Query(
        default=None,
        alias="status[]",
    ),
    object_type_bracket: list[AnnotationObjectType] | None = Query(
        default=None,
        alias="objectType[]",
    ),
    completed_by_bracket: list[str] | None = Query(
        default=None,
        alias="completedBy[]",
    ),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    items = await reader.list_annotation_queue_items_for_user(
        project_id,
        queue_id,
        current_user.user_id,
    )
    filtered = [item for item in items if _matches_item_keyword(item, keyword)]
    effective_status = _first_non_empty_list(status, status_bracket)
    effective_object_type = _first_non_empty_list(object_type, object_type_bracket)
    effective_completed_by = _first_non_empty_list(completed_by, completed_by_bracket)
    if effective_status:
        allowed_statuses = set(effective_status)
        filtered = [item for item in filtered if item["status"] in allowed_statuses]
    if effective_object_type:
        allowed_types = set(effective_object_type)
        filtered = [item for item in filtered if item["objectType"] in allowed_types]
    if effective_completed_by:
        allowed_users = set(effective_completed_by)
        filtered = [
            item
            for item in filtered
            if (item.get("completedBy") or {}).get("id") in allowed_users
        ]
    return success(_paginate(filtered, page, page_size))


@router.post("/annotation-queues/{queue_id}/items")
async def create_annotation_queue_item(
    project_id: str,
    queue_id: str,
    payload: AnnotationQueueItemPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    item = await reader.create_annotation_queue_item_for_user(
        project_id,
        queue_id,
        current_user.user_id,
        {"objectId": payload.object_id, "objectType": payload.object_type},
    )
    return success(item)


@router.get("/annotation-queues/{queue_id}/items/{item_id}")
async def get_annotation_queue_item(
    project_id: str,
    queue_id: str,
    item_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    item = await reader.get_annotation_queue_item_for_user(
        project_id,
        queue_id,
        item_id,
        current_user.user_id,
    )
    return success(item)


@router.delete("/annotation-queues/{queue_id}/items")
async def delete_annotation_queue_items(
    project_id: str,
    queue_id: str,
    payload: DeleteItemsPayload = Body(...),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    deleted = await reader.delete_annotation_queue_items_for_user(
        project_id,
        queue_id,
        current_user.user_id,
        payload.item_ids,
    )
    return success({"ids": deleted})


@router.post("/annotation-queues/{queue_id}/items/{item_id}/scores")
async def save_annotation_scores(
    project_id: str,
    queue_id: str,
    item_id: str,
    payload: AnnotationScorePayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    item = await reader.save_annotation_scores_for_user(
        project_id,
        queue_id,
        item_id,
        current_user.user_id,
        {
            "scores": [
                {
                    "configId": score.config_id,
                    "value": score.value,
                    "stringValue": score.string_value,
                    "comment": score.comment,
                }
                for score in payload.scores
            ]
        },
    )
    return success(item)


@router.post("/annotation-queues/{queue_id}/items/{item_id}/dataset-items")
async def add_annotation_item_to_dataset(
    project_id: str,
    queue_id: str,
    item_id: str,
    payload: AddAnnotationItemToDatasetPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    dataset_item = await reader.add_annotation_item_to_dataset_for_user(
        project_id,
        queue_id,
        item_id,
        current_user.user_id,
        {
            "datasetId": payload.dataset_id,
            "input": payload.input,
            "expectedOutput": payload.expected_output,
            "metadata": payload.metadata,
        },
    )
    return success(dataset_item)


@router.post("/traces/annotation-task")
async def create_trace_annotation_task(
    project_id: str,
    payload: AnnotationTraceTaskPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    task_payload: dict[str, Any] = {"traceIds": payload.trace_ids}
    if payload.queue_id:
        task_payload["queueId"] = payload.queue_id
    if payload.queue_name:
        task_payload["queueName"] = payload.queue_name

    result = await reader.create_trace_annotation_task_for_user(
        project_id,
        current_user.user_id,
        task_payload,
    )
    return success({**result, "traceCount": len(payload.trace_ids)})


@router.post("/traces/dataset-items")
async def add_traces_to_dataset(
    project_id: str,
    payload: TraceDatasetItemsPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    trace_reader: LangfuseClickHouseReader = Depends(get_langfuse_clickhouse_reader),
) -> dict[str, Any]:
    traces: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    for trace_id in dict.fromkeys(payload.trace_ids):
        try:
            traces.append(await trace_reader.get_trace(project_id, trace_id))
        except BusinessError as exc:
            failures.append(
                {
                    "traceId": trace_id,
                    "reason": exc.message,
                }
            )

    result = await reader.add_traces_to_dataset_for_user(
        project_id,
        current_user.user_id,
        {
            "datasetId": payload.dataset_id,
            "traces": traces,
        },
    )
    return success(
        {
            **result,
            "failureCount": result["failureCount"] + len(failures),
            "failures": [*result["failures"], *failures],
            "traceCount": len(payload.trace_ids),
        }
    )
