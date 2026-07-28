from typing import Any

import pytest

import app.langfuse_db as langfuse_db
from app.config import Settings
from app.errors import BusinessError, LangfuseResourceConflictError
from app.langfuse_db import LangfuseDatabaseReader


class FakeNativeClient:
    def __init__(self) -> None:
        self.connections = [
            {
                "id": "native-connection-1",
                "provider": "OpenAI",
                "adapter": "openai",
                "displaySecretKey": "sk-...alue",
                "baseURL": "https://api.openai.com/v1",
                "customModels": ["gpt-4.1"],
                "withDefaultModels": True,
            }
        ]
        self.models = [
            {
                "id": "native-model-1",
                "modelName": "gpt-4.1",
                "matchPattern": "(?i)^gpt-4.1$",
                "unit": "TOKENS",
                "inputPrice": 0.001,
                "outputPrice": 0.002,
                "tokenizerId": "openai",
                "isLangfuseManaged": False,
            },
            {
                "id": "managed-model-1",
                "modelName": "managed",
                "matchPattern": "managed",
                "unit": "TOKENS",
                "inputPrice": 0,
                "outputPrice": 0,
                "tokenizerId": None,
                "isLangfuseManaged": True,
            },
        ]
        self.events: list[tuple[str, Any]] = []
        self.fail_next_model_create = False

    async def list_all_llm_connections(self) -> list[dict[str, Any]]:
        return self.connections

    async def list_all_models(self) -> list[dict[str, Any]]:
        return self.models

    async def upsert_llm_connection(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.events.append(("upsert-connection", payload))
        return {**self.connections[0], **payload, "id": "native-connection-1"}

    async def delete_llm_connection(self, resource_id: str) -> dict[str, Any]:
        self.events.append(("delete-connection", resource_id))
        return {}

    async def get_model(self, model_id: str) -> dict[str, Any]:
        return next(item for item in self.models if item["id"] == model_id)

    async def create_model(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.events.append(("create-model", payload))
        if self.fail_next_model_create:
            self.fail_next_model_create = False
            raise RuntimeError("create failed")
        return {
            **payload,
            "id": "native-model-restored"
            if len([event for event in self.events if event[0] == "create-model"]) > 1
            else "native-model-2",
            "isLangfuseManaged": False,
        }

    async def delete_model(self, resource_id: str) -> dict[str, Any]:
        self.events.append(("delete-model", resource_id))
        return {}

    async def aclose(self) -> None:
        self.events.append(("close", None))


class NativeReader(LangfuseDatabaseReader):
    def __init__(self, client: FakeNativeClient) -> None:
        super().__init__(
            Settings(
                langfuse_database_url="postgresql://example",
                langfuse_encryption_key="00" * 32,
            )
        )
        self.client = client
        self.queries: list[str] = []
        self.finishes: list[dict[str, Any]] = []

    async def _ensure_project_visible(self, project_id: str, user_id: str) -> None:
        return None

    async def _project_public_client_for_user(
        self, project_id: str, user_id: str
    ) -> FakeNativeClient:
        return self.client

    async def _acquire_native_provider_lock(
        self, project_id: str, provider: str
    ) -> Any:
        return object()

    async def _release_native_provider_lock(
        self, connection: Any, project_id: str, provider: str
    ) -> None:
        return None

    async def _acquire_native_model_lock(self, project_id: str) -> Any:
        return object()

    async def _release_native_model_lock(self, handle: Any) -> None:
        return None

    async def _fetch_all(
        self, sql: str, params: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        self.queries.append(sql)
        if "pa_resource_extensions" in sql:
            return [
                {
                    "id": "default-1",
                    "payload": {
                        "llmConnectionId": "native-connection-1",
                        "model": "gpt-4.1",
                        "temperature": "0.2",
                    },
                }
            ]
        return []

    async def _start_native_resource_sync(self, **kwargs: Any) -> str:
        return "execution-1"

    async def _finish_native_resource_sync(self, **kwargs: Any) -> None:
        self.finishes.append(kwargs)

    async def _get_native_llm_connection_secret(
        self, project_id: str, connection_id: str
    ) -> str:
        return "provider-secret"


@pytest.mark.anyio
async def test_native_provider_lock_supports_pooled_connection_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[Any] = []

    class FakeConnection:
        async def execute(self, sql: str, params: tuple[str]) -> None:
            events.append((sql, params))

    class FakeConnectionContext:
        async def __aenter__(self) -> FakeConnection:
            events.append("enter")
            return FakeConnection()

        async def __aexit__(self, *args: Any) -> None:
            events.append("exit")

    async def fake_connect(*args: Any, **kwargs: Any) -> FakeConnectionContext:
        return FakeConnectionContext()

    monkeypatch.setattr(langfuse_db, "connect_postgres", fake_connect)
    reader = LangfuseDatabaseReader(
        Settings(langfuse_database_url="postgresql://pool")
    )

    handle = await reader._acquire_native_provider_lock("project-1", "OpenAI")
    await reader._release_native_provider_lock(handle, "project-1", "OpenAI")

    assert events[0] == "enter"
    assert "pg_advisory_xact_lock" in events[1][0]
    assert events[2] == "exit"


@pytest.mark.anyio
async def test_model_settings_reads_only_native_resources_and_keeps_dto() -> None:
    reader = NativeReader(FakeNativeClient())

    result = await reader.get_project_model_settings_for_user("project-1", "user-1")

    assert result["connections"][0] == {
        "id": "native-connection-1",
        "provider": "OpenAI",
        "adapter": "openai",
        "displaySecretKey": "sk-...alue",
        "baseUrl": "https://api.openai.com/v1",
        "customModels": ["gpt-4.1"],
        "withDefaultModels": True,
    }
    assert [item["id"] for item in result["modelDefinitions"]] == ["native-model-1"]
    assert result["defaultModel"]["provider"] == "OpenAI"
    assert all("pa_project_llm_connections" not in sql for sql in reader.queries)
    assert all("pa_project_model_definitions" not in sql for sql in reader.queries)


@pytest.mark.anyio
async def test_default_model_update_does_not_require_provider_or_lock_native_resources() -> None:
    reader = NativeReader(FakeNativeClient())

    with pytest.raises(BusinessError, match="LLM 连接不存在"):
        await reader.update_project_default_model_for_user(
            "project-1",
            "user-1",
            "owner@example.com",
            {
                "llmConnectionId": "missing-connection",
                "model": "gpt-4.1",
                "temperature": "0.2",
            },
        )


@pytest.mark.anyio
async def test_connection_update_with_blank_secret_reuses_native_encrypted_secret() -> None:
    client = FakeNativeClient()
    reader = NativeReader(client)

    result = await reader.update_project_llm_connection_for_user(
        "project-1",
        "native-connection-1",
        "user-1",
        "owner@example.com",
        {
            "provider": "OpenAI",
            "adapter": "openai",
            "secretKey": "",
            "baseUrl": "https://api.openai.com/v1",
            "customModels": ["gpt-4.1", "gpt-4.1-mini"],
            "withDefaultModels": True,
        },
    )

    assert result["id"] == "native-connection-1"
    assert client.events[0][0] == "upsert-connection"
    assert client.events[0][1]["secretKey"] == "provider-secret"
    assert "provider-secret" not in repr(reader.finishes)


@pytest.mark.anyio
async def test_same_name_model_update_restores_old_model_when_create_fails() -> None:
    client = FakeNativeClient()
    client.fail_next_model_create = True
    reader = NativeReader(client)

    with pytest.raises(RuntimeError, match="create failed"):
        await reader.update_project_model_definition_for_user(
            "project-1",
            "native-model-1",
            "user-1",
            "owner@example.com",
            {
                "modelName": "gpt-4.1",
                "matchPattern": "(?i)^gpt-4.1$",
                "unit": "TOKENS",
                "inputPrice": "0.003",
                "outputPrice": "0.004",
                "tokenizerId": "openai",
            },
        )

    assert [event[0] for event in client.events[:3]] == [
        "delete-model",
        "create-model",
        "create-model",
    ]
    assert client.events[2][1]["inputPrice"] == 0.001
    assert reader.finishes[-1]["succeeded"] is False
    assert reader.finishes[-1]["compensated"] is True


@pytest.mark.anyio
async def test_model_create_maps_blank_legacy_prices_to_zero_cost_native_model() -> None:
    client = FakeNativeClient()
    reader = NativeReader(client)

    await reader.create_project_model_definition_for_user(
        "project-1",
        "user-1",
        "owner@example.com",
        {
            "modelName": "local-model",
            "matchPattern": "local-model",
            "unit": "TOKENS",
            "inputPrice": "",
            "outputPrice": "",
            "tokenizerId": "",
        },
    )

    assert client.events[0][0] == "create-model"
    assert client.events[0][1]["inputPrice"] == 0.0
    assert client.events[0][1]["outputPrice"] == 0.0


@pytest.mark.anyio
async def test_connection_create_rejects_existing_provider_without_overwriting_it() -> None:
    client = FakeNativeClient()
    reader = NativeReader(client)

    with pytest.raises(LangfuseResourceConflictError, match="已存在"):
        await reader.create_project_llm_connection_for_user(
            "project-1",
            "user-1",
            "owner@example.com",
            {
                "provider": "OpenAI",
                "adapter": "openai",
                "secretKey": "replacement-secret",
                "baseUrl": "https://gateway.example.com/v1",
                "customModels": ["new-model"],
                "withDefaultModels": False,
            },
        )

    assert [event[0] for event in client.events] == ["close"]
