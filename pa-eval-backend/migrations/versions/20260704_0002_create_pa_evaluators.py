"""create pa evaluators

Revision ID: 20260704_0002
Revises: 0002_eval_workflows
Create Date: 2026-07-04 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260704_0002"
down_revision = "0002_eval_workflows"
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
    if not _table_exists("pa_evaluators"):
        op.create_table(
            "pa_evaluators",
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("name", sa.Text(), nullable=False),
            sa.Column("type", sa.Text(), nullable=False),
            sa.Column("provider", sa.Text(), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("description", sa.Text(), nullable=False, server_default=""),
            sa.Column(
                "variables",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default="[]",
            ),
            sa.Column(
                "config",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default="{}",
            ),
            sa.Column("status", sa.Text(), nullable=False, server_default="ACTIVE"),
            sa.Column("created_by", sa.Text(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("NOW()"),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("NOW()"),
            ),
            sa.ForeignKeyConstraint(
                ["project_id"],
                ["projects.id"],
                ondelete="CASCADE",
            ),
        )

    _create_index_once(
        "pa_evaluators_project_id_idx",
        "pa_evaluators",
        ["project_id"],
    )
    _create_index_once(
        "pa_evaluators_project_id_name_type_idx",
        "pa_evaluators",
        ["project_id", "name", "type"],
    )


def downgrade() -> None:
    _drop_index_if_exists(
        "pa_evaluators_project_id_name_type_idx",
        "pa_evaluators",
    )
    _drop_index_if_exists(
        "pa_evaluators_project_id_idx",
        "pa_evaluators",
    )
    _drop_table_if_exists("pa_evaluators")
