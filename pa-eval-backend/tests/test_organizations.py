from fastapi.testclient import TestClient

from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.langfuse_client import LangfuseAdminClient, get_langfuse_client
from app.main import app


class FakeDatabaseReader:
    def __init__(self) -> None:
        self.created_payload = None
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

    async def create_organization_with_default_project(
        self,
        payload: dict,
        owner_email: str,
    ) -> dict:
        self.created_payload = {"payload": payload, "owner_email": owner_email}
        return {
            "id": "org-created",
            "name": payload["name"],
            "createdAt": "2026-07-02T10:00:00.000Z",
            "updatedAt": "2026-07-02T10:00:00.000Z",
            "metadata": payload["metadata"],
            "projectCount": 1,
        }


class FakeLangfuseClient:
    def __init__(self) -> None:
        self.created_payload = None
        self.updated_payload = None
        self.deleted_api_key_id = None
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
                "projects": [{"id": "project-1"}],
            },
            {
                "id": "org-2",
                "name": "只读组织",
                "createdAt": "2026-07-01T09:00:00.000Z",
                "metadata": {},
                "projects": [],
            },
        ]

    async def list_organizations(self) -> dict:
        return {"organizations": self.organizations}

    async def create_organization(self, payload: dict) -> dict:
        self.created_payload = payload
        return {
            "id": "org-created",
            "name": payload["name"],
            "createdAt": "2026-07-02T10:00:00.000Z",
            "metadata": payload["metadata"],
            "projects": [],
        }

    async def get_organization(self, organization_id: str) -> dict:
        return next(org for org in self.organizations if org["id"] == organization_id)

    async def update_organization(self, organization_id: str, payload: dict) -> dict:
        self.updated_payload = payload
        return {
            "id": organization_id,
            "name": payload["name"],
            "createdAt": "2026-07-01T08:00:00.000Z",
            "updatedAt": "2026-07-02T11:00:00.000Z",
            "metadata": payload["metadata"],
            "projects": [],
        }

    async def list_organization_api_keys(self, organization_id: str) -> dict:
        return {
            "apiKeys": [
                {
                    "id": "key-1",
                    "createdAt": "2026-07-02T08:00:00.000Z",
                    "lastUsedAt": None,
                    "note": "默认初始化 Key",
                    "publicKey": "pk-live-1",
                    "displaySecretKey": "sk-live-...abcd",
                }
            ]
        }

    async def create_organization_api_key(self, organization_id: str, payload: dict) -> dict:
        return {
            "id": "key-created",
            "createdAt": "2026-07-02T12:00:00.000Z",
            "note": payload["note"],
            "publicKey": "pk-live-created",
            "secretKey": "sk-live-created",
            "displaySecretKey": "sk-live-...ated",
        }

    async def delete_organization_api_key(
        self, organization_id: str, api_key_id: str
    ) -> dict:
        self.deleted_api_key_id = api_key_id
        return {"success": True}


def override_client(fake_client: FakeLangfuseClient):
    async def _override() -> LangfuseAdminClient:
        return fake_client  # type: ignore[return-value]

    app.dependency_overrides[get_langfuse_client] = _override


def override_reader(fake_reader: FakeDatabaseReader):
    async def _override() -> LangfuseDatabaseReader:
        return fake_reader  # type: ignore[return-value]

    app.dependency_overrides[get_langfuse_db_reader] = _override


def clear_overrides() -> None:
    app.dependency_overrides.clear()


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
                "publicKey": None,
                "secretKeyMasked": None,
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
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_reader.created_payload == {
        "owner_email": "admin@163.com",
        "payload": {
            "name": "新组织",
            "default_project_name": "新组织 默认项目",
            "metadata": {
                "paEval": {
                    "description": "模型评测组织",
                    "subsystem": "model-eval",
                }
            }
        },
    }
    assert response.json()["data"]["id"] == "org-created"
    assert response.json()["data"]["description"] == "模型评测组织"
    assert response.json()["data"]["projectCount"] == 1


def test_updates_organization_through_langfuse_and_preserves_metadata() -> None:
    fake_client = FakeLangfuseClient()
    override_client(fake_client)

    try:
        response = TestClient(app).patch(
            "/api/organizations/org-1",
            json={"description": "更新描述", "subsystem": "annotation"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_client.updated_payload == {
        "name": "PA 平台主组织",
        "metadata": {
            "paEval": {
                "description": "更新描述",
                "subsystem": "annotation",
            }
        },
    }
    assert response.json()["data"]["description"] == "更新描述"


def test_maps_organization_api_keys() -> None:
    fake_client = FakeLangfuseClient()
    override_client(fake_client)

    try:
        response = TestClient(app).get("/api/organizations/org-1/api-keys")
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"] == {
        "total": 1,
        "datas": [
            {
                "id": "key-1",
                "organizationId": "org-1",
                "name": "默认初始化 Key",
                "maskedKey": "sk-live-...abcd",
                "publicKey": "pk-live-1",
                "secretKeyMasked": "sk-live-...abcd",
                "secretKey": None,
                "createdBy": None,
                "updatedAt": "2026-07-02T08:00:00.000Z",
                "lastUsedAt": None,
                "createdAt": "2026-07-02T08:00:00.000Z",
            }
        ],
    }
