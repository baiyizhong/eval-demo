"""create pa trace bulk jobs

Revision ID: 20260719_0014
Revises: 20260714_0013
Create Date: 2026-07-19 00:14:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260719_0014"
down_revision = "20260714_0013"
branch_labels = None
depends_on = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return _inspector().has_table(table_name)


def _index_exists(table_name: str, index_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(
        index["name"] == index_name for index in _inspector().get_indexes(table_name)
    )


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
    if not _table_exists("pa_trace_bulk_jobs"):
        op.create_table(
            "pa_trace_bulk_jobs",
            *_audit_columns(),
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column(
                "project_id",
                sa.Text(),
                sa.ForeignKey("projects.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("user_id", sa.Text(), nullable=False),
            sa.Column("job_type", sa.Text(), nullable=False),
            sa.Column("status", sa.Text(), nullable=False, server_default="PENDING"),
            sa.Column("selection_type", sa.Text(), nullable=False),
            sa.Column(
                "selection_payload",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column(
                "operation_payload",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column(
                "cursor_payload",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column(
                "result_payload",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("total_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "completed_count", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "success_count", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "failure_count", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "attempt_count", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column("error_message", sa.Text(), nullable=False, server_default=""),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("lock_owner", sa.Text(), nullable=False, server_default=""),
            sa.Column("lock_until", sa.DateTime(timezone=True), nullable=True),
            sa.CheckConstraint(
                "job_type IN ('DATASET_IMPORT', 'ANNOTATION_TASK')",
                name="pa_trace_bulk_jobs_job_type_check",
            ),
            sa.CheckConstraint(
                "status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')",
                name="pa_trace_bulk_jobs_status_check",
            ),
            sa.CheckConstraint(
                "selection_type IN ('EXPLICIT', 'FILTER')",
                name="pa_trace_bulk_jobs_selection_type_check",
            ),
        )

    _create_index_once(
        "pa_trace_bulk_jobs_claim_idx",
        "pa_trace_bulk_jobs",
        ["status", "lock_until", "create_date"],
    )
    _create_index_once(
        "pa_trace_bulk_jobs_project_user_update_idx",
        "pa_trace_bulk_jobs",
        ["project_id", "user_id", "update_date"],
    )

    op.execute("COMMENT ON TABLE pa_trace_bulk_jobs IS 'PA Trace批量异步任务表'")
    op.execute("COMMENT ON COLUMN pa_trace_bulk_jobs.create_by IS '创建人'")
    op.execute("COMMENT ON COLUMN pa_trace_bulk_jobs.update_by IS '更新人'")
    op.execute("COMMENT ON COLUMN pa_trace_bulk_jobs.create_date IS '创建时间'")
    op.execute("COMMENT ON COLUMN pa_trace_bulk_jobs.update_date IS '更新时间'")
    op.execute("COMMENT ON COLUMN pa_trace_bulk_jobs.id IS '批量任务ID'")
    op.execute("COMMENT ON COLUMN pa_trace_bulk_jobs.project_id IS '项目ID'")
    op.execute("COMMENT ON COLUMN pa_trace_bulk_jobs.user_id IS '任务创建用户ID'")
    op.execute(
        "COMMENT ON COLUMN pa_trace_bulk_jobs.job_type IS '任务类型：数据集导入或人工标注'"
    )
    op.execute("COMMENT ON COLUMN pa_trace_bulk_jobs.status IS '任务状态'")
    op.execute(
        "COMMENT ON COLUMN pa_trace_bulk_jobs.selection_type IS 'Trace选择方式：显式ID或筛选快照'"
    )
    op.execute(
        "COMMENT ON COLUMN pa_trace_bulk_jobs.selection_payload IS 'Trace选择条件快照'"
    )
    op.execute(
        "COMMENT ON COLUMN pa_trace_bulk_jobs.operation_payload IS '批量操作参数'"
    )
    op.execute(
        "COMMENT ON COLUMN pa_trace_bulk_jobs.cursor_payload IS '可恢复批处理游标'"
    )
    op.execute(
        "COMMENT ON COLUMN pa_trace_bulk_jobs.result_payload IS '任务结果与失败明细'"
    )
    op.execute("COMMENT ON COLUMN pa_trace_bulk_jobs.total_count IS '待处理总数'")
    op.execute("COMMENT ON COLUMN pa_trace_bulk_jobs.completed_count IS '已处理数量'")
    op.execute("COMMENT ON COLUMN pa_trace_bulk_jobs.success_count IS '成功数量'")
    op.execute("COMMENT ON COLUMN pa_trace_bulk_jobs.failure_count IS '失败或跳过数量'")
    op.execute(
        "COMMENT ON COLUMN pa_trace_bulk_jobs.attempt_count IS '任务抢占执行次数'"
    )
    op.execute(
        "COMMENT ON COLUMN pa_trace_bulk_jobs.error_message IS '用户可见错误信息'"
    )
    op.execute("COMMENT ON COLUMN pa_trace_bulk_jobs.started_at IS '首次开始时间'")
    op.execute("COMMENT ON COLUMN pa_trace_bulk_jobs.completed_at IS '完成时间'")
    op.execute("COMMENT ON COLUMN pa_trace_bulk_jobs.expires_at IS '结果过期时间'")
    op.execute("COMMENT ON COLUMN pa_trace_bulk_jobs.lock_owner IS '当前租约持有实例'")
    op.execute("COMMENT ON COLUMN pa_trace_bulk_jobs.lock_until IS '当前租约到期时间'")


def downgrade() -> None:
    _drop_index_if_exists(
        "pa_trace_bulk_jobs_project_user_update_idx",
        "pa_trace_bulk_jobs",
    )
    _drop_index_if_exists(
        "pa_trace_bulk_jobs_claim_idx",
        "pa_trace_bulk_jobs",
    )
    _drop_table_if_exists("pa_trace_bulk_jobs")
