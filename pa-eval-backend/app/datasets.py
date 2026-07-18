from typing import Any, Literal
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.auth_context import CurrentUserContext, get_current_user_context
from app.config import Settings, get_settings
from app.dataset_exports import generate_dataset_export_file
from app.errors import BusinessError
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.response import success

router = APIRouter(prefix="/api/projects/{project_id}/datasets", tags=["datasets"])

DatasetType = Literal["evaluation", "badcase", "golden", "anomaly"]
DatasetExportFormat = Literal["xlsx", "csv", "txt"]
DatasetItemStatus = Literal["ACTIVE", "ARCHIVED"]

EXPORT_MEDIA_TYPES = {
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "csv": "text/csv; charset=utf-8",
    "txt": "text/plain; charset=utf-8",
}


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
    status: DatasetItemStatus | None = None
    source_trace_id: str | None = Field(default=None, alias="sourceTraceId")
    source_observation_id: str | None = Field(default=None, alias="sourceObservationId")


class DatasetExportJobPayload(BaseModel):
    format: DatasetExportFormat


def _to_public_export_job(job: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in job.items() if key != "filePath"}


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
    result = {
        "input": payload.input,
        "expectedOutput": payload.expected_output,
        "metadata": payload.metadata,
    }
    if payload.status is not None:
        result["status"] = payload.status
    if payload.source_trace_id is not None:
        result["sourceTraceId"] = payload.source_trace_id
    if payload.source_observation_id is not None:
        result["sourceObservationId"] = payload.source_observation_id

    return result


@router.post("/{dataset_id}/export-jobs")
async def create_dataset_export_job(
    project_id: str,
    dataset_id: str,
    payload: DatasetExportJobPayload,
    background_tasks: BackgroundTasks,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    job = await reader.create_dataset_export_job_for_user(
        project_id,
        dataset_id,
        current_user.user_id,
        payload.format,
    )
    background_tasks.add_task(
        generate_dataset_export_file,
        reader=reader,
        project_id=project_id,
        dataset_id=dataset_id,
        job_id=job["id"],
        user_id=current_user.user_id,
        export_format=payload.format,
        storage_dir=settings.pa_eval_export_storage_dir,
    )
    return success(_to_public_export_job(job))


@router.get("/{dataset_id}/export-jobs/{job_id}")
async def get_dataset_export_job(
    project_id: str,
    dataset_id: str,
    job_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    job = await reader.get_dataset_export_job_for_user(
        project_id,
        dataset_id,
        job_id,
        current_user.user_id,
    )
    return success(_to_public_export_job(job))


@router.get("/{dataset_id}/export-jobs/{job_id}/download")
async def download_dataset_export_job(
    project_id: str,
    dataset_id: str,
    job_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> FileResponse:
    job = await reader.get_dataset_export_job_for_user(
        project_id,
        dataset_id,
        job_id,
        current_user.user_id,
    )
    if job["status"] != "SUCCEEDED":
        raise BusinessError(1028, "数据集导出任务尚未完成", 409)

    file_path = Path(job.get("filePath") or "")
    if not file_path.is_file():
        raise BusinessError(1029, "数据集导出文件不存在或已过期", 404)

    return FileResponse(
        file_path,
        media_type=EXPORT_MEDIA_TYPES.get(job["format"], "application/octet-stream"),
        filename=job.get("fileName") or file_path.name,
    )


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
    return success(
        await reader.list_datasets_for_user(
            project_id,
            current_user.user_id,
            page=page,
            page_size=page_size,
            keyword=keyword,
            dataset_type=dataset_type,
        )
    )


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


@router.delete("/{dataset_id}/items/{item_id}")
async def delete_dataset_item(
    project_id: str,
    dataset_id: str,
    item_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    await reader.delete_dataset_item_for_user(
        project_id,
        dataset_id,
        item_id,
        current_user.user_id,
    )
    return success({"id": item_id})


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


@router.get("/{dataset_id}/items/status-counts")
async def count_dataset_item_statuses(
    project_id: str,
    dataset_id: str,
    keyword: str | None = Query(default=None),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    return success(
        await reader.count_dataset_item_statuses_for_user(
            project_id,
            dataset_id,
            current_user.user_id,
            keyword=keyword,
        )
    )


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
    return success(
        await reader.list_dataset_items_for_user(
            project_id,
            dataset_id,
            current_user.user_id,
            page=page,
            page_size=page_size,
            keyword=keyword,
            status=status,
        )
    )
