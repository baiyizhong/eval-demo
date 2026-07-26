"""create scheduled jobs

Revision ID: 20260709_0010
Revises: 20260708_0009
Create Date: 2026-07-09 10:00:00.000000
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
    if not _table_exists("pa_scheduled_jobs"):
        op.create_table(
            "pa_scheduled_jobs",
            *_audit_columns(),
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("task_type", sa.Text(), nullable=False),
            sa.Column("name", sa.Text(), nullable=False),
            sa.Column("description", sa.Text(), nullable=False, server_default=""),
            sa.Column("score_name", sa.Text(), nullable=False),
            sa.Column("run_mode", sa.Text(), nullable=False),
            sa.Column(
                "frequency",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("timezone", sa.Text(), nullable=False, server_default="Asia/Shanghai"),
            sa.Column("status", sa.Text(), nullable=False),
            sa.Column(
                "scheduler_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("TRUE"),
            ),
            sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("lock_owner", sa.Text(), nullable=True),
            sa.Column("lock_until", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_fire_key", sa.Text(), nullable=True),
            sa.Column("evaluator_id", sa.Text(), nullable=False),
            sa.Column(
                "evaluator_snapshot",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column(
                "variable_mapping",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column(
                "data_source",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("sample_rate", sa.Integer(), nullable=False, server_default="100"),
            sa.Column("report_template_id", sa.Text(), nullable=True),
            sa.Column(
                "report_template_snapshot",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column(
                "badcase_config",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("latest_auto_evaluation_task_id", sa.Text(), nullable=True),
            sa.Column("latest_report_id", sa.Text(), nullable=True),
            sa.Column("created_user_id", sa.Text(), nullable=False),
        )

    _create_index_once("pa_scheduled_jobs_project_id_idx", "pa_scheduled_jobs", ["project_id"])
    _create_index_once(
        "pa_scheduled_jobs_due_idx",
        "pa_scheduled_jobs",
        ["scheduler_enabled", "status", "next_run_at", "lock_until"],
    )
    _create_index_once(
        "pa_scheduled_jobs_project_update_id_idx",
        "pa_scheduled_jobs",
        ["project_id", "update_date", "id"],
    )

    if not _table_exists("pa_scheduled_job_execution_logs"):
        op.create_table(
            "pa_scheduled_job_execution_logs",
            *_audit_columns(),
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("scheduled_job_id", sa.Text(), nullable=False),
            sa.Column("scheduled_job_name", sa.Text(), nullable=False),
            sa.Column("task_type", sa.Text(), nullable=False),
            sa.Column("trigger_type", sa.Text(), nullable=False),
            sa.Column("fire_key", sa.Text(), nullable=False),
            sa.Column("scheduled_fire_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("auto_evaluation_task_id", sa.Text(), nullable=True),
            sa.Column("auto_evaluation_task_name", sa.Text(), nullable=False),
            sa.Column("auto_evaluation_run_id", sa.Text(), nullable=True),
            sa.Column("evaluation_report_id", sa.Text(), nullable=True),
            sa.Column("status", sa.Text(), nullable=False),
            sa.Column("sample_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "started_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("NOW()"),
            ),
            sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("duration_text", sa.Text(), nullable=False, server_default=""),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("lock_owner", sa.Text(), nullable=True),
            sa.Column("lock_until", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "trigger_payload",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.ForeignKeyConstraint(
                ["scheduled_job_id"],
                ["pa_scheduled_jobs.id"],
                ondelete="CASCADE",
            ),
        )

    _create_index_once(
        "pa_scheduled_job_logs_project_id_idx",
        "pa_scheduled_job_execution_logs",
        ["project_id"],
    )
    _create_index_once(
        "pa_scheduled_job_logs_job_fire_key_uidx",
        "pa_scheduled_job_execution_logs",
        ["scheduled_job_id", "fire_key"],
        unique=True,
    )
    _create_index_once(
        "pa_scheduled_job_logs_job_started_id_idx",
        "pa_scheduled_job_execution_logs",
        ["scheduled_job_id", "started_at", "id"],
    )

    _comment_table("pa_scheduled_jobs", "PA 定时任务配置")
    _comment_audit_columns("pa_scheduled_jobs")
    for column_name, comment in {
        "id": "主键 ID",
        "project_id": "Langfuse 项目 ID",
        "task_type": "任务类型",
        "name": "任务名称",
        "description": "任务描述",
        "score_name": "自动评测 Score Name",
        "run_mode": "运行模式",
        "frequency": "执行频率配置",
        "timezone": "调度时区",
        "status": "定时任务状态",
        "scheduler_enabled": "是否启用内置调度器",
        "next_run_at": "下次运行时间",
        "last_run_at": "最近运行时间",
        "lock_owner": "当前调度锁持有实例",
        "lock_until": "当前调度锁过期时间",
        "last_fire_key": "最近触发幂等键",
        "evaluator_id": "评估器 ID",
        "evaluator_snapshot": "评估器快照",
        "variable_mapping": "变量映射",
        "data_source": "评测数据来源配置",
        "sample_rate": "采样率",
        "report_template_id": "报告模板 ID",
        "report_template_snapshot": "报告模板快照",
        "badcase_config": "Badcase 配置",
        "latest_auto_evaluation_task_id": "最近创建的自动评测任务 ID",
        "latest_report_id": "最近生成的评测报告 ID",
        "created_user_id": "创建人用户 ID",
    }.items():
        _comment_column("pa_scheduled_jobs", column_name, comment)

    _comment_table("pa_scheduled_job_execution_logs", "PA 定时任务执行日志")
    _comment_audit_columns("pa_scheduled_job_execution_logs")
    for column_name, comment in {
        "id": "主键 ID",
        "project_id": "Langfuse 项目 ID",
        "scheduled_job_id": "定时任务 ID",
        "scheduled_job_name": "触发时定时任务名称",
        "task_type": "任务类型",
        "trigger_type": "触发方式",
        "fire_key": "调度幂等键",
        "scheduled_fire_at": "计划触发时间",
        "auto_evaluation_task_id": "本次创建的自动评测任务 ID",
        "auto_evaluation_task_name": "本次创建的自动评测任务名称",
        "auto_evaluation_run_id": "本次自动评测运行 ID",
        "evaluation_report_id": "本次生成的评测报告 ID",
        "status": "执行状态",
        "sample_count": "处理样本数",
        "started_at": "开始时间",
        "ended_at": "结束时间",
        "duration_text": "执行耗时文本",
        "error_message": "错误信息",
        "lock_owner": "当前执行锁持有实例",
        "lock_until": "当前执行锁过期时间",
        "trigger_payload": "触发配置快照",
    }.items():
        _comment_column("pa_scheduled_job_execution_logs", column_name, comment)


def downgrade() -> None:
    _drop_index_if_exists(
        "pa_scheduled_job_logs_job_started_id_idx",
        "pa_scheduled_job_execution_logs",
    )
    _drop_index_if_exists(
        "pa_scheduled_job_logs_job_fire_key_uidx",
        "pa_scheduled_job_execution_logs",
    )
    _drop_index_if_exists(
        "pa_scheduled_job_logs_project_id_idx",
        "pa_scheduled_job_execution_logs",
    )
    _drop_table_if_exists("pa_scheduled_job_execution_logs")

    _drop_index_if_exists(
        "pa_scheduled_jobs_project_update_id_idx",
        "pa_scheduled_jobs",
    )
    _drop_index_if_exists("pa_scheduled_jobs_due_idx", "pa_scheduled_jobs")
    _drop_index_if_exists("pa_scheduled_jobs_project_id_idx", "pa_scheduled_jobs")
    _drop_table_if_exists("pa_scheduled_jobs")
