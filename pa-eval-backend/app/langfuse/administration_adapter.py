"""Langfuse Public API adapter for organization/project administration.

Routes organization memberships, project memberships and project CRUD through
the typed ``LangfusePublicClient`` organization-scoped methods. Organization
body CRUD is not implemented here. Project archive/restore have no Public API
equivalent, so PA stores archive state in ``pa_resource_extensions``.
"""

from typing import Any, Protocol

from app.consolidation.models import ResourceExtensionType


class _OrgClientProvider(Protocol):
    def organization_public_client(self) -> Any: ...

    async def get_resource_extension(
        self,
        *,
        project_id: str,
        resource_type: str,
        resource_id: str,
        extension_type: ResourceExtensionType | str,
    ) -> dict[str, Any] | None: ...

    async def upsert_resource_extension(
        self,
        *,
        project_id: str,
        resource_type: str,
        resource_id: str,
        extension_type: ResourceExtensionType | str,
        payload: dict[str, Any],
        actor: str,
        schema_version: int = 1,
    ) -> dict[str, Any]: ...


class LangfuseAdministrationAdapter:
    def __init__(self, org_clients: _OrgClientProvider) -> None:
        self._org_clients = org_clients

    # -- Organization memberships --

    async def list_organization_memberships(
        self,
        *,
        keyword: str | None = None,
        role: str | list[str] | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> dict[str, Any]:
        client = self._org_clients.organization_public_client()
        async with client:
            members = await client.list_all_organization_memberships()
            mapped = [_to_member_payload(m) for m in members]
            if keyword:
                needle = keyword.lower()
                mapped = [
                    m for m in mapped
                    if any(
                        isinstance(m.get(field), str) and needle in m[field].lower()
                        for field in ("name", "email", "role", "status")
                    )
                ]
            if role:
                roles = set(role) if isinstance(role, list) else {role}
                mapped = [m for m in mapped if m.get("role") in roles]
            total = len(mapped)
            start = (page - 1) * page_size
            return {"total": total, "datas": mapped[start : start + page_size]}

    async def create_organization_member(
        self,
        organization_id: str,
        actor_user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        client = self._org_clients.organization_public_client()
        async with client:
            return await client.upsert_organization_membership(
                {
                    "email": payload["email"],
                    "name": payload.get("name") or "",
                    "role": payload["role"],
                }
            )

    async def update_organization_member(
        self,
        organization_id: str,
        member_id: str,
        actor_user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        client = self._org_clients.organization_public_client()
        async with client:
            return await client.upsert_organization_membership(
                {
                    "userId": member_id,
                    "role": payload["role"],
                }
            )

    async def delete_organization_member(
        self,
        organization_id: str,
        member_id: str,
        actor_user_id: str,
    ) -> dict[str, Any]:
        client = self._org_clients.organization_public_client()
        async with client:
            await client.delete_organization_membership(member_id)
            return {"id": member_id}

    # -- Project memberships --

    async def list_project_memberships(
        self,
        project_id: str,
    ) -> list[dict[str, Any]]:
        client = self._org_clients.organization_public_client()
        async with client:
            members = await client.list_all_project_memberships(project_id)
            return [_to_member_payload(m) for m in members]

    async def create_project_member(
        self,
        project_id: str,
        actor_user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        client = self._org_clients.organization_public_client()
        async with client:
            return await client.upsert_project_membership(
                project_id,
                {
                    "email": payload["email"],
                    "name": payload.get("name") or "",
                    "role": payload["role"],
                },
            )

    async def update_project_member(
        self,
        project_id: str,
        member_id: str,
        actor_user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        client = self._org_clients.organization_public_client()
        async with client:
            return await client.upsert_project_membership(
                project_id,
                {
                    "userId": member_id,
                    "role": payload["role"],
                }
            )

    async def delete_project_member(
        self,
        project_id: str,
        member_id: str,
        actor_user_id: str,
    ) -> dict[str, Any]:
        client = self._org_clients.organization_public_client()
        async with client:
            await client.delete_project_membership(project_id, member_id)
            return {"id": member_id}

    # -- Projects --

    async def list_projects(
        self,
        *,
        keyword: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> dict[str, Any]:
        client = self._org_clients.organization_public_client()
        async with client:
            projects = await client.list_all_organization_projects()
            mapped = [
                await self._apply_project_archive_state(_to_project_payload(p))
                for p in projects
            ]
            if keyword:
                needle = keyword.lower()
                mapped = [
                    p for p in mapped
                    if needle in p.get("name", "").lower()
                ]
            total = len(mapped)
            start = (page - 1) * page_size
            return {"total": total, "datas": mapped[start : start + page_size]}

    async def create_project(
        self,
        organization_id: str,
        user_id: str,
        user_email: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        client = self._org_clients.organization_public_client()
        async with client:
            created = await client.create_project(
                {
                    "name": payload["name"],
                    "orgId": organization_id,
                }
            )
            return _to_project_payload(created)

    async def update_project(
        self,
        project_id: str,
        user_id: str,
        user_email: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        client = self._org_clients.organization_public_client()
        async with client:
            updated = await client.update_project(
                project_id,
                {"name": payload["name"]},
            )
            return _to_project_payload(updated)

    async def archive_project(
        self,
        project_id: str,
        user_id: str,
        user_email: str,
    ) -> dict[str, Any]:
        return await self._set_project_archive_state(project_id, user_id, True)

    async def restore_project(
        self,
        project_id: str,
        user_id: str,
        user_email: str,
    ) -> dict[str, Any]:
        return await self._set_project_archive_state(project_id, user_id, False)

    async def _set_project_archive_state(
        self,
        project_id: str,
        user_id: str,
        archived: bool,
    ) -> dict[str, Any]:
        project = await self._get_project_payload(project_id, user_id)
        await self._upsert_resource_extension(
            project_id=project_id,
            resource_type="PROJECT",
            resource_id=project_id,
            extension_type=ResourceExtensionType.PROJECT_ARCHIVE_STATE,
            payload={"archived": archived},
            actor=user_id,
        )
        return await self._apply_project_archive_state(project)

    async def _get_project_payload(
        self,
        project_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        getter = getattr(self._org_clients, "get_project_for_user", None)
        if getter is not None:
            return await getter(project_id, user_id)

        client = self._org_clients.organization_public_client()
        async with client:
            projects = await client.list_all_organization_projects()
        project = next((p for p in projects if p.get("id") == project_id), None)
        if project is None:
            return {
                "id": project_id,
                "name": "",
                "organizationId": "",
                "organizationName": "",
                "status": "active",
            }
        return _to_project_payload(project)

    async def _apply_project_archive_state(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        extension = await self._get_resource_extension(
            project_id=payload["id"],
            resource_type="PROJECT",
            resource_id=payload["id"],
            extension_type=ResourceExtensionType.PROJECT_ARCHIVE_STATE,
        )
        state = extension.get("payload") if extension else None
        if isinstance(state, dict) and state.get("archived") is True:
            return {**payload, "status": "archived"}
        return {**payload, "status": "active"}

    async def _get_resource_extension(
        self,
        *,
        project_id: str,
        resource_type: str,
        resource_id: str,
        extension_type: ResourceExtensionType,
    ) -> dict[str, Any] | None:
        getter = getattr(self._org_clients, "get_resource_extension", None)
        if getter is None:
            return None
        return await getter(
            project_id=project_id,
            resource_type=resource_type,
            resource_id=resource_id,
            extension_type=extension_type,
        )

    async def _upsert_resource_extension(
        self,
        *,
        project_id: str,
        resource_type: str,
        resource_id: str,
        extension_type: ResourceExtensionType,
        payload: dict[str, Any],
        actor: str,
    ) -> dict[str, Any]:
        upsert = getattr(self._org_clients, "upsert_resource_extension")
        return await upsert(
            project_id=project_id,
            resource_type=resource_type,
            resource_id=resource_id,
            extension_type=extension_type,
            payload=payload,
            actor=actor,
        )


def _to_member_payload(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item.get("userId") or item.get("id", ""),
        "userId": item.get("userId", ""),
        "email": item.get("email", ""),
        "name": item.get("name", ""),
        "role": item.get("role", ""),
        "status": item.get("status", "active"),
    }


def _to_project_payload(item: dict[str, Any]) -> dict[str, Any]:
    org = item.get("organization") or {}
    return {
        "id": item.get("id", ""),
        "name": item.get("name", ""),
        "organizationId": org.get("id", ""),
        "organizationName": org.get("name", ""),
        "status": "active",
    }
