"""create pa eval tables

Revision ID: 20260705_0001
Revises:
Create Date: 2026-07-05 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260705_0001"
down_revision = None
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


def upgrade() -> None:
    if not _table_exists("pa_evaluators"):
        op.create_table(
            "pa_evaluators",
            *_audit_columns(),
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
                server_default=sa.text("'[]'::jsonb"),
            ),
            sa.Column(
                "config",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("status", sa.Text(), nullable=False, server_default="ACTIVE"),
        )
    _create_index_once("pa_evaluators_project_id_idx", "pa_evaluators", ["project_id"])
    _create_index_once(
        "pa_evaluators_project_id_name_type_idx",
        "pa_evaluators",
        ["project_id", "name", "type"],
    )

    if not _table_exists("pa_evaluation_report_templates"):
        op.create_table(
            "pa_evaluation_report_templates",
            *_audit_columns(),
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("name", sa.Text(), nullable=False),
            sa.Column("description", sa.Text(), nullable=False, server_default=""),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("FALSE")),
            sa.Column("title_template", sa.Text(), nullable=False),
            sa.Column("summary_template", sa.Text(), nullable=False),
            sa.Column(
                "sections",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column(
                "badcase_rule",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column(
                "recommendations",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
            sa.Column(
                "risks",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
            sa.Column("status", sa.Text(), nullable=False, server_default="ACTIVE"),
        )
    _create_index_once(
        "pa_evaluation_report_templates_project_id_idx",
        "pa_evaluation_report_templates",
        ["project_id"],
    )
    _create_index_once(
        "pa_evaluation_report_templates_project_default_idx",
        "pa_evaluation_report_templates",
        ["project_id", "is_default"],
    )

    if not _table_exists("pa_project_api_keys"):
        op.create_table(
            "pa_project_api_keys",
            *_audit_columns(),
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("note", sa.Text(), nullable=False, server_default=""),
            sa.Column("public_key", sa.Text(), nullable=False),
            sa.Column("secret_key", sa.Text(), nullable=False),
        )
    _create_index_once(
        "pa_project_api_keys_project_id_idx",
        "pa_project_api_keys",
        ["project_id"],
    )
    _create_index_once(
        "pa_project_api_keys_public_key_idx",
        "pa_project_api_keys",
        ["public_key"],
    )

    if not _table_exists("pa_auto_evaluation_tasks"):
        op.create_table(
            "pa_auto_evaluation_tasks",
            *_audit_columns(),
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
            sa.Column("data_source", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("sample_rate", sa.Integer(), nullable=False, server_default="100"),
            sa.Column(
                "execution_stats",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("badcase_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("latest_report_id", sa.Text(), nullable=True),
            sa.Column("report_template_id", sa.Text(), nullable=True),
            sa.Column(
                "report_template_snapshot",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        )
    _create_index_once(
        "pa_auto_evaluation_tasks_project_id_idx",
        "pa_auto_evaluation_tasks",
        ["project_id"],
    )
    _create_index_once(
        "pa_auto_evaluation_tasks_project_update_id_idx",
        "pa_auto_evaluation_tasks",
        ["project_id", "update_date", "id"],
    )

    if not _table_exists("pa_auto_evaluation_runs"):
        op.create_table(
            "pa_auto_evaluation_runs",
            *_audit_columns(),
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
    _create_index_once(
        "pa_auto_evaluation_runs_project_id_idx",
        "pa_auto_evaluation_runs",
        ["project_id"],
    )

    if not _table_exists("pa_evaluation_reports"):
        op.create_table(
            "pa_evaluation_reports",
            *_audit_columns(),
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
            sa.Column(
                "metrics",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column(
                "distribution",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
            sa.Column(
                "group_analysis",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
            sa.Column(
                "recommendations",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
            sa.Column(
                "risks",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
            sa.Column(
                "reproduction",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("report_template_id", sa.Text(), nullable=True),
            sa.Column(
                "report_template_snapshot",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.ForeignKeyConstraint(
                ["source_task_id"],
                ["pa_auto_evaluation_tasks.id"],
                ondelete="CASCADE",
            ),
        )
    _create_index_once(
        "pa_evaluation_reports_project_id_idx",
        "pa_evaluation_reports",
        ["project_id"],
    )
    _create_index_once(
        "pa_evaluation_reports_project_generated_id_idx",
        "pa_evaluation_reports",
        ["project_id", "generated_at", "id"],
    )
    _create_index_once(
        "pa_evaluation_reports_source_task_id_idx",
        "pa_evaluation_reports",
        ["source_task_id"],
    )

    if not _table_exists("pa_evaluation_report_items"):
        op.create_table(
            "pa_evaluation_report_items",
            *_audit_columns(),
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("report_id", sa.Text(), nullable=False),
            sa.Column("source_id", sa.Text(), nullable=False),
            sa.Column("score_summary", sa.Text(), nullable=False),
            sa.Column("result_type", sa.Text(), nullable=False),
            sa.Column("execution_status", sa.Text(), nullable=False),
            sa.Column("dataset_flowback_status", sa.Text(), nullable=False, server_default="NONE"),
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
    _create_index_once(
        "pa_evaluation_report_items_project_id_idx",
        "pa_evaluation_report_items",
        ["project_id"],
    )

    if not _table_exists("pa_evaluation_report_badcases"):
        op.create_table(
            "pa_evaluation_report_badcases",
            *_audit_columns(),
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
    _create_index_once(
        "pa_evaluation_report_badcases_project_id_idx",
        "pa_evaluation_report_badcases",
        ["project_id"],
    )

    if not _table_exists("pa_evaluation_report_flowbacks"):
        op.create_table(
            "pa_evaluation_report_flowbacks",
            *_audit_columns(),
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
            sa.Column(
                "error_detail",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
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
    _create_index_once(
        "pa_evaluation_report_flowbacks_project_id_idx",
        "pa_evaluation_report_flowbacks",
        ["project_id"],
    )


def downgrade() -> None:
    _drop_index_if_exists(
        "pa_project_api_keys_public_key_idx",
        "pa_project_api_keys",
    )
    _drop_index_if_exists(
        "pa_project_api_keys_project_id_idx",
        "pa_project_api_keys",
    )
    _drop_table_if_exists("pa_project_api_keys")
    _drop_index_if_exists(
        "pa_evaluation_report_templates_project_default_idx",
        "pa_evaluation_report_templates",
    )
    _drop_index_if_exists(
        "pa_evaluation_report_templates_project_id_idx",
        "pa_evaluation_report_templates",
    )
    _drop_table_if_exists("pa_evaluation_report_templates")
    _drop_index_if_exists(
        "pa_evaluation_report_flowbacks_project_id_idx",
        "pa_evaluation_report_flowbacks",
    )
    _drop_index_if_exists(
        "pa_evaluation_report_flowbacks_report_id_idx",
        "pa_evaluation_report_flowbacks",
    )
    _drop_table_if_exists("pa_evaluation_report_flowbacks")
    _drop_index_if_exists(
        "pa_evaluation_report_badcases_project_id_idx",
        "pa_evaluation_report_badcases",
    )
    _drop_index_if_exists(
        "pa_evaluation_report_badcases_report_id_idx",
        "pa_evaluation_report_badcases",
    )
    _drop_table_if_exists("pa_evaluation_report_badcases")
    _drop_index_if_exists(
        "pa_evaluation_report_items_project_id_idx",
        "pa_evaluation_report_items",
    )
    _drop_index_if_exists(
        "pa_evaluation_report_items_report_id_idx",
        "pa_evaluation_report_items",
    )
    _drop_table_if_exists("pa_evaluation_report_items")
    _drop_index_if_exists(
        "pa_evaluation_reports_source_task_id_idx",
        "pa_evaluation_reports",
    )
    _drop_index_if_exists(
        "pa_evaluation_reports_project_generated_id_idx",
        "pa_evaluation_reports",
    )
    _drop_index_if_exists(
        "pa_evaluation_reports_project_id_idx",
        "pa_evaluation_reports",
    )
    _drop_table_if_exists("pa_evaluation_reports")
    _drop_index_if_exists(
        "pa_auto_evaluation_runs_project_id_idx",
        "pa_auto_evaluation_runs",
    )
    _drop_index_if_exists(
        "pa_auto_evaluation_runs_task_id_idx",
        "pa_auto_evaluation_runs",
    )
    _drop_table_if_exists("pa_auto_evaluation_runs")
    _drop_index_if_exists(
        "pa_auto_evaluation_tasks_project_update_id_idx",
        "pa_auto_evaluation_tasks",
    )
    _drop_index_if_exists(
        "pa_auto_evaluation_tasks_project_id_idx",
        "pa_auto_evaluation_tasks",
    )
    _drop_table_if_exists("pa_auto_evaluation_tasks")
    _drop_index_if_exists(
        "pa_evaluators_project_id_name_type_idx",
        "pa_evaluators",
    )
    _drop_index_if_exists("pa_evaluators_project_id_idx", "pa_evaluators")
    _drop_table_if_exists("pa_evaluators")
