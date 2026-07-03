from datetime import datetime
from typing import Any
from uuid import uuid4

import psycopg
from fastapi import Depends
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.config import Settings, get_settings
from app.errors import BusinessError


class LangfuseDatabaseConfigError(BusinessError):
    def __init__(self) -> None:
        super().__init__(
            code=2004,
            message="Langfuse 数据库连接未配置",
            status_code=500,
        )


class LangfuseDatabaseReader:
    def __init__(self, settings: Settings) -> None:
        self._database_url = settings.langfuse_database_url

    async def list_organizations(self) -> list[dict[str, Any]]:
        rows = await self._fetch_all(
            """
            SELECT
                o.id,
                o.name,
                o.created_at,
                o.updated_at,
                o.metadata,
                COUNT(p.id)::int AS project_count
            FROM organizations o
            LEFT JOIN projects p
                ON p.org_id = o.id
               AND p.deleted_at IS NULL
            GROUP BY o.id
            ORDER BY o.created_at DESC, o.id DESC
            """
        )
        return [self._to_organization_payload(row) for row in rows]

    async def list_projects(self) -> list[dict[str, Any]]:
        rows = await self._fetch_all(
            """
            SELECT
                p.id,
                p.name,
                p.org_id,
                o.name AS organization_name,
                p.created_at,
                p.updated_at,
                p.deleted_at,
                p.metadata
            FROM projects p
            JOIN organizations o ON o.id = p.org_id
            ORDER BY p.created_at DESC, p.id DESC
            """
        )
        return [self._to_project_payload(row) for row in rows]

    async def get_organization(self, organization_id: str) -> dict[str, Any] | None:
        rows = await self._fetch_all(
            """
            SELECT
                o.id,
                o.name,
                o.created_at,
                o.updated_at,
                o.metadata,
                COUNT(p.id)::int AS project_count
            FROM organizations o
            LEFT JOIN projects p
                ON p.org_id = o.id
               AND p.deleted_at IS NULL
            WHERE o.id = %(organization_id)s
            GROUP BY o.id
            """,
            {"organization_id": organization_id},
        )
        if not rows:
            return None
        return self._to_organization_payload(rows[0])

    async def list_organization_members(
        self,
        organization_id: str,
    ) -> list[dict[str, Any]]:
        rows = await self._fetch_all(
            """
            SELECT
                om.id,
                om.org_id,
                om.user_id,
                om.role::text AS role,
                om.created_at,
                om.updated_at,
                u.name,
                u.email
            FROM organization_memberships om
            JOIN users u ON u.id = om.user_id
            WHERE om.org_id = %(organization_id)s
            ORDER BY om.created_at DESC, om.id DESC
            """,
            {"organization_id": organization_id},
        )
        return [self._to_member_payload(row) for row in rows]

    async def create_organization_with_default_project(
        self,
        payload: dict[str, Any],
        owner_email: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        organization_id = _new_langfuse_id("org")
        project_id = _new_langfuse_id("project")
        membership_id = _new_langfuse_id("orgmem")

        async with await psycopg.AsyncConnection.connect(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(
                    "SELECT id FROM users WHERE email = %(email)s",
                    {"email": owner_email},
                )
                owner = await cursor.fetchone()
                if owner is None:
                    raise BusinessError(
                        code=1004,
                        message=f"默认组织 Owner 不存在：{owner_email}",
                        status_code=404,
                    )

                await cursor.execute(
                    """
                    INSERT INTO organizations (id, name, metadata)
                    VALUES (%(id)s, %(name)s, %(metadata)s)
                    RETURNING id, name, created_at, updated_at, metadata
                    """,
                    {
                        "id": organization_id,
                        "name": payload["name"],
                        "metadata": Jsonb(payload["metadata"]),
                    },
                )
                organization = await cursor.fetchone()

                await cursor.execute(
                    """
                    INSERT INTO organization_memberships
                        (id, org_id, user_id, role)
                    VALUES
                        (%(id)s, %(org_id)s, %(user_id)s, 'OWNER')
                    """,
                    {
                        "id": membership_id,
                        "org_id": organization_id,
                        "user_id": owner["id"],
                    },
                )

                await cursor.execute(
                    """
                    INSERT INTO projects (id, name, org_id, metadata)
                    VALUES (%(id)s, %(name)s, %(org_id)s, %(metadata)s)
                    """,
                    {
                        "id": project_id,
                        "name": payload["default_project_name"],
                        "org_id": organization_id,
                        "metadata": Jsonb({"paEval": {"createdBy": "pa-eval"}}),
                    },
                )

        assert organization is not None
        return self._to_organization_payload(
            {
                **organization,
                "project_count": 1,
            }
        )

    async def update_organization(
        self,
        organization_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await psycopg.AsyncConnection.connect(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    UPDATE organizations
                    SET
                        name = %(name)s,
                        metadata = %(metadata)s,
                        updated_at = NOW()
                    WHERE id = %(organization_id)s
                    RETURNING id, name, created_at, updated_at, metadata
                    """,
                    {
                        "organization_id": organization_id,
                        "name": payload["name"],
                        "metadata": Jsonb(payload["metadata"]),
                    },
                )
                organization = await cursor.fetchone()

                if organization is None:
                    raise BusinessError(
                        code=1004,
                        message="组织不存在",
                        status_code=404,
                    )

                await cursor.execute(
                    """
                    SELECT COUNT(id)::int AS project_count
                    FROM projects
                    WHERE org_id = %(organization_id)s
                      AND deleted_at IS NULL
                    """,
                    {"organization_id": organization_id},
                )
                project_count = await cursor.fetchone()

        return self._to_organization_payload(
            {
                **organization,
                "project_count": (project_count or {}).get("project_count", 0),
            }
        )

    async def _fetch_all(
        self,
        sql: str,
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await psycopg.AsyncConnection.connect(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(sql, params or {})
                return list(await cursor.fetchall())

    @staticmethod
    def _to_organization_payload(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "name": row["name"],
            "createdAt": _format_datetime(row["created_at"]),
            "updatedAt": _format_datetime(row["updated_at"]),
            "metadata": row.get("metadata") or {},
            "projectCount": row.get("project_count") or 0,
        }

    @staticmethod
    def _to_project_payload(row: dict[str, Any]) -> dict[str, Any]:
        metadata = row.get("metadata") or {}
        pa_eval = metadata.get("paEval") if isinstance(metadata, dict) else None
        description = pa_eval.get("description") if isinstance(pa_eval, dict) else None
        organization_name = row["organization_name"]

        return {
            "id": row["id"],
            "name": row["name"],
            "organizationId": row["org_id"],
            "organizationName": organization_name,
            "description": description or f"所属组织：{organization_name}",
            "status": "archived" if row.get("deleted_at") else "active",
            "createdAt": _format_datetime(row["created_at"]),
            "updatedAt": _format_datetime(row["updated_at"]),
        }

    @staticmethod
    def _to_member_payload(row: dict[str, Any]) -> dict[str, Any]:
        email = row.get("email") or ""
        name = row.get("name") or email.split("@")[0] or "未命名用户"

        return {
            "id": row["id"],
            "organizationId": row["org_id"],
            "userId": row["user_id"],
            "name": name,
            "email": email,
            "role": row["role"],
            "status": "ACTIVE",
            "joinedAt": _format_datetime(row["created_at"]),
            "createdAt": _format_datetime(row["created_at"]),
            "updatedAt": _format_datetime(row["updated_at"]),
        }


def _format_datetime(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat(timespec="milliseconds") + "Z"
    return str(value)


def _new_langfuse_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


async def get_langfuse_db_reader(
    settings: Settings = Depends(get_settings),
) -> LangfuseDatabaseReader:
    return LangfuseDatabaseReader(settings)
