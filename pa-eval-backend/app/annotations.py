import asyncio
import json
import logging
import re
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Body, Depends, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.annotation_exports import (
    build_annotation_export_preview,
    generate_annotation_export_archive,
)
from app.auth_context import CurrentUserContext, get_current_user_context
from app.config import Settings, get_settings
from app.errors import BusinessError
from app.langfuse_clickhouse import (
    LangfuseClickHouseReader,
    LangfuseClickHouseScoreWriter,
    get_langfuse_clickhouse_reader,
    get_langfuse_clickhouse_score_writer,
)
from app.langfuse_client import (
    LangfuseAdminClient,
    get_langfuse_client,
    repair_legacy_boolean_score_configs,
)
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.response import success
from app.score_configs import (
    clickhouse_score_payload,
    langfuse_boolean_categories,
    strip_pa_score_fields,
)

router = APIRouter(prefix="/api/projects/{project_id}", tags=["annotations"])
logger = logging.getLogger(__name__)

AnnotationObjectType = Literal["TRACE", "OBSERVATION", "SESSION"]
AnnotationItemStatus = Literal["PENDING", "COMPLETED"]
ScoreConfigDataType = Literal["NUMERIC", "CATEGORICAL", "BOOLEAN", "TEXT"]
AnnotationAssignmentStrategy = Literal["average", "random", "weighted"]
AnnotationExportScope = Literal["filtered", "selected"]
AnnotationExportFormat = Literal["xlsx", "csv", "txt"]
TraceDatasetImportJobStatus = Literal["PENDING", "RUNNING", "SUCCEEDED", "FAILED"]
TraceAnnotationTaskJobStatus = Literal["PENDING", "RUNNING", "SUCCEEDED", "FAILED"]
ANNOTATION_ITEM_STATUSES: tuple[AnnotationItemStatus, ...] = ("PENDING", "COMPLETED")
ANNOTATION_OBJECT_TYPES: tuple[AnnotationObjectType, ...] = (
    "TRACE",
    "OBSERVATION",
    "SESSION",
)
SCORE_CONFIG_NAME_PATTERN = re.compile(r"^[\w .()\-\u4e00-\u9fff]+$")
TRACE_DATASET_IMPORT_BATCH_SIZE = 500
TRACE_ANNOTATION_TASK_BATCH_SIZE = 500
TRACE_DATASET_IMPORT_JOB_TTL = timedelta(hours=2)
TRACE_ANNOTATION_TASK_JOB_TTL = timedelta(hours=2)
MAX_EXPORT_BASE_NAME_LENGTH = 120
ANNOTATION_SCAN_BATCH_SIZE = 5000
ANNOTATION_SCORE_SCOPE_MAX_ITEMS = 500


@dataclass
class TraceBulkWorkerHandle:
    task: asyncio.Task[None] | None
    stop_event: asyncio.Event | None

    async def stop(self) -> None:
        if self.stop_event is not None:
            self.stop_event.set()
        if self.task is not None:
            self.task.cancel()
            with suppress(asyncio.CancelledError):
                await self.task


class AnnotationQueuePayload(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    description: str = Field(default="", max_length=200)
    score_config_ids: list[str] = Field(min_length=1, alias="scoreConfigIds")
    assignee_ids: list[str] = Field(default_factory=list, alias="assigneeIds")
    assignment_strategy: AnnotationAssignmentStrategy = Field(
        default="average",
        alias="assignmentStrategy",
    )
    assignment_weights: dict[str, int] = Field(
        default_factory=dict,
        alias="assignmentWeights",
    )


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


class TraceFilterSelectionPayload(BaseModel):
    type: Literal["FILTER"]
    filters: dict[str, Any] = Field(default_factory=dict)
    excluded_trace_ids: list[str] = Field(
        default_factory=list,
        alias="excludedTraceIds",
    )


class AnnotationTraceTaskPayload(BaseModel):
    trace_ids: list[str] = Field(min_length=1, alias="traceIds")
    queue_id: str | None = Field(default=None, alias="queueId")
    queue_name: str | None = Field(default=None, alias="queueName")
    assignee_ids: list[str] = Field(default_factory=list, alias="assigneeIds")
    assignment_strategy: AnnotationAssignmentStrategy = Field(
        default="average",
        alias="assignmentStrategy",
    )
    assignment_weights: dict[str, int] = Field(
        default_factory=dict,
        alias="assignmentWeights",
    )


class AnnotationTraceTaskJobPayload(AnnotationTraceTaskPayload):
    trace_ids: list[str] = Field(default_factory=list, alias="traceIds")
    selection: TraceFilterSelectionPayload | None = None

    @model_validator(mode="after")
    def validate_selection(self) -> "AnnotationTraceTaskJobPayload":
        if not self.trace_ids and self.selection is None:
            raise ValueError("traceIds 或 selection 必须提供一个")
        return self


class TraceDatasetItemsPayload(BaseModel):
    dataset_id: str = Field(min_length=1, alias="datasetId")
    trace_ids: list[str] = Field(min_length=1, alias="traceIds")


class TraceDatasetImportJobPayload(BaseModel):
    dataset_id: str = Field(min_length=1, alias="datasetId")
    trace_ids: list[str] = Field(default_factory=list, alias="traceIds")
    selection: TraceFilterSelectionPayload | None = None

    @model_validator(mode="after")
    def validate_selection(self) -> "TraceDatasetImportJobPayload":
        if not self.trace_ids and self.selection is None:
            raise ValueError("traceIds 或 selection 必须提供一个")
        return self


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
    object_type: list[AnnotationObjectType] = Field(
        default_factory=list, alias="objectType"
    )
    completed_by: list[str] = Field(default_factory=list, alias="completedBy")
    assignee_ids: list[str] = Field(default_factory=list, alias="assigneeIds")
    created_at_from: str = Field(default="", alias="createdAtFrom")
    created_at_to: str = Field(default="", alias="createdAtTo")
    completed_at_from: str = Field(default="", alias="completedAtFrom")
    completed_at_to: str = Field(default="", alias="completedAtTo")
    has_scores: bool | None = Field(default=None, alias="hasScores")
    metadata_filter: MetadataFilterPayload | None = Field(
        default=None, alias="metadataFilter"
    )
    metadata_filters: list[MetadataFilterPayload] = Field(
        default_factory=list,
        alias="metadataFilters",
    )
    input_filters: list[MetadataFilterPayload] = Field(
        default_factory=list,
        alias="inputFilters",
    )
    output_filters: list[MetadataFilterPayload] = Field(
        default_factory=list,
        alias="outputFilters",
    )
    item_ids: list[str] = Field(default_factory=list, alias="itemIds")

    model_config = ConfigDict(populate_by_name=True)


class AnnotationBatchPreviewPayload(BaseModel):
    filters: AnnotationBatchFiltersPayload = Field(
        default_factory=AnnotationBatchFiltersPayload
    )
    limit: int = Field(default=5, ge=1, le=20)


class AnnotationBatchScorePayload(BaseModel):
    filters: AnnotationBatchFiltersPayload = Field(
        default_factory=AnnotationBatchFiltersPayload
    )
    scores: list[AnnotationScoreInput] = Field(min_length=1)
    expected_pending_count: int | None = Field(
        default=None, alias="expectedPendingCount"
    )
    expected_match_count: int | None = Field(default=None, alias="expectedMatchCount")
    confirm_large_batch: bool = Field(default=False, alias="confirmLargeBatch")


class AnnotationExportPreviewPayload(BaseModel):
    scope: AnnotationExportScope = "filtered"
    format: AnnotationExportFormat = "xlsx"
    filters: AnnotationBatchFiltersPayload = Field(
        default_factory=AnnotationBatchFiltersPayload
    )
    item_ids: list[str] = Field(default_factory=list, alias="itemIds")
    preview_limit: int = Field(default=20, ge=1, le=100, alias="previewLimit")
    split_metadata: bool = Field(default=False, alias="splitMetadata")


class AnnotationExportJobPayload(BaseModel):
    scope: AnnotationExportScope = "filtered"
    format: AnnotationExportFormat
    filters: AnnotationBatchFiltersPayload = Field(
        default_factory=AnnotationBatchFiltersPayload
    )
    item_ids: list[str] = Field(default_factory=list, alias="itemIds")
    split_metadata: bool = Field(default=False, alias="splitMetadata")
    file_name: str = Field(default="", alias="fileName")


class DeleteItemsPayload(BaseModel):
    item_ids: list[str] = Field(min_length=1, alias="itemIds")


class UpdateItemAssigneesPayload(BaseModel):
    item_ids: list[str] = Field(min_length=1, alias="itemIds")
    assignee_user_id: str = Field(min_length=1, alias="assigneeUserId")


class AddAnnotationItemToDatasetPayload(BaseModel):
    dataset_id: str = Field(min_length=1, alias="datasetId")
    input: Any
    expected_output: Any = Field(alias="expectedOutput")
    metadata: dict[str, Any] = Field(default_factory=dict)


def _to_public_annotation_export_job(job: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in job.items() if key != "filePath"}


def _safe_annotation_export_base_name(value: str) -> str:
    sanitized = re.sub(r'[\\/:*?"<>|]+', "-", value)
    sanitized = re.sub(r"\s+", " ", sanitized).strip(".- ")
    return sanitized[:MAX_EXPORT_BASE_NAME_LENGTH].rstrip(".- ") or "annotation-export"


def _default_annotation_export_base_name(
    queue: dict[str, Any],
    total_count: int,
) -> str:
    exported_at = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    queue_name = str(queue.get("name") or queue.get("id") or "annotation-export")
    return _safe_annotation_export_base_name(f"{queue_name}_{exported_at}_批量导出")


def _annotation_export_base_name_from_payload(
    file_name: str,
    *,
    queue: dict[str, Any],
    total_count: int,
) -> str:
    if not file_name.strip():
        return _default_annotation_export_base_name(queue, total_count)

    safe_file_name = _safe_annotation_export_base_name(file_name)
    if safe_file_name.lower().endswith(".zip"):
        safe_file_name = safe_file_name[:-4].rstrip(".- ")
    return _safe_annotation_export_base_name(safe_file_name)


def _is_safe_annotation_export_path(
    *,
    file_path: Path,
    settings: Settings,
    project_id: str,
) -> bool:
    expected_root = (
        Path(settings.pa_eval_export_storage_dir).expanduser().resolve()
        / project_id
        / "annotation-exports"
    )
    candidate = file_path.expanduser().resolve()
    return (
        candidate.is_file()
        and candidate.suffix == ".zip"
        and candidate.is_relative_to(expected_root)
    )


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


def _payload_to_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


def _payload_to_filter_value(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def _matches_payload_filter(
    item: dict[str, Any],
    field: Literal["input", "output"],
    payload_filter: MetadataFilterPayload,
) -> bool:
    if not payload_filter.key.strip() and not payload_filter.value.strip():
        return True
    source = item.get("source") or {}
    payload = _payload_to_filter_value(source.get(field))
    key = payload_filter.key.strip()
    value = (
        _get_nested_value(payload, key)
        if isinstance(payload, dict) and key
        else payload
    )
    if payload_filter.operator == "exists":
        return value is not None
    if value is None:
        return False
    value_text = _payload_to_text(value)
    if payload_filter.operator == "equals":
        return value_text == payload_filter.value
    return payload_filter.value.lower() in value_text.lower()


async def _enrich_annotation_items_with_trace_source(
    project_id: str,
    items: list[dict[str, Any]],
    trace_reader: LangfuseClickHouseReader,
) -> list[dict[str, Any]]:
    enriched_items: list[dict[str, Any]] = []
    trace_cache: dict[str, dict[str, Any] | None] = {}

    for item in items:
        if item.get("objectType") != "TRACE" or not _needs_trace_source(item):
            enriched_items.append(item)
            continue

        trace_id = str(item.get("objectId") or "")
        if not trace_id:
            enriched_items.append(item)
            continue

        if trace_id not in trace_cache:
            try:
                trace_cache[trace_id] = await trace_reader.get_trace(
                    project_id, trace_id
                )
            except BusinessError:
                trace_cache[trace_id] = None

        trace = trace_cache[trace_id]
        if not trace:
            enriched_items.append(item)
            continue

        enriched_items.append(_merge_trace_source(item, trace))

    return enriched_items


async def _enrich_annotation_items_with_trace_sources(
    project_id: str,
    items: list[dict[str, Any]],
    trace_reader: LangfuseClickHouseReader,
) -> list[dict[str, Any]]:
    trace_ids = [
        str(item.get("objectId") or "")
        for item in items
        if item.get("objectType") == "TRACE"
        and _needs_trace_source(item)
        and item.get("objectId")
    ]
    if not trace_ids:
        return items

    traces = await trace_reader.list_trace_sources(project_id, trace_ids)
    if not traces:
        return items

    return [
        _merge_trace_source(item, traces[str(item.get("objectId"))])
        if item.get("objectType") == "TRACE"
        and str(item.get("objectId") or "") in traces
        else item
        for item in items
    ]


async def _enrich_annotation_items_with_clickhouse_scores(
    project_id: str,
    queue_id: str,
    items: list[dict[str, Any]],
    trace_reader: LangfuseClickHouseReader,
) -> list[dict[str, Any]]:
    if not items:
        return items

    scores: list[dict[str, Any]] = []
    for batch in _chunk_items(items, ANNOTATION_SCORE_SCOPE_MAX_ITEMS):
        scores.extend(
            await trace_reader.list_scores_by_queue(
                project_id,
                queue_id,
                trace_ids=[
                    str(item.get("objectId") or "")
                    for item in batch
                    if item.get("objectType") == "TRACE"
                ],
                observation_ids=[
                    str(item.get("objectId") or "")
                    for item in batch
                    if item.get("objectType") == "OBSERVATION"
                ],
                session_ids=[
                    str(item.get("objectId") or "")
                    for item in batch
                    if item.get("objectType") == "SESSION"
                ],
                annotation_item_ids=[str(item.get("id") or "") for item in batch],
            )
        )
    annotation_scores = [
        score
        for score in scores
        if str(score.get("source") or "") == "ANNOTATION"
        and str(score.get("queueId") or queue_id) == queue_id
    ]
    if not annotation_scores:
        return items

    scores_by_item_id: dict[str, list[dict[str, Any]]] = {}
    scores_by_object: dict[tuple[str, str], list[dict[str, Any]]] = {}

    for score in annotation_scores:
        metadata = (
            score.get("metadata") if isinstance(score.get("metadata"), dict) else {}
        )
        annotation_item_id = str(metadata.get("annotationItemId") or "")
        if annotation_item_id:
            scores_by_item_id.setdefault(annotation_item_id, []).append(score)

        object_key = _annotation_score_object_key(score)
        if object_key:
            scores_by_object.setdefault(object_key, []).append(score)

    enriched_items: list[dict[str, Any]] = []
    for item in items:
        item_id = str(item.get("id") or "")
        item_scores = scores_by_item_id.get(item_id)
        if item_scores is None:
            item_scores = scores_by_object.get(_annotation_item_object_key(item))

        enriched_items.append(
            {
                **item,
                "scores": item_scores
                if item_scores is not None
                else item.get("scores", []),
            }
        )

    return enriched_items


def _annotation_item_object_key(item: dict[str, Any]) -> tuple[str, str]:
    return (
        str(item.get("objectType") or ""),
        str(item.get("objectId") or ""),
    )


def _annotation_score_object_key(score: dict[str, Any]) -> tuple[str, str] | None:
    session_id = str(score.get("sessionId") or "")
    if session_id:
        return ("SESSION", session_id)

    observation_id = str(score.get("observationId") or "")
    if observation_id:
        return ("OBSERVATION", observation_id)

    trace_id = str(score.get("traceId") or "")
    if trace_id:
        return ("TRACE", trace_id)

    return None


def _needs_trace_source(item: dict[str, Any]) -> bool:
    source = item.get("source") if isinstance(item.get("source"), dict) else {}
    return (
        _is_empty_payload(source.get("input"))
        and _is_empty_payload(source.get("output"))
        and not source.get("metadata")
    )


def _is_empty_payload(value: Any) -> bool:
    return value is None or value == "" or value == {} or value == []


def _merge_trace_source(item: dict[str, Any], trace: dict[str, Any]) -> dict[str, Any]:
    source = item.get("source") if isinstance(item.get("source"), dict) else {}
    return {
        **item,
        "source": {
            **source,
            "objectId": source.get("objectId") or item.get("objectId") or "",
            "objectType": source.get("objectType") or item.get("objectType") or "TRACE",
            "title": trace.get("name")
            or source.get("title")
            or item.get("objectId")
            or "",
            "input": trace.get("input")
            if trace.get("input") is not None
            else source.get("input"),
            "output": trace.get("output")
            if trace.get("output") is not None
            else source.get("output"),
            "metadata": trace.get("metadata") or source.get("metadata") or {},
            "traceId": trace.get("traceId")
            or source.get("traceId")
            or item.get("objectId")
            or "",
            "observationId": source.get("observationId") or "",
            "sessionId": trace.get("sessionId") or source.get("sessionId") or "",
            "userId": trace.get("userId") or source.get("userId") or "",
            "latencyMs": trace.get("latency") or source.get("latencyMs") or 0,
            "costUsd": source.get("costUsd") or 0,
            "createdAt": trace.get("createdAt")
            or source.get("createdAt")
            or item.get("createdAt")
            or "",
        },
    }


def _parse_filter_conditions_query(
    value: str, label: str
) -> list[MetadataFilterPayload]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise BusinessError(1026, f"{label} 筛选条件格式不正确", 400) from exc
    if not isinstance(parsed, list):
        raise BusinessError(1026, f"{label} 筛选条件必须是数组", 400)
    return [MetadataFilterPayload(**item) for item in parsed if isinstance(item, dict)]


def _parse_metadata_filters_query(value: str) -> list[MetadataFilterPayload]:
    return _parse_filter_conditions_query(value, "Metadata")


def _queue_payload(payload: AnnotationQueuePayload) -> dict[str, Any]:
    return {
        "name": payload.name.strip(),
        "description": payload.description,
        "scoreConfigIds": payload.score_config_ids,
        "assigneeIds": payload.assignee_ids,
        "assignmentStrategy": payload.assignment_strategy,
        "assignmentWeights": payload.assignment_weights,
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
        categories = langfuse_boolean_categories()
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


def _chunk_items(items: list[Any], size: int) -> list[list[Any]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def _score_payload(
    payload: AnnotationScorePayload | AnnotationBatchScorePayload,
) -> dict[str, Any]:
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


async def _save_annotation_scores_with_langfuse_api(
    *,
    project_id: str,
    queue_id: str,
    item_id: str,
    user_id: str,
    score_payload: dict[str, Any],
    reader: LangfuseDatabaseReader,
    langfuse_client: LangfuseAdminClient,
    score_writer: LangfuseClickHouseScoreWriter | None = None,
) -> dict[str, Any]:
    score_requests = await reader.prepare_annotation_score_payloads_for_user(
        project_id,
        queue_id,
        item_id,
        user_id,
        score_payload,
    )
    if score_requests:
        api_key = await reader.get_project_api_key_credentials_for_user(
            project_id,
            user_id,
        )
        failures = await _write_annotation_score_requests(
            project_id=project_id,
            user_id=user_id,
            score_requests=score_requests,
            api_key=api_key,
            reader=reader,
            langfuse_client=langfuse_client,
            score_writer=score_writer,
            write_through_clickhouse=False,
        )
        if failures:
            raise BusinessError(1035, "评分保存失败，请稍后重试", 502)
    return await reader.complete_annotation_queue_item_for_user(
        project_id,
        queue_id,
        item_id,
        user_id,
    )


async def _prefill_annotation_scores_from_trace_scores(
    *,
    project_id: str,
    queue_id: str,
    created_items: list[dict[str, Any]],
    score_config_ids: list[str],
    user_id: str,
    reader: LangfuseDatabaseReader,
    trace_reader: LangfuseClickHouseReader,
    langfuse_client: LangfuseAdminClient,
    score_writer: LangfuseClickHouseScoreWriter | None = None,
) -> list[dict[str, str]]:
    return await _prefill_annotation_scores_from_trace_rows(
        project_id=project_id,
        queue_id=queue_id,
        created_items=created_items,
        score_config_ids=score_config_ids,
        user_id=user_id,
        reader=reader,
        trace_reader=trace_reader,
        langfuse_client=langfuse_client,
        score_writer=score_writer,
    )


async def _prefill_annotation_scores_from_trace_rows(
    *,
    project_id: str,
    queue_id: str,
    created_items: list[dict[str, Any]],
    score_config_ids: list[str],
    user_id: str,
    reader: LangfuseDatabaseReader,
    trace_reader: LangfuseClickHouseReader,
    langfuse_client: LangfuseAdminClient,
    score_writer: LangfuseClickHouseScoreWriter | None = None,
) -> list[dict[str, str]]:
    if not created_items or not score_config_ids:
        return []

    item_by_trace_id = {
        str(item.get("traceId") or ""): str(item.get("itemId") or "")
        for item in created_items
        if item.get("traceId") and item.get("itemId")
    }
    if not item_by_trace_id:
        return []

    traces = await trace_reader.list_traces_by_ids(
        project_id,
        list(item_by_trace_id),
        fields="scores",
    )
    batch_items: list[dict[str, Any]] = []
    for trace in traces:
        trace_id = str(trace.get("traceId") or "")
        item_id = item_by_trace_id.get(trace_id)
        if not item_id:
            continue
        score_payload = _trace_scores_to_annotation_score_payload(
            trace.get("scores") or [],
            score_config_ids,
        )
        if not score_payload["scores"]:
            continue
        batch_items.append(
            {
                "itemId": item_id,
                "traceId": trace_id,
                "scorePayload": score_payload,
            }
        )
    if not batch_items:
        return []
    score_requests = await reader.prepare_annotation_score_payloads_batch_for_user(
        project_id,
        queue_id,
        user_id,
        batch_items,
    )
    if not score_requests:
        return []
    if score_writer is None:
        return [
            {
                "scoreId": str(score_request.get("id") or ""),
                "traceId": str(score_request.get("traceId") or ""),
                "reason": "ClickHouse Score 写入器不可用",
            }
            for score_request in score_requests
        ]
    try:
        await score_writer.upsert_annotation_scores(
            project_id,
            user_id,
            [clickhouse_score_payload(score_request) for score_request in score_requests],
        )
    except Exception as exc:
        logger.warning(
            "Failed to batch prefill annotation scores: project_id=%s queue_id=%s",
            project_id,
            queue_id,
            exc_info=True,
        )
        return [
            {
                "scoreId": str(score_request.get("id") or ""),
                "traceId": str(score_request.get("traceId") or ""),
                "reason": str(exc),
            }
            for score_request in score_requests
        ]
    return []


async def _write_annotation_score_requests(
    *,
    project_id: str,
    user_id: str,
    score_requests: list[dict[str, Any]],
    api_key: dict[str, str],
    reader: LangfuseDatabaseReader,
    langfuse_client: LangfuseAdminClient,
    score_writer: LangfuseClickHouseScoreWriter | None,
    write_through_clickhouse: bool,
) -> list[dict[str, str]]:
    settings = getattr(reader, "_settings", None)
    concurrency = max(
        1,
        int(getattr(settings, "pa_eval_annotation_score_concurrency", 8)),
    )
    semaphore = asyncio.Semaphore(concurrency)
    await repair_legacy_boolean_score_configs(
        langfuse_client,
        api_key["publicKey"],
        api_key["secretKey"],
        score_requests,
    )

    async def write_one(raw_score_request: dict[str, Any]) -> dict[str, str] | None:
        score_request = strip_pa_score_fields(raw_score_request)
        async with semaphore:
            try:
                await langfuse_client.create_score(
                    api_key["publicKey"],
                    api_key["secretKey"],
                    score_request,
                )
                if write_through_clickhouse and score_writer is not None:
                    await score_writer.upsert_annotation_score(
                        project_id,
                        user_id,
                        clickhouse_score_payload(raw_score_request),
                    )
                return None
            except Exception as exc:
                logger.warning(
                    "Failed to prefill annotation score: score_id=%s trace_id=%s",
                    score_request.get("id"),
                    score_request.get("traceId"),
                    exc_info=True,
                )
                return {
                    "scoreId": str(score_request.get("id") or ""),
                    "traceId": str(score_request.get("traceId") or ""),
                    "reason": str(exc),
                }

    results = await asyncio.gather(*(write_one(request) for request in score_requests))
    return [failure for failure in results if failure is not None]


def _trace_scores_to_annotation_score_payload(
    scores: list[dict[str, Any]],
    score_config_ids: list[str],
) -> dict[str, Any]:
    allowed_config_ids = set(score_config_ids)
    seen_config_ids: set[str] = set()
    payload_scores: list[dict[str, Any]] = []
    for score in scores:
        config_id = str(score.get("configId") or score.get("config_id") or "").strip()
        if not config_id or config_id not in allowed_config_ids:
            continue
        if config_id in seen_config_ids:
            continue
        seen_config_ids.add(config_id)
        string_value = str(
            score.get("stringValue")
            or score.get("string_value")
            or score.get("longStringValue")
            or score.get("long_string_value")
            or ""
        )
        payload_scores.append(
            {
                "configId": config_id,
                "value": score.get("value"),
                "stringValue": string_value,
                "comment": score.get("comment") or "",
            }
        )
    return {"scores": payload_scores}


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
    if filters.assignee_ids:
        allowed_assignees = set(filters.assignee_ids)
        filtered = [
            item
            for item in filtered
            if (item.get("assignee") or {}).get("id") in allowed_assignees
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
            item for item in filtered if bool(item.get("scores")) is filters.has_scores
        ]
    metadata_filters = filters.metadata_filters
    if filters.metadata_filter:
        metadata_filters = [filters.metadata_filter, *metadata_filters]
    for metadata_filter in metadata_filters:
        filtered = [
            item for item in filtered if _matches_metadata_filter(item, metadata_filter)
        ]
    for input_filter in filters.input_filters:
        filtered = [
            item
            for item in filtered
            if _matches_payload_filter(item, "input", input_filter)
        ]
    for output_filter in filters.output_filters:
        filtered = [
            item
            for item in filtered
            if _matches_payload_filter(item, "output", output_filter)
        ]
    return filtered


def _annotation_filters_require_source(
    filters: AnnotationBatchFiltersPayload,
) -> bool:
    return bool(
        filters.keyword
        or filters.metadata_filter
        or filters.metadata_filters
        or filters.input_filters
        or filters.output_filters
    )


def _annotation_filters_require_clickhouse_pushdown(
    filters: AnnotationBatchFiltersPayload,
) -> bool:
    return bool(
        filters.metadata_filter
        or filters.metadata_filters
        or filters.input_filters
        or filters.output_filters
    )


def _source_independent_annotation_filters(
    filters: AnnotationBatchFiltersPayload,
) -> AnnotationBatchFiltersPayload:
    return filters.model_copy(
        update={
            "keyword": "",
            "metadata_filter": None,
            "metadata_filters": [],
            "input_filters": [],
            "output_filters": [],
        }
    )


async def _list_annotation_items_page(
    *,
    project_id: str,
    queue_id: str,
    user_id: str,
    page: int,
    page_size: int,
    filters: AnnotationBatchFiltersPayload,
    reader: LangfuseDatabaseReader,
    trace_reader: LangfuseClickHouseReader,
) -> dict[str, Any]:
    if _annotation_filters_require_clickhouse_pushdown(filters):
        candidates = await reader.list_annotation_queue_item_candidates_for_user(
            project_id,
            queue_id,
            user_id,
            filters=filters.model_dump(),
        )
        paginated = await trace_reader.list_annotation_queue_items_page(
            project_id,
            candidates,
            page=page,
            page_size=page_size,
            filters=filters.model_dump(),
        )
    else:
        paginated = await reader.list_annotation_queue_items_page_for_user(
            project_id,
            queue_id,
            user_id,
            page=page,
            page_size=page_size,
            filters=filters.model_dump(),
        )
    paginated["datas"] = await _enrich_annotation_items_with_clickhouse_scores(
        project_id,
        queue_id,
        paginated["datas"],
        trace_reader,
    )
    paginated["datas"] = await _enrich_annotation_items_with_trace_sources(
        project_id,
        paginated["datas"],
        trace_reader,
    )
    return paginated


async def _count_annotation_item_filter_groups(
    *,
    project_id: str,
    queue_id: str,
    user_id: str,
    filters: AnnotationBatchFiltersPayload,
    reader: LangfuseDatabaseReader,
    trace_reader: LangfuseClickHouseReader,
) -> dict[str, dict[str, int]]:
    if _annotation_filters_require_clickhouse_pushdown(filters):
        candidates = await reader.list_annotation_queue_item_candidates_for_user(
            project_id,
            queue_id,
            user_id,
            filters=filters.model_dump(),
            omit_facet_filters=True,
        )
        return await trace_reader.count_annotation_queue_item_filters(
            project_id,
            candidates,
            filters=filters.model_dump(),
        )
    return await reader.count_annotation_queue_item_filters_for_user(
        project_id,
        queue_id,
        user_id,
        filters=filters.model_dump(),
    )


def _apply_annotation_export_scope(
    items: list[dict[str, Any]],
    scope: AnnotationExportScope,
    item_ids: list[str],
) -> list[dict[str, Any]]:
    if scope != "selected":
        return items
    selected_ids = set(item_ids)
    return [item for item in items if item["id"] in selected_ids]


async def _iter_filtered_annotation_item_batches(
    *,
    project_id: str,
    queue_id: str,
    user_id: str,
    filters: AnnotationBatchFiltersPayload,
    reader: LangfuseDatabaseReader,
    trace_reader: LangfuseClickHouseReader,
    scope: AnnotationExportScope = "filtered",
    item_ids: list[str] | None = None,
    enrich_scores: bool = False,
    enrich_all_sources: bool = False,
):
    selected_ids = set(item_ids or [])
    source_filters = _annotation_filters_require_source(filters)
    independent_filters = _source_independent_annotation_filters(filters)
    pre_score_filters = independent_filters.model_copy(update={"has_scores": None})
    iterator = getattr(reader, "iter_annotation_queue_items_for_user", None)
    if iterator is None:
        all_items = await reader.list_annotation_queue_items_for_user(
            project_id, queue_id, user_id
        )

        async def fallback_iterator():
            for fallback_batch in _chunk_items(all_items, ANNOTATION_SCAN_BATCH_SIZE):
                yield fallback_batch

        batches = fallback_iterator()
    else:
        batches = iterator(
            project_id,
            queue_id,
            user_id,
            batch_size=ANNOTATION_SCAN_BATCH_SIZE,
            include_details=enrich_scores or enrich_all_sources,
            include_source=source_filters,
            include_assignment=bool(filters.assignee_ids),
            include_has_scores=filters.has_scores is not None,
        )
    async for batch in batches:
        if scope == "selected":
            batch = [item for item in batch if item["id"] in selected_ids]
        batch = _filter_annotation_items(
            batch,
            pre_score_filters if enrich_scores else independent_filters,
        )
        if not batch:
            continue
        if enrich_scores:
            batch = await _enrich_annotation_items_with_clickhouse_scores(
                project_id,
                queue_id,
                batch,
                trace_reader,
            )
            batch = _filter_annotation_items(batch, independent_filters)
        if source_filters or enrich_all_sources:
            batch = await _enrich_annotation_items_with_trace_sources(
                project_id,
                batch,
                trace_reader,
            )
        if source_filters:
            batch = _filter_annotation_items(batch, filters)
        if batch:
            yield batch


async def _scan_annotation_batch_preview(
    *,
    project_id: str,
    queue_id: str,
    user_id: str,
    filters: AnnotationBatchFiltersPayload,
    limit: int,
    reader: LangfuseDatabaseReader,
    trace_reader: LangfuseClickHouseReader,
) -> dict[str, Any]:
    total = pending = completed = 0
    samples: list[dict[str, Any]] = []
    needs_source = _annotation_filters_require_source(filters)
    async for batch in _iter_filtered_annotation_item_batches(
        project_id=project_id,
        queue_id=queue_id,
        user_id=user_id,
        filters=filters,
        reader=reader,
        trace_reader=trace_reader,
    ):
        total += len(batch)
        batch_completed = sum(item["status"] == "COMPLETED" for item in batch)
        completed += batch_completed
        pending += len(batch) - batch_completed
        if len(samples) < limit:
            pending_samples = [item for item in batch if item["status"] == "PENDING"]
            samples.extend(pending_samples[: limit - len(samples)])
    if not needs_source:
        hydrate = getattr(reader, "list_annotation_queue_items_by_ids_for_user", None)
        if hydrate is not None:
            samples = await hydrate(
                project_id,
                queue_id,
                user_id,
                [str(item["id"]) for item in samples],
            )
        samples = await _enrich_annotation_items_with_trace_sources(
            project_id,
            samples,
            trace_reader,
        )
    return {
        "totalCount": total,
        "pendingCount": pending,
        "completedCount": completed,
        "samples": samples,
        "filterSummary": _build_annotation_filter_summary(filters, pending),
    }


async def _get_scoped_annotation_export_items(
    *,
    project_id: str,
    queue_id: str,
    user_id: str,
    scope: AnnotationExportScope,
    filters: AnnotationBatchFiltersPayload,
    item_ids: list[str],
    reader: LangfuseDatabaseReader,
    trace_reader: LangfuseClickHouseReader,
    enrich_all_sources: bool = True,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    queue = await reader.get_annotation_queue_for_user(
        project_id,
        queue_id,
        user_id,
    )
    items = await reader.list_annotation_queue_items_for_user(
        project_id,
        queue_id,
        user_id,
    )
    items = await _enrich_annotation_items_with_clickhouse_scores(
        project_id,
        queue_id,
        items,
        trace_reader,
    )
    items = _apply_annotation_export_scope(items, scope, item_ids)
    scoped_items = _filter_annotation_items(
        items,
        _source_independent_annotation_filters(filters),
    )
    if _annotation_filters_require_source(filters):
        scoped_items = await _enrich_annotation_items_with_trace_sources(
            project_id,
            scoped_items,
            trace_reader,
        )
        scoped_items = _filter_annotation_items(scoped_items, filters)
    if enrich_all_sources:
        scoped_items = await _enrich_annotation_items_with_trace_sources(
            project_id,
            scoped_items,
            trace_reader,
        )
    return queue, scoped_items


async def _build_annotation_export_preview_payload(
    *,
    project_id: str,
    queue_id: str,
    user_id: str,
    payload: AnnotationExportPreviewPayload,
    reader: LangfuseDatabaseReader,
    trace_reader: LangfuseClickHouseReader,
) -> dict[str, Any]:
    queue = await reader.get_annotation_queue_for_user(project_id, queue_id, user_id)
    filters = (
        payload.filters.model_copy(update={"item_ids": payload.item_ids})
        if payload.scope == "selected"
        else payload.filters
    )
    paginated, filter_counts = await asyncio.gather(
        _list_annotation_items_page(
            project_id=project_id,
            queue_id=queue_id,
            user_id=user_id,
            page=1,
            page_size=payload.preview_limit,
            filters=filters,
            reader=reader,
            trace_reader=trace_reader,
        ),
        _count_annotation_item_filter_groups(
            project_id=project_id,
            queue_id=queue_id,
            user_id=user_id,
            filters=filters,
            reader=reader,
            trace_reader=trace_reader,
        ),
    )
    total = int(paginated.get("total") or 0)
    selected_statuses = set(filters.status)
    if selected_statuses == {"PENDING"}:
        pending, completed = total, 0
    elif selected_statuses == {"COMPLETED"}:
        pending, completed = 0, total
    else:
        status_counts = filter_counts.get("status") or {}
        pending = int(status_counts.get("PENDING") or 0)
        completed = int(status_counts.get("COMPLETED") or 0)
    preview_items = list(paginated.get("datas") or [])
    metrics = {"total": total, "completed": completed, "pending": pending}
    return build_annotation_export_preview(
        queue=queue,
        items=preview_items,
        score_configs=queue.get("scoreConfigs") or [],
        preview_limit=payload.preview_limit,
        split_metadata=payload.split_metadata,
        metrics=metrics,
        metadata_items=preview_items,
    )


def _annotation_export_metrics(items: list[dict[str, Any]]) -> dict[str, int]:
    completed = sum(1 for item in items if item.get("status") == "COMPLETED")
    pending = len(items) - completed
    return {"total": len(items), "completed": completed, "pending": pending}


async def generate_annotation_export_file(
    *,
    reader: LangfuseDatabaseReader,
    trace_reader: LangfuseClickHouseReader,
    project_id: str,
    queue_id: str,
    job_id: str,
    user_id: str,
    scope: AnnotationExportScope,
    export_format: AnnotationExportFormat,
    filters: AnnotationBatchFiltersPayload,
    item_ids: list[str],
    split_metadata: bool,
    base_file_name: str,
    storage_dir: str,
) -> None:
    try:
        await reader.mark_annotation_export_job_running(project_id, queue_id, job_id)
        queue = await reader.get_annotation_queue_for_user(
            project_id, queue_id, user_id
        )
        total = completed = 0
        metadata_keys: set[str] = set()
        async for batch in _iter_filtered_annotation_item_batches(
            project_id=project_id,
            queue_id=queue_id,
            user_id=user_id,
            filters=filters,
            reader=reader,
            trace_reader=trace_reader,
            scope=scope,
            item_ids=item_ids,
            enrich_scores=True,
            enrich_all_sources=True,
        ):
            total += len(batch)
            completed += sum(item.get("status") == "COMPLETED" for item in batch)
            if split_metadata:
                for item in batch:
                    metadata = (item.get("source") or {}).get("metadata") or {}
                    if isinstance(metadata, dict):
                        metadata_keys.update(str(key) for key in metadata)
        if total == 0:
            await reader.mark_annotation_export_job_failed(
                project_id,
                queue_id,
                job_id,
                "当前范围无可导出数据",
            )
            return
        output_dir = Path(storage_dir) / project_id / "annotation-exports"
        output_dir.mkdir(parents=True, exist_ok=True)
        spool_path = output_dir / f".{job_id}.jsonl"
        with spool_path.open("w", encoding="utf-8") as spool:
            async for batch in _iter_filtered_annotation_item_batches(
                project_id=project_id,
                queue_id=queue_id,
                user_id=user_id,
                filters=filters,
                reader=reader,
                trace_reader=trace_reader,
                scope=scope,
                item_ids=item_ids,
                enrich_scores=True,
                enrich_all_sources=True,
            ):
                for item in batch:
                    spool.write(
                        json.dumps(item, ensure_ascii=False, default=str) + "\n"
                    )

        def iter_spooled_items():
            with spool_path.open("r", encoding="utf-8") as spool:
                for line in spool:
                    yield json.loads(line)

        metrics = {"total": total, "completed": completed, "pending": total - completed}
        archive_path = generate_annotation_export_archive(
            output_dir=output_dir,
            base_file_name=base_file_name,
            export_format=export_format,
            queue=queue,
            metrics=metrics,
            score_configs=queue.get("scoreConfigs") or [],
            items=iter_spooled_items(),
            split_metadata=split_metadata,
            metadata_keys=sorted(metadata_keys),
        )
        spool_path.unlink(missing_ok=True)
        await reader.mark_annotation_export_job_succeeded(
            project_id,
            queue_id,
            job_id,
            total_count=total,
            file_name=archive_path.name,
            file_path=str(archive_path),
            file_size=archive_path.stat().st_size,
        )
    except Exception as exc:
        if "spool_path" in locals():
            spool_path.unlink(missing_ok=True)
        logger.exception(
            "Failed to generate annotation export file: project_id=%s queue_id=%s "
            "job_id=%s error=%r",
            project_id,
            queue_id,
            job_id,
            exc,
        )
        try:
            await reader.mark_annotation_export_job_failed(
                project_id,
                queue_id,
                job_id,
                "标注数据导出失败，请稍后重试",
            )
        except Exception:
            logger.exception(
                "Failed to mark annotation export job failed after generation "
                "error: project_id=%s queue_id=%s job_id=%s",
                project_id,
                queue_id,
                job_id,
            )


def _count_by_field(
    items: list[dict[str, Any]],
    field: str,
    values: tuple[str, ...],
) -> dict[str, int]:
    counts = {value: 0 for value in values}

    for item in items:
        value = item.get(field)
        if value in counts:
            counts[value] += 1

    return counts


def _count_by_assignee_id(
    items: list[dict[str, Any]],
    values: set[str],
) -> dict[str, int]:
    counts = {value: 0 for value in sorted(values)}

    for item in items:
        assignee_id = (item.get("assignee") or {}).get("id")
        if assignee_id in counts:
            counts[assignee_id] += 1

    return counts


def _annotation_item_filter_counts(
    items: list[dict[str, Any]],
    filters: AnnotationBatchFiltersPayload,
) -> dict[str, dict[str, int]]:
    status_items = _filter_annotation_items(
        items,
        filters.model_copy(update={"status": []}),
    )
    object_type_items = _filter_annotation_items(
        items,
        filters.model_copy(update={"object_type": []}),
    )
    assignee_items = _filter_annotation_items(
        items,
        filters.model_copy(update={"assignee_ids": []}),
    )
    assignee_ids = {
        assignee_id
        for item in items
        if (assignee_id := (item.get("assignee") or {}).get("id"))
    }

    return {
        "status": _count_by_field(
            status_items,
            "status",
            ANNOTATION_ITEM_STATUSES,
        ),
        "objectType": _count_by_field(
            object_type_items,
            "objectType",
            ANNOTATION_OBJECT_TYPES,
        ),
        "assigneeIds": _count_by_assignee_id(assignee_items, assignee_ids),
    }


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
    if filters.input_filters:
        parts.append(f"Input：{len(filters.input_filters)} 个条件")
    if filters.output_filters:
        parts.append(f"Output：{len(filters.output_filters)} 个条件")
    if filters.item_ids:
        parts.append(f"指定失败项：{len(filters.item_ids)} 条")
    return "；".join(parts)


@router.get("/score-configs")
async def list_score_configs(
    project_id: str,
    include_archived: bool = Query(default=False, alias="includeArchived"),
    keyword: str | None = Query(default=None, max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=200, alias="pageSize"),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    configs = await reader.list_score_configs_for_user(
        project_id,
        current_user.user_id,
        include_archived=include_archived,
        keyword=keyword,
        page=page,
        page_size=page_size,
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


@router.get("/annotation-queues/name-availability")
async def get_annotation_queue_name_availability(
    project_id: str,
    name: str = Query(min_length=1),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    available = await reader.is_annotation_queue_name_available_for_user(
        project_id,
        current_user.user_id,
        name.strip(),
    )
    return success({"available": available})


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


@router.post("/annotation-queues/{queue_id}/export-preview")
async def preview_annotation_export(
    project_id: str,
    queue_id: str,
    payload: AnnotationExportPreviewPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    trace_reader: LangfuseClickHouseReader = Depends(get_langfuse_clickhouse_reader),
) -> dict[str, Any]:
    preview = await _build_annotation_export_preview_payload(
        project_id=project_id,
        queue_id=queue_id,
        user_id=current_user.user_id,
        payload=payload,
        reader=reader,
        trace_reader=trace_reader,
    )
    return success(preview)


@router.post("/annotation-queues/{queue_id}/export-jobs")
async def create_annotation_export_job(
    project_id: str,
    queue_id: str,
    payload: AnnotationExportJobPayload,
    background_tasks: BackgroundTasks,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    trace_reader: LangfuseClickHouseReader = Depends(get_langfuse_clickhouse_reader),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    if payload.scope == "selected" and not payload.item_ids:
        raise BusinessError(1030, "请选择要导出的标注数据", 400)

    queue = await reader.get_annotation_queue_for_user(
        project_id,
        queue_id,
        current_user.user_id,
    )

    base_file_name = _annotation_export_base_name_from_payload(
        payload.file_name,
        queue=queue,
        total_count=0,
    )
    filters_snapshot = payload.filters.model_dump(by_alias=True)
    job = await reader.create_annotation_export_job_for_user(
        project_id,
        queue_id,
        current_user.user_id,
        scope=payload.scope,
        export_format=payload.format,
        filters=filters_snapshot,
        item_ids=payload.item_ids,
        split_metadata=payload.split_metadata,
        file_name=base_file_name,
    )
    background_tasks.add_task(
        generate_annotation_export_file,
        reader=reader,
        trace_reader=trace_reader,
        project_id=project_id,
        queue_id=queue_id,
        job_id=job["id"],
        user_id=current_user.user_id,
        scope=payload.scope,
        export_format=payload.format,
        filters=payload.filters,
        item_ids=payload.item_ids,
        split_metadata=payload.split_metadata,
        base_file_name=base_file_name,
        storage_dir=settings.pa_eval_export_storage_dir,
    )
    return success(_to_public_annotation_export_job(job))


@router.get("/annotation-queues/{queue_id}/export-jobs/{job_id}")
async def get_annotation_export_job(
    project_id: str,
    queue_id: str,
    job_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    job = await reader.get_annotation_export_job_for_user(
        project_id,
        queue_id,
        job_id,
        current_user.user_id,
    )
    return success(_to_public_annotation_export_job(job))


@router.get("/annotation-queues/{queue_id}/export-jobs/{job_id}/download")
async def download_annotation_export_job(
    project_id: str,
    queue_id: str,
    job_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    job = await reader.get_annotation_export_job_for_user(
        project_id,
        queue_id,
        job_id,
        current_user.user_id,
    )
    if job["status"] != "SUCCEEDED":
        raise BusinessError(1033, "标注导出任务尚未完成", 409)

    file_path = Path(job.get("filePath") or "")
    if not _is_safe_annotation_export_path(
        file_path=file_path,
        settings=settings,
        project_id=project_id,
    ):
        raise BusinessError(1034, "标注导出文件不存在或已过期", 404)

    resolved_file_path = file_path.expanduser().resolve()
    return FileResponse(
        resolved_file_path,
        media_type="application/zip",
        filename=job.get("fileName") or resolved_file_path.name,
    )


@router.get("/annotation-queues/{queue_id}/items/filter-counts")
async def count_annotation_queue_item_filters(
    project_id: str,
    queue_id: str,
    keyword: str | None = Query(default=None),
    status: list[AnnotationItemStatus] | None = Query(default=None),
    object_type: list[AnnotationObjectType] | None = Query(
        default=None,
        alias="objectType",
    ),
    completed_by: list[str] | None = Query(default=None, alias="completedBy"),
    assignee_ids: list[str] | None = Query(default=None, alias="assigneeIds"),
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
    assignee_ids_bracket: list[str] | None = Query(
        default=None,
        alias="assigneeIds[]",
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
    input_filters: str = Query(default="", alias="inputFilters"),
    output_filters: str = Query(default="", alias="outputFilters"),
    item_ids: list[str] | None = Query(default=None, alias="itemIds"),
    item_ids_bracket: list[str] | None = Query(default=None, alias="itemIds[]"),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    trace_reader: LangfuseClickHouseReader = Depends(get_langfuse_clickhouse_reader),
) -> dict[str, Any]:
    effective_status = _first_non_empty_list(status, status_bracket)
    effective_object_type = _first_non_empty_list(object_type, object_type_bracket)
    effective_completed_by = _first_non_empty_list(completed_by, completed_by_bracket)
    effective_assignee_ids = _first_non_empty_list(
        assignee_ids,
        assignee_ids_bracket,
    )
    effective_item_ids = _first_non_empty_list(item_ids, item_ids_bracket)
    parsed_metadata_filters = _parse_metadata_filters_query(metadata_filters)
    parsed_input_filters = _parse_filter_conditions_query(input_filters, "Input")
    parsed_output_filters = _parse_filter_conditions_query(output_filters, "Output")
    filters_payload = AnnotationBatchFiltersPayload(
        keyword=keyword or "",
        status=effective_status or [],
        objectType=effective_object_type or [],
        completedBy=effective_completed_by or [],
        assigneeIds=effective_assignee_ids or [],
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
        inputFilters=parsed_input_filters,
        outputFilters=parsed_output_filters,
        itemIds=effective_item_ids or [],
    )
    counts = await _count_annotation_item_filter_groups(
        project_id=project_id,
        queue_id=queue_id,
        user_id=current_user.user_id,
        filters=filters_payload,
        reader=reader,
        trace_reader=trace_reader,
    )
    return success(counts)


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
    assignee_ids: list[str] | None = Query(default=None, alias="assigneeIds"),
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
    assignee_ids_bracket: list[str] | None = Query(
        default=None,
        alias="assigneeIds[]",
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
    input_filters: str = Query(default="", alias="inputFilters"),
    output_filters: str = Query(default="", alias="outputFilters"),
    item_ids: list[str] | None = Query(default=None, alias="itemIds"),
    item_ids_bracket: list[str] | None = Query(default=None, alias="itemIds[]"),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    trace_reader: LangfuseClickHouseReader = Depends(get_langfuse_clickhouse_reader),
) -> dict[str, Any]:
    effective_status = _first_non_empty_list(status, status_bracket)
    effective_object_type = _first_non_empty_list(object_type, object_type_bracket)
    effective_completed_by = _first_non_empty_list(completed_by, completed_by_bracket)
    effective_assignee_ids = _first_non_empty_list(
        assignee_ids,
        assignee_ids_bracket,
    )
    effective_item_ids = _first_non_empty_list(item_ids, item_ids_bracket)
    parsed_metadata_filters = _parse_metadata_filters_query(metadata_filters)
    parsed_input_filters = _parse_filter_conditions_query(input_filters, "Input")
    parsed_output_filters = _parse_filter_conditions_query(output_filters, "Output")
    filters_payload = AnnotationBatchFiltersPayload(
        keyword=keyword or "",
        status=effective_status or [],
        objectType=effective_object_type or [],
        completedBy=effective_completed_by or [],
        assigneeIds=effective_assignee_ids or [],
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
        inputFilters=parsed_input_filters,
        outputFilters=parsed_output_filters,
        itemIds=effective_item_ids or [],
    )
    paginated = await _list_annotation_items_page(
        project_id=project_id,
        queue_id=queue_id,
        user_id=current_user.user_id,
        page=page,
        page_size=page_size,
        filters=filters_payload,
        reader=reader,
        trace_reader=trace_reader,
    )
    return success(paginated)


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
    trace_reader: LangfuseClickHouseReader = Depends(get_langfuse_clickhouse_reader),
) -> dict[str, Any]:
    item = await reader.get_annotation_queue_item_for_user(
        project_id,
        queue_id,
        item_id,
        current_user.user_id,
    )
    items = await _enrich_annotation_items_with_clickhouse_scores(
        project_id,
        queue_id,
        [item],
        trace_reader,
    )
    enriched_items = await _enrich_annotation_items_with_trace_source(
        project_id,
        items,
        trace_reader,
    )
    item = enriched_items[0]
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


@router.patch("/annotation-queues/{queue_id}/items/assignees")
async def update_annotation_queue_item_assignees(
    project_id: str,
    queue_id: str,
    payload: UpdateItemAssigneesPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    result = await reader.update_annotation_queue_item_assignees_for_user(
        project_id,
        queue_id,
        current_user.user_id,
        payload.item_ids,
        payload.assignee_user_id,
    )
    return success(result)


@router.post("/annotation-queues/{queue_id}/batch-preview")
async def preview_annotation_batch(
    project_id: str,
    queue_id: str,
    payload: AnnotationBatchPreviewPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    trace_reader: LangfuseClickHouseReader = Depends(get_langfuse_clickhouse_reader),
) -> dict[str, Any]:
    preview = await _scan_annotation_batch_preview(
        project_id=project_id,
        queue_id=queue_id,
        user_id=current_user.user_id,
        filters=payload.filters,
        limit=payload.limit,
        reader=reader,
        trace_reader=trace_reader,
    )
    return success(preview)


@router.post("/annotation-queues/{queue_id}/batch-scores")
async def save_annotation_batch_scores(
    project_id: str,
    queue_id: str,
    payload: AnnotationBatchScorePayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    trace_reader: LangfuseClickHouseReader = Depends(get_langfuse_clickhouse_reader),
    langfuse_client: LangfuseAdminClient = Depends(get_langfuse_client),
    score_writer: LangfuseClickHouseScoreWriter = Depends(
        get_langfuse_clickhouse_score_writer
    ),
) -> dict[str, Any]:
    filtered_ids: list[str] = []
    pending_ids: list[str] = []
    completed_count = 0
    async for batch in _iter_filtered_annotation_item_batches(
        project_id=project_id,
        queue_id=queue_id,
        user_id=current_user.user_id,
        filters=payload.filters,
        reader=reader,
        trace_reader=trace_reader,
    ):
        filtered_ids.extend(str(item["id"]) for item in batch)
        pending_ids.extend(
            str(item["id"]) for item in batch if item["status"] == "PENDING"
        )
        completed_count += sum(item["status"] == "COMPLETED" for item in batch)
    uses_match_count = payload.expected_match_count is not None
    target_ids = filtered_ids if uses_match_count else pending_ids

    if uses_match_count and payload.expected_match_count != len(target_ids):
        raise BusinessError(
            code=1027,
            message="批量标注选中数据已变化，请刷新列表后重试",
            status_code=409,
        )
    if (
        not uses_match_count
        and payload.expected_pending_count is not None
        and (payload.expected_pending_count != len(pending_ids))
    ):
        raise BusinessError(
            code=1027,
            message="批量标注命中数量已变化，请刷新预览后重试",
            status_code=409,
        )
    if len(target_ids) > 100 and not payload.confirm_large_batch:
        raise BusinessError(
            code=1028,
            message="本次批量标注超过 100 条，请确认后再提交",
            status_code=409,
        )

    score_payload = _score_payload(payload)
    failed_reasons: dict[str, str] = {}
    prepared_requests: list[dict[str, Any]] = []
    for item_id_batch in _chunk_items(target_ids, ANNOTATION_SCAN_BATCH_SIZE):
        try:
            prepared_requests.extend(
                await reader.prepare_annotation_score_payloads_batch_for_user(
                    project_id,
                    queue_id,
                    current_user.user_id,
                    [
                        {"itemId": item_id, "scorePayload": score_payload}
                        for item_id in item_id_batch
                    ],
                )
            )
        except BusinessError:
            # Preserve the old partial-success behavior for exceptional invalid rows.
            for item_id in item_id_batch:
                try:
                    prepared_requests.extend(
                        await reader.prepare_annotation_score_payloads_batch_for_user(
                            project_id,
                            queue_id,
                            current_user.user_id,
                            [{"itemId": item_id, "scorePayload": score_payload}],
                        )
                    )
                except BusinessError as item_exc:
                    failed_reasons[item_id] = item_exc.message

    if prepared_requests:
        api_key = await reader.get_project_api_key_credentials_for_user(
            project_id,
            current_user.user_id,
        )
        request_item_ids = {
            str(request.get("id") or ""): str(
                (request.get("metadata") or {}).get("annotationItemId") or ""
            )
            for request in prepared_requests
        }
        write_failures = await _write_annotation_score_requests(
            project_id=project_id,
            user_id=current_user.user_id,
            score_requests=prepared_requests,
            api_key=api_key,
            reader=reader,
            langfuse_client=langfuse_client,
            score_writer=score_writer,
            write_through_clickhouse=False,
        )
        for failure in write_failures:
            item_id = request_item_ids.get(str(failure.get("scoreId") or ""), "")
            if item_id:
                failed_reasons.setdefault(item_id, "评分保存失败，请稍后重试")

    success_item_ids = [
        item_id for item_id in target_ids if item_id not in failed_reasons
    ]
    complete_many = getattr(reader, "complete_annotation_queue_items_for_user", None)
    if complete_many is not None:
        await complete_many(
            project_id,
            queue_id,
            success_item_ids,
            current_user.user_id,
        )
    else:
        for item_id in success_item_ids:
            await reader.complete_annotation_queue_item_for_user(
                project_id, queue_id, item_id, current_user.user_id
            )
    failures = [
        {"itemId": item_id, "reason": failed_reasons[item_id]}
        for item_id in target_ids
        if item_id in failed_reasons
    ]

    return success(
        {
            "successCount": len(success_item_ids),
            "failureCount": len(failures),
            "skippedCount": 0 if uses_match_count else completed_count,
            "successItemIds": success_item_ids,
            "failures": failures,
            "filterSummary": (
                f"选中 {len(target_ids)} 条"
                if uses_match_count
                else _build_annotation_filter_summary(
                    payload.filters,
                    len(pending_ids),
                )
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
    langfuse_client: LangfuseAdminClient = Depends(get_langfuse_client),
    score_writer: LangfuseClickHouseScoreWriter = Depends(
        get_langfuse_clickhouse_score_writer
    ),
) -> dict[str, Any]:
    item = await _save_annotation_scores_with_langfuse_api(
        project_id=project_id,
        queue_id=queue_id,
        item_id=item_id,
        user_id=current_user.user_id,
        score_payload=_score_payload(payload),
        reader=reader,
        langfuse_client=langfuse_client,
        score_writer=score_writer,
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
    trace_reader: LangfuseClickHouseReader = Depends(get_langfuse_clickhouse_reader),
    langfuse_client: LangfuseAdminClient = Depends(get_langfuse_client),
    score_writer: LangfuseClickHouseScoreWriter = Depends(
        get_langfuse_clickhouse_score_writer
    ),
) -> dict[str, Any]:
    task_payload = _trace_annotation_task_payload(payload)

    result = await reader.create_trace_annotation_task_for_user(
        project_id,
        current_user.user_id,
        task_payload,
    )
    await _prefill_annotation_scores_from_trace_scores(
        project_id=project_id,
        queue_id=str(result.get("queueId") or ""),
        created_items=result.get("createdItems") or [],
        score_config_ids=result.get("scoreConfigIds") or [],
        user_id=current_user.user_id,
        reader=reader,
        trace_reader=trace_reader,
        langfuse_client=langfuse_client,
        score_writer=score_writer,
    )
    public_result = {
        key: value
        for key, value in result.items()
        if key not in {"createdItems", "scoreConfigIds"}
    }
    return success({**public_result, "traceCount": len(payload.trace_ids)})


@router.post("/traces/annotation-task-jobs")
async def create_trace_annotation_task_job(
    project_id: str,
    payload: AnnotationTraceTaskJobPayload,
    background_tasks: BackgroundTasks,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    trace_reader: LangfuseClickHouseReader = Depends(get_langfuse_clickhouse_reader),
    langfuse_client: LangfuseAdminClient = Depends(get_langfuse_client),
    score_writer: LangfuseClickHouseScoreWriter = Depends(
        get_langfuse_clickhouse_score_writer
    ),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    task_payload = _trace_annotation_task_payload(payload)
    task_payload.pop("traceIds", None)
    selection_type, selection_payload, total_count = await _resolve_trace_job_selection(
        project_id=project_id,
        trace_ids=payload.trace_ids,
        selection=payload.selection,
        trace_reader=trace_reader,
    )
    job = await reader.create_trace_bulk_job_for_user(
        project_id,
        current_user.user_id,
        {
            "jobType": "ANNOTATION_TASK",
            "selectionType": selection_type,
            "selectionPayload": selection_payload,
            "operationPayload": task_payload,
            "resultPayload": {
                "queueId": str(task_payload.get("queueId") or ""),
                "createdCount": 0,
                "skippedCount": 0,
            },
            "totalCount": total_count,
        },
    )
    if not settings.pa_eval_trace_bulk_worker_enabled:
        background_tasks.add_task(
            run_trace_annotation_task_job,
            job_id=job["id"],
            reader=reader,
            trace_reader=trace_reader,
            langfuse_client=langfuse_client,
            score_writer=score_writer,
        )
    return success(_to_trace_annotation_task_job_response(job))


@router.get("/traces/annotation-task-jobs/{job_id}")
async def get_trace_annotation_task_job(
    project_id: str,
    job_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    job = await reader.get_trace_bulk_job_for_user(
        project_id,
        current_user.user_id,
        job_id,
    )
    if job.get("jobType") != "ANNOTATION_TASK":
        raise BusinessError(1034, "人工标注任务不存在或已过期", 404)
    return success(_to_trace_annotation_task_job_response(job))


@router.post("/traces/dataset-import-jobs")
async def create_trace_dataset_import_job(
    project_id: str,
    payload: TraceDatasetImportJobPayload,
    background_tasks: BackgroundTasks,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    trace_reader: LangfuseClickHouseReader = Depends(get_langfuse_clickhouse_reader),
) -> dict[str, Any]:
    selection_type, selection_payload, total_count = await _resolve_trace_job_selection(
        project_id=project_id,
        trace_ids=payload.trace_ids,
        selection=payload.selection,
        trace_reader=trace_reader,
    )
    job = await reader.create_trace_bulk_job_for_user(
        project_id,
        current_user.user_id,
        {
            "jobType": "DATASET_IMPORT",
            "selectionType": selection_type,
            "selectionPayload": selection_payload,
            "operationPayload": {"datasetId": payload.dataset_id},
            "resultPayload": {"itemIds": [], "failures": []},
            "totalCount": total_count,
        },
    )
    background_tasks.add_task(
        run_trace_dataset_import_job,
        job_id=job["id"],
        reader=reader,
        trace_reader=trace_reader,
    )
    return success(_to_trace_dataset_import_job_response(job))


@router.get("/traces/dataset-import-jobs/{job_id}")
async def get_trace_dataset_import_job(
    project_id: str,
    job_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
) -> dict[str, Any]:
    job = await reader.get_trace_bulk_job_for_user(
        project_id,
        current_user.user_id,
        job_id,
    )
    if job.get("jobType") != "DATASET_IMPORT":
        raise BusinessError(1033, "导入任务不存在或已过期", 404)
    return success(_to_trace_dataset_import_job_response(job))


@router.post("/traces/dataset-items")
async def add_traces_to_dataset(
    project_id: str,
    payload: TraceDatasetItemsPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    reader: LangfuseDatabaseReader = Depends(get_langfuse_db_reader),
    trace_reader: LangfuseClickHouseReader = Depends(get_langfuse_clickhouse_reader),
) -> dict[str, Any]:
    failures: list[dict[str, Any]] = []
    unique_trace_ids = list(dict.fromkeys(payload.trace_ids))
    traces = await trace_reader.list_traces_by_ids(
        project_id,
        unique_trace_ids,
        fields="io,metadata",
    )
    found_trace_ids = {str(trace.get("traceId") or "") for trace in traces}
    for trace_id in unique_trace_ids:
        if trace_id not in found_trace_ids:
            failures.append(
                {
                    "traceId": trace_id,
                    "reason": "Trace 不存在或无访问权限",
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


async def _next_trace_bulk_job_batch(
    job: dict[str, Any],
    trace_reader: LangfuseClickHouseReader,
    batch_size: int,
) -> tuple[list[str], dict[str, Any], bool]:
    selection_payload = dict(job.get("selectionPayload") or {})
    cursor_payload = dict(job.get("cursorPayload") or {})
    if job.get("selectionType") == "FILTER":
        if cursor_payload.get("done"):
            return [], cursor_payload, False
        result = await trace_reader.list_trace_ids_for_bulk(
            job["projectId"],
            filters=dict(selection_payload.get("filters") or {}),
            cursor=dict(cursor_payload.get("traceCursor") or {}),
            excluded_trace_ids=list(selection_payload.get("excludedTraceIds") or []),
            limit=batch_size,
        )
        has_more = bool(result.get("hasMore"))
        return (
            list(result.get("traceIds") or []),
            {
                "traceCursor": result.get("cursor") or {},
                "done": not has_more,
            },
            has_more,
        )

    trace_ids = list(selection_payload.get("traceIds") or [])
    offset = int(cursor_payload.get("offset") or 0)
    batch_trace_ids = trace_ids[offset : offset + batch_size]
    next_offset = offset + len(batch_trace_ids)
    return (
        batch_trace_ids,
        {"offset": next_offset},
        next_offset < len(trace_ids),
    )


@asynccontextmanager
async def _maintain_trace_bulk_job_lease(
    *,
    reader: LangfuseDatabaseReader,
    job_id: str,
    lock_owner: str,
    lease_seconds: int,
    heartbeat_interval_seconds: float | None = None,
):
    stop_event = asyncio.Event()
    owner_task = asyncio.current_task()
    interval = heartbeat_interval_seconds or max(1.0, lease_seconds / 3)

    async def heartbeat() -> None:
        while not stop_event.is_set():
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=interval)
                return
            except TimeoutError:
                renewed = await reader.renew_trace_bulk_job_lease(
                    job_id,
                    lock_owner,
                    lease_seconds,
                )
                if not renewed:
                    logger.error("Trace bulk job lease lost: %s", job_id)
                    if owner_task is not None:
                        owner_task.cancel()
                    return

    heartbeat_task = asyncio.create_task(heartbeat())
    try:
        yield
    finally:
        stop_event.set()
        heartbeat_task.cancel()
        with suppress(asyncio.CancelledError):
            await heartbeat_task


async def run_trace_annotation_task_job(
    *,
    job_id: str,
    reader: LangfuseDatabaseReader,
    trace_reader: LangfuseClickHouseReader,
    langfuse_client: LangfuseAdminClient,
    score_writer: LangfuseClickHouseScoreWriter | None = None,
    claimed_job: dict[str, Any] | None = None,
    lock_owner: str | None = None,
) -> None:
    effective_lock_owner = lock_owner or f"trace-bulk-{uuid4().hex}"
    job = claimed_job or await reader.claim_trace_bulk_job(
        job_id,
        effective_lock_owner,
        120,
    )
    if not job or job.get("jobType") != "ANNOTATION_TASK":
        return
    settings = getattr(reader, "_settings", None)
    lease_seconds = max(
        1,
        int(getattr(settings, "pa_eval_trace_bulk_worker_lease_seconds", 120)),
    )
    lease_context = _maintain_trace_bulk_job_lease(
        reader=reader,
        job_id=job_id,
        lock_owner=effective_lock_owner,
        lease_seconds=lease_seconds,
    )
    await lease_context.__aenter__()
    try:
        task_payload = dict(job.get("operationPayload") or {})
        result_payload = dict(job.get("resultPayload") or {})
        while True:
            (
                batch_trace_ids,
                next_cursor_payload,
                has_more,
            ) = await _next_trace_bulk_job_batch(
                job,
                trace_reader,
                TRACE_ANNOTATION_TASK_BATCH_SIZE,
            )
            if not batch_trace_ids:
                break
            completed_count = int(job.get("completedCount") or 0) + len(batch_trace_ids)
            batch_payload = {
                **task_payload,
                "traceIds": batch_trace_ids,
            }
            queue_id = str(result_payload.get("queueId") or "")
            if queue_id:
                batch_payload.pop("queueName", None)
                batch_payload["queueId"] = queue_id
            result = await reader.create_trace_annotation_task_for_user(
                job["projectId"],
                job["userId"],
                batch_payload,
            )
            if not queue_id:
                queue_id = str(result.get("queueId") or "")
                result_payload["queueId"] = queue_id
                task_payload["queueId"] = queue_id
                task_payload.pop("queueName", None)

            created_items = result.get("createdItems") or []
            score_config_ids = result.get("scoreConfigIds") or []
            score_failures = await _prefill_annotation_scores_from_trace_rows(
                project_id=job["projectId"],
                queue_id=str(result.get("queueId") or queue_id),
                created_items=created_items,
                score_config_ids=score_config_ids,
                user_id=job["userId"],
                reader=reader,
                trace_reader=trace_reader,
                langfuse_client=langfuse_client,
                score_writer=score_writer,
            )
            if score_failures:
                result_payload.setdefault("scoreFailures", []).extend(score_failures)

            created_count = int(result.get("createdCount") or 0)
            skipped_count = int(result.get("skippedCount") or 0)
            result_payload["createdCount"] = (
                int(result_payload.get("createdCount") or 0) + created_count
            )
            result_payload["skippedCount"] = (
                int(result_payload.get("skippedCount") or 0) + skipped_count
            )
            job = await reader.update_trace_bulk_job(
                job_id,
                effective_lock_owner,
                {
                    **_trace_bulk_job_update_values(job),
                    "status": "RUNNING",
                    "operationPayload": task_payload,
                    "cursorPayload": next_cursor_payload,
                    "resultPayload": result_payload,
                    "completedCount": completed_count,
                    "successCount": int(result_payload["createdCount"]),
                    "failureCount": int(result_payload["skippedCount"]),
                },
            )
            if not has_more:
                break

        await reader.update_trace_bulk_job(
            job_id,
            effective_lock_owner,
            {
                **_trace_bulk_job_update_values(job),
                "status": "SUCCEEDED",
                "operationPayload": task_payload,
                "resultPayload": result_payload,
                "completedCount": int(job.get("completedCount") or 0),
                "successCount": int(result_payload.get("createdCount") or 0),
                "failureCount": int(result_payload.get("skippedCount") or 0),
            },
        )
    except Exception:
        logger.exception("Trace annotation task job failed: %s", job_id)
        await reader.update_trace_bulk_job(
            job_id,
            effective_lock_owner,
            {
                **_trace_bulk_job_update_values(job),
                "status": "FAILED",
                "errorMessage": "创建人工标注任务失败，请稍后重试",
            },
        )
    finally:
        await lease_context.__aexit__(None, None, None)


def _trace_annotation_task_payload(
    payload: AnnotationTraceTaskPayload,
) -> dict[str, Any]:
    task_payload: dict[str, Any] = {"traceIds": payload.trace_ids}
    if payload.queue_id:
        task_payload["queueId"] = payload.queue_id
    if payload.queue_name:
        task_payload["queueName"] = payload.queue_name
    if payload.assignee_ids:
        task_payload["assigneeIds"] = payload.assignee_ids
        task_payload["assignmentStrategy"] = payload.assignment_strategy
        task_payload["assignmentWeights"] = payload.assignment_weights
    return task_payload


async def _resolve_trace_job_selection(
    *,
    project_id: str,
    trace_ids: list[str],
    selection: TraceFilterSelectionPayload | None,
    trace_reader: LangfuseClickHouseReader,
) -> tuple[str, dict[str, Any], int]:
    if selection is None:
        unique_trace_ids = list(dict.fromkeys(trace_ids))
        return "EXPLICIT", {"traceIds": unique_trace_ids}, len(unique_trace_ids)

    filters = _normalize_trace_filter_snapshot(selection.filters)
    excluded_trace_ids = list(dict.fromkeys(selection.excluded_trace_ids))
    total_count = await trace_reader.count_traces(project_id, **filters)
    if excluded_trace_ids:
        total_count = max(0, total_count - len(excluded_trace_ids))
    return (
        "FILTER",
        {
            "filters": filters,
            "excludedTraceIds": excluded_trace_ids,
        },
        total_count,
    )


def _normalize_trace_filter_snapshot(filters: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    direct_keys = {
        "keyword": "keyword",
        "statuses": "statuses",
        "environments": "environments",
        "tags": "tags",
        "sessionId": "session_id",
        "userId": "user_id",
        "businessId": "business_id",
        "scoreQueueId": "score_queue_id",
        "metadataKey": "metadata_key",
        "metadataValue": "metadata_value",
        "createdAtRange": "created_at_range",
        "timeRange": "time_range",
    }
    for source_key, target_key in direct_keys.items():
        if source_key in filters:
            normalized[target_key] = filters[source_key]

    for source_key, target_key in (
        ("latencyMin", "latency_min"),
        ("latencyMax", "latency_max"),
    ):
        value = filters.get(source_key)
        if value not in {None, ""}:
            try:
                normalized[target_key] = int(value)
            except (TypeError, ValueError) as exc:
                raise BusinessError(1036, "Trace 筛选条件格式无效", 400) from exc

    for source_key, target_key in (
        ("metadataFilters", "metadata_filters"),
        ("inputFilters", "input_filters"),
        ("outputFilters", "output_filters"),
        ("categoricalScoreFilters", "categorical_score_filters"),
        ("numericScoreFilters", "numeric_score_filters"),
    ):
        value = filters.get(source_key)
        if value is None or value == "" or value == []:
            continue
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError as exc:
                raise BusinessError(1036, "Trace 筛选条件格式无效", 400) from exc
        if not isinstance(value, list):
            raise BusinessError(1036, "Trace 筛选条件格式无效", 400)
        normalized[target_key] = value
    return normalized


def _to_trace_annotation_task_job_response(job: dict[str, Any]) -> dict[str, Any]:
    total_count = int(job.get("totalCount") or 0)
    result_payload = dict(job.get("resultPayload") or {})
    created_count = int(
        result_payload.get("createdCount") or job.get("successCount") or 0
    )
    skipped_count = int(
        result_payload.get("skippedCount") or job.get("failureCount") or 0
    )
    completed_count = int(job.get("completedCount") or 0)
    percent = 100 if total_count == 0 else round(completed_count / total_count * 100)
    if job.get("status") == "SUCCEEDED":
        percent = 100
        completed_count = total_count
    return {
        "id": job["id"],
        "projectId": job["projectId"],
        "queueId": str(result_payload.get("queueId") or ""),
        "status": job["status"],
        "totalCount": total_count,
        "completedCount": completed_count,
        "createdCount": created_count,
        "skippedCount": skipped_count,
        "percent": max(0, min(100, percent)),
        "errorMessage": job["errorMessage"],
        "createdAt": job["createdAt"],
        "updatedAt": job["updatedAt"],
        "startedAt": job["startedAt"],
        "completedAt": job["completedAt"],
        "expiresAt": job["expiresAt"],
    }


async def run_trace_dataset_import_job(
    *,
    job_id: str,
    reader: LangfuseDatabaseReader,
    trace_reader: LangfuseClickHouseReader,
    claimed_job: dict[str, Any] | None = None,
    lock_owner: str | None = None,
) -> None:
    effective_lock_owner = lock_owner or f"trace-bulk-{uuid4().hex}"
    job = claimed_job or await reader.claim_trace_bulk_job(
        job_id,
        effective_lock_owner,
        120,
    )
    if not job or job.get("jobType") != "DATASET_IMPORT":
        return
    try:
        operation_payload = dict(job.get("operationPayload") or {})
        result_payload = dict(job.get("resultPayload") or {})
        success_count = int(job.get("successCount") or 0)
        failure_count = int(job.get("failureCount") or 0)
        while True:
            (
                batch_trace_ids,
                next_cursor_payload,
                has_more,
            ) = await _next_trace_bulk_job_batch(
                job,
                trace_reader,
                TRACE_DATASET_IMPORT_BATCH_SIZE,
            )
            if not batch_trace_ids:
                break
            completed_count = int(job.get("completedCount") or 0) + len(batch_trace_ids)
            traces = await trace_reader.list_traces_by_ids(
                job["projectId"],
                batch_trace_ids,
                fields="io,metadata",
            )
            found_trace_ids = {str(trace.get("traceId") or "") for trace in traces}
            missing_failures = [
                {
                    "traceId": trace_id,
                    "reason": "Trace 不存在或无访问权限",
                }
                for trace_id in batch_trace_ids
                if trace_id not in found_trace_ids
            ]
            result = await reader.add_traces_to_dataset_for_user(
                job["projectId"],
                job["userId"],
                {
                    "datasetId": operation_payload["datasetId"],
                    "traces": traces,
                },
            )
            success_count += int(result.get("successCount") or 0)
            failure_count += int(result.get("failureCount") or 0) + len(
                missing_failures
            )
            result_payload.setdefault("itemIds", []).extend(result.get("itemIds") or [])
            result_payload.setdefault("failures", []).extend(
                result.get("failures") or []
            )
            result_payload["failures"].extend(missing_failures)
            job = await reader.update_trace_bulk_job(
                job_id,
                effective_lock_owner,
                {
                    **_trace_bulk_job_update_values(job),
                    "status": "RUNNING",
                    "operationPayload": operation_payload,
                    "cursorPayload": next_cursor_payload,
                    "resultPayload": result_payload,
                    "completedCount": completed_count,
                    "successCount": success_count,
                    "failureCount": failure_count,
                },
            )
            if not has_more:
                break

        await reader.update_trace_bulk_job(
            job_id,
            effective_lock_owner,
            {
                **_trace_bulk_job_update_values(job),
                "status": "SUCCEEDED",
                "operationPayload": operation_payload,
                "resultPayload": result_payload,
                "completedCount": int(job.get("completedCount") or 0),
                "successCount": success_count,
                "failureCount": failure_count,
            },
        )
    except Exception as exc:
        logger.exception("Trace dataset import job failed: %s", job_id)
        failures = result_payload.setdefault("failures", [])
        if not failures:
            failures.append({"traceId": "", "reason": str(exc)})
        await reader.update_trace_bulk_job(
            job_id,
            effective_lock_owner,
            {
                **_trace_bulk_job_update_values(job),
                "status": "FAILED",
                "operationPayload": operation_payload,
                "resultPayload": result_payload,
                "completedCount": int(job.get("completedCount") or 0),
                "successCount": success_count,
                "failureCount": failure_count,
                "errorMessage": "加入数据集失败，请稍后重试",
            },
        )


def _to_trace_dataset_import_job_response(job: dict[str, Any]) -> dict[str, Any]:
    total_count = int(job.get("totalCount") or 0)
    completed_count = int(job.get("completedCount") or 0)
    operation_payload = dict(job.get("operationPayload") or {})
    result_payload = dict(job.get("resultPayload") or {})
    percent = 100 if total_count == 0 else round(completed_count / total_count * 100)
    if job.get("status") == "SUCCEEDED":
        percent = 100
        completed_count = total_count
    return {
        "id": job["id"],
        "projectId": job["projectId"],
        "datasetId": str(operation_payload.get("datasetId") or ""),
        "status": job["status"],
        "totalCount": total_count,
        "completedCount": completed_count,
        "successCount": job["successCount"],
        "failureCount": job["failureCount"],
        "percent": max(0, min(100, percent)),
        "itemIds": result_payload.get("itemIds") or [],
        "failures": result_payload.get("failures") or [],
        "errorMessage": job["errorMessage"],
        "createdAt": job["createdAt"],
        "updatedAt": job["updatedAt"],
        "startedAt": job["startedAt"],
        "completedAt": job["completedAt"],
        "expiresAt": job["expiresAt"],
    }


def _trace_bulk_job_update_values(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": job.get("status") or "RUNNING",
        "operationPayload": job.get("operationPayload") or {},
        "cursorPayload": job.get("cursorPayload") or {},
        "resultPayload": job.get("resultPayload") or {},
        "totalCount": int(job.get("totalCount") or 0),
        "completedCount": int(job.get("completedCount") or 0),
        "successCount": int(job.get("successCount") or 0),
        "failureCount": int(job.get("failureCount") or 0),
        "errorMessage": job.get("errorMessage") or "",
    }


async def execute_claimed_trace_bulk_job(
    job: dict[str, Any],
    reader: LangfuseDatabaseReader,
    trace_reader: LangfuseClickHouseReader,
    langfuse_client: LangfuseAdminClient,
    score_writer: LangfuseClickHouseScoreWriter | None,
    lock_owner: str,
) -> None:
    if job.get("jobType") == "DATASET_IMPORT":
        await run_trace_dataset_import_job(
            job_id=job["id"],
            reader=reader,
            trace_reader=trace_reader,
            claimed_job=job,
            lock_owner=lock_owner,
        )
        return
    if job.get("jobType") == "ANNOTATION_TASK":
        await run_trace_annotation_task_job(
            job_id=job["id"],
            reader=reader,
            trace_reader=trace_reader,
            langfuse_client=langfuse_client,
            score_writer=score_writer,
            claimed_job=job,
            lock_owner=lock_owner,
        )


def start_trace_bulk_job_worker(settings: Settings) -> TraceBulkWorkerHandle:
    if (
        not settings.pa_eval_trace_bulk_worker_enabled
        or not settings.langfuse_database_url
    ):
        return TraceBulkWorkerHandle(task=None, stop_event=None)

    stop_event = asyncio.Event()
    task = asyncio.create_task(_trace_bulk_job_worker_loop(settings, stop_event))
    return TraceBulkWorkerHandle(task=task, stop_event=stop_event)


async def _trace_bulk_job_worker_loop(
    settings: Settings,
    stop_event: asyncio.Event,
) -> None:
    reader = LangfuseDatabaseReader(settings)
    trace_reader = LangfuseClickHouseReader(settings)
    langfuse_client = LangfuseAdminClient(settings)
    score_writer = LangfuseClickHouseScoreWriter(settings)
    try:
        while not stop_event.is_set():
            try:
                jobs = await reader.claim_trace_bulk_jobs(
                    settings.pa_eval_trace_bulk_worker_instance_id,
                    settings.pa_eval_trace_bulk_worker_lease_seconds,
                    settings.pa_eval_trace_bulk_worker_batch_size,
                )
                if jobs:
                    await asyncio.gather(
                        *(
                            execute_claimed_trace_bulk_job(
                                job,
                                reader,
                                trace_reader,
                                langfuse_client,
                                score_writer,
                                settings.pa_eval_trace_bulk_worker_instance_id,
                            )
                            for job in jobs
                        )
                    )
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Trace bulk job worker polling failed")

            try:
                await asyncio.wait_for(
                    stop_event.wait(),
                    timeout=settings.pa_eval_trace_bulk_worker_poll_interval_seconds,
                )
            except TimeoutError:
                continue
    finally:
        await langfuse_client.aclose()
        await score_writer.aclose()


def _chunk_trace_ids(trace_ids: list[str], batch_size: int) -> list[list[str]]:
    return [
        trace_ids[start : start + batch_size]
        for start in range(0, len(trace_ids), batch_size)
    ]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
