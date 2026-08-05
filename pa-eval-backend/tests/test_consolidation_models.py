import pytest
from pydantic import ValidationError

from app.consolidation.models import (
    JobExecutionStatus,
    JobExecutionType,
    ResourceExtensionType,
    ensure_status_transition,
    validate_execution_payload,
    validate_resource_extension,
)


def test_validates_default_evaluation_model_extension() -> None:
    payload = validate_resource_extension(
        ResourceExtensionType.DEFAULT_EVALUATION_MODEL,
        {
            "llmConnectionId": "connection-1",
            "model": "gpt-4.1",
            "temperature": "0.2",
        },
    )

    assert payload == {
        "llmConnectionId": "connection-1",
        "model": "gpt-4.1",
        "temperature": "0.2",
    }


def test_validates_weighted_annotation_assignment_policy() -> None:
    payload = validate_resource_extension(
        ResourceExtensionType.ITEM_ASSIGNMENT_POLICY,
        {
            "assignmentStrategy": "weighted",
            "assignmentWeights": {"user-1": 2, "user-2": 1},
        },
    )

    assert payload["assignmentStrategy"] == "weighted"
    assert payload["assignmentWeights"] == {"user-1": 2, "user-2": 1}


@pytest.mark.parametrize("secret_key", ["secretKey", "authToken", "authorization"])
def test_rejects_sensitive_keys_at_any_payload_depth(secret_key: str) -> None:
    with pytest.raises(ValueError, match="敏感字段"):
        validate_execution_payload(
            JobExecutionType.TRACE_DATASET_IMPORT,
            {
                "selectionType": "EXPLICIT",
                "selectionPayload": {"traceIds": ["trace-1"]},
                "operationPayload": {"nested": {secret_key: "do-not-store"}},
            },
        )


def test_rejects_unknown_resource_extension_fields() -> None:
    with pytest.raises(ValidationError):
        validate_resource_extension(
            ResourceExtensionType.DEFAULT_EVALUATION_MODEL,
            {
                "llmConnectionId": "connection-1",
                "model": "gpt-4.1",
                "temperature": "0.2",
                "unexpected": True,
            },
        )


def test_scene_config_allows_webhook_credential_ref_but_rejects_secret_value() -> None:
    payload = {
        "id": "scene-1",
        "projectId": "project-1",
        "name": "E2E 场景",
        "description": "",
        "enabled": True,
        "supportsScheduledExecution": True,
        "defaultScheduledWebhookIds": ["webhook-1"],
        "datasetId": "dataset-1",
        "evaluatorIds": ["eval-1"],
        "webhooks": [
            {
                "id": "webhook-1",
                "name": "Webhook",
                "description": "",
                "url": "http://127.0.0.1:8099/run",
                "method": "POST",
                "authType": "BEARER",
                "maskedCredential": "Bearer ****oken",
                "credentialRef": "PA_WEBHOOK_TOKEN",
                "apiKeyHeader": "",
                "headers": {},
                "serviceFamily": "agent",
                "version": "v1",
            }
        ],
        "runParameters": {
            "concurrency": 1,
            "timeoutSeconds": 30,
            "retryCount": 0,
            "rounds": 1,
        },
        "createdAt": "2026-07-31T00:00:00.000Z",
        "updatedAt": "2026-07-31T00:00:00.000Z",
    }

    validated = validate_resource_extension(ResourceExtensionType.SCENE_CONFIG, payload)

    assert validated["webhooks"][0]["credentialRef"] == "PA_WEBHOOK_TOKEN"
    with pytest.raises(ValueError, match="敏感字段"):
        validate_resource_extension(
            ResourceExtensionType.SCENE_CONFIG,
            {
                **payload,
                "webhooks": [{**payload["webhooks"][0], "credential": "secret-token"}],
            },
        )


def test_experiment_snapshots_accept_runtime_actor_and_remote_run_fields() -> None:
    group = validate_resource_extension(
        ResourceExtensionType.EXPERIMENT_GROUP_SNAPSHOT,
        {
            "id": "experiment_group_1",
            "projectId": "project-1",
            "datasetId": "dataset-1",
            "name": "远端闭环实验",
            "description": "",
            "sceneId": "scene-1",
            "sceneSnapshot": {"id": "scene-1"},
            "evaluatorSnapshots": [{"id": "eval-1"}],
            "runParameters": {"concurrency": 1},
            "langfuseExperimentName": "远端闭环实验::experiment_group_1",
            "createdByUserId": "user-1",
            "createdByEmail": "dev@example.com",
            "createdAt": "2026-08-05T00:00:00.000Z",
        },
    )

    assert group["createdByUserId"] == "user-1"
    assert group["createdByEmail"] == "dev@example.com"

    report = validate_resource_extension(
        ResourceExtensionType.EXPERIMENT_REPORT_SNAPSHOT,
        {
            "id": "experiment_report_1",
            "projectId": "project-1",
            "datasetId": "dataset-1",
            "experimentGroupId": "experiment_group_1",
            "experimentName": "远端闭环实验",
            "langfuseExperimentName": "远端闭环实验 - runner::experiment_report_1",
            "externalRunId": "remote-run-1",
            "createdByUserId": "user-1",
            "createdByEmail": "dev@example.com",
            "name": "远端闭环实验 - runner",
            "sceneId": "scene-1",
            "sceneSnapshot": {"id": "scene-1"},
            "webhookSnapshot": {"id": "webhook-1", "serviceFamily": "agent"},
            "evaluatorSnapshots": [{"id": "eval-1"}],
            "runParameters": {"concurrency": 1},
            "status": "RUNNING",
            "progress": 25,
            "itemCount": 1,
            "successfulItemCount": 0,
            "failedItemCount": 0,
            "scoreResults": [],
            "roundResults": [],
            "itemResults": [],
            "insight": "远程实验已触发",
            "createdAt": "2026-08-05T00:00:00.000Z",
            "completedAt": None,
        },
    )

    assert report["externalRunId"] == "remote-run-1"
    assert report["createdByUserId"] == "user-1"
    assert report["createdByEmail"] == "dev@example.com"


def test_job_status_transition_allows_retry_but_not_terminal_reopen() -> None:
    ensure_status_transition(JobExecutionStatus.FAILED, JobExecutionStatus.RUNNING)

    with pytest.raises(ValueError, match="非法任务状态流转"):
        ensure_status_transition(
            JobExecutionStatus.SUCCEEDED,
            JobExecutionStatus.RUNNING,
        )


def test_validates_native_resource_sync_without_persisting_credentials() -> None:
    payload = validate_execution_payload(
        JobExecutionType.NATIVE_RESOURCE_SYNC,
        {
            "resourceType": "LLM_CONNECTION",
            "operation": "CREATE",
            "localResourceId": "connection-1",
            "provider": "openai",
        },
    )

    assert payload["localResourceId"] == "connection-1"
    with pytest.raises(ValueError, match="敏感字段"):
        validate_execution_payload(
            JobExecutionType.NATIVE_RESOURCE_SYNC,
            {
                **payload,
                "secretKey": "must-not-persist",
            },
        )


def test_validates_native_resource_migration_operation() -> None:
    payload = validate_execution_payload(
        JobExecutionType.NATIVE_RESOURCE_SYNC,
        {
            "resourceType": "MODEL",
            "operation": "MIGRATE",
            "localResourceId": "legacy-model-1",
            "provider": "",
        },
    )

    assert payload["operation"] == "MIGRATE"
