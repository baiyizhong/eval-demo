from fastapi.testclient import TestClient

from app.auth_context import CurrentUserContext, get_current_user_context
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.main import app


class FakeDatabaseReader:
    def __init__(self) -> None:
        self.default_payload = None
        self.connection_payload = None
        self.model_payload = None
        self.updated_connection_payload = None
        self.deleted_connection_payload = None
        self.updated_model_payload = None
        self.deleted_model_payload = None

    async def get_project_model_settings_for_user(
        self,
        project_id: str,
        user_id: str,
    ) -> dict:
        return {
            "defaultModel": {
                "id": "default-project-1",
                "llmConnectionId": "llm-1",
                "provider": "OpenAI",
                "adapter": "openai",
                "model": "gpt-4o-mini",
                "temperature": "0.2",
            },
            "connections": [
                {
                    "id": "llm-1",
                    "provider": "OpenAI",
                    "adapter": "openai",
                    "displaySecretKey": "sk-...1234",
                    "baseUrl": "https://api.openai.com/v1",
                    "customModels": ["gpt-4o-mini"],
                    "withDefaultModels": True,
                }
            ],
            "modelDefinitions": [],
        }

    async def update_project_default_model_for_user(
        self,
        project_id: str,
        user_id: str,
        user_email: str,
        payload: dict,
    ) -> dict:
        self.default_payload = {
            "project_id": project_id,
            "user_id": user_id,
            "user_email": user_email,
            "payload": payload,
        }
        return {
            "id": "default-project-1",
            "llmConnectionId": payload["llmConnectionId"],
            "provider": "OpenAI",
            "adapter": "openai",
            "model": payload["model"],
            "temperature": payload["temperature"],
        }

    async def create_project_llm_connection_for_user(
        self,
        project_id: str,
        user_id: str,
        user_email: str,
        payload: dict,
    ) -> dict:
        self.connection_payload = {
            "project_id": project_id,
            "user_id": user_id,
            "user_email": user_email,
            "payload": payload,
        }
        return {
            "id": "llm-created",
            "provider": payload["provider"],
            "adapter": payload["adapter"],
            "displaySecretKey": "sk-...7890",
            "baseUrl": payload["baseUrl"],
            "customModels": payload["customModels"],
            "withDefaultModels": payload["withDefaultModels"],
        }

    async def create_project_model_definition_for_user(
        self,
        project_id: str,
        user_id: str,
        user_email: str,
        payload: dict,
    ) -> dict:
        self.model_payload = {
            "project_id": project_id,
            "user_id": user_id,
            "user_email": user_email,
            "payload": payload,
        }
        return {"id": "model-created", **payload}

    async def update_project_llm_connection_for_user(
        self,
        project_id: str,
        connection_id: str,
        user_id: str,
        user_email: str,
        payload: dict,
    ) -> dict:
        self.updated_connection_payload = {
            "project_id": project_id,
            "connection_id": connection_id,
            "user_id": user_id,
            "user_email": user_email,
            "payload": payload,
        }
        return {
            "id": connection_id,
            "provider": payload["provider"],
            "adapter": payload["adapter"],
            "displaySecretKey": "sk-...7890",
            "baseUrl": payload["baseUrl"],
            "customModels": payload["customModels"],
            "withDefaultModels": payload["withDefaultModels"],
        }

    async def delete_project_llm_connection_for_user(
        self,
        project_id: str,
        connection_id: str,
        user_id: str,
        user_email: str,
    ) -> dict:
        self.deleted_connection_payload = {
            "project_id": project_id,
            "connection_id": connection_id,
            "user_id": user_id,
            "user_email": user_email,
        }
        return {"id": connection_id}

    async def update_project_model_definition_for_user(
        self,
        project_id: str,
        model_id: str,
        user_id: str,
        user_email: str,
        payload: dict,
    ) -> dict:
        self.updated_model_payload = {
            "project_id": project_id,
            "model_id": model_id,
            "user_id": user_id,
            "user_email": user_email,
            "payload": payload,
        }
        return {"id": model_id, **payload}

    async def delete_project_model_definition_for_user(
        self,
        project_id: str,
        model_id: str,
        user_id: str,
        user_email: str,
    ) -> dict:
        self.deleted_model_payload = {
            "project_id": project_id,
            "model_id": model_id,
            "user_id": user_id,
            "user_email": user_email,
        }
        return {"id": model_id}


def override_reader(fake_reader: FakeDatabaseReader):
    async def _override() -> LangfuseDatabaseReader:
        return fake_reader  # type: ignore[return-value]

    app.dependency_overrides[get_langfuse_db_reader] = _override
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id="user-1",
        email="admin@163.com",
    )


def clear_overrides() -> None:
    app.dependency_overrides.clear()


def test_gets_project_model_settings() -> None:
    override_reader(FakeDatabaseReader())

    try:
        response = TestClient(app).get("/api/projects/project-1/settings/models")
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["defaultModel"]["model"] == "gpt-4o-mini"
    assert response.json()["data"]["connections"][0]["displaySecretKey"] == "sk-...1234"


def test_updates_project_default_model() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).patch(
            "/api/projects/project-1/settings/models/default",
            json={
                "llmConnectionId": "llm-1",
                "model": "gpt-4o",
                "temperature": "0.1",
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["model"] == "gpt-4o"
    assert fake_reader.default_payload == {
        "project_id": "project-1",
        "user_id": "user-1",
        "user_email": "admin@163.com",
        "payload": {
            "llmConnectionId": "llm-1",
            "model": "gpt-4o",
            "temperature": "0.1",
        },
    }


def test_creates_project_llm_connection() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/settings/models/llm-connections",
            json={
                "provider": "OpenAI",
                "adapter": "openai",
                "secretKey": "sk-real-value",
                "baseUrl": "https://api.openai.com/v1",
                "customModels": ["gpt-4o-mini"],
                "withDefaultModels": True,
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["displaySecretKey"] == "sk-...7890"
    assert fake_reader.connection_payload["payload"]["secretKey"] == "sk-real-value"


def test_creates_project_model_definition() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/settings/models/definitions",
            json={
                "modelName": "gpt-4o-mini",
                "matchPattern": "gpt-4o*",
                "unit": "TOKENS",
                "inputPrice": "0.15",
                "outputPrice": "0.60",
                "tokenizerId": "openai",
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["id"] == "model-created"
    assert fake_reader.model_payload["payload"]["modelName"] == "gpt-4o-mini"


def test_updates_and_deletes_project_llm_connection() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    payload = {
        "provider": "OpenAI",
        "adapter": "openai",
        "secretKey": "sk-new-value",
        "baseUrl": "https://api.openai.com/v1",
        "customModels": ["gpt-4o"],
        "withDefaultModels": False,
    }
    try:
        client = TestClient(app)
        update_response = client.patch(
            "/api/projects/project-1/settings/models/llm-connections/llm-1",
            json=payload,
        )
        delete_response = client.delete(
            "/api/projects/project-1/settings/models/llm-connections/llm-1"
        )
    finally:
        clear_overrides()

    assert update_response.status_code == 200
    assert delete_response.status_code == 200
    assert fake_reader.updated_connection_payload == {
        "project_id": "project-1",
        "connection_id": "llm-1",
        "user_id": "user-1",
        "user_email": "admin@163.com",
        "payload": payload,
    }
    assert fake_reader.deleted_connection_payload == {
        "project_id": "project-1",
        "connection_id": "llm-1",
        "user_id": "user-1",
        "user_email": "admin@163.com",
    }


def test_updates_and_deletes_project_model_definition() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    payload = {
        "modelName": "gpt-4o",
        "matchPattern": "gpt-4o*",
        "unit": "TOKENS",
        "inputPrice": "2.50",
        "outputPrice": "10.00",
        "tokenizerId": "openai",
    }
    try:
        client = TestClient(app)
        update_response = client.patch(
            "/api/projects/project-1/settings/models/definitions/model-1",
            json=payload,
        )
        delete_response = client.delete(
            "/api/projects/project-1/settings/models/definitions/model-1"
        )
    finally:
        clear_overrides()

    assert update_response.status_code == 200
    assert delete_response.status_code == 200
    assert fake_reader.updated_model_payload == {
        "project_id": "project-1",
        "model_id": "model-1",
        "user_id": "user-1",
        "user_email": "admin@163.com",
        "payload": payload,
    }
    assert fake_reader.deleted_model_payload == {
        "project_id": "project-1",
        "model_id": "model-1",
        "user_id": "user-1",
        "user_email": "admin@163.com",
    }
