"""add medication affordability session access tokens

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-13

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE med_affordability_sessions
        ADD COLUMN IF NOT EXISTS access_token varchar;
        """
    )
    op.execute(
        """
        UPDATE med_affordability_sessions
        SET access_token = md5(random()::text || clock_timestamp()::text || id::text)
        WHERE access_token IS NULL;
        """
    )
    op.execute(
        """
        ALTER TABLE med_affordability_sessions
        ALTER COLUMN access_token SET NOT NULL;
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS ix_med_affordability_sessions_access_token
        ON med_affordability_sessions (access_token);
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_med_affordability_sessions_access_token;")
    op.execute("ALTER TABLE med_affordability_sessions DROP COLUMN IF EXISTS access_token;")
