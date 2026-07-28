from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ResourceExtensionType(StrEnum):
    DEFAULT_EVALUATION_MODEL = "DEFAULT_EVALUATION_MODEL"
    ITEM_ASSIGNMENT_POLICY = "ITEM_ASSIGNMENT_POLICY"
    API_KEY_DISPLAY_NOTE = "API_KEY_DISPLAY_NOTE"
    RESOURCE_DISPLAY_OVERRIDE = "RESOURCE_DISPLAY_OVERRIDE"
    RESOURCE_SOFT_DELETE = "RESOURCE_SOFT_DELETE"
    PROJECT_ARCHIVE_STATE = "PROJECT_ARCHIVE_STATE"


class EvaluationJobTriggerType(StrEnum):
    MANUAL = "MANUAL"
    SCHEDULED = "SCHEDULED"
    ONLINE = "ONLINE"


class JobExecutionType(StrEnum):
    AUTO_EVALUATION = "AUTO_EVALUATION"
    SCHEDULED_EVALUATION = "SCHEDULED_EVALUATION"
    DATASET_EXPORT = "DATASET_EXPORT"
    ANNOTATION_EXPORT = "ANNOTATION_EXPORT"
    TRACE_DATASET_IMPORT = "TRACE_DATASET_IMPORT"
    TRACE_ANNOTATION_IMPORT = "TRACE_ANNOTATION_IMPORT"
    REPORT_FLOWBACK = "REPORT_FLOWBACK"
    NATIVE_RESOURCE_SYNC = "NATIVE_RESOURCE_SYNC"


class JobExecutionStatus(StrEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    PARTIAL_FAILED = "PARTIAL_FAILED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class _StrictPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class DefaultEvaluationModelPayload(_StrictPayload):
    llm_connection_id: str = Field(alias="llmConnectionId", min_length=1)
    model: str = Field(min_length=1)
    temperature: str = Field(default="0.2", min_length=1)


class ItemAssignmentPolicyPayload(_StrictPayload):
    assignment_strategy: Literal["average", "random", "weighted"] = Field(
        alias="assignmentStrategy"
    )
    assignment_weights: dict[str, int] = Field(
        default_factory=dict,
        alias="assignmentWeights",
    )

    @model_validator(mode="after")
    def validate_weights(self) -> "ItemAssignmentPolicyPayload":
        if any(weight <= 0 for weight in self.assignment_weights.values()):
            raise ValueError("处理人权重必须大于0")
        if self.assignment_strategy == "weighted" and not self.assignment_weights:
            raise ValueError("weighted策略必须配置处理人权重")
        return self


class ApiKeyDisplayNotePayload(_StrictPayload):
    note: str = Field(default="", max_length=200)


class ResourceDisplayOverridePayload(_StrictPayload):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    type: Literal["evaluation", "badcase", "golden", "anomaly"] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    score_config_ids: list[str] | None = Field(default=None, alias="scoreConfigIds")


class ResourceSoftDeletePayload(_StrictPayload):
    deleted: bool


class ProjectArchiveStatePayload(_StrictPayload):
    archived: bool


class AutoEvaluationExecutionPayload(_StrictPayload):
    task_id: str = Field(alias="taskId", min_length=1)
    run_id: str = Field(alias="runId", min_length=1)
    report_id: str = Field(default="", alias="reportId")


class ScheduledEvaluationExecutionPayload(_StrictPayload):
    scheduled_job_id: str = Field(alias="scheduledJobId", min_length=1)
    fire_key: str = Field(alias="fireKey", min_length=1)
    auto_evaluation_task_id: str = Field(default="", alias="autoEvaluationTaskId")
    scheduled_job_name: str = Field(default="", alias="scheduledJobName")
    trigger_type: str = Field(default="", alias="triggerType")
    auto_evaluation_task_name: str = Field(
        default="", alias="autoEvaluationTaskName"
    )
    scheduled_fire_at: str = Field(default="", alias="scheduledFireAt")


class DatasetExportExecutionPayload(_StrictPayload):
    dataset_id: str = Field(alias="datasetId", min_length=1)
    format: Literal["xlsx", "csv", "txt"]


class AnnotationExportExecutionPayload(_StrictPayload):
    queue_id: str = Field(alias="queueId", min_length=1)
    scope: Literal["filtered", "selected"]
    format: Literal["xlsx", "csv", "txt"]
    metadata: dict[str, Any] = Field(default_factory=dict)


class TraceBulkExecutionPayload(_StrictPayload):
    selection_type: Literal["EXPLICIT", "FILTER"] = Field(alias="selectionType")
    selection_payload: dict[str, Any] = Field(alias="selectionPayload")
    operation_payload: dict[str, Any] = Field(alias="operationPayload")
    user_id: str = Field(default="", alias="userId")


class ReportFlowbackExecutionPayload(_StrictPayload):
    report_id: str = Field(alias="reportId", min_length=1)
    flowback_type: str = Field(alias="flowbackType", min_length=1)
    target_dataset_id: str = Field(default="", alias="targetDatasetId")


class NativeResourceSyncExecutionPayload(_StrictPayload):
    resource_type: Literal[
        "LLM_CONNECTION",
        "MODEL",
        "EVALUATOR",
        "PROJECT_API_KEY",
    ] = Field(alias="resourceType")
    operation: Literal["CREATE", "UPDATE", "DELETE", "MIGRATE"]
    local_resource_id: str = Field(alias="localResourceId", min_length=1)
    provider: str = ""


_RESOURCE_MODELS: dict[ResourceExtensionType, type[_StrictPayload]] = {
    ResourceExtensionType.DEFAULT_EVALUATION_MODEL: DefaultEvaluationModelPayload,
    ResourceExtensionType.ITEM_ASSIGNMENT_POLICY: ItemAssignmentPolicyPayload,
    ResourceExtensionType.API_KEY_DISPLAY_NOTE: ApiKeyDisplayNotePayload,
    ResourceExtensionType.RESOURCE_DISPLAY_OVERRIDE: ResourceDisplayOverridePayload,
    ResourceExtensionType.RESOURCE_SOFT_DELETE: ResourceSoftDeletePayload,
    ResourceExtensionType.PROJECT_ARCHIVE_STATE: ProjectArchiveStatePayload,
}

_EXECUTION_MODELS: dict[JobExecutionType, type[_StrictPayload]] = {
    JobExecutionType.AUTO_EVALUATION: AutoEvaluationExecutionPayload,
    JobExecutionType.SCHEDULED_EVALUATION: ScheduledEvaluationExecutionPayload,
    JobExecutionType.DATASET_EXPORT: DatasetExportExecutionPayload,
    JobExecutionType.ANNOTATION_EXPORT: AnnotationExportExecutionPayload,
    JobExecutionType.TRACE_DATASET_IMPORT: TraceBulkExecutionPayload,
    JobExecutionType.TRACE_ANNOTATION_IMPORT: TraceBulkExecutionPayload,
    JobExecutionType.REPORT_FLOWBACK: ReportFlowbackExecutionPayload,
    JobExecutionType.NATIVE_RESOURCE_SYNC: NativeResourceSyncExecutionPayload,
}

_SENSITIVE_KEYS = {
    "authorization",
    "authtoken",
    "password",
    "secret",
    "secretkey",
    "token",
}


def _reject_sensitive_keys(value: Any, path: str = "payload") -> None:
    if isinstance(value, dict):
        for key, nested_value in value.items():
            normalized = str(key).replace("_", "").replace("-", "").lower()
            if normalized in _SENSITIVE_KEYS:
                raise ValueError(f"{path}.{key} 包含禁止持久化的敏感字段")
            _reject_sensitive_keys(nested_value, f"{path}.{key}")
    elif isinstance(value, list):
        for index, nested_value in enumerate(value):
            _reject_sensitive_keys(nested_value, f"{path}[{index}]")


def validate_resource_extension(
    extension_type: ResourceExtensionType,
    payload: dict[str, Any],
) -> dict[str, Any]:
    _reject_sensitive_keys(payload)
    validated = _RESOURCE_MODELS[extension_type].model_validate(payload)
    return validated.model_dump(by_alias=True)


def validate_execution_payload(
    job_type: JobExecutionType,
    payload: dict[str, Any],
) -> dict[str, Any]:
    _reject_sensitive_keys(payload)
    validated = _EXECUTION_MODELS[job_type].model_validate(payload)
    return validated.model_dump(by_alias=True)


_ALLOWED_TRANSITIONS: dict[JobExecutionStatus, set[JobExecutionStatus]] = {
    JobExecutionStatus.PENDING: {
        JobExecutionStatus.RUNNING,
        JobExecutionStatus.FAILED,
        JobExecutionStatus.CANCELLED,
    },
    JobExecutionStatus.RUNNING: {
        JobExecutionStatus.SUCCEEDED,
        JobExecutionStatus.PARTIAL_FAILED,
        JobExecutionStatus.FAILED,
        JobExecutionStatus.CANCELLED,
    },
    JobExecutionStatus.FAILED: {
        JobExecutionStatus.RUNNING,
        JobExecutionStatus.CANCELLED,
    },
    JobExecutionStatus.SUCCEEDED: set(),
    JobExecutionStatus.PARTIAL_FAILED: set(),
    JobExecutionStatus.CANCELLED: set(),
}


def ensure_status_transition(
    current: JobExecutionStatus,
    target: JobExecutionStatus,
) -> None:
    if current == target:
        return
    if target not in _ALLOWED_TRANSITIONS[current]:
        raise ValueError(f"非法任务状态流转: {current.value} -> {target.value}")
