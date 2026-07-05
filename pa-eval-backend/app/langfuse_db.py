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
            WHERE EXISTS (
                SELECT 1
                FROM organization_memberships om
                WHERE om.org_id = p.org_id
                  AND om.user_id = %(user_id)s
            )
            ORDER BY p.created_at DESC, p.id DESC
            """,
            {"user_id": user_id},
        )
        return [self._to_project_payload(row) for row in rows]

    async def ensure_project_visible(self, project_id: str, user_id: str) -> None:
        await self._ensure_project_visible(project_id, user_id)

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

    async def _list_langfuse_evaluators_for_user(
        self, user_id: str
    ) -> list[dict[str, Any]]:
        rows = await self._fetch_all(
            """
            WITH visible_projects AS (
                SELECT p.id, p.name
                FROM projects p
                WHERE EXISTS (
                    SELECT 1
                    FROM organization_memberships om
                    WHERE om.org_id = p.org_id
                      AND om.user_id = %(user_id)s
                )
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
                """
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
                    pe.updated_at
                FROM pa_evaluators pe
                JOIN projects p ON p.id = pe.project_id
                WHERE pe.status = 'ACTIVE'
                  AND EXISTS (
                    SELECT 1
                    FROM organization_memberships om
                    WHERE om.org_id = p.org_id
                      AND om.user_id = %(user_id)s
                )
                ORDER BY pe.updated_at DESC, pe.id DESC
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
                """
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
                    pe.updated_at
                FROM pa_evaluators pe
                JOIN projects p ON p.id = pe.project_id
                WHERE pe.id = %(evaluator_id)s
                  AND pe.status = 'ACTIVE'
                  AND EXISTS (
                    SELECT 1
                    FROM organization_memberships om
                    WHERE om.org_id = p.org_id
                      AND om.user_id = %(user_id)s
                  )
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
            """
            WITH visible_projects AS (
                SELECT p.id, p.name
                FROM projects p
                WHERE EXISTS (
                    SELECT 1
                    FROM organization_memberships om
                    WHERE om.org_id = p.org_id
                      AND om.user_id = %(user_id)s
                )
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
                        created_by
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
                        %(created_by)s
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
                        updated_at
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
                        "created_by": user_email,
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
                    """
                    UPDATE pa_evaluators pe
                    SET status = 'ARCHIVED',
                        updated_at = NOW()
                    FROM projects p
                    WHERE pe.project_id = p.id
                      AND pe.id = %(evaluator_id)s
                      AND pe.status = 'ACTIVE'
                      AND EXISTS (
                        SELECT 1
                        FROM organization_memberships om
                        WHERE om.org_id = p.org_id
                          AND om.user_id = %(user_id)s
                      )
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

    async def _ensure_project_visible(self, project_id: str, user_id: str) -> None:
        rows = await self._fetch_all(
            """
            SELECT p.id
            FROM projects p
            WHERE p.id = %(project_id)s
              AND p.deleted_at IS NULL
              AND EXISTS (
                SELECT 1
                FROM organization_memberships om
                WHERE om.org_id = p.org_id
                  AND om.user_id = %(user_id)s
              )
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
    async def _get_project_for_user(
        cursor: psycopg.AsyncCursor[dict[str, Any]],
        project_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        await cursor.execute(
            """
            SELECT p.id, p.name
            FROM projects p
            WHERE p.id = %(project_id)s
              AND EXISTS (
                SELECT 1
                FROM organization_memberships om
                WHERE om.org_id = p.org_id
                  AND om.user_id = %(user_id)s
              )
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


def _new_langfuse_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


async def get_langfuse_db_reader(
    settings: Settings = Depends(get_settings),
) -> LangfuseDatabaseReader:
    return LangfuseDatabaseReader(settings)
