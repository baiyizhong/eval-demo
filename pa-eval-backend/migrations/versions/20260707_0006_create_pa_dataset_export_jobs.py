"""create pa dataset export jobs

Revision ID: 20260707_0006
Revises: 20260707_0005
Create Date: 2026-07-07 14:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260707_0006"
down_revision = "20260707_0005"
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
        sa.Column("create_by", sa.Text(), nullable=False, server_default="system"),
        sa.Column("update_by", sa.Text(), nullable=False, server_default="system"),
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


def upgrade() -> None:
    if not _table_exists("pa_dataset_export_jobs"):
        op.create_table(
            "pa_dataset_export_jobs",
            *_audit_columns(),
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("dataset_id", sa.Text(), nullable=False),
            sa.Column("format", sa.Text(), nullable=False),
            sa.Column("status", sa.Text(), nullable=False, server_default="PENDING"),
            sa.Column("total_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("exported_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("file_name", sa.Text(), nullable=False, server_default=""),
            sa.Column("file_path", sa.Text(), nullable=False, server_default=""),
            sa.Column("file_size", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("error_message", sa.Text(), nullable=False, server_default=""),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column(
                "metadata",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.CheckConstraint(
                "format IN ('xlsx', 'csv', 'txt')",
                name="pa_dataset_export_jobs_format_check",
            ),
            sa.CheckConstraint(
                "status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')",
                name="pa_dataset_export_jobs_status_check",
            ),
        )

    _create_index_once(
        "pa_dataset_export_jobs_project_dataset_idx",
        "pa_dataset_export_jobs",
        ["project_id", "dataset_id"],
    )
    _create_index_once(
        "pa_dataset_export_jobs_project_update_idx",
        "pa_dataset_export_jobs",
        ["project_id", "update_date"],
    )


def downgrade() -> None:
    _drop_index_if_exists(
        "pa_dataset_export_jobs_project_update_idx",
        "pa_dataset_export_jobs",
    )
    _drop_index_if_exists(
        "pa_dataset_export_jobs_project_dataset_idx",
        "pa_dataset_export_jobs",
    )
    _drop_table_if_exists("pa_dataset_export_jobs")
