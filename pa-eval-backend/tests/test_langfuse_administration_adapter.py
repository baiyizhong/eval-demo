"""Contract tests for the Langfuse Public API administration adapter.

Covers organization memberships, project memberships and project CRUD routing
through the typed ``LangfusePublicClient`` organization-scoped methods.
"""

from importlib.util import find_spec

import pytest

from app.langfuse import administration_adapter


def test_langfuse_administration_adapter_module_exists() -> None:
    assert find_spec("app.langfuse.administration_adapter") is not None


class FakeOrgPublicClient:
    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.org_memberships: list[dict] = []
        self.project_memberships: dict[str, list[dict]] = {}
        self.projects: list[dict] = []
        self.upserted_org_memberships: list[dict] = []
        self.upserted_project_memberships: list[dict] = []
        self.deleted_org_memberships: list[str] = []
        self.deleted_project_memberships: list[tuple] = []
        self.created_project: dict | None = None
        self.updated_project: dict | None = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def list_all_organization_memberships(self) -> list:
        self.calls.append(("list_all_organization_memberships",))
        return list(self.org_memberships)

    async def upsert_organization_membership(self, payload: dict) -> dict:
        self.calls.append(("upsert_organization_membership", payload))
        result = {
            "userId": payload.get("userId", f"user-{len(self.upserted_org_memberships) + 1}"),
            "email": payload.get("email", ""),
            "name": payload.get("name", ""),
            "role": payload.get("role", "MEMBER"),
        }
        self.upserted_org_memberships.append(result)
        return result

    async def delete_organization_membership(self, user_id: str) -> dict:
        self.calls.append(("delete_organization_membership", user_id))
        self.deleted_org_memberships.append(user_id)
        return {}

    async def list_all_project_memberships(self, project_id: str) -> list:
        self.calls.append(("list_all_project_memberships", project_id))
        return list(self.project_memberships.get(project_id, []))

    async def upsert_project_membership(self, project_id: str, payload: dict) -> dict:
        self.calls.append(("upsert_project_membership", project_id, payload))
        result = {
            "userId": payload.get("userId", f"user-{len(self.upserted_project_memberships) + 1}"),
            "email": payload.get("email", ""),
            "name": payload.get("name", ""),
            "role": payload.get("role", "MEMBER"),
        }
        self.upserted_project_memberships.append(result)
        return result

    async def delete_project_membership(self, project_id: str, user_id: str) -> dict:
        self.calls.append(("delete_project_membership", project_id, user_id))
        self.deleted_project_memberships.append((project_id, user_id))
        return {}

    async def list_all_organization_projects(self) -> list:
        self.calls.append(("list_all_organization_projects",))
        return list(self.projects)

    async def create_project(self, payload: dict) -> dict:
        self.calls.append(("create_project", payload))
        self.created_project = {
            "id": "project-new",
            "name": payload.get("name", ""),
            "organization": {"id": payload.get("orgId", ""), "name": ""},
        }
        return self.created_project

    async def update_project(self, project_id: str, payload: dict) -> dict:
        self.calls.append(("update_project", project_id, payload))
        self.updated_project = {
            "id": project_id,
            "name": payload.get("name", ""),
            "organization": {"id": "", "name": ""},
        }
        return self.updated_project


class FakeOrgClientProvider:
    def __init__(self, client: FakeOrgPublicClient) -> None:
        self.client = client
        self.resource_extensions: dict[tuple[str, str, str, str], dict] = {}

    def organization_public_client(self):
        return self.client

    async def get_resource_extension(
        self,
        *,
        project_id: str,
        resource_type: str,
        resource_id: str,
        extension_type: str,
    ) -> dict | None:
        return self.resource_extensions.get(
            (project_id, resource_type, resource_id, extension_type)
        )

    async def upsert_resource_extension(
        self,
        *,
        project_id: str,
        resource_type: str,
        resource_id: str,
        extension_type: str,
        payload: dict,
        actor: str,
        schema_version: int = 1,
    ) -> dict:
        row = {
            "project_id": project_id,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "extension_type": extension_type,
            "payload": payload,
            "status": "ACTIVE",
            "actor": actor,
            "schema_version": schema_version,
        }
        self.resource_extensions[
            (project_id, resource_type, resource_id, extension_type)
        ] = row
        return row


def _adapter(client: FakeOrgPublicClient):
    cls = getattr(administration_adapter, "LangfuseAdministrationAdapter")
    provider = FakeOrgClientProvider(client)
    return cls(provider), provider


# -- Organization memberships --


@pytest.mark.anyio
async def test_list_organization_memberships_maps_payload() -> None:
    client = FakeOrgPublicClient()
    client.org_memberships = [
        {"userId": "user-1", "email": "a@x.com", "name": "A", "role": "OWNER"},
        {"userId": "user-2", "email": "b@x.com", "name": "B", "role": "MEMBER"},
    ]
    adapter, _provider = _adapter(client)

    result = await adapter.list_organization_memberships(
        keyword=None, role=None, page=1, page_size=10
    )

    assert result["total"] == 2
    assert result["datas"][0]["role"] == "OWNER"


@pytest.mark.anyio
async def test_create_organization_member_upserts_membership() -> None:
    client = FakeOrgPublicClient()
    adapter, _provider = _adapter(client)

    member = await adapter.create_organization_member(
        "org-1", "user-actor",
        {"email": "new@x.com", "name": "New", "role": "MEMBER"},
    )

    assert member["role"] == "MEMBER"
    assert client.upserted_org_memberships[0]["email"] == "new@x.com"


@pytest.mark.anyio
async def test_update_organization_member_upserts_role() -> None:
    client = FakeOrgPublicClient()
    adapter, _provider = _adapter(client)

    await adapter.update_organization_member(
        "org-1", "user-1", "user-actor", {"role": "ADMIN"}
    )

    assert client.upserted_org_memberships[0]["role"] == "ADMIN"


@pytest.mark.anyio
async def test_delete_organization_member_routes_to_public_api() -> None:
    client = FakeOrgPublicClient()
    adapter, _provider = _adapter(client)

    await adapter.delete_organization_member("org-1", "user-1", "user-actor")

    assert "user-1" in client.deleted_org_memberships


# -- Project memberships --


@pytest.mark.anyio
async def test_list_project_memberships_maps_payload() -> None:
    client = FakeOrgPublicClient()
    client.project_memberships = {
        "project-1": [
            {"userId": "user-1", "email": "a@x.com", "name": "A", "role": "ADMIN"},
        ]
    }
    adapter, _provider = _adapter(client)

    result = await adapter.list_project_memberships("project-1")

    assert len(result) == 1
    assert result[0]["role"] == "ADMIN"


@pytest.mark.anyio
async def test_create_project_member_upserts_membership() -> None:
    client = FakeOrgPublicClient()
    adapter, _provider = _adapter(client)

    member = await adapter.create_project_member(
        "project-1", "user-actor",
        {"email": "dev@x.com", "name": "Dev", "role": "MEMBER"},
    )

    assert member["role"] == "MEMBER"
    call = client.calls[-1]
    assert call[0] == "upsert_project_membership"
    assert call[1] == "project-1"


@pytest.mark.anyio
async def test_delete_project_member_routes_to_public_api() -> None:
    client = FakeOrgPublicClient()
    adapter, _provider = _adapter(client)

    await adapter.delete_project_member("project-1", "user-1", "user-actor")

    assert ("project-1", "user-1") in client.deleted_project_memberships


# -- Projects --


@pytest.mark.anyio
async def test_list_projects_maps_organization_projects() -> None:
    client = FakeOrgPublicClient()
    client.projects = [
        {"id": "project-1", "name": "客服", "organization": {"id": "org-1", "name": "Org"}},
    ]
    adapter, _provider = _adapter(client)

    result = await adapter.list_projects(keyword="客服", page=1, page_size=10)

    assert result["total"] == 1
    assert result["datas"][0]["name"] == "客服"


@pytest.mark.anyio
async def test_create_project_routes_to_public_api() -> None:
    client = FakeOrgPublicClient()
    adapter, _provider = _adapter(client)

    project = await adapter.create_project(
        "org-1", "user-1", "user@x.com",
        {"name": "新项目"},
    )

    assert project["name"] == "新项目"
    assert client.created_project is not None


@pytest.mark.anyio
async def test_update_project_routes_to_public_api() -> None:
    client = FakeOrgPublicClient()
    adapter, _provider = _adapter(client)

    project = await adapter.update_project(
        "project-1", "user-1", "user@x.com",
        {"name": "改名"},
    )

    assert project["name"] == "改名"
    call = [c for c in client.calls if c[0] == "update_project"][0]
    assert call[1] == "project-1"


@pytest.mark.anyio
async def test_archive_project_stores_pa_state_overlay() -> None:
    client = FakeOrgPublicClient()
    client.projects = [
        {"id": "project-1", "name": "客服", "organization": {"id": "org-1", "name": "Org"}},
    ]
    adapter, provider = _adapter(client)

    archived = await adapter.archive_project("project-1", "user-1", "user@x.com")

    assert archived["status"] == "archived"
    extension = await provider.get_resource_extension(
        project_id="project-1",
        resource_type="PROJECT",
        resource_id="project-1",
        extension_type="PROJECT_ARCHIVE_STATE",
    )
    assert extension is not None
    assert extension["payload"] == {"archived": True}
    listed = await adapter.list_projects(page=1, page_size=10)
    assert listed["datas"][0]["status"] == "archived"


@pytest.mark.anyio
async def test_restore_project_clears_pa_archive_state_overlay() -> None:
    client = FakeOrgPublicClient()
    client.projects = [
        {"id": "project-1", "name": "客服", "organization": {"id": "org-1", "name": "Org"}},
    ]
    adapter, provider = _adapter(client)
    await adapter.archive_project("project-1", "user-1", "user@x.com")

    restored = await adapter.restore_project("project-1", "user-1", "user@x.com")

    assert restored["status"] == "active"
    extension = await provider.get_resource_extension(
        project_id="project-1",
        resource_type="PROJECT",
        resource_id="project-1",
        extension_type="PROJECT_ARCHIVE_STATE",
    )
    assert extension is not None
    assert extension["payload"] == {"archived": False}


@pytest.mark.anyio
async def test_archive_project_does_not_require_organization_public_client() -> None:
    class _OverlayOnlyProvider:
        def __init__(self) -> None:
            self.resource_extensions: dict[tuple[str, str, str, str], dict] = {}

        async def get_project_for_user(self, project_id: str, user_id: str) -> dict:
            return {
                "id": project_id,
                "name": "本地项目",
                "organizationId": "org-1",
                "organizationName": "Org",
                "status": "active",
            }

        async def get_resource_extension(
            self,
            *,
            project_id: str,
            resource_type: str,
            resource_id: str,
            extension_type: str,
        ) -> dict | None:
            return self.resource_extensions.get(
                (project_id, resource_type, resource_id, extension_type)
            )

        async def upsert_resource_extension(
            self,
            *,
            project_id: str,
            resource_type: str,
            resource_id: str,
            extension_type: str,
            payload: dict,
            actor: str,
            schema_version: int = 1,
        ) -> dict:
            row = {"payload": payload}
            self.resource_extensions[
                (project_id, resource_type, resource_id, extension_type)
            ] = row
            return row

    adapter = administration_adapter.LangfuseAdministrationAdapter(
        _OverlayOnlyProvider()
    )

    archived = await adapter.archive_project("project-1", "user-1", "user@x.com")

    assert archived["id"] == "project-1"
    assert archived["status"] == "archived"
