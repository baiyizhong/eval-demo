"""deprecate redundant project model tables

Revision ID: 20260718_0014
Revises: 20260714_0013
Create Date: 2026-07-18 00:14:00.000000

PA Eval now reuses Langfuse LLM Connections and Langfuse models instead of
keeping parallel project-level LLM connection and model definition tables.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260718_0014"
down_revision = "20260714_0013"
branch_labels = None
depends_on = None


def _quote_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return _inspector().has_table(table_name)


def _index_exists(table_name: str, index_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(index["name"] == index_name for index in _inspector().get_indexes(table_name))


def _drop_index_if_exists(index_name: str, table_name: str) -> None:
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)


def _drop_table_if_exists(table_name: str) -> None:
    if _table_exists(table_name):
        op.drop_table(table_name)


def _create_index_once(
    index_name: str,
    table_name: str,
    columns: list[str],
) -> None:
    if _index_exists(table_name, index_name):
        return
    op.create_index(index_name, table_name, columns)


def _audit_columns() -> list[sa.Column]:
    return [
        sa.Column("create_by", sa.Text(), nullable=False, server_default=""),
        sa.Column("update_by", sa.Text(), nullable=False, server_default=""),
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
    op.execute(sa.text(f"COMMENT ON TABLE {table_name} IS {_quote_literal(comment)}"))


def _comment_column(table_name: str, column_name: str, comment: str) -> None:
    op.execute(
        sa.text(
            f"COMMENT ON COLUMN {table_name}.{column_name} IS {_quote_literal(comment)}"
        )
    )


def _comment_audit_columns(table_name: str) -> None:
    _comment_column(table_name, "create_by", "创建人")
    _comment_column(table_name, "update_by", "更新人")
    _comment_column(table_name, "create_date", "创建时间")
    _comment_column(table_name, "update_date", "更新时间")


def upgrade() -> None:
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


def downgrade() -> None:
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
    _comment_table(
        "pa_project_llm_connections",
        "PA Eval legacy project LLM connection table; superseded by Langfuse LLM Connections",
    )
    _comment_audit_columns("pa_project_llm_connections")
    for column_name, comment in {
        "id": "主键 ID",
        "project_id": "Langfuse 项目 ID",
        "provider": "Provider 名称",
        "adapter": "适配器类型",
        "secret_key": "服务端密钥",
        "base_url": "模型服务 Base URL",
        "custom_models": "自定义模型列表",
        "with_default_models": "是否包含默认模型",
        "status": "状态",
    }.items():
        _comment_column("pa_project_llm_connections", column_name, comment)

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
    _comment_table(
        "pa_project_model_definitions",
        "PA Eval legacy project model definition table; superseded by Langfuse models",
    )
    _comment_audit_columns("pa_project_model_definitions")
    for column_name, comment in {
        "id": "主键 ID",
        "project_id": "Langfuse 项目 ID",
        "model_name": "模型名称",
        "match_pattern": "模型匹配表达式",
        "unit": "计量单位",
        "input_price": "输入价格",
        "output_price": "输出价格",
        "tokenizer_id": "Tokenizer 标识",
        "status": "状态",
    }.items():
        _comment_column("pa_project_model_definitions", column_name, comment)
