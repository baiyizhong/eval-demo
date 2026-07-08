import json
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import psycopg
from fastapi import Depends
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.config import Settings, get_settings
from app.errors import BusinessError


PROJECT_ACCESS_EXISTS_SQL = """
EXISTS (
    SELECT 1
    FROM organization_memberships om
    LEFT JOIN project_memberships pm
      ON pm.org_membership_id = om.id
     AND pm.project_id = p.id
     AND pm.user_id = om.user_id
    WHERE om.org_id = p.org_id
      AND om.user_id = %(user_id)s
      AND (
        om.role::text <> 'NONE'
        OR pm.role::text <> 'NONE'
      )
)
"""

LANGFUSE_BOOLEAN_SCORE_CATEGORIES = [
    {"label": "True", "value": 1},
    {"label": "False", "value": 0},
]
TEXT_SCORE_MAX_LENGTH = 500


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
        async with await psycopg.AsyncConnection.connect(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                organization = await self._get_organization_for_user(
                    cursor,
                    organization_id,
                    user_id,
                )
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

        async with await psycopg.AsyncConnection.connect(
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

        key_id = _new_langfuse_id("papikey")
        public_key = f"pk-lf-{uuid4()}"
        secret_key = f"sk-lf-{uuid4()}"

        async with await psycopg.AsyncConnection.connect(
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

        async with await psycopg.AsyncConnection.connect(
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

        async with await psycopg.AsyncConnection.connect(
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
                    RETURNING id
                    """,
                    {"id": key_id, "project_id": project_id},
                )
                row = await cursor.fetchone()

        if row is None:
            raise BusinessError(
                code=1012,
                message="项目 API Key 不存在或无访问权限",
                status_code=404,
            )
        return {"id": row["id"]}

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
        async with await psycopg.AsyncConnection.connect(
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
        async with await psycopg.AsyncConnection.connect(
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

        async with await psycopg.AsyncConnection.connect(
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

        async with await psycopg.AsyncConnection.connect(
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
        async with await psycopg.AsyncConnection.connect(
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

        async with await psycopg.AsyncConnection.connect(
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

        async with await psycopg.AsyncConnection.connect(
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
    ) -> list[dict[str, Any]]:
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
            ORDER BY d.updated_at DESC, d.created_at DESC, d.id DESC
            """,
            {"project_id": project_id},
        )
        return [self._to_dataset_payload(row) for row in rows]

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

        async with await psycopg.AsyncConnection.connect(
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
            async with await psycopg.AsyncConnection.connect(
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
            async with await psycopg.AsyncConnection.connect(
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

        async with await psycopg.AsyncConnection.connect(
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
    ) -> list[dict[str, Any]]:
        await self.get_dataset_for_user(project_id, dataset_id, user_id)
        rows = await self._fetch_all(
            """
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
            ORDER BY di.updated_at DESC, di.created_at DESC, di.id DESC
            """,
            {"project_id": project_id, "dataset_id": dataset_id},
        )
        return [self._to_dataset_item_payload(row) for row in rows]

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
        async with await psycopg.AsyncConnection.connect(
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
                        'ACTIVE'::"DatasetStatus",
                        %(input)s,
                        %(expected_output)s,
                        %(metadata)s,
                        '',
                        '',
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
                        "input": Jsonb(payload.get("input")),
                        "expected_output": Jsonb(payload.get("expectedOutput")),
                        "metadata": Jsonb(payload.get("metadata") or {}),
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

        async with await psycopg.AsyncConnection.connect(
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
                        "input": Jsonb(payload.get("input")),
                        "expected_output": Jsonb(payload.get("expectedOutput")),
                        "metadata": Jsonb(payload.get("metadata") or {}),
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

        async with await psycopg.AsyncConnection.connect(
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
        async with await psycopg.AsyncConnection.connect(
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

        async with await psycopg.AsyncConnection.connect(
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

        async with await psycopg.AsyncConnection.connect(
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
        async with await psycopg.AsyncConnection.connect(
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

        async with await psycopg.AsyncConnection.connect(
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

        async with await psycopg.AsyncConnection.connect(
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
        rows = await self._fetch_all(
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
             AND pm.user_id = om.user_id
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
        return [self._to_project_user_payload(row) for row in rows]

    async def create_project_member_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await psycopg.AsyncConnection.connect(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                project = await self._get_project_detail_for_user(
                    cursor,
                    project_id,
                    user_id,
                )
                member = await self._get_user_by_email_cursor(cursor, payload["email"])
                if member is None:
                    raise BusinessError(1015, "用户不存在，请先让该用户登录 Langfuse", 404)
                org_membership = await self._ensure_project_org_membership(
                    cursor,
                    project["org_id"],
                    member["id"],
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

        async with await psycopg.AsyncConnection.connect(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await cursor.execute(
                    """
                    UPDATE project_memberships
                    SET role = %(role)s::"Role",
                        updated_at = NOW()
                    WHERE project_id = %(project_id)s
                      AND user_id = %(member_id)s
                    RETURNING user_id
                    """,
                    {
                        "project_id": project_id,
                        "member_id": member_id,
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

        async with await psycopg.AsyncConnection.connect(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
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
        rows = await self._fetch_all(
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
             AND pm.user_id = om.user_id
            JOIN users u ON u.id = om.user_id
            WHERE p.id = %(project_id)s
              AND u.id = %(member_id)s
              AND p.deleted_at IS NULL
            LIMIT 1
            """,
            {"project_id": project_id, "member_id": member_id},
        )
        if not rows:
            raise BusinessError(1025, "项目成员不存在", 404)
        return self._to_project_user_payload(rows[0])

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
            async with await psycopg.AsyncConnection.connect(
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
        except psycopg.errors.UniqueViolation as exc:
            raise BusinessError(
                code=1022,
                message="人工标注任务名称已存在",
                status_code=409,
            ) from exc

        return await self.get_annotation_queue_for_user(project_id, queue_id, user_id)

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
            async with await psycopg.AsyncConnection.connect(
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

        async with await psycopg.AsyncConnection.connect(
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
        async with await psycopg.AsyncConnection.connect(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await self._get_project_for_user(cursor, project_id, user_id)
                await self._get_annotation_queue_row(cursor, project_id, queue_id)
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

        async with await psycopg.AsyncConnection.connect(
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

        return [row["id"] for row in rows]

    async def create_trace_annotation_task_for_user(
        self,
        project_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        trace_ids = list(dict.fromkeys(payload.get("traceIds") or []))
        async with await psycopg.AsyncConnection.connect(
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
                    await self._get_annotation_queue_row(cursor, project_id, queue_id)
                else:
                    queue_name = payload.get("queueName") or "Trace 人工标注"
                    queue_id = await self._get_or_create_annotation_queue(
                        cursor,
                        project_id,
                        queue_name,
                        score_config_ids,
                        user_id,
                    )

                created_count = 0
                skipped_count = 0
                for trace_id in trace_ids:
                    await cursor.execute(
                        """
                        SELECT id
                        FROM annotation_queue_items
                        WHERE project_id = %(project_id)s
                          AND queue_id = %(queue_id)s
                          AND object_id = %(trace_id)s
                          AND object_type::text = 'TRACE'
                        LIMIT 1
                        """,
                        {
                            "project_id": project_id,
                            "queue_id": queue_id,
                            "trace_id": trace_id,
                        },
                    )
                    if await cursor.fetchone():
                        skipped_count += 1
                        continue

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
                            %(trace_id)s,
                            'TRACE'::"AnnotationQueueObjectType",
                            'PENDING'::"AnnotationQueueStatus",
                            NOW(),
                            NOW()
                        )
                        """,
                        {
                            "id": _new_langfuse_id("annitem"),
                            "project_id": project_id,
                            "queue_id": queue_id,
                            "trace_id": trace_id,
                        },
                    )
                    created_count += 1

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
            "createdCount": created_count,
            "skippedCount": skipped_count,
        }

    async def save_annotation_scores_for_user(
        self,
        project_id: str,
        queue_id: str,
        item_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await psycopg.AsyncConnection.connect(
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
                score_config_ids = set(item["score_config_ids"] or [])
                trace_id = item.get("resolved_trace_id") or item["object_id"]
                observation_id = (
                    item["object_id"] if item["object_type"] == "OBSERVATION" else None
                )

                for score in payload.get("scores") or []:
                    config_id = score["configId"]
                    if config_id not in score_config_ids:
                        raise BusinessError(
                            code=1024,
                            message="评分指标不属于当前人工标注任务",
                            status_code=400,
                        )
                    config = await self._get_score_config_row(
                        cursor,
                        project_id,
                        config_id,
                    )
                    if config.get("is_archived"):
                        raise BusinessError(
                            code=1026,
                            message="已归档评分指标不能继续标注",
                            status_code=400,
                        )
                    await cursor.execute(
                        """
                        DELETE FROM scores
                        WHERE project_id = %(project_id)s
                          AND queue_id = %(queue_id)s
                          AND config_id = %(config_id)s
                          AND trace_id = %(trace_id)s
                          AND (
                            (
                                %(observation_id)s::text IS NULL
                                AND observation_id IS NULL
                            )
                            OR observation_id = %(observation_id)s::text
                          )
                          AND source::text = 'ANNOTATION'
                        """,
                        {
                            "project_id": project_id,
                            "queue_id": queue_id,
                            "config_id": config_id,
                            "trace_id": trace_id,
                            "observation_id": observation_id,
                        },
                    )
                    value, string_value = self._normalize_score_value(
                        config,
                        score.get("value"),
                        score.get("stringValue") or "",
                    )
                    await cursor.execute(
                        """
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
                        VALUES (
                            %(id)s,
                            NOW(),
                            %(project_id)s,
                            %(name)s,
                            %(value)s,
                            'ANNOTATION'::"ScoreSource",
                            %(author_user_id)s,
                            %(comment)s,
                            %(trace_id)s,
                            %(observation_id)s,
                            %(config_id)s,
                            %(string_value)s,
                            %(queue_id)s,
                            NOW(),
                            NOW(),
                            %(data_type)s::"ScoreConfigDataType"
                        )
                        """,
                        {
                            "id": _new_langfuse_id("score"),
                            "project_id": project_id,
                            "name": config["name"],
                            "value": value,
                            "author_user_id": user_id,
                            "comment": score.get("comment") or "",
                            "trace_id": trace_id,
                            "observation_id": observation_id,
                            "config_id": config_id,
                            "string_value": string_value,
                            "queue_id": queue_id,
                            "data_type": config["data_type"],
                        },
                    )

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
        async with await psycopg.AsyncConnection.connect(
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

        traces = payload.get("traces") or []
        item_ids: list[str] = []
        async with await psycopg.AsyncConnection.connect(
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

                for trace in traces:
                    item_id = _new_langfuse_id("datasetitem")
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
                            '',
                            NOW(),
                            NOW(),
                            NOW(),
                            FALSE
                        )
                        RETURNING id
                        """,
                        {
                            "id": item_id,
                            "project_id": project_id,
                            "dataset_id": payload["datasetId"],
                            "input": Jsonb(_decode_jsonish(trace.get("input"))),
                            "expected_output": Jsonb(
                                _decode_jsonish(trace.get("output"))
                            ),
                            "metadata": Jsonb(_trace_dataset_metadata(trace)),
                            "source_trace_id": trace.get("traceId") or "",
                        },
                    )
                    row = await cursor.fetchone()
                    if row is not None:
                        item_ids.append(row["id"])

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

    async def _list_pa_evaluators_for_user(
        self, user_id: str
    ) -> list[dict[str, Any]]:
        try:
            rows = await self._fetch_all(
                f"""
                SELECT
                    pe.id,
                    pe.name,
                    pe.type,
                    pe.provider,
                    pe.version,
                    pe.description,
                    pe.variables,
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
        except psycopg.errors.UndefinedTable:
            return []

        return [self._to_pa_evaluator_payload(row) for row in rows]

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
            rows = await self._fetch_all(
                f"""
                SELECT
                    pe.id,
                    pe.name,
                    pe.type,
                    pe.provider,
                    pe.version,
                    pe.description,
                    pe.variables,
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
        except psycopg.errors.UndefinedTable:
            return None

        if not rows:
            return None

        payload = self._to_pa_evaluator_payload(rows[0])
        return {
            **payload,
            "config": self._redact_evaluator_config(rows[0].get("config") or {}),
        }

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
        async with await psycopg.AsyncConnection.connect(
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
        async with await psycopg.AsyncConnection.connect(
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

    async def delete_pa_evaluator_for_user(
        self,
        evaluator_id: str,
        user_id: str,
    ) -> None:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        async with await psycopg.AsyncConnection.connect(
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

    async def create_organization_member(
        self,
        organization_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._database_url:
            raise LangfuseDatabaseConfigError()

        membership_id = _new_langfuse_id("orgmem")
        async with await psycopg.AsyncConnection.connect(
            self._database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                user = await self._get_user_by_email_cursor(
                    cursor,
                    payload["email"],
                )
                if user is None:
                    raise BusinessError(1015, "用户不存在，请先让该用户登录 Langfuse", 404)

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
                    raise BusinessError(1016, "用户已在该组织中", 409) from exc
                return await self._get_organization_member_cursor(
                    cursor,
                    organization_id,
                    membership_id,
                )

    async def update_organization_member(
        self,
        organization_id: str,
        member_id: str,
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
        owner_user_id: str,
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
                        "user_id": owner_user_id,
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
                        "org_membership_id": membership_id,
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
                COALESCE(scores.scores, '[]'::jsonb) AS scores,
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

        async with await psycopg.AsyncConnection.connect(
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

    @staticmethod
    async def _get_organization_for_user(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        organization_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        await cursor.execute(
            """
            SELECT o.id, o.name
            FROM organizations o
            WHERE o.id = %(organization_id)s
              AND EXISTS (
                SELECT 1
                FROM organization_memberships om
                WHERE om.org_id = o.id
                  AND om.user_id = %(user_id)s
              )
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

        async with await psycopg.AsyncConnection.connect(
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

        async with await psycopg.AsyncConnection.connect(
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
        missing = [config_id for config_id in score_config_ids if config_id not in found]
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
            return (1.0 if boolean_value else 0.0, str(boolean_value).lower())
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
        retention_days = pa_eval.get("retentionDays") if isinstance(pa_eval, dict) else None
        organization_name = row["organization_name"]

        return {
            "id": row["id"],
            "name": row["name"],
            "organizationId": row["org_id"],
            "organizationName": organization_name,
            "description": description or f"所属组织：{organization_name}",
            "retentionDays": retention_days or 30,
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

        fallback_models = fallback_connection.get("customModels") if fallback_connection else []
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
            description = " / ".join(
                str(value) for value in [provider, model] if value
            )
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
        status = "ARCHIVED" if row.get("is_deleted") or raw_status == "ARCHIVED" else "ACTIVE"

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
    def _to_score_config_payload(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "projectId": row["project_id"],
            "name": row["name"],
            "dataType": row["data_type"],
            "description": row.get("description") or "",
            "minValue": _to_float_or_none(row.get("min_value")),
            "maxValue": _to_float_or_none(row.get("max_value")),
            "categories": _normalize_score_categories(row.get("categories")),
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


def _format_datetime(value: Any) -> str:
    if isinstance(value, datetime):
        formatted = value.isoformat(timespec="milliseconds")
        if value.tzinfo is None:
            return f"{formatted}Z"
        return formatted.replace("+00:00", "Z")
    return str(value)


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
    return {
        "id": config.get("id") or "",
        "projectId": config.get("projectId") or "",
        "name": config.get("name") or "",
        "dataType": config.get("dataType") or "NUMERIC",
        "description": config.get("description") or "",
        "minValue": _to_float_or_none(config.get("minValue")),
        "maxValue": _to_float_or_none(config.get("maxValue")),
        "categories": _normalize_score_categories(config.get("categories")),
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
        categories = Jsonb(LANGFUSE_BOOLEAN_SCORE_CATEGORIES)
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
