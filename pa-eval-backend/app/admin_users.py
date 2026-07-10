from datetime import datetime
from typing import Any

import psycopg
from fastapi import APIRouter, Depends, Query
from psycopg.rows import dict_row
from pydantic import BaseModel

from app.auth_context import CurrentUserContext, get_current_user_context
from app.config import Settings, get_settings
from app.errors import BusinessError
from app.langfuse_db import LangfuseDatabaseConfigError
from app.response import success

router = APIRouter(prefix="/api/admin/users", tags=["admin-users"])


class AdminPermissionError(BusinessError):
    def __init__(self) -> None:
        super().__init__(
            code=4001,
            message="仅系统管理员可以管理用户",
            status_code=403,
        )


class AdminUserNotFoundError(BusinessError):
    def __init__(self) -> None:
        super().__init__(
            code=4002,
            message="用户不存在",
            status_code=404,
        )


class LastAdminUserError(BusinessError):
    def __init__(self) -> None:
        super().__init__(
            code=4003,
            message="不能取消最后一个系统管理员",
            status_code=400,
        )


class PatchUserAdminPayload(BaseModel):
    admin: bool


class AdminUserService:
    def __init__(self, settings: Settings) -> None:
        self._database_url = settings.langfuse_database_url

    async def list_users(
        self,
        *,
        current_user: CurrentUserContext,
        page: int,
        page_size: int,
        keyword: str | None,
        admin: bool | None,
    ) -> dict[str, Any]:
        await self._ensure_current_user_is_admin(current_user)

        filters: list[str] = []
        params: dict[str, Any] = {
            "limit": page_size,
            "offset": (page - 1) * page_size,
        }
        if keyword:
            filters.append(
                """
                (
                    id ILIKE %(keyword)s
                    OR name ILIKE %(keyword)s
                    OR email ILIKE %(keyword)s
                )
                """
            )
            params["keyword"] = f"%{keyword}%"
        if admin is not None:
            filters.append("admin = %(admin)s")
            params["admin"] = admin

        where_sql = "WHERE " + " AND ".join(filters) if filters else ""
        async with await self._connect() as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(
                    f"SELECT COUNT(id)::int AS total FROM users {where_sql}",
                    params,
                )
                total_row = await cursor.fetchone()
                await cursor.execute(
                    f"""
                    SELECT
                        id,
                        name,
                        email,
                        admin,
                        created_at,
                        updated_at
                    FROM users
                    {where_sql}
                    ORDER BY created_at DESC, id DESC
                    LIMIT %(limit)s OFFSET %(offset)s
                    """,
                    params,
                )
                rows = list(await cursor.fetchall())

        return {
            "total": (total_row or {}).get("total", 0),
            "datas": [self._to_user_payload(row) for row in rows],
        }

    async def get_user_role_bindings(
        self,
        *,
        current_user: CurrentUserContext,
        user_id: str,
    ) -> dict[str, Any]:
        await self._ensure_current_user_is_admin(current_user)

        async with await self._connect() as connection:
            async with connection.cursor() as cursor:
                user = await self._get_user(cursor, user_id)
                if not user:
                    raise AdminUserNotFoundError()

                await cursor.execute(
                    """
                    SELECT
                        o.id,
                        o.name,
                        om.role::text AS role
                    FROM organization_memberships om
                    JOIN organizations o ON o.id = om.org_id
                    WHERE om.user_id = %(user_id)s
                    ORDER BY o.name, o.id
                    """,
                    {"user_id": user_id},
                )
                organizations = [
                    {
                        "id": row["id"],
                        "name": row["name"],
                        "role": row.get("role") or "NONE",
                    }
                    for row in await cursor.fetchall()
                ]

                await cursor.execute(
                    """
                    SELECT
                        p.id,
                        p.name,
                        o.id AS organization_id,
                        o.name AS organization_name,
                        om.role::text AS organization_role,
                        pm.role::text AS project_role,
                        COALESCE(
                            NULLIF(pm.role::text, 'NONE'),
                            NULLIF(om.role::text, 'NONE'),
                            'NONE'
                        ) AS effective_role
                    FROM projects p
                    JOIN organizations o ON o.id = p.org_id
                    JOIN organization_memberships om
                      ON om.org_id = p.org_id
                     AND om.user_id = %(user_id)s
                    LEFT JOIN project_memberships pm
                      ON pm.org_membership_id = om.id
                     AND pm.project_id = p.id
                     AND pm.user_id = om.user_id
                    WHERE p.deleted_at IS NULL
                    ORDER BY o.name, p.name, p.id
                    """,
                    {"user_id": user_id},
                )
                projects = [
                    {
                        "id": row["id"],
                        "name": row["name"],
                        "organizationId": row["organization_id"],
                        "organizationName": row["organization_name"],
                        "organizationRole": row.get("organization_role") or "NONE",
                        "projectRole": row.get("project_role") or "NONE",
                        "effectiveRole": row.get("effective_role") or "NONE",
                    }
                    for row in await cursor.fetchall()
                ]

        return {
            "user": self._to_user_payload(user),
            "organizations": organizations,
            "projects": projects,
        }

    async def patch_user_admin(
        self,
        *,
        current_user: CurrentUserContext,
        user_id: str,
        admin: bool,
    ) -> dict[str, Any]:
        await self._ensure_current_user_is_admin(current_user)

        async with await self._connect() as connection:
            async with connection.cursor() as cursor:
                user = await self._get_user(cursor, user_id)
                if not user:
                    raise AdminUserNotFoundError()
                if user["admin"] is True and admin is False:
                    await cursor.execute(
                        "SELECT COUNT(id)::int AS total FROM users WHERE admin = true",
                        {},
                    )
                    admin_count = (await cursor.fetchone() or {}).get("total", 0)
                    if admin_count <= 1:
                        raise LastAdminUserError()

                await cursor.execute(
                    """
                    UPDATE users
                    SET admin = %(admin)s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %(user_id)s
                    RETURNING id, name, email, admin, created_at, updated_at
                    """,
                    {"user_id": user_id, "admin": admin},
                )
                updated_user = await cursor.fetchone()

        if not updated_user:
            raise AdminUserNotFoundError()
        return self._to_user_payload(updated_user)

    async def _ensure_current_user_is_admin(
        self,
        current_user: CurrentUserContext,
    ) -> None:
        async with await self._connect() as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(
                    "SELECT admin FROM users WHERE id = %(user_id)s LIMIT 1",
                    {"user_id": current_user.user_id},
                )
                row = await cursor.fetchone()
        if not row or row.get("admin") is not True:
            raise AdminPermissionError()

    async def _connect(self) -> psycopg.AsyncConnection:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()
        return await psycopg.AsyncConnection.connect(
            self._database_url,
            row_factory=dict_row,
        )

    @staticmethod
    async def _get_user(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        user_id: str,
    ) -> dict[str, Any] | None:
        await cursor.execute(
            """
            SELECT id, name, email, admin, created_at, updated_at
            FROM users
            WHERE id = %(user_id)s
            LIMIT 1
            """,
            {"user_id": user_id},
        )
        return await cursor.fetchone()

    @staticmethod
    def _to_user_payload(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "name": row.get("name"),
            "email": row.get("email"),
            "admin": row.get("admin") is True,
            "createdAt": _format_datetime(row.get("created_at")),
            "updatedAt": _format_datetime(row.get("updated_at")),
        }


def get_admin_user_service(
    settings: Settings = Depends(get_settings),
) -> AdminUserService:
    return AdminUserService(settings)


@router.get("")
async def list_admin_users(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200, alias="pageSize"),
    keyword: str | None = Query(default=None),
    admin: bool | None = Query(default=None),
    current_user: CurrentUserContext = Depends(get_current_user_context),
    service: AdminUserService = Depends(get_admin_user_service),
) -> dict[str, Any]:
    return success(
        await service.list_users(
            current_user=current_user,
            page=page,
            page_size=page_size,
            keyword=keyword,
            admin=admin,
        )
    )


@router.get("/{user_id}/role-bindings")
async def get_admin_user_role_bindings(
    user_id: str,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    service: AdminUserService = Depends(get_admin_user_service),
) -> dict[str, Any]:
    return success(
        await service.get_user_role_bindings(
            current_user=current_user,
            user_id=user_id,
        )
    )


@router.patch("/{user_id}/admin")
async def patch_admin_user_admin(
    user_id: str,
    payload: PatchUserAdminPayload,
    current_user: CurrentUserContext = Depends(get_current_user_context),
    service: AdminUserService = Depends(get_admin_user_service),
) -> dict[str, Any]:
    return success(
        await service.patch_user_admin(
            current_user=current_user,
            user_id=user_id,
            admin=payload.admin,
        )
    )


def _format_datetime(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)
