"""add medication affordability tables

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-13

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "med_affordability_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_table(
        "med_affordability_intakes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("patient_name", sa.String(length=200), nullable=False),
        sa.Column("state", sa.String(length=100), nullable=False),
        sa.Column("medication_name", sa.String(length=250), nullable=False),
        sa.Column("strength", sa.String(length=150), nullable=True),
        sa.Column("dose", sa.String(length=150), nullable=True),
        sa.Column("quoted_price_cents", sa.Integer(), nullable=False),
        sa.Column("insurance_type", sa.String(length=100), nullable=False),
        sa.Column("pa_status", sa.String(length=100), nullable=False),
        sa.Column("plan_name", sa.String(length=250), nullable=True),
        sa.Column("plan_id", sa.String(length=100), nullable=True),
        sa.Column("diagnosis", sa.String(length=250), nullable=True),
        sa.Column("pasted_text", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["med_affordability_sessions.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint("session_id"),
    )
    op.create_index(
        "ix_med_affordability_intakes_session_id",
        "med_affordability_intakes",
        ["session_id"],
    )
    op.create_table(
        "med_affordability_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["med_affordability_sessions.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_med_affordability_messages_session_id",
        "med_affordability_messages",
        ["session_id"],
    )
    op.create_table(
        "med_affordability_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["session_id"], ["med_affordability_sessions.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_med_affordability_runs_session_id", "med_affordability_runs", ["session_id"]
    )
    op.create_table(
        "med_affordability_activities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=250), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["run_id"], ["med_affordability_runs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["session_id"], ["med_affordability_sessions.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_med_affordability_activities_run_id", "med_affordability_activities", ["run_id"]
    )
    op.create_index(
        "ix_med_affordability_activities_session_id",
        "med_affordability_activities",
        ["session_id"],
    )
    op.create_table(
        "med_affordability_case_states",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("state_json", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["med_affordability_sessions.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint("session_id"),
    )
    op.create_index(
        "ix_med_affordability_case_states_session_id",
        "med_affordability_case_states",
        ["session_id"],
    )
    op.create_table(
        "med_affordability_sources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=250), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("source_type", sa.String(length=100), nullable=False),
        sa.Column("publisher", sa.String(length=200), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["med_affordability_sessions.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_med_affordability_sources_session_id",
        "med_affordability_sources",
        ["session_id"],
    )
    op.create_table(
        "med_affordability_artifacts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("artifact_type", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=250), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["med_affordability_sessions.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_med_affordability_artifacts_session_id",
        "med_affordability_artifacts",
        ["session_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_med_affordability_artifacts_session_id",
        table_name="med_affordability_artifacts",
    )
    op.drop_table("med_affordability_artifacts")
    op.drop_index("ix_med_affordability_sources_session_id", table_name="med_affordability_sources")
    op.drop_table("med_affordability_sources")
    op.drop_index(
        "ix_med_affordability_case_states_session_id",
        table_name="med_affordability_case_states",
    )
    op.drop_table("med_affordability_case_states")
    op.drop_index(
        "ix_med_affordability_activities_session_id",
        table_name="med_affordability_activities",
    )
    op.drop_index(
        "ix_med_affordability_activities_run_id", table_name="med_affordability_activities"
    )
    op.drop_table("med_affordability_activities")
    op.drop_index("ix_med_affordability_runs_session_id", table_name="med_affordability_runs")
    op.drop_table("med_affordability_runs")
    op.drop_index(
        "ix_med_affordability_messages_session_id", table_name="med_affordability_messages"
    )
    op.drop_table("med_affordability_messages")
    op.drop_index("ix_med_affordability_intakes_session_id", table_name="med_affordability_intakes")
    op.drop_table("med_affordability_intakes")
    op.drop_table("med_affordability_sessions")
