from fastapi.testclient import TestClient
import pytest

from app.auth_context import CurrentUserContext, get_current_user_context
from app.errors import BusinessError
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.main import app


class FakeDatabaseReader:
    def __init__(self) -> None:
        self.user_id = None
        self.created_project_payload = None
        self.updated_project_payload = None
        self.archived_project_payload = None
        self.restored_project_payload = None
        self.created_project_member_payload = None
        self.updated_project_member_payload = None
        self.deleted_project_member_payload = None

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

    async def create_project_for_user(
        self,
        organization_id: str,
        user_id: str,
        user_email: str,
        payload: dict,
    ) -> dict:
        self.created_project_payload = {
            "organization_id": organization_id,
            "user_id": user_id,
            "user_email": user_email,
            "payload": payload,
        }
        return {
            "id": "project-created",
            "name": payload["name"],
            "organizationId": organization_id,
            "organizationName": "PA 平台主组织",
            "description": payload["description"],
            "status": "active",
            "createdAt": "2026-07-07T08:00:00.000Z",
            "updatedAt": "2026-07-07T08:00:00.000Z",
        }

    async def update_project_for_user(
        self,
        project_id: str,
        user_id: str,
        user_email: str,
        payload: dict,
    ) -> dict:
        self.updated_project_payload = {
            "project_id": project_id,
            "user_id": user_id,
            "user_email": user_email,
            "payload": payload,
        }
        return {
            "id": project_id,
            "name": payload["name"],
            "organizationId": "org-1",
            "organizationName": "PA 平台主组织",
            "description": payload["description"],
            "status": "active",
            "createdAt": "2026-07-02T08:00:00.000Z",
            "updatedAt": "2026-07-07T09:00:00.000Z",
        }

    async def archive_project_for_user(
        self,
        project_id: str,
        user_id: str,
        user_email: str,
    ) -> dict:
        self.archived_project_payload = {
            "project_id": project_id,
            "user_id": user_id,
            "user_email": user_email,
        }
        return {
            "id": project_id,
            "name": "真实评测项目",
            "organizationId": "org-1",
            "organizationName": "PA 平台主组织",
            "description": "客服评测",
            "status": "archived",
            "createdAt": "2026-07-02T08:00:00.000Z",
            "updatedAt": "2026-07-07T10:00:00.000Z",
        }

    async def restore_project_for_user(
        self,
        project_id: str,
        user_id: str,
        user_email: str,
    ) -> dict:
        self.restored_project_payload = {
            "project_id": project_id,
            "user_id": user_id,
            "user_email": user_email,
        }
        return {
            "id": project_id,
            "name": "归档项目",
            "organizationId": "org-2",
            "organizationName": "归档组织",
            "description": None,
            "status": "active",
            "createdAt": "2026-07-01T08:00:00.000Z",
            "updatedAt": "2026-07-07T11:00:00.000Z",
        }

    async def list_project_users_for_user(
        self,
        project_id: str,
        user_id: str,
    ) -> list[dict]:
        self.project_members_payload = {
            "project_id": project_id,
            "user_id": user_id,
        }
        return [
            {
                "id": "user-1",
                "name": "管理员",
                "email": "admin@example.com",
                "role": "OWNER",
                "organizationRole": "OWNER",
                "projectRole": None,
            }
        ]

    async def create_project_member_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.created_project_member_payload = {
            "project_id": project_id,
            "user_id": user_id,
            "payload": payload,
        }
        return {
            "id": "user-2",
            "name": "项目成员",
            "email": payload["email"],
            "role": payload["role"],
            "organizationRole": "NONE",
            "projectRole": payload["role"],
        }

    async def update_project_member_for_user(
        self,
        project_id: str,
        member_id: str,
        user_id: str,
        payload: dict,
    ) -> dict:
        self.updated_project_member_payload = {
            "project_id": project_id,
            "member_id": member_id,
            "user_id": user_id,
            "payload": payload,
        }
        return {
            "id": member_id,
            "name": "项目成员",
            "email": "member@example.com",
            "role": None if payload["role"] == "NONE" else payload["role"],
            "organizationRole": "NONE",
            "projectRole": None if payload["role"] == "NONE" else payload["role"],
        }

    async def delete_project_member_for_user(
        self,
        project_id: str,
        member_id: str,
        user_id: str,
    ) -> dict:
        self.deleted_project_member_payload = {
            "project_id": project_id,
            "member_id": member_id,
            "user_id": user_id,
        }
        return {"id": member_id}


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


class RecordingLangfuseReader(LangfuseDatabaseReader):
    def __init__(
        self,
        rows: list[dict] | None = None,
        invitation_rows: list[dict] | None = None,
    ) -> None:
        self.queries: list[tuple[str, dict]] = []
        self.rows = rows or []
        self.invitation_rows = invitation_rows or []

    async def _fetch_all(self, sql: str, params: dict | None = None) -> list[dict]:
        self.queries.append((sql, params or {}))
        if "SELECT p.id" in sql:
            return [{"id": "project-1"}]
        if "membership_invitations" in sql:
            return self.invitation_rows
        return self.rows


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


def test_creates_project_for_current_user_organization() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects",
            json={
                "organizationId": "org-1",
                "name": "AIOps 评测",
                "description": "AIOps Trace 评测项目",
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["id"] == "project-created"
    assert fake_reader.created_project_payload == {
        "organization_id": "org-1",
        "user_id": "user-1",
        "user_email": "admin@163.com",
        "payload": {
            "name": "AIOps 评测",
            "description": "AIOps Trace 评测项目",
        },
    }


def test_lists_project_settings_members() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get("/api/projects/project-1/settings/members")
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"] == [
        {
            "id": "user-1",
            "name": "管理员",
            "email": "admin@example.com",
            "role": "OWNER",
            "organizationRole": "OWNER",
            "projectRole": None,
        }
    ]
    assert fake_reader.project_members_payload == {
        "project_id": "project-1",
        "user_id": "user-1",
    }


def test_creates_project_settings_member() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/settings/members",
            json={"email": "member@example.com", "role": "MEMBER"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["projectRole"] == "MEMBER"
    assert fake_reader.created_project_member_payload == {
        "project_id": "project-1",
        "user_id": "user-1",
        "payload": {"email": "member@example.com", "role": "MEMBER"},
    }


def test_updates_project_settings_member_role() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).patch(
            "/api/projects/project-1/settings/members/user-2",
            json={"role": "VIEWER"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["projectRole"] == "VIEWER"
    assert fake_reader.updated_project_member_payload == {
        "project_id": "project-1",
        "member_id": "user-2",
        "user_id": "user-1",
        "payload": {"role": "VIEWER"},
    }


def test_updates_project_settings_member_to_none_for_removing_override() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).patch(
            "/api/projects/project-1/settings/members/user-2",
            json={"role": "NONE"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["projectRole"] is None
    assert fake_reader.updated_project_member_payload == {
        "project_id": "project-1",
        "member_id": "user-2",
        "user_id": "user-1",
        "payload": {"role": "NONE"},
    }


def test_project_member_create_rejects_existing_effective_member() -> None:
    with pytest.raises(BusinessError) as exc_info:
        LangfuseDatabaseReader._ensure_project_member_can_be_created(
            {"effective_role": "MEMBER"}
        )

    assert exc_info.value.code == 1029
    assert exc_info.value.status_code == 409
    assert exc_info.value.message == "用户已在该项目中，请使用设置项目角色调整权限"


def test_project_member_create_allows_project_only_member_without_access() -> None:
    LangfuseDatabaseReader._ensure_project_member_can_be_created(
        {"effective_role": "NONE"}
    )


def test_project_create_rejects_non_manager_organization_role() -> None:
    with pytest.raises(BusinessError) as exc_info:
        LangfuseDatabaseReader._ensure_project_can_be_created({"role": "MEMBER"})

    assert exc_info.value.code == 1026
    assert exc_info.value.status_code == 403
    assert exc_info.value.message == "当前角色不能创建项目"


def test_project_create_allows_manager_organization_role() -> None:
    LangfuseDatabaseReader._ensure_project_can_be_created({"role": "ADMIN"})


def test_deletes_project_settings_member() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).delete(
            "/api/projects/project-1/settings/members/user-2",
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"] == {"id": "user-2"}
    assert fake_reader.deleted_project_member_payload == {
        "project_id": "project-1",
        "member_id": "user-2",
        "user_id": "user-1",
    }


@pytest.mark.anyio
async def test_project_visibility_uses_langfuse_effective_membership() -> None:
    reader = RecordingLangfuseReader()

    await reader.ensure_project_visible("project-1", "user-1")

    sql, params = reader.queries[0]
    assert params == {"project_id": "project-1", "user_id": "user-1"}
    assert "project_memberships pm" in sql
    assert "om.role::text <> 'NONE'" in sql
    assert "pm.role::text <> 'NONE'" in sql


@pytest.mark.anyio
async def test_project_users_return_effective_project_members() -> None:
    reader = RecordingLangfuseReader(
        rows=[
            {
                "id": "user-owner",
                "name": "Owner",
                "email": "owner@example.com",
                "role": "OWNER",
                "organization_role": "OWNER",
                "project_role": None,
            },
            {
                "id": "user-project",
                "name": "Project Member",
                "email": "project@example.com",
                "role": "MEMBER",
                "organization_role": "NONE",
                "project_role": "MEMBER",
            },
        ]
    )

    users = await reader.list_project_users_for_user("project-1", "user-1")

    sql, params = reader.queries[1]
    assert params == {"project_id": "project-1"}
    assert "project_memberships pm" in sql
    assert "om.role::text <> 'NONE'" in sql
    assert "pm.role::text <> 'NONE'" in sql
    assert users == [
        {
            "id": "user-owner",
            "name": "Owner",
            "email": "owner@example.com",
            "role": "OWNER",
            "organizationRole": "OWNER",
            "projectRole": None,
            "status": "active",
        },
        {
            "id": "user-project",
            "name": "Project Member",
            "email": "project@example.com",
            "role": "MEMBER",
            "organizationRole": "NONE",
            "projectRole": "MEMBER",
            "status": "active",
        },
    ]


@pytest.mark.anyio
async def test_project_users_include_pending_membership_invitations() -> None:
    reader = RecordingLangfuseReader(
        rows=[
            {
                "id": "user-owner",
                "name": "Owner",
                "email": "owner@example.com",
                "role": "OWNER",
                "organization_role": "OWNER",
                "project_role": None,
            }
        ],
        invitation_rows=[
            {
                "id": "invite-1",
                "email": "pending@example.com",
                "org_role": "NONE",
                "project_role": "VIEWER",
                "created_at": "2026-07-08T08:00:00.000Z",
                "invited_by_name": "Owner",
                "invited_by_email": "owner@example.com",
            }
        ],
    )

    users = await reader.list_project_users_for_user("project-1", "user-1")

    invite_sql, invite_params = reader.queries[2]
    assert invite_params == {"project_id": "project-1"}
    assert "membership_invitations" in invite_sql
    assert users[-1] == {
        "id": "invite-1",
        "name": "pending",
        "email": "pending@example.com",
        "role": "VIEWER",
        "organizationRole": "NONE",
        "projectRole": "VIEWER",
        "status": "pending",
        "invitedBy": {
            "name": "Owner",
            "email": "owner@example.com",
        },
        "createdAt": "2026-07-08T08:00:00.000Z",
    }


def test_updates_project_for_current_user() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).patch(
            "/api/projects/project-1",
            json={
                "name": "更新项目",
                "description": "更新描述",
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["name"] == "更新项目"
    assert fake_reader.updated_project_payload == {
        "project_id": "project-1",
        "user_id": "user-1",
        "user_email": "admin@163.com",
        "payload": {
            "name": "更新项目",
            "description": "更新描述",
        },
    }


def test_archives_project_for_current_user() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post("/api/projects/project-1/archive")
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "archived"
    assert fake_reader.archived_project_payload == {
        "project_id": "project-1",
        "user_id": "user-1",
        "user_email": "admin@163.com",
    }


def test_restores_project_for_current_user() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post("/api/projects/project-2/restore")
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "active"
    assert fake_reader.restored_project_payload == {
        "project_id": "project-2",
        "user_id": "user-1",
        "user_email": "admin@163.com",
    }
