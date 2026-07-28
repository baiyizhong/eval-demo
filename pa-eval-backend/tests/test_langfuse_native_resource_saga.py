import asyncio
from datetime import UTC, datetime
from typing import Any

import pytest

from app import langfuse_db
from app.config import Settings
from app.langfuse_db import LangfuseDatabaseReader


class FakeCursor:
    def __init__(self, rows: list[dict[str, Any] | None]) -> None:
        self.rows = list(rows)
        self.executions: list[tuple[str, dict[str, Any]]] = []

    async def __aenter__(self) -> "FakeCursor":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def execute(self, sql: str, params: dict[str, Any]) -> None:
        self.executions.append((sql, params))

    async def fetchone(self) -> dict[str, Any] | None:
        return self.rows.pop(0) if self.rows else None


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self._cursor = cursor

    async def __aenter__(self) -> "FakeConnection":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    def cursor(self) -> FakeCursor:
        return self._cursor


class FakePublicClient:
    def __init__(self) -> None:
        self.upsert_result: dict[str, Any] = {
            "id": "native-connection-1",
            "provider": "openai",
            "adapter": "openai",
            "displaySecretKey": "sk-...cret",
            "baseURL": "https://api.example.com/v1",
            "customModels": ["gpt-4.1"],
            "withDefaultModels": True,
        }
        self.model_result: dict[str, Any] = {
            "id": "native-model-2",
            "modelName": "gpt-4.1",
            "matchPattern": "(?i)^gpt-4.1$",
            "unit": "TOKENS",
            "inputPrice": 0.001,
            "outputPrice": 0.002,
            "tokenizerId": None,
            "isLangfuseManaged": False,
        }
        self.evaluator_result: dict[str, Any] = {"id": "native-evaluator-1"}
        self.deleted_connections: list[str] = []
        self.deleted_models: list[str] = []
        self.deleted_evaluators: list[str] = []
        self.deleted_api_keys: list[tuple[str, str]] = []
        self.created_model_payloads: list[dict[str, Any]] = []
        self.fail_model_create_once = False
        self.cancel_after_connection_upsert = False
        self.connection_side_effect_created = False
        self.fail_connection_probe_after_upsert = False
        self.cancel_model_create_once = False
        self.listed_models: list[dict[str, Any]] = []
        self.closed = 0

    async def upsert_llm_connection(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self.cancel_after_connection_upsert:
            self.connection_side_effect_created = True
            raise asyncio.CancelledError()
        return self.upsert_result

    async def list_all_llm_connections(self) -> list[dict[str, Any]]:
        if self.connection_side_effect_created:
            if self.fail_connection_probe_after_upsert:
                raise RuntimeError("probe failed")
            return [self.upsert_result]
        return []

    async def delete_llm_connection(self, resource_id: str) -> dict[str, Any]:
        self.deleted_connections.append(resource_id)
        return {}

    async def create_model(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.created_model_payloads.append(payload)
        if self.cancel_model_create_once:
            self.cancel_model_create_once = False
            raise asyncio.CancelledError()
        if self.fail_model_create_once:
            self.fail_model_create_once = False
            raise RuntimeError("native create failed")
        return self.model_result

    async def list_all_models(self) -> list[dict[str, Any]]:
        return self.listed_models

    async def get_model(self, resource_id: str) -> dict[str, Any]:
        return {**self.model_result, "id": resource_id}

    async def delete_model(self, resource_id: str) -> dict[str, Any]:
        self.deleted_models.append(resource_id)
        return {}

    async def create_evaluator(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.evaluator_result

    async def delete_evaluator(self, resource_id: str) -> dict[str, Any]:
        self.deleted_evaluators.append(resource_id)
        return {}

    async def create_project_api_key(
        self, project_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        return {
            "id": "native-key-1",
            "publicKey": "pk-lf-native",
            "secretKey": "sk-lf-native",
        }

    async def delete_project_api_key(
        self, project_id: str, resource_id: str
    ) -> dict[str, Any]:
        self.deleted_api_keys.append((project_id, resource_id))
        return {}

    async def aclose(self) -> None:
        self.closed += 1
        if getattr(self, "fail_close", False):
            raise RuntimeError("close failed")


class SagaReader(LangfuseDatabaseReader):
    def __init__(self, client: FakePublicClient) -> None:
        super().__init__(
            Settings(
                langfuse_database_url="postgresql://example",
            )
        )
        self.client = client
        self.starts: list[dict[str, Any]] = []
        self.finishes: list[dict[str, Any]] = []
        self.fetch_rows: list[dict[str, Any]] = []
        self.released_provider_locks = 0
        self.acquired_model_locks = 0
        self.released_model_locks = 0

    async def _project_public_client_for_user(
        self, project_id: str, user_id: str
    ) -> FakePublicClient:
        return self.client

    async def _acquire_native_provider_lock(
        self, project_id: str, provider: str
    ) -> Any:
        return object()

    async def _release_native_provider_lock(
        self, connection: Any, project_id: str, provider: str
    ) -> None:
        self.released_provider_locks += 1

    async def _acquire_native_model_lock(self, project_id: str) -> Any:
        self.acquired_model_locks += 1
        return object()

    async def _release_native_model_lock(self, handle: Any) -> None:
        self.released_model_locks += 1

    async def _start_native_resource_sync(self, **kwargs: Any) -> str:
        self.starts.append(kwargs)
        return "execution-1"

    async def _finish_native_resource_sync(self, **kwargs: Any) -> None:
        self.finishes.append(kwargs)

    async def _ensure_project_visible(self, project_id: str, user_id: str) -> None:
        return None

    async def _fetch_all(
        self, sql: str, params: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        return self.fetch_rows


def _llm_payload() -> dict[str, Any]:
    return {
        "provider": "openai",
        "adapter": "openai",
        "secretKey": "provider-secret",
        "baseUrl": "https://api.example.com/v1",
        "customModels": ["gpt-4.1"],
        "withDefaultModels": True,
    }


@pytest.mark.anyio
async def test_llm_connection_create_finishes_native_saga_without_shadow_write() -> None:
    reader = SagaReader(FakePublicClient())

    result = await reader.create_project_llm_connection_for_user(
        "project-1", "user-1", "owner@example.com", _llm_payload()
    )

    assert result["id"] == "native-connection-1"
    assert reader.starts[0]["resource_type"] == "LLM_CONNECTION"
    assert "provider-secret" not in repr(reader.starts)
    assert reader.finishes == [
        {
            "project_id": "project-1",
            "execution_id": "execution-1",
            "actor": "owner@example.com",
            "succeeded": True,
            "external_resource_id": "native-connection-1",
        }
    ]


@pytest.mark.anyio
async def test_llm_connection_create_releases_lock_when_client_close_fails() -> None:
    client = FakePublicClient()
    client.fail_close = True
    reader = SagaReader(client)

    with pytest.raises(RuntimeError, match="close failed"):
        await reader.create_project_llm_connection_for_user(
            "project-1", "user-1", "owner@example.com", _llm_payload()
        )

    assert reader.released_provider_locks == 1


@pytest.mark.anyio
async def test_llm_connection_create_compensates_and_finishes_when_cancelled() -> None:
    client = FakePublicClient()
    client.cancel_after_connection_upsert = True
    reader = SagaReader(client)

    with pytest.raises(asyncio.CancelledError):
        await reader.create_project_llm_connection_for_user(
            "project-1", "user-1", "owner@example.com", _llm_payload()
        )

    assert client.deleted_connections == ["native-connection-1"]
    assert reader.finishes[-1]["succeeded"] is False
    assert reader.finishes[-1]["compensated"] is True
    assert reader.released_provider_locks == 1


@pytest.mark.anyio
async def test_llm_connection_create_finishes_when_unknown_result_probe_fails() -> None:
    client = FakePublicClient()
    client.cancel_after_connection_upsert = True
    client.fail_connection_probe_after_upsert = True
    reader = SagaReader(client)

    with pytest.raises(asyncio.CancelledError):
        await reader.create_project_llm_connection_for_user(
            "project-1", "user-1", "owner@example.com", _llm_payload()
        )

    assert reader.finishes[-1]["succeeded"] is False
    assert reader.finishes[-1]["compensated"] is False


@pytest.mark.anyio
async def test_llm_connection_create_compensates_when_audit_finish_fails() -> None:
    client = FakePublicClient()
    reader = SagaReader(client)
    original_finish = reader._finish_native_resource_sync
    failed = False

    async def fail_success_once(**kwargs: Any) -> None:
        nonlocal failed
        if kwargs["succeeded"] and not failed:
            failed = True
            raise RuntimeError("audit finish failed")
        await original_finish(**kwargs)

    reader._finish_native_resource_sync = fail_success_once  # type: ignore[method-assign]

    with pytest.raises(RuntimeError, match="audit finish failed"):
        await reader.create_project_llm_connection_for_user(
            "project-1", "user-1", "owner@example.com", _llm_payload()
        )

    assert client.deleted_connections == ["native-connection-1"]
    assert reader.finishes[-1]["succeeded"] is False
    assert reader.finishes[-1]["compensated"] is True


@pytest.mark.anyio
async def test_model_update_restores_old_version_when_native_create_fails() -> None:
    client = FakePublicClient()
    client.fail_model_create_once = True
    reader = SagaReader(client)

    with pytest.raises(RuntimeError, match="native create failed"):
        await reader.update_project_model_definition_for_user(
            "project-1",
            "model-1",
            "user-1",
            "owner@example.com",
            {
                "modelName": "gpt-4.1",
                "matchPattern": "(?i)^gpt-4.1$",
                "unit": "TOKENS",
                "inputPrice": "0.001",
                "outputPrice": "0.002",
                "tokenizerId": "",
            },
        )

    assert client.deleted_models == ["model-1"]
    assert len(client.created_model_payloads) == 2
    assert reader.finishes[-1]["compensated"] is True


@pytest.mark.anyio
async def test_model_create_never_compensates_preexisting_matching_model() -> None:
    client = FakePublicClient()
    client.listed_models = [{**client.model_result, "id": "preexisting-model"}]
    client.fail_model_create_once = True
    reader = SagaReader(client)

    with pytest.raises(RuntimeError, match="native create failed"):
        await reader.create_project_model_definition_for_user(
            "project-1",
            "user-1",
            "owner@example.com",
            {
                "modelName": "gpt-4.1",
                "matchPattern": "(?i)^gpt-4.1$",
                "unit": "TOKENS",
                "inputPrice": "0.001",
                "outputPrice": "0.002",
                "tokenizerId": "",
            },
        )

    assert client.deleted_models == []
    assert reader.finishes[-1]["succeeded"] is False
    assert reader.finishes[-1]["compensated"] is False
    assert reader.acquired_model_locks == 1
    assert reader.released_model_locks == 1


@pytest.mark.anyio
async def test_model_update_restores_old_version_when_cancelled() -> None:
    client = FakePublicClient()
    client.cancel_model_create_once = True
    reader = SagaReader(client)

    with pytest.raises(asyncio.CancelledError):
        await reader.update_project_model_definition_for_user(
            "project-1",
            "model-1",
            "user-1",
            "owner@example.com",
            {
                "modelName": "gpt-4.1",
                "matchPattern": "(?i)^gpt-4.1$",
                "unit": "TOKENS",
                "inputPrice": "0.001",
                "outputPrice": "0.002",
                "tokenizerId": "",
            },
        )

    assert client.deleted_models == ["model-1"]
    assert len(client.created_model_payloads) == 2
    assert reader.finishes[-1]["succeeded"] is False
    assert reader.finishes[-1]["compensated"] is True


@pytest.mark.anyio
async def test_project_api_key_create_uses_org_api_without_native_table_write(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = datetime(2026, 7, 23, tzinfo=UTC)
    cursor = FakeCursor(
        [
            {"id": "project-1", "name": "Project"},
            {
                "id": "key-1",
                "project_id": "project-1",
                "note": "Dify",
                "public_key": "pk-lf-native",
                "secret_key": "sk-lf-native",
                "create_date": now,
                "update_by": "owner@example.com",
                "update_date": now,
            },
        ]
    )

    async def fake_connect(*args: object, **kwargs: object) -> FakeConnection:
        return FakeConnection(cursor)

    client = FakePublicClient()
    monkeypatch.setattr(langfuse_db, "connect_postgres", fake_connect)
    monkeypatch.setattr(langfuse_db, "LangfusePublicClient", lambda **kwargs: client)
    monkeypatch.setattr(langfuse_db, "_new_langfuse_id", lambda prefix: "key-1")
    reader = SagaReader(client)
    reader._langfuse_salt = "test-salt"

    result = await reader.create_project_api_key(
        "project-1", "Dify", "owner@example.com", "user-1"
    )

    assert result["publicKey"] == "pk-lf-native"
    assert result["secretKey"] == "sk-lf-native"
    assert reader.finishes == []
    assert all("INSERT INTO api_keys" not in sql for sql, _ in cursor.executions)
