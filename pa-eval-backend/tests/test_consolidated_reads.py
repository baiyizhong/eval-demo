from typing import Any

import pytest

import app.langfuse_db as langfuse_db
from app.config import Settings
from app.errors import BusinessError
from app.langfuse_db import LangfuseDatabaseReader


class ModelSettingsReader(LangfuseDatabaseReader):
    def __init__(self) -> None:
        super().__init__(Settings())

    async def _ensure_project_visible(self, project_id: str, user_id: str) -> None:
        return None

    async def _project_public_client_for_user(
        self, project_id: str, user_id: str
    ) -> "ModelSettingsPublicClient":
        return ModelSettingsPublicClient()

    async def _fetch_all(
        self,
        sql: str,
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        if "FROM pa_project_model_settings" in sql:
            return [
                {
                    "id": "legacy-default",
                    "llm_connection_id": "connection-1",
                    "model": "legacy-model",
                    "temperature": "0.9",
                    "provider": "OpenAI",
                    "adapter": "openai",
                }
            ]
        if "FROM pa_resource_extensions" in sql:
            return [
                {
                    "id": "extension-default",
                    "payload": {
                        "legacyId": "legacy-default",
                        "llmConnectionId": "connection-1",
                        "model": "gpt-4.1",
                        "temperature": "0.1",
                    },
                }
            ]
        raise AssertionError(sql)


class ModelSettingsPublicClient:
    async def list_all_llm_connections(self) -> list[dict[str, Any]]:
        return [
            {
                "id": "connection-1",
                "provider": "OpenAI",
                "adapter": "openai",
                "displaySecretKey": "sk-...demo",
                "baseURL": "",
                "customModels": ["gpt-4.1"],
                "withDefaultModels": True,
            }
        ]

    async def list_all_models(self) -> list[dict[str, Any]]:
        return []

    async def aclose(self) -> None:
        return None


class QueueSettingsCursor:
    def __init__(self) -> None:
        self.sql = ""

    async def execute(self, sql: str, params: dict[str, Any]) -> None:
        self.sql = sql

    async def fetchone(self) -> dict[str, Any] | None:
        return {
            "payload": {
                "assignmentStrategy": "weighted",
                "assignmentWeights": {"user-1": 2, "user-2": 1},
            }
        }


@pytest.mark.anyio
async def test_default_model_prefers_extension_by_default() -> None:
    result = await ModelSettingsReader().get_project_model_settings_for_user(
        "project-1",
        "user-1",
    )

    assert result["defaultModel"]["id"] == "legacy-default"
    assert result["defaultModel"]["model"] == "gpt-4.1"
    assert result["defaultModel"]["temperature"] == "0.1"


@pytest.mark.anyio
async def test_assignment_policy_prefers_extension_and_normalizes_weights() -> None:
    reader = LangfuseDatabaseReader(Settings())
    cursor = QueueSettingsCursor()

    strategy, weights = await reader._get_annotation_queue_assignment_settings(
        cursor,  # type: ignore[arg-type]
        "project-1",
        "queue-1",
        ["user-1", "user-2"],
    )

    assert "pa_resource_extensions" in cursor.sql
    assert strategy == "weighted"
    assert weights == {"user-1": 2, "user-2": 1}


def test_annotation_queue_query_always_uses_contracted_extension_table() -> None:
    sql = LangfuseDatabaseReader(Settings())._annotation_queue_select_sql()

    assert "pa_resource_extensions" in sql
    assert "assignmentStrategy" in sql
    assert "pa_annotation_queue_settings" not in sql


class AnnotationExportCursor:
    def __init__(self, *, exists: bool) -> None:
        self.exists = exists
        self.rowcount = 0
        self.executions: list[tuple[str, dict[str, Any]]] = []
        self._row: dict[str, Any] | None = None

    async def __aenter__(self) -> "AnnotationExportCursor":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def execute(self, sql: str, params: dict[str, Any]) -> None:
        self.executions.append((sql, params))
        if sql.lstrip().startswith("UPDATE pa_job_executions"):
            self.rowcount = 0
            self._row = None
        elif sql.lstrip().startswith("SELECT 1"):
            self._row = {"exists": 1} if self.exists else None

    async def fetchone(self) -> dict[str, Any] | None:
        row = self._row
        self._row = None
        return row


class AnnotationExportConnection:
    def __init__(self, cursor: AnnotationExportCursor) -> None:
        self._cursor = cursor

    async def __aenter__(self) -> "AnnotationExportConnection":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    def cursor(self) -> AnnotationExportCursor:
        return self._cursor


@pytest.mark.anyio
async def test_annotation_export_terminal_update_is_idempotent_on_status_mismatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = AnnotationExportCursor(exists=True)

    async def fake_connect(*args: object, **kwargs: object) -> AnnotationExportConnection:
        return AnnotationExportConnection(cursor)

    monkeypatch.setattr(langfuse_db, "connect_postgres", fake_connect)
    reader = LangfuseDatabaseReader(Settings(langfuse_database_url="postgresql://db"))

    await reader.mark_annotation_export_job_failed(
        "project-1", "queue-1", "job-1", "failed"
    )

    update_sql = cursor.executions[0][0]
    assert "UPDATE pa_job_executions" in update_sql
    assert "status IN ('PENDING', 'RUNNING')" in update_sql
    assert any(sql.lstrip().startswith("SELECT 1") for sql, _ in cursor.executions)


@pytest.mark.anyio
async def test_annotation_export_update_raises_when_execution_does_not_exist(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = AnnotationExportCursor(exists=False)

    async def fake_connect(*args: object, **kwargs: object) -> AnnotationExportConnection:
        return AnnotationExportConnection(cursor)

    monkeypatch.setattr(langfuse_db, "connect_postgres", fake_connect)
    reader = LangfuseDatabaseReader(Settings(langfuse_database_url="postgresql://db"))

    with pytest.raises(BusinessError) as error:
        await reader.mark_annotation_export_job_running(
            "project-1", "queue-1", "job-1"
        )

    assert error.value.code == 1032
