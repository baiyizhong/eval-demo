import json
import hashlib
from datetime import datetime, timedelta, timezone
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

import psycopg
from fastapi import Depends
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.auth_context import CurrentUserContext
from app.annotation_assignment import (
    normalize_assignment_strategy,
    normalize_assignment_weights,
    plan_annotation_assignments,
)
from app.config import Settings, get_settings
from app.data_access.postgres import connect_postgres
from app.errors import BusinessError
from app.score_configs import (
    PA_BOOLEAN_SCORE_CONFIG_REPAIR_MARKER,
    PA_CLICKHOUSE_SCORE_VALUE,
    is_langfuse_boolean_categories,
    langfuse_boolean_categories,
    langfuse_boolean_label,
)


PROJECT_ACCESS_EXISTS_SQL = """
(
    EXISTS (
        SELECT 1
        FROM users u
        WHERE u.id = %(user_id)s
          AND u.admin IS TRUE
    )
    OR EXISTS (
        SELECT 1
        FROM organization_memberships om
        LEFT JOIN project_memberships pm
          ON pm.org_membership_id = om.id
         AND pm.project_id = p.id
        WHERE om.org_id = p.org_id
          AND om.user_id = %(user_id)s
          AND (
            om.role::text <> 'NONE'
            OR pm.role::text <> 'NONE'
          )
    )
)
"""

TEXT_SCORE_MAX_LENGTH = 500
ROLE_LEVELS = {
    "NONE": 0,
    None: 0,
    "VIEWER": 1,
    "MEMBER": 2,
    "ADMIN": 3,
    "OWNER": 4,
}
MANAGER_ROLE_LEVEL = ROLE_LEVELS["ADMIN"]

SYSTEM_AUDIT_PERMISSION = "system:audit:view"

ORG_ADMIN_PERMISSIONS = [
    "org:project:view",
    "org:project:edit",
    "org:organization:view",
    "org:organization:edit",
    "org:member:view",
    "org:member:edit",
]
ORG_READ_PERMISSIONS = [
    "org:project:view",
    "org:organization:view",
]

TRACE_DATASET_INSERT_BATCH_SIZE = 500

PROJECT_ADMIN_PERMISSIONS = [
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
]
PROJECT_MEMBER_PERMISSIONS = [
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
]
PROJECT_VIEWER_PERMISSIONS = [
    "project:trace:view",
    "project:dataset:view",
    "project:evaluator:view",
    "project:annotation:view",
    "project:auto-evaluation:view",
    "project:evaluation-report:view",
    "project:scheduled-job:view",
    "project:settings:view",
    "project:score-config:view",
]


def map_system_permissions(is_super_admin: bool) -> list[str]:
    if is_super_admin:
        return [SYSTEM_AUDIT_PERMISSION]
    return []


def map_organization_permissions(role: str | None) -> list[str]:
    if role in {"OWNER", "ADMIN"}:
        return ORG_ADMIN_PERMISSIONS.copy()
    if role in {"MEMBER", "VIEWER"}:
        return ORG_READ_PERMISSIONS.copy()
    return []


def map_project_permissions(role: str | None) -> list[str]:
    if role in {"OWNER", "ADMIN"}:
        return PROJECT_ADMIN_PERMISSIONS.copy()
    if role == "MEMBER":
        return PROJECT_MEMBER_PERMISSIONS.copy()
    if role == "VIEWER":
        return PROJECT_VIEWER_PERMISSIONS.copy()
    return []


class LangfuseDatabaseConfigError(BusinessError):
    def __init__(self) -> None:
        super().__init__(
            code=2004,
            message="Langfuse 数据库连接未配置",
            status_code=500,
        )


class LangfuseSaltConfigError(BusinessError):
    def __init__(self) -> None:
        super().__init__(
            code=2005,
            message="Langfuse SALT 未配置",
            status_code=500,
        )


class LangfuseDatabaseReader:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._database_url = settings.langfuse_database_url
        self._langfuse_salt = settings.langfuse_salt

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

    async def get_user_by_email(self, email: str) -> dict[str, Any] | None:
        rows = await self._fetch_all(
            """
            SELECT id, name, email
            FROM users
            WHERE lower(email) = lower(%(email)s)
            LIMIT 1
            """,
            {"email": email},
        )
        if not rows:
            return None
        return {
            "id": rows[0]["id"],
            "name": rows[0].get("name"),
            "email": rows[0]["email"],
        }

    async def list_organizations_for_user(
        self,
        user_id: str,
    ) -> list[dict[str, Any]]:
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
            WHERE EXISTS (
                SELECT 1
                FROM organization_memberships om
                WHERE om.org_id = o.id
                  AND om.user_id = %(user_id)s
            )
            GROUP BY o.id
            ORDER BY o.created_at DESC, o.id DESC
            """,
            {"user_id": user_id},
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

    async def list_projects_for_user(self, user_id: str) -> list[dict[str, Any]]:
        rows = await self._fetch_all(
            f"""
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
            WHERE {PROJECT_ACCESS_EXISTS_SQL}
            ORDER BY p.created_at DESC, p.id DESC
            """,
            {"user_id": user_id},
        )
        return [self._to_project_payload(row) for row in rows]

    async def get_user_session(
        self,
        current_user: CurrentUserContext,
    ) -> dict[str, Any]:
        organization_rows = await self._fetch_all(
            """
            SELECT
                om.org_id AS organization_id,
                o.name AS organization_name,
                om.role::text AS organization_role
            FROM organization_memberships om
            JOIN organizations o ON o.id = om.org_id
            WHERE om.user_id = %(user_id)s
            ORDER BY o.created_at DESC, o.id DESC
            """,
            {"user_id": current_user.user_id},
        )
        project_rows = await self._fetch_all(
            """
            SELECT DISTINCT
                p.id AS project_id,
                p.name AS project_name,
                p.org_id AS organization_id,
                o.name AS organization_name,
                om.role::text AS organization_role,
                COALESCE(
                    NULLIF(pm.role::text, 'NONE'),
                    NULLIF(om.role::text, 'NONE')
                ) AS role
            FROM projects p
            JOIN organizations o ON o.id = p.org_id
            JOIN organization_memberships om
              ON om.org_id = p.org_id
             AND om.user_id = %(user_id)s
            LEFT JOIN project_memberships pm
              ON pm.org_membership_id = om.id
             AND pm.project_id = p.id
            WHERE p.deleted_at IS NULL
              AND (
                om.role::text <> 'NONE'
                OR pm.role::text <> 'NONE'
              )
            ORDER BY o.name, p.name, p.id
            """,
            {"user_id": current_user.user_id},
        )

        orgs_by_id: dict[str, dict[str, Any]] = {}
        for row in organization_rows:
            role = row.get("organization_role")
            orgs_by_id[row["organization_id"]] = {
                "id": row["organization_id"],
                "name": row["organization_name"],
                "role": role,
                "permissions": map_organization_permissions(role),
                "projects": [],
            }

        for row in project_rows:
            organization_id = row["organization_id"]
            if organization_id not in orgs_by_id:
                organization_role = row.get("organization_role")
                orgs_by_id[organization_id] = {
                    "id": organization_id,
                    "name": row["organization_name"],
                    "role": organization_role,
                    "permissions": map_organization_permissions(organization_role),
                    "projects": [],
                }

            role = row.get("role")
            orgs_by_id[organization_id]["projects"].append(
                {
                    "id": row["project_id"],
                    "name": row["project_name"],
                    "role": role,
                    "permissions": map_project_permissions(role),
                }
            )

        is_super_admin = await self._is_super_admin(current_user.user_id)

        return {
            "user": {
                "email": current_user.email,
                "name": current_user.name or current_user.email.split("@")[0],
            },
            "superAdmin": is_super_admin,
            "permissions": map_system_permissions(is_super_admin),
            "orgs": list(orgs_by_id.values()),
        }

    async def is_super_admin(self, user_id: str) -> bool:
        return await self._is_super_admin(user_id)

    async def _is_super_admin(self, user_id: str) -> bool:
        rows = await self._fetch_all(
            """
            SELECT admin
            FROM users
            WHERE id = %(user_id)s
            LIMIT 1
            """,
            {"user_id": user_id},
        )
        return bool(rows and rows[0].get("admin") is True)

    async def get_project_for_user(
        self,
        project_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        rows = await self._fetch_all(
            f"""
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
            WHERE p.id = %(project_id)s
              AND {PROJECT_ACCESS_EXISTS_SQL}
            LIMIT 1
            """,
            {"project_id": project_id, "user_id": user_id},
        )
        if not rows:
            raise BusinessError(
                code=1005,
                message="项目不存在或无访问权限",
                status_code=404,
            )
        return self._to_project_payload(rows[0])

    async def create_project_for_user(
        self,
        organization_id: str,
        user_id: str,
        user_email: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        project_id = _new_langfuse_id("project")
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                organization = await self._get_organization_for_user(
                    cursor,
                    organization_id,
                    user_id,
                )
                self._ensure_project_can_be_created(organization)
                metadata = _merge_pa_eval_metadata(
                    None,
                    {
                        "description": payload.get("description") or "",
                        "retentionDays": payload.get("retentionDays"),
                        "createdBy": user_email,
                        "updatedBy": user_email,
                    },
                )
                await cursor.execute(
                    """
                    INSERT INTO projects (id, name, org_id, metadata)
                    VALUES (%(id)s, %(name)s, %(org_id)s, %(metadata)s)
                    RETURNING id, name, org_id, created_at, updated_at, deleted_at, metadata
                    """,
                    {
                        "id": project_id,
                        "name": payload["name"],
                        "org_id": organization_id,
                        "metadata": Jsonb(metadata),
                    },
                )
                row = await cursor.fetchone()
                await cursor.execute(
                    """
                    INSERT INTO project_memberships (
                        project_id,
                        user_id,
                        org_membership_id,
                        role,
                        created_at,
                        updated_at
                    )
                    SELECT
                        %(project_id)s,
                        om.user_id,
                        om.id,
                        CASE
                            WHEN om.role::text = 'NONE' THEN 'MEMBER'::"Role"
                            ELSE om.role
                        END,
                        NOW(),
                        NOW()
                    FROM organization_memberships om
                    WHERE om.org_id = %(organization_id)s
                      AND om.user_id = %(user_id)s
                    ON CONFLICT (project_id, user_id) DO UPDATE
                    SET
                        org_membership_id = EXCLUDED.org_membership_id,
                        role = EXCLUDED.role,
                        updated_at = NOW()
                    """,
                    {
                        "project_id": project_id,
                        "organization_id": organization_id,
                        "user_id": user_id,
                    },
                )

        assert row is not None
        return self._to_project_payload(
            {**row, "organization_name": organization["name"]}
        )

    async def update_project_for_user(
        self,
        project_id: str,
        user_id: str,
        user_email: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                current = await self._get_project_detail_for_user(
                    cursor,
                    project_id,
                    user_id,
                )
                metadata = _merge_pa_eval_metadata(
                    current.get("metadata"),
                    {
                        "description": payload.get("description") or "",
                        "retentionDays": payload.get("retentionDays"),
                        "updatedBy": user_email,
                    },
                )
                await cursor.execute(
                    """
                    UPDATE projects
                    SET
                        name = %(name)s,
                        metadata = %(metadata)s,
                        updated_at = NOW()
                    WHERE id = %(project_id)s
                    RETURNING id, name, org_id, created_at, updated_at, deleted_at, metadata
                    """,
                    {
                        "project_id": project_id,
                        "name": payload["name"],
                        "metadata": Jsonb(metadata),
                    },
                )
                row = await cursor.fetchone()

        assert row is not None
        return self._to_project_payload(
            {**row, "organization_name": current["organization_name"]}
        )

    async def archive_project_for_user(
        self,
        project_id: str,
        user_id: str,
        user_email: str,
    ) -> dict[str, Any]:
        return await self._set_project_archive_state_for_user(
            project_id=project_id,
            user_id=user_id,
            user_email=user_email,
            archived=True,
        )

    async def restore_project_for_user(
        self,
        project_id: str,
        user_id: str,
        user_email: str,
    ) -> dict[str, Any]:
        return await self._set_project_archive_state_for_user(
            project_id=project_id,
            user_id=user_id,
            user_email=user_email,
            archived=False,
        )

    async def ensure_project_visible(self, project_id: str, user_id: str) -> None:
        await self._ensure_project_visible(project_id, user_id)

    async def list_project_api_keys(
        self,
        project_id: str,
        user_id: str,
    ) -> list[dict[str, Any]]:
        await self._ensure_project_visible(project_id, user_id)
        rows = await self._fetch_all(
            """
            SELECT
                id,
                project_id,
                note,
                public_key,
                secret_key,
                create_date,
                update_by,
                update_date
            FROM pa_project_api_keys
            WHERE project_id = %(project_id)s
            ORDER BY create_date DESC, id DESC
            """,
            {"project_id": project_id},
        )
        return [self._to_project_api_key_payload(row) for row in rows]

    async def create_project_api_key(
        self,
        project_id: str,
        note: str,
        user_email: str,
        user_id: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()
        if not self._langfuse_salt:
            raise LangfuseSaltConfigError()

        key_id = _new_langfuse_id("papikey")
        public_key = f"pk-lf-{uuid4()}"
        secret_key = f"sk-lf-{uuid4()}"

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    INSERT INTO pa_project_api_keys (
                        id,
                        project_id,
                        note,
                        public_key,
                        secret_key,
                        create_by,
                        create_date,
                        update_by,
                        update_date
                    )
                    VALUES (
                        %(id)s,
                        %(project_id)s,
                        %(note)s,
                        %(public_key)s,
                        %(secret_key)s,
                        %(create_by)s,
                        NOW(),
                        %(update_by)s,
                        NOW()
                    )
                    RETURNING
                        id,
                        project_id,
                        note,
                        public_key,
                        secret_key,
                        create_date,
                        update_by,
                        update_date
                    """,
                    {
                        "id": key_id,
                        "project_id": project_id,
                        "note": note,
                        "public_key": public_key,
                        "secret_key": secret_key,
                        "create_by": user_email,
                        "update_by": user_email,
                    },
                )
                row = await cursor.fetchone()
                await self._insert_langfuse_project_api_key(
                    cursor=cursor,
                    key_id=key_id,
                    project_id=project_id,
                    note=note,
                    public_key=public_key,
                    secret_key=secret_key,
                )

        assert row is not None
        return self._to_project_api_key_payload(row)

    async def update_project_api_key(
        self,
        project_id: str,
        key_id: str,
        note: str,
        user_email: str,
        user_id: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    UPDATE pa_project_api_keys
                    SET
                        note = %(note)s,
                        update_by = %(update_by)s,
                        update_date = NOW()
                    WHERE id = %(id)s
                      AND project_id = %(project_id)s
                    RETURNING
                        id,
                        project_id,
                        note,
                        public_key,
                        secret_key,
                        create_date,
                        update_by,
                        update_date
                    """,
                    {
                        "id": key_id,
                        "project_id": project_id,
                        "note": note,
                        "update_by": user_email,
                    },
                )
                row = await cursor.fetchone()

        if row is None:
            raise BusinessError(
                code=1012,
                message="项目 API Key 不存在或无访问权限",
                status_code=404,
            )
        return self._to_project_api_key_payload(row)

    async def delete_project_api_key(
        self,
        project_id: str,
        key_id: str,
        user_id: str,
    ) -> dict[str, str]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    DELETE FROM pa_project_api_keys
                    WHERE id = %(id)s
                      AND project_id = %(project_id)s
                    RETURNING id, public_key
                    """,
                    {"id": key_id, "project_id": project_id},
                )
                row = await cursor.fetchone()
                if row is not None:
                    await cursor.execute(
                        """
                        DELETE FROM api_keys
                        WHERE project_id = %(project_id)s
                          AND public_key = %(public_key)s
                          AND scope = 'PROJECT'
                        """,
                        {
                            "project_id": project_id,
                            "public_key": row["public_key"],
                        },
                    )

        if row is None:
            raise BusinessError(
                code=1012,
                message="项目 API Key 不存在或无访问权限",
                status_code=404,
            )
        return {"id": row["id"]}

    async def _insert_langfuse_project_api_key(
        self,
        *,
        cursor: Any,
        key_id: str,
        project_id: str,
        note: str,
        public_key: str,
        secret_key: str,
    ) -> None:
        await cursor.execute(
            """
            INSERT INTO api_keys (
                id,
                created_at,
                note,
                public_key,
                hashed_secret_key,
                display_secret_key,
                project_id,
                fast_hashed_secret_key,
                scope,
                is_in_app_agent_key
            )
            VALUES (
                %(id)s,
                NOW(),
                %(note)s,
                %(public_key)s,
                %(hashed_secret_key)s,
                %(display_secret_key)s,
                %(project_id)s,
                %(fast_hashed_secret_key)s,
                'PROJECT',
                false
            )
            """,
            {
                "id": key_id,
                "note": note,
                "public_key": public_key,
                "hashed_secret_key": f"pa-eval-placeholder-{uuid4()}",
                "display_secret_key": _display_secret_key(secret_key),
                "project_id": project_id,
                "fast_hashed_secret_key": _create_sha_hash(
                    secret_key,
                    self._langfuse_salt,
                ),
            },
        )

    async def get_project_model_settings_for_user(
        self,
        project_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        await self._ensure_project_visible(project_id, user_id)
        connections = await self._fetch_all(
            """
            SELECT
                id,
                provider,
                adapter,
                secret_key,
                base_url,
                custom_models,
                with_default_models
            FROM pa_project_llm_connections
            WHERE project_id = %(project_id)s
              AND status = 'ACTIVE'
            ORDER BY update_date DESC, create_date DESC, id DESC
            """,
            {"project_id": project_id},
        )
        definitions = await self._fetch_all(
            """
            SELECT
                id,
                model_name,
                match_pattern,
                unit,
                input_price,
                output_price,
                tokenizer_id
            FROM pa_project_model_definitions
            WHERE project_id = %(project_id)s
              AND status = 'ACTIVE'
            ORDER BY update_date DESC, create_date DESC, id DESC
            """,
            {"project_id": project_id},
        )
        settings_rows = await self._fetch_all(
            """
            SELECT
                pms.id,
                pms.llm_connection_id,
                pms.model,
                pms.temperature,
                plc.provider,
                plc.adapter
            FROM pa_project_model_settings pms
            LEFT JOIN pa_project_llm_connections plc
              ON plc.project_id = pms.project_id
             AND plc.id = pms.llm_connection_id
            WHERE pms.project_id = %(project_id)s
            LIMIT 1
            """,
            {"project_id": project_id},
        )
        connection_payloads = [
            self._to_llm_connection_payload(row) for row in connections
        ]
        default_model = self._to_default_model_payload(
            settings_rows[0] if settings_rows else None,
            connection_payloads[0] if connection_payloads else None,
            project_id,
        )
        return {
            "defaultModel": default_model,
            "connections": connection_payloads,
            "modelDefinitions": [
                self._to_model_definition_payload(row) for row in definitions
            ],
        }

    async def update_project_default_model_for_user(
        self,
        project_id: str,
        user_id: str,
        user_email: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        setting_id = f"pamodeldefault_{project_id}"
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                connection_row = await self._get_llm_connection_row(
                    cursor,
                    project_id,
                    payload["llmConnectionId"],
                )
                await cursor.execute(
                    """
                    INSERT INTO pa_project_model_settings (
                        id,
                        project_id,
                        llm_connection_id,
                        model,
                        temperature,
                        create_by,
                        create_date,
                        update_by,
                        update_date
                    )
                    VALUES (
                        %(id)s,
                        %(project_id)s,
                        %(llm_connection_id)s,
                        %(model)s,
                        %(temperature)s,
                        %(create_by)s,
                        NOW(),
                        %(update_by)s,
                        NOW()
                    )
                    ON CONFLICT (project_id) DO UPDATE
                    SET
                        llm_connection_id = EXCLUDED.llm_connection_id,
                        model = EXCLUDED.model,
                        temperature = EXCLUDED.temperature,
                        update_by = EXCLUDED.update_by,
                        update_date = NOW()
                    RETURNING id, llm_connection_id, model, temperature
                    """,
                    {
                        "id": setting_id,
                        "project_id": project_id,
                        "llm_connection_id": payload["llmConnectionId"],
                        "model": payload["model"],
                        "temperature": payload["temperature"],
                        "create_by": user_email,
                        "update_by": user_email,
                    },
                )
                row = await cursor.fetchone()

        assert row is not None
        return self._to_default_model_payload(
            {
                **row,
                "provider": connection_row["provider"],
                "adapter": connection_row["adapter"],
            },
            None,
            project_id,
        )

    async def create_project_llm_connection_for_user(
        self,
        project_id: str,
        user_id: str,
        user_email: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        connection_id = _new_langfuse_id("pallm")
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    INSERT INTO pa_project_llm_connections (
                        id,
                        project_id,
                        provider,
                        adapter,
                        secret_key,
                        base_url,
                        custom_models,
                        with_default_models,
                        create_by,
                        create_date,
                        update_by,
                        update_date
                    )
                    VALUES (
                        %(id)s,
                        %(project_id)s,
                        %(provider)s,
                        %(adapter)s,
                        %(secret_key)s,
                        %(base_url)s,
                        %(custom_models)s,
                        %(with_default_models)s,
                        %(create_by)s,
                        NOW(),
                        %(update_by)s,
                        NOW()
                    )
                    RETURNING
                        id,
                        provider,
                        adapter,
                        secret_key,
                        base_url,
                        custom_models,
                        with_default_models
                    """,
                    {
                        "id": connection_id,
                        "project_id": project_id,
                        "provider": payload["provider"],
                        "adapter": payload["adapter"],
                        "secret_key": payload.get("secretKey") or "",
                        "base_url": payload.get("baseUrl") or "",
                        "custom_models": Jsonb(payload.get("customModels") or []),
                        "with_default_models": bool(
                            payload.get("withDefaultModels", True)
                        ),
                        "create_by": user_email,
                        "update_by": user_email,
                    },
                )
                row = await cursor.fetchone()

        assert row is not None
        return self._to_llm_connection_payload(row)

    async def update_project_llm_connection_for_user(
        self,
        project_id: str,
        connection_id: str,
        user_id: str,
        user_email: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    UPDATE pa_project_llm_connections
                    SET provider = %(provider)s,
                        adapter = %(adapter)s,
                        secret_key = CASE
                            WHEN %(secret_key)s = '' THEN secret_key
                            ELSE %(secret_key)s
                        END,
                        base_url = %(base_url)s,
                        custom_models = %(custom_models)s,
                        with_default_models = %(with_default_models)s,
                        update_by = %(update_by)s,
                        update_date = NOW()
                    WHERE project_id = %(project_id)s
                      AND id = %(connection_id)s
                      AND status = 'ACTIVE'
                    RETURNING
                        id,
                        provider,
                        adapter,
                        secret_key,
                        base_url,
                        custom_models,
                        with_default_models
                    """,
                    {
                        "project_id": project_id,
                        "connection_id": connection_id,
                        "provider": payload["provider"],
                        "adapter": payload["adapter"],
                        "secret_key": payload.get("secretKey") or "",
                        "base_url": payload.get("baseUrl") or "",
                        "custom_models": Jsonb(payload.get("customModels") or []),
                        "with_default_models": bool(
                            payload.get("withDefaultModels", True)
                        ),
                        "update_by": user_email,
                    },
                )
                row = await cursor.fetchone()
        if row is None:
            raise BusinessError(1013, "LLM 连接不存在或已不可用", 404)
        return self._to_llm_connection_payload(row)

    async def delete_project_llm_connection_for_user(
        self,
        project_id: str,
        connection_id: str,
        user_id: str,
        user_email: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    UPDATE pa_project_llm_connections
                    SET status = 'ARCHIVED',
                        update_by = %(update_by)s,
                        update_date = NOW()
                    WHERE project_id = %(project_id)s
                      AND id = %(connection_id)s
                      AND status = 'ACTIVE'
                    RETURNING id
                    """,
                    {
                        "project_id": project_id,
                        "connection_id": connection_id,
                        "update_by": user_email,
                    },
                )
                row = await cursor.fetchone()
        if row is None:
            raise BusinessError(1013, "LLM 连接不存在或已不可用", 404)
        return {"id": row["id"]}

    async def create_project_model_definition_for_user(
        self,
        project_id: str,
        user_id: str,
        user_email: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        model_id = _new_langfuse_id("pamodel")
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    INSERT INTO pa_project_model_definitions (
                        id,
                        project_id,
                        model_name,
                        match_pattern,
                        unit,
                        input_price,
                        output_price,
                        tokenizer_id,
                        create_by,
                        create_date,
                        update_by,
                        update_date
                    )
                    VALUES (
                        %(id)s,
                        %(project_id)s,
                        %(model_name)s,
                        %(match_pattern)s,
                        %(unit)s,
                        %(input_price)s,
                        %(output_price)s,
                        %(tokenizer_id)s,
                        %(create_by)s,
                        NOW(),
                        %(update_by)s,
                        NOW()
                    )
                    RETURNING
                        id,
                        model_name,
                        match_pattern,
                        unit,
                        input_price,
                        output_price,
                        tokenizer_id
                    """,
                    {
                        "id": model_id,
                        "project_id": project_id,
                        "model_name": payload["modelName"],
                        "match_pattern": payload.get("matchPattern") or "",
                        "unit": payload.get("unit") or "TOKENS",
                        "input_price": payload.get("inputPrice") or "",
                        "output_price": payload.get("outputPrice") or "",
                        "tokenizer_id": payload.get("tokenizerId") or "",
                        "create_by": user_email,
                        "update_by": user_email,
                    },
                )
                row = await cursor.fetchone()

        assert row is not None
        return self._to_model_definition_payload(row)

    async def update_project_model_definition_for_user(
        self,
        project_id: str,
        model_id: str,
        user_id: str,
        user_email: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    UPDATE pa_project_model_definitions
                    SET model_name = %(model_name)s,
                        match_pattern = %(match_pattern)s,
                        unit = %(unit)s,
                        input_price = %(input_price)s,
                        output_price = %(output_price)s,
                        tokenizer_id = %(tokenizer_id)s,
                        update_by = %(update_by)s,
                        update_date = NOW()
                    WHERE project_id = %(project_id)s
                      AND id = %(model_id)s
                      AND status = 'ACTIVE'
                    RETURNING
                        id,
                        model_name,
                        match_pattern,
                        unit,
                        input_price,
                        output_price,
                        tokenizer_id
                    """,
                    {
                        "project_id": project_id,
                        "model_id": model_id,
                        "model_name": payload["modelName"],
                        "match_pattern": payload.get("matchPattern") or "",
                        "unit": payload.get("unit") or "TOKENS",
                        "input_price": payload.get("inputPrice") or "",
                        "output_price": payload.get("outputPrice") or "",
                        "tokenizer_id": payload.get("tokenizerId") or "",
                        "update_by": user_email,
                    },
                )
                row = await cursor.fetchone()
        if row is None:
            raise BusinessError(1014, "模型定义不存在或已不可用", 404)
        return self._to_model_definition_payload(row)

    async def delete_project_model_definition_for_user(
        self,
        project_id: str,
        model_id: str,
        user_id: str,
        user_email: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    UPDATE pa_project_model_definitions
                    SET status = 'ARCHIVED',
                        update_by = %(update_by)s,
                        update_date = NOW()
                    WHERE project_id = %(project_id)s
                      AND id = %(model_id)s
                      AND status = 'ACTIVE'
                    RETURNING id
                    """,
                    {
                        "project_id": project_id,
                        "model_id": model_id,
                        "update_by": user_email,
                    },
                )
                row = await cursor.fetchone()
        if row is None:
            raise BusinessError(1014, "模型定义不存在或已不可用", 404)
        return {"id": row["id"]}

    async def list_evaluators_for_user(self, user_id: str) -> list[dict[str, Any]]:
        langfuse_evaluators = await self._list_langfuse_evaluators_for_user(user_id)
        pa_evaluators = await self._list_pa_evaluators_for_user(user_id)
        return sorted(
            [*langfuse_evaluators, *pa_evaluators],
            key=lambda item: item.get("updatedAt") or "",
            reverse=True,
        )

    async def list_datasets_for_user(
        self,
        project_id: str,
        user_id: str,
        *,
        page: int | None = None,
        page_size: int | None = None,
        keyword: str | None = None,
        dataset_type: str | None = None,
    ) -> dict[str, Any]:
        await self._ensure_project_visible(project_id, user_id)
        where_sql, params = self._build_dataset_filters(
            project_id,
            keyword=keyword,
            dataset_type=dataset_type,
        )
        count_rows = await self._fetch_all(
            f"""
            SELECT COUNT(*)::int AS total
            FROM datasets d
            WHERE {where_sql}
            """,
            params,
        )
        total = count_rows[0]["total"] if count_rows else 0
        limit = page_size or 1000
        offset = ((page or 1) - 1) * limit
        rows = await self._fetch_all(
            f"""
            SELECT
                d.id,
                d.project_id,
                d.name,
                d.description,
                d.metadata,
                d.input_schema,
                d.expected_output_schema,
                d.created_at,
                d.updated_at,
                COALESCE(item_counts.item_count, 0)::int AS item_count,
                COALESCE(run_counts.run_count, 0)::int AS run_count
            FROM datasets d
            LEFT JOIN LATERAL (
                SELECT COUNT(di.id)::int AS item_count
                FROM dataset_items di
                WHERE di.dataset_id = d.id
                  AND di.project_id = d.project_id
                  AND di.valid_to IS NULL
                  AND di.is_deleted IS FALSE
            ) item_counts ON TRUE
            LEFT JOIN LATERAL (
                SELECT COUNT(dr.id)::int AS run_count
                FROM dataset_runs dr
                WHERE dr.dataset_id = d.id
                  AND dr.project_id = d.project_id
            ) run_counts ON TRUE
            WHERE {where_sql}
            ORDER BY d.updated_at DESC, d.created_at DESC, d.id DESC
            LIMIT %(limit)s
            OFFSET %(offset)s
            """,
            {**params, "limit": limit, "offset": offset},
        )
        return {
            "total": total,
            "datas": [self._to_dataset_payload(row) for row in rows],
        }

    async def get_dataset_for_user(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        await self._ensure_project_visible(project_id, user_id)
        rows = await self._fetch_all(
            """
            SELECT
                d.id,
                d.project_id,
                d.name,
                d.description,
                d.metadata,
                d.input_schema,
                d.expected_output_schema,
                d.created_at,
                d.updated_at,
                COALESCE(item_counts.item_count, 0)::int AS item_count,
                COALESCE(run_counts.run_count, 0)::int AS run_count
            FROM datasets d
            LEFT JOIN LATERAL (
                SELECT COUNT(di.id)::int AS item_count
                FROM dataset_items di
                WHERE di.dataset_id = d.id
                  AND di.project_id = d.project_id
                  AND di.valid_to IS NULL
                  AND di.is_deleted IS FALSE
            ) item_counts ON TRUE
            LEFT JOIN LATERAL (
                SELECT COUNT(dr.id)::int AS run_count
                FROM dataset_runs dr
                WHERE dr.dataset_id = d.id
                  AND dr.project_id = d.project_id
            ) run_counts ON TRUE
            WHERE d.project_id = %(project_id)s
              AND d.id = %(dataset_id)s
            LIMIT 1
            """,
            {"project_id": project_id, "dataset_id": dataset_id},
        )
        if not rows:
            raise BusinessError(
                code=1011,
                message="数据集不存在或无访问权限",
                status_code=404,
            )
        return self._to_dataset_payload(rows[0])

    async def patch_trace_for_user(
        self,
        project_id: str,
        trace_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    UPDATE traces
                    SET
                        input = %(input)s,
                        output = %(output)s,
                        metadata = %(metadata)s,
                        updated_at = NOW()
                    WHERE project_id = %(project_id)s
                      AND id = %(trace_id)s
                    RETURNING id, input, output, metadata, updated_at
                    """,
                    {
                        "project_id": project_id,
                        "trace_id": trace_id,
                        "input": Jsonb(_decode_jsonish(payload.get("input"))),
                        "output": Jsonb(_decode_jsonish(payload.get("output"))),
                        "metadata": Jsonb(payload.get("metadata") or {}),
                    },
                )
                row = await cursor.fetchone()
        if row is None:
            raise BusinessError(4004, "Trace 不存在或无访问权限", 404)
        return {
            "traceId": row["id"],
            "input": payload.get("input") or "",
            "output": payload.get("output") or "",
            "metadata": row.get("metadata") or {},
            "updatedAt": _format_datetime(row.get("updated_at")),
        }

    async def create_dataset_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        dataset_id = _new_langfuse_id("dataset")
        try:
            async with await connect_postgres(
                self._database_url,
                row_factory=dict_row,
            ) as connection:
                async with connection.cursor() as cursor:
                    await self._get_project_for_user(cursor, project_id, user_id)
                    await cursor.execute(
                        """
                        INSERT INTO datasets (
                            id,
                            project_id,
                            name,
                            description,
                            metadata,
                            input_schema,
                            expected_output_schema,
                            created_at,
                            updated_at
                        )
                        VALUES (
                            %(id)s,
                            %(project_id)s,
                            %(name)s,
                            %(description)s,
                            %(metadata)s,
                            %(input_schema)s,
                            %(expected_output_schema)s,
                            NOW(),
                            NOW()
                        )
                        """,
                        {
                            "id": dataset_id,
                            "project_id": project_id,
                            "name": payload["name"],
                            "description": payload.get("description") or "",
                            "metadata": Jsonb(payload.get("metadata") or {}),
                            "input_schema": Jsonb(payload.get("inputSchema") or {}),
                            "expected_output_schema": Jsonb(
                                payload.get("expectedOutputSchema") or {}
                            ),
                        },
                    )
        except psycopg.errors.UniqueViolation as exc:
            raise BusinessError(
                code=1013,
                message="数据集名称已存在",
                status_code=409,
            ) from exc

        return await self.get_dataset_for_user(project_id, dataset_id, user_id)

    async def is_dataset_name_available_for_user(
        self,
        project_id: str,
        user_id: str,
        name: str,
    ) -> bool:
        await self._ensure_project_visible(project_id, user_id)
        rows = await self._fetch_all(
            """
            SELECT NOT EXISTS (
                SELECT 1
                FROM datasets
                WHERE project_id = %(project_id)s
                  AND name = %(name)s
            ) AS available
            """,
            {"project_id": project_id, "name": name},
        )
        return bool(rows and rows[0].get("available"))

    async def update_dataset_for_user(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        try:
            async with await connect_postgres(
                self._database_url,
                row_factory=dict_row,
            ) as connection:
                async with connection.cursor() as cursor:
                    await self._get_project_for_user(cursor, project_id, user_id)
                    await cursor.execute(
                        """
                        UPDATE datasets
                        SET
                            name = %(name)s,
                            description = %(description)s,
                            metadata = %(metadata)s,
                            input_schema = %(input_schema)s,
                            expected_output_schema = %(expected_output_schema)s,
                            updated_at = NOW()
                        WHERE id = %(id)s
                          AND project_id = %(project_id)s
                        RETURNING id
                        """,
                        {
                            "id": dataset_id,
                            "project_id": project_id,
                            "name": payload["name"],
                            "description": payload.get("description") or "",
                            "metadata": Jsonb(payload.get("metadata") or {}),
                            "input_schema": Jsonb(payload.get("inputSchema") or {}),
                            "expected_output_schema": Jsonb(
                                payload.get("expectedOutputSchema") or {}
                            ),
                        },
                    )
                    row = await cursor.fetchone()
        except psycopg.errors.UniqueViolation as exc:
            raise BusinessError(
                code=1013,
                message="数据集名称已存在",
                status_code=409,
            ) from exc

        if row is None:
            raise BusinessError(
                code=1011,
                message="数据集不存在或无访问权限",
                status_code=404,
            )
        return await self.get_dataset_for_user(project_id, dataset_id, user_id)

    async def delete_dataset_for_user(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
    ) -> None:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    DELETE FROM datasets
                    WHERE id = %(id)s
                      AND project_id = %(project_id)s
                    RETURNING id
                    """,
                    {"id": dataset_id, "project_id": project_id},
                )
                row = await cursor.fetchone()

        if row is None:
            raise BusinessError(
                code=1011,
                message="数据集不存在或无访问权限",
                status_code=404,
            )

    async def get_dataset_metric_summary_for_user(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        dataset = await self.get_dataset_for_user(project_id, dataset_id, user_id)
        rows = await self._fetch_all(
            """
            SELECT
                COUNT(di.id)::int AS total,
                COUNT(di.id) FILTER (
                    WHERE di.is_deleted IS FALSE
                      AND COALESCE(di.status::text, 'ACTIVE') != 'ARCHIVED'
                )::int AS active,
                COUNT(di.id) FILTER (
                    WHERE di.is_deleted IS TRUE
                       OR COALESCE(di.status::text, 'ACTIVE') = 'ARCHIVED'
                )::int AS archived
            FROM dataset_items di
            WHERE di.project_id = %(project_id)s
              AND di.dataset_id = %(dataset_id)s
              AND di.valid_to IS NULL
            """,
            {"project_id": project_id, "dataset_id": dataset_id},
        )
        row = rows[0] if rows else {}
        return {
            "total": row.get("total") or 0,
            "active": row.get("active") or 0,
            "archived": row.get("archived") or 0,
            "updatedAt": dataset["updatedAt"],
            "specific": [
                {"label": "来源", "value": "Langfuse"},
                {"label": "运行数", "value": str(dataset["runCount"])},
            ],
        }

    async def list_dataset_items_for_user(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
        *,
        page: int | None = None,
        page_size: int | None = None,
        keyword: str | None = None,
        status: list[str] | None = None,
    ) -> dict[str, Any]:
        await self._ensure_project_visible(project_id, user_id)
        await self._ensure_dataset_visible(project_id, dataset_id)
        where_sql, params = self._build_dataset_item_filters(
            project_id,
            dataset_id,
            keyword=keyword,
            status=status,
        )
        count_rows = await self._fetch_all(
            f"""
            SELECT COUNT(*)::int AS total
            FROM dataset_items di
            WHERE {where_sql}
            """,
            params,
        )
        total = count_rows[0]["total"] if count_rows else 0
        limit = page_size or 1000
        offset = ((page or 1) - 1) * limit
        rows = await self._fetch_all(
            f"""
            SELECT
                di.id,
                di.project_id,
                di.dataset_id,
                di.status::text AS status,
                di.input,
                di.expected_output,
                di.metadata,
                di.source_trace_id,
                di.source_observation_id,
                di.is_deleted,
                di.created_at,
                di.updated_at
            FROM dataset_items di
            WHERE {where_sql}
            ORDER BY di.updated_at DESC, di.created_at DESC, di.id DESC
            LIMIT %(limit)s
            OFFSET %(offset)s
            """,
            {**params, "limit": limit, "offset": offset},
        )
        return {
            "total": total,
            "datas": [self._to_dataset_item_payload(row) for row in rows],
        }

    async def count_dataset_item_statuses_for_user(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
        *,
        keyword: str | None = None,
    ) -> dict[str, int]:
        await self._ensure_project_visible(project_id, user_id)
        await self._ensure_dataset_visible(project_id, dataset_id)
        where_sql, params = self._build_dataset_item_filters(
            project_id,
            dataset_id,
            keyword=keyword,
        )
        rows = await self._fetch_all(
            f"""
            SELECT
                COUNT(*) FILTER (
                    WHERE di.is_deleted IS FALSE
                      AND COALESCE(di.status::text, 'ACTIVE') != 'ARCHIVED'
                )::int AS active,
                COUNT(*) FILTER (
                    WHERE di.is_deleted IS TRUE
                       OR COALESCE(di.status::text, 'ACTIVE') = 'ARCHIVED'
                )::int AS archived
            FROM dataset_items di
            WHERE {where_sql}
            """,
            params,
        )
        row = rows[0] if rows else {}
        return {"ACTIVE": row.get("active") or 0, "ARCHIVED": row.get("archived") or 0}

    async def iter_dataset_items_for_export(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
        *,
        batch_size: int = 1000,
    ):
        await self._ensure_project_visible(project_id, user_id)
        await self._ensure_dataset_visible(project_id, dataset_id)
        cursor: dict[str, Any] = {}
        while True:
            params: dict[str, Any] = {
                "project_id": project_id,
                "dataset_id": dataset_id,
                "limit": batch_size,
            }
            cursor_sql = ""
            if cursor:
                params.update(
                    {
                        "cursor_updated_at": cursor["updatedAt"],
                        "cursor_created_at": cursor["createdAt"],
                        "cursor_id": cursor["id"],
                    }
                )
                cursor_sql = """
                  AND (di.updated_at, di.created_at, di.id) < (
                        %(cursor_updated_at)s,
                        %(cursor_created_at)s,
                        %(cursor_id)s
                  )
                """
            rows = await self._fetch_all(
                f"""
                SELECT
                    di.id,
                    di.project_id,
                    di.dataset_id,
                    di.status::text AS status,
                    di.input,
                    di.expected_output,
                    di.metadata,
                    di.source_trace_id,
                    di.source_observation_id,
                    di.is_deleted,
                    di.created_at,
                    di.updated_at
                FROM dataset_items di
                WHERE di.project_id = %(project_id)s
                  AND di.dataset_id = %(dataset_id)s
                  AND di.valid_to IS NULL
                  {cursor_sql}
                ORDER BY di.updated_at DESC, di.created_at DESC, di.id DESC
                LIMIT %(limit)s
                """,
                params,
            )
            items = [self._to_dataset_item_payload(row) for row in rows]
            if not items:
                break
            yield items
            if len(items) < batch_size:
                break
            last_row = rows[-1]
            cursor = {
                "updatedAt": last_row["updated_at"],
                "createdAt": last_row["created_at"],
                "id": last_row["id"],
            }

    async def create_dataset_item_for_user(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        item_id = _new_langfuse_id("datasetitem")
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await self._ensure_dataset_exists(cursor, project_id, dataset_id)
                await cursor.execute(
                    """
                    INSERT INTO dataset_items (
                        id,
                        project_id,
                        dataset_id,
                        status,
                        input,
                        expected_output,
                        metadata,
                        source_trace_id,
                        source_observation_id,
                        created_at,
                        updated_at,
                        valid_from,
                        is_deleted
                    )
                    VALUES (
                        %(id)s,
                        %(project_id)s,
                        %(dataset_id)s,
                        %(status)s::"DatasetStatus",
                        %(input)s,
                        %(expected_output)s,
                        %(metadata)s,
                        %(source_trace_id)s,
                        %(source_observation_id)s,
                        NOW(),
                        NOW(),
                        NOW(),
                        FALSE
                    )
                    RETURNING
                        id,
                        project_id,
                        dataset_id,
                        status::text AS status,
                        input,
                        expected_output,
                        metadata,
                        source_trace_id,
                        source_observation_id,
                        is_deleted,
                        created_at,
                        updated_at
                    """,
                    {
                        "id": item_id,
                        "project_id": project_id,
                        "dataset_id": dataset_id,
                        "status": payload.get("status") or "ACTIVE",
                        "input": Jsonb(payload.get("input")),
                        "expected_output": Jsonb(payload.get("expectedOutput")),
                        "metadata": Jsonb(payload.get("metadata") or {}),
                        "source_trace_id": payload.get("sourceTraceId") or "",
                        "source_observation_id": payload.get("sourceObservationId")
                        or "",
                    },
                )
                row = await cursor.fetchone()

        assert row is not None
        return self._to_dataset_item_payload(row)

    async def update_dataset_item_for_user(
        self,
        project_id: str,
        dataset_id: str,
        item_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await self._ensure_dataset_exists(cursor, project_id, dataset_id)
                await cursor.execute(
                    """
                    UPDATE dataset_items
                    SET
                        input = %(input)s,
                        expected_output = %(expected_output)s,
                        metadata = %(metadata)s,
                        status = COALESCE(%(status)s::"DatasetStatus", status),
                        source_trace_id = COALESCE(%(source_trace_id)s, source_trace_id),
                        source_observation_id = COALESCE(%(source_observation_id)s, source_observation_id),
                        updated_at = NOW()
                    WHERE project_id = %(project_id)s
                      AND dataset_id = %(dataset_id)s
                      AND id = %(id)s
                      AND valid_to IS NULL
                    RETURNING
                        id,
                        project_id,
                        dataset_id,
                        status::text AS status,
                        input,
                        expected_output,
                        metadata,
                        source_trace_id,
                        source_observation_id,
                        is_deleted,
                        created_at,
                        updated_at
                    """,
                    {
                        "id": item_id,
                        "project_id": project_id,
                        "dataset_id": dataset_id,
                        "status": payload.get("status"),
                        "input": Jsonb(payload.get("input")),
                        "expected_output": Jsonb(payload.get("expectedOutput")),
                        "metadata": Jsonb(payload.get("metadata") or {}),
                        "source_trace_id": payload.get("sourceTraceId"),
                        "source_observation_id": payload.get("sourceObservationId"),
                    },
                )
                row = await cursor.fetchone()

        if row is None:
            raise BusinessError(
                code=1012,
                message="数据项不存在或无访问权限",
                status_code=404,
            )
        return self._to_dataset_item_payload(row)

    async def archive_dataset_item_for_user(
        self,
        project_id: str,
        dataset_id: str,
        item_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await self._ensure_dataset_exists(cursor, project_id, dataset_id)
                await cursor.execute(
                    """
                    UPDATE dataset_items
                    SET
                        status = 'ARCHIVED'::"DatasetStatus",
                        is_deleted = TRUE,
                        updated_at = NOW()
                    WHERE project_id = %(project_id)s
                      AND dataset_id = %(dataset_id)s
                      AND id = %(id)s
                      AND valid_to IS NULL
                    RETURNING
                        id,
                        project_id,
                        dataset_id,
                        status::text AS status,
                        input,
                        expected_output,
                        metadata,
                        source_trace_id,
                        source_observation_id,
                        is_deleted,
                        created_at,
                        updated_at
                    """,
                    {
                        "id": item_id,
                        "project_id": project_id,
                        "dataset_id": dataset_id,
                    },
                )
                row = await cursor.fetchone()

        if row is None:
            raise BusinessError(
                code=1012,
                message="数据项不存在或无访问权限",
                status_code=404,
            )
        return self._to_dataset_item_payload(row)

    async def delete_dataset_item_for_user(
        self,
        project_id: str,
        dataset_id: str,
        item_id: str,
        user_id: str,
    ) -> None:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await self._ensure_dataset_exists(cursor, project_id, dataset_id)
                await cursor.execute(
                    """
                    UPDATE dataset_items
                    SET
                        is_deleted = TRUE,
                        valid_to = NOW(),
                        updated_at = NOW()
                    WHERE project_id = %(project_id)s
                      AND dataset_id = %(dataset_id)s
                      AND id = %(id)s
                      AND valid_to IS NULL
                    RETURNING id
                    """,
                    {
                        "id": item_id,
                        "project_id": project_id,
                        "dataset_id": dataset_id,
                    },
                )
                row = await cursor.fetchone()

        if row is None:
            raise BusinessError(
                code=1012,
                message="数据项不存在或无访问权限",
                status_code=404,
            )

    async def create_dataset_export_job_for_user(
        self,
        project_id: str,
        dataset_id: str,
        user_id: str,
        export_format: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        job_id = _new_langfuse_id("paexport")
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await self._ensure_dataset_exists(cursor, project_id, dataset_id)
                await cursor.execute(
                    """
                    INSERT INTO pa_dataset_export_jobs (
                        create_by,
                        update_by,
                        id,
                        project_id,
                        dataset_id,
                        format,
                        status,
                        expires_at
                    )
                    VALUES (
                        %(user_id)s,
                        %(user_id)s,
                        %(id)s,
                        %(project_id)s,
                        %(dataset_id)s,
                        %(format)s,
                        'PENDING',
                        %(expires_at)s
                    )
                    """,
                    {
                        "id": job_id,
                        "project_id": project_id,
                        "dataset_id": dataset_id,
                        "user_id": user_id,
                        "format": export_format,
                        "expires_at": expires_at,
                    },
                )
                return await self._get_dataset_export_job_payload_cursor(
                    cursor,
                    project_id,
                    dataset_id,
                    job_id,
                )

    async def get_dataset_export_job_for_user(
        self,
        project_id: str,
        dataset_id: str,
        job_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await self._ensure_dataset_exists(cursor, project_id, dataset_id)
                return await self._get_dataset_export_job_payload_cursor(
                    cursor,
                    project_id,
                    dataset_id,
                    job_id,
                )

    async def mark_dataset_export_job_running(
        self,
        project_id: str,
        dataset_id: str,
        job_id: str,
    ) -> None:
        await self._execute_dataset_export_job_update(
            project_id,
            dataset_id,
            job_id,
            """
            status = 'RUNNING',
            started_at = COALESCE(started_at, NOW()),
            update_date = NOW()
            """,
            {},
        )

    async def mark_dataset_export_job_succeeded(
        self,
        project_id: str,
        dataset_id: str,
        job_id: str,
        *,
        total_count: int,
        file_name: str,
        file_path: str,
        file_size: int,
    ) -> None:
        await self._execute_dataset_export_job_update(
            project_id,
            dataset_id,
            job_id,
            """
            status = 'SUCCEEDED',
            total_count = %(total_count)s,
            exported_count = %(total_count)s,
            file_name = %(file_name)s,
            file_path = %(file_path)s,
            file_size = %(file_size)s,
            error_message = '',
            completed_at = NOW(),
            update_date = NOW()
            """,
            {
                "total_count": total_count,
                "file_name": file_name,
                "file_path": file_path,
                "file_size": file_size,
            },
        )

    async def mark_dataset_export_job_failed(
        self,
        project_id: str,
        dataset_id: str,
        job_id: str,
        error_message: str,
    ) -> None:
        await self._execute_dataset_export_job_update(
            project_id,
            dataset_id,
            job_id,
            """
            status = 'FAILED',
            error_message = %(error_message)s,
            completed_at = NOW(),
            update_date = NOW()
            """,
            {"error_message": error_message[:1000]},
        )

    async def create_annotation_export_job_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
        *,
        scope: str,
        export_format: str,
        filters: dict[str, Any],
        item_ids: list[str],
        split_metadata: bool,
        file_name: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        job_id = _new_langfuse_id("paexport")
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        metadata = {
            "filters": filters,
            "itemIds": item_ids,
            "splitMetadata": split_metadata,
            "defaultFileName": file_name,
            "fileName": file_name,
        }
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await self._get_annotation_queue_row(cursor, project_id, queue_id)
                await cursor.execute(
                    """
                    INSERT INTO pa_annotation_export_jobs (
                        create_by,
                        update_by,
                        id,
                        project_id,
                        queue_id,
                        scope,
                        format,
                        status,
                        file_name,
                        expires_at,
                        metadata
                    )
                    VALUES (
                        %(user_id)s,
                        %(user_id)s,
                        %(id)s,
                        %(project_id)s,
                        %(queue_id)s,
                        %(scope)s,
                        %(format)s,
                        'PENDING',
                        %(file_name)s,
                        %(expires_at)s,
                        %(metadata)s
                    )
                    """,
                    {
                        "id": job_id,
                        "project_id": project_id,
                        "queue_id": queue_id,
                        "user_id": user_id,
                        "scope": scope,
                        "format": export_format,
                        "file_name": file_name,
                        "expires_at": expires_at,
                        "metadata": Jsonb(metadata),
                    },
                )
                return await self._get_annotation_export_job_payload_cursor(
                    cursor,
                    project_id,
                    queue_id,
                    job_id,
                )

    async def create_trace_bulk_job_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        job_id = _new_langfuse_id("patracejob")
        expires_at = datetime.now(timezone.utc) + timedelta(hours=2)
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    INSERT INTO pa_trace_bulk_jobs (
                        create_by,
                        update_by,
                        id,
                        project_id,
                        user_id,
                        job_type,
                        status,
                        selection_type,
                        selection_payload,
                        operation_payload,
                        result_payload,
                        total_count,
                        expires_at
                    )
                    VALUES (
                        %(user_id)s,
                        %(user_id)s,
                        %(id)s,
                        %(project_id)s,
                        %(user_id)s,
                        %(job_type)s,
                        'PENDING',
                        %(selection_type)s,
                        %(selection_payload)s,
                        %(operation_payload)s,
                        %(result_payload)s,
                        %(total_count)s,
                        %(expires_at)s
                    )
                    RETURNING *
                    """,
                    {
                        "id": job_id,
                        "project_id": project_id,
                        "user_id": user_id,
                        "job_type": payload["jobType"],
                        "selection_type": payload["selectionType"],
                        "selection_payload": Jsonb(payload["selectionPayload"]),
                        "operation_payload": Jsonb(payload["operationPayload"]),
                        "result_payload": Jsonb(payload.get("resultPayload") or {}),
                        "total_count": int(payload.get("totalCount") or 0),
                        "expires_at": expires_at,
                    },
                )
                row = await cursor.fetchone()

        assert row is not None
        return self._to_trace_bulk_job_payload(row)

    async def get_trace_bulk_job_for_user(
        self,
        project_id: str,
        user_id: str,
        job_id: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    SELECT *
                    FROM pa_trace_bulk_jobs
                    WHERE id = %(job_id)s
                      AND project_id = %(project_id)s
                      AND user_id = %(user_id)s
                      AND expires_at > NOW()
                    LIMIT 1
                    """,
                    {
                        "job_id": job_id,
                        "project_id": project_id,
                        "user_id": user_id,
                    },
                )
                row = await cursor.fetchone()

        if row is None:
            raise BusinessError(1033, "批量任务不存在或已过期", 404)
        return self._to_trace_bulk_job_payload(row)

    async def claim_trace_bulk_job(
        self,
        job_id: str,
        lock_owner: str,
        lease_seconds: int,
    ) -> dict[str, Any] | None:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        lease_until = datetime.now(timezone.utc) + timedelta(seconds=lease_seconds)
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    WITH candidate AS (
                        SELECT id
                        FROM pa_trace_bulk_jobs
                        WHERE id = %(job_id)s
                          AND expires_at > NOW()
                          AND (
                              status = 'PENDING'
                              OR (
                                  status = 'RUNNING'
                                  AND (lock_until IS NULL OR lock_until < NOW())
                              )
                          )
                        FOR UPDATE SKIP LOCKED
                    )
                    UPDATE pa_trace_bulk_jobs job
                    SET
                        status = 'RUNNING',
                        lock_owner = %(lock_owner)s,
                        lock_until = %(lease_until)s,
                        attempt_count = attempt_count + 1,
                        started_at = COALESCE(started_at, NOW()),
                        update_by = %(lock_owner)s,
                        update_date = NOW()
                    FROM candidate
                    WHERE job.id = candidate.id
                    RETURNING job.*
                    """,
                    {
                        "job_id": job_id,
                        "lock_owner": lock_owner,
                        "lease_until": lease_until,
                    },
                )
                row = await cursor.fetchone()

        return self._to_trace_bulk_job_payload(row) if row else None

    async def claim_trace_bulk_jobs(
        self,
        lock_owner: str,
        lease_seconds: int,
        limit: int,
    ) -> list[dict[str, Any]]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        lease_until = datetime.now(timezone.utc) + timedelta(seconds=lease_seconds)
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    WITH candidates AS (
                        SELECT id
                        FROM pa_trace_bulk_jobs
                        WHERE expires_at > NOW()
                          AND (
                              status = 'PENDING'
                              OR (
                                  status = 'RUNNING'
                                  AND (lock_until IS NULL OR lock_until < NOW())
                              )
                          )
                        ORDER BY create_date ASC, id ASC
                        FOR UPDATE SKIP LOCKED
                        LIMIT %(limit)s
                    )
                    UPDATE pa_trace_bulk_jobs job
                    SET
                        status = 'RUNNING',
                        lock_owner = %(lock_owner)s,
                        lock_until = %(lease_until)s,
                        attempt_count = attempt_count + 1,
                        started_at = COALESCE(started_at, NOW()),
                        update_by = %(lock_owner)s,
                        update_date = NOW()
                    FROM candidates
                    WHERE job.id = candidates.id
                    RETURNING job.*
                    """,
                    {
                        "lock_owner": lock_owner,
                        "lease_until": lease_until,
                        "limit": max(1, limit),
                    },
                )
                rows = await cursor.fetchall()

        return [self._to_trace_bulk_job_payload(row) for row in rows]

    async def update_trace_bulk_job(
        self,
        job_id: str,
        lock_owner: str,
        updates: dict[str, Any],
        lease_seconds: int = 120,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        terminal = updates.get("status") in {"SUCCEEDED", "FAILED"}
        lease_until = None
        if not terminal:
            lease_until = datetime.now(timezone.utc) + timedelta(seconds=lease_seconds)
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    UPDATE pa_trace_bulk_jobs
                    SET
                        status = %(status)s,
                        operation_payload = %(operation_payload)s,
                        cursor_payload = %(cursor_payload)s,
                        result_payload = %(result_payload)s,
                        total_count = %(total_count)s,
                        completed_count = %(completed_count)s,
                        success_count = %(success_count)s,
                        failure_count = %(failure_count)s,
                        error_message = %(error_message)s,
                        completed_at = %(completed_at)s,
                        lock_owner = %(next_lock_owner)s,
                        lock_until = %(lock_until)s,
                        update_by = %(lock_owner)s,
                        update_date = NOW()
                    WHERE id = %(job_id)s
                      AND lock_owner = %(lock_owner)s
                    RETURNING *
                    """,
                    {
                        "job_id": job_id,
                        "lock_owner": lock_owner,
                        "status": updates.get("status") or "RUNNING",
                        "operation_payload": Jsonb(
                            updates.get("operationPayload") or {}
                        ),
                        "cursor_payload": Jsonb(updates.get("cursorPayload") or {}),
                        "result_payload": Jsonb(updates.get("resultPayload") or {}),
                        "total_count": int(updates.get("totalCount") or 0),
                        "completed_count": int(updates.get("completedCount") or 0),
                        "success_count": int(updates.get("successCount") or 0),
                        "failure_count": int(updates.get("failureCount") or 0),
                        "error_message": str(updates.get("errorMessage") or "")[:1000],
                        "completed_at": datetime.now(timezone.utc)
                        if terminal
                        else None,
                        "next_lock_owner": "" if terminal else lock_owner,
                        "lock_until": lease_until,
                    },
                )
                row = await cursor.fetchone()

        if row is None:
            raise BusinessError(1035, "批量任务租约已失效", 409)
        return self._to_trace_bulk_job_payload(row)

    async def get_annotation_export_job_for_user(
        self,
        project_id: str,
        queue_id: str,
        job_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await self._get_annotation_queue_row(cursor, project_id, queue_id)
                return await self._get_annotation_export_job_payload_cursor(
                    cursor,
                    project_id,
                    queue_id,
                    job_id,
                )

    async def mark_annotation_export_job_running(
        self,
        project_id: str,
        queue_id: str,
        job_id: str,
    ) -> None:
        await self._execute_annotation_export_job_update(
            project_id,
            queue_id,
            job_id,
            """
            status = 'RUNNING',
            started_at = COALESCE(started_at, NOW()),
            update_date = NOW()
            """,
            {},
            status_condition_sql="AND status = 'PENDING'",
        )

    async def mark_annotation_export_job_succeeded(
        self,
        project_id: str,
        queue_id: str,
        job_id: str,
        *,
        total_count: int,
        file_name: str,
        file_path: str,
        file_size: int,
    ) -> None:
        await self._execute_annotation_export_job_update(
            project_id,
            queue_id,
            job_id,
            """
            status = 'SUCCEEDED',
            total_count = %(total_count)s,
            exported_count = %(total_count)s,
            file_name = %(file_name)s,
            file_path = %(file_path)s,
            file_size = %(file_size)s,
            error_message = '',
            completed_at = NOW(),
            update_date = NOW()
            """,
            {
                "total_count": total_count,
                "file_name": file_name,
                "file_path": file_path,
                "file_size": file_size,
            },
            status_condition_sql="AND status IN ('PENDING', 'RUNNING')",
        )

    async def mark_annotation_export_job_failed(
        self,
        project_id: str,
        queue_id: str,
        job_id: str,
        error_message: str,
    ) -> None:
        await self._execute_annotation_export_job_update(
            project_id,
            queue_id,
            job_id,
            """
            status = 'FAILED',
            error_message = %(error_message)s,
            completed_at = NOW(),
            update_date = NOW()
            """,
            {"error_message": error_message[:1000]},
            status_condition_sql="AND status IN ('PENDING', 'RUNNING')",
        )

    async def list_score_configs_for_user(
        self,
        project_id: str,
        user_id: str,
        *,
        include_archived: bool = False,
    ) -> list[dict[str, Any]]:
        await self._ensure_project_visible(project_id, user_id)
        rows = await self._fetch_all(
            """
            SELECT
                id,
                project_id,
                name,
                data_type::text AS data_type,
                description,
                min_value,
                max_value,
                categories,
                is_archived,
                created_at,
                updated_at
            FROM score_configs
            WHERE project_id = %(project_id)s
              AND (%(include_archived)s IS TRUE OR is_archived IS FALSE)
            ORDER BY is_archived ASC, updated_at DESC, created_at DESC, id DESC
            """,
            {
                "project_id": project_id,
                "include_archived": include_archived,
            },
        )
        return [self._to_score_config_payload(row) for row in rows]

    async def ensure_default_score_config_for_user(
        self,
        project_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                score_config_ids = await self._ensure_default_score_configs(
                    cursor,
                    project_id,
                )
                await cursor.execute(
                    """
                    SELECT
                        id,
                        project_id,
                        name,
                        data_type::text AS data_type,
                        description,
                        min_value,
                        max_value,
                        categories,
                        is_archived,
                        created_at,
                        updated_at
                    FROM score_configs
                    WHERE project_id = %(project_id)s
                      AND id = %(score_config_id)s
                    LIMIT 1
                    """,
                    {
                        "project_id": project_id,
                        "score_config_id": score_config_ids[0],
                    },
                )
                row = await cursor.fetchone()

        if row is None:
            raise BusinessError(
                code=1024,
                message="评分指标不存在或无访问权限",
                status_code=400,
            )
        return self._to_score_config_payload(row)

    async def create_score_config_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        config_id = _new_langfuse_id("scorecfg")
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    INSERT INTO score_configs (
                        id,
                        project_id,
                        name,
                        data_type,
                        description,
                        min_value,
                        max_value,
                        categories,
                        is_archived,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        %(id)s,
                        %(project_id)s,
                        %(name)s,
                        %(data_type)s::"ScoreConfigDataType",
                        %(description)s,
                        %(min_value)s,
                        %(max_value)s,
                        %(categories)s,
                        FALSE,
                        NOW(),
                        NOW()
                    )
                    """,
                    {
                        "id": config_id,
                        "project_id": project_id,
                        **_score_config_storage_payload(payload),
                    },
                )
                return await self._get_score_config_payload_cursor(
                    cursor,
                    project_id,
                    config_id,
                )

    async def update_score_config_for_user(
        self,
        project_id: str,
        config_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    UPDATE score_configs
                    SET name = %(name)s,
                        data_type = %(data_type)s::"ScoreConfigDataType",
                        description = %(description)s,
                        min_value = %(min_value)s,
                        max_value = %(max_value)s,
                        categories = %(categories)s,
                        updated_at = NOW()
                    WHERE project_id = %(project_id)s
                      AND id = %(config_id)s
                    RETURNING id
                    """,
                    {
                        "project_id": project_id,
                        "config_id": config_id,
                        **_score_config_storage_payload(payload),
                    },
                )
                if await cursor.fetchone() is None:
                    raise BusinessError(1024, "评分指标不存在或无访问权限", 404)
                return await self._get_score_config_payload_cursor(
                    cursor,
                    project_id,
                    config_id,
                )

    async def set_score_config_archived_for_user(
        self,
        project_id: str,
        config_id: str,
        user_id: str,
        archived: bool,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    UPDATE score_configs
                    SET is_archived = %(archived)s,
                        updated_at = NOW()
                    WHERE project_id = %(project_id)s
                      AND id = %(config_id)s
                    RETURNING id
                    """,
                    {
                        "project_id": project_id,
                        "config_id": config_id,
                        "archived": archived,
                    },
                )
                if await cursor.fetchone() is None:
                    raise BusinessError(1024, "评分指标不存在或无访问权限", 404)
                return await self._get_score_config_payload_cursor(
                    cursor,
                    project_id,
                    config_id,
                )

    async def list_project_users_for_user(
        self,
        project_id: str,
        user_id: str,
    ) -> list[dict[str, Any]]:
        await self._ensure_project_visible(project_id, user_id)
        member_rows = await self._fetch_all(
            """
            SELECT DISTINCT
                u.id,
                u.name,
                u.email,
                COALESCE(
                    NULLIF(pm.role::text, 'NONE'),
                    NULLIF(om.role::text, 'NONE')
                ) AS role,
                om.role::text AS organization_role,
                pm.role::text AS project_role
            FROM projects p
            JOIN organization_memberships om ON om.org_id = p.org_id
            LEFT JOIN project_memberships pm
              ON pm.org_membership_id = om.id
             AND pm.project_id = p.id
            JOIN users u ON u.id = om.user_id
            WHERE p.id = %(project_id)s
              AND p.deleted_at IS NULL
              AND (
                om.role::text <> 'NONE'
                OR pm.role::text <> 'NONE'
              )
            ORDER BY u.name NULLS LAST, u.email NULLS LAST, u.id
            """,
            {"project_id": project_id},
        )
        invitation_rows = await self._fetch_all(
            """
            SELECT
                mi.id,
                mi.email,
                mi.org_role::text AS org_role,
                mi.project_role::text AS project_role,
                mi.created_at,
                u.name AS invited_by_name,
                u.email AS invited_by_email
            FROM membership_invitations mi
            LEFT JOIN users u ON u.id = mi.invited_by_user_id
            WHERE mi.project_id = %(project_id)s
              AND mi.project_role IS NOT NULL
              AND mi.project_role::text <> 'NONE'
            ORDER BY mi.created_at DESC, mi.email
            """,
            {"project_id": project_id},
        )
        return [
            *[self._to_project_user_payload(row) for row in member_rows],
            *[self._to_project_invitation_payload(row) for row in invitation_rows],
        ]

    async def create_project_member_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                project = await self._get_project_detail_for_user(
                    cursor,
                    project_id,
                    user_id,
                )
                actor_role = await self._get_actor_project_role_cursor(
                    cursor,
                    project_id,
                    project["org_id"],
                    user_id,
                )
                self._ensure_manager_role(actor_role, "当前角色不能管理项目成员")
                self._ensure_role_not_higher(
                    actor_role,
                    payload["role"],
                    "不能授予高于当前角色的项目角色",
                )
                member = await self._get_user_by_email_cursor(cursor, payload["email"])
                if member is None:
                    member = await self._ensure_user_by_email_cursor(
                        cursor,
                        _organization_member_account(payload),
                        payload["email"],
                    )
                org_membership = await self._ensure_project_org_membership(
                    cursor,
                    project["org_id"],
                    member["id"],
                )
                target_context = await self._get_project_member_context_cursor(
                    cursor,
                    project_id,
                    project["org_id"],
                    member["id"],
                )
                self._ensure_project_member_can_be_created(target_context)
                self._ensure_role_not_higher(
                    actor_role,
                    target_context["effective_role"],
                    "不能操作高于当前角色的项目成员",
                )
                await cursor.execute(
                    """
                    INSERT INTO project_memberships (
                        project_id,
                        user_id,
                        org_membership_id,
                        role,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        %(project_id)s,
                        %(user_id)s,
                        %(org_membership_id)s,
                        %(role)s::"Role",
                        NOW(),
                        NOW()
                    )
                    ON CONFLICT (project_id, user_id) DO UPDATE
                    SET role = EXCLUDED.role,
                        org_membership_id = EXCLUDED.org_membership_id,
                        updated_at = NOW()
                    """,
                    {
                        "project_id": project_id,
                        "user_id": member["id"],
                        "org_membership_id": org_membership["id"],
                        "role": payload["role"],
                    },
                )
                await cursor.execute(
                    """
                    DELETE FROM membership_invitations
                    WHERE org_id = %(organization_id)s
                      AND project_id = %(project_id)s
                      AND lower(email) = lower(%(email)s)
                    """,
                    {
                        "organization_id": project["org_id"],
                        "project_id": project_id,
                        "email": payload["email"],
                    },
                )
        return await self._get_project_user_for_user(project_id, member["id"], user_id)

    async def update_project_member_for_user(
        self,
        project_id: str,
        member_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                project = await self._get_project_detail_for_user(
                    cursor,
                    project_id,
                    user_id,
                )
                actor_role = await self._get_actor_project_role_cursor(
                    cursor,
                    project_id,
                    project["org_id"],
                    user_id,
                )
                self._ensure_manager_role(actor_role, "当前角色不能管理项目成员")
                target_context = await self._get_project_member_context_cursor(
                    cursor,
                    project_id,
                    project["org_id"],
                    member_id,
                )
                self._ensure_role_not_higher(
                    actor_role,
                    target_context["effective_role"],
                    "不能操作高于当前角色的项目成员",
                )
                if payload["role"] == "NONE":
                    await cursor.execute(
                        """
                        DELETE FROM project_memberships
                        WHERE project_id = %(project_id)s
                          AND user_id = %(member_id)s
                        """,
                        {"project_id": project_id, "member_id": member_id},
                    )
                    return await self._get_project_user_cursor(
                        cursor,
                        project_id,
                        member_id,
                    )

                self._ensure_role_not_higher(
                    actor_role,
                    payload["role"],
                    "不能授予高于当前角色的项目角色",
                )
                await cursor.execute(
                    """
                    INSERT INTO project_memberships (
                        project_id,
                        user_id,
                        org_membership_id,
                        role,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        %(project_id)s,
                        %(member_id)s,
                        %(org_membership_id)s,
                        %(role)s::"Role",
                        NOW(),
                        NOW()
                    )
                    ON CONFLICT (project_id, user_id) DO UPDATE
                    SET role = EXCLUDED.role,
                        org_membership_id = EXCLUDED.org_membership_id,
                        updated_at = NOW()
                    RETURNING user_id
                    """,
                    {
                        "project_id": project_id,
                        "member_id": member_id,
                        "org_membership_id": target_context["org_membership_id"],
                        "role": payload["role"],
                    },
                )
                if await cursor.fetchone() is None:
                    raise BusinessError(1025, "项目成员不存在", 404)
        return await self._get_project_user_for_user(project_id, member_id, user_id)

    async def delete_project_member_for_user(
        self,
        project_id: str,
        member_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                project = await self._get_project_detail_for_user(
                    cursor,
                    project_id,
                    user_id,
                )
                actor_role = await self._get_actor_project_role_cursor(
                    cursor,
                    project_id,
                    project["org_id"],
                    user_id,
                )
                self._ensure_manager_role(actor_role, "当前角色不能管理项目成员")
                target_context = await self._get_project_member_context_cursor(
                    cursor,
                    project_id,
                    project["org_id"],
                    member_id,
                )
                self._ensure_role_not_higher(
                    actor_role,
                    target_context["effective_role"],
                    "不能操作高于当前角色的项目成员",
                )
                await cursor.execute(
                    """
                    DELETE FROM project_memberships
                    WHERE project_id = %(project_id)s
                      AND user_id = %(member_id)s
                    RETURNING user_id
                    """,
                    {"project_id": project_id, "member_id": member_id},
                )
                deleted = await cursor.fetchone()
        if deleted is None:
            raise BusinessError(1025, "项目成员不存在", 404)
        return {"id": deleted["user_id"]}

    async def _get_project_user_for_user(
        self,
        project_id: str,
        member_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        await self._ensure_project_visible(project_id, user_id)
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                return await self._get_project_user_cursor(
                    cursor,
                    project_id,
                    member_id,
                )

    async def _get_project_user_cursor(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        member_id: str,
    ) -> dict[str, Any]:
        await cursor.execute(
            """
            SELECT DISTINCT
                u.id,
                u.name,
                u.email,
                COALESCE(
                    NULLIF(pm.role::text, 'NONE'),
                    NULLIF(om.role::text, 'NONE')
                ) AS role,
                om.role::text AS organization_role,
                pm.role::text AS project_role
            FROM projects p
            JOIN organization_memberships om ON om.org_id = p.org_id
            LEFT JOIN project_memberships pm
              ON pm.org_membership_id = om.id
             AND pm.project_id = p.id
            JOIN users u ON u.id = om.user_id
            WHERE p.id = %(project_id)s
              AND u.id = %(member_id)s
              AND p.deleted_at IS NULL
            LIMIT 1
            """,
            {"project_id": project_id, "member_id": member_id},
        )
        row = await cursor.fetchone()
        if row is None:
            raise BusinessError(1025, "项目成员不存在", 404)
        return self._to_project_user_payload(row)

    @staticmethod
    def _role_level(role: str | None) -> int:
        return ROLE_LEVELS.get(role, 0)

    @classmethod
    def _max_role(cls, *roles: str | None) -> str:
        return max(roles, key=cls._role_level) or "NONE"

    @classmethod
    def _ensure_manager_role(cls, actor_role: str | None, message: str) -> None:
        if cls._role_level(actor_role) < MANAGER_ROLE_LEVEL:
            raise BusinessError(1026, message, 403)

    @classmethod
    def _ensure_role_not_higher(
        cls,
        actor_role: str | None,
        target_role: str | None,
        message: str,
    ) -> None:
        if cls._role_level(target_role) > cls._role_level(actor_role):
            raise BusinessError(1027, message, 403)

    @classmethod
    def _ensure_project_member_can_be_created(
        cls,
        target_context: dict[str, Any],
    ) -> None:
        if cls._role_level(target_context.get("effective_role")) > ROLE_LEVELS["NONE"]:
            raise BusinessError(
                1029,
                "用户已在该项目中，请使用设置项目角色调整权限",
                409,
            )

    @classmethod
    def _ensure_project_can_be_created(
        cls,
        organization: dict[str, Any],
    ) -> None:
        cls._ensure_manager_role(
            organization.get("role"),
            "当前角色不能创建项目",
        )

    async def _get_actor_project_role_cursor(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        organization_id: str,
        actor_user_id: str,
    ) -> str:
        context = await self._get_project_member_context_cursor(
            cursor,
            project_id,
            organization_id,
            actor_user_id,
        )
        return context["effective_role"]

    async def _get_project_member_context_cursor(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        organization_id: str,
        member_id: str,
    ) -> dict[str, Any]:
        await cursor.execute(
            """
            SELECT
                om.id AS org_membership_id,
                om.user_id,
                om.role::text AS organization_role,
                pm.role::text AS project_role
            FROM organization_memberships om
            LEFT JOIN project_memberships pm
              ON pm.org_membership_id = om.id
             AND pm.project_id = %(project_id)s
            WHERE om.org_id = %(organization_id)s
              AND om.user_id = %(member_id)s
            LIMIT 1
            """,
            {
                "project_id": project_id,
                "organization_id": organization_id,
                "member_id": member_id,
            },
        )
        context = await cursor.fetchone()
        if context is None:
            raise BusinessError(1025, "项目成员不存在", 404)

        organization_role = context.get("organization_role")
        project_role = context.get("project_role")
        return {
            **context,
            "effective_role": self._max_role(organization_role, project_role),
        }

    async def _ensure_project_org_membership(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        organization_id: str,
        member_id: str,
    ) -> dict[str, Any]:
        await cursor.execute(
            """
            SELECT id, role::text AS role
            FROM organization_memberships
            WHERE org_id = %(organization_id)s
              AND user_id = %(member_id)s
            LIMIT 1
            """,
            {"organization_id": organization_id, "member_id": member_id},
        )
        existing = await cursor.fetchone()
        if existing is not None:
            return existing

        membership_id = _new_langfuse_id("orgmem")
        await cursor.execute(
            """
            INSERT INTO organization_memberships (
                id,
                org_id,
                user_id,
                role
            )
            VALUES (
                %(id)s,
                %(organization_id)s,
                %(member_id)s,
                'NONE'::"Role"
            )
            RETURNING id, role::text AS role
            """,
            {
                "id": membership_id,
                "organization_id": organization_id,
                "member_id": member_id,
            },
        )
        created = await cursor.fetchone()
        assert created is not None
        return created

    async def _ensure_project_invitation_can_be_created(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        organization_id: str,
        email: str,
    ) -> None:
        await cursor.execute(
            """
            SELECT id
            FROM membership_invitations
            WHERE org_id = %(organization_id)s
              AND lower(email) = lower(%(email)s)
            LIMIT 1
            """,
            {
                "organization_id": organization_id,
                "email": email,
            },
        )
        if await cursor.fetchone() is not None:
            raise BusinessError(
                1030,
                "该邮箱已有待处理邀请，请先处理现有邀请",
                409,
            )

    async def _get_project_invitation_cursor(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        invitation_id: str,
    ) -> dict[str, Any]:
        await cursor.execute(
            """
            SELECT
                mi.id,
                mi.email,
                mi.org_role::text AS org_role,
                mi.project_role::text AS project_role,
                mi.created_at,
                u.name AS invited_by_name,
                u.email AS invited_by_email
            FROM membership_invitations mi
            LEFT JOIN users u ON u.id = mi.invited_by_user_id
            WHERE mi.project_id = %(project_id)s
              AND mi.id = %(invitation_id)s
            LIMIT 1
            """,
            {
                "project_id": project_id,
                "invitation_id": invitation_id,
            },
        )
        row = await cursor.fetchone()
        if row is None:
            raise BusinessError(1031, "项目成员邀请不存在", 404)
        return self._to_project_invitation_payload(row)

    async def list_annotation_queues_for_user(
        self,
        project_id: str,
        user_id: str,
    ) -> list[dict[str, Any]]:
        await self._ensure_project_visible(project_id, user_id)
        rows = await self._fetch_all(
            self._annotation_queue_select_sql()
            + """
            WHERE aq.project_id = %(project_id)s
            ORDER BY aq.updated_at DESC, aq.created_at DESC, aq.id DESC
            """,
            {"project_id": project_id},
        )
        return [self._to_annotation_queue_payload(row) for row in rows]

    async def get_annotation_queue_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        await self._ensure_project_visible(project_id, user_id)
        rows = await self._fetch_all(
            self._annotation_queue_select_sql()
            + """
            WHERE aq.project_id = %(project_id)s
              AND aq.id = %(queue_id)s
            LIMIT 1
            """,
            {"project_id": project_id, "queue_id": queue_id},
        )
        if not rows:
            raise BusinessError(
                code=1021,
                message="人工标注任务不存在或无访问权限",
                status_code=404,
            )
        return self._to_annotation_queue_payload(rows[0])

    async def create_annotation_queue_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        queue_id = _new_langfuse_id("annqueue")
        try:
            async with await connect_postgres(
                self._database_url,
                row_factory=dict_row,
            ) as connection:
                async with connection.cursor() as cursor:
                    await self._get_project_for_user(cursor, project_id, user_id)
                    await self._validate_score_configs(
                        cursor,
                        project_id,
                        payload["scoreConfigIds"],
                    )
                    await cursor.execute(
                        """
                        INSERT INTO annotation_queues (
                            id,
                            project_id,
                            name,
                            description,
                            score_config_ids,
                            created_at,
                            updated_at
                        )
                        VALUES (
                            %(id)s,
                            %(project_id)s,
                            %(name)s,
                            %(description)s,
                            %(score_config_ids)s,
                            NOW(),
                            NOW()
                        )
                        """,
                        {
                            "id": queue_id,
                            "project_id": project_id,
                            "name": payload["name"],
                            "description": payload.get("description") or "",
                            "score_config_ids": payload["scoreConfigIds"],
                        },
                    )
                    await self._replace_annotation_assignments(
                        cursor,
                        project_id,
                        queue_id,
                        payload.get("assigneeIds") or [],
                    )
                    await self._upsert_annotation_queue_settings(
                        cursor,
                        project_id,
                        queue_id,
                        user_id,
                        payload,
                    )
        except psycopg.errors.UniqueViolation as exc:
            raise BusinessError(
                code=1022,
                message="人工标注任务名称已存在",
                status_code=409,
            ) from exc

        return await self.get_annotation_queue_for_user(project_id, queue_id, user_id)

    async def is_annotation_queue_name_available_for_user(
        self,
        project_id: str,
        user_id: str,
        name: str,
    ) -> bool:
        await self._ensure_project_visible(project_id, user_id)
        rows = await self._fetch_all(
            """
            SELECT NOT EXISTS (
                SELECT 1
                FROM annotation_queues
                WHERE project_id = %(project_id)s
                  AND name = %(name)s
            ) AS available
            """,
            {"project_id": project_id, "name": name},
        )
        return bool(rows and rows[0].get("available"))

    async def update_annotation_queue_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        try:
            async with await connect_postgres(
                self._database_url,
                row_factory=dict_row,
            ) as connection:
                async with connection.cursor() as cursor:
                    await self._get_project_for_user(cursor, project_id, user_id)
                    await self._validate_score_configs(
                        cursor,
                        project_id,
                        payload["scoreConfigIds"],
                    )
                    await cursor.execute(
                        """
                        UPDATE annotation_queues
                        SET
                            name = %(name)s,
                            description = %(description)s,
                            score_config_ids = %(score_config_ids)s,
                            updated_at = NOW()
                        WHERE id = %(id)s
                          AND project_id = %(project_id)s
                        RETURNING id
                        """,
                        {
                            "id": queue_id,
                            "project_id": project_id,
                            "name": payload["name"],
                            "description": payload.get("description") or "",
                            "score_config_ids": payload["scoreConfigIds"],
                        },
                    )
                    updated = await cursor.fetchone()
                    if updated is None:
                        raise BusinessError(
                            code=1021,
                            message="人工标注任务不存在或无访问权限",
                            status_code=404,
                        )
                    await self._replace_annotation_assignments(
                        cursor,
                        project_id,
                        queue_id,
                        payload.get("assigneeIds") or [],
                    )
                    await self._upsert_annotation_queue_settings(
                        cursor,
                        project_id,
                        queue_id,
                        user_id,
                        payload,
                    )
        except psycopg.errors.UniqueViolation as exc:
            raise BusinessError(
                code=1022,
                message="人工标注任务名称已存在",
                status_code=409,
            ) from exc

        return await self.get_annotation_queue_for_user(project_id, queue_id, user_id)

    async def delete_annotation_queue_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
    ) -> None:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    DELETE FROM annotation_queue_assignments
                    WHERE project_id = %(project_id)s
                      AND queue_id = %(queue_id)s
                    """,
                    {"project_id": project_id, "queue_id": queue_id},
                )
                await cursor.execute(
                    """
                    DELETE FROM annotation_queue_items
                    WHERE project_id = %(project_id)s
                      AND queue_id = %(queue_id)s
                    """,
                    {"project_id": project_id, "queue_id": queue_id},
                )
                await cursor.execute(
                    """
                    DELETE FROM pa_annotation_queue_item_assignments
                    WHERE project_id = %(project_id)s
                      AND queue_id = %(queue_id)s
                    """,
                    {"project_id": project_id, "queue_id": queue_id},
                )
                await cursor.execute(
                    """
                    DELETE FROM pa_annotation_queue_settings
                    WHERE project_id = %(project_id)s
                      AND queue_id = %(queue_id)s
                    """,
                    {"project_id": project_id, "queue_id": queue_id},
                )
                await cursor.execute(
                    """
                    DELETE FROM annotation_queues
                    WHERE project_id = %(project_id)s
                      AND id = %(queue_id)s
                    RETURNING id
                    """,
                    {"project_id": project_id, "queue_id": queue_id},
                )
                deleted = await cursor.fetchone()

        if deleted is None:
            raise BusinessError(
                code=1021,
                message="人工标注任务不存在或无访问权限",
                status_code=404,
            )

    async def get_annotation_queue_metrics_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        queue = await self.get_annotation_queue_for_user(project_id, queue_id, user_id)
        total = queue["completedCount"] + queue["pendingCount"]
        return {
            "total": total,
            "pending": queue["pendingCount"],
            "completed": queue["completedCount"],
            "completionRate": round((queue["completedCount"] / total) * 100)
            if total
            else 0,
            "updatedAt": queue["updatedAt"],
        }

    async def list_annotation_queue_items_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
    ) -> list[dict[str, Any]]:
        await self.get_annotation_queue_for_user(project_id, queue_id, user_id)
        rows = await self._fetch_all(
            self._annotation_item_select_sql()
            + """
            WHERE aqi.project_id = %(project_id)s
              AND aqi.queue_id = %(queue_id)s
            ORDER BY aqi.updated_at DESC, aqi.created_at DESC, aqi.id DESC
            """,
            {"project_id": project_id, "queue_id": queue_id},
        )
        return [self._to_annotation_item_payload(row) for row in rows]

    async def iter_annotation_queue_items_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
        *,
        batch_size: int = 500,
        include_details: bool = False,
        include_source: bool = False,
        include_assignment: bool = False,
        include_has_scores: bool = False,
    ) -> AsyncIterator[list[dict[str, Any]]]:
        """Scan a queue in stable descending order without OFFSET/full materialization."""
        await self.get_annotation_queue_for_user(project_id, queue_id, user_id)
        cursor_values: tuple[Any, Any, str] | None = None
        while True:
            params: dict[str, Any] = {
                "project_id": project_id,
                "queue_id": queue_id,
                "limit": batch_size,
            }
            seek_sql = ""
            if cursor_values is not None:
                params.update(
                    {
                        "cursor_updated_at": cursor_values[0],
                        "cursor_created_at": cursor_values[1],
                        "cursor_id": cursor_values[2],
                    }
                )
                seek_sql = """
                  AND (aqi.updated_at, aqi.created_at, aqi.id) < (
                    %(cursor_updated_at)s,
                    %(cursor_created_at)s,
                    %(cursor_id)s
                  )
                """
            select_sql = (
                self._annotation_item_select_sql()
                if include_details
                else self._annotation_item_candidate_select_sql(
                    include_source=include_source,
                    include_assignment=include_assignment,
                    include_has_scores=include_has_scores,
                )
            )
            rows = await self._fetch_all(
                select_sql
                + f"""
                WHERE aqi.project_id = %(project_id)s
                  AND aqi.queue_id = %(queue_id)s
                  {seek_sql}
                ORDER BY aqi.updated_at DESC, aqi.created_at DESC, aqi.id DESC
                LIMIT %(limit)s
                """,
                params,
            )
            if not rows:
                return
            yield [self._to_annotation_item_payload(row) for row in rows]
            last = rows[-1]
            cursor_values = (
                last["updated_at"],
                last["created_at"],
                str(last["id"]),
            )
            if len(rows) < batch_size:
                return

    async def list_annotation_queue_items_by_ids_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
        item_ids: list[str],
    ) -> list[dict[str, Any]]:
        if not item_ids:
            return []
        await self.get_annotation_queue_for_user(project_id, queue_id, user_id)
        rows = await self._fetch_all(
            self._annotation_item_select_sql()
            + """
            WHERE aqi.project_id = %(project_id)s
              AND aqi.queue_id = %(queue_id)s
              AND aqi.id = ANY(%(item_ids)s)
            """,
            {"project_id": project_id, "queue_id": queue_id, "item_ids": item_ids},
        )
        row_by_id = {str(row["id"]): row for row in rows}
        return [
            self._to_annotation_item_payload(row_by_id[item_id])
            for item_id in item_ids
            if item_id in row_by_id
        ]

    async def list_annotation_queue_items_page_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
        *,
        page: int,
        page_size: int,
        filters: dict[str, Any],
    ) -> dict[str, Any]:
        await self.get_annotation_queue_for_user(project_id, queue_id, user_id)
        filter_sql, filter_params = self._annotation_item_filter_sql(filters)
        params = {
            "project_id": project_id,
            "queue_id": queue_id,
            "limit": page_size,
            "offset": (page - 1) * page_size,
            **filter_params,
        }
        source_filters = bool(
            filters.get("keyword")
            or filters.get("metadata_filter")
            or filters.get("metadata_filters")
            or filters.get("input_filters")
            or filters.get("output_filters")
        )
        candidate_base_sql = (
            "WITH annotation_items AS ("
            + self._annotation_item_candidate_select_sql(
                include_source=source_filters,
                include_assignment=bool(filters.get("assignee_ids")),
                include_has_scores=filters.get("has_scores") is not None,
            )
            + """
            WHERE aqi.project_id = %(project_id)s
              AND aqi.queue_id = %(queue_id)s
            )
            """
        )
        total_rows = await self._fetch_all(
            candidate_base_sql
            + f"""
            SELECT COUNT(*)::int AS total
            FROM annotation_items item
            WHERE {filter_sql}
            """,
            params,
        )
        candidate_rows = await self._fetch_all(
            candidate_base_sql
            + f"""
            SELECT item.id
            FROM annotation_items item
            WHERE {filter_sql}
            ORDER BY item.updated_at DESC, item.created_at DESC, item.id DESC
            LIMIT %(limit)s OFFSET %(offset)s
            """,
            params,
        )
        page_ids = [str(row["id"]) for row in candidate_rows]
        if not page_ids:
            rows: list[dict[str, Any]] = []
        else:
            rows = await self._fetch_all(
                self._annotation_item_select_sql()
                + """
                WHERE aqi.project_id = %(project_id)s
                  AND aqi.queue_id = %(queue_id)s
                  AND aqi.id = ANY(%(page_item_ids)s)
                """,
                {
                    "project_id": project_id,
                    "queue_id": queue_id,
                    "page_item_ids": page_ids,
                },
            )
            row_by_id = {str(row["id"]): row for row in rows}
            rows = [row_by_id[item_id] for item_id in page_ids if item_id in row_by_id]
        return {
            "total": int((total_rows[0] if total_rows else {}).get("total") or 0),
            "datas": [self._to_annotation_item_payload(row) for row in rows],
        }

    async def count_annotation_queue_item_filters_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
        *,
        filters: dict[str, Any],
    ) -> dict[str, dict[str, int]]:
        await self.get_annotation_queue_for_user(project_id, queue_id, user_id)
        base_sql = (
            "WITH annotation_items AS ("
            + self._annotation_item_candidate_select_sql(
                include_source=bool(
                    filters.get("keyword")
                    or filters.get("metadata_filter")
                    or filters.get("metadata_filters")
                    or filters.get("input_filters")
                    or filters.get("output_filters")
                ),
                include_assignment=True,
                include_has_scores=filters.get("has_scores") is not None,
            )
            + """
            WHERE aqi.project_id = %(project_id)s
              AND aqi.queue_id = %(queue_id)s
            )
            """
        )
        counts: dict[str, dict[str, int]] = {}
        for response_key, field, omitted_filter in (
            ("status", "status", "status"),
            ("objectType", "object_type", "object_type"),
            ("assigneeIds", "assignee_id", "assignee_ids"),
        ):
            filter_sql, filter_params = self._annotation_item_filter_sql(
                filters,
                omitted_filter=omitted_filter,
            )
            rows = await self._fetch_all(
                base_sql
                + f"""
                SELECT item.{field} AS value, COUNT(*)::int AS total
                FROM annotation_items item
                WHERE {filter_sql}
                  AND item.{field} IS NOT NULL
                  AND item.{field} <> ''
                GROUP BY item.{field}
                """,
                {
                    "project_id": project_id,
                    "queue_id": queue_id,
                    **filter_params,
                },
            )
            counts[response_key] = {
                str(row["value"]): int(row.get("total") or 0) for row in rows
            }
        for status in ("PENDING", "COMPLETED"):
            counts["status"].setdefault(status, 0)
        for object_type in ("TRACE", "OBSERVATION", "SESSION"):
            counts["objectType"].setdefault(object_type, 0)
        return counts

    async def get_annotation_queue_item_for_user(
        self,
        project_id: str,
        queue_id: str,
        item_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        await self.get_annotation_queue_for_user(project_id, queue_id, user_id)
        rows = await self._fetch_all(
            self._annotation_item_select_sql()
            + """
            WHERE aqi.project_id = %(project_id)s
              AND aqi.queue_id = %(queue_id)s
              AND aqi.id = %(item_id)s
            LIMIT 1
            """,
            {
                "project_id": project_id,
                "queue_id": queue_id,
                "item_id": item_id,
            },
        )
        if not rows:
            raise BusinessError(
                code=1023,
                message="标注数据不存在或无访问权限",
                status_code=404,
            )
        return self._to_annotation_item_payload(rows[0])

    async def create_annotation_queue_item_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        item_id = _new_langfuse_id("annitem")
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                queue = await self._get_annotation_queue_row(
                    cursor, project_id, queue_id
                )
                await cursor.execute(
                    """
                    SELECT id
                    FROM annotation_queue_items
                    WHERE project_id = %(project_id)s
                      AND queue_id = %(queue_id)s
                      AND object_id = %(object_id)s
                      AND object_type::text = %(object_type)s
                    LIMIT 1
                    """,
                    {
                        "project_id": project_id,
                        "queue_id": queue_id,
                        "object_id": payload["objectId"],
                        "object_type": payload["objectType"],
                    },
                )
                existing = await cursor.fetchone()
                if existing is not None:
                    item_id = existing["id"]
                else:
                    await cursor.execute(
                        """
                        INSERT INTO annotation_queue_items (
                            id,
                            project_id,
                            queue_id,
                            object_id,
                            object_type,
                            status,
                            created_at,
                            updated_at
                        )
                        VALUES (
                            %(id)s,
                            %(project_id)s,
                            %(queue_id)s,
                            %(object_id)s,
                            %(object_type)s::"AnnotationQueueObjectType",
                            'PENDING'::"AnnotationQueueStatus",
                            NOW(),
                            NOW()
                        )
                        """,
                        {
                            "id": item_id,
                            "project_id": project_id,
                            "queue_id": queue_id,
                            "object_id": payload["objectId"],
                            "object_type": payload["objectType"],
                        },
                    )
                    await self._assign_annotation_queue_items(
                        cursor,
                        project_id,
                        queue_id,
                        user_id,
                        [item_id],
                    )
                    await _copy_existing_annotation_scores_for_item(
                        cursor,
                        project_id=project_id,
                        queue_id=queue_id,
                        item_id=item_id,
                        object_id=payload["objectId"],
                        object_type=payload["objectType"],
                        score_config_ids=queue.get("score_config_ids") or [],
                    )

        return await self.get_annotation_queue_item_for_user(
            project_id,
            queue_id,
            item_id,
            user_id,
        )

    async def delete_annotation_queue_items_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
        item_ids: list[str],
    ) -> list[str]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await self._get_annotation_queue_row(cursor, project_id, queue_id)
                await cursor.execute(
                    """
                    DELETE FROM annotation_queue_items
                    WHERE project_id = %(project_id)s
                      AND queue_id = %(queue_id)s
                      AND id = ANY(%(item_ids)s)
                    RETURNING id
                    """,
                    {
                        "project_id": project_id,
                        "queue_id": queue_id,
                        "item_ids": item_ids,
                    },
                )
                rows = list(await cursor.fetchall())
                deleted_ids = [row["id"] for row in rows]
                if deleted_ids:
                    await cursor.execute(
                        """
                        DELETE FROM pa_annotation_queue_item_assignments
                        WHERE project_id = %(project_id)s
                          AND queue_id = %(queue_id)s
                          AND item_id = ANY(%(item_ids)s)
                        """,
                        {
                            "project_id": project_id,
                            "queue_id": queue_id,
                            "item_ids": deleted_ids,
                        },
                    )

        return deleted_ids

    async def update_annotation_queue_item_assignees_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
        item_ids: list[str],
        assignee_user_id: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        unique_item_ids = list(dict.fromkeys(item_ids))
        project_users = await self.list_project_users_for_user(project_id, user_id)
        active_user_ids = {
            user["id"] for user in project_users if user.get("status") != "pending"
        }
        if assignee_user_id not in active_user_ids:
            raise BusinessError(
                code=1025,
                message="处理人不存在或无访问权限",
                status_code=404,
            )

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await self._get_annotation_queue_row(cursor, project_id, queue_id)
                await cursor.execute(
                    """
                    SELECT id, status::text AS status
                    FROM annotation_queue_items
                    WHERE project_id = %(project_id)s
                      AND queue_id = %(queue_id)s
                      AND id = ANY(%(item_ids)s)
                    """,
                    {
                        "project_id": project_id,
                        "queue_id": queue_id,
                        "item_ids": unique_item_ids,
                    },
                )
                rows_by_id = {row["id"]: row for row in await cursor.fetchall()}
                updated_item_ids = [
                    item_id
                    for item_id in unique_item_ids
                    if rows_by_id.get(item_id, {}).get("status") == "PENDING"
                ]
                skipped_item_ids = [
                    item_id
                    for item_id in unique_item_ids
                    if rows_by_id.get(item_id, {}).get("status") == "COMPLETED"
                ]

                for item_id in updated_item_ids:
                    await cursor.execute(
                        """
                        INSERT INTO pa_annotation_queue_item_assignments (
                            create_by,
                            update_by,
                            id,
                            project_id,
                            queue_id,
                            item_id,
                            assignee_user_id
                        )
                        VALUES (
                            %(user_id)s,
                            %(user_id)s,
                            %(id)s,
                            %(project_id)s,
                            %(queue_id)s,
                            %(item_id)s,
                            %(assignee_user_id)s
                        )
                        ON CONFLICT (project_id, queue_id, item_id)
                        DO UPDATE SET
                            update_by = EXCLUDED.update_by,
                            update_date = NOW(),
                            assignee_user_id = EXCLUDED.assignee_user_id
                        """,
                        {
                            "user_id": user_id,
                            "id": _new_langfuse_id("paannassign"),
                            "project_id": project_id,
                            "queue_id": queue_id,
                            "item_id": item_id,
                            "assignee_user_id": assignee_user_id,
                        },
                    )

                if updated_item_ids:
                    await cursor.execute(
                        """
                        UPDATE annotation_queues
                        SET updated_at = NOW()
                        WHERE project_id = %(project_id)s
                          AND id = %(queue_id)s
                        """,
                        {"project_id": project_id, "queue_id": queue_id},
                    )

        return {
            "assigneeUserId": assignee_user_id,
            "requestedCount": len(unique_item_ids),
            "updatedCount": len(updated_item_ids),
            "skippedCount": len(skipped_item_ids),
            "updatedItemIds": updated_item_ids,
            "skippedItemIds": skipped_item_ids,
        }

    async def create_trace_annotation_task_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        trace_ids = list(dict.fromkeys(payload.get("traceIds") or []))
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                score_config_ids = await self._ensure_default_score_configs(
                    cursor,
                    project_id,
                )
                queue_id = payload.get("queueId")
                if queue_id:
                    queue = await self._get_annotation_queue_row(
                        cursor, project_id, queue_id
                    )
                    score_config_ids = queue.get("score_config_ids") or []
                else:
                    queue_name = payload.get("queueName") or "Trace 人工标注"
                    queue_id = await self._get_or_create_annotation_queue(
                        cursor,
                        project_id,
                        queue_name,
                        score_config_ids,
                        user_id,
                    )
                    queue = await self._get_annotation_queue_row(
                        cursor, project_id, queue_id
                    )
                    score_config_ids = queue.get("score_config_ids") or []
                if payload.get("assigneeIds"):
                    await self._replace_annotation_assignments(
                        cursor,
                        project_id,
                        queue_id,
                        payload.get("assigneeIds") or [],
                    )
                    await self._upsert_annotation_queue_settings(
                        cursor,
                        project_id,
                        queue_id,
                        user_id,
                        payload,
                    )

                await cursor.execute(
                    """
                    SELECT object_id
                    FROM annotation_queue_items
                    WHERE project_id = %(project_id)s
                      AND queue_id = %(queue_id)s
                      AND object_id = ANY(%(trace_ids)s)
                      AND object_type::text = 'TRACE'
                    """,
                    {
                        "project_id": project_id,
                        "queue_id": queue_id,
                        "trace_ids": trace_ids,
                    },
                )
                existing_trace_ids = {
                    str(row.get("object_id") or "") for row in await cursor.fetchall()
                }
                trace_ids_to_create = [
                    trace_id
                    for trace_id in trace_ids
                    if trace_id not in existing_trace_ids
                ]

                created_item_ids: list[str] = []
                created_items: list[dict[str, str]] = []
                for batch in _chunk_items(trace_ids_to_create, 500):
                    values_sql: list[str] = []
                    params: dict[str, Any] = {
                        "project_id": project_id,
                        "queue_id": queue_id,
                    }
                    batch_items: list[dict[str, str]] = []
                    for index, trace_id in enumerate(batch):
                        item_id = _new_langfuse_id("annitem")
                        params[f"id_{index}"] = item_id
                        params[f"trace_id_{index}"] = trace_id
                        values_sql.append(
                            f"""
                            (
                                %(id_{index})s,
                                %(project_id)s,
                                %(queue_id)s,
                                %(trace_id_{index})s,
                                'TRACE'::"AnnotationQueueObjectType",
                                'PENDING'::"AnnotationQueueStatus",
                                NOW(),
                                NOW()
                            )
                            """
                        )
                        batch_items.append({"itemId": item_id, "traceId": trace_id})

                    await cursor.execute(
                        f"""
                        INSERT INTO annotation_queue_items (
                            id,
                            project_id,
                            queue_id,
                            object_id,
                            object_type,
                            status,
                            created_at,
                            updated_at
                        )
                        VALUES {", ".join(values_sql)}
                        """,
                        params,
                    )
                    created_item_ids.extend(item["itemId"] for item in batch_items)
                    created_items.extend(batch_items)

                await _copy_existing_annotation_scores_for_items(
                    cursor,
                    project_id=project_id,
                    queue_id=queue_id,
                    items=[
                        {
                            "itemId": item["itemId"],
                            "objectId": item["traceId"],
                            "objectType": "TRACE",
                        }
                        for item in created_items
                    ],
                    score_config_ids=score_config_ids,
                )

                await self._assign_annotation_queue_items(
                    cursor,
                    project_id,
                    queue_id,
                    user_id,
                    created_item_ids,
                )

                await cursor.execute(
                    """
                    UPDATE annotation_queues
                    SET updated_at = NOW()
                    WHERE project_id = %(project_id)s
                      AND id = %(queue_id)s
                    """,
                    {"project_id": project_id, "queue_id": queue_id},
                )

                return {
                    "queueId": queue_id,
                    "createdCount": len(created_items),
                    "skippedCount": len(existing_trace_ids),
                    "createdItems": created_items,
                    "scoreConfigIds": score_config_ids,
                }

    async def save_annotation_scores_for_user(
        self,
        project_id: str,
        queue_id: str,
        item_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        await self.prepare_annotation_score_payloads_for_user(
            project_id,
            queue_id,
            item_id,
            user_id,
            payload,
        )
        return await self.complete_annotation_queue_item_for_user(
            project_id,
            queue_id,
            item_id,
            user_id,
        )

    async def prepare_annotation_score_payloads_for_user(
        self,
        project_id: str,
        queue_id: str,
        item_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> list[dict[str, Any]]:
        return await self.prepare_annotation_score_payloads_batch_for_user(
            project_id,
            queue_id,
            user_id,
            [{"itemId": item_id, "scorePayload": payload}],
        )

    async def prepare_annotation_score_payloads_batch_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
        items: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()
        item_ids = list(
            dict.fromkeys(
                str(item.get("itemId") or "") for item in items if item.get("itemId")
            )
        )
        if not item_ids:
            return []

        score_payloads: list[dict[str, Any]] = []
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    SELECT
                        aqi.id,
                        aqi.object_id,
                        aqi.object_type::text AS object_type,
                        aq.score_config_ids,
                        o.trace_id AS observation_trace_id
                    FROM annotation_queue_items aqi
                    JOIN annotation_queues aq
                      ON aq.project_id = aqi.project_id
                     AND aq.id = aqi.queue_id
                    LEFT JOIN observations o
                      ON aqi.object_type::text = 'OBSERVATION'
                     AND o.project_id = aqi.project_id
                     AND o.id = aqi.object_id
                    WHERE aqi.project_id = %(project_id)s
                      AND aqi.queue_id = %(queue_id)s
                      AND aqi.id = ANY(%(item_ids)s)
                    """,
                    {
                        "project_id": project_id,
                        "queue_id": queue_id,
                        "item_ids": item_ids,
                    },
                )
                item_rows = list(await cursor.fetchall())
                item_by_id = {str(item["id"]): item for item in item_rows}
                missing_item_ids = [
                    item_id for item_id in item_ids if item_id not in item_by_id
                ]
                if missing_item_ids:
                    raise BusinessError(1023, "标注数据不存在或无访问权限", 404)

                requested_config_ids = list(
                    dict.fromkeys(
                        str(score.get("configId") or "")
                        for item in items
                        for score in (item.get("scorePayload") or {}).get("scores")
                        or []
                        if score.get("configId")
                    )
                )
                await cursor.execute(
                    """
                    SELECT
                        id,
                        name,
                        data_type::text AS data_type,
                        min_value,
                        max_value,
                        categories,
                        is_archived
                    FROM score_configs
                    WHERE project_id = %(project_id)s
                      AND id = ANY(%(config_ids)s)
                    """,
                    {
                        "project_id": project_id,
                        "config_ids": requested_config_ids,
                    },
                )
                configs = {
                    str(config["id"]): config for config in await cursor.fetchall()
                }

                for item_input in items:
                    item_id = str(item_input.get("itemId") or "")
                    item = item_by_id[item_id]
                    allowed_config_ids = set(item["score_config_ids"] or [])
                    trace_id = (
                        item.get("observation_trace_id")
                        if item["object_type"] == "OBSERVATION"
                        else item["object_id"]
                    )
                    observation_id = (
                        item["object_id"]
                        if item["object_type"] == "OBSERVATION"
                        else None
                    )
                    session_id = (
                        item["object_id"] if item["object_type"] == "SESSION" else None
                    )
                    for score in (item_input.get("scorePayload") or {}).get(
                        "scores"
                    ) or []:
                        config_id = score["configId"]
                        if config_id not in allowed_config_ids:
                            raise BusinessError(
                                code=1024,
                                message="评分指标不属于当前人工标注任务",
                                status_code=400,
                            )
                        config = configs.get(config_id)
                        if config is None:
                            raise BusinessError(
                                code=1024,
                                message="评分指标不存在或无访问权限",
                                status_code=400,
                            )
                        if config.get("is_archived"):
                            raise BusinessError(
                                code=1026,
                                message="已归档评分指标不能继续标注",
                                status_code=400,
                            )
                        value, string_value = self._normalize_score_value(
                            config,
                            score.get("value"),
                            score.get("stringValue") or "",
                        )
                        score_payloads.append(
                            _annotation_score_api_payload(
                                project_id=project_id,
                                queue_id=queue_id,
                                item_id=item_id,
                                user_id=user_id,
                                trace_id=trace_id,
                                observation_id=observation_id,
                                session_id=session_id,
                                config=config,
                                config_id=config_id,
                                value=value,
                                string_value=string_value,
                                comment=score.get("comment") or "",
                            )
                        )
        return score_payloads

    async def complete_annotation_queue_item_for_user(
        self,
        project_id: str,
        queue_id: str,
        item_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    UPDATE annotation_queue_items
                    SET
                        status = 'COMPLETED'::"AnnotationQueueStatus",
                        annotator_user_id = %(user_id)s,
                        completed_at = COALESCE(completed_at, NOW()),
                        updated_at = NOW()
                    WHERE project_id = %(project_id)s
                      AND queue_id = %(queue_id)s
                      AND id = %(item_id)s
                    """,
                    {
                        "project_id": project_id,
                        "queue_id": queue_id,
                        "item_id": item_id,
                        "user_id": user_id,
                    },
                )
                await cursor.execute(
                    """
                    UPDATE annotation_queues
                    SET updated_at = NOW()
                    WHERE project_id = %(project_id)s
                      AND id = %(queue_id)s
                    """,
                    {"project_id": project_id, "queue_id": queue_id},
                )

        return await self.get_annotation_queue_item_for_user(
            project_id,
            queue_id,
            item_id,
            user_id,
        )

    async def complete_annotation_queue_items_for_user(
        self,
        project_id: str,
        queue_id: str,
        item_ids: list[str],
        user_id: str,
    ) -> None:
        unique_item_ids = list(dict.fromkeys(item_ids))
        if not unique_item_ids:
            return
        if not self._database_url:
            raise LangfuseDatabaseConfigError()
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    UPDATE annotation_queue_items
                    SET
                        status = 'COMPLETED'::"AnnotationQueueStatus",
                        annotator_user_id = %(user_id)s,
                        completed_at = COALESCE(completed_at, NOW()),
                        updated_at = NOW()
                    WHERE project_id = %(project_id)s
                      AND queue_id = %(queue_id)s
                      AND id = ANY(%(item_ids)s)
                    """,
                    {
                        "project_id": project_id,
                        "queue_id": queue_id,
                        "item_ids": unique_item_ids,
                        "user_id": user_id,
                    },
                )
                await cursor.execute(
                    """
                    UPDATE annotation_queues
                    SET updated_at = NOW()
                    WHERE project_id = %(project_id)s
                      AND id = %(queue_id)s
                    """,
                    {"project_id": project_id, "queue_id": queue_id},
                )

    async def get_project_api_key_credentials_for_user(
        self,
        project_id: str,
        user_id: str,
    ) -> dict[str, str]:
        keys = await self.list_project_api_keys(project_id, user_id)
        if not keys:
            raise BusinessError(
                code=1029,
                message="项目 API Key 未配置",
                status_code=400,
            )
        return {
            "publicKey": keys[0]["publicKey"],
            "secretKey": keys[0]["secretKey"],
        }

    async def add_annotation_item_to_dataset_for_user(
        self,
        project_id: str,
        queue_id: str,
        item_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        dataset_item_id = _new_langfuse_id("datasetitem")
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                item = await self._get_annotation_item_score_context(
                    cursor,
                    project_id,
                    queue_id,
                    item_id,
                )
                await cursor.execute(
                    """
                    SELECT id
                    FROM datasets
                    WHERE project_id = %(project_id)s
                      AND id = %(dataset_id)s
                    LIMIT 1
                    """,
                    {
                        "project_id": project_id,
                        "dataset_id": payload["datasetId"],
                    },
                )
                if await cursor.fetchone() is None:
                    raise BusinessError(
                        code=1011,
                        message="数据集不存在或无访问权限",
                        status_code=404,
                    )

                source_trace_id = item.get("resolved_trace_id") or ""
                source_observation_id = (
                    item["object_id"] if item["object_type"] == "OBSERVATION" else ""
                )
                await cursor.execute(
                    """
                    INSERT INTO dataset_items (
                        id,
                        project_id,
                        dataset_id,
                        status,
                        input,
                        expected_output,
                        metadata,
                        source_trace_id,
                        source_observation_id,
                        created_at,
                        updated_at,
                        valid_from,
                        is_deleted
                    )
                    VALUES (
                        %(id)s,
                        %(project_id)s,
                        %(dataset_id)s,
                        'ACTIVE'::"DatasetStatus",
                        %(input)s,
                        %(expected_output)s,
                        %(metadata)s,
                        %(source_trace_id)s,
                        %(source_observation_id)s,
                        NOW(),
                        NOW(),
                        NOW(),
                        FALSE
                    )
                    RETURNING
                        id,
                        project_id,
                        dataset_id,
                        status::text AS status,
                        input,
                        expected_output,
                        metadata,
                        source_trace_id,
                        source_observation_id,
                        is_deleted,
                        created_at,
                        updated_at
                    """,
                    {
                        "id": dataset_item_id,
                        "project_id": project_id,
                        "dataset_id": payload["datasetId"],
                        "input": Jsonb(payload.get("input")),
                        "expected_output": Jsonb(payload.get("expectedOutput")),
                        "metadata": Jsonb(payload.get("metadata") or {}),
                        "source_trace_id": source_trace_id,
                        "source_observation_id": source_observation_id,
                    },
                )
                row = await cursor.fetchone()

        assert row is not None
        return self._to_dataset_item_payload(row)

    async def add_traces_to_dataset_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        traces = _unique_traces_by_trace_id(payload.get("traces") or [])
        item_ids: list[str] = []
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    SELECT id
                    FROM datasets
                    WHERE project_id = %(project_id)s
                      AND id = %(dataset_id)s
                    LIMIT 1
                    """,
                    {
                        "project_id": project_id,
                        "dataset_id": payload["datasetId"],
                    },
                )
                if await cursor.fetchone() is None:
                    raise BusinessError(
                        code=1011,
                        message="数据集不存在或无访问权限",
                        status_code=404,
                    )

                for batch in _chunk_items(traces, TRACE_DATASET_INSERT_BATCH_SIZE):
                    source_trace_ids = [
                        str(trace.get("traceId") or "")
                        for trace in batch
                        if trace.get("traceId")
                    ]
                    await cursor.execute(
                        """
                        SELECT source_trace_id
                        FROM dataset_items
                        WHERE project_id = %(project_id)s
                          AND dataset_id = %(dataset_id)s
                          AND is_deleted IS FALSE
                          AND source_trace_id = ANY(%(source_trace_ids)s)
                        """,
                        {
                            "project_id": project_id,
                            "dataset_id": payload["datasetId"],
                            "source_trace_ids": source_trace_ids,
                        },
                    )
                    existing_source_trace_ids = {
                        str(row.get("source_trace_id") or "")
                        for row in await cursor.fetchall()
                    }
                    batch = [
                        trace
                        for trace in batch
                        if str(trace.get("traceId") or "")
                        not in existing_source_trace_ids
                    ]
                    if not batch:
                        continue

                    values_sql: list[str] = []
                    params: dict[str, Any] = {
                        "project_id": project_id,
                        "dataset_id": payload["datasetId"],
                    }
                    batch_item_ids: list[str] = []

                    for index, trace in enumerate(batch):
                        item_id = _new_langfuse_id("datasetitem")
                        batch_item_ids.append(item_id)
                        params[f"id_{index}"] = item_id
                        params[f"input_{index}"] = Jsonb(
                            {
                                "input": _decode_jsonish(trace.get("input")),
                                "output": _decode_jsonish(trace.get("output")),
                            }
                        )
                        params[f"expected_output_{index}"] = Jsonb({})
                        params[f"metadata_{index}"] = Jsonb(
                            _trace_dataset_metadata(trace)
                        )
                        params[f"source_trace_id_{index}"] = trace.get("traceId") or ""
                        values_sql.append(
                            f"""
                            (
                                %(id_{index})s,
                                %(project_id)s,
                                %(dataset_id)s,
                                'ACTIVE'::"DatasetStatus",
                                %(input_{index})s,
                                %(expected_output_{index})s,
                                %(metadata_{index})s,
                                %(source_trace_id_{index})s,
                                '',
                                NOW(),
                                NOW(),
                                NOW(),
                                FALSE
                            )
                            """
                        )

                    await cursor.execute(
                        f"""
                        INSERT INTO dataset_items (
                            id,
                            project_id,
                            dataset_id,
                            status,
                            input,
                            expected_output,
                            metadata,
                            source_trace_id,
                            source_observation_id,
                            created_at,
                            updated_at,
                            valid_from,
                            is_deleted
                        )
                        VALUES {", ".join(values_sql)}
                        """,
                        params,
                    )
                    item_ids.extend(batch_item_ids)

        return {
            "datasetId": payload["datasetId"],
            "successCount": len(item_ids),
            "failureCount": 0,
            "itemIds": item_ids,
            "failures": [],
        }

    async def _list_langfuse_evaluators_for_user(
        self, user_id: str
    ) -> list[dict[str, Any]]:
        rows = await self._fetch_all(
            f"""
            WITH visible_projects AS (
                SELECT p.id, p.name
                FROM projects p
                WHERE {PROJECT_ACCESS_EXISTS_SQL}
            ),
            latest_templates AS (
                SELECT DISTINCT ON (et.project_id, et.name, et.type)
                    et.id,
                    et.name,
                    et.type::text AS type,
                    et.version,
                    et.vars,
                    et.provider,
                    et.model,
                    et.partner,
                    et.source_code_language::text AS source_code_language,
                    et.project_id,
                    et.updated_at
                FROM eval_templates et
                WHERE et.project_id IS NULL
                   OR et.project_id IN (SELECT id FROM visible_projects)
                ORDER BY et.project_id NULLS FIRST, et.name, et.type, et.version DESC
            )
            SELECT
                lt.id,
                lt.name,
                lt.type,
                lt.version,
                lt.vars,
                lt.provider,
                lt.model,
                lt.partner,
                lt.source_code_language,
                lt.project_id,
                vp.name AS project_name,
                lt.updated_at,
                COALESCE(usage.usage_count, 0)::int AS usage_count
            FROM latest_templates lt
            LEFT JOIN visible_projects vp ON vp.id = lt.project_id
            LEFT JOIN LATERAL (
                SELECT COUNT(jc.id)::int AS usage_count
                FROM job_configurations jc
                WHERE jc.project_id IN (SELECT id FROM visible_projects)
                  AND jc.eval_template_id IN (
                    SELECT family.id
                    FROM eval_templates family
                    WHERE family.name = lt.name
                      AND family.type::text = lt.type
                      AND (
                        family.project_id = lt.project_id
                        OR family.project_id IS NULL
                        OR lt.project_id IS NULL
                      )
                  )
            ) usage ON TRUE
            ORDER BY lt.project_id NULLS FIRST, lt.partner NULLS LAST, lt.name, lt.type
            """,
            {"user_id": user_id},
        )
        return [self._to_evaluator_payload(row) for row in rows]

    async def _list_pa_evaluators_for_user(self, user_id: str) -> list[dict[str, Any]]:
        try:
            rows = await self._fetch_pa_evaluators_for_user(
                user_id,
                include_output_variables=True,
            )
        except psycopg.errors.UndefinedColumn:
            rows = await self._fetch_pa_evaluators_for_user(
                user_id,
                include_output_variables=False,
            )
        except psycopg.errors.UndefinedTable:
            return []

        return [self._to_pa_evaluator_payload(row) for row in rows]

    async def _fetch_pa_evaluators_for_user(
        self,
        user_id: str,
        *,
        include_output_variables: bool,
    ) -> list[dict[str, Any]]:
        output_variables_select = (
            "COALESCE(pe.output_variables, '[]'::jsonb) AS output_variables,"
            if include_output_variables
            else ""
        )
        return await self._fetch_all(
            f"""
            SELECT
                pe.id,
                pe.name,
                pe.type,
                pe.provider,
                pe.version,
                pe.description,
                pe.variables,
                {output_variables_select}
                pe.config,
                pe.project_id,
                p.name AS project_name,
                pe.update_date AS updated_at
            FROM pa_evaluators pe
            JOIN projects p ON p.id = pe.project_id
            WHERE pe.status = 'ACTIVE'
              AND {PROJECT_ACCESS_EXISTS_SQL}
            ORDER BY pe.update_date DESC, pe.id DESC
            """,
            {"user_id": user_id},
        )

    async def get_evaluator_for_user(
        self,
        evaluator_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        pa_evaluator = await self._get_pa_evaluator_for_user(evaluator_id, user_id)
        if pa_evaluator is not None:
            return pa_evaluator

        langfuse_evaluator = await self._get_langfuse_evaluator_for_user(
            evaluator_id,
            user_id,
        )
        if langfuse_evaluator is not None:
            return langfuse_evaluator

        raise BusinessError(
            code=1006,
            message="评估器不存在或无访问权限",
            status_code=404,
        )

    async def _get_pa_evaluator_for_user(
        self,
        evaluator_id: str,
        user_id: str,
    ) -> dict[str, Any] | None:
        try:
            rows = await self._fetch_pa_evaluator_for_user(
                evaluator_id,
                user_id,
                include_output_variables=True,
            )
        except psycopg.errors.UndefinedColumn:
            rows = await self._fetch_pa_evaluator_for_user(
                evaluator_id,
                user_id,
                include_output_variables=False,
            )
        except psycopg.errors.UndefinedTable:
            return None

        if not rows:
            return None

        payload = self._to_pa_evaluator_payload(rows[0])
        return {
            **payload,
            "config": self._redact_evaluator_config(rows[0].get("config") or {}),
        }

    async def _fetch_pa_evaluator_for_user(
        self,
        evaluator_id: str,
        user_id: str,
        *,
        include_output_variables: bool,
    ) -> list[dict[str, Any]]:
        output_variables_select = (
            "COALESCE(pe.output_variables, '[]'::jsonb) AS output_variables,"
            if include_output_variables
            else ""
        )
        return await self._fetch_all(
            f"""
            SELECT
                pe.id,
                pe.name,
                pe.type,
                pe.provider,
                pe.version,
                pe.description,
                pe.variables,
                {output_variables_select}
                pe.config,
                pe.project_id,
                p.name AS project_name,
                pe.update_date AS updated_at
            FROM pa_evaluators pe
            JOIN projects p ON p.id = pe.project_id
            WHERE pe.id = %(evaluator_id)s
              AND pe.status = 'ACTIVE'
              AND {PROJECT_ACCESS_EXISTS_SQL}
            LIMIT 1
            """,
            {"evaluator_id": evaluator_id, "user_id": user_id},
        )

    async def _get_langfuse_evaluator_for_user(
        self,
        evaluator_id: str,
        user_id: str,
    ) -> dict[str, Any] | None:
        rows = await self._fetch_all(
            f"""
            WITH visible_projects AS (
                SELECT p.id, p.name
                FROM projects p
                WHERE {PROJECT_ACCESS_EXISTS_SQL}
            )
            SELECT
                et.id,
                et.name,
                et.type::text AS type,
                et.version,
                et.vars,
                et.provider,
                et.model,
                et.partner,
                et.prompt,
                et.model_params,
                et.output_schema,
                et.source_code,
                et.source_code_language::text AS source_code_language,
                et.project_id,
                vp.name AS project_name,
                et.updated_at,
                COALESCE(usage.usage_count, 0)::int AS usage_count
            FROM eval_templates et
            LEFT JOIN visible_projects vp ON vp.id = et.project_id
            LEFT JOIN LATERAL (
                SELECT COUNT(jc.id)::int AS usage_count
                FROM job_configurations jc
                WHERE jc.project_id IN (SELECT id FROM visible_projects)
                  AND jc.eval_template_id = et.id
            ) usage ON TRUE
            WHERE et.id = %(evaluator_id)s
              AND (
                et.project_id IS NULL
                OR et.project_id IN (SELECT id FROM visible_projects)
              )
            LIMIT 1
            """,
            {"evaluator_id": evaluator_id, "user_id": user_id},
        )
        if not rows:
            return None

        row = rows[0]
        payload = self._to_evaluator_payload(row)
        return {
            **payload,
            "prompt": row.get("prompt"),
            "modelConfig": {
                "provider": row.get("provider"),
                "model": row.get("model"),
                "modelParams": row.get("model_params") or {},
            },
            "outputDefinition": row.get("output_schema") or {},
            "sourceCode": row.get("source_code"),
            "sourceCodeLanguage": row.get("source_code_language"),
        }

    async def create_langfuse_evaluator(
        self,
        payload: dict[str, Any],
        user_id: str,
        user_email: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        evaluator_id = _new_langfuse_id("evaltmpl")
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                project = await self._get_project_for_user(
                    cursor,
                    payload["project_id"],
                    user_id,
                )
                latest_version = await self._get_latest_evaluator_version(
                    cursor,
                    payload["project_id"],
                    payload["name"],
                    payload["type"],
                )
                version = latest_version + 1
                model_config = payload.get("model_config") or {}
                variables = payload.get("variables") or []
                if payload["type"] == "CODE" and not variables:
                    variables = [
                        "input",
                        "output",
                        "metadata",
                        "experimentItemExpectedOutput",
                        "experimentItemMetadata",
                    ]

                await cursor.execute(
                    """
                    INSERT INTO eval_templates (
                        id,
                        project_id,
                        name,
                        version,
                        prompt,
                        type,
                        provider,
                        model,
                        model_params,
                        vars,
                        output_schema,
                        source_code,
                        source_code_language
                    )
                    VALUES (
                        %(id)s,
                        %(project_id)s,
                        %(name)s,
                        %(version)s,
                        %(prompt)s,
                        %(type)s::"EvalTemplateType",
                        %(provider)s,
                        %(model)s,
                        %(model_params)s,
                        %(vars)s,
                        %(output_schema)s,
                        %(source_code)s,
                        %(source_code_language)s::"EvalTemplateSourceCodeLanguage"
                    )
                    RETURNING
                        id,
                        name,
                        type::text AS type,
                        version,
                        vars,
                        provider,
                        model,
                        partner,
                        source_code_language::text AS source_code_language,
                        project_id,
                        updated_at
                    """,
                    {
                        "id": evaluator_id,
                        "project_id": payload["project_id"],
                        "name": payload["name"],
                        "version": version,
                        "prompt": payload.get("prompt"),
                        "type": payload["type"],
                        "provider": model_config.get("provider"),
                        "model": model_config.get("model"),
                        "model_params": Jsonb({}),
                        "vars": variables,
                        "output_schema": Jsonb(payload.get("output_definition") or {}),
                        "source_code": payload.get("source_code"),
                        "source_code_language": payload.get("source_code_language"),
                    },
                )
                evaluator = await cursor.fetchone()

        assert evaluator is not None
        return self._to_evaluator_payload(
            {
                **evaluator,
                "project_name": project["name"],
                "usage_count": 0,
            }
        )

    async def create_pa_evaluator(
        self,
        payload: dict[str, Any],
        user_id: str,
        user_email: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        evaluator_id = _new_langfuse_id("paeval")
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                project = await self._get_project_for_user(
                    cursor,
                    payload["project_id"],
                    user_id,
                )
                await cursor.execute(
                    """
                    INSERT INTO pa_evaluators (
                        id,
                        project_id,
                        name,
                        type,
                        provider,
                        version,
                        description,
                        variables,
                        output_variables,
                        config,
                        status,
                        create_by,
                        create_date,
                        update_by,
                        update_date
                    )
                    VALUES (
                        %(id)s,
                        %(project_id)s,
                        %(name)s,
                        %(type)s,
                        %(provider)s,
                        1,
                        %(description)s,
                        %(variables)s,
                        %(output_variables)s,
                        %(config)s,
                        'ACTIVE',
                        %(create_by)s,
                        NOW(),
                        %(update_by)s,
                        NOW()
                    )
                    RETURNING
                        id,
                        name,
                        type,
                        provider,
                        version,
                        description,
                        variables,
                        output_variables,
                        config,
                        project_id,
                        update_date AS updated_at
                    """,
                    {
                        "id": evaluator_id,
                        "project_id": payload["project_id"],
                        "name": payload["name"],
                        "type": payload["type"],
                        "provider": payload["provider"],
                        "description": payload.get("description") or "",
                        "variables": Jsonb(payload.get("variables") or []),
                        "output_variables": Jsonb(
                            payload.get("output_variables") or []
                        ),
                        "config": Jsonb(payload.get("config") or {}),
                        "create_by": user_email,
                        "update_by": user_email,
                    },
                )
                evaluator = await cursor.fetchone()

        assert evaluator is not None
        return self._to_pa_evaluator_payload(
            {
                **evaluator,
                "project_name": project["name"],
            }
        )

    async def update_pa_evaluator_for_user(
        self,
        evaluator_id: str,
        payload: dict[str, Any],
        user_id: str,
        user_email: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                project = await self._get_project_for_user(
                    cursor,
                    payload["project_id"],
                    user_id,
                )
                await cursor.execute(
                    f"""
                    UPDATE pa_evaluators pe
                    SET
                        project_id = %(project_id)s,
                        name = %(name)s,
                        type = %(type)s,
                        provider = %(provider)s,
                        version = pe.version + 1,
                        description = %(description)s,
                        variables = %(variables)s,
                        output_variables = %(output_variables)s,
                        config = %(config)s,
                        update_by = %(update_by)s,
                        update_date = NOW()
                    FROM projects p
                    WHERE pe.project_id = p.id
                      AND pe.id = %(evaluator_id)s
                      AND pe.status = 'ACTIVE'
                      AND {PROJECT_ACCESS_EXISTS_SQL}
                    RETURNING
                        pe.id,
                        pe.name,
                        pe.type,
                        pe.provider,
                        pe.version,
                        pe.description,
                        pe.variables,
                        pe.output_variables,
                        pe.config,
                        pe.project_id,
                        pe.update_date AS updated_at
                    """,
                    {
                        "evaluator_id": evaluator_id,
                        "project_id": payload["project_id"],
                        "name": payload["name"],
                        "type": payload["type"],
                        "provider": payload["provider"],
                        "description": payload.get("description") or "",
                        "variables": Jsonb(payload.get("variables") or []),
                        "output_variables": Jsonb(
                            payload.get("output_variables") or []
                        ),
                        "config": Jsonb(payload.get("config") or {}),
                        "update_by": user_email,
                        "user_id": user_id,
                    },
                )
                evaluator = await cursor.fetchone()

        if evaluator is None:
            raise BusinessError(
                code=1006,
                message="评估器不存在或无访问权限",
                status_code=404,
            )

        return self._to_pa_evaluator_payload(
            {
                **evaluator,
                "project_name": project["name"],
            }
        )

    async def delete_pa_evaluator_for_user(
        self,
        evaluator_id: str,
        user_id: str,
    ) -> None:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(
                    f"""
                    DELETE FROM pa_evaluators pe
                    USING projects p
                    WHERE pe.project_id = p.id
                      AND pe.id = %(evaluator_id)s
                      AND pe.status = 'ACTIVE'
                      AND {PROJECT_ACCESS_EXISTS_SQL}
                    RETURNING pe.id
                    """,
                    {"evaluator_id": evaluator_id, "user_id": user_id},
                )
                deleted = await cursor.fetchone()

        if deleted is None:
            raise BusinessError(
                code=1006,
                message="评估器不存在或无访问权限",
                status_code=404,
            )

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
        member_rows = await self._fetch_all(
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
        invitation_rows = await self._fetch_all(
            """
            SELECT
                mi.id,
                mi.org_id,
                mi.email,
                mi.org_role::text AS org_role,
                mi.project_id,
                mi.project_role::text AS project_role,
                mi.created_at,
                mi.updated_at,
                u.name AS invited_by_name,
                u.email AS invited_by_email
            FROM membership_invitations mi
            LEFT JOIN users u ON u.id = mi.invited_by_user_id
            WHERE mi.org_id = %(organization_id)s
              AND mi.project_id IS NULL
            ORDER BY mi.created_at DESC, mi.email
            """,
            {"organization_id": organization_id},
        )
        return [
            *[self._to_member_payload(row) for row in member_rows],
            *[self._to_organization_invitation_payload(row) for row in invitation_rows],
        ]

    async def create_organization_member(
        self,
        organization_id: str,
        actor_user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        membership_id = _new_langfuse_id("orgmem")
        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                actor_role = await self._get_actor_organization_role_cursor(
                    cursor,
                    organization_id,
                    actor_user_id,
                )
                self._ensure_manager_role(actor_role, "当前角色不能管理组织成员")
                self._ensure_role_not_higher(
                    actor_role,
                    payload["role"],
                    "不能授予高于当前角色的组织角色",
                )
                user = await self._get_user_by_email_cursor(
                    cursor,
                    payload["email"],
                )
                if user is None:
                    user = await self._ensure_user_by_email_cursor(
                        cursor,
                        _organization_member_account(payload),
                        payload["email"],
                    )

                try:
                    await cursor.execute(
                        """
                        INSERT INTO organization_memberships (
                            id,
                            org_id,
                            user_id,
                            role
                        )
                        VALUES (
                            %(id)s,
                            %(org_id)s,
                            %(user_id)s,
                            %(role)s::"Role"
                        )
                        """,
                        {
                            "id": membership_id,
                            "org_id": organization_id,
                            "user_id": user["id"],
                            "role": payload["role"],
                        },
                    )
                except psycopg.errors.UniqueViolation as exc:
                    raise BusinessError(
                        1016,
                        "用户已在该组织中，请使用设置组织角色调整权限",
                        409,
                    ) from exc
                await cursor.execute(
                    """
                    DELETE FROM membership_invitations
                    WHERE org_id = %(organization_id)s
                      AND lower(email) = lower(%(email)s)
                      AND project_id IS NULL
                    """,
                    {
                        "organization_id": organization_id,
                        "email": payload["email"],
                    },
                )
                return await self._get_organization_member_cursor(
                    cursor,
                    organization_id,
                    membership_id,
                )

    async def update_organization_member(
        self,
        organization_id: str,
        member_id: str,
        actor_user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                actor_role = await self._get_actor_organization_role_cursor(
                    cursor,
                    organization_id,
                    actor_user_id,
                )
                self._ensure_manager_role(actor_role, "当前角色不能管理组织成员")
                target = await self._get_organization_member_context_cursor(
                    cursor,
                    organization_id,
                    member_id,
                )
                self._ensure_role_not_higher(
                    actor_role,
                    target["role"],
                    "不能操作高于当前角色的组织成员",
                )
                self._ensure_role_not_higher(
                    actor_role,
                    payload["role"],
                    "不能授予高于当前角色的组织角色",
                )
                if target["role"] == "OWNER" and payload["role"] != "OWNER":
                    await self._ensure_not_last_organization_owner_cursor(
                        cursor,
                        organization_id,
                    )
                await cursor.execute(
                    """
                    UPDATE organization_memberships
                    SET role = %(role)s::"Role",
                        updated_at = NOW()
                    WHERE org_id = %(organization_id)s
                      AND id = %(member_id)s
                    RETURNING id
                    """,
                    {
                        "organization_id": organization_id,
                        "member_id": member_id,
                        "role": payload["role"],
                    },
                )
                if await cursor.fetchone() is None:
                    raise BusinessError(1017, "组织成员不存在", 404)
                return await self._get_organization_member_cursor(
                    cursor,
                    organization_id,
                    member_id,
                )

    async def delete_organization_member(
        self,
        organization_id: str,
        member_id: str,
        actor_user_id: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                actor_role = await self._get_actor_organization_role_cursor(
                    cursor,
                    organization_id,
                    actor_user_id,
                )
                target = await self._get_organization_member_context_cursor(
                    cursor,
                    organization_id,
                    member_id,
                )
                if target["user_id"] != actor_user_id:
                    self._ensure_manager_role(actor_role, "当前角色不能管理组织成员")
                self._ensure_role_not_higher(
                    actor_role,
                    target["role"],
                    "不能操作高于当前角色的组织成员",
                )
                if target["role"] == "OWNER":
                    await self._ensure_not_last_organization_owner_cursor(
                        cursor,
                        organization_id,
                    )
                await cursor.execute(
                    """
                    DELETE FROM organization_memberships
                    WHERE org_id = %(organization_id)s
                      AND id = %(member_id)s
                    RETURNING id
                    """,
                    {
                        "organization_id": organization_id,
                        "member_id": member_id,
                    },
                )
                row = await cursor.fetchone()
        if row is None:
            raise BusinessError(1017, "组织成员不存在", 404)
        return {"id": row["id"]}

    async def _get_actor_organization_role_cursor(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        organization_id: str,
        actor_user_id: str,
    ) -> str:
        await cursor.execute(
            """
            SELECT role::text AS role
            FROM organization_memberships
            WHERE org_id = %(organization_id)s
              AND user_id = %(actor_user_id)s
            LIMIT 1
            """,
            {
                "organization_id": organization_id,
                "actor_user_id": actor_user_id,
            },
        )
        actor = await cursor.fetchone()
        if actor is None:
            raise BusinessError(1004, "组织不存在或无访问权限", 404)
        return actor["role"]

    async def _get_organization_member_context_cursor(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        organization_id: str,
        member_id: str,
    ) -> dict[str, Any]:
        await cursor.execute(
            """
            SELECT id, user_id, role::text AS role
            FROM organization_memberships
            WHERE org_id = %(organization_id)s
              AND id = %(member_id)s
            LIMIT 1
            """,
            {"organization_id": organization_id, "member_id": member_id},
        )
        member = await cursor.fetchone()
        if member is None:
            raise BusinessError(1017, "组织成员不存在", 404)
        return member

    @staticmethod
    def _raise_duplicate_organization_invitation() -> None:
        raise BusinessError(
            1030,
            "该邮箱已有待处理邀请，请先处理现有邀请",
            409,
        )

    async def _ensure_organization_invitation_can_be_created(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        organization_id: str,
        email: str,
    ) -> None:
        await cursor.execute(
            """
            SELECT id
            FROM membership_invitations
            WHERE org_id = %(organization_id)s
              AND lower(email) = lower(%(email)s)
            LIMIT 1
            """,
            {
                "organization_id": organization_id,
                "email": email,
            },
        )
        if await cursor.fetchone() is not None:
            self._raise_duplicate_organization_invitation()

    async def _get_organization_invitation_cursor(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        organization_id: str,
        invitation_id: str,
    ) -> dict[str, Any]:
        await cursor.execute(
            """
            SELECT
                mi.id,
                mi.org_id,
                mi.email,
                mi.org_role::text AS org_role,
                mi.project_id,
                mi.project_role::text AS project_role,
                mi.created_at,
                mi.updated_at,
                u.name AS invited_by_name,
                u.email AS invited_by_email
            FROM membership_invitations mi
            LEFT JOIN users u ON u.id = mi.invited_by_user_id
            WHERE mi.org_id = %(organization_id)s
              AND mi.id = %(invitation_id)s
            LIMIT 1
            """,
            {
                "organization_id": organization_id,
                "invitation_id": invitation_id,
            },
        )
        row = await cursor.fetchone()
        if row is None:
            raise BusinessError(1031, "组织成员邀请不存在", 404)
        return self._to_organization_invitation_payload(row)

    async def _ensure_not_last_organization_owner_cursor(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        organization_id: str,
    ) -> None:
        await cursor.execute(
            """
            SELECT COUNT(*)::int AS owner_count
            FROM organization_memberships
            WHERE org_id = %(organization_id)s
              AND role::text = 'OWNER'
            """,
            {"organization_id": organization_id},
        )
        row = await cursor.fetchone()
        if row is not None and row["owner_count"] <= 1:
            raise BusinessError(1028, "不能删除或降级最后一个 Owner", 409)

    async def _get_user_by_email_cursor(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        email: str,
    ) -> dict[str, Any] | None:
        await cursor.execute(
            """
            SELECT id, name, email
            FROM users
            WHERE lower(email) = lower(%(email)s)
            LIMIT 1
            """,
            {"email": email},
        )
        return await cursor.fetchone()

    async def _ensure_user_by_email_cursor(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        account: str,
        email: str,
    ) -> dict[str, Any]:
        existing = await self._get_user_by_email_cursor(cursor, email)
        if existing is not None:
            return existing

        user_id = _new_langfuse_id("user")
        await cursor.execute(
            """
            INSERT INTO users (
                id,
                name,
                email,
                email_verified,
                created_at,
                updated_at
            )
            VALUES (
                %(id)s,
                %(name)s,
                %(email)s,
                NOW(),
                NOW(),
                NOW()
            )
            RETURNING id, name, email
            """,
            {
                "id": user_id,
                "name": account,
                "email": email.lower(),
            },
        )
        created = await cursor.fetchone()
        assert created is not None
        return created

    async def _get_organization_member_cursor(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        organization_id: str,
        member_id: str,
    ) -> dict[str, Any]:
        await cursor.execute(
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
              AND om.id = %(member_id)s
            LIMIT 1
            """,
            {"organization_id": organization_id, "member_id": member_id},
        )
        row = await cursor.fetchone()
        if row is None:
            raise BusinessError(1017, "组织成员不存在", 404)
        return self._to_member_payload(row)

    async def create_organization_with_default_project(
        self,
        payload: dict[str, Any],
        owner_account: str,
        owner_email: str,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        organization_id = _new_langfuse_id("org")
        project_id = _new_langfuse_id("project")

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                owner_user = await self._ensure_user_by_email_cursor(
                    cursor,
                    owner_account,
                    owner_email,
                )
                owner_user_id = owner_user["id"]

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
                    INSERT INTO organization_memberships (
                        id,
                        org_id,
                        user_id,
                        role
                    )
                    VALUES
                        (%(id)s, %(org_id)s, %(user_id)s, 'OWNER'::"Role")
                    ON CONFLICT (org_id, user_id)
                    DO UPDATE SET
                        role = 'OWNER'::"Role",
                        updated_at = NOW()
                    RETURNING id
                    """,
                    {
                        "id": _new_langfuse_id("orgmem"),
                        "org_id": organization_id,
                        "user_id": owner_user_id,
                    },
                )
                membership = await cursor.fetchone()
                assert membership is not None

                await cursor.execute(
                    """
                    INSERT INTO projects (id, name, org_id, metadata)
                    VALUES (%(id)s, %(name)s, %(org_id)s, %(metadata)s)
                    """,
                    {
                        "id": project_id,
                        "name": payload["default_project_name"],
                        "org_id": organization_id,
                        "metadata": Jsonb({"paEval": {"createdBy": owner_email}}),
                    },
                )
                await cursor.execute(
                    """
                    INSERT INTO project_memberships (
                        project_id,
                        user_id,
                        org_membership_id,
                        role,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        %(project_id)s,
                        %(user_id)s,
                        %(org_membership_id)s,
                        'OWNER',
                        NOW(),
                        NOW()
                    )
                    ON CONFLICT (project_id, user_id) DO NOTHING
                    """,
                    {
                        "project_id": project_id,
                        "user_id": owner_user_id,
                        "org_membership_id": membership["id"],
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

        async with await connect_postgres(
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

    @staticmethod
    def _annotation_queue_select_sql() -> str:
        return """
            SELECT
                aq.id,
                aq.project_id,
                aq.name,
                aq.description,
                aq.score_config_ids,
                aq.created_at,
                aq.updated_at,
                COALESCE(counts.completed_count, 0)::int AS completed_count,
                COALESCE(counts.pending_count, 0)::int AS pending_count,
                COALESCE(assignments.assignee_ids, ARRAY[]::text[]) AS assignee_ids,
                COALESCE(assignments.assignees, '[]'::jsonb) AS assignees,
                COALESCE(settings.assignment_strategy, 'average') AS assignment_strategy,
                COALESCE(settings.assignment_weights, '{}'::jsonb) AS assignment_weights,
                COALESCE(score_configs.score_configs, '[]'::jsonb) AS score_configs
            FROM annotation_queues aq
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*) FILTER (WHERE status::text = 'COMPLETED')::int
                        AS completed_count,
                    COUNT(*) FILTER (WHERE status::text = 'PENDING')::int
                        AS pending_count
                FROM annotation_queue_items aqi
                WHERE aqi.project_id = aq.project_id
                  AND aqi.queue_id = aq.id
            ) counts ON TRUE
            LEFT JOIN LATERAL (
                SELECT
                    ARRAY_AGG(aqa.user_id ORDER BY aqa.created_at, aqa.user_id)
                        AS assignee_ids,
                    JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'id', u.id,
                            'name', COALESCE(u.name, u.email, u.id),
                            'email', COALESCE(u.email, '')
                        )
                        ORDER BY aqa.created_at, aqa.user_id
                    ) AS assignees
                FROM annotation_queue_assignments aqa
                LEFT JOIN users u ON u.id = aqa.user_id
                WHERE aqa.project_id = aq.project_id
                  AND aqa.queue_id = aq.id
            ) assignments ON TRUE
            LEFT JOIN pa_annotation_queue_settings settings
              ON settings.project_id = aq.project_id
             AND settings.queue_id = aq.id
            LEFT JOIN LATERAL (
                SELECT JSONB_AGG(
                    JSONB_BUILD_OBJECT(
                        'id', sc.id,
                        'projectId', sc.project_id,
                        'name', sc.name,
                        'dataType', sc.data_type::text,
                        'description', COALESCE(sc.description, ''),
                        'minValue', sc.min_value,
                        'maxValue', sc.max_value,
                        'categories', sc.categories,
                        'archived', sc.is_archived
                    )
                    ORDER BY array_position(aq.score_config_ids, sc.id)
                ) AS score_configs
                FROM score_configs sc
                WHERE sc.project_id = aq.project_id
                  AND sc.id = ANY(aq.score_config_ids)
            ) score_configs ON TRUE
            """

    @staticmethod
    def _annotation_item_filter_sql(
        filters: dict[str, Any],
        *,
        omitted_filter: str = "",
    ) -> tuple[str, dict[str, Any]]:
        conditions = ["1 = 1"]
        params: dict[str, Any] = {}
        keyword = str(filters.get("keyword") or "").strip()
        if keyword:
            params["annotation_keyword"] = f"%{keyword}%"
            conditions.append(
                "("
                "item.id ILIKE %(annotation_keyword)s "
                "OR item.object_id ILIKE %(annotation_keyword)s "
                "OR item.object_type ILIKE %(annotation_keyword)s "
                "OR COALESCE(item.source_title, '') ILIKE %(annotation_keyword)s "
                "OR COALESCE(item.trace_id, '') ILIKE %(annotation_keyword)s "
                "OR COALESCE(item.session_id, '') ILIKE %(annotation_keyword)s "
                "OR COALESCE(item.user_id, '') ILIKE %(annotation_keyword)s "
                "OR COALESCE(item.source_input::text, '') ILIKE %(annotation_keyword)s "
                "OR COALESCE(item.source_output::text, '') ILIKE %(annotation_keyword)s "
                "OR COALESCE(item.source_metadata::text, '') ILIKE %(annotation_keyword)s"
                ")"
            )
        if omitted_filter != "status" and filters.get("status"):
            params["annotation_statuses"] = list(filters["status"])
            conditions.append("item.status = ANY(%(annotation_statuses)s)")
        if omitted_filter != "object_type" and filters.get("object_type"):
            params["annotation_object_types"] = list(filters["object_type"])
            conditions.append("item.object_type = ANY(%(annotation_object_types)s)")
        if filters.get("completed_by"):
            params["annotation_completed_by"] = list(filters["completed_by"])
            conditions.append("item.completed_by_id = ANY(%(annotation_completed_by)s)")
        if omitted_filter != "assignee_ids" and filters.get("assignee_ids"):
            params["annotation_assignee_ids"] = list(filters["assignee_ids"])
            conditions.append("item.assignee_id = ANY(%(annotation_assignee_ids)s)")
        if filters.get("item_ids"):
            params["annotation_item_ids"] = list(filters["item_ids"])
            conditions.append("item.id = ANY(%(annotation_item_ids)s)")
        if filters.get("created_at_from"):
            params["annotation_created_at_from"] = filters["created_at_from"]
            conditions.append(
                "item.created_at >= CAST(%(annotation_created_at_from)s AS timestamptz)"
            )
        if filters.get("created_at_to"):
            params["annotation_created_at_to"] = filters["created_at_to"]
            conditions.append(
                "item.created_at <= CAST(%(annotation_created_at_to)s AS timestamptz)"
            )
        if filters.get("completed_at_from"):
            params["annotation_completed_at_from"] = filters["completed_at_from"]
            conditions.append(
                "item.completed_at >= CAST(%(annotation_completed_at_from)s AS timestamptz)"
            )
        if filters.get("completed_at_to"):
            params["annotation_completed_at_to"] = filters["completed_at_to"]
            conditions.append(
                "item.completed_at <= CAST(%(annotation_completed_at_to)s AS timestamptz)"
            )
        if filters.get("has_scores") is True:
            conditions.append("item.has_scores")
        elif filters.get("has_scores") is False:
            conditions.append("NOT item.has_scores")

        metadata_filters = list(filters.get("metadata_filters") or [])
        metadata_filter = filters.get("metadata_filter")
        if metadata_filter:
            metadata_filters.insert(0, metadata_filter)
        LangfuseDatabaseReader._append_annotation_json_filters(
            conditions,
            params,
            metadata_filters,
            column="item.source_metadata",
            prefix="annotation_metadata",
        )
        LangfuseDatabaseReader._append_annotation_json_filters(
            conditions,
            params,
            list(filters.get("input_filters") or []),
            column="item.source_input",
            prefix="annotation_input",
        )
        LangfuseDatabaseReader._append_annotation_json_filters(
            conditions,
            params,
            list(filters.get("output_filters") or []),
            column="item.source_output",
            prefix="annotation_output",
        )
        return " AND ".join(conditions), params

    @staticmethod
    def _annotation_item_candidate_select_sql(
        *,
        include_source: bool = True,
        include_assignment: bool = True,
        include_has_scores: bool = True,
    ) -> str:
        """Return only fields needed to filter, count and order annotation items."""
        source_columns = (
            """
                CASE
                    WHEN aqi.object_type::text = 'TRACE' THEN COALESCE(t.name, t.id)
                    WHEN aqi.object_type::text = 'OBSERVATION' THEN COALESCE(o.name, o.id)
                    ELSE COALESCE(ts.id, aqi.object_id)
                END AS source_title,
                COALESCE(t.input, o.input) AS source_input,
                COALESCE(t.output, o.output) AS source_output,
                COALESCE(t.metadata, o.metadata, '{}'::jsonb) AS source_metadata,
                COALESCE(t.id, o.trace_id, trace_from_observation.id, '') AS trace_id,
                COALESCE(t.session_id, trace_from_observation.session_id, ts.id, '')
                    AS session_id,
                COALESCE(t.user_id, trace_from_observation.user_id, '') AS user_id,
                COALESCE(t.timestamp, o.start_time, ts.created_at, aqi.created_at)
                    AS source_created_at,
            """
            if include_source
            else """
                aqi.object_id AS source_title,
                NULL::jsonb AS source_input,
                NULL::jsonb AS source_output,
                '{}'::jsonb AS source_metadata,
                CASE WHEN aqi.object_type::text = 'TRACE' THEN aqi.object_id ELSE '' END
                    AS trace_id,
                CASE WHEN aqi.object_type::text = 'SESSION' THEN aqi.object_id ELSE '' END
                    AS session_id,
                ''::text AS user_id,
                aqi.created_at AS source_created_at,
            """
        )
        source_joins = (
            """
            LEFT JOIN traces t
              ON aqi.object_type::text = 'TRACE'
             AND t.project_id = aqi.project_id
             AND t.id = aqi.object_id
            LEFT JOIN observations o
              ON aqi.object_type::text = 'OBSERVATION'
             AND o.project_id = aqi.project_id
             AND o.id = aqi.object_id
            LEFT JOIN traces trace_from_observation
              ON trace_from_observation.project_id = aqi.project_id
             AND trace_from_observation.id = o.trace_id
            LEFT JOIN trace_sessions ts
              ON aqi.object_type::text = 'SESSION'
             AND ts.project_id = aqi.project_id
             AND ts.id = aqi.object_id
            """
            if include_source
            else ""
        )
        assignment_join = (
            """
            LEFT JOIN pa_annotation_queue_item_assignments assignment
              ON assignment.project_id = aqi.project_id
             AND assignment.queue_id = aqi.queue_id
             AND assignment.item_id = aqi.id
            LEFT JOIN users assignee_user ON assignee_user.id = assignment.assignee_user_id
            """
            if include_assignment
            else ""
        )
        assignee_columns = (
            """
                assignment.assignee_user_id AS assignee_id,
                assignee_user.name AS assignee_name,
                assignee_user.email AS assignee_email,
            """
            if include_assignment
            else """
                NULL::text AS assignee_id,
                NULL::text AS assignee_name,
                NULL::text AS assignee_email,
            """
        )
        score_expression = (
            """EXISTS (
                    SELECT 1
                    FROM scores candidate_score
                    WHERE candidate_score.project_id = aqi.project_id
                      AND candidate_score.queue_id = aqi.queue_id
                      AND candidate_score.source::text = 'ANNOTATION'
                      AND (
                        (aqi.object_type::text = 'TRACE'
                         AND candidate_score.trace_id = aqi.object_id
                         AND candidate_score.observation_id IS NULL)
                        OR (aqi.object_type::text = 'OBSERVATION'
                            AND candidate_score.observation_id = aqi.object_id)
                        OR (aqi.object_type::text = 'SESSION'
                            AND candidate_score.trace_id = aqi.object_id)
                      )
                )"""
            if include_has_scores
            else "FALSE"
        )
        return f"""
            SELECT
                aqi.id,
                aqi.project_id,
                aqi.queue_id,
                aqi.object_id,
                aqi.object_type::text AS object_type,
                aqi.status::text AS status,
                aqi.completed_at,
                aqi.created_at,
                aqi.updated_at,
                aqi.annotator_user_id AS completed_by_id,
                completed_user.name AS completed_by_name,
                completed_user.email AS completed_by_email,
                {assignee_columns}
                {source_columns}
                0::numeric AS latency_ms,
                0::numeric AS cost_usd,
                {score_expression} AS has_scores,
                CASE WHEN {score_expression} THEN '[{{}}]'::jsonb ELSE '[]'::jsonb END
                    AS scores
            FROM annotation_queue_items aqi
            LEFT JOIN users completed_user ON completed_user.id = aqi.annotator_user_id
            {assignment_join}
            {source_joins}
            """

    @staticmethod
    def _append_annotation_json_filters(
        conditions: list[str],
        params: dict[str, Any],
        filters: list[dict[str, Any]],
        *,
        column: str,
        prefix: str,
    ) -> None:
        for index, value_filter in enumerate(filters):
            key = str(value_filter.get("key") or "").strip()
            if key.startswith("metadata."):
                key = key.removeprefix("metadata.")
            value = str(value_filter.get("value") or "")
            operator = str(value_filter.get("operator") or "contains")
            key_param = f"{prefix}_key_{index}"
            value_param = f"{prefix}_value_{index}"
            params[key_param] = key
            params[value_param] = value
            extracted = (
                f"({column} #>> string_to_array(%({key_param})s, '.'))"
                if key
                else f"({column})::text"
            )
            if operator == "exists":
                conditions.append(f"{extracted} IS NOT NULL")
            elif operator == "equals":
                conditions.append(f"COALESCE({extracted}, '') = %({value_param})s")
            else:
                params[value_param] = f"%{value}%"
                conditions.append(f"COALESCE({extracted}, '') ILIKE %({value_param})s")

    @staticmethod
    def _annotation_item_select_sql() -> str:
        return """
            SELECT
                aqi.id,
                aqi.project_id,
                aqi.queue_id,
                aqi.object_id,
                aqi.object_type::text AS object_type,
                aqi.status::text AS status,
                aqi.completed_at,
                aqi.created_at,
                aqi.updated_at,
                completed_user.id AS completed_by_id,
                completed_user.name AS completed_by_name,
                completed_user.email AS completed_by_email,
                assignee_user.id AS assignee_id,
                assignee_user.name AS assignee_name,
                assignee_user.email AS assignee_email,
                COALESCE(scores.scores, '[]'::jsonb) AS scores,
                COALESCE(scores.scores, '[]'::jsonb) <> '[]'::jsonb AS has_scores,
                CASE
                    WHEN aqi.object_type::text = 'TRACE' THEN COALESCE(t.name, t.id)
                    WHEN aqi.object_type::text = 'OBSERVATION' THEN COALESCE(o.name, o.id)
                    ELSE COALESCE(ts.id, aqi.object_id)
                END AS source_title,
                COALESCE(t.input, o.input) AS source_input,
                COALESCE(t.output, o.output) AS source_output,
                COALESCE(t.metadata, o.metadata, '{}'::jsonb) AS source_metadata,
                COALESCE(t.id, o.trace_id, trace_from_observation.id, '') AS trace_id,
                CASE
                    WHEN aqi.object_type::text = 'OBSERVATION' THEN aqi.object_id
                    ELSE ''
                END AS observation_id,
                COALESCE(t.session_id, trace_from_observation.session_id, ts.id, '')
                    AS session_id,
                COALESCE(t.user_id, trace_from_observation.user_id, '') AS user_id,
                COALESCE(
                    CASE
                        WHEN aqi.object_type::text = 'OBSERVATION'
                             AND o.end_time IS NOT NULL
                        THEN EXTRACT(EPOCH FROM (o.end_time - o.start_time)) * 1000
                        ELSE trace_latency.latency_ms
                    END,
                    0
                ) AS latency_ms,
                COALESCE(
                    o.total_cost,
                    o.calculated_total_cost,
                    trace_cost.total_cost,
                    0
                ) AS cost_usd,
                COALESCE(t.timestamp, o.start_time, ts.created_at, aqi.created_at)
                    AS source_created_at
            FROM annotation_queue_items aqi
            LEFT JOIN users completed_user ON completed_user.id = aqi.annotator_user_id
            LEFT JOIN pa_annotation_queue_item_assignments assignment
              ON assignment.project_id = aqi.project_id
             AND assignment.queue_id = aqi.queue_id
             AND assignment.item_id = aqi.id
            LEFT JOIN users assignee_user ON assignee_user.id = assignment.assignee_user_id
            LEFT JOIN traces t
                ON aqi.object_type::text = 'TRACE'
               AND t.project_id = aqi.project_id
               AND t.id = aqi.object_id
            LEFT JOIN observations o
                ON aqi.object_type::text = 'OBSERVATION'
               AND o.project_id = aqi.project_id
               AND o.id = aqi.object_id
            LEFT JOIN traces trace_from_observation
                ON trace_from_observation.project_id = aqi.project_id
               AND trace_from_observation.id = o.trace_id
            LEFT JOIN trace_sessions ts
                ON aqi.object_type::text = 'SESSION'
               AND ts.project_id = aqi.project_id
               AND ts.id = aqi.object_id
            LEFT JOIN LATERAL (
                SELECT EXTRACT(EPOCH FROM (MAX(end_time) - MIN(start_time))) * 1000
                    AS latency_ms
                FROM observations latency_observation
                WHERE latency_observation.project_id = aqi.project_id
                  AND latency_observation.trace_id = t.id
            ) trace_latency ON TRUE
            LEFT JOIN LATERAL (
                SELECT SUM(
                    COALESCE(total_cost, calculated_total_cost, 0)
                ) AS total_cost
                FROM observations cost_observation
                WHERE cost_observation.project_id = aqi.project_id
                  AND cost_observation.trace_id = COALESCE(t.id, o.trace_id)
            ) trace_cost ON TRUE
            LEFT JOIN LATERAL (
                SELECT JSONB_AGG(
                    JSONB_BUILD_OBJECT(
                        'id', s.id,
                        'configId', s.config_id,
                        'name', s.name,
                        'dataType', s.data_type::text,
                        'value', s.value,
                        'stringValue', COALESCE(s.string_value, ''),
                        'comment', COALESCE(s.comment, ''),
                        'authorUserId', COALESCE(s.author_user_id, ''),
                        'createdAt', s.created_at,
                        'updatedAt', s.updated_at
                    )
                    ORDER BY s.updated_at DESC, s.created_at DESC, s.id DESC
                ) AS scores
                FROM scores s
                WHERE s.project_id = aqi.project_id
                  AND s.queue_id = aqi.queue_id
                  AND s.source::text = 'ANNOTATION'
                  AND (
                    (
                        aqi.object_type::text = 'TRACE'
                        AND s.trace_id = aqi.object_id
                        AND s.observation_id IS NULL
                    )
                    OR (
                        aqi.object_type::text = 'OBSERVATION'
                        AND s.observation_id = aqi.object_id
                    )
                    OR (
                        aqi.object_type::text = 'SESSION'
                        AND s.trace_id = aqi.object_id
                    )
                  )
            ) scores ON TRUE
            """

    async def _fetch_all(
        self,
        sql: str,
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(sql, params or {})
                return list(await cursor.fetchall())

    async def _ensure_project_visible(self, project_id: str, user_id: str) -> None:
        rows = await self._fetch_all(
            f"""
            SELECT p.id
            FROM projects p
            WHERE p.id = %(project_id)s
              AND p.deleted_at IS NULL
              AND {PROJECT_ACCESS_EXISTS_SQL}
            LIMIT 1
            """,
            {"project_id": project_id, "user_id": user_id},
        )
        if not rows:
            raise BusinessError(
                code=1005,
                message="项目不存在或无访问权限",
                status_code=404,
            )

    async def _ensure_dataset_visible(self, project_id: str, dataset_id: str) -> None:
        rows = await self._fetch_all(
            """
            SELECT id
            FROM datasets
            WHERE project_id = %(project_id)s
              AND id = %(dataset_id)s
            LIMIT 1
            """,
            {"project_id": project_id, "dataset_id": dataset_id},
        )
        if not rows:
            raise BusinessError(
                code=1011,
                message="数据集不存在或无访问权限",
                status_code=404,
            )

    @staticmethod
    def _dataset_type_sql() -> str:
        return """
            CASE
                WHEN d.metadata->>'type' IN ('evaluation', 'badcase', 'golden', 'anomaly')
                THEN d.metadata->>'type'
                ELSE 'evaluation'
            END
        """

    def _build_dataset_filters(
        self,
        project_id: str,
        *,
        keyword: str | None = None,
        dataset_type: str | None = None,
    ) -> tuple[str, dict[str, Any]]:
        params: dict[str, Any] = {"project_id": project_id}
        clauses = ["d.project_id = %(project_id)s"]
        dataset_type_sql = self._dataset_type_sql()

        if keyword:
            params["keyword"] = keyword.lower()
            clauses.append(
                f"""
                (
                    POSITION(%(keyword)s IN lower(COALESCE(d.id, ''))) > 0
                    OR POSITION(%(keyword)s IN lower(COALESCE(d.name, ''))) > 0
                    OR POSITION(%(keyword)s IN lower(COALESCE(d.description, ''))) > 0
                    OR POSITION(%(keyword)s IN lower({dataset_type_sql})) > 0
                )
                """
            )

        if dataset_type:
            params["dataset_type"] = dataset_type
            clauses.append(f"{dataset_type_sql} = %(dataset_type)s")

        return "\n              AND ".join(clauses), params

    @staticmethod
    def _dataset_item_status_sql() -> str:
        return """
            CASE
                WHEN di.is_deleted IS TRUE
                  OR COALESCE(di.status::text, 'ACTIVE') = 'ARCHIVED'
                THEN 'ARCHIVED'
                ELSE 'ACTIVE'
            END
        """

    def _build_dataset_item_filters(
        self,
        project_id: str,
        dataset_id: str,
        *,
        keyword: str | None = None,
        status: list[str] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        params: dict[str, Any] = {
            "project_id": project_id,
            "dataset_id": dataset_id,
        }
        clauses = [
            "di.project_id = %(project_id)s",
            "di.dataset_id = %(dataset_id)s",
            "di.valid_to IS NULL",
        ]

        if keyword:
            params["keyword"] = keyword.lower()
            clauses.append(
                """
                (
                    POSITION(%(keyword)s IN lower(COALESCE(di.id, ''))) > 0
                    OR POSITION(%(keyword)s IN lower(COALESCE(di.source_trace_id, ''))) > 0
                    OR POSITION(%(keyword)s IN lower(COALESCE(di.source_observation_id, ''))) > 0
                    OR POSITION(%(keyword)s IN lower(COALESCE(di.input::text, ''))) > 0
                    OR POSITION(%(keyword)s IN lower(replace(COALESCE(di.input::text, ''), '"', ''''))) > 0
                    OR POSITION(%(keyword)s IN lower(COALESCE(di.expected_output::text, ''))) > 0
                    OR POSITION(%(keyword)s IN lower(replace(COALESCE(di.expected_output::text, ''), '"', ''''))) > 0
                    OR POSITION(%(keyword)s IN lower(COALESCE(di.metadata::text, ''))) > 0
                    OR POSITION(%(keyword)s IN lower(replace(COALESCE(di.metadata::text, ''), '"', ''''))) > 0
                )
                """
            )

        if status:
            params["statuses"] = status
            clauses.append(f"{self._dataset_item_status_sql()} = ANY(%(statuses)s)")

        return "\n              AND ".join(clauses), params

    @staticmethod
    async def _get_organization_for_user(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        organization_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        await cursor.execute(
            """
            SELECT o.id, o.name, om.role::text AS role
            FROM organizations o
            JOIN organization_memberships om
              ON om.org_id = o.id
             AND om.user_id = %(user_id)s
            WHERE o.id = %(organization_id)s
            LIMIT 1
            """,
            {"organization_id": organization_id, "user_id": user_id},
        )
        organization = await cursor.fetchone()
        if organization is None:
            raise BusinessError(
                code=1004,
                message="组织不存在或无访问权限",
                status_code=404,
            )
        return organization

    @staticmethod
    async def _get_project_detail_for_user(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        await cursor.execute(
            f"""
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
            WHERE p.id = %(project_id)s
              AND {PROJECT_ACCESS_EXISTS_SQL}
            LIMIT 1
            """,
            {"project_id": project_id, "user_id": user_id},
        )
        project = await cursor.fetchone()
        if project is None:
            raise BusinessError(
                code=1005,
                message="项目不存在或无访问权限",
                status_code=404,
            )
        return project

    async def _set_project_archive_state_for_user(
        self,
        project_id: str,
        user_id: str,
        user_email: str,
        archived: bool,
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                current = await self._get_project_detail_for_user(
                    cursor,
                    project_id,
                    user_id,
                )
                metadata = _merge_pa_eval_metadata(
                    current.get("metadata"),
                    {"updatedBy": user_email},
                )
                await cursor.execute(
                    """
                    UPDATE projects
                    SET
                        deleted_at = CASE WHEN %(archived)s THEN NOW() ELSE NULL END,
                        metadata = %(metadata)s,
                        updated_at = NOW()
                    WHERE id = %(project_id)s
                    RETURNING id, name, org_id, created_at, updated_at, deleted_at, metadata
                    """,
                    {
                        "project_id": project_id,
                        "archived": archived,
                        "metadata": Jsonb(metadata),
                    },
                )
                row = await cursor.fetchone()

        assert row is not None
        return self._to_project_payload(
            {**row, "organization_name": current["organization_name"]}
        )

    @staticmethod
    async def _get_llm_connection_row(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        connection_id: str,
    ) -> dict[str, Any]:
        await cursor.execute(
            """
            SELECT id, provider, adapter
            FROM pa_project_llm_connections
            WHERE project_id = %(project_id)s
              AND id = %(connection_id)s
              AND status = 'ACTIVE'
            LIMIT 1
            """,
            {"project_id": project_id, "connection_id": connection_id},
        )
        row = await cursor.fetchone()
        if row is None:
            raise BusinessError(
                code=1013,
                message="LLM 连接不存在或已不可用",
                status_code=404,
            )
        return row

    @staticmethod
    async def _get_project_for_user(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        await cursor.execute(
            f"""
            SELECT p.id, p.name
            FROM projects p
            WHERE p.id = %(project_id)s
              AND {PROJECT_ACCESS_EXISTS_SQL}
            LIMIT 1
            """,
            {"project_id": project_id, "user_id": user_id},
        )
        project = await cursor.fetchone()
        if project is None:
            raise BusinessError(
                code=1005,
                message="项目不存在或无访问权限",
                status_code=404,
            )
        return project

    @staticmethod
    async def _ensure_dataset_exists(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        dataset_id: str,
    ) -> None:
        await cursor.execute(
            """
            SELECT id
            FROM datasets
            WHERE project_id = %(project_id)s
              AND id = %(dataset_id)s
            LIMIT 1
            """,
            {"project_id": project_id, "dataset_id": dataset_id},
        )
        if await cursor.fetchone() is None:
            raise BusinessError(
                code=1011,
                message="数据集不存在或无访问权限",
                status_code=404,
            )

    async def _get_dataset_export_job_payload_cursor(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        dataset_id: str,
        job_id: str,
    ) -> dict[str, Any]:
        await cursor.execute(
            """
            SELECT
                id,
                project_id,
                dataset_id,
                format,
                status,
                total_count,
                exported_count,
                file_name,
                file_path,
                file_size,
                error_message,
                create_date,
                update_date,
                expires_at
            FROM pa_dataset_export_jobs
            WHERE project_id = %(project_id)s
              AND dataset_id = %(dataset_id)s
              AND id = %(job_id)s
            LIMIT 1
            """,
            {
                "project_id": project_id,
                "dataset_id": dataset_id,
                "job_id": job_id,
            },
        )
        row = await cursor.fetchone()
        if row is None:
            raise BusinessError(1027, "数据集导出任务不存在或无访问权限", 404)
        return self._to_dataset_export_job_payload(row)

    async def _execute_dataset_export_job_update(
        self,
        project_id: str,
        dataset_id: str,
        job_id: str,
        assignments_sql: str,
        params: dict[str, Any],
    ) -> None:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(
                    f"""
                    UPDATE pa_dataset_export_jobs
                    SET {assignments_sql}
                    WHERE project_id = %(project_id)s
                      AND dataset_id = %(dataset_id)s
                      AND id = %(job_id)s
                    """,
                    {
                        **params,
                        "project_id": project_id,
                        "dataset_id": dataset_id,
                        "job_id": job_id,
                    },
                )

    async def _get_annotation_export_job_payload_cursor(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        queue_id: str,
        job_id: str,
    ) -> dict[str, Any]:
        await cursor.execute(
            """
            SELECT
                id,
                project_id,
                queue_id,
                scope,
                format,
                status,
                total_count,
                exported_count,
                file_name,
                file_path,
                file_size,
                error_message,
                metadata,
                create_date,
                update_date,
                expires_at
            FROM pa_annotation_export_jobs
            WHERE project_id = %(project_id)s
              AND queue_id = %(queue_id)s
              AND id = %(job_id)s
            LIMIT 1
            """,
            {
                "project_id": project_id,
                "queue_id": queue_id,
                "job_id": job_id,
            },
        )
        row = await cursor.fetchone()
        if row is None:
            raise BusinessError(1032, "标注导出任务不存在或无访问权限", 404)
        return self._to_annotation_export_job_payload(row)

    async def _execute_annotation_export_job_update(
        self,
        project_id: str,
        queue_id: str,
        job_id: str,
        assignments_sql: str,
        params: dict[str, Any],
        *,
        status_condition_sql: str = "",
    ) -> None:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await connect_postgres(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(
                    f"""
                    UPDATE pa_annotation_export_jobs
                    SET {assignments_sql}
                    WHERE project_id = %(project_id)s
                      AND queue_id = %(queue_id)s
                      AND id = %(job_id)s
                      {status_condition_sql}
                    """,
                    {
                        **params,
                        "project_id": project_id,
                        "queue_id": queue_id,
                        "job_id": job_id,
                    },
                )
                if cursor.rowcount == 0:
                    if status_condition_sql:
                        await cursor.execute(
                            """
                            SELECT 1
                            FROM pa_annotation_export_jobs
                            WHERE project_id = %(project_id)s
                              AND queue_id = %(queue_id)s
                              AND id = %(job_id)s
                            LIMIT 1
                            """,
                            {
                                "project_id": project_id,
                                "queue_id": queue_id,
                                "job_id": job_id,
                            },
                        )
                        if await cursor.fetchone() is not None:
                            return
                    raise BusinessError(1032, "标注导出任务不存在或无访问权限", 404)

    @staticmethod
    async def _get_latest_evaluator_version(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        name: str,
        evaluator_type: str,
    ) -> int:
        await cursor.execute(
            """
            SELECT COALESCE(MAX(version), 0)::int AS latest_version
            FROM eval_templates
            WHERE project_id = %(project_id)s
              AND name = %(name)s
              AND type::text = %(type)s
            """,
            {
                "project_id": project_id,
                "name": name,
                "type": evaluator_type,
            },
        )
        row = await cursor.fetchone()
        return int((row or {}).get("latest_version") or 0)

    @staticmethod
    async def _validate_score_configs(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        score_config_ids: list[str],
    ) -> None:
        await cursor.execute(
            """
            SELECT id
            FROM score_configs
            WHERE project_id = %(project_id)s
              AND id = ANY(%(score_config_ids)s)
            """,
            {"project_id": project_id, "score_config_ids": score_config_ids},
        )
        rows = await cursor.fetchall()
        found = {row["id"] for row in rows}
        missing = [
            config_id for config_id in score_config_ids if config_id not in found
        ]
        if missing:
            raise BusinessError(
                code=1024,
                message="评分指标不存在或无访问权限",
                status_code=400,
            )

    @staticmethod
    async def _replace_annotation_assignments(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        queue_id: str,
        assignee_ids: list[str],
    ) -> None:
        await cursor.execute(
            """
            DELETE FROM annotation_queue_assignments
            WHERE project_id = %(project_id)s
              AND queue_id = %(queue_id)s
            """,
            {"project_id": project_id, "queue_id": queue_id},
        )
        for assignee_id in dict.fromkeys(assignee_ids):
            await cursor.execute(
                """
                INSERT INTO annotation_queue_assignments (
                    id,
                    project_id,
                    queue_id,
                    user_id,
                    created_at,
                    updated_at
                )
                VALUES (
                    %(id)s,
                    %(project_id)s,
                    %(queue_id)s,
                    %(user_id)s,
                    NOW(),
                    NOW()
                )
                """,
                {
                    "id": _new_langfuse_id("annassign"),
                    "project_id": project_id,
                    "queue_id": queue_id,
                    "user_id": assignee_id,
                },
            )

    @staticmethod
    async def _upsert_annotation_queue_settings(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        queue_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> None:
        assignee_ids = list(dict.fromkeys(payload.get("assigneeIds") or []))
        strategy = normalize_assignment_strategy(
            assignee_ids,
            payload.get("assignmentStrategy"),
        )
        weights = normalize_assignment_weights(
            assignee_ids,
            payload.get("assignmentWeights") or {},
        )
        await cursor.execute(
            """
            INSERT INTO pa_annotation_queue_settings (
                create_by,
                update_by,
                queue_id,
                project_id,
                assignment_strategy,
                assignment_weights
            )
            VALUES (
                %(user_id)s,
                %(user_id)s,
                %(queue_id)s,
                %(project_id)s,
                %(assignment_strategy)s,
                %(assignment_weights)s
            )
            ON CONFLICT (queue_id)
            DO UPDATE SET
                update_by = EXCLUDED.update_by,
                update_date = NOW(),
                project_id = EXCLUDED.project_id,
                assignment_strategy = EXCLUDED.assignment_strategy,
                assignment_weights = EXCLUDED.assignment_weights
            """,
            {
                "user_id": user_id,
                "project_id": project_id,
                "queue_id": queue_id,
                "assignment_strategy": strategy,
                "assignment_weights": Jsonb(weights),
            },
        )

    async def _assign_annotation_queue_items(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        queue_id: str,
        user_id: str,
        item_ids: list[str],
    ) -> None:
        if not item_ids:
            return

        assignee_ids = await self._get_annotation_queue_assignee_ids(
            cursor,
            project_id,
            queue_id,
        )
        if not assignee_ids:
            return

        strategy, weights = await self._get_annotation_queue_assignment_settings(
            cursor,
            project_id,
            queue_id,
            assignee_ids,
        )
        existing_counts = await self._get_annotation_queue_assignment_counts(
            cursor,
            project_id,
            queue_id,
        )
        assignments = plan_annotation_assignments(
            item_ids=item_ids,
            assignee_ids=assignee_ids,
            strategy=strategy,
            weights=weights,
            existing_counts=existing_counts,
        )
        if assignments:
            values_sql: list[str] = []
            params: dict[str, Any] = {
                "user_id": user_id,
                "project_id": project_id,
                "queue_id": queue_id,
            }
            for index, (item_id, assignee_id) in enumerate(assignments):
                params[f"id_{index}"] = _new_langfuse_id("paannassign")
                params[f"item_id_{index}"] = item_id
                params[f"assignee_id_{index}"] = assignee_id
                values_sql.append(
                    f"(%(user_id)s, %(user_id)s, %(id_{index})s, "
                    f"%(project_id)s, %(queue_id)s, %(item_id_{index})s, "
                    f"%(assignee_id_{index})s)"
                )
            await cursor.execute(
                f"""
                INSERT INTO pa_annotation_queue_item_assignments (
                    create_by,
                    update_by,
                    id,
                    project_id,
                    queue_id,
                    item_id,
                    assignee_user_id
                )
                VALUES {", ".join(values_sql)}
                ON CONFLICT (project_id, queue_id, item_id)
                DO UPDATE SET
                    update_by = EXCLUDED.update_by,
                    update_date = NOW(),
                    assignee_user_id = EXCLUDED.assignee_user_id
                """,
                params,
            )

    @staticmethod
    async def _get_annotation_queue_assignee_ids(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        queue_id: str,
    ) -> list[str]:
        await cursor.execute(
            """
            SELECT user_id
            FROM annotation_queue_assignments
            WHERE project_id = %(project_id)s
              AND queue_id = %(queue_id)s
            ORDER BY created_at, user_id
            """,
            {"project_id": project_id, "queue_id": queue_id},
        )
        return [row["user_id"] for row in await cursor.fetchall()]

    @staticmethod
    async def _get_annotation_queue_assignment_settings(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        queue_id: str,
        assignee_ids: list[str],
    ) -> tuple[str, dict[str, int]]:
        await cursor.execute(
            """
            SELECT assignment_strategy, assignment_weights
            FROM pa_annotation_queue_settings
            WHERE project_id = %(project_id)s
              AND queue_id = %(queue_id)s
            LIMIT 1
            """,
            {"project_id": project_id, "queue_id": queue_id},
        )
        row = await cursor.fetchone()
        strategy = normalize_assignment_strategy(
            assignee_ids,
            row.get("assignment_strategy") if row else None,
        )
        weights = normalize_assignment_weights(
            assignee_ids,
            row.get("assignment_weights") if row else {},
        )
        return strategy, weights

    @staticmethod
    async def _get_annotation_queue_assignment_counts(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        queue_id: str,
    ) -> dict[str, int]:
        await cursor.execute(
            """
            SELECT assignee_user_id, COUNT(*)::int AS count
            FROM pa_annotation_queue_item_assignments
            WHERE project_id = %(project_id)s
              AND queue_id = %(queue_id)s
            GROUP BY assignee_user_id
            """,
            {"project_id": project_id, "queue_id": queue_id},
        )
        return {
            row["assignee_user_id"]: row["count"] for row in await cursor.fetchall()
        }

    @staticmethod
    async def _get_annotation_queue_row(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        queue_id: str,
    ) -> dict[str, Any]:
        await cursor.execute(
            """
            SELECT id, name, score_config_ids
            FROM annotation_queues
            WHERE project_id = %(project_id)s
              AND id = %(queue_id)s
            LIMIT 1
            """,
            {"project_id": project_id, "queue_id": queue_id},
        )
        row = await cursor.fetchone()
        if row is None:
            raise BusinessError(
                code=1021,
                message="人工标注任务不存在或无访问权限",
                status_code=404,
            )
        return row

    @staticmethod
    async def _ensure_default_score_configs(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
    ) -> list[str]:
        await cursor.execute(
            """
            SELECT id
            FROM score_configs
            WHERE project_id = %(project_id)s
              AND is_archived IS FALSE
            ORDER BY created_at ASC, id ASC
            """,
            {"project_id": project_id},
        )
        rows = await cursor.fetchall()
        if rows:
            return [row["id"] for row in rows]

        config_id = _new_langfuse_id("scorecfg")
        await cursor.execute(
            """
            INSERT INTO score_configs (
                id,
                project_id,
                name,
                data_type,
                description,
                min_value,
                max_value,
                is_archived,
                created_at,
                updated_at
            )
            VALUES (
                %(id)s,
                %(project_id)s,
                '人工质量评分',
                'NUMERIC'::"ScoreConfigDataType",
                'Trace 人工标注默认评分指标',
                1,
                5,
                FALSE,
                NOW(),
                NOW()
            )
            """,
            {"id": config_id, "project_id": project_id},
        )
        return [config_id]

    @staticmethod
    async def _get_or_create_annotation_queue(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        queue_name: str,
        score_config_ids: list[str],
        user_id: str,
    ) -> str:
        await cursor.execute(
            """
            SELECT id, score_config_ids
            FROM annotation_queues
            WHERE project_id = %(project_id)s
              AND name = %(name)s
            LIMIT 1
            """,
            {"project_id": project_id, "name": queue_name},
        )
        existing = await cursor.fetchone()
        if existing is not None:
            if not existing.get("score_config_ids"):
                await cursor.execute(
                    """
                    UPDATE annotation_queues
                    SET score_config_ids = %(score_config_ids)s,
                        updated_at = NOW()
                    WHERE project_id = %(project_id)s
                      AND id = %(id)s
                    """,
                    {
                        "project_id": project_id,
                        "id": existing["id"],
                        "score_config_ids": score_config_ids,
                    },
                )
            return existing["id"]

        queue_id = _new_langfuse_id("annqueue")
        await cursor.execute(
            """
            INSERT INTO annotation_queues (
                id,
                project_id,
                name,
                description,
                score_config_ids,
                created_at,
                updated_at
            )
            VALUES (
                %(id)s,
                %(project_id)s,
                %(name)s,
                '从 Trace 页面批量创建的人工标注任务',
                %(score_config_ids)s,
                NOW(),
                NOW()
            )
            """,
            {
                "id": queue_id,
                "project_id": project_id,
                "name": queue_name,
                "score_config_ids": score_config_ids,
            },
        )
        await LangfuseDatabaseReader._replace_annotation_assignments(
            cursor,
            project_id,
            queue_id,
            [user_id],
        )
        return queue_id

    @staticmethod
    async def _get_annotation_item_score_context(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        queue_id: str,
        item_id: str,
    ) -> dict[str, Any]:
        await cursor.execute(
            """
            SELECT
                aqi.id,
                aqi.object_id,
                aqi.object_type::text AS object_type,
                aq.score_config_ids,
                o.trace_id AS observation_trace_id
            FROM annotation_queue_items aqi
            JOIN annotation_queues aq
              ON aq.project_id = aqi.project_id
             AND aq.id = aqi.queue_id
            LEFT JOIN observations o
              ON aqi.object_type::text = 'OBSERVATION'
             AND o.project_id = aqi.project_id
             AND o.id = aqi.object_id
            WHERE aqi.project_id = %(project_id)s
              AND aqi.queue_id = %(queue_id)s
              AND aqi.id = %(item_id)s
            LIMIT 1
            """,
            {
                "project_id": project_id,
                "queue_id": queue_id,
                "item_id": item_id,
            },
        )
        item = await cursor.fetchone()
        if item is None:
            raise BusinessError(
                code=1023,
                message="标注数据不存在或无访问权限",
                status_code=404,
            )
        resolved_trace_id = (
            item.get("observation_trace_id")
            if item["object_type"] == "OBSERVATION"
            else item["object_id"]
        )
        return {**item, "resolved_trace_id": resolved_trace_id}

    @staticmethod
    async def _get_score_config_row(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        config_id: str,
    ) -> dict[str, Any]:
        await cursor.execute(
            """
            SELECT
                id,
                name,
                data_type::text AS data_type,
                min_value,
                max_value,
                categories,
                is_archived
            FROM score_configs
            WHERE project_id = %(project_id)s
              AND id = %(config_id)s
            LIMIT 1
            """,
            {"project_id": project_id, "config_id": config_id},
        )
        config = await cursor.fetchone()
        if config is None:
            raise BusinessError(
                code=1024,
                message="评分指标不存在或无访问权限",
                status_code=400,
            )
        return config

    async def _get_score_config_payload_cursor(
        self,
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        config_id: str,
    ) -> dict[str, Any]:
        await cursor.execute(
            """
            SELECT
                id,
                project_id,
                name,
                data_type::text AS data_type,
                description,
                min_value,
                max_value,
                categories,
                is_archived,
                created_at,
                updated_at
            FROM score_configs
            WHERE project_id = %(project_id)s
              AND id = %(config_id)s
            LIMIT 1
            """,
            {"project_id": project_id, "config_id": config_id},
        )
        row = await cursor.fetchone()
        if row is None:
            raise BusinessError(1024, "评分指标不存在或无访问权限", 404)
        return self._to_score_config_payload(row)

    @staticmethod
    def _normalize_score_value(
        config: dict[str, Any] | str,
        value: Any,
        string_value: str,
    ) -> tuple[float | None, str | None]:
        if isinstance(config, str):
            data_type = config
            config_payload: dict[str, Any] = {"data_type": data_type}
        else:
            data_type = config.get("data_type") or config.get("dataType") or "NUMERIC"
            config_payload = config

        if data_type == "NUMERIC":
            numeric_value = float(value) if value is not None else None
            min_value = _to_float_or_none(config_payload.get("min_value"))
            max_value = _to_float_or_none(config_payload.get("max_value"))
            if numeric_value is not None:
                if min_value is not None and numeric_value < min_value:
                    raise BusinessError(1026, "评分值不能小于指标最小值", 400)
                if max_value is not None and numeric_value > max_value:
                    raise BusinessError(1026, "评分值不能大于指标最大值", 400)
            return (numeric_value, None)
        if data_type == "BOOLEAN":
            boolean_value = _parse_boolean_score_value(value, string_value)
            if boolean_value is None:
                return None, None
            numeric_value = 1.0 if boolean_value else 0.0
            return numeric_value, langfuse_boolean_label(numeric_value)
        if data_type == "CATEGORICAL":
            categories = _normalize_score_categories(config_payload.get("categories"))
            category = _find_score_category(categories, value, string_value)
            if category is None:
                raise BusinessError(1026, "分类评分值不在指标选项中", 400)
            return (float(category["value"]), str(category["label"]))
        if data_type == "TEXT":
            text_value = (string_value or "").strip()
            if len(text_value) > TEXT_SCORE_MAX_LENGTH:
                raise BusinessError(1026, "文本评分不能超过 500 个字符", 400)
            return (0.0, text_value or None)
        return None, string_value or None

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
        retention_days = (
            pa_eval.get("retentionDays") if isinstance(pa_eval, dict) else None
        )
        organization_name = row["organization_name"]

        return {
            "id": row["id"],
            "name": row["name"],
            "organizationId": row["org_id"],
            "organizationName": organization_name,
            "description": description or f"所属组织：{organization_name}",
            "retentionDays": retention_days or 14,
            "status": "archived" if row.get("deleted_at") else "active",
            "createdAt": _format_datetime(row["created_at"]),
            "updatedAt": _format_datetime(row["updated_at"]),
        }

    @staticmethod
    def _to_project_api_key_payload(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "projectId": row["project_id"],
            "note": row.get("note") or "",
            "publicKey": row["public_key"],
            "secretKey": row["secret_key"],
            "updatedBy": row.get("update_by") or "",
            "createdAt": _format_datetime(row["create_date"]),
            "updatedAt": _format_datetime(row["update_date"]),
        }

    @staticmethod
    def _to_llm_connection_payload(row: dict[str, Any]) -> dict[str, Any]:
        custom_models = row.get("custom_models") or []
        return {
            "id": row["id"],
            "provider": row["provider"],
            "adapter": row["adapter"],
            "displaySecretKey": _mask_secret(row.get("secret_key") or ""),
            "baseUrl": row.get("base_url") or "",
            "customModels": custom_models if isinstance(custom_models, list) else [],
            "withDefaultModels": bool(row.get("with_default_models")),
        }

    @staticmethod
    def _to_model_definition_payload(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "modelName": row["model_name"],
            "matchPattern": row.get("match_pattern") or "",
            "unit": row.get("unit") or "TOKENS",
            "inputPrice": row.get("input_price") or "",
            "outputPrice": row.get("output_price") or "",
            "tokenizerId": row.get("tokenizer_id") or "",
        }

    @staticmethod
    def _to_default_model_payload(
        row: dict[str, Any] | None,
        fallback_connection: dict[str, Any] | None,
        project_id: str,
    ) -> dict[str, Any]:
        if row is not None:
            return {
                "id": row.get("id") or f"pamodeldefault_{project_id}",
                "llmConnectionId": row.get("llm_connection_id") or "",
                "provider": row.get("provider") or "",
                "adapter": row.get("adapter") or "",
                "model": row.get("model") or "",
                "temperature": row.get("temperature") or "0.2",
            }

        fallback_models = (
            fallback_connection.get("customModels") if fallback_connection else []
        )
        return {
            "id": f"pamodeldefault_{project_id}",
            "llmConnectionId": fallback_connection["id"] if fallback_connection else "",
            "provider": fallback_connection["provider"] if fallback_connection else "",
            "adapter": fallback_connection["adapter"] if fallback_connection else "",
            "model": fallback_models[0] if fallback_models else "",
            "temperature": "0.2",
        }

    @staticmethod
    def _to_evaluator_payload(row: dict[str, Any]) -> dict[str, Any]:
        evaluator_type = row["type"]
        source_language = row.get("source_code_language")
        provider = row.get("provider")
        model = row.get("model")
        partner = row.get("partner")

        if evaluator_type == "CODE":
            description = f"Code / {source_language or 'UNKNOWN'}"
        elif provider or model:
            description = " / ".join(str(value) for value in [provider, model] if value)
        elif partner:
            description = f"Langfuse managed / {partner}"
        else:
            description = "LLM-as-Judge"

        return {
            "id": row["id"],
            "name": row["name"],
            "type": evaluator_type,
            "version": f"v{row['version']}",
            "variables": row.get("vars") or [],
            "inputVariables": row.get("vars") or [],
            "outputVariables": row.get("output_variables") or [],
            "description": description,
            "provider": "LANGFUSE",
            "projectId": row.get("project_id"),
            "projectName": row.get("project_name") or "Langfuse 全局模板",
            "usageCount": row.get("usage_count") or 0,
            "updatedAt": _format_datetime(row["updated_at"]),
        }

    @staticmethod
    def _to_pa_evaluator_payload(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "name": row["name"],
            "type": row["type"],
            "version": f"v{row['version']}",
            "variables": row.get("variables") or [],
            "inputVariables": row.get("variables") or [],
            "outputVariables": row.get("output_variables") or [],
            "outputVariableMappings": _output_variable_mappings_from_config(
                row.get("config")
            ),
            "description": row.get("description") or "",
            "provider": row["provider"],
            "projectId": row.get("project_id"),
            "projectName": row.get("project_name") or "默认项目",
            "usageCount": 0,
            "updatedAt": _format_datetime(row["updated_at"]),
        }

    @staticmethod
    def _to_dataset_payload(row: dict[str, Any]) -> dict[str, Any]:
        metadata = row.get("metadata") or {}
        dataset_type = "evaluation"
        if isinstance(metadata, dict):
            raw_type = metadata.get("type")
            if raw_type in {"evaluation", "badcase", "golden", "anomaly"}:
                dataset_type = raw_type

        return {
            "id": row["id"],
            "projectId": row["project_id"],
            "name": row["name"],
            "description": row.get("description") or "",
            "type": dataset_type,
            "metadata": {
                **metadata,
                "type": dataset_type,
            }
            if isinstance(metadata, dict)
            else {"type": dataset_type},
            "inputSchema": row.get("input_schema") or {},
            "expectedOutputSchema": row.get("expected_output_schema") or {},
            "itemCount": row.get("item_count") or 0,
            "runCount": row.get("run_count") or 0,
            "createdAt": _format_datetime(row["created_at"]),
            "updatedAt": _format_datetime(row["updated_at"]),
        }

    @staticmethod
    def _to_dataset_item_payload(row: dict[str, Any]) -> dict[str, Any]:
        raw_status = row.get("status")
        status = (
            "ARCHIVED"
            if row.get("is_deleted") or raw_status == "ARCHIVED"
            else "ACTIVE"
        )

        return {
            "id": row["id"],
            "projectId": row["project_id"],
            "datasetId": row["dataset_id"],
            "status": status,
            "input": row.get("input"),
            "expectedOutput": row.get("expected_output"),
            "metadata": row.get("metadata") or {},
            "sourceTraceId": row.get("source_trace_id") or "",
            "sourceObservationId": row.get("source_observation_id") or "",
            "createdAt": _format_datetime(row["created_at"]),
            "updatedAt": _format_datetime(row["updated_at"]),
        }

    @staticmethod
    def _to_dataset_export_job_payload(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "projectId": row["project_id"],
            "datasetId": row["dataset_id"],
            "format": row["format"],
            "status": row["status"],
            "totalCount": row.get("total_count") or 0,
            "exportedCount": row.get("exported_count") or 0,
            "fileName": row.get("file_name") or "",
            "filePath": row.get("file_path") or "",
            "fileSize": row.get("file_size") or 0,
            "errorMessage": row.get("error_message") or "",
            "createdAt": _format_datetime(row["create_date"]),
            "updatedAt": _format_datetime(row["update_date"]),
            "expiresAt": _format_datetime(row["expires_at"]),
        }

    @staticmethod
    def _to_annotation_export_job_payload(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "projectId": row["project_id"],
            "queueId": row["queue_id"],
            "scope": row["scope"],
            "format": row["format"],
            "status": row["status"],
            "totalCount": row.get("total_count") or 0,
            "exportedCount": row.get("exported_count") or 0,
            "fileName": row.get("file_name") or "",
            "filePath": row.get("file_path") or "",
            "fileSize": row.get("file_size") or 0,
            "errorMessage": row.get("error_message") or "",
            "metadata": row.get("metadata") or {},
            "createdAt": _format_datetime(row["create_date"]),
            "updatedAt": _format_datetime(row["update_date"]),
            "expiresAt": _format_datetime(row["expires_at"]),
        }

    @staticmethod
    def _to_trace_bulk_job_payload(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "projectId": row["project_id"],
            "userId": row["user_id"],
            "jobType": row["job_type"],
            "status": row["status"],
            "selectionType": row["selection_type"],
            "selectionPayload": row.get("selection_payload") or {},
            "operationPayload": row.get("operation_payload") or {},
            "cursorPayload": row.get("cursor_payload") or {},
            "resultPayload": row.get("result_payload") or {},
            "totalCount": int(row.get("total_count") or 0),
            "completedCount": int(row.get("completed_count") or 0),
            "successCount": int(row.get("success_count") or 0),
            "failureCount": int(row.get("failure_count") or 0),
            "attemptCount": int(row.get("attempt_count") or 0),
            "errorMessage": row.get("error_message") or "",
            "createdAt": _format_datetime(row["create_date"]),
            "updatedAt": _format_datetime(row["update_date"]),
            "startedAt": _format_datetime(row.get("started_at")),
            "completedAt": _format_datetime(row.get("completed_at")),
            "expiresAt": _format_datetime(row["expires_at"]),
            "lockOwner": row.get("lock_owner") or "",
            "lockUntil": _format_datetime(row.get("lock_until")),
        }

    @staticmethod
    def _to_score_config_payload(row: dict[str, Any]) -> dict[str, Any]:
        data_type = row["data_type"]
        return {
            "id": row["id"],
            "projectId": row["project_id"],
            "name": row["name"],
            "dataType": data_type,
            "description": row.get("description") or "",
            "minValue": _to_float_or_none(row.get("min_value")),
            "maxValue": _to_float_or_none(row.get("max_value")),
            "categories": (
                langfuse_boolean_categories()
                if data_type == "BOOLEAN"
                else _normalize_score_categories(row.get("categories"))
            ),
            "archived": bool(row.get("is_archived")),
            "createdAt": _format_datetime(row["created_at"]),
            "updatedAt": _format_datetime(row["updated_at"]),
        }

    @staticmethod
    def _to_project_user_payload(row: dict[str, Any]) -> dict[str, Any]:
        email = row.get("email") or ""
        return {
            "id": row["id"],
            "name": row.get("name") or email.split("@")[0] or row["id"],
            "email": email,
            "role": row.get("role"),
            "organizationRole": row.get("organization_role"),
            "projectRole": row.get("project_role"),
            "status": "active",
        }

    @staticmethod
    def _to_project_invitation_payload(row: dict[str, Any]) -> dict[str, Any]:
        email = row.get("email") or ""
        project_role = row.get("project_role")
        invited_by_name = row.get("invited_by_name")
        invited_by_email = row.get("invited_by_email")
        return {
            "id": row["id"],
            "name": email.split("@")[0] or row["id"],
            "email": email,
            "role": project_role,
            "organizationRole": row.get("org_role"),
            "projectRole": project_role,
            "status": "pending",
            "invitedBy": {
                "name": invited_by_name,
                "email": invited_by_email,
            },
            "createdAt": _format_datetime(row.get("created_at")),
        }

    @staticmethod
    def _to_annotation_queue_payload(row: dict[str, Any]) -> dict[str, Any]:
        score_configs = [
            _normalize_score_config_object(config)
            for config in (row.get("score_configs") or [])
        ]
        assignees = [
            {
                "id": assignee.get("id") or "",
                "name": assignee.get("name") or assignee.get("email") or "",
                "email": assignee.get("email") or "",
            }
            for assignee in (row.get("assignees") or [])
        ]

        return {
            "id": row["id"],
            "projectId": row["project_id"],
            "name": row["name"],
            "description": row.get("description") or "",
            "scoreConfigIds": row.get("score_config_ids") or [],
            "assigneeIds": row.get("assignee_ids") or [],
            "assignmentStrategy": row.get("assignment_strategy") or "average",
            "assignmentWeights": row.get("assignment_weights") or {},
            "completedCount": row.get("completed_count") or 0,
            "pendingCount": row.get("pending_count") or 0,
            "scoreConfigs": score_configs,
            "assignees": assignees,
            "createdAt": _format_datetime(row["created_at"]),
            "updatedAt": _format_datetime(row["updated_at"]),
        }

    @staticmethod
    def _to_annotation_item_payload(row: dict[str, Any]) -> dict[str, Any]:
        completed_by = None
        if row.get("completed_by_id"):
            completed_by = {
                "id": row["completed_by_id"],
                "name": row.get("completed_by_name")
                or row.get("completed_by_email")
                or row["completed_by_id"],
                "email": row.get("completed_by_email") or "",
            }
        assignee = None
        if row.get("assignee_id"):
            assignee = {
                "id": row["assignee_id"],
                "name": row.get("assignee_name")
                or row.get("assignee_email")
                or row["assignee_id"],
                "email": row.get("assignee_email") or "",
            }

        return {
            "id": row["id"],
            "projectId": row["project_id"],
            "queueId": row["queue_id"],
            "objectId": row["object_id"],
            "objectType": row["object_type"],
            "status": row["status"],
            "source": {
                "objectId": row["object_id"],
                "objectType": row["object_type"],
                "title": row.get("source_title") or row["object_id"],
                "input": row.get("source_input"),
                "output": row.get("source_output"),
                "metadata": row.get("source_metadata") or {},
                "traceId": row.get("trace_id") or "",
                "observationId": row.get("observation_id") or "",
                "sessionId": row.get("session_id") or "",
                "userId": row.get("user_id") or "",
                "latencyMs": int(float(row.get("latency_ms") or 0)),
                "costUsd": float(row.get("cost_usd") or 0),
                "createdAt": _format_datetime(row["source_created_at"]),
            },
            "scores": [
                _normalize_annotation_score_object(score)
                for score in (row.get("scores") or [])
            ],
            "completedAt": _format_datetime(row["completed_at"])
            if row.get("completed_at")
            else "",
            "completedBy": completed_by,
            "assignee": assignee,
            "createdAt": _format_datetime(row["created_at"]),
            "updatedAt": _format_datetime(row["updated_at"]),
        }

    @staticmethod
    def _redact_evaluator_config(config: dict[str, Any]) -> dict[str, Any]:
        redacted = dict(config)
        auth_token = redacted.pop("authToken", None)
        redacted["hasAuthToken"] = bool(auth_token)
        return redacted

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

    @staticmethod
    def _to_organization_invitation_payload(row: dict[str, Any]) -> dict[str, Any]:
        email = row.get("email") or ""
        invited_by_name = row.get("invited_by_name")
        invited_by_email = row.get("invited_by_email")
        return {
            "id": row["id"],
            "organizationId": row["org_id"],
            "userId": "",
            "name": email.split("@")[0] or "待邀请用户",
            "email": email,
            "role": row.get("org_role") or "NONE",
            "status": "INVITED",
            "joinedAt": "",
            "createdAt": _format_datetime(row["created_at"]),
            "updatedAt": _format_datetime(row["updated_at"]),
            "invitedBy": {
                "name": invited_by_name,
                "email": invited_by_email,
            },
            "projectId": row.get("project_id"),
            "projectRole": row.get("project_role"),
        }


def _format_datetime(value: Any) -> str:
    if isinstance(value, datetime):
        formatted = value.isoformat(timespec="milliseconds")
        if value.tzinfo is None:
            return f"{formatted}Z"
        return formatted.replace("+00:00", "Z")
    return str(value)


def _organization_member_account(payload: dict[str, Any]) -> str:
    name = str(payload.get("name") or "").strip()
    if name:
        return name
    email = str(payload.get("email") or "").strip()
    return email.split("@")[0] or "user"


def _create_sha_hash(secret_key: str, salt: str) -> str:
    salt_hash = hashlib.sha256(salt.encode("utf-8")).hexdigest()
    return hashlib.sha256((secret_key + salt_hash).encode("utf-8")).hexdigest()


def _display_secret_key(secret_key: str) -> str:
    return f"{secret_key[:6]}...{secret_key[-4:]}"


def _to_float_or_none(value: Any) -> float | None:
    if value is None:
        return None
    if value == "":
        return None
    return float(value)


def _parse_boolean_score_value(value: Any, string_value: str = "") -> bool | None:
    candidate = value if value is not None else string_value
    if candidate is None:
        return None
    if isinstance(candidate, bool):
        return candidate
    if isinstance(candidate, (int, float)):
        if candidate == 1:
            return True
        if candidate == 0:
            return False
        return None
    if isinstance(candidate, str):
        normalized = candidate.strip().lower()
        if not normalized:
            return None
        if normalized in {"1", "true", "yes", "y", "是"}:
            return True
        if normalized in {"0", "false", "no", "n", "否"}:
            return False
    return None


def _normalize_score_categories(value: Any) -> list[dict[str, float | str]]:
    if not isinstance(value, list):
        return []

    categories: list[dict[str, float | str]] = []
    for index, item in enumerate(value):
        if isinstance(item, str):
            categories.append(_legacy_string_score_category(item, index))
        elif isinstance(item, dict):
            label = str(item.get("label") or item.get("value") or "").strip()
            raw_value = item.get("value")
            if not label:
                continue
            try:
                numeric_value = float(raw_value)
            except (TypeError, ValueError):
                numeric_value = float(index + 1)
            categories.append({"label": label, "value": numeric_value})
    return categories


def _normalize_score_config_object(config: dict[str, Any]) -> dict[str, Any]:
    data_type = config.get("dataType") or "NUMERIC"
    return {
        "id": config.get("id") or "",
        "projectId": config.get("projectId") or "",
        "name": config.get("name") or "",
        "dataType": data_type,
        "description": config.get("description") or "",
        "minValue": _to_float_or_none(config.get("minValue")),
        "maxValue": _to_float_or_none(config.get("maxValue")),
        "categories": (
            langfuse_boolean_categories()
            if data_type == "BOOLEAN"
            else _normalize_score_categories(config.get("categories"))
        ),
        "archived": bool(config.get("archived")),
    }


def _legacy_string_score_category(
    item: str,
    index: int,
) -> dict[str, float | str]:
    raw_value, separator, raw_label = item.partition("|")
    label = (raw_label if separator else raw_value).strip()
    value_candidate = raw_value.strip()
    try:
        numeric_value = float(value_candidate)
    except ValueError:
        numeric_value = float(index + 1)
    return {"label": label or value_candidate, "value": numeric_value}


def _find_score_category(
    categories: list[dict[str, float | str]],
    value: Any,
    string_value: str,
) -> dict[str, float | str] | None:
    label_candidate = (string_value or "").strip()
    numeric_candidate: float | None = None
    if value is not None:
        try:
            numeric_candidate = float(value)
        except (TypeError, ValueError):
            label_candidate = str(value).strip()

    for category in categories:
        category_label = str(category["label"])
        category_value = float(category["value"])
        if label_candidate and label_candidate == category_label:
            return category
        if numeric_candidate is not None and numeric_candidate == category_value:
            return category
    return None


def _normalize_annotation_score_object(score: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": score.get("id") or "",
        "configId": score.get("configId") or "",
        "name": score.get("name") or "",
        "dataType": score.get("dataType") or "NUMERIC",
        "value": score.get("value"),
        "stringValue": score.get("stringValue") or "",
        "comment": score.get("comment") or "",
        "authorUserId": score.get("authorUserId") or "",
        "createdAt": _format_datetime(score.get("createdAt")),
        "updatedAt": _format_datetime(score.get("updatedAt")),
    }


def _annotation_score_api_payload(
    *,
    project_id: str,
    queue_id: str,
    item_id: str,
    user_id: str,
    trace_id: str | None,
    observation_id: str | None,
    session_id: str | None,
    config: dict[str, Any],
    config_id: str,
    value: float | None,
    string_value: str | None,
    comment: str,
) -> dict[str, Any]:
    data_type = config.get("data_type") or "NUMERIC"
    score_value: float | int | str | None
    boolean_string_value: str | None = None
    if data_type == "BOOLEAN":
        score_value = 1 if value == 1 else 0
        boolean_string_value = langfuse_boolean_label(score_value)
    elif data_type in {"CATEGORICAL", "TEXT"}:
        score_value = string_value or ""
    else:
        score_value = value

    payload = {
        "id": _annotation_score_id(
            project_id=project_id,
            queue_id=queue_id,
            item_id=item_id,
            config_id=config_id,
            trace_id=trace_id or "",
            observation_id=observation_id or "",
            session_id=session_id or "",
        ),
        "name": config["name"],
        "value": score_value,
        "dataType": data_type,
        "source": "ANNOTATION",
        "configId": config_id,
        "queueId": queue_id,
        "comment": comment,
        "metadata": {
            "annotationItemId": item_id,
            "annotatorUserId": user_id,
        },
        PA_CLICKHOUSE_SCORE_VALUE: value,
    }
    if boolean_string_value is not None:
        payload["stringValue"] = boolean_string_value
        if config.get("categories") is not None and not is_langfuse_boolean_categories(
            config.get("categories")
        ):
            payload[PA_BOOLEAN_SCORE_CONFIG_REPAIR_MARKER] = True
    elif data_type in {"CATEGORICAL", "TEXT"} and string_value is not None:
        payload["stringValue"] = string_value
    if session_id:
        payload["sessionId"] = session_id
    else:
        payload["traceId"] = trace_id
        if observation_id:
            payload["observationId"] = observation_id
    return payload


async def _copy_existing_annotation_scores_for_item(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    *,
    project_id: str,
    queue_id: str,
    item_id: str,
    object_id: str,
    object_type: str,
    score_config_ids: list[str],
) -> int:
    return await _copy_existing_annotation_scores_for_items(
        cursor,
        project_id=project_id,
        queue_id=queue_id,
        items=[
            {
                "itemId": item_id,
                "objectId": object_id,
                "objectType": object_type,
            }
        ],
        score_config_ids=score_config_ids,
    )


async def _copy_existing_annotation_scores_for_items(
    cursor: psycopg.AsyncCursor[dict[str, Any]],
    *,
    project_id: str,
    queue_id: str,
    items: list[dict[str, str]],
    score_config_ids: list[str],
) -> int:
    if not score_config_ids or not items:
        return 0
    candidate_values: list[str] = []
    params: dict[str, Any] = {
        "project_id": project_id,
        "queue_id": queue_id,
        "score_config_ids": score_config_ids,
    }
    for index, item in enumerate(items):
        params[f"item_id_{index}"] = item["itemId"]
        params[f"object_id_{index}"] = item["objectId"]
        params[f"object_type_{index}"] = item["objectType"]
        candidate_values.append(
            f"(%(item_id_{index})s, %(object_id_{index})s, %(object_type_{index})s)"
        )
    await cursor.execute(
        f"""
        WITH candidates(item_id, object_id, object_type) AS (
            VALUES {", ".join(candidate_values)}
        )
        SELECT DISTINCT ON (candidate.item_id, s.config_id)
            candidate.item_id,
            candidate.object_id,
            candidate.object_type,
            s.config_id,
            s.name,
            s.value,
            s.data_type::text AS data_type,
            s.string_value,
            s.comment,
            s.author_user_id,
            s.trace_id,
            s.observation_id
        FROM candidates candidate
        JOIN scores s ON (
            (candidate.object_type = 'TRACE'
             AND s.trace_id = candidate.object_id
             AND s.observation_id IS NULL)
            OR (candidate.object_type = 'OBSERVATION'
                AND s.observation_id = candidate.object_id)
            OR (candidate.object_type = 'SESSION'
                AND s.trace_id = candidate.object_id)
        )
        WHERE s.project_id = %(project_id)s
          AND s.source::text = 'ANNOTATION'
          AND s.config_id = ANY(%(score_config_ids)s)
          AND COALESCE(s.queue_id, '') <> %(queue_id)s
        ORDER BY candidate.item_id, s.config_id,
                 s.updated_at DESC, s.created_at DESC, s.id DESC
        """,
        params,
    )
    rows = list(await cursor.fetchall())
    insert_values: list[str] = []
    insert_params: dict[str, Any] = {"project_id": project_id, "queue_id": queue_id}
    for index, row in enumerate(rows):
        config_id = str(row.get("config_id") or "").strip()
        if not config_id:
            continue
        item_id = str(row.get("item_id") or items[0]["itemId"])
        object_id = str(row.get("object_id") or items[0]["objectId"])
        object_type = str(row.get("object_type") or items[0]["objectType"])
        trace_id = str(row.get("trace_id") or object_id)
        observation_id = str(row.get("observation_id") or "")
        session_id = object_id if object_type == "SESSION" else ""
        insert_params[f"id_{index}"] = _annotation_score_id(
            project_id=project_id,
            queue_id=queue_id,
            item_id=item_id,
            config_id=config_id,
            trace_id=trace_id,
            observation_id=observation_id,
            session_id=session_id,
        )
        for key in (
            "name",
            "value",
            "author_user_id",
            "comment",
            "string_value",
            "data_type",
        ):
            insert_params[f"{key}_{index}"] = row.get(key)
        insert_params[f"name_{index}"] = row.get("name") or ""
        insert_params[f"data_type_{index}"] = row.get("data_type") or "NUMERIC"
        insert_params[f"trace_id_{index}"] = trace_id
        insert_params[f"observation_id_{index}"] = observation_id or None
        insert_params[f"config_id_{index}"] = config_id
        insert_values.append(
            f"(%(id_{index})s, NOW(), %(project_id)s, %(name_{index})s, "
            f"%(value_{index})s, 'ANNOTATION'::\"ScoreSource\", "
            f"%(author_user_id_{index})s, %(comment_{index})s, "
            f"%(trace_id_{index})s, %(observation_id_{index})s, "
            f"%(config_id_{index})s, %(string_value_{index})s, %(queue_id)s, "
            f'NOW(), NOW(), %(data_type_{index})s::"ScoreConfigDataType")'
        )
    if insert_values:
        await cursor.execute(
            f"""
            INSERT INTO scores (
                id,
                timestamp,
                project_id,
                name,
                value,
                source,
                author_user_id,
                comment,
                trace_id,
                observation_id,
                config_id,
                string_value,
                queue_id,
                created_at,
                updated_at,
                data_type
            )
            VALUES {", ".join(insert_values)}
            ON CONFLICT (id) DO NOTHING
            """,
            insert_params,
        )
    return len(insert_values)


def _annotation_score_id(
    *,
    project_id: str,
    queue_id: str,
    item_id: str,
    config_id: str,
    trace_id: str,
    observation_id: str,
    session_id: str,
) -> str:
    raw = "|".join(
        [project_id, queue_id, item_id, config_id, trace_id, observation_id, session_id]
    )
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]
    return f"pa-ann-score-{digest}"


def _decode_jsonish(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    stripped = value.strip()
    if not stripped:
        return None
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return stripped


def _score_config_storage_payload(payload: dict[str, Any]) -> dict[str, Any]:
    data_type = payload["dataType"]
    min_value = payload.get("minValue") if data_type == "NUMERIC" else None
    max_value = payload.get("maxValue") if data_type == "NUMERIC" else None
    categories: Jsonb | None = None
    if data_type == "BOOLEAN":
        categories = Jsonb(langfuse_boolean_categories())
    elif data_type == "CATEGORICAL":
        categories = Jsonb(_normalize_score_categories(payload.get("categories") or []))

    return {
        "name": payload["name"],
        "data_type": data_type,
        "description": payload.get("description") or "",
        "min_value": min_value,
        "max_value": max_value,
        "categories": categories,
    }


def _output_variable_mappings_from_config(value: Any) -> list[dict[str, Any]]:
    config = value if isinstance(value, dict) else {}
    mappings = config.get("outputVariableMappings")
    if not isinstance(mappings, list):
        return []

    normalized: list[dict[str, Any]] = []
    for item in mappings:
        if not isinstance(item, dict):
            continue
        variable_name = str(item.get("variableName") or "").strip()
        score_config_name = str(item.get("scoreConfigName") or "").strip()
        if not variable_name or not score_config_name:
            continue
        mapping = {
            "variableName": variable_name,
            "scoreConfigName": score_config_name,
        }
        score_config_id = str(item.get("scoreConfigId") or "").strip()
        if score_config_id:
            mapping["scoreConfigId"] = score_config_id
        normalized.append(mapping)
    return normalized


def _trace_dataset_metadata(trace: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": "trace_log_bulk",
        "traceId": trace.get("traceId") or "",
        "sessionId": trace.get("sessionId") or "",
        "userId": trace.get("userId") or "",
        "businessId": trace.get("businessId") or "",
        "environment": trace.get("environment") or "",
        "status": trace.get("status") or "",
        "latencyMs": trace.get("latency") or 0,
        "tags": trace.get("tags") or [],
        "traceMetadata": trace.get("metadata") or {},
        "createdAt": trace.get("createdAt") or "",
    }


def _chunk_items(items: list[Any], size: int) -> list[list[Any]]:
    return [items[start : start + size] for start in range(0, len(items), size)]


def _unique_traces_by_trace_id(traces: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique_traces: list[dict[str, Any]] = []
    seen_trace_ids: set[str] = set()
    for trace in traces:
        trace_id = str(trace.get("traceId") or "")
        if not trace_id or trace_id in seen_trace_ids:
            continue
        seen_trace_ids.add(trace_id)
        unique_traces.append(trace)
    return unique_traces


def _merge_pa_eval_metadata(
    metadata: dict[str, Any] | None,
    values: dict[str, Any],
) -> dict[str, Any]:
    merged = dict(metadata or {})
    current_pa_eval = merged.get("paEval")
    pa_eval = dict(current_pa_eval) if isinstance(current_pa_eval, dict) else {}
    pa_eval.update({key: value for key, value in values.items() if value is not None})
    merged["paEval"] = pa_eval
    return merged


def _mask_secret(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 4:
        return "****"
    return f"{value[:3]}...{value[-4:]}"


def _new_langfuse_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


async def get_langfuse_db_reader(
    settings: Settings = Depends(get_settings),
) -> LangfuseDatabaseReader:
    return LangfuseDatabaseReader(settings)
