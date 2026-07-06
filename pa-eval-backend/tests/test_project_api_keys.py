from typing import Any

from fastapi.testclient import TestClient

from app.auth_context import CurrentUserContext, get_current_user_context
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.main import app


class FakeProjectApiKeyReader:
    def __init__(self) -> None:
        self.keys: list[dict[str, Any]] = [
            {
                "id": "key-1",
                "projectId": "project-1",
                "note": "Dify 评估工作流",
                "publicKey": "pk-lf-existing",
                "secretKey": "sk-lf-existing",
                "status": "ACTIVE",
                "lastUsedAt": None,
                "createdAt": "2026-07-06T08:00:00.000Z",
                "updatedAt": "2026-07-06T08:00:00.000Z",
            }
        ]
        self.visible_checks: list[tuple[str, str]] = []

    async def ensure_project_visible(self, project_id: str, user_id: str) -> None:
        self.visible_checks.append((project_id, user_id))

    async def list_project_api_keys(
        self,
        project_id: str,
        user_id: str,
    ) -> list[dict[str, Any]]:
        await self.ensure_project_visible(project_id, user_id)
        return [item for item in self.keys if item["projectId"] == project_id]

    async def create_project_api_key(
        self,
        project_id: str,
        note: str,
        user_email: str,
        user_id: str,
    ) -> dict[str, Any]:
        await self.ensure_project_visible(project_id, user_id)
        created = {
            "id": "key-created",
            "projectId": project_id,
            "note": note,
            "publicKey": "pk-lf-created",
            "secretKey": "sk-lf-created",
            "status": "ACTIVE",
            "lastUsedAt": None,
            "createdAt": "2026-07-06T09:00:00.000Z",
            "updatedAt": "2026-07-06T09:00:00.000Z",
        }
        self.keys.insert(0, created)
        return created

    async def update_project_api_key(
        self,
        project_id: str,
        key_id: str,
        note: str,
        user_email: str,
        user_id: str,
    ) -> dict[str, Any]:
        await self.ensure_project_visible(project_id, user_id)
        for item in self.keys:
            if item["projectId"] == project_id and item["id"] == key_id:
                item["note"] = note
                item["updatedAt"] = "2026-07-06T10:00:00.000Z"
                return item
        raise AssertionError("test key not found")

    async def delete_project_api_key(
        self,
        project_id: str,
        key_id: str,
        user_id: str,
    ) -> dict[str, str]:
        await self.ensure_project_visible(project_id, user_id)
        self.keys = [
            item
            for item in self.keys
            if item["projectId"] != project_id or item["id"] != key_id
        ]
        return {"id": key_id}


def override_reader(fake_reader: FakeProjectApiKeyReader) -> None:
    async def _override() -> LangfuseDatabaseReader:
        return fake_reader  # type: ignore[return-value]

    app.dependency_overrides[get_langfuse_db_reader] = _override
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id="user-1",
        email="admin@163.com",
    )


def clear_overrides() -> None:
    app.dependency_overrides.clear()


def test_lists_project_api_keys_with_repeatable_secret() -> None:
    fake_reader = FakeProjectApiKeyReader()
    override_reader(fake_reader)

    try:
        client = TestClient(app)
        response = client.get(
            "/api/projects/project-1/settings/api-keys",
            params={"page": 1, "pageSize": 10},
        )
        repeat_response = client.get(
            "/api/projects/project-1/settings/api-keys",
            params={"page": 1, "pageSize": 10},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"]["total"] == 1
    assert body["data"]["datas"][0]["publicKey"] == "pk-lf-existing"
    assert body["data"]["datas"][0]["secretKey"] == "sk-lf-existing"
    assert repeat_response.json()["data"]["datas"][0]["secretKey"] == (
        "sk-lf-existing"
    )
    assert fake_reader.visible_checks == [
        ("project-1", "user-1"),
        ("project-1", "user-1"),
    ]


def test_creates_updates_and_deletes_project_api_key() -> None:
    fake_reader = FakeProjectApiKeyReader()
    override_reader(fake_reader)

    try:
        client = TestClient(app)
        create_response = client.post(
            "/api/projects/project-1/settings/api-keys",
            json={"note": "本地 Dify"},
        )
        update_response = client.patch(
            "/api/projects/project-1/settings/api-keys/key-created",
            json={"note": "本地 Dify 更新"},
        )
        delete_response = client.delete(
            "/api/projects/project-1/settings/api-keys/key-created",
        )
    finally:
        clear_overrides()

    assert create_response.status_code == 200
    assert create_response.json()["data"]["publicKey"] == "pk-lf-created"
    assert create_response.json()["data"]["secretKey"] == "sk-lf-created"
    assert update_response.status_code == 200
    assert update_response.json()["data"]["note"] == "本地 Dify 更新"
    assert delete_response.status_code == 200
    assert delete_response.json()["data"] == {"id": "key-created"}
