"""create evaluation jobs

Revision ID: 20260723_0015
Revises: 20260718_0014
Create Date: 2026-07-23 00:15:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260723_0015"
down_revision = "20260718_0014"
branch_labels = None
depends_on = None


def _audit_columns() -> list[sa.Column]:
    return [
        sa.Column("create_by", sa.Text(), nullable=False, server_default=""),
        sa.Column("update_by", sa.Text(), nullable=False, server_default=""),
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
    op.add_column(
        "pa_auto_evaluation_runs",
        sa.Column(
            "config_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "pa_auto_evaluation_runs",
        sa.Column("idempotency_key", sa.Text(), nullable=True),
    )
    op.add_column(
        "pa_auto_evaluation_runs",
        sa.Column(
            "cancel_requested_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "pa_auto_evaluation_runs",
        sa.Column("queued_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "pa_auto_evaluation_runs",
        sa.Column("sample_manifest_object_key", sa.Text(), nullable=True),
    )
    op.add_column(
        "pa_auto_evaluation_runs",
        sa.Column("sample_manifest_hash", sa.Text(), nullable=True),
    )

    op.create_table(
        "pa_evaluation_jobs",
        *_audit_columns(),
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("task_id", sa.Text(), nullable=False),
        sa.Column("run_id", sa.Text(), nullable=False),
        sa.Column("parent_job_id", sa.Text(), nullable=True),
        sa.Column("job_type", sa.Text(), nullable=False),
        sa.Column("routing_key", sa.Text(), nullable=False, server_default="shared"),
        sa.Column("batch_start", sa.Integer(), nullable=True),
        sa.Column("batch_end", sa.Integer(), nullable=True),
        sa.Column("idempotency_key", sa.Text(), nullable=False, unique=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="PENDING"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "attempt_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "max_attempts",
            sa.Integer(),
            nullable=False,
            server_default="5",
        ),
        sa.Column(
            "next_attempt_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("lease_owner", sa.Text(), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "result_summary",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("raw_result_object_key", sa.Text(), nullable=True),
        sa.Column("error_code", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "job_type IN ('PREPARE_RUN', 'EVALUATE_BATCH', "
            "'SYNC_SCORE_BATCH', 'GENERATE_REPORT', 'FLOWBACK_BATCH')",
            name="pa_evaluation_jobs_job_type_check",
        ),
        sa.CheckConstraint(
            "status IN ('PENDING', 'ENQUEUED', 'RUNNING', 'RETRY_WAIT', "
            "'CANCELLING', 'SUCCEEDED', 'DEAD_LETTER', 'CANCELLED')",
            name="pa_evaluation_jobs_status_check",
        ),
        sa.CheckConstraint(
            "(batch_start IS NULL AND batch_end IS NULL) OR "
            "(batch_start >= 0 AND batch_end > batch_start)",
            name="pa_evaluation_jobs_batch_range_check",
        ),
        sa.CheckConstraint(
            "attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts",
            name="pa_evaluation_jobs_attempt_count_check",
        ),
        sa.ForeignKeyConstraint(
            ["run_id"],
            ["pa_auto_evaluation_runs.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["parent_job_id"],
            ["pa_evaluation_jobs.id"],
            ondelete="SET NULL",
        ),
    )
    op.create_index(
        "pa_evaluation_jobs_ready_idx",
        "pa_evaluation_jobs",
        ["status", "next_attempt_at", "priority"],
    )
    op.create_index(
        "pa_evaluation_jobs_running_lease_idx",
        "pa_evaluation_jobs",
        ["lease_expires_at"],
        postgresql_where=sa.text("status = 'RUNNING'"),
    )


def downgrade() -> None:
    op.drop_table("pa_evaluation_jobs")
    op.drop_column("pa_auto_evaluation_runs", "sample_manifest_hash")
    op.drop_column("pa_auto_evaluation_runs", "sample_manifest_object_key")
    op.drop_column("pa_auto_evaluation_runs", "queued_at")
    op.drop_column("pa_auto_evaluation_runs", "cancel_requested_at")
    op.drop_column("pa_auto_evaluation_runs", "idempotency_key")
    op.drop_column("pa_auto_evaluation_runs", "config_snapshot")
