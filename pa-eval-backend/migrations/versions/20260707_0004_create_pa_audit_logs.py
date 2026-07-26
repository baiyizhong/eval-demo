"""create pa audit logs

Revision ID: 20260707_0004
Revises: 20260707_0003
Create Date: 2026-07-07 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260707_0004"
down_revision = "20260707_0003"
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


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(
        column["name"] == column_name
        for column in _inspector().get_columns(table_name)
    )


def _add_column_once(table_name: str, column: sa.Column) -> None:
    if not _column_exists(table_name, column.name):
        op.add_column(table_name, column)


def _create_index_once(index_name: str, table_name: str, columns: list[str]) -> None:
    if not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns)


def _drop_index_if_exists(index_name: str, table_name: str) -> None:
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)


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
    if not _table_exists("pa_audit_logs"):
        op.create_table(
            "pa_audit_logs",
            *_audit_columns(),
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("actor_user_id", sa.Text(), nullable=False, server_default=""),
            sa.Column("actor_email", sa.Text(), nullable=False, server_default=""),
            sa.Column("action", sa.Text(), nullable=False),
            sa.Column("resource_type", sa.Text(), nullable=False),
            sa.Column("resource_id", sa.Text(), nullable=False, server_default=""),
            sa.Column("organization_id", sa.Text(), nullable=False, server_default=""),
            sa.Column("project_id", sa.Text(), nullable=False, server_default=""),
            sa.Column("method", sa.Text(), nullable=False),
            sa.Column("path", sa.Text(), nullable=False),
            sa.Column("status", sa.Text(), nullable=False),
            sa.Column("status_code", sa.Integer(), nullable=False),
            sa.Column("ip_address", sa.Text(), nullable=False, server_default=""),
            sa.Column("user_agent", sa.Text(), nullable=False, server_default=""),
            sa.Column("tx_id", sa.Text(), nullable=False, server_default=""),
            sa.Column(
                "metadata",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
        )
    else:
        for column in _audit_columns():
            _add_column_once("pa_audit_logs", column)
        _add_column_once(
            "pa_audit_logs",
            sa.Column("actor_user_id", sa.Text(), nullable=False, server_default=""),
        )
        _add_column_once(
            "pa_audit_logs",
            sa.Column("actor_email", sa.Text(), nullable=False, server_default=""),
        )
        _add_column_once(
            "pa_audit_logs",
            sa.Column("action", sa.Text(), nullable=False, server_default="UNKNOWN"),
        )
        _add_column_once(
            "pa_audit_logs",
            sa.Column("resource_type", sa.Text(), nullable=False, server_default="unknown"),
        )
        _add_column_once(
            "pa_audit_logs",
            sa.Column("resource_id", sa.Text(), nullable=False, server_default=""),
        )
        _add_column_once(
            "pa_audit_logs",
            sa.Column("organization_id", sa.Text(), nullable=False, server_default=""),
        )
        _add_column_once(
            "pa_audit_logs",
            sa.Column("project_id", sa.Text(), nullable=False, server_default=""),
        )
        _add_column_once(
            "pa_audit_logs",
            sa.Column("method", sa.Text(), nullable=False, server_default=""),
        )
        _add_column_once(
            "pa_audit_logs",
            sa.Column("path", sa.Text(), nullable=False, server_default=""),
        )
        _add_column_once(
            "pa_audit_logs",
            sa.Column("status", sa.Text(), nullable=False, server_default="SUCCESS"),
        )
        _add_column_once(
            "pa_audit_logs",
            sa.Column("status_code", sa.Integer(), nullable=False, server_default="200"),
        )
        _add_column_once(
            "pa_audit_logs",
            sa.Column("ip_address", sa.Text(), nullable=False, server_default=""),
        )
        _add_column_once(
            "pa_audit_logs",
            sa.Column("user_agent", sa.Text(), nullable=False, server_default=""),
        )
        _add_column_once(
            "pa_audit_logs",
            sa.Column("tx_id", sa.Text(), nullable=False, server_default=""),
        )
        _add_column_once(
            "pa_audit_logs",
            sa.Column(
                "metadata",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
        )
        op.execute(
            """
            UPDATE pa_audit_logs
            SET
                create_date = COALESCE(create_date, created_at, NOW()),
                update_date = COALESCE(update_date, created_at, NOW()),
                create_by = COALESCE(NULLIF(create_by, ''), NULLIF(actor_email, ''), 'system'),
                update_by = COALESCE(NULLIF(update_by, ''), NULLIF(actor_email, ''), 'system'),
                actor_user_id = COALESCE(NULLIF(actor_user_id, ''), actor_id, ''),
                status = COALESCE(NULLIF(status, ''), NULLIF(result, ''), 'SUCCESS'),
                metadata = CASE
                    WHEN metadata = '{}'::jsonb AND extra IS NOT NULL THEN extra
                    ELSE metadata
                END
            """
        )

    _create_index_once("pa_audit_logs_create_date_idx", "pa_audit_logs", ["create_date"])
    _create_index_once("pa_audit_logs_actor_email_idx", "pa_audit_logs", ["actor_email"])
    _create_index_once("pa_audit_logs_action_idx", "pa_audit_logs", ["action"])
    _create_index_once(
        "pa_audit_logs_resource_idx",
        "pa_audit_logs",
        ["resource_type", "resource_id"],
    )
    _create_index_once("pa_audit_logs_project_id_idx", "pa_audit_logs", ["project_id"])
    _create_index_once(
        "pa_audit_logs_organization_id_idx",
        "pa_audit_logs",
        ["organization_id"],
    )


def downgrade() -> None:
    for index_name in [
        "pa_audit_logs_create_date_idx",
        "pa_audit_logs_actor_email_idx",
        "pa_audit_logs_action_idx",
        "pa_audit_logs_resource_idx",
        "pa_audit_logs_project_id_idx",
        "pa_audit_logs_organization_id_idx",
    ]:
        _drop_index_if_exists(index_name, "pa_audit_logs")

    if _table_exists("pa_audit_logs"):
        op.drop_table("pa_audit_logs")
