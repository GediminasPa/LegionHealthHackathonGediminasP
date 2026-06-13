from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class MedicationAffordabilitySession(Base):
    __tablename__ = "med_affordability_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(50), default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class MedicationAffordabilityIntake(Base):
    __tablename__ = "med_affordability_intakes"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("med_affordability_sessions.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )
    patient_name: Mapped[str] = mapped_column(String(200))
    state: Mapped[str] = mapped_column(String(100))
    medication_name: Mapped[str] = mapped_column(String(250))
    strength: Mapped[str | None] = mapped_column(String(150))
    dose: Mapped[str | None] = mapped_column(String(150))
    quoted_price_cents: Mapped[int] = mapped_column(Integer)
    insurance_type: Mapped[str] = mapped_column(String(100))
    pa_status: Mapped[str] = mapped_column(String(100))
    plan_name: Mapped[str | None] = mapped_column(String(250))
    plan_id: Mapped[str | None] = mapped_column(String(100))
    diagnosis: Mapped[str | None] = mapped_column(String(250))
    pasted_text: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MedicationAffordabilityMessage(Base):
    __tablename__ = "med_affordability_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("med_affordability_sessions.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(50))
    content: Mapped[str] = mapped_column(Text)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MedicationAffordabilityRun(Base):
    __tablename__ = "med_affordability_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("med_affordability_sessions.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(50), default="running")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)


class MedicationAffordabilityActivity(Base):
    __tablename__ = "med_affordability_activities"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("med_affordability_sessions.id", ondelete="CASCADE"), index=True
    )
    run_id: Mapped[int | None] = mapped_column(
        ForeignKey("med_affordability_runs.id", ondelete="SET NULL"), index=True
    )
    event_type: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(250))
    summary: Mapped[str | None] = mapped_column(Text)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MedicationAffordabilityCaseState(Base):
    __tablename__ = "med_affordability_case_states"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("med_affordability_sessions.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )
    state_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class MedicationAffordabilitySource(Base):
    __tablename__ = "med_affordability_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("med_affordability_sessions.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(250))
    url: Mapped[str] = mapped_column(Text)
    source_type: Mapped[str] = mapped_column(String(100))
    publisher: Mapped[str | None] = mapped_column(String(200))
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    summary: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MedicationAffordabilityArtifact(Base):
    __tablename__ = "med_affordability_artifacts"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("med_affordability_sessions.id", ondelete="CASCADE"), index=True
    )
    artifact_type: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(250))
    content: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
