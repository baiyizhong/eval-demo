from fastapi.testclient import TestClient
import pytest

from app.auth_context import CurrentUserContext, get_current_user_context
from app.config import Settings, get_settings
from app.errors import BusinessError
import app.langfuse_db as langfuse_db
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.main import app


class FakeDatabaseReader:
    def __init__(self) -> None:
        self.created_payload = None
        self.updated_payload = None
        self.created_member_payload = None
        self.updated_member_payload = None
        self.deleted_member_payload = None
        self.organizations = [
            {
                "id": "org-1",
                "name": "PA 平台主组织",
                "createdAt": "2026-07-01T08:00:00.000Z",
                "updatedAt": "2026-07-02T08:00:00.000Z",
                "metadata": {
                    "paEval": {
                        "description": "主组织",
                        "subsystem": "evaluation",
                    }
                },
                "projectCount": 1,
            },
            {
                "id": "org-2",
                "name": "只读组织",
                "createdAt": "2026-07-01T09:00:00.000Z",
                "updatedAt": "2026-07-01T09:00:00.000Z",
                "metadata": {},
                "projectCount": 0,
            },
        ]

    async def list_organizations(self) -> list[dict]:
        return self.organizations

    async def list_organizations_for_user(self, user_id: str) -> list[dict]:
        return self.organizations

    async def get_organization(self, organization_id: str) -> dict | None:
        return next(
            (org for org in self.organizations if org["id"] == organization_id),
            None,
        )

    async def list_organization_members(self, organization_id: str) -> list[dict]:
        return [
            {
                "id": "mem-1",
                "organizationId": organization_id,
                "userId": "user-1",
                "name": "Admin",
                "email": "admin@163.com",
                "role": "OWNER",
                "status": "ACTIVE",
                "joinedAt": "2026-07-02T08:00:00.000Z",
                "createdAt": "2026-07-02T08:00:00.000Z",
                "updatedAt": "2026-07-02T08:00:00.000Z",
            },
            {
                "id": "mem-2",
                "organizationId": organization_id,
                "userId": "user-2",
                "name": "Viewer",
                "email": "viewer@example.com",
                "role": "VIEWER",
                "status": "ACTIVE",
                "joinedAt": "2026-07-02T09:00:00.000Z",
                "createdAt": "2026-07-02T09:00:00.000Z",
                "updatedAt": "2026-07-02T09:00:00.000Z",
            },
        ]

    async def create_organization_member(
        self,
        organization_id: str,
        actor_user_id: str,
        payload: dict,
    ) -> dict:
        if payload["email"] == "missing@example.com":
            from app.errors import BusinessError

            raise BusinessError(1015, "用户不存在，请先让该用户登录 Langfuse", 404)
        self.created_member_payload = {
            "organization_id": organization_id,
            "actor_user_id": actor_user_id,
            "payload": payload,
        }
        return {
            "id": "mem-created",
            "organizationId": organization_id,
            "userId": "user-created",
            "name": payload.get("name") or "New Member",
            "email": payload["email"],
            "role": payload["role"],
            "status": "ACTIVE",
            "joinedAt": "2026-07-03T08:00:00.000Z",
            "createdAt": "2026-07-03T08:00:00.000Z",
            "updatedAt": "2026-07-03T08:00:00.000Z",
        }

    async def update_organization_member(
        self,
        organization_id: str,
        member_id: str,
        actor_user_id: str,
        payload: dict,
    ) -> dict:
        self.updated_member_payload = {
            "organization_id": organization_id,
            "member_id": member_id,
            "actor_user_id": actor_user_id,
            "payload": payload,
        }
        return {
            "id": member_id,
            "organizationId": organization_id,
            "userId": "user-2",
            "name": "Viewer",
            "email": "viewer@example.com",
            "role": payload["role"],
            "status": "ACTIVE",
            "joinedAt": "2026-07-02T09:00:00.000Z",
            "createdAt": "2026-07-02T09:00:00.000Z",
            "updatedAt": "2026-07-03T09:00:00.000Z",
        }

    async def delete_organization_member(
        self,
        organization_id: str,
        member_id: str,
        actor_user_id: str,
    ) -> dict:
        self.deleted_member_payload = {
            "organization_id": organization_id,
            "member_id": member_id,
            "actor_user_id": actor_user_id,
        }
        return {"id": member_id}

    async def create_organization_with_default_project(
        self,
        payload: dict,
        owner_account: str,
        owner_email: str,
    ) -> dict:
        self.created_payload = {
            "payload": payload,
            "owner_account": owner_account,
            "owner_email": owner_email,
        }
        return {
            "id": "org-created",
            "name": payload["name"],
            "createdAt": "2026-07-02T10:00:00.000Z",
            "updatedAt": "2026-07-02T10:00:00.000Z",
            "metadata": payload["metadata"],
            "projectCount": 1,
        }

    async def update_organization(self, organization_id: str, payload: dict) -> dict:
        self.updated_payload = {
            "organization_id": organization_id,
            "payload": payload,
        }
        return {
            "id": organization_id,
            "name": payload["name"],
            "createdAt": "2026-07-01T08:00:00.000Z",
            "updatedAt": "2026-07-03T08:00:00.000Z",
            "metadata": payload["metadata"],
            "projectCount": 1,
        }


def override_reader(fake_reader: FakeDatabaseReader):
    async def _override() -> LangfuseDatabaseReader:
        return fake_reader  # type: ignore[return-value]

    app.dependency_overrides[get_langfuse_db_reader] = _override
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id="user-1",
        email="admin@163.com",
    )
    app.dependency_overrides[get_settings] = lambda: Settings(
        pa_eval_default_owner_email_domain="owners.test"
    )


def clear_overrides() -> None:
    app.dependency_overrides.clear()


class RecordingOrganizationReader(LangfuseDatabaseReader):
    def __init__(
        self,
        member_rows: list[dict] | None = None,
        invitation_rows: list[dict] | None = None,
    ) -> None:
        self.queries: list[tuple[str, dict]] = []
        self.member_rows = member_rows or []
        self.invitation_rows = invitation_rows or []

    async def _fetch_all(self, sql: str, params: dict | None = None) -> list[dict]:
        self.queries.append((sql, params or {}))
        if "membership_invitations" in sql:
            return self.invitation_rows
        return self.member_rows


class FakeAsyncConnection:
    def __init__(self, cursor: "CreateMissingUserMemberCursor") -> None:
        self._cursor = cursor

    async def __aenter__(self) -> "FakeAsyncConnection":
        return self

    async def __aexit__(self, *args) -> None:
        return None

    def cursor(self) -> "CreateMissingUserMemberCursor":
        return self._cursor


class CreateMissingUserMemberCursor:
    def __init__(self) -> None:
        self.queries: list[tuple[str, dict]] = []
        self._next_fetchone: dict | None = None

    async def __aenter__(self) -> "CreateMissingUserMemberCursor":
        return self

    async def __aexit__(self, *args) -> None:
        return None

    async def execute(self, sql: str, params: dict | None = None) -> None:
        params = params or {}
        self.queries.append((sql, params))
        if (
            "FROM organization_memberships" in sql
            and "user_id = %(actor_user_id)s" in sql
        ):
            self._next_fetchone = {"role": "OWNER"}
            return
        if "FROM users" in sql and "lower(email)" in sql:
            self._next_fetchone = None
            return
        if "INSERT INTO users" in sql:
            self._next_fetchone = {
                "id": "user-wangjing",
                "name": params["name"],
                "email": params["email"],
            }
            return
        if "INSERT INTO organization_memberships" in sql:
            self._next_fetchone = None
            return
        if (
            "FROM organization_memberships om" in sql
            and "JOIN users u ON u.id = om.user_id" in sql
        ):
            self._next_fetchone = {
                "id": "orgmem-wangjing",
                "org_id": params["organization_id"],
                "user_id": "user-wangjing",
                "role": "MEMBER",
                "created_at": "2026-07-15T10:00:00.000Z",
                "updated_at": "2026-07-15T10:00:00.000Z",
                "name": "wangjing",
                "email": "wangjing@163.com",
            }
            return
        self._next_fetchone = None

    async def fetchone(self) -> dict | None:
        return self._next_fetchone


def test_lists_organizations_with_pa_pagination_and_metadata_mapping() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get(
            "/api/organizations", params={"page": 1, "pageSize": 1, "keyword": "平台"}
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["message"] == "success"
    assert body["txId"]
    assert body["data"] == {
        "total": 1,
        "datas": [
            {
                "id": "org-1",
                "name": "PA 平台主组织",
                "description": "主组织",
                "subsystem": "evaluation",
                "createdBy": None,
                "createdAt": "2026-07-01T08:00:00.000Z",
                "updatedAt": "2026-07-02T08:00:00.000Z",
                "projectCount": 1,
            }
        ],
    }


def test_gets_organization_detail_from_database_reader() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get("/api/organizations/org-1")
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["id"] == "org-1"
    assert response.json()["data"]["name"] == "PA 平台主组织"
    assert response.json()["data"]["projectCount"] == 1


def test_gets_organization_member_email_settings_from_backend_env() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get("/api/organizations/member-email-settings")
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"] == {"defaultEmailDomain": "owners.test"}


def test_returns_not_found_when_database_organization_missing() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get("/api/organizations/missing-org")
    finally:
        clear_overrides()

    assert response.status_code == 404
    assert response.json()["code"] == 1004
    assert response.json()["message"] == "组织不存在"


def test_lists_organization_members_from_database_reader() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get(
            "/api/organizations/org-1/members",
            params={"page": 1, "pageSize": 10, "keyword": "admin"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"] == {
        "total": 1,
        "datas": [
            {
                "id": "mem-1",
                "organizationId": "org-1",
                "userId": "user-1",
                "name": "Admin",
                "email": "admin@163.com",
                "role": "OWNER",
                "status": "ACTIVE",
                "joinedAt": "2026-07-02T08:00:00.000Z",
                "createdAt": "2026-07-02T08:00:00.000Z",
                "updatedAt": "2026-07-02T08:00:00.000Z",
            }
        ],
    }


def test_filters_organization_members_by_role() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get(
            "/api/organizations/org-1/members",
            params={"role": "VIEWER"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["total"] == 1
    assert response.json()["data"]["datas"][0]["email"] == "viewer@example.com"


def test_creates_organization_member_through_database_reader() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/organizations/org-1/members",
            json={
                "email": "new@example.com",
                "name": "New Member",
                "role": "MEMBER",
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_reader.created_member_payload == {
        "organization_id": "org-1",
        "actor_user_id": "user-1",
        "payload": {
            "email": "new@example.com",
            "name": "New Member",
            "role": "MEMBER",
        },
    }
    assert response.json()["data"]["id"] == "mem-created"


def test_creates_organization_member_with_none_role_for_project_only_access() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/organizations/org-1/members",
            json={
                "email": "project-only@example.com",
                "name": "Project Only",
                "role": "NONE",
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_reader.created_member_payload == {
        "organization_id": "org-1",
        "actor_user_id": "user-1",
        "payload": {
            "email": "project-only@example.com",
            "name": "Project Only",
            "role": "NONE",
        },
    }
    assert response.json()["data"]["role"] == "NONE"


@pytest.mark.anyio
async def test_create_organization_member_creates_missing_langfuse_user(
    monkeypatch,
) -> None:
    cursor = CreateMissingUserMemberCursor()

    async def fake_connect(*args, **kwargs):
        return FakeAsyncConnection(cursor)

    monkeypatch.setattr(langfuse_db.psycopg.AsyncConnection, "connect", fake_connect)
    reader = LangfuseDatabaseReader(
        Settings(langfuse_database_url="postgresql://example")
    )

    member = await reader.create_organization_member(
        "org-1",
        "actor-1",
        {
            "name": "wangjing",
            "email": "wangjing@163.com",
            "role": "MEMBER",
        },
    )

    assert member["status"] == "ACTIVE"
    assert member["email"] == "wangjing@163.com"
    user_insert = next(
        item for item in cursor.queries if "INSERT INTO users" in item[0]
    )
    assert user_insert[1]["name"] == "wangjing"
    assert user_insert[1]["email"] == "wangjing@163.com"
    membership_insert = next(
        item for item in cursor.queries if "INSERT INTO organization_memberships" in item[0]
    )
    assert membership_insert[1]["user_id"] == "user-wangjing"
    invitation_delete = next(
        item for item in cursor.queries if "DELETE FROM membership_invitations" in item[0]
    )
    assert invitation_delete[1]["email"] == "wangjing@163.com"
    assert not any("INSERT INTO membership_invitations" in item[0] for item in cursor.queries)


def test_updates_organization_member_role_through_database_reader() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).patch(
            "/api/organizations/org-1/members/mem-2",
            json={"role": "ADMIN"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_reader.updated_member_payload == {
        "organization_id": "org-1",
        "member_id": "mem-2",
        "actor_user_id": "user-1",
        "payload": {"role": "ADMIN"},
    }
    assert response.json()["data"]["role"] == "ADMIN"


def test_deletes_organization_member_through_database_reader() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).delete("/api/organizations/org-1/members/mem-2")
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_reader.deleted_member_payload == {
        "organization_id": "org-1",
        "member_id": "mem-2",
        "actor_user_id": "user-1",
    }
    assert response.json()["data"] == {"id": "mem-2"}


def test_imports_organization_members_with_partial_failures() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/organizations/org-1/members/import",
            json={
                "members": [
                    {
                        "email": "new@example.com",
                        "name": "New Member",
                        "role": "MEMBER",
                    },
                    {
                        "email": "missing@example.com",
                        "name": "Missing",
                        "role": "VIEWER",
                    },
                ]
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["total"] == 1
    assert response.json()["data"]["datas"][0]["email"] == "new@example.com"
    assert response.json()["data"]["failures"] == [
        {
            "row": 2,
            "email": "missing@example.com",
            "reason": "用户不存在，请先让该用户登录 Langfuse",
        }
    ]


@pytest.mark.anyio
async def test_organization_members_include_pending_membership_invitations() -> None:
    reader = RecordingOrganizationReader(
        member_rows=[
            {
                "id": "mem-1",
                "org_id": "org-1",
                "user_id": "user-1",
                "name": "Owner",
                "email": "owner@example.com",
                "role": "OWNER",
                "created_at": "2026-07-08T08:00:00.000Z",
                "updated_at": "2026-07-08T08:00:00.000Z",
            }
        ],
        invitation_rows=[
            {
                "id": "invite-1",
                "org_id": "org-1",
                "email": "pending@example.com",
                "org_role": "MEMBER",
                "project_id": None,
                "project_role": None,
                "created_at": "2026-07-08T09:00:00.000Z",
                "updated_at": "2026-07-08T09:00:00.000Z",
                "invited_by_name": "Owner",
                "invited_by_email": "owner@example.com",
            }
        ],
    )

    members = await reader.list_organization_members("org-1")

    invite_sql, invite_params = reader.queries[1]
    assert invite_params == {"organization_id": "org-1"}
    assert "membership_invitations" in invite_sql
    assert "mi.project_id IS NULL" in invite_sql
    assert members[-1] == {
        "id": "invite-1",
        "organizationId": "org-1",
        "userId": "",
        "name": "pending",
        "email": "pending@example.com",
        "role": "MEMBER",
        "status": "INVITED",
        "joinedAt": "",
        "createdAt": "2026-07-08T09:00:00.000Z",
        "updatedAt": "2026-07-08T09:00:00.000Z",
        "invitedBy": {
            "name": "Owner",
            "email": "owner@example.com",
        },
        "projectId": None,
        "projectRole": None,
    }


def test_organization_invitation_duplicate_returns_conflict() -> None:
    with pytest.raises(BusinessError) as exc_info:
        LangfuseDatabaseReader._raise_duplicate_organization_invitation()

    assert exc_info.value.code == 1030
    assert exc_info.value.status_code == 409
    assert exc_info.value.message == "该邮箱已有待处理邀请，请先处理现有邀请"


def test_creates_langfuse_organization_with_pa_eval_metadata() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/organizations",
            json={
                "name": "新组织",
                "subsystem": "model-eval",
                "description": "模型评测组织",
                "defaultOwnerAccount": "Owner123",
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_reader.created_payload == {
        "owner_account": "owner123",
        "owner_email": "owner123@owners.test",
        "payload": {
            "name": "新组织",
            "default_project_name": "新组织 默认项目",
            "metadata": {
                "paEval": {
                    "description": "模型评测组织",
                    "subsystem": "model-eval",
                    "createdBy": "admin@163.com",
                }
            },
        },
    }
    assert response.json()["data"]["id"] == "org-created"
    assert response.json()["data"]["description"] == "模型评测组织"
    assert response.json()["data"]["projectCount"] == 1


def test_creates_organization_with_default_owner_account() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id="user-octocat",
        email="octocat@example.com",
        login="octocat",
    )
    app.dependency_overrides[get_settings] = lambda: Settings(
        pa_eval_default_owner_email_domain="example.org"
    )

    try:
        response = TestClient(app).post(
            "/api/organizations",
            json={
                "name": "登录用户组织",
                "subsystem": "model-eval",
                "description": "登录用户创建",
                "defaultOwnerAccount": "OctoCat99",
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_reader.created_payload["owner_account"] == "octocat99"
    assert fake_reader.created_payload["owner_email"] == "octocat99@example.org"
    assert (
        fake_reader.created_payload["payload"]["metadata"]["paEval"]["createdBy"]
        == "octocat@example.com"
    )


def test_rejects_invalid_default_owner_account() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/organizations",
            json={
                "name": "非法账号组织",
                "subsystem": "model-eval",
                "description": "账号不合法",
                "defaultOwnerAccount": "owner_中文",
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 422
    assert fake_reader.created_payload is None


def test_updates_organization_through_database_and_preserves_metadata() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).patch(
            "/api/organizations/org-1",
            json={
                "name": "更新后的组织",
                "description": "更新描述",
                "subsystem": "annotation",
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_reader.updated_payload == {
        "organization_id": "org-1",
        "payload": {
            "name": "更新后的组织",
            "metadata": {
                "paEval": {
                    "description": "更新描述",
                    "subsystem": "annotation",
                }
            },
        },
    }
    assert response.json()["data"]["name"] == "更新后的组织"
    assert response.json()["data"]["description"] == "更新描述"
