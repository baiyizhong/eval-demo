from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.auth_context import CurrentUserContext, get_current_user_context
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.response import success

router = APIRouter(prefix="/api/projects/{project_id}/datasets", tags=["datasets"])

DatasetType = Literal["evaluation", "badcase", "golden", "anomaly"]


class DatasetPayload(BaseModel):
    name: str = Field(min_length=1)
    type: DatasetType
    description: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)
    input_schema: dict[str, Any] = Field(default_factory=dict, alias="inputSchema")
    expected_output_schema: dict[str, Any] = Field(
        default_factory=dict,
        alias="expectedOutputSchema",
    )


class DatasetItemPayload(BaseModel):
    input: Any = Field(default_factory=dict)
    expected_output: Any = Field(default_factory=dict, alias="expectedOutput")
    metadata: dict[str, Any] = Field(default_factory=dict)


def _paginate(items: list[dict[str, Any]], page: int, page_size: int) -> dict[str, Any]:
    start = (page - 1) * page_size
    return {"total": len(items), "datas": items[start : start + page_size]}


def _matches_dataset_keyword(item: dict[str, Any], keyword: str | None) -> bool:
    if not keyword:
        return True

    needle = keyword.lower()
    fields = [
        item.get("id"),
        item.get("name"),
        item.get("description"),
        item.get("type"),
    ]
    return any(isinstance(field, str) and needle in field.lower() for field in fields)


def _matches_item_keyword(item: dict[str, Any], keyword: str | None) -> bool:
    if not keyword:
        return True

    needle = keyword.lower()
    fields = [
        item.get("id"),
        item.get("sourceTraceId"),
        item.get("sourceObservationId"),
        str(item.get("input") or ""),
        str(item.get("expectedOutput") or ""),
        str(item.get("metadata") or ""),
    ]
    return any(needle in field.lower() for field in fields)


def _to_dataset_payload(payload: DatasetPayload) -> dict[str, Any]:
    metadata = {**payload.metadata, "type": payload.type}
    return {
        "name": payload.name.strip(),
        "type": payload.type,
        "description": payload.description,
        "metadata": metadata,
        "inputSchema": payload.input_schema,
        "expectedOutputSchema": payload.expected_output_schema,
    }


def _to_dataset_item_payload(payload: DatasetItemPayload) -> dict[str, Any]:
    return {
        "input": payload.input,
        "expectedOutput": payload.expected_output,
        "metadata": payload.metadata,
    }


@router.get("")
async def list_datasets(
    project_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200, alias="pageSize"),
    keyword: str | None = Query(default=None),
    dataset_type: DatasetType | None = Query(default=None, alias="type"),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    datasets = await reader.list_datasets_for_user(project_id, current_user.user_id)
    filtered = [item for item in datasets if _matches_dataset_keyword(item, keyword)]

    if dataset_type:
        filtered = [item for item in filtered if item["type"] == dataset_type]

    return success(_paginate(filtered, page, page_size))


@router.post("/{dataset_id}/items")
async def create_dataset_item(
    project_id: str,
    dataset_id: str,
    payload: DatasetItemPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    item = await reader.create_dataset_item_for_user(
        project_id,
        dataset_id,
        current_user.user_id,
        _to_dataset_item_payload(payload),
    )
    return success(item)


@router.patch("/{dataset_id}/items/{item_id}")
async def update_dataset_item(
    project_id: str,
    dataset_id: str,
    item_id: str,
    payload: DatasetItemPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    item = await reader.update_dataset_item_for_user(
        project_id,
        dataset_id,
        item_id,
        current_user.user_id,
        _to_dataset_item_payload(payload),
    )
    return success(item)


@router.post("/{dataset_id}/items/{item_id}/archive")
async def archive_dataset_item(
    project_id: str,
    dataset_id: str,
    item_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    item = await reader.archive_dataset_item_for_user(
        project_id,
        dataset_id,
        item_id,
        current_user.user_id,
    )
    return success(item)


@router.post("")
async def create_dataset(
    project_id: str,
    payload: DatasetPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    dataset = await reader.create_dataset_for_user(
        project_id,
        current_user.user_id,
        _to_dataset_payload(payload),
    )
    return success(dataset)


@router.get("/{dataset_id}")
async def get_dataset(
    project_id: str,
    dataset_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    dataset = await reader.get_dataset_for_user(
        project_id,
        dataset_id,
        current_user.user_id,
    )
    return success(dataset)


@router.patch("/{dataset_id}")
async def update_dataset(
    project_id: str,
    dataset_id: str,
    payload: DatasetPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    dataset = await reader.update_dataset_for_user(
        project_id,
        dataset_id,
        current_user.user_id,
        _to_dataset_payload(payload),
    )
    return success(dataset)


@router.delete("/{dataset_id}")
async def delete_dataset(
    project_id: str,
    dataset_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    await reader.delete_dataset_for_user(
        project_id,
        dataset_id,
        current_user.user_id,
    )
    return success({"id": dataset_id})


@router.get("/{dataset_id}/metrics")
async def get_dataset_metrics(
    project_id: str,
    dataset_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    metrics = await reader.get_dataset_metric_summary_for_user(
        project_id,
        dataset_id,
        current_user.user_id,
    )
    return success(metrics)


@router.get("/{dataset_id}/items")
async def list_dataset_items(
    project_id: str,
    dataset_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200, alias="pageSize"),
    keyword: str | None = Query(default=None),
    status: list[str] | None = Query(default=None),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    items = await reader.list_dataset_items_for_user(
        project_id,
        dataset_id,
        current_user.user_id,
    )
    filtered = [item for item in items if _matches_item_keyword(item, keyword)]

    if status:
        allowed_statuses = set(status)
        filtered = [item for item in filtered if item["status"] in allowed_statuses]

    return success(_paginate(filtered, page, page_size))
