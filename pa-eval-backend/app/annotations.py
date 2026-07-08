import json
import re
from datetime import datetime, timezone
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
SCORE_CONFIG_NAME_PATTERN = re.compile(r"^[\w .()\-\u4e00-\u9fff]+$")
LANGFUSE_BOOLEAN_CATEGORIES = [
    {"label": "True", "value": 1},
    {"label": "False", "value": 0},
]


class AnnotationQueuePayload(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    score_config_ids: list[str] = Field(min_length=1, alias="scoreConfigIds")
    assignee_ids: list[str] = Field(default_factory=list, alias="assigneeIds")


class ScoreConfigCategoryPayload(BaseModel):
    label: str = Field(min_length=1)
    value: float


class ScoreConfigPayload(BaseModel):
    name: str = Field(min_length=1, max_length=35)
    data_type: ScoreConfigDataType = Field(alias="dataType")
    description: str = Field(default="", max_length=1000)
    min_value: float | None = Field(default=None, alias="minValue")
    max_value: float | None = Field(default=None, alias="maxValue")
    categories: list[ScoreConfigCategoryPayload] = Field(default_factory=list)


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


class MetadataFilterPayload(BaseModel):
    key: str = ""
    operator: Literal["contains", "equals", "exists"] = "contains"
    value: str = ""


class AnnotationBatchFiltersPayload(BaseModel):
    keyword: str = ""
    status: list[AnnotationItemStatus] = Field(default_factory=list)
    object_type: list[AnnotationObjectType] = Field(default_factory=list, alias="objectType")
    completed_by: list[str] = Field(default_factory=list, alias="completedBy")
    created_at_from: str = Field(default="", alias="createdAtFrom")
    created_at_to: str = Field(default="", alias="createdAtTo")
    completed_at_from: str = Field(default="", alias="completedAtFrom")
    completed_at_to: str = Field(default="", alias="completedAtTo")
    has_scores: bool | None = Field(default=None, alias="hasScores")
    metadata_filter: MetadataFilterPayload | None = Field(default=None, alias="metadataFilter")
    metadata_filters: list[MetadataFilterPayload] = Field(
        default_factory=list,
        alias="metadataFilters",
    )
    item_ids: list[str] = Field(default_factory=list, alias="itemIds")


class AnnotationBatchPreviewPayload(BaseModel):
    filters: AnnotationBatchFiltersPayload = Field(default_factory=AnnotationBatchFiltersPayload)
    limit: int = Field(default=5, ge=1, le=20)


class AnnotationBatchScorePayload(BaseModel):
    filters: AnnotationBatchFiltersPayload = Field(default_factory=AnnotationBatchFiltersPayload)
    scores: list[AnnotationScoreInput] = Field(min_length=1)
    expected_pending_count: int | None = Field(default=None, alias="expectedPendingCount")
    confirm_large_batch: bool = Field(default=False, alias="confirmLargeBatch")


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


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _matches_time_range(value: str | None, start: str, end: str) -> bool:
    timestamp = _parse_time(value)
    start_time = _parse_time(start)
    end_time = _parse_time(end)
    if start_time and (timestamp is None or timestamp < start_time):
        return False
    if end_time and (timestamp is None or timestamp > end_time):
        return False
    return True


def _get_nested_value(data: dict[str, Any], path: str) -> Any:
    current: Any = data
    for part in path.split("."):
        if not part:
            continue
        if isinstance(current, dict):
            current = current.get(part)
            continue
        return None
    return current


def _matches_metadata_filter(
    item: dict[str, Any],
    metadata_filter: MetadataFilterPayload | None,
) -> bool:
    if not metadata_filter or not metadata_filter.key.strip():
        return True
    source = item.get("source") or {}
    metadata = source.get("metadata") or {}
    key = metadata_filter.key.strip()
    if key.startswith("metadata."):
        key = key.removeprefix("metadata.")
    value = _get_nested_value(metadata, key)
    if metadata_filter.operator == "exists":
        return value is not None
    if value is None:
        return False
    if metadata_filter.operator == "equals":
        return str(value) == metadata_filter.value
    return metadata_filter.value.lower() in str(value).lower()


def _parse_metadata_filters_query(value: str) -> list[MetadataFilterPayload]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise BusinessError(1026, "Metadata 筛选条件格式不正确", 400) from exc
    if not isinstance(parsed, list):
        raise BusinessError(1026, "Metadata 筛选条件必须是数组", 400)
    return [MetadataFilterPayload(**item) for item in parsed if isinstance(item, dict)]


def _queue_payload(payload: AnnotationQueuePayload) -> dict[str, Any]:
    return {
        "name": payload.name.strip(),
        "description": payload.description,
        "scoreConfigIds": payload.score_config_ids,
        "assigneeIds": payload.assignee_ids,
    }


def _score_config_payload(payload: ScoreConfigPayload) -> dict[str, Any]:
    name = payload.name.strip()
    if not SCORE_CONFIG_NAME_PATTERN.match(name):
        raise BusinessError(1026, "评分指标名称包含不支持的字符", 400)

    categories = [
        {"label": category.label.strip(), "value": category.value}
        for category in payload.categories
        if category.label.strip()
    ]

    min_value = payload.min_value
    max_value = payload.max_value
    if payload.data_type == "NUMERIC":
        if min_value is not None and max_value is not None and max_value <= min_value:
            raise BusinessError(1026, "评分指标最大值必须大于最小值", 400)
        categories = []
    elif payload.data_type == "BOOLEAN":
        min_value = None
        max_value = None
        categories = LANGFUSE_BOOLEAN_CATEGORIES
    elif payload.data_type == "CATEGORICAL":
        min_value = None
        max_value = None
        if not categories:
            raise BusinessError(1026, "分类评分指标至少需要一个选项", 400)
        labels = [category["label"] for category in categories]
        values = [category["value"] for category in categories]
        if len(labels) != len(set(labels)):
            raise BusinessError(1026, "分类评分指标选项名称不能重复", 400)
        if len(values) != len(set(values)):
            raise BusinessError(1026, "分类评分指标选项值不能重复", 400)
    elif payload.data_type == "TEXT":
        min_value = None
        max_value = None
        categories = []

    return {
        "name": name,
        "dataType": payload.data_type,
        "description": payload.description,
        "minValue": min_value,
        "maxValue": max_value,
        "categories": categories,
    }


def _first_non_empty_list(
    primary: list[Any] | None,
    fallback: list[Any] | None,
) -> list[Any] | None:
    return primary if primary else fallback


def _score_payload(payload: AnnotationScorePayload | AnnotationBatchScorePayload) -> dict[str, Any]:
    return {
        "scores": [
            {
                "configId": score.config_id,
                "value": score.value,
                "stringValue": score.string_value,
                "comment": score.comment,
            }
            for score in payload.scores
        ]
    }


def _filter_annotation_items(
    items: list[dict[str, Any]],
    filters: AnnotationBatchFiltersPayload,
) -> list[dict[str, Any]]:
    filtered = [item for item in items if _matches_item_keyword(item, filters.keyword)]
    if filters.status:
        allowed_statuses = set(filters.status)
        filtered = [item for item in filtered if item["status"] in allowed_statuses]
    if filters.object_type:
        allowed_types = set(filters.object_type)
        filtered = [item for item in filtered if item["objectType"] in allowed_types]
    if filters.completed_by:
        allowed_users = set(filters.completed_by)
        filtered = [
            item
            for item in filtered
            if (item.get("completedBy") or {}).get("id") in allowed_users
        ]
    if filters.item_ids:
        allowed_item_ids = set(filters.item_ids)
        filtered = [item for item in filtered if item["id"] in allowed_item_ids]
    if filters.created_at_from or filters.created_at_to:
        filtered = [
            item
            for item in filtered
            if _matches_time_range(
                item.get("createdAt"),
                filters.created_at_from,
                filters.created_at_to,
            )
        ]
    if filters.completed_at_from or filters.completed_at_to:
        filtered = [
            item
            for item in filtered
            if _matches_time_range(
                item.get("completedAt"),
                filters.completed_at_from,
                filters.completed_at_to,
            )
        ]
    if filters.has_scores is not None:
        filtered = [
            item
            for item in filtered
            if bool(item.get("scores")) is filters.has_scores
        ]
    metadata_filters = filters.metadata_filters
    if filters.metadata_filter:
        metadata_filters = [filters.metadata_filter, *metadata_filters]
    for metadata_filter in metadata_filters:
        filtered = [
            item
            for item in filtered
            if _matches_metadata_filter(item, metadata_filter)
        ]
    return filtered


def _annotation_batch_preview(
    items: list[dict[str, Any]],
    filters: AnnotationBatchFiltersPayload,
    limit: int,
) -> dict[str, Any]:
    filtered = _filter_annotation_items(items, filters)
    pending_items = [item for item in filtered if item["status"] == "PENDING"]
    completed_count = len([item for item in filtered if item["status"] == "COMPLETED"])
    return {
        "totalCount": len(filtered),
        "pendingCount": len(pending_items),
        "completedCount": completed_count,
        "samples": pending_items[:limit],
        "filterSummary": _build_annotation_filter_summary(filters, len(pending_items)),
    }


def _build_annotation_filter_summary(
    filters: AnnotationBatchFiltersPayload,
    pending_count: int,
) -> str:
    parts = [f"待标注 {pending_count} 条"]
    if filters.keyword:
        parts.append(f"关键词：{filters.keyword}")
    if filters.status:
        parts.append(f"状态：{', '.join(filters.status)}")
    if filters.object_type:
        parts.append(f"对象类型：{', '.join(filters.object_type)}")
    if filters.completed_by:
        parts.append(f"标注人：{', '.join(filters.completed_by)}")
    if filters.created_at_from or filters.created_at_to:
        parts.append(
            f"加入时间：{filters.created_at_from or '-'} ~ {filters.created_at_to or '-'}"
        )
    if filters.completed_at_from or filters.completed_at_to:
        parts.append(
            f"完成时间：{filters.completed_at_from or '-'} ~ {filters.completed_at_to or '-'}"
        )
    if filters.has_scores is not None:
        parts.append(f"评分状态：{'有评分' if filters.has_scores else '无评分'}")
    if filters.metadata_filter and filters.metadata_filter.key:
        parts.append(
            f"Metadata：{filters.metadata_filter.key} {filters.metadata_filter.operator}"
        )
    if filters.metadata_filters:
        parts.append(f"Metadata：{len(filters.metadata_filters)} 个条件")
    if filters.item_ids:
        parts.append(f"指定失败项：{len(filters.item_ids)} 条")
    return "；".join(parts)


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
    created_at_from: str = Query(default="", alias="createdAtFrom"),
    created_at_to: str = Query(default="", alias="createdAtTo"),
    completed_at_from: str = Query(default="", alias="completedAtFrom"),
    completed_at_to: str = Query(default="", alias="completedAtTo"),
    has_scores: bool | None = Query(default=None, alias="hasScores"),
    metadata_key: str = Query(default="", alias="metadataKey"),
    metadata_operator: Literal["contains", "equals", "exists"] = Query(
        default="contains",
        alias="metadataOperator",
    ),
    metadata_value: str = Query(default="", alias="metadataValue"),
    metadata_filters: str = Query(default="", alias="metadataFilters"),
    item_ids: list[str] | None = Query(default=None, alias="itemIds"),
    item_ids_bracket: list[str] | None = Query(default=None, alias="itemIds[]"),
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
    effective_item_ids = _first_non_empty_list(item_ids, item_ids_bracket)
    parsed_metadata_filters = _parse_metadata_filters_query(metadata_filters)
    filtered = _filter_annotation_items(
        filtered,
        AnnotationBatchFiltersPayload(
            keyword="",
            status=effective_status or [],
            objectType=effective_object_type or [],
            completedBy=effective_completed_by or [],
            createdAtFrom=created_at_from,
            createdAtTo=created_at_to,
            completedAtFrom=completed_at_from,
            completedAtTo=completed_at_to,
            hasScores=has_scores,
            metadataFilter=MetadataFilterPayload(
                key=metadata_key,
                operator=metadata_operator,
                value=metadata_value,
            )
            if metadata_key
            else None,
            metadataFilters=parsed_metadata_filters,
            itemIds=effective_item_ids or [],
        ),
    )
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


@router.post("/annotation-queues/{queue_id}/batch-preview")
async def preview_annotation_batch(
    project_id: str,
    queue_id: str,
    payload: AnnotationBatchPreviewPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    items = await reader.list_annotation_queue_items_for_user(
        project_id,
        queue_id,
        current_user.user_id,
    )
    return success(_annotation_batch_preview(items, payload.filters, payload.limit))


@router.post("/annotation-queues/{queue_id}/batch-scores")
async def save_annotation_batch_scores(
    project_id: str,
    queue_id: str,
    payload: AnnotationBatchScorePayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    items = await reader.list_annotation_queue_items_for_user(
        project_id,
        queue_id,
        current_user.user_id,
    )
    filtered = _filter_annotation_items(items, payload.filters)
    pending_items = [item for item in filtered if item["status"] == "PENDING"]
    completed_count = len([item for item in filtered if item["status"] == "COMPLETED"])

    if payload.expected_pending_count is not None and (
        payload.expected_pending_count != len(pending_items)
    ):
        raise BusinessError(
            code=1027,
            message="批量标注命中数量已变化，请刷新预览后重试",
            status_code=409,
        )
    if len(pending_items) > 100 and not payload.confirm_large_batch:
        raise BusinessError(
            code=1028,
            message="本次批量标注超过 100 条，请确认后再提交",
            status_code=409,
        )

    score_payload = _score_payload(payload)
    success_item_ids: list[str] = []
    failures: list[dict[str, Any]] = []
    for item in pending_items:
        try:
            await reader.save_annotation_scores_for_user(
                project_id,
                queue_id,
                item["id"],
                current_user.user_id,
                score_payload,
            )
            success_item_ids.append(item["id"])
        except BusinessError as exc:
            failures.append({"itemId": item["id"], "reason": exc.message})

    return success(
        {
            "successCount": len(success_item_ids),
            "failureCount": len(failures),
            "skippedCount": completed_count,
            "successItemIds": success_item_ids,
            "failures": failures,
            "filterSummary": _build_annotation_filter_summary(
                payload.filters,
                len(pending_items),
            ),
        }
    )


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
        _score_payload(payload),
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
