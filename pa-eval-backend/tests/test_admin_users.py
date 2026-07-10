from fastapi.testclient import TestClient

from app.auth_context import CurrentUserContext, get_current_user_context
from app.admin_users import AdminUserService, get_admin_user_service
from app.main import app


class FakeAdminUserService(AdminUserService):
    def __init__(self) -> None:
        self.updated: tuple[str, bool, CurrentUserContext] | None = None

    async def list_users(
        self,
        *,
        current_user: CurrentUserContext,
        page: int,
        page_size: int,
        keyword: str | None,
        admin: bool | None,
    ) -> dict:
        return {
            "total": 1,
            "datas": [
                {
                    "id": "user-1",
                    "name": "Alice",
                    "email": "alice@example.com",
                    "admin": False,
                    "createdAt": "2026-07-10T08:00:00",
                    "updatedAt": "2026-07-10T08:00:00",
                }
            ],
        }

    async def get_user_role_bindings(
        self,
        *,
        current_user: CurrentUserContext,
        user_id: str,
    ) -> dict:
        return {
            "user": {
                "id": user_id,
                "name": "Alice",
                "email": "alice@example.com",
                "admin": False,
                "createdAt": "2026-07-10T08:00:00",
                "updatedAt": "2026-07-10T08:00:00",
            },
            "organizations": [
                {"id": "org-1", "name": "主组织", "role": "ADMIN"},
            ],
            "projects": [
                {
                    "id": "project-1",
                    "name": "客服评测",
                    "organizationId": "org-1",
                    "organizationName": "主组织",
                    "organizationRole": "ADMIN",
                    "projectRole": "MEMBER",
                    "effectiveRole": "MEMBER",
                }
            ],
        }

    async def patch_user_admin(
        self,
        *,
        current_user: CurrentUserContext,
        user_id: str,
        admin: bool,
    ) -> dict:
        self.updated = (user_id, admin, current_user)
        return {"id": user_id, "admin": admin}


def override_admin_user_service(fake_service: FakeAdminUserService) -> None:
    app.dependency_overrides[get_admin_user_service] = lambda: fake_service
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id="admin-user",
        email="admin@example.com",
        name="Admin",
    )


def clear_overrides() -> None:
    app.dependency_overrides.clear()


def test_admin_users_list_returns_paginated_users() -> None:
    fake_service = FakeAdminUserService()
    override_admin_user_service(fake_service)

    try:
        response = TestClient(app).get(
            "/api/admin/users",
            params={"page": 1, "pageSize": 20, "keyword": "alice", "admin": "false"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"]["total"] == 1
    assert body["data"]["datas"][0]["email"] == "alice@example.com"
    assert body["data"]["datas"][0]["admin"] is False


def test_admin_user_role_bindings_returns_org_and_project_roles() -> None:
    fake_service = FakeAdminUserService()
    override_admin_user_service(fake_service)

    try:
        response = TestClient(app).get("/api/admin/users/user-1/role-bindings")
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"]["organizations"] == [
        {"id": "org-1", "name": "主组织", "role": "ADMIN"}
    ]
    assert body["data"]["projects"][0]["effectiveRole"] == "MEMBER"


def test_patch_admin_user_admin_calls_service() -> None:
    fake_service = FakeAdminUserService()
    override_admin_user_service(fake_service)

    try:
        response = TestClient(app).patch(
            "/api/admin/users/user-1/admin",
            json={"admin": True},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"] == {"id": "user-1", "admin": True}
    assert fake_service.updated is not None
    assert fake_service.updated[0] == "user-1"
    assert fake_service.updated[1] is True
