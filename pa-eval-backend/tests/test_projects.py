from fastapi.testclient import TestClient
import pytest

from app.auth_context import CurrentUserContext, get_current_user_context
from app.config import Settings
from app.errors import BusinessError
import app.langfuse_db as langfuse_db
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.main import app


class FakeDatabaseReader:
    async def ensure_project_visible(self, project_id: str, user_id: str) -> None:
        pass

    def __init__(self) -> None:
        self.user_id = None
        self.created_project_payload = None
        self.updated_project_payload = None
        self.archived_project_payload = None
        self.restored_project_payload = None
        self.created_project_member_payload = None
        self.updated_project_member_payload = None
        self.deleted_project_member_payload = None
        self.list_projects_calls = 0
        self.list_projects_for_user_calls: list[str] = []
        self.super_admin = False

    async def list_projects(self) -> list[dict]:
        self.list_projects_calls += 1
        return await self._project_rows()

    async def list_projects_for_user(self, user_id: str) -> list[dict]:
        self.user_id = user_id
        self.list_projects_for_user_calls.append(user_id)
        return await self._project_rows()

    async def is_super_admin(self, user_id: str) -> bool:
        return self.super_admin

    async def _project_rows(self) -> list[dict]:
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


def test_project_payload_uses_native_retention_days_and_ignores_metadata() -> None:
    payload = LangfuseDatabaseReader._to_project_payload(
        {
            "id": "project-1",
            "name": "评测项目",
            "org_id": "org-1",
            "organization_name": "PA 平台主组织",
            "retention_days": 7,
            "metadata": {
                "paEval": {
                    "description": "客服评测",
                    "retentionDays": 30,
                }
            },
            "deleted_at": None,
            "created_at": "2026-07-02T08:00:00.000Z",
            "updated_at": "2026-07-02T09:00:00.000Z",
        }
    )

    assert payload["retentionDays"] == 7


def test_project_payload_uses_default_retention_days_for_null_native_value() -> None:
    payload = LangfuseDatabaseReader._to_project_payload(
        {
            "id": "project-1",
            "name": "评测项目",
            "org_id": "org-1",
            "organization_name": "PA 平台主组织",
            "retention_days": None,
            "metadata": {"paEval": {"retentionDays": 30}},
            "deleted_at": None,
            "created_at": "2026-07-02T08:00:00.000Z",
            "updated_at": "2026-07-02T09:00:00.000Z",
        }
    )

    assert payload["retentionDays"] == 14


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


class ProjectQueryRecordingReader(LangfuseDatabaseReader):
    def __init__(self) -> None:
        self.queries: list[str] = []

    async def _fetch_all(self, sql: str, params: dict | None = None) -> list[dict]:
        self.queries.append(sql)
        return [
            {
                "id": "project-1",
                "name": "评测项目",
                "org_id": "org-1",
                "organization_name": "PA 平台主组织",
                "retention_days": 7,
                "metadata": {},
                "deleted_at": None,
                "created_at": "2026-07-02T08:00:00.000Z",
                "updated_at": "2026-07-02T09:00:00.000Z",
            }
        ]


class FakeAsyncConnection:
    def __init__(self, cursor: "CreateMissingProjectMemberCursor") -> None:
        self._cursor = cursor

    async def __aenter__(self) -> "FakeAsyncConnection":
        return self

    async def __aexit__(self, *args) -> None:
        return None

    def cursor(self) -> "CreateMissingProjectMemberCursor":
        return self._cursor


class ProjectPersistenceConnection:
    def __init__(self, cursor: "ProjectPersistenceCursor") -> None:
        self._cursor = cursor

    async def __aenter__(self) -> "ProjectPersistenceConnection":
        return self

    async def __aexit__(self, *args) -> None:
        return None

    def cursor(self) -> "ProjectPersistenceCursor":
        return self._cursor


class ProjectPersistenceCursor:
    def __init__(self, retention_days: int | None = 9) -> None:
        self.queries: list[tuple[str, dict]] = []
        self.retention_days = retention_days
        self._next_fetchone: dict | None = None

    async def __aenter__(self) -> "ProjectPersistenceCursor":
        return self

    async def __aexit__(self, *args) -> None:
        return None

    async def execute(self, sql: str, params: dict | None = None) -> None:
        params = params or {}
        self.queries.append((sql, params))
        if "FROM organizations o" in sql:
            self._next_fetchone = {
                "id": "org-1",
                "name": "PA 平台主组织",
                "role": "OWNER",
            }
            return
        if "FROM projects p" in sql and "p.id = %(project_id)s" in sql:
            self._next_fetchone = self._project_row(
                retention_days=self.retention_days,
                metadata={
                    "paEval": {
                        "description": "旧描述",
                        "retentionDays": 30,
                    }
                },
            )
            return
        if "INSERT INTO projects" in sql:
            self._next_fetchone = self._project_row(
                retention_days=params.get("retention_days"),
                metadata=params["metadata"].obj,
                name=params["name"],
            )
            return
        if "UPDATE projects" in sql:
            self._next_fetchone = self._project_row(
                retention_days=params.get("retention_days", self.retention_days),
                metadata=params["metadata"].obj,
                name=params.get("name", "评测项目"),
            )
            return
        self._next_fetchone = None

    async def fetchone(self) -> dict | None:
        return self._next_fetchone

    @staticmethod
    def _project_row(
        *,
        retention_days: int | None,
        metadata: dict,
        name: str = "评测项目",
    ) -> dict:
        return {
            "id": "project-1",
            "name": name,
            "org_id": "org-1",
            "organization_name": "PA 平台主组织",
            "retention_days": retention_days,
            "created_at": "2026-07-02T08:00:00.000Z",
            "updated_at": "2026-07-02T09:00:00.000Z",
            "deleted_at": None,
            "metadata": metadata,
        }


class CreateMissingProjectMemberCursor:
    def __init__(self) -> None:
        self.queries: list[tuple[str, dict]] = []
        self._next_fetchone: dict | None = None
        self._user_lookup_count = 0
        self._org_lookup_count = 0

    async def __aenter__(self) -> "CreateMissingProjectMemberCursor":
        return self

    async def __aexit__(self, *args) -> None:
        return None

    async def execute(self, sql: str, params: dict | None = None) -> None:
        params = params or {}
        self.queries.append((sql, params))
        if "SELECT DISTINCT" in sql and "JOIN users u ON u.id = om.user_id" in sql:
            self._next_fetchone = {
                "id": "user-wangjing",
                "name": "wangjing",
                "email": "wangjing@163.com",
                "role": "MEMBER",
                "organization_role": "NONE",
                "project_role": "MEMBER",
            }
            return
        if "FROM projects p" in sql and "p.id = %(project_id)s" in sql:
            self._next_fetchone = {"id": "project-1", "org_id": "org-1"}
            return
        if (
            "FROM organization_memberships om" in sql
            and "om.user_id = %(member_id)s" in sql
        ):
            member_id = params["member_id"]
            if member_id == "actor-1":
                self._next_fetchone = {
                    "org_membership_id": "orgmem-actor",
                    "user_id": "actor-1",
                    "organization_role": "OWNER",
                    "project_role": None,
                }
                return
            self._next_fetchone = {
                "org_membership_id": "orgmem-wangjing",
                "user_id": "user-wangjing",
                "organization_role": "NONE",
                "project_role": None,
            }
            return
        if "FROM users" in sql and "lower(email)" in sql:
            self._user_lookup_count += 1
            self._next_fetchone = (
                None
                if self._user_lookup_count <= 2
                else {
                    "id": "user-wangjing",
                    "name": "wangjing",
                    "email": "wangjing@163.com",
                }
            )
            return
        if "INSERT INTO users" in sql:
            self._next_fetchone = {
                "id": "user-wangjing",
                "name": params["name"],
                "email": params["email"],
            }
            return
        if (
            "FROM organization_memberships" in sql
            and "WHERE org_id = %(organization_id)s" in sql
            and "user_id = %(member_id)s" in sql
        ):
            self._org_lookup_count += 1
            self._next_fetchone = (
                None
                if self._org_lookup_count == 1
                else {"id": "orgmem-wangjing", "role": "NONE"}
            )
            return
        if "INSERT INTO organization_memberships" in sql:
            self._next_fetchone = {"id": "orgmem-wangjing", "role": "NONE"}
            return
        if "INSERT INTO project_memberships" in sql:
            self._next_fetchone = None
            return
        self._next_fetchone = None

    async def fetchone(self) -> dict | None:
        return self._next_fetchone

    async def fetchall(self) -> list[dict]:
        if self._next_fetchone is None:
            return []
        return [self._next_fetchone]


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("payload", "expected_retention_days"),
    [
        ({"name": "评测项目", "description": "新描述", "retentionDays": 7}, 7),
        ({"name": "评测项目", "description": "新描述"}, 14),
    ],
)
async def test_create_project_writes_native_retention_days(
    monkeypatch,
    payload: dict,
    expected_retention_days: int,
) -> None:
    cursor = ProjectPersistenceCursor()

    async def fake_connect(*args, **kwargs):
        return ProjectPersistenceConnection(cursor)

    monkeypatch.setattr(langfuse_db, "connect_postgres", fake_connect)
    reader = LangfuseDatabaseReader(
        Settings(langfuse_database_url="postgresql://example")
    )

    await reader.create_project_for_user(
        organization_id="org-1",
        user_id="user-1",
        user_email="admin@example.com",
        payload=payload,
    )

    project_insert = next(
        query for query in cursor.queries if "INSERT INTO projects" in query[0]
    )
    assert project_insert[1]["retention_days"] == expected_retention_days
    assert "retentionDays" not in project_insert[1]["metadata"].obj["paEval"]


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("payload", "expected_retention_days"),
    [
        ({"name": "更新项目", "description": "新描述", "retentionDays": 21}, 21),
        ({"name": "更新项目", "description": "新描述"}, 9),
    ],
)
async def test_update_project_writes_native_retention_days(
    monkeypatch,
    payload: dict,
    expected_retention_days: int,
) -> None:
    cursor = ProjectPersistenceCursor(retention_days=9)

    async def fake_connect(*args, **kwargs):
        return ProjectPersistenceConnection(cursor)

    monkeypatch.setattr(langfuse_db, "connect_postgres", fake_connect)
    reader = LangfuseDatabaseReader(
        Settings(langfuse_database_url="postgresql://example")
    )

    await reader.update_project_for_user(
        project_id="project-1",
        user_id="user-1",
        user_email="admin@example.com",
        payload=payload,
    )

    project_update = next(
        query for query in cursor.queries if "UPDATE projects" in query[0]
    )
    assert project_update[1]["retention_days"] == expected_retention_days
    assert project_update[1]["metadata"].obj["paEval"]["retentionDays"] == 30


@pytest.mark.anyio
async def test_project_queries_select_native_retention_days(monkeypatch) -> None:
    reader = ProjectQueryRecordingReader()

    await reader.list_projects()
    await reader.list_projects_for_user("user-1")
    await reader.get_project_for_user("project-1", "user-1")

    assert len(reader.queries) == 3
    assert all("p.retention_days" in sql for sql in reader.queries)

    cursor = ProjectPersistenceCursor(retention_days=9)

    async def fake_connect(*args, **kwargs):
        return ProjectPersistenceConnection(cursor)

    monkeypatch.setattr(langfuse_db, "connect_postgres", fake_connect)
    persistence_reader = LangfuseDatabaseReader(
        Settings(langfuse_database_url="postgresql://example")
    )
    await persistence_reader.archive_project_for_user(
        project_id="project-1",
        user_id="user-1",
        user_email="admin@example.com",
    )

    archive_update = next(
        query for query in cursor.queries if "UPDATE projects" in query[0]
    )
    assert "retention_days" in archive_update[0]


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
    assert fake_reader.list_projects_calls == 0
    assert fake_reader.list_projects_for_user_calls == ["user-octocat"]


def test_lists_all_projects_for_super_admin() -> None:
    fake_reader = FakeDatabaseReader()
    fake_reader.super_admin = True
    override_reader(fake_reader)

    try:
        response = TestClient(app).get("/api/projects")
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["total"] == 2
    assert [item["id"] for item in body["data"]["datas"]] == [
        "project-1",
        "project-2",
    ]
    assert fake_reader.list_projects_calls == 1
    assert fake_reader.list_projects_for_user_calls == []


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
            json={"name": "项目成员", "email": "member@example.com", "role": "MEMBER"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["role"] == "MEMBER"
    assert fake_reader.created_project_member_payload == {
        "project_id": "project-1",
        "user_id": "user-1",
        "payload": {
            "name": "项目成员",
            "email": "member@example.com",
            "role": "MEMBER",
        },
    }


@pytest.mark.anyio
async def test_create_project_member_creates_missing_user_and_org_member(
    monkeypatch,
) -> None:
    cursor = CreateMissingProjectMemberCursor()

    async def fake_connect(*args, **kwargs):
        return FakeAsyncConnection(cursor)

    monkeypatch.setattr(langfuse_db.psycopg.AsyncConnection, "connect", fake_connect)
    reader = LangfuseDatabaseReader(
        Settings(langfuse_database_url="postgresql://example")
    )

    member = await reader.create_project_member_for_user(
        "project-1",
        "actor-1",
        {
            "name": "wangjing",
            "email": "wangjing@163.com",
            "role": "MEMBER",
        },
    )

    assert member["status"] == "active"
    assert member["email"] == "wangjing@163.com"
    user_insert = next(
        item for item in cursor.queries if "INSERT INTO users" in item[0]
    )
    assert user_insert[1]["name"] == "wangjing"
    assert user_insert[1]["email"] == "wangjing@163.com"
    org_membership_insert = next(
        item for item in cursor.queries if "INSERT INTO organization_memberships" in item[0]
    )
    assert org_membership_insert[1]["member_id"] == "user-wangjing"
    project_membership_insert = next(
        item for item in cursor.queries if "INSERT INTO project_memberships" in item[0]
    )
    assert project_membership_insert[1]["org_membership_id"] == "orgmem-wangjing"
    assert project_membership_insert[1]["role"] == "MEMBER"
    assert not any("INSERT INTO membership_invitations" in item[0] for item in cursor.queries)


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
    assert response.json()["data"]["role"] == "VIEWER"
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
    assert response.json()["data"]["role"] is None
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
async def test_project_visibility_allows_super_admin_without_membership() -> None:
    reader = RecordingLangfuseReader()

    await reader.ensure_project_visible("project-1", "user-1")

    sql, _params = reader.queries[0]
    assert "FROM users" in sql
    assert "admin IS TRUE" in sql


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
