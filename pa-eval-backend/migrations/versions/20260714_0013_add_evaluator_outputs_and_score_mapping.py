"""add evaluator outputs and score mapping

Revision ID: 20260714_0013
Revises: 20260711_0012
Create Date: 2026-07-14 00:13:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260714_0013"
down_revision = "20260711_0012"
branch_labels = None
depends_on = None


def _quote_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return _inspector().has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(column["name"] == column_name for column in _inspector().get_columns(table_name))


def _comment_column(table_name: str, column_name: str, comment: str) -> None:
    op.execute(
        sa.text(
            f"COMMENT ON COLUMN {table_name}.{column_name} IS {_quote_literal(comment)}"
        )
    )


def _add_jsonb_column_once(
    table_name: str,
    column_name: str,
    comment: str,
    default_sql: str = "'{}'::jsonb",
) -> None:
    if not _column_exists(table_name, column_name):
        op.add_column(
            table_name,
            sa.Column(
                column_name,
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text(default_sql),
            ),
        )
    _comment_column(table_name, column_name, comment)


def upgrade() -> None:
    _add_jsonb_column_once(
        "pa_evaluators",
        "output_variables",
        "评估器输出变量定义",
        "'[]'::jsonb",
    )
    _add_jsonb_column_once(
        "pa_auto_evaluation_tasks",
        "score_mapping",
        "评估器输出变量与评分配置项绑定关系",
    )
    _add_jsonb_column_once(
        "pa_scheduled_jobs",
        "score_mapping",
        "评估器输出变量与评分配置项绑定关系",
    )


def downgrade() -> None:
    for table_name, column_name in [
        ("pa_scheduled_jobs", "score_mapping"),
        ("pa_auto_evaluation_tasks", "score_mapping"),
        ("pa_evaluators", "output_variables"),
    ]:
        if _column_exists(table_name, column_name):
            op.drop_column(table_name, column_name)
