"""align legacy pa tables with current schema

Revision ID: 20260707_0003
Revises: 20260707_0002
Create Date: 2026-07-07 00:03:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260707_0003"
down_revision = "20260707_0002"
branch_labels = None
depends_on = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return _inspector().has_table(table_name)


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


def _drop_column_if_exists(table_name: str, column_name: str) -> None:
    if _column_exists(table_name, column_name):
        op.drop_column(table_name, column_name)


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


def _add_audit_columns(table_name: str) -> None:
    for column in _audit_columns():
        _add_column_once(table_name, column)


def _jsonb(default: str) -> sa.Column:
    raise NotImplementedError(default)


def upgrade() -> None:
    _align_evaluators()
    _align_report_templates()
    _align_project_api_keys()
    _align_auto_evaluation_tasks()
    _align_auto_evaluation_runs()
    _align_evaluation_reports()
    _align_evaluation_report_items()
    _align_evaluation_report_badcases()
    _align_evaluation_report_flowbacks()


def downgrade() -> None:
    for table_name, columns in {
        "pa_evaluators": ["create_by", "update_by", "create_date", "update_date"],
        "pa_project_api_keys": ["create_by", "update_by", "create_date", "update_date"],
        "pa_auto_evaluation_tasks": [
            "create_by",
            "update_by",
            "create_date",
            "update_date",
            "description",
            "score_name",
            "evaluator_id",
            "evaluator_name",
            "evaluator_type",
            "evaluator_version",
            "data_source",
            "sample_rate",
            "execution_stats",
            "badcase_count",
            "latest_report_id",
            "report_template_id",
            "report_template_snapshot",
            "last_run_at",
        ],
        "pa_auto_evaluation_runs": [
            "create_by",
            "update_by",
            "create_date",
            "update_date",
            "project_id",
            "sample_count",
            "completed_count",
            "failed_count",
            "badcase_count",
            "ended_at",
            "duration_text",
        ],
        "pa_evaluation_reports": [
            "create_by",
            "update_by",
            "create_date",
            "update_date",
            "title",
            "source_type",
            "source_task_id",
            "source_task_name",
            "sample_count",
            "badcase_count",
            "flowback_count",
            "generated_at",
            "distribution",
            "group_analysis",
            "recommendations",
            "risks",
            "reproduction",
            "error_message",
            "report_template_id",
            "report_template_snapshot",
        ],
        "pa_evaluation_report_items": [
            "create_by",
            "update_by",
            "create_date",
            "update_date",
            "project_id",
            "source_id",
            "score_summary",
            "result_type",
            "execution_status",
            "dataset_flowback_status",
        ],
        "pa_evaluation_report_flowbacks": [
            "create_by",
            "update_by",
            "create_date",
            "update_date",
            "project_id",
            "flowback_type",
            "target_dataset_id",
            "target_dataset_name",
            "target_dataset_created",
            "requested_count",
            "success_count",
            "failed_count",
            "error_detail",
        ],
    }.items():
        if _table_exists(table_name):
            for column_name in columns:
                _drop_column_if_exists(table_name, column_name)

    if _table_exists("pa_evaluation_report_badcases"):
        op.drop_table("pa_evaluation_report_badcases")
    if _table_exists("pa_evaluation_report_templates"):
        op.drop_table("pa_evaluation_report_templates")


def _align_evaluators() -> None:
    if not _table_exists("pa_evaluators"):
        return
    _add_audit_columns("pa_evaluators")
    _add_column_once("pa_evaluators", sa.Column("provider", sa.Text(), nullable=False, server_default="PA"))
    _add_column_once("pa_evaluators", sa.Column("variables", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")))
    _add_column_once("pa_evaluators", sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")))


def _align_report_templates() -> None:
    if _table_exists("pa_evaluation_report_templates"):
        _add_audit_columns("pa_evaluation_report_templates")
        return
    op.create_table(
        "pa_evaluation_report_templates",
        *_audit_columns(),
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("title_template", sa.Text(), nullable=False),
        sa.Column("summary_template", sa.Text(), nullable=False),
        sa.Column("sections", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("badcase_rule", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("recommendations", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("risks", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("status", sa.Text(), nullable=False, server_default="ACTIVE"),
    )


def _align_project_api_keys() -> None:
    if not _table_exists("pa_project_api_keys"):
        return
    _add_audit_columns("pa_project_api_keys")


def _align_auto_evaluation_tasks() -> None:
    if not _table_exists("pa_auto_evaluation_tasks"):
        return
    _add_audit_columns("pa_auto_evaluation_tasks")
    _add_column_once("pa_auto_evaluation_tasks", sa.Column("description", sa.Text(), nullable=False, server_default=""))
    _add_column_once("pa_auto_evaluation_tasks", sa.Column("score_name", sa.Text(), nullable=False, server_default=""))
    _add_column_once("pa_auto_evaluation_tasks", sa.Column("evaluator_id", sa.Text(), nullable=False, server_default=""))
    _add_column_once("pa_auto_evaluation_tasks", sa.Column("evaluator_name", sa.Text(), nullable=False, server_default=""))
    _add_column_once("pa_auto_evaluation_tasks", sa.Column("evaluator_type", sa.Text(), nullable=False, server_default="LLM"))
    _add_column_once("pa_auto_evaluation_tasks", sa.Column("evaluator_version", sa.Text(), nullable=False, server_default="v1"))
    _add_column_once("pa_auto_evaluation_tasks", sa.Column("data_source", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")))
    _add_column_once("pa_auto_evaluation_tasks", sa.Column("sample_rate", sa.Integer(), nullable=False, server_default="100"))
    _add_column_once("pa_auto_evaluation_tasks", sa.Column("execution_stats", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")))
    _add_column_once("pa_auto_evaluation_tasks", sa.Column("badcase_count", sa.Integer(), nullable=False, server_default="0"))
    _add_column_once("pa_auto_evaluation_tasks", sa.Column("latest_report_id", sa.Text(), nullable=True))
    _add_column_once("pa_auto_evaluation_tasks", sa.Column("report_template_id", sa.Text(), nullable=True))
    _add_column_once("pa_auto_evaluation_tasks", sa.Column("report_template_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")))
    _add_column_once("pa_auto_evaluation_tasks", sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(sa.text("UPDATE pa_auto_evaluation_tasks SET create_by = COALESCE(NULLIF(created_by, ''), create_by), update_by = COALESCE(NULLIF(created_by, ''), update_by), create_date = COALESCE(created_at, create_date), update_date = COALESCE(updated_at, update_date)"))


def _align_auto_evaluation_runs() -> None:
    if not _table_exists("pa_auto_evaluation_runs"):
        return
    _add_audit_columns("pa_auto_evaluation_runs")
    _add_column_once("pa_auto_evaluation_runs", sa.Column("project_id", sa.Text(), nullable=False, server_default=""))
    _add_column_once("pa_auto_evaluation_runs", sa.Column("sample_count", sa.Integer(), nullable=False, server_default="0"))
    _add_column_once("pa_auto_evaluation_runs", sa.Column("completed_count", sa.Integer(), nullable=False, server_default="0"))
    _add_column_once("pa_auto_evaluation_runs", sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"))
    _add_column_once("pa_auto_evaluation_runs", sa.Column("badcase_count", sa.Integer(), nullable=False, server_default="0"))
    _add_column_once("pa_auto_evaluation_runs", sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True))
    _add_column_once("pa_auto_evaluation_runs", sa.Column("duration_text", sa.Text(), nullable=False, server_default=""))
    op.execute(sa.text("UPDATE pa_auto_evaluation_runs SET sample_count = COALESCE(progress_total, sample_count), completed_count = COALESCE(progress_completed, completed_count), failed_count = COALESCE(progress_failed, failed_count), badcase_count = COALESCE(bad_case_count, badcase_count), create_date = COALESCE(created_at, create_date), update_date = COALESCE(updated_at, update_date), ended_at = COALESCE(finished_at, ended_at)"))
    op.execute(sa.text("UPDATE pa_auto_evaluation_runs r SET project_id = t.project_id FROM pa_auto_evaluation_tasks t WHERE r.task_id = t.id AND r.project_id = ''"))


def _align_evaluation_reports() -> None:
    if not _table_exists("pa_evaluation_reports"):
        return
    _add_audit_columns("pa_evaluation_reports")
    _add_column_once("pa_evaluation_reports", sa.Column("title", sa.Text(), nullable=False, server_default=""))
    _add_column_once("pa_evaluation_reports", sa.Column("source_type", sa.Text(), nullable=False, server_default="AUTO_EVAL"))
    _add_column_once("pa_evaluation_reports", sa.Column("source_task_id", sa.Text(), nullable=False, server_default=""))
    _add_column_once("pa_evaluation_reports", sa.Column("source_task_name", sa.Text(), nullable=False, server_default=""))
    _add_column_once("pa_evaluation_reports", sa.Column("sample_count", sa.Integer(), nullable=False, server_default="0"))
    _add_column_once("pa_evaluation_reports", sa.Column("badcase_count", sa.Integer(), nullable=False, server_default="0"))
    _add_column_once("pa_evaluation_reports", sa.Column("flowback_count", sa.Integer(), nullable=False, server_default="0"))
    _add_column_once("pa_evaluation_reports", sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")))
    _add_column_once("pa_evaluation_reports", sa.Column("distribution", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")))
    _add_column_once("pa_evaluation_reports", sa.Column("group_analysis", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")))
    _add_column_once("pa_evaluation_reports", sa.Column("recommendations", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")))
    _add_column_once("pa_evaluation_reports", sa.Column("risks", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")))
    _add_column_once("pa_evaluation_reports", sa.Column("reproduction", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")))
    _add_column_once("pa_evaluation_reports", sa.Column("error_message", sa.Text(), nullable=True))
    _add_column_once("pa_evaluation_reports", sa.Column("report_template_id", sa.Text(), nullable=True))
    _add_column_once("pa_evaluation_reports", sa.Column("report_template_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.execute(sa.text("UPDATE pa_evaluation_reports SET title = COALESCE(NULLIF(name, ''), title, '评测报告'), source_task_id = COALESCE(task_id, source_task_id), source_task_name = COALESCE(NULLIF(name, ''), source_task_name), create_by = COALESCE(NULLIF(generated_by, ''), create_by), update_by = COALESCE(NULLIF(generated_by, ''), update_by), create_date = COALESCE(created_at, create_date), update_date = COALESCE(updated_at, update_date), generated_at = COALESCE(created_at, generated_at)"))


def _align_evaluation_report_items() -> None:
    if not _table_exists("pa_evaluation_report_items"):
        return
    _add_audit_columns("pa_evaluation_report_items")
    _add_column_once("pa_evaluation_report_items", sa.Column("project_id", sa.Text(), nullable=False, server_default=""))
    _add_column_once("pa_evaluation_report_items", sa.Column("source_id", sa.Text(), nullable=False, server_default=""))
    _add_column_once("pa_evaluation_report_items", sa.Column("score_summary", sa.Text(), nullable=False, server_default=""))
    _add_column_once("pa_evaluation_report_items", sa.Column("result_type", sa.Text(), nullable=False, server_default="PASS"))
    _add_column_once("pa_evaluation_report_items", sa.Column("execution_status", sa.Text(), nullable=False, server_default="COMPLETED"))
    _add_column_once("pa_evaluation_report_items", sa.Column("dataset_flowback_status", sa.Text(), nullable=False, server_default="NONE"))
    op.execute(sa.text("UPDATE pa_evaluation_report_items i SET project_id = r.project_id FROM pa_evaluation_reports r WHERE i.report_id = r.id AND i.project_id = ''"))
    op.execute(sa.text("UPDATE pa_evaluation_report_items SET source_id = COALESCE(NULLIF(source_item_id, ''), trace_id, observation_id, source_id), score_summary = COALESCE(reason, score_summary), result_type = CASE WHEN status = 'BADCASE' THEN 'BADCASE' ELSE result_type END, create_date = COALESCE(created_at, create_date), update_date = COALESCE(updated_at, update_date)"))


def _align_evaluation_report_badcases() -> None:
    if _table_exists("pa_evaluation_report_badcases"):
        _add_audit_columns("pa_evaluation_report_badcases")
        return
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
    )


def _align_evaluation_report_flowbacks() -> None:
    if not _table_exists("pa_evaluation_report_flowbacks"):
        return
    _add_audit_columns("pa_evaluation_report_flowbacks")
    _add_column_once("pa_evaluation_report_flowbacks", sa.Column("project_id", sa.Text(), nullable=False, server_default=""))
    _add_column_once("pa_evaluation_report_flowbacks", sa.Column("flowback_type", sa.Text(), nullable=False, server_default="BADCASE"))
    _add_column_once("pa_evaluation_report_flowbacks", sa.Column("target_dataset_id", sa.Text(), nullable=False, server_default=""))
    _add_column_once("pa_evaluation_report_flowbacks", sa.Column("target_dataset_name", sa.Text(), nullable=False, server_default=""))
    _add_column_once("pa_evaluation_report_flowbacks", sa.Column("target_dataset_created", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    _add_column_once("pa_evaluation_report_flowbacks", sa.Column("requested_count", sa.Integer(), nullable=False, server_default="0"))
    _add_column_once("pa_evaluation_report_flowbacks", sa.Column("success_count", sa.Integer(), nullable=False, server_default="0"))
    _add_column_once("pa_evaluation_report_flowbacks", sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"))
    _add_column_once("pa_evaluation_report_flowbacks", sa.Column("error_detail", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")))
    op.execute(sa.text("UPDATE pa_evaluation_report_flowbacks f SET project_id = r.project_id FROM pa_evaluation_reports r WHERE f.report_id = r.id AND f.project_id = ''"))
