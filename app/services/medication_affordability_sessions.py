from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.medication_affordability import (
    curated_resource_hints,
    draft_next_artifact,
    extract_facts_from_pasted_text,
    public_program_copay_guardrail,
)
from app.models import (
    MedicationAffordabilityActivity,
    MedicationAffordabilityArtifact,
    MedicationAffordabilityCaseState,
    MedicationAffordabilityIntake,
    MedicationAffordabilityMessage,
    MedicationAffordabilityRun,
    MedicationAffordabilitySession,
    MedicationAffordabilitySource,
)
from app.schemas.medication_affordability import (
    CostTrackerState,
    MedicationAffordabilityActivityRead,
    MedicationAffordabilityArtifactRead,
    MedicationAffordabilityCaseStateRead,
    MedicationAffordabilityDemoCase,
    MedicationAffordabilityIntakeCreate,
    MedicationAffordabilityIntakeRead,
    MedicationAffordabilityMessageCreate,
    MedicationAffordabilityMessageRead,
    MedicationAffordabilityRunRead,
    MedicationAffordabilitySessionCreate,
    MedicationAffordabilitySessionDetailRead,
    MedicationAffordabilitySessionSummary,
    MedicationAffordabilitySourceRead,
    MedicationAffordabilityStreamEvent,
)

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "medication_affordability"
DEMO_CASES_PATH = DATA_DIR / "demo_cases.json"


def list_demo_cases() -> list[MedicationAffordabilityDemoCase]:
    return [
        MedicationAffordabilityDemoCase.model_validate(case)
        for case in json.loads(DEMO_CASES_PATH.read_text())
    ]


def default_session_title(intake: MedicationAffordabilityIntakeCreate) -> str:
    return f"{intake.patient_name} - {intake.medication_name}"


def build_initial_case_state(intake: MedicationAffordabilityIntakeCreate) -> dict[str, Any]:
    facts = extract_facts_from_pasted_text(intake.pasted_text)
    guardrail = public_program_copay_guardrail(intake.insurance_type)
    flags = facts["flags"][:]
    if guardrail:
        flags.append("public_program_copay_card_guardrail")
    cost_tracker = CostTrackerState(
        quoted_price_cents=intake.quoted_price_cents,
        current_best_label="Pharmacy quote",
        current_best_estimated_price_cents=intake.quoted_price_cents,
        potential_drop_cents=0,
        drop_type="unknown",
        confidence="needs_user_confirmation",
        explanation="Investigation has not started yet.",
    )
    return {
        "intake_summary": {
            "patient_name": intake.patient_name,
            "state": intake.state,
            "medication_name": intake.medication_name,
            "insurance_type": intake.insurance_type,
            "pa_status": intake.pa_status,
            "plan_name": intake.plan_name,
            "diagnosis": intake.diagnosis,
        },
        "cost_tracker": cost_tracker.model_dump(mode="json"),
        "options": [],
        "questions": [],
        "flags": flags,
        "facts": facts,
    }


async def get_session_model(
    db: AsyncSession, session_id: int
) -> MedicationAffordabilitySession | None:
    return await db.get(MedicationAffordabilitySession, session_id)


async def get_intake_model(
    db: AsyncSession, session_id: int
) -> MedicationAffordabilityIntake | None:
    return await db.scalar(
        select(MedicationAffordabilityIntake).where(
            MedicationAffordabilityIntake.session_id == session_id
        )
    )


async def get_case_state_model(
    db: AsyncSession, session_id: int
) -> MedicationAffordabilityCaseState | None:
    return await db.scalar(
        select(MedicationAffordabilityCaseState).where(
            MedicationAffordabilityCaseState.session_id == session_id
        )
    )


async def create_session(
    db: AsyncSession, data: MedicationAffordabilitySessionCreate
) -> MedicationAffordabilitySession:
    session_obj = MedicationAffordabilitySession(
        title=data.title or default_session_title(data.intake),
        status="open",
    )
    db.add(session_obj)
    await db.flush()
    db.add_all(
        [
            MedicationAffordabilityIntake(session_id=session_obj.id, **data.intake.model_dump()),
            MedicationAffordabilityCaseState(
                session_id=session_obj.id,
                state_json=build_initial_case_state(data.intake),
                version=1,
            ),
        ]
    )
    await db.commit()
    await db.refresh(session_obj)
    return session_obj


async def add_message(
    db: AsyncSession,
    session_id: int,
    role: str,
    data: MedicationAffordabilityMessageCreate,
) -> MedicationAffordabilityMessage | None:
    session_obj = await get_session_model(db, session_id)
    if session_obj is None:
        return None
    message = MedicationAffordabilityMessage(
        session_id=session_id,
        role=role,
        content=data.content,
        metadata_json=data.metadata_json,
    )
    session_obj.updated_at = datetime.now(UTC)
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message


async def update_case_state(
    db: AsyncSession, session_id: int, patch: dict[str, Any]
) -> MedicationAffordabilityCaseState:
    state = await get_case_state_model(db, session_id)
    if state is None:
        raise ValueError(f"Session {session_id} has no case state")
    merged = {**state.state_json}
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}
        else:
            merged[key] = value
    state.state_json = merged
    state.version += 1
    state.updated_at = datetime.now(UTC)
    await db.flush()
    return state


async def get_session_detail(
    db: AsyncSession, session_id: int
) -> MedicationAffordabilitySessionDetailRead | None:
    session_obj = await get_session_model(db, session_id)
    if session_obj is None:
        return None

    intake = await get_intake_model(db, session_id)
    case_state = await get_case_state_model(db, session_id)
    if intake is None or case_state is None:
        raise RuntimeError(f"Medication affordability session {session_id} is incomplete.")

    messages = (
        await db.scalars(
            select(MedicationAffordabilityMessage)
            .where(MedicationAffordabilityMessage.session_id == session_id)
            .order_by(MedicationAffordabilityMessage.created_at, MedicationAffordabilityMessage.id)
        )
    ).all()
    runs = (
        await db.scalars(
            select(MedicationAffordabilityRun)
            .where(MedicationAffordabilityRun.session_id == session_id)
            .order_by(MedicationAffordabilityRun.started_at, MedicationAffordabilityRun.id)
        )
    ).all()
    activities = (
        await db.scalars(
            select(MedicationAffordabilityActivity)
            .where(MedicationAffordabilityActivity.session_id == session_id)
            .order_by(
                MedicationAffordabilityActivity.created_at, MedicationAffordabilityActivity.id
            )
        )
    ).all()
    sources = (
        await db.scalars(
            select(MedicationAffordabilitySource)
            .where(MedicationAffordabilitySource.session_id == session_id)
            .order_by(MedicationAffordabilitySource.created_at, MedicationAffordabilitySource.id)
        )
    ).all()
    artifacts = (
        await db.scalars(
            select(MedicationAffordabilityArtifact)
            .where(MedicationAffordabilityArtifact.session_id == session_id)
            .order_by(
                MedicationAffordabilityArtifact.created_at,
                MedicationAffordabilityArtifact.id,
            )
        )
    ).all()
    return MedicationAffordabilitySessionDetailRead(
        session=MedicationAffordabilitySessionSummary.model_validate(session_obj),
        intake=MedicationAffordabilityIntakeRead.model_validate(intake),
        messages=[
            MedicationAffordabilityMessageRead.model_validate(message) for message in messages
        ],
        runs=[MedicationAffordabilityRunRead.model_validate(run) for run in runs],
        activities=[
            MedicationAffordabilityActivityRead.model_validate(activity) for activity in activities
        ],
        case_state=MedicationAffordabilityCaseStateRead.model_validate(case_state),
        sources=[MedicationAffordabilitySourceRead.model_validate(source) for source in sources],
        artifacts=[
            MedicationAffordabilityArtifactRead.model_validate(artifact) for artifact in artifacts
        ],
    )


def _event(
    event_type: str, session_id: int, run_id: int | None, payload: dict[str, Any]
) -> MedicationAffordabilityStreamEvent:
    return MedicationAffordabilityStreamEvent(
        type=event_type,  # type: ignore[arg-type]
        session_id=session_id,
        run_id=run_id,
        payload=payload,
    )


async def run_mock_investigation(
    db: AsyncSession, session_id: int
) -> AsyncIterator[MedicationAffordabilityStreamEvent]:
    intake = await get_intake_model(db, session_id)
    if intake is None:
        raise ValueError(f"Session {session_id} not found")
    intake_data = MedicationAffordabilityIntakeCreate.model_validate(intake, from_attributes=True)
    run = MedicationAffordabilityRun(session_id=session_id, status="running")
    db.add(run)
    await db.flush()
    await db.refresh(run)

    started = MedicationAffordabilityActivity(
        session_id=session_id,
        run_id=run.id,
        event_type="activity_started",
        title="Reading intake and plan text",
        summary="The agent is extracting insurance context and affordability signals.",
        payload_json={"step": "intake"},
    )
    db.add(started)
    await db.commit()
    yield _event(
        "activity_started",
        session_id,
        run.id,
        {"id": started.id, "title": started.title, "summary": started.summary},
    )

    intro = (
        f"I am investigating {intake.medication_name} for {intake.patient_name}. "
        "I will separate true price reductions from payment smoothing and "
        "eligibility-dependent help."
    )
    message = MedicationAffordabilityMessage(
        session_id=session_id,
        role="assistant",
        content=intro,
        metadata_json={"run_id": run.id},
    )
    db.add(message)
    await db.commit()
    yield _event("agent_message", session_id, run.id, {"content": intro})

    hints = curated_resource_hints(intake_data)
    saved_sources: list[MedicationAffordabilitySource] = []
    for resource in hints[:3]:
        source = MedicationAffordabilitySource(
            session_id=session_id,
            title=resource["name"],
            url=resource["url"],
            source_type="curated_resource",
            publisher=(resource.get("domains") or [None])[0],
            checked_at=datetime.now(UTC),
            summary=resource["notes_for_agent"],
            confidence=0.8,
        )
        db.add(source)
        await db.flush()
        saved_sources.append(source)
        yield _event(
            "source_added",
            session_id,
            run.id,
            {
                "id": source.id,
                "title": source.title,
                "url": source.url,
                "publisher": source.publisher,
                "summary": source.summary,
            },
        )

    is_medicare = "medicare" in intake.insurance_type.lower()
    has_accumulator = extract_facts_from_pasted_text(intake.pasted_text)["has_accumulator_signal"]
    if is_medicare:
        option = {
            "id": "medicare-payment-plan",
            "title": "Medicare Prescription Payment Plan",
            "rank": 1,
            "summary": (
                "May smooth the first-fill cost over monthly bills, but does not reduce "
                "total drug cost."
            ),
            "confidence": "found_source",
            "drop_type": "cash_flow_smoothing",
        }
        cost_tracker = {
            "quoted_price_cents": intake.quoted_price_cents,
            "current_best_label": "Payment smoothing route found",
            "current_best_estimated_price_cents": intake.quoted_price_cents,
            "potential_drop_cents": 0,
            "drop_type": "cash_flow_smoothing",
            "confidence": "found_source",
            "explanation": "This can reduce the immediate cash hit, not the total allowed cost.",
            "source_ids": [source.id for source in saved_sources],
        }
    else:
        option = {
            "id": "commercial-copay-support-with-warning",
            "title": "Commercial support plus accumulator check",
            "rank": 1,
            "summary": (
                "Manufacturer support may lower today's charge, but the pasted plan language "
                "suggests deductible/OOP credit may be limited."
            ),
            "confidence": "needs_user_confirmation" if has_accumulator else "eligibility_unknown",
            "drop_type": "price_reduction",
        }
        cost_tracker = {
            "quoted_price_cents": intake.quoted_price_cents,
            "current_best_label": "Commercial support route needs plan confirmation",
            "current_best_estimated_price_cents": 500,
            "potential_drop_cents": max(intake.quoted_price_cents - 500, 0),
            "drop_type": "price_reduction",
            "confidence": "needs_user_confirmation",
            "explanation": "Confirm accumulator/maximizer rules before relying on copay support.",
            "source_ids": [source.id for source in saved_sources],
        }

    state = await update_case_state(
        db,
        session_id,
        {"options": [option], "cost_tracker": cost_tracker},
    )
    yield _event("option_added", session_id, run.id, option)
    yield _event("cost_tracker_update", session_id, run.id, cost_tracker)
    yield _event("case_state_patch", session_id, run.id, {"state": state.state_json})

    artifact_data = draft_next_artifact(intake_data)
    artifact = MedicationAffordabilityArtifact(
        session_id=session_id,
        artifact_type=artifact_data["artifact_type"],
        title=artifact_data["title"],
        content=artifact_data["content"],
        status="ready",
    )
    db.add(artifact)
    completed = MedicationAffordabilityActivity(
        session_id=session_id,
        run_id=run.id,
        event_type="activity_completed",
        title="Prepared next-step artifact",
        summary="A practical call script or checklist is ready for review.",
        payload_json={"artifact_type": artifact.artifact_type},
    )
    db.add(completed)
    run.status = "completed"
    run.finished_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(artifact)
    yield _event(
        "artifact_created",
        session_id,
        run.id,
        {
            "id": artifact.id,
            "artifact_type": artifact.artifact_type,
            "title": artifact.title,
            "content": artifact.content,
            "status": artifact.status,
            "source_ids": [source.id for source in saved_sources],
        },
    )
    yield _event(
        "activity_completed",
        session_id,
        run.id,
        {"id": completed.id, "title": completed.title, "summary": completed.summary},
    )
    yield _event("run_done", session_id, run.id, {"status": "completed"})
