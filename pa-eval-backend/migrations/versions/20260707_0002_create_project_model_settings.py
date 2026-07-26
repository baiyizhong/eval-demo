"""create project model settings tables

Revision ID: 20260707_0002
Revises: 20260705_0002
Create Date: 2026-07-07 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260707_0002"
down_revision = "20260705_0002"
branch_labels = None
depends_on = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return _inspector().has_table(table_name)


def _index_exists(table_name: str, index_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(index["name"] == index_name for index in _inspector().get_indexes(table_name))


def _create_index_once(index_name: str, table_name: str, columns: list[str]) -> None:
    if not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns)


def _drop_index_if_exists(index_name: str, table_name: str) -> None:
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)


def _drop_table_if_exists(table_name: str) -> None:
    if _table_exists(table_name):
        op.drop_table(table_name)


def _audit_columns() -> list[sa.Column]:
    return [
        sa.Column("create_by", sa.Text(), nullable=False),
        sa.Column("update_by", sa.Text(), nullable=False),
        sa.Column(
            "create_date",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "update_date",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    ]


def _comment_table(table_name: str, comment: str) -> None:
    escaped = comment.replace("'", "''")
    op.execute(sa.text(f"COMMENT ON TABLE {table_name} IS '{escaped}'"))


def _comment_column(table_name: str, column_name: str, comment: str) -> None:
    escaped = comment.replace("'", "''")
    op.execute(sa.text(f"COMMENT ON COLUMN {table_name}.{column_name} IS '{escaped}'"))


def upgrade() -> None:
    if not _table_exists("pa_project_llm_connections"):
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
    _create_index_once(
        "pa_project_llm_connections_project_id_idx",
        "pa_project_llm_connections",
        ["project_id"],
    )

    if not _table_exists("pa_project_model_definitions"):
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
    _create_index_once(
        "pa_project_model_definitions_project_id_idx",
        "pa_project_model_definitions",
        ["project_id"],
    )

    if not _table_exists("pa_project_model_settings"):
        op.create_table(
            "pa_project_model_settings",
            *_audit_columns(),
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False, unique=True),
            sa.Column("llm_connection_id", sa.Text(), nullable=False),
            sa.Column("model", sa.Text(), nullable=False),
            sa.Column("temperature", sa.Text(), nullable=False, server_default="0.2"),
        )
    _create_index_once(
        "pa_project_model_settings_project_id_idx",
        "pa_project_model_settings",
        ["project_id"],
    )

    _comment_table("pa_project_llm_connections", "PA Eval 项目级 LLM 连接配置")
    _comment_table("pa_project_model_definitions", "PA Eval 项目级模型定义")
    _comment_table("pa_project_model_settings", "PA Eval 项目默认评估模型配置")

    for table_name in [
        "pa_project_llm_connections",
        "pa_project_model_definitions",
        "pa_project_model_settings",
    ]:
        _comment_column(table_name, "create_by", "创建人")
        _comment_column(table_name, "update_by", "更新人")
        _comment_column(table_name, "create_date", "创建时间")
        _comment_column(table_name, "update_date", "更新时间")
        _comment_column(table_name, "id", "主键 ID")
        _comment_column(table_name, "project_id", "Langfuse 项目 ID")

    _comment_column("pa_project_llm_connections", "provider", "Provider 名称")
    _comment_column("pa_project_llm_connections", "adapter", "适配器类型")
    _comment_column("pa_project_llm_connections", "secret_key", "加密或脱敏前的服务端密钥")
    _comment_column("pa_project_llm_connections", "base_url", "模型服务 Base URL")
    _comment_column("pa_project_llm_connections", "custom_models", "自定义模型列表")
    _comment_column("pa_project_llm_connections", "with_default_models", "是否包含默认模型")
    _comment_column("pa_project_llm_connections", "status", "状态")

    _comment_column("pa_project_model_definitions", "model_name", "模型名称")
    _comment_column("pa_project_model_definitions", "match_pattern", "模型匹配表达式")
    _comment_column("pa_project_model_definitions", "unit", "计量单位")
    _comment_column("pa_project_model_definitions", "input_price", "输入价格")
    _comment_column("pa_project_model_definitions", "output_price", "输出价格")
    _comment_column("pa_project_model_definitions", "tokenizer_id", "Tokenizer 标识")
    _comment_column("pa_project_model_definitions", "status", "状态")

    _comment_column("pa_project_model_settings", "llm_connection_id", "默认 LLM 连接 ID")
    _comment_column("pa_project_model_settings", "model", "默认模型名称")
    _comment_column("pa_project_model_settings", "temperature", "默认温度")


def downgrade() -> None:
    _drop_index_if_exists(
        "pa_project_model_settings_project_id_idx",
        "pa_project_model_settings",
    )
    _drop_table_if_exists("pa_project_model_settings")
    _drop_index_if_exists(
        "pa_project_model_definitions_project_id_idx",
        "pa_project_model_definitions",
    )
    _drop_table_if_exists("pa_project_model_definitions")
    _drop_index_if_exists(
        "pa_project_llm_connections_project_id_idx",
        "pa_project_llm_connections",
    )
    _drop_table_if_exists("pa_project_llm_connections")
