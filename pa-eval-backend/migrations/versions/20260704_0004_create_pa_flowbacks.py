"""create pa flowbacks

Revision ID: 20260704_0004
Revises: 20260704_0003
Create Date: 2026-07-04 02:40:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260704_0004"
down_revision = "20260704_0003"
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


def upgrade() -> None:
    if not _table_exists("pa_evaluation_report_flowbacks"):
        op.create_table(
            "pa_evaluation_report_flowbacks",
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("report_id", sa.Text(), nullable=False),
            sa.Column("flowback_type", sa.Text(), nullable=False),
            sa.Column("target_dataset_id", sa.Text(), nullable=False),
            sa.Column("target_dataset_name", sa.Text(), nullable=False),
            sa.Column(
                "target_dataset_created",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column("requested_count", sa.Integer(), nullable=False),
            sa.Column("success_count", sa.Integer(), nullable=False),
            sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("status", sa.Text(), nullable=False),
            sa.Column("created_by", sa.Text(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("NOW()"),
            ),
            sa.Column(
                "error_detail",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default="[]",
            ),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(
                ["report_id"],
                ["pa_evaluation_reports.id"],
                ondelete="CASCADE",
            ),
        )

    _create_index_once(
        "pa_evaluation_report_flowbacks_report_id_idx",
        "pa_evaluation_report_flowbacks",
        ["report_id"],
    )


def downgrade() -> None:
    _drop_index_if_exists(
        "pa_evaluation_report_flowbacks_report_id_idx",
        "pa_evaluation_report_flowbacks",
    )
    _drop_table_if_exists("pa_evaluation_report_flowbacks")
