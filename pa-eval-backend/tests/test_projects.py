from fastapi.testclient import TestClient

from app.auth_context import CurrentUserContext, get_current_user_context
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.main import app


class FakeDatabaseReader:
    def __init__(self) -> None:
        self.user_id = None

    async def list_projects(self) -> list[dict]:
        return await self.list_projects_for_user("user-1")

    async def list_projects_for_user(self, user_id: str) -> list[dict]:
        self.user_id = user_id
        return [
            {
                "id": "project-1",
                "name": "真实评测项目",
                "organizationId": "org-1",
                "organizationName": "PA 平台主组织",
                "description": "客服评测",
                "status": "active",
                "createdAt": "2026-07-02T08:00:00.000Z",
                "updatedAt": "2026-07-02T09:00:00.000Z",
            },
            {
                "id": "project-2",
                "name": "归档项目",
                "organizationId": "org-2",
                "organizationName": "归档组织",
                "description": None,
                "status": "archived",
                "createdAt": "2026-07-01T08:00:00.000Z",
                "updatedAt": "2026-07-01T09:00:00.000Z",
            },
        ]


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


def test_lists_projects_with_pa_pagination_and_keyword_filter() -> None:
    override_reader(FakeDatabaseReader())

    try:
        response = TestClient(app).get(
            "/api/projects",
            params={"page": 1, "pageSize": 10, "keyword": "评测"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"] == {
        "total": 1,
        "datas": [
            {
                "id": "project-1",
                "name": "真实评测项目",
                "organizationId": "org-1",
                "organizationName": "PA 平台主组织",
                "description": "客服评测",
                "status": "active",
                "createdAt": "2026-07-02T08:00:00.000Z",
                "updatedAt": "2026-07-02T09:00:00.000Z",
            }
        ],
    }


def test_lists_projects_with_status_filter() -> None:
    override_reader(FakeDatabaseReader())

    try:
        response = TestClient(app).get(
            "/api/projects",
            params={"status": "archived"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["total"] == 1
    assert response.json()["data"]["datas"][0]["id"] == "project-2"


def test_lists_projects_with_organization_filter() -> None:
    override_reader(FakeDatabaseReader())

    try:
        response = TestClient(app).get(
            "/api/projects",
            params={"organizationId": "org-1"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["total"] == 1
    assert response.json()["data"]["datas"][0]["organizationId"] == "org-1"


def test_lists_projects_for_current_user_id() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id="user-octocat",
        email="octocat@example.com",
        login="octocat",
    )

    try:
        response = TestClient(app).get("/api/projects")
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_reader.user_id == "user-octocat"
