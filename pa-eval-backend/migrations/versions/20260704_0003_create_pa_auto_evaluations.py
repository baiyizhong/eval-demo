"""create pa auto evaluations

Revision ID: 20260704_0003
Revises: 20260704_0002
Create Date: 2026-07-04 02:15:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260704_0003"
down_revision = "20260704_0002"
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
    if not _table_exists("pa_auto_evaluation_tasks"):
        op.create_table(
            "pa_auto_evaluation_tasks",
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("name", sa.Text(), nullable=False),
            sa.Column("description", sa.Text(), nullable=False, server_default=""),
            sa.Column("score_name", sa.Text(), nullable=False),
            sa.Column("status", sa.Text(), nullable=False),
            sa.Column("evaluator_id", sa.Text(), nullable=False),
            sa.Column("evaluator_name", sa.Text(), nullable=False),
            sa.Column("evaluator_type", sa.Text(), nullable=False),
            sa.Column("evaluator_version", sa.Text(), nullable=False),
            sa.Column(
                "data_source",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
            ),
            sa.Column("sample_rate", sa.Integer(), nullable=False, server_default="100"),
            sa.Column(
                "execution_stats",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
            ),
            sa.Column("badcase_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("latest_report_id", sa.Text(), nullable=True),
            sa.Column("created_by", sa.Text(), nullable=False),
            sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
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
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        )
    _create_index_once(
        "pa_auto_evaluation_tasks_project_id_idx",
        "pa_auto_evaluation_tasks",
        ["project_id"],
    )

    if not _table_exists("pa_auto_evaluation_runs"):
        op.create_table(
            "pa_auto_evaluation_runs",
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("task_id", sa.Text(), nullable=False),
            sa.Column("status", sa.Text(), nullable=False),
            sa.Column("sample_count", sa.Integer(), nullable=False),
            sa.Column("completed_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("badcase_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "started_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("NOW()"),
            ),
            sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("duration_text", sa.Text(), nullable=False, server_default=""),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(
                ["task_id"],
                ["pa_auto_evaluation_tasks.id"],
                ondelete="CASCADE",
            ),
        )
    _create_index_once(
        "pa_auto_evaluation_runs_task_id_idx",
        "pa_auto_evaluation_runs",
        ["task_id"],
    )

    if not _table_exists("pa_evaluation_reports"):
        op.create_table(
            "pa_evaluation_reports",
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("title", sa.Text(), nullable=False),
            sa.Column("source_type", sa.Text(), nullable=False),
            sa.Column("source_task_id", sa.Text(), nullable=False),
            sa.Column("source_task_name", sa.Text(), nullable=False),
            sa.Column("status", sa.Text(), nullable=False),
            sa.Column("sample_count", sa.Integer(), nullable=False),
            sa.Column("badcase_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("flowback_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "generated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("NOW()"),
            ),
            sa.Column("summary", sa.Text(), nullable=False, server_default=""),
            sa.Column("metrics", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column(
                "distribution",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
            ),
            sa.Column(
                "group_analysis",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
            ),
            sa.Column(
                "recommendations",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
            ),
            sa.Column("risks", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column(
                "reproduction",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
            ),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        )
    _create_index_once(
        "pa_evaluation_reports_project_id_idx",
        "pa_evaluation_reports",
        ["project_id"],
    )

    if not _table_exists("pa_evaluation_report_items"):
        op.create_table(
            "pa_evaluation_report_items",
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("report_id", sa.Text(), nullable=False),
            sa.Column("source_id", sa.Text(), nullable=False),
            sa.Column("score_summary", sa.Text(), nullable=False),
            sa.Column("result_type", sa.Text(), nullable=False),
            sa.Column("execution_status", sa.Text(), nullable=False),
            sa.Column(
                "dataset_flowback_status",
                sa.Text(),
                nullable=False,
                server_default="NONE",
            ),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(
                ["report_id"],
                ["pa_evaluation_reports.id"],
                ondelete="CASCADE",
            ),
        )
    _create_index_once(
        "pa_evaluation_report_items_report_id_idx",
        "pa_evaluation_report_items",
        ["report_id"],
    )

    if not _table_exists("pa_evaluation_report_badcases"):
        op.create_table(
            "pa_evaluation_report_badcases",
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("report_id", sa.Text(), nullable=False),
            sa.Column("trace_id", sa.Text(), nullable=False),
            sa.Column("observation_id", sa.Text(), nullable=False),
            sa.Column("dataset_item_id", sa.Text(), nullable=False),
            sa.Column("score_name", sa.Text(), nullable=False),
            sa.Column("score_value", sa.Float(), nullable=False),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("comment", sa.Text(), nullable=False),
            sa.Column("source_type", sa.Text(), nullable=False),
            sa.Column("flowback_status", sa.Text(), nullable=False, server_default="NONE"),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(
                ["report_id"],
                ["pa_evaluation_reports.id"],
                ondelete="CASCADE",
            ),
        )
    _create_index_once(
        "pa_evaluation_report_badcases_report_id_idx",
        "pa_evaluation_report_badcases",
        ["report_id"],
    )


def downgrade() -> None:
    _drop_index_if_exists(
        "pa_evaluation_report_badcases_report_id_idx",
        "pa_evaluation_report_badcases",
    )
    _drop_table_if_exists("pa_evaluation_report_badcases")
    _drop_index_if_exists(
        "pa_evaluation_report_items_report_id_idx",
        "pa_evaluation_report_items",
    )
    _drop_table_if_exists("pa_evaluation_report_items")
    _drop_index_if_exists(
        "pa_evaluation_reports_project_id_idx",
        "pa_evaluation_reports",
    )
    _drop_table_if_exists("pa_evaluation_reports")
    _drop_index_if_exists(
        "pa_auto_evaluation_runs_task_id_idx",
        "pa_auto_evaluation_runs",
    )
    _drop_table_if_exists("pa_auto_evaluation_runs")
    _drop_index_if_exists(
        "pa_auto_evaluation_tasks_project_id_idx",
        "pa_auto_evaluation_tasks",
    )
    _drop_table_if_exists("pa_auto_evaluation_tasks")
