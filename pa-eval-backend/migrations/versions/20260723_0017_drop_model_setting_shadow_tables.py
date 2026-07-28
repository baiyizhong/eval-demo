"""drop PA model-setting shadow tables after native cutover

Revision ID: 20260723_0017
Revises: 20260723_0016
Create Date: 2026-07-23 00:17:00.000000
"""

import json

from alembic import op
from app.config import Settings
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260723_0017"
down_revision = "20260723_0016"
branch_labels = None
depends_on = None


SHADOW_TABLES = (
    "pa_project_llm_connections",
    "pa_project_model_definitions",
)


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return _inspector().has_table(table_name)


def _drop_table_if_exists(table_name: str) -> None:
    if _table_exists(table_name):
        op.drop_table(table_name)


def _scalar(sql: str) -> int:
    return int(op.get_bind().execute(sa.text(sql)).scalar_one() or 0)


def _assert_zero(label: str, sql: str) -> None:
    count = _scalar(sql)
    if count:
        raise RuntimeError(
            f"PA native model settings preflight failed for {label}: count={count}. "
            "Run scripts/sync_native_model_settings.py before alembic upgrade."
        )


def _assert_cutover_ready() -> None:
    required = (
        *SHADOW_TABLES,
        "pa_job_executions",
        "pa_resource_extensions",
        "llm_api_keys",
        "models",
    )
    for table_name in required:
        if not _table_exists(table_name):
            raise RuntimeError(
                f"PA native model settings preflight missing table {table_name}"
            )
    op.execute("SET LOCAL lock_timeout = '30s'")
    op.execute(
        "LOCK TABLE pa_project_llm_connections, "
        "pa_project_model_definitions, pa_job_executions, "
        "pa_resource_extensions IN SHARE ROW EXCLUSIVE MODE"
    )
    _assert_zero(
        "running native sync",
        """
        SELECT COUNT(*)
        FROM pa_job_executions
        WHERE job_type = 'NATIVE_RESOURCE_SYNC'
          AND status IN ('PENDING', 'RUNNING')
        """,
    )
    _assert_zero(
        "duplicate active LLM providers",
        """
        SELECT COUNT(*)
        FROM (
            SELECT project_id, provider
            FROM pa_project_llm_connections
            WHERE status = 'ACTIVE'
            GROUP BY project_id, provider
            HAVING COUNT(*) > 1
        ) duplicates
        """,
    )
    _assert_zero(
        "duplicate active model names",
        """
        SELECT COUNT(*)
        FROM (
            SELECT project_id, model_name
            FROM pa_project_model_definitions
            WHERE status = 'ACTIVE'
            GROUP BY project_id, model_name
            HAVING COUNT(*) > 1
        ) duplicates
        """,
    )
    _assert_zero(
        "LLM connection mapping coverage",
        """
        SELECT COUNT(*)
        FROM pa_project_llm_connections legacy
        WHERE legacy.status = 'ACTIVE'
          AND NOT EXISTS (
              SELECT 1
              FROM pa_job_executions execution
              JOIN llm_api_keys native
                ON native.project_id = legacy.project_id
               AND native.id = execution.result_payload ->> 'externalResourceId'
              WHERE execution.project_id = legacy.project_id
                AND execution.job_type = 'NATIVE_RESOURCE_SYNC'
                AND execution.status = 'SUCCEEDED'
                AND execution.request_payload ->> 'resourceType' = 'LLM_CONNECTION'
                AND execution.request_payload ->> 'localResourceId' = legacy.id
          )
        """,
    )
    _assert_zero(
        "model mapping coverage",
        """
        SELECT COUNT(*)
        FROM pa_project_model_definitions legacy
        WHERE legacy.status = 'ACTIVE'
          AND NOT EXISTS (
              SELECT 1
              FROM pa_job_executions execution
              JOIN models native
                ON native.project_id = legacy.project_id
               AND native.id = execution.result_payload ->> 'externalResourceId'
              WHERE execution.project_id = legacy.project_id
                AND execution.job_type = 'NATIVE_RESOURCE_SYNC'
                AND execution.status = 'SUCCEEDED'
                AND execution.request_payload ->> 'resourceType' = 'MODEL'
                AND execution.request_payload ->> 'localResourceId' = legacy.id
          )
        """,
    )
    _assert_zero(
        "default model native connection reference",
        """
        SELECT COUNT(*)
        FROM pa_resource_extensions extension
        WHERE extension.extension_type = 'DEFAULT_EVALUATION_MODEL'
          AND extension.status = 'ACTIVE'
          AND COALESCE(extension.payload ->> 'llmConnectionId', '') <> ''
          AND NOT EXISTS (
              SELECT 1
              FROM llm_api_keys native
              WHERE native.project_id = extension.project_id
                AND native.id = extension.payload ->> 'llmConnectionId'
          )
        """,
    )


def upgrade() -> None:
    _assert_cutover_ready()
    _drop_table_if_exists("pa_project_model_definitions")
    _drop_table_if_exists("pa_project_llm_connections")


def _audit_columns() -> list[sa.Column]:
    return [
        sa.Column("create_by", sa.Text(), nullable=False, server_default="system"),
        sa.Column("update_by", sa.Text(), nullable=False, server_default="system"),
        sa.Column(
            "create_date",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "update_date",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    ]


def _comment(table: str, column: str, value: str) -> None:
    escaped = value.replace("'", "''")
    op.execute(sa.text(f"COMMENT ON COLUMN {table}.{column} IS '{escaped}'"))


def _decrypt_native_secret(ciphertext: str, encryption_key: str) -> str:
    if len(encryption_key) != 64:
        raise RuntimeError(
            "LANGFUSE_ENCRYPTION_KEY must be configured to downgrade model settings"
        )
    try:
        key = bytes.fromhex(encryption_key)
        iv_hex, encrypted_hex, tag_hex = ciphertext.split(":")
        return AESGCM(key).decrypt(
            bytes.fromhex(iv_hex),
            bytes.fromhex(encrypted_hex) + bytes.fromhex(tag_hex),
            None,
        ).decode("utf-8")
    except (InvalidTag, UnicodeDecodeError, ValueError) as exc:
        raise RuntimeError("Unable to restore Langfuse LLM connection secret") from exc


def _restore_current_native_resources() -> None:
    bind = op.get_bind()
    connection_rows = bind.execute(
        sa.text(
            """
            SELECT id, project_id, provider, adapter, secret_key, base_url,
                   custom_models, with_default_models
            FROM llm_api_keys
            ORDER BY project_id, id
            """
        )
    ).mappings().all()
    encryption_key = Settings().langfuse_encryption_key
    for row in connection_rows:
        secret_key = _decrypt_native_secret(str(row["secret_key"]), encryption_key)
        bind.execute(
            sa.text(
                """
                INSERT INTO pa_project_llm_connections (
                    create_by, update_by, id, project_id, provider, adapter,
                    secret_key, base_url, custom_models, with_default_models, status
                ) VALUES (
                    'system:native-model-settings-downgrade',
                    'system:native-model-settings-downgrade',
                    :id, :project_id, :provider, :adapter, :secret_key, :base_url,
                    CAST(:custom_models AS jsonb), :with_default_models, 'ACTIVE'
                )
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {
                "id": row["id"],
                "project_id": row["project_id"],
                "provider": row["provider"],
                "adapter": row["adapter"],
                "secret_key": secret_key,
                "base_url": row["base_url"] or "",
                "custom_models": json.dumps(list(row["custom_models"] or [])),
                "with_default_models": bool(row["with_default_models"]),
            },
        )
    bind.execute(
        sa.text(
            """
            INSERT INTO pa_project_model_definitions (
                create_by, update_by, id, project_id, model_name, match_pattern,
                unit, input_price, output_price, tokenizer_id, status
            )
            SELECT
                'system:native-model-settings-downgrade',
                'system:native-model-settings-downgrade',
                id, project_id, model_name, match_pattern,
                COALESCE(unit, 'TOKENS'),
                COALESCE(input_price::text, ''),
                COALESCE(output_price::text, ''),
                COALESCE(tokenizer_id, ''),
                'ACTIVE'
            FROM models
            WHERE project_id IS NOT NULL
            ON CONFLICT (id) DO NOTHING
            """
        )
    )


def downgrade() -> None:
    op.create_table(
        "pa_project_llm_connections",
        *_audit_columns(),
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("adapter", sa.Text(), nullable=False),
        sa.Column("secret_key", sa.Text(), nullable=False, server_default=""),
        sa.Column("base_url", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "custom_models",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "with_default_models",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("TRUE"),
        ),
        sa.Column("status", sa.Text(), nullable=False, server_default="ACTIVE"),
    )
    op.create_index(
        "pa_project_llm_connections_project_id_idx",
        "pa_project_llm_connections",
        ["project_id"],
    )
    op.create_table(
        "pa_project_model_definitions",
        *_audit_columns(),
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("model_name", sa.Text(), nullable=False),
        sa.Column("match_pattern", sa.Text(), nullable=False, server_default=""),
        sa.Column("unit", sa.Text(), nullable=False, server_default="TOKENS"),
        sa.Column("input_price", sa.Text(), nullable=False, server_default=""),
        sa.Column("output_price", sa.Text(), nullable=False, server_default=""),
        sa.Column("tokenizer_id", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.Text(), nullable=False, server_default="ACTIVE"),
    )
    op.create_index(
        "pa_project_model_definitions_project_id_idx",
        "pa_project_model_definitions",
        ["project_id"],
    )
    op.execute(
        sa.text(
            "COMMENT ON TABLE pa_project_llm_connections "
            "IS 'PA Eval 项目级 LLM 连接配置（回滚兼容）'"
        )
    )
    op.execute(
        sa.text(
            "COMMENT ON TABLE pa_project_model_definitions "
            "IS 'PA Eval 项目级模型定义（回滚兼容）'"
        )
    )
    comments = {
        "pa_project_llm_connections": {
            "table": "PA Eval 项目级 LLM 连接配置（回滚兼容）",
            "provider": "Provider 名称",
            "adapter": "适配器类型",
            "secret_key": "服务端密钥",
            "base_url": "模型服务 Base URL",
            "custom_models": "自定义模型列表",
            "with_default_models": "是否包含默认模型",
            "status": "状态",
        },
        "pa_project_model_definitions": {
            "table": "PA Eval 项目级模型定义（回滚兼容）",
            "model_name": "模型名称",
            "match_pattern": "模型匹配表达式",
            "unit": "计量单位",
            "input_price": "输入价格",
            "output_price": "输出价格",
            "tokenizer_id": "Tokenizer 标识",
            "status": "状态",
        },
    }
    common = {
        "create_by": "创建人",
        "update_by": "更新人",
        "create_date": "创建时间",
        "update_date": "更新时间",
        "id": "主键 ID",
        "project_id": "Langfuse 项目 ID",
    }
    for table, table_comments in comments.items():
        for column, value in {**common, **table_comments}.items():
            if column != "table":
                _comment(table, column, value)
    _restore_current_native_resources()
