"""normalize pa audit action values

Revision ID: 20260707_0005
Revises: 20260707_0004
Create Date: 2026-07-07 13:00:00.000000
"""

from alembic import op


revision = "20260707_0005"
down_revision = "20260707_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE pa_audit_logs
        SET
            action = UPPER(action),
            status = UPPER(status),
            update_date = NOW()
        WHERE action <> UPPER(action)
           OR status <> UPPER(status)
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE pa_audit_logs
        SET
            action = LOWER(action),
            status = LOWER(status),
            update_date = NOW()
        WHERE action IN ('CREATE', 'UPDATE', 'DELETE')
          AND status IN ('SUCCESS', 'FAILED')
        """
    )
