"""backfill Langfuse project API key bcrypt hashes

Revision ID: 20260723_0018
Revises: 20260723_0017
Create Date: 2026-07-23 00:18:00.000000
"""

from alembic import op
import bcrypt
import sqlalchemy as sa


revision = "20260723_0018"
down_revision = "20260723_0017"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def upgrade() -> None:
    if not _table_exists("api_keys") or not _table_exists("pa_project_api_keys"):
        return

    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            """
            SELECT native.id, pa.secret_key
            FROM api_keys native
            JOIN pa_project_api_keys pa
              ON pa.project_id = native.project_id
             AND pa.public_key = native.public_key
            WHERE native.scope = 'PROJECT'
              AND native.hashed_secret_key LIKE 'pa-eval-placeholder-%'
            """
        )
    ).mappings()
    for row in rows:
        hashed_secret_key = bcrypt.hashpw(
            str(row["secret_key"]).encode("utf-8"),
            bcrypt.gensalt(rounds=11),
        ).decode("utf-8")
        connection.execute(
            sa.text(
                """
                UPDATE api_keys
                SET hashed_secret_key = :hashed_secret_key
                WHERE id = :id
                """
            ),
            {"id": row["id"], "hashed_secret_key": hashed_secret_key},
        )


def downgrade() -> None:
    # The bcrypt hashes are valid Langfuse state and should not be degraded back
    # to non-verifying placeholders on downgrade.
    return None
