"""add medication affordability artifact metadata

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-13

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "med_affordability_artifacts",
        sa.Column("metadata_json", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.alter_column("med_affordability_artifacts", "metadata_json", server_default=None)


def downgrade() -> None:
    op.drop_column("med_affordability_artifacts", "metadata_json")
