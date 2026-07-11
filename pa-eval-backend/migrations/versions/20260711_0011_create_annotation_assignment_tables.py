"""create annotation assignment tables

Revision ID: 20260711_0011
Revises: 20260709_0010
Create Date: 2026-07-11 00:11:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260711_0011"
down_revision = "20260709_0010"
branch_labels = None
depends_on = None


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
    op.create_table(
        "pa_annotation_queue_settings",
        *_audit_columns(),
        sa.Column("queue_id", sa.Text(), primary_key=True),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column(
            "assignment_strategy",
            sa.Text(),
            nullable=False,
            server_default="average",
        ),
        sa.Column(
            "assignment_weights",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.create_index(
        "pa_annotation_queue_settings_project_id_idx",
        "pa_annotation_queue_settings",
        ["project_id"],
    )
    op.execute(
        "COMMENT ON TABLE pa_annotation_queue_settings IS 'PA人工标注任务分配设置表'"
    )
    op.execute("COMMENT ON COLUMN pa_annotation_queue_settings.create_by IS '创建人'")
    op.execute("COMMENT ON COLUMN pa_annotation_queue_settings.update_by IS '更新人'")
    op.execute(
        "COMMENT ON COLUMN pa_annotation_queue_settings.create_date IS '创建时间'"
    )
    op.execute(
        "COMMENT ON COLUMN pa_annotation_queue_settings.update_date IS '更新时间'"
    )
    op.execute(
        "COMMENT ON COLUMN pa_annotation_queue_settings.queue_id IS '人工标注任务ID'"
    )
    op.execute("COMMENT ON COLUMN pa_annotation_queue_settings.project_id IS '项目ID'")
    op.execute(
        "COMMENT ON COLUMN pa_annotation_queue_settings.assignment_strategy IS '任务分配策略：average/random/weighted'"
    )
    op.execute(
        "COMMENT ON COLUMN pa_annotation_queue_settings.assignment_weights IS '按权重分配时的处理人权重配置'"
    )

    op.create_table(
        "pa_annotation_queue_item_assignments",
        *_audit_columns(),
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("queue_id", sa.Text(), nullable=False),
        sa.Column("item_id", sa.Text(), nullable=False),
        sa.Column("assignee_user_id", sa.Text(), nullable=False),
    )
    op.create_index(
        "pa_annotation_queue_item_assignments_queue_item_idx",
        "pa_annotation_queue_item_assignments",
        ["project_id", "queue_id", "item_id"],
        unique=True,
    )
    op.create_index(
        "pa_annotation_queue_item_assignments_assignee_idx",
        "pa_annotation_queue_item_assignments",
        ["project_id", "queue_id", "assignee_user_id"],
    )
    op.execute(
        "COMMENT ON TABLE pa_annotation_queue_item_assignments IS 'PA人工标注数据处理人分配表'"
    )
    op.execute(
        "COMMENT ON COLUMN pa_annotation_queue_item_assignments.create_by IS '创建人'"
    )
    op.execute(
        "COMMENT ON COLUMN pa_annotation_queue_item_assignments.update_by IS '更新人'"
    )
    op.execute(
        "COMMENT ON COLUMN pa_annotation_queue_item_assignments.create_date IS '创建时间'"
    )
    op.execute(
        "COMMENT ON COLUMN pa_annotation_queue_item_assignments.update_date IS '更新时间'"
    )
    op.execute("COMMENT ON COLUMN pa_annotation_queue_item_assignments.id IS '主键ID'")
    op.execute(
        "COMMENT ON COLUMN pa_annotation_queue_item_assignments.project_id IS '项目ID'"
    )
    op.execute(
        "COMMENT ON COLUMN pa_annotation_queue_item_assignments.queue_id IS '人工标注任务ID'"
    )
    op.execute(
        "COMMENT ON COLUMN pa_annotation_queue_item_assignments.item_id IS '标注数据ID'"
    )
    op.execute(
        "COMMENT ON COLUMN pa_annotation_queue_item_assignments.assignee_user_id IS '处理人用户ID'"
    )


def downgrade() -> None:
    op.drop_index(
        "pa_annotation_queue_item_assignments_assignee_idx",
        table_name="pa_annotation_queue_item_assignments",
    )
    op.drop_index(
        "pa_annotation_queue_item_assignments_queue_item_idx",
        table_name="pa_annotation_queue_item_assignments",
    )
    op.drop_table("pa_annotation_queue_item_assignments")
    op.drop_index(
        "pa_annotation_queue_settings_project_id_idx",
        table_name="pa_annotation_queue_settings",
    )
    op.drop_table("pa_annotation_queue_settings")
