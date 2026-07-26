"""create pa annotation export jobs

Revision ID: 20260711_0012
Revises: 20260711_0011
Create Date: 2026-07-11 00:12:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260711_0012"
down_revision = "20260711_0011"
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
    if not _table_exists("pa_annotation_export_jobs"):
        op.create_table(
            "pa_annotation_export_jobs",
            *_audit_columns(),
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("queue_id", sa.Text(), nullable=False),
            sa.Column("scope", sa.Text(), nullable=False),
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
                "scope IN ('filtered', 'selected')",
                name="pa_annotation_export_jobs_scope_check",
            ),
            sa.CheckConstraint(
                "format IN ('xlsx', 'csv', 'txt')",
                name="pa_annotation_export_jobs_format_check",
            ),
            sa.CheckConstraint(
                "status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')",
                name="pa_annotation_export_jobs_status_check",
            ),
        )

    _create_index_once(
        "pa_annotation_export_jobs_project_queue_idx",
        "pa_annotation_export_jobs",
        ["project_id", "queue_id"],
    )
    _create_index_once(
        "pa_annotation_export_jobs_project_update_idx",
        "pa_annotation_export_jobs",
        ["project_id", "update_date"],
    )
    op.execute("COMMENT ON TABLE pa_annotation_export_jobs IS 'PA人工标注导出任务表'")
    op.execute("COMMENT ON COLUMN pa_annotation_export_jobs.create_by IS '创建人'")
    op.execute("COMMENT ON COLUMN pa_annotation_export_jobs.update_by IS '更新人'")
    op.execute("COMMENT ON COLUMN pa_annotation_export_jobs.create_date IS '创建时间'")
    op.execute("COMMENT ON COLUMN pa_annotation_export_jobs.update_date IS '更新时间'")
    op.execute("COMMENT ON COLUMN pa_annotation_export_jobs.id IS '主键ID'")
    op.execute("COMMENT ON COLUMN pa_annotation_export_jobs.project_id IS '项目ID'")
    op.execute("COMMENT ON COLUMN pa_annotation_export_jobs.queue_id IS '人工标注任务ID'")
    op.execute(
        "COMMENT ON COLUMN pa_annotation_export_jobs.scope IS '导出范围：filtered/selected'"
    )
    op.execute("COMMENT ON COLUMN pa_annotation_export_jobs.format IS '导出格式'")
    op.execute("COMMENT ON COLUMN pa_annotation_export_jobs.status IS '导出任务状态'")
    op.execute("COMMENT ON COLUMN pa_annotation_export_jobs.total_count IS '导出总数'")
    op.execute("COMMENT ON COLUMN pa_annotation_export_jobs.exported_count IS '已导出数量'")
    op.execute("COMMENT ON COLUMN pa_annotation_export_jobs.file_name IS '导出文件名'")
    op.execute("COMMENT ON COLUMN pa_annotation_export_jobs.file_path IS '导出文件路径'")
    op.execute("COMMENT ON COLUMN pa_annotation_export_jobs.file_size IS '导出文件大小'")
    op.execute("COMMENT ON COLUMN pa_annotation_export_jobs.error_message IS '错误信息'")
    op.execute("COMMENT ON COLUMN pa_annotation_export_jobs.started_at IS '开始时间'")
    op.execute("COMMENT ON COLUMN pa_annotation_export_jobs.completed_at IS '完成时间'")
    op.execute("COMMENT ON COLUMN pa_annotation_export_jobs.expires_at IS '过期时间'")
    op.execute("COMMENT ON COLUMN pa_annotation_export_jobs.metadata IS '导出任务元数据'")


def downgrade() -> None:
    _drop_index_if_exists(
        "pa_annotation_export_jobs_project_update_idx",
        "pa_annotation_export_jobs",
    )
    _drop_index_if_exists(
        "pa_annotation_export_jobs_project_queue_idx",
        "pa_annotation_export_jobs",
    )
    _drop_table_if_exists("pa_annotation_export_jobs")
