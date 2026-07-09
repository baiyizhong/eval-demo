"""create auto evaluation schedules

Revision ID: 20260709_0010
Revises: 20260708_0009
Create Date: 2026-07-09 00:10:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260709_0010"
down_revision = "20260708_0009"
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


def _index_exists(table_name: str, index_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(index["name"] == index_name for index in _inspector().get_indexes(table_name))


def _create_index_once(
    index_name: str,
    table_name: str,
    columns: list[str],
    *,
    unique: bool = False,
) -> None:
    if not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=unique)


def _drop_index_if_exists(index_name: str, table_name: str) -> None:
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)


def _drop_table_if_exists(table_name: str) -> None:
    if _table_exists(table_name):
        op.drop_table(table_name)


def _add_column_once(table_name: str, column: sa.Column, comment: str) -> None:
    if not _column_exists(table_name, column.name):
        op.add_column(table_name, column)
    _comment_column(table_name, column.name, comment)


def _drop_column_if_exists(table_name: str, column_name: str) -> None:
    if _column_exists(table_name, column_name):
        op.drop_column(table_name, column_name)


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


def _comment_table(table_name: str, comment: str) -> None:
    op.execute(sa.text(f"COMMENT ON TABLE {table_name} IS {_quote_literal(comment)}"))


def _comment_column(table_name: str, column_name: str, comment: str) -> None:
    op.execute(
        sa.text(
            f"COMMENT ON COLUMN {table_name}.{column_name} IS {_quote_literal(comment)}"
        )
    )


def _comment_audit_columns(table_name: str) -> None:
    _comment_column(table_name, "create_by", "创建人")
    _comment_column(table_name, "update_by", "更新人")
    _comment_column(table_name, "create_date", "创建时间")
    _comment_column(table_name, "update_date", "更新时间")


def upgrade() -> None:
    if not _table_exists("pa_auto_evaluation_schedules"):
        op.create_table(
            "pa_auto_evaluation_schedules",
            *_audit_columns(),
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("task_id", sa.Text(), nullable=False),
            sa.Column("status", sa.Text(), nullable=False),
            sa.Column("cron_expression", sa.Text(), nullable=False),
            sa.Column("timezone", sa.Text(), nullable=False),
            sa.Column(
                "window_config",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column(
                "retry_policy",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_scheduled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_window_start", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_window_end", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(
                ["task_id"],
                ["pa_auto_evaluation_tasks.id"],
                ondelete="CASCADE",
            ),
        )

    _create_index_once(
        "pa_auto_evaluation_schedules_project_id_idx",
        "pa_auto_evaluation_schedules",
        ["project_id"],
    )
    _create_index_once(
        "pa_auto_evaluation_schedules_task_id_uidx",
        "pa_auto_evaluation_schedules",
        ["task_id"],
        unique=True,
    )
    _create_index_once(
        "pa_auto_evaluation_schedules_status_next_run_at_idx",
        "pa_auto_evaluation_schedules",
        ["status", "next_run_at"],
    )

    _comment_table("pa_auto_evaluation_schedules", "PA 自动评测调度配置")
    _comment_audit_columns("pa_auto_evaluation_schedules")
    _comment_column("pa_auto_evaluation_schedules", "id", "主键 ID")
    _comment_column("pa_auto_evaluation_schedules", "project_id", "Langfuse 项目 ID")
    _comment_column("pa_auto_evaluation_schedules", "task_id", "自动评测任务 ID")
    _comment_column("pa_auto_evaluation_schedules", "status", "调度状态")
    _comment_column("pa_auto_evaluation_schedules", "cron_expression", "Cron 调度表达式")
    _comment_column("pa_auto_evaluation_schedules", "timezone", "调度时区")
    _comment_column("pa_auto_evaluation_schedules", "window_config", "调度窗口配置")
    _comment_column("pa_auto_evaluation_schedules", "retry_policy", "调度重试策略")
    _comment_column("pa_auto_evaluation_schedules", "next_run_at", "下次计划运行时间")
    _comment_column("pa_auto_evaluation_schedules", "last_scheduled_at", "最近调度触发时间")
    _comment_column("pa_auto_evaluation_schedules", "last_window_start", "最近调度窗口开始时间")
    _comment_column("pa_auto_evaluation_schedules", "last_window_end", "最近调度窗口结束时间")

    if _table_exists("pa_auto_evaluation_runs"):
        for column, comment in [
            (
                sa.Column(
                    "trigger_source",
                    sa.Text(),
                    nullable=False,
                    server_default="MANUAL",
                ),
                "运行触发来源",
            ),
            (
                sa.Column("window_start", sa.DateTime(timezone=True), nullable=True),
                "本次运行窗口开始时间",
            ),
            (
                sa.Column("window_end", sa.DateTime(timezone=True), nullable=True),
                "本次运行窗口结束时间",
            ),
            (
                sa.Column("scheduled_fire_at", sa.DateTime(timezone=True), nullable=True),
                "计划触发时间",
            ),
            (
                sa.Column(
                    "attempt_no",
                    sa.Integer(),
                    nullable=False,
                    server_default="1",
                ),
                "运行尝试次数",
            ),
            (
                sa.Column("parent_run_id", sa.Text(), nullable=True),
                "父运行 ID",
            ),
            (
                sa.Column(
                    "run_config_snapshot",
                    postgresql.JSONB(astext_type=sa.Text()),
                    nullable=False,
                    server_default=sa.text("'{}'::jsonb"),
                ),
                "运行配置快照",
            ),
        ]:
            _add_column_once("pa_auto_evaluation_runs", column, comment)


def downgrade() -> None:
    for column_name in [
        "run_config_snapshot",
        "parent_run_id",
        "attempt_no",
        "scheduled_fire_at",
        "window_end",
        "window_start",
        "trigger_source",
    ]:
        _drop_column_if_exists("pa_auto_evaluation_runs", column_name)

    _drop_index_if_exists(
        "pa_auto_evaluation_schedules_status_next_run_at_idx",
        "pa_auto_evaluation_schedules",
    )
    _drop_index_if_exists(
        "pa_auto_evaluation_schedules_task_id_uidx",
        "pa_auto_evaluation_schedules",
    )
    _drop_index_if_exists(
        "pa_auto_evaluation_schedules_project_id_idx",
        "pa_auto_evaluation_schedules",
    )
    _drop_table_if_exists("pa_auto_evaluation_schedules")
