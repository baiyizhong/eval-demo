"""legacy compatibility checkpoint

Revision ID: 20260705_0002
Revises: 20260705_0001
Create Date: 2026-07-05 00:02:00.000000

This revision preserves compatibility with local databases that were stamped
with a short-lived migration revision before the consolidated PA migration was
pulled from remote. The consolidated schema is represented by 20260705_0001.
"""


revision = "20260705_0002"
down_revision = "20260705_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
