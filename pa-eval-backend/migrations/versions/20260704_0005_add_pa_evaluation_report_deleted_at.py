"""add deleted_at to pa evaluation reports

Revision ID: 20260704_0005
Revises: 20260704_0004
Create Date: 2026-07-04 18:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260704_0005"
down_revision = "20260704_0004"
branch_labels = None
depends_on = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return _inspector().has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(column["name"] == column_name for column in _inspector().get_columns(table_name))


def upgrade() -> None:
    if not _column_exists("pa_evaluation_reports", "deleted_at"):
        op.add_column(
            "pa_evaluation_reports",
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    if _column_exists("pa_evaluation_reports", "deleted_at"):
        op.drop_column("pa_evaluation_reports", "deleted_at")
