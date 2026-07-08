"""add report flowback compatibility columns

Revision ID: 20260708_0009
Revises: 20260708_0008
Create Date: 2026-07-08 20:20:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260708_0009"
down_revision = "20260708_0008"
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
    return any(
        column["name"] == column_name for column in _inspector().get_columns(table_name)
    )


def _add_column_once(table_name: str, column: sa.Column, comment: str) -> None:
    if not _column_exists(table_name, column.name):
        op.add_column(table_name, column)
    op.execute(
        sa.text(
            f"COMMENT ON COLUMN {table_name}.{column.name} IS {_quote_literal(comment)}"
        )
    )


def _drop_column_if_exists(table_name: str, column_name: str) -> None:
    if _column_exists(table_name, column_name):
        op.drop_column(table_name, column_name)


def upgrade() -> None:
    if not _table_exists("pa_evaluation_report_flowbacks"):
        return

    for column, comment in [
        (sa.Column("item_id", sa.Text(), nullable=True), "回流关联的报告明细 ID"),
        (
            sa.Column("target_type", sa.Text(), nullable=True),
            "回流目标类型",
        ),
        (sa.Column("target_id", sa.Text(), nullable=True), "回流目标 ID"),
        (
            sa.Column(
                "payload",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=True,
            ),
            "回流请求载荷",
        ),
        (
            sa.Column(
                "result",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=True,
            ),
            "回流执行结果",
        ),
        (sa.Column("created_by", sa.Text(), nullable=True), "回流创建人"),
        (
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            "回流创建时间",
        ),
        (
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            "回流更新时间",
        ),
        (
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            "回流完成时间",
        ),
    ]:
        _add_column_once("pa_evaluation_report_flowbacks", column, comment)

    op.execute(
        sa.text(
            """
            UPDATE pa_evaluation_report_flowbacks
            SET target_type = COALESCE(target_type, 'DATASET'),
                target_id = COALESCE(target_id, target_dataset_id),
                payload = COALESCE(payload, '{}'::jsonb),
                result = COALESCE(
                    result,
                    jsonb_build_object(
                        'requestedCount', requested_count,
                        'successCount', success_count,
                        'failedCount', failed_count
                    )
                ),
                created_by = COALESCE(created_by, create_by),
                created_at = COALESCE(created_at, create_date),
                updated_at = COALESCE(updated_at, update_date),
                completed_at = COALESCE(completed_at, update_date)
            """
        )
    )


def downgrade() -> None:
    for column_name in [
        "completed_at",
        "updated_at",
        "created_at",
        "created_by",
        "result",
        "payload",
        "target_id",
        "target_type",
        "item_id",
    ]:
        _drop_column_if_exists("pa_evaluation_report_flowbacks", column_name)
