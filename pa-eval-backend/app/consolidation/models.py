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
    SCENE_CONFIG = "SCENE_CONFIG"
    EXPERIMENT_GROUP_SNAPSHOT = "EXPERIMENT_GROUP_SNAPSHOT"
    EXPERIMENT_REPORT_SNAPSHOT = "EXPERIMENT_REPORT_SNAPSHOT"
    EXPERIMENT_REPORT_BASELINE = "EXPERIMENT_REPORT_BASELINE"


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


class SceneRunParametersPayload(_StrictPayload):
    concurrency: int = Field(ge=1, le=100)
    timeout_seconds: int = Field(alias="timeoutSeconds", ge=1, le=3600)
    retry_count: int = Field(alias="retryCount", ge=0, le=10)
    rounds: int = Field(ge=1, le=20)


class SceneWebhookServicePayload(_StrictPayload):
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    url: str = Field(min_length=1, max_length=2000)
    method: Literal["POST"] = "POST"
    auth_type: Literal["NONE", "BEARER", "API_KEY"] = Field(
        default="NONE", alias="authType"
    )
    masked_credential: str = Field(default="", alias="maskedCredential", max_length=200)
    credential_ref: str = Field(default="", alias="credentialRef", max_length=240)
    api_key_header: str = Field(default="", alias="apiKeyHeader", max_length=120)
    headers: dict[str, str] = Field(default_factory=dict)
    service_family: str = Field(alias="serviceFamily", min_length=1, max_length=120)
    version: str = Field(default="", max_length=120)


class SceneConfigPayload(_StrictPayload):
    id: str = Field(min_length=1, max_length=120)
    project_id: str = Field(alias="projectId", min_length=1)
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    enabled: bool = True
    supports_scheduled_execution: bool = Field(
        default=False, alias="supportsScheduledExecution"
    )
    default_scheduled_webhook_ids: list[str] = Field(
        default_factory=list, alias="defaultScheduledWebhookIds"
    )
    dataset_id: str = Field(alias="datasetId", min_length=1)
    evaluator_ids: list[str] = Field(default_factory=list, alias="evaluatorIds")
    webhooks: list[SceneWebhookServicePayload] = Field(min_length=1)
    run_parameters: SceneRunParametersPayload = Field(alias="runParameters")
    created_at: str = Field(alias="createdAt", min_length=1)
    updated_at: str = Field(alias="updatedAt", min_length=1)

    @model_validator(mode="after")
    def validate_scene_bindings(self) -> "SceneConfigPayload":
        webhook_ids = {webhook.id for webhook in self.webhooks}
        if len(webhook_ids) != len(self.webhooks):
            raise ValueError("Webhook 服务 ID 不能重复")
        if not self.evaluator_ids:
            raise ValueError("场景至少需要绑定一个评估器")
        missing_default_ids = [
            webhook_id
            for webhook_id in self.default_scheduled_webhook_ids
            if webhook_id not in webhook_ids
        ]
        if self.supports_scheduled_execution and missing_default_ids:
            raise ValueError("默认定时 Webhook 必须属于当前场景")
        return self


class ExperimentGroupSnapshotPayload(_StrictPayload):
    id: str = Field(min_length=1)
    project_id: str = Field(alias="projectId", min_length=1)
    dataset_id: str = Field(alias="datasetId", min_length=1)
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    scene_id: str = Field(alias="sceneId", min_length=1)
    scene_snapshot: dict[str, Any] = Field(alias="sceneSnapshot")
    evaluator_snapshots: list[dict[str, Any]] = Field(alias="evaluatorSnapshots")
    run_parameters: dict[str, Any] = Field(alias="runParameters")
    langfuse_experiment_name: str = Field(alias="langfuseExperimentName", min_length=1)
    created_at: str = Field(alias="createdAt", min_length=1)


class ExperimentReportSnapshotPayload(_StrictPayload):
    id: str = Field(min_length=1)
    project_id: str = Field(alias="projectId", min_length=1)
    dataset_id: str = Field(alias="datasetId", min_length=1)
    experiment_group_id: str = Field(alias="experimentGroupId", min_length=1)
    experiment_name: str = Field(alias="experimentName", min_length=1)
    langfuse_experiment_name: str = Field(alias="langfuseExperimentName", min_length=1)
    name: str = Field(min_length=1)
    scene_id: str = Field(alias="sceneId", min_length=1)
    scene_snapshot: dict[str, Any] = Field(alias="sceneSnapshot")
    webhook_snapshot: dict[str, Any] = Field(alias="webhookSnapshot")
    evaluator_snapshots: list[dict[str, Any]] = Field(alias="evaluatorSnapshots")
    run_parameters: dict[str, Any] = Field(alias="runParameters")
    status: Literal["QUEUED", "RUNNING", "SCORING", "COMPLETED", "FAILED"]
    progress: int = Field(ge=0, le=100)
    item_count: int = Field(alias="itemCount", ge=0)
    successful_item_count: int = Field(alias="successfulItemCount", ge=0)
    failed_item_count: int = Field(alias="failedItemCount", ge=0)
    score_results: list[dict[str, Any]] = Field(alias="scoreResults")
    round_results: list[dict[str, Any]] = Field(alias="roundResults")
    item_results: list[dict[str, Any]] = Field(alias="itemResults")
    insight: str = ""
    failure_reason: str | None = Field(default=None, alias="failureReason")
    created_at: str = Field(alias="createdAt", min_length=1)
    completed_at: str | None = Field(default=None, alias="completedAt")


class ExperimentReportBaselinePayload(_StrictPayload):
    id: str = Field(min_length=1)
    project_id: str = Field(alias="projectId", min_length=1)
    dataset_id: str = Field(alias="datasetId", min_length=1)
    scene_id: str = Field(alias="sceneId", min_length=1)
    service_family: str = Field(alias="serviceFamily", min_length=1)
    report_id: str = Field(alias="reportId", min_length=1)
    created_at: str = Field(alias="createdAt", min_length=1)
    updated_at: str = Field(alias="updatedAt", min_length=1)


class AutoEvaluationExecutionPayload(_StrictPayload):
    task_id: str = Field(alias="taskId", min_length=1)
    run_id: str = Field(alias="runId", min_length=1)
    report_id: str = Field(default="", alias="reportId")


class ScheduledEvaluationExecutionPayload(_StrictPayload):
    scheduled_job_id: str = Field(alias="scheduledJobId", min_length=1)
    fire_key: str = Field(alias="fireKey", min_length=1)
    task_type: Literal["AUTO_EVALUATION", "RUN_EXPERIMENT"] = Field(
        default="AUTO_EVALUATION", alias="taskType"
    )
    auto_evaluation_task_id: str = Field(default="", alias="autoEvaluationTaskId")
    scheduled_job_name: str = Field(default="", alias="scheduledJobName")
    trigger_type: str = Field(default="", alias="triggerType")
    auto_evaluation_task_name: str = Field(
        default="", alias="autoEvaluationTaskName"
    )
    scheduled_fire_at: str = Field(default="", alias="scheduledFireAt")
    binding: dict[str, Any] = Field(default_factory=dict)
    scene_id: str = Field(default="", alias="sceneId")
    scene_name: str = Field(default="", alias="sceneName")
    experiment_name: str = Field(default="", alias="experimentName")
    dataset_id: str = Field(default="", alias="datasetId")
    experiment_group_id: str = Field(default="", alias="experimentGroupId")
    report_ids: list[str] = Field(default_factory=list, alias="reportIds")
    experiment_report_id: str = Field(default="", alias="experimentReportId")
    experiment_report_name: str = Field(default="", alias="experimentReportName")


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
    ResourceExtensionType.SCENE_CONFIG: SceneConfigPayload,
    ResourceExtensionType.EXPERIMENT_GROUP_SNAPSHOT: ExperimentGroupSnapshotPayload,
    ResourceExtensionType.EXPERIMENT_REPORT_SNAPSHOT: ExperimentReportSnapshotPayload,
    ResourceExtensionType.EXPERIMENT_REPORT_BASELINE: ExperimentReportBaselinePayload,
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
    "credential",
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
