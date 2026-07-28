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
