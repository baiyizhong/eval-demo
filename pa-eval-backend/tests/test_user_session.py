from fastapi.testclient import TestClient
import pytest

from app.config import Settings
from app.auth_context import CurrentUserContext, get_current_user_context
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.main import app


class FakeSessionDatabaseReader:
    def __init__(self) -> None:
        self.current_user = None

    async def get_user_session(self, current_user: CurrentUserContext) -> dict:
        self.current_user = current_user
        return {
            "user": {
                "email": current_user.email,
                "name": current_user.name or "测试用户",
            },
            "superAdmin": False,
            "permissions": [],
            "orgs": [
                {
                    "id": "org-1",
                    "name": "PA 平台主组织",
                    "role": "OWNER",
                    "permissions": [],
                    "projects": [
                        {
                            "id": "project-1",
                            "name": "客服评测项目",
                            "role": "ADMIN",
                            "permissions": [],
                        }
                    ],
                }
            ],
        }


class RecordingSessionDatabaseReader(LangfuseDatabaseReader):
    def __init__(self, settings: Settings | None = None) -> None:
        super().__init__(settings or Settings(pa_eval_super_admin_emails=""))
        self.queries: list[tuple[str, dict]] = []

    async def _fetch_all(
        self,
        sql: str,
        params: dict | None = None,
    ) -> list[dict]:
        self.queries.append((sql, params or {}))
        if len(self.queries) == 1:
            return [
                {
                    "organization_id": "org-1",
                    "organization_name": "PA 平台主组织",
                    "organization_role": "OWNER",
                },
                {
                    "organization_id": "org-2",
                    "organization_name": "项目专属组织",
                    "organization_role": "NONE",
                },
            ]

        return [
            {
                "project_id": "project-1",
                "project_name": "客服评测项目",
                "organization_id": "org-1",
                "organization_name": "PA 平台主组织",
                "organization_role": "OWNER",
                "role": "OWNER",
            },
            {
                "project_id": "project-2",
                "project_name": "项目专属权限",
                "organization_id": "org-2",
                "organization_name": "项目专属组织",
                "organization_role": "NONE",
                "role": "MEMBER",
            },
        ]


def override_reader(fake_reader: FakeSessionDatabaseReader) -> None:
    async def _override() -> LangfuseDatabaseReader:
        return fake_reader  # type: ignore[return-value]

    app.dependency_overrides[get_langfuse_db_reader] = _override
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id="user-1",
        email="admin@163.com",
        name="测试用户",
        login="octocat",
        provider="github",
    )


def clear_overrides() -> None:
    app.dependency_overrides.clear()


def test_get_user_session_returns_authenticated_user_scope() -> None:
    fake_reader = FakeSessionDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get("/api/user/session")
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"] == {
        "user": {
            "email": "admin@163.com",
            "name": "测试用户",
        },
        "superAdmin": False,
        "permissions": [],
        "orgs": [
            {
                "id": "org-1",
                "name": "PA 平台主组织",
                "role": "OWNER",
                "permissions": [],
                "projects": [
                    {
                        "id": "project-1",
                        "name": "客服评测项目",
                        "role": "ADMIN",
                        "permissions": [],
                    }
                ],
            }
        ],
    }
    assert fake_reader.current_user is not None
    assert fake_reader.current_user.user_id == "user-1"


@pytest.mark.anyio
async def test_reader_builds_user_session_with_roles_and_permissions() -> None:
    reader = RecordingSessionDatabaseReader()

    session = await reader.get_user_session(
        CurrentUserContext(
            user_id="user-1",
            email="admin@163.com",
            name=None,
        )
    )

    assert session == {
        "user": {
            "email": "admin@163.com",
            "name": "admin",
        },
        "superAdmin": False,
        "permissions": [],
        "orgs": [
            {
                "id": "org-1",
                "name": "PA 平台主组织",
                "role": "OWNER",
                "permissions": [
                    "org:project:view",
                    "org:project:edit",
                    "org:organization:view",
                    "org:organization:edit",
                    "org:member:view",
                    "org:member:edit",
                ],
                "projects": [
                    {
                        "id": "project-1",
                        "name": "客服评测项目",
                        "role": "OWNER",
                        "permissions": [
                            "project:trace:view",
                            "project:trace:edit",
                            "project:dataset:view",
                            "project:dataset:edit",
                            "project:evaluator:view",
                            "project:evaluator:edit",
                            "project:annotation:view",
                            "project:annotation:edit",
                            "project:auto-evaluation:view",
                            "project:auto-evaluation:edit",
                            "project:evaluation-report:view",
                            "project:evaluation-report:edit",
                            "project:scheduled-job:view",
                            "project:scheduled-job:edit",
                            "project:settings:view",
                            "project:settings:edit",
                            "project:score-config:view",
                            "project:score-config:edit",
                            "project:member:view",
                            "project:member:edit",
                            "project:model:view",
                            "project:model:edit",
                            "project:api-key:view",
                            "project:api-key:edit",
                        ],
                    }
                ],
            },
            {
                "id": "org-2",
                "name": "项目专属组织",
                "role": "NONE",
                "permissions": [],
                "projects": [
                    {
                        "id": "project-2",
                        "name": "项目专属权限",
                        "role": "MEMBER",
                        "permissions": [
                            "project:trace:view",
                            "project:trace:edit",
                            "project:dataset:view",
                            "project:dataset:edit",
                            "project:evaluator:view",
                            "project:evaluator:edit",
                            "project:annotation:view",
                            "project:annotation:edit",
                            "project:auto-evaluation:view",
                            "project:auto-evaluation:edit",
                            "project:evaluation-report:view",
                            "project:evaluation-report:edit",
                            "project:scheduled-job:view",
                            "project:scheduled-job:edit",
                            "project:settings:view",
                            "project:score-config:view",
                        ],
                    }
                ],
            },
        ],
    }
    assert reader.queries[0][1] == {"user_id": "user-1"}
    assert "organization_memberships om" in reader.queries[0][0]
    assert "project_memberships pm" in reader.queries[1][0]
    assert "COALESCE" in reader.queries[1][0]
    assert "om.role::text <> 'NONE'" in reader.queries[1][0]
    assert "OR pm.role::text <> 'NONE'" in reader.queries[1][0]
    assert "pm.user_id = om.user_id" not in reader.queries[1][0]


@pytest.mark.anyio
async def test_reader_marks_user_as_super_admin_from_email_whitelist() -> None:
    reader = RecordingSessionDatabaseReader(
        Settings(pa_eval_super_admin_emails="owner@example.com, ADMIN@163.COM")
    )

    session = await reader.get_user_session(
        CurrentUserContext(
            user_id="user-1",
            email="admin@163.com",
            name=None,
        )
    )

    assert session["superAdmin"] is True
    assert session["permissions"] == ["system:audit:view"]
