from __future__ import annotations

import json
import secrets
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.medication_affordability import (
    MedicationAgentDeps,
    analyze_case,
    build_medication_agent_prompt,
    build_medication_model,
    curated_resource_hints,
    draft_next_artifact,
    extract_facts_from_pasted_text,
    medication_affordability_agent,
    patient_display_name,
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
    patient = patient_display_name(intake.patient_name, "")
    return f"{patient} - {intake.medication_name}" if patient else intake.medication_name


def generate_access_token() -> str:
    return secrets.token_urlsafe(32)


def build_initial_case_state(intake: MedicationAffordabilityIntakeCreate) -> dict[str, Any]:
    analysis = analyze_case(intake)
    facts = extract_facts_from_pasted_text(intake.pasted_text)
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
        "flags": analysis.flags,
        "facts": facts,
        "case_moment": analysis.case_moment,
        "case_analysis": analysis.model_dump(mode="json"),
        "blocked_routes": analysis.blocked_routes,
        "missing_facts": analysis.missing_facts,
        "specialist_plan": [step.model_dump(mode="json") for step in analysis.specialist_plan],
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
        access_token=generate_access_token(),
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


async def _start_run(db: AsyncSession, session_id: int) -> MedicationAffordabilityRun:
    run = MedicationAffordabilityRun(session_id=session_id, status="running")
    db.add(run)
    await db.flush()
    await db.refresh(run)
    return run


async def _mark_run_completed(db: AsyncSession, run: MedicationAffordabilityRun) -> None:
    run.status = "completed"
    run.finished_at = datetime.now(UTC)
    await db.commit()


async def _mark_run_failed(db: AsyncSession, run: MedicationAffordabilityRun, error: str) -> None:
    run.status = "failed"
    run.error = error
    run.finished_at = datetime.now(UTC)
    await db.commit()


async def run_mock_investigation(
    db: AsyncSession, session_id: int
) -> AsyncIterator[MedicationAffordabilityStreamEvent]:
    intake = await get_intake_model(db, session_id)
    if intake is None:
        raise ValueError(f"Session {session_id} not found")
    intake_data = MedicationAffordabilityIntakeCreate.model_validate(intake, from_attributes=True)
    run = await _start_run(db, session_id)
    try:
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
            f"I am investigating {intake.medication_name} for "
            f"{patient_display_name(intake.patient_name)}. "
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
                    "checked_at": source.checked_at.isoformat() if source.checked_at else None,
                    "confidence": source.confidence,
                },
            )

        analysis = analyze_case(intake_data)
        case_moment = analysis.case_moment
        is_medicare = "medicare" in intake.insurance_type.lower()
        has_accumulator = extract_facts_from_pasted_text(intake.pasted_text)[
            "has_accumulator_signal"
        ]
        if case_moment == "before_fill":
            if _is_ozempic_intake(intake_data):
                option = {
                    "id": "ozempic-prefill-alternatives-and-estimates",
                    "title": "Ozempic pre-fill alternatives and estimates",
                    "rank": 1,
                    "summary": (
                        "Check diagnosis fit, PA/ST/QL, covered commercial savings, NovoCare "
                        "self-pay bands, cash discount checks, and prescriber-approved diabetes "
                        "alternatives before the first fill."
                    ),
                    "confidence": "needs_user_confirmation",
                    "drop_type": "unknown",
                    "price_estimates": [
                        {
                            "route": "Covered commercial plan plus savings offer",
                            "estimated_price_cents": 2500,
                            "caveat": (
                                "Only if the plan covers Ozempic and the patient meets current "
                                "commercial offer terms; monthly savings caps still apply."
                            ),
                        },
                        {
                            "route": "NovoCare self-pay starter fills",
                            "estimated_price_cents": 19900,
                            "caveat": (
                                "Current public offer for eligible new Ozempic pen patients; "
                                "limited to starter fills and must be rechecked."
                            ),
                        },
                        {
                            "route": "NovoCare self-pay 0.25 mg, 0.5 mg, or 1 mg pen",
                            "estimated_price_cents": 34900,
                            "caveat": (
                                "Current public monthly self-pay band after starter offer; "
                                "does not count toward deductible or OOP maximum."
                            ),
                        },
                        {
                            "route": "NovoCare self-pay 2 mg pen",
                            "estimated_price_cents": 49900,
                            "caveat": (
                                "Current public monthly self-pay band for 2 mg pen; does not "
                                "count toward deductible or OOP maximum."
                            ),
                        },
                    ],
                    "source_ids": [source.id for source in saved_sources],
                }
                cost_tracker = {
                    "quoted_price_cents": intake.quoted_price_cents,
                    "current_best_label": "Demo best estimate: commercial savings route",
                    "current_best_estimated_price_cents": 2500,
                    "potential_drop_cents": None,
                    "drop_type": "price_reduction",
                    "confidence": "found_source",
                    "explanation": (
                        "Demo mode is using the lowest public estimate band: an eligible "
                        "covered-commercial savings route. Verify coverage, PA/ST/QL, preferred "
                        "pharmacy, monthly caps, and whether a self-pay fallback would miss "
                        "deductible or OOP credit before treating it as a real claim result."
                    ),
                    "source_ids": [source.id for source in saved_sources],
                }
            else:
                option = {
                    "id": "pre-fill-price-and-access-check",
                    "title": "Pre-fill price and access check",
                    "rank": 1,
                    "summary": (
                        "Compare likely plan blockers, generic or clinically appropriate "
                        "alternative routes, and cash-vs-insurance tradeoffs before the "
                        "prescription is filled."
                    ),
                    "confidence": "needs_user_confirmation",
                    "drop_type": "unknown",
                    "source_ids": [source.id for source in saved_sources],
                }
                cost_tracker = {
                    "quoted_price_cents": intake.quoted_price_cents,
                    "current_best_label": "Estimate before first fill",
                    "current_best_estimated_price_cents": None,
                    "potential_drop_cents": None,
                    "drop_type": "unknown",
                    "confidence": "needs_user_confirmation",
                    "explanation": (
                        "No pharmacy quote is available yet. Confirm the plan claim, preferred "
                        "pharmacy, and cash comparison before calling this a savings result."
                    ),
                    "source_ids": [source.id for source in saved_sources],
                }
        elif case_moment == "coupon_behavior" or has_accumulator:
            option = {
                "id": "accumulator-maximizer-check",
                "title": "Accumulator or maximizer check",
                "rank": 1,
                "summary": (
                    "Manufacturer support may lower today's charge, but the pasted language "
                    "suggests it may not count toward deductible or out-of-pocket progress."
                ),
                "confidence": "needs_user_confirmation",
                "drop_type": "unknown",
                "source_ids": [source.id for source in saved_sources],
            }
            cost_tracker = {
                "quoted_price_cents": intake.quoted_price_cents,
                "current_best_label": "Coupon behavior needs plan confirmation",
                "current_best_estimated_price_cents": None,
                "potential_drop_cents": None,
                "drop_type": "unknown",
                "confidence": "needs_user_confirmation",
                "explanation": (
                    "Confirm whether assistance counts toward deductible and out-of-pocket "
                    "maximum before treating the coupon as true savings."
                ),
                "source_ids": [source.id for source in saved_sources],
            }
        elif is_medicare:
            option = {
                "id": "medicare-payment-plan",
                "title": "Medicare Prescription Payment Plan",
                "rank": 1,
                "summary": (
                    "May smooth the first-fill cost over monthly bills, but does not reduce "
                    "total drug cost."
                ),
                "confidence": "needs_user_confirmation",
                "drop_type": "cash_flow_smoothing",
                "source_ids": [source.id for source in saved_sources],
            }
            cost_tracker = {
                "quoted_price_cents": intake.quoted_price_cents,
                "current_best_label": "Payment smoothing route found",
                "current_best_estimated_price_cents": intake.quoted_price_cents,
                "potential_drop_cents": 0,
                "drop_type": "cash_flow_smoothing",
                "confidence": "needs_user_confirmation",
                "explanation": (
                    "This can reduce the immediate cash hit, not the total allowed cost."
                ),
                "source_ids": [source.id for source in saved_sources],
            }
        else:
            option = {
                "id": "commercial-sticker-shock-routing",
                "title": "Commercial sticker-shock routing",
                "rank": 1,
                "summary": (
                    "Rank insurance processing, cash pricing, manufacturer support, plan "
                    "exception, and prescriber alternatives before choosing a route."
                ),
                "confidence": "eligibility_unknown",
                "drop_type": "unknown",
                "source_ids": [source.id for source in saved_sources],
            }
            cost_tracker = {
                "quoted_price_cents": intake.quoted_price_cents,
                "current_best_label": ("Commercial route needs eligibility and plan confirmation"),
                "current_best_estimated_price_cents": None,
                "potential_drop_cents": None,
                "drop_type": "unknown",
                "confidence": "needs_user_confirmation",
                "explanation": (
                    "Confirm coverage status, coupon eligibility, cash price, and deductible or "
                    "out-of-pocket impact before estimating the best option."
                ),
                "source_ids": [source.id for source in saved_sources],
            }

        state = await update_case_state(
            db,
            session_id,
            {"options": [option], "cost_tracker": cost_tracker},
        )
        yield _event("option_added", session_id, run.id, option)
        yield _event("cost_tracker_update", session_id, run.id, cost_tracker)
        yield _event(
            "case_state_patch",
            session_id,
            run.id,
            {
                "patch": {"options": [option], "cost_tracker": cost_tracker},
                "state": state.state_json,
            },
        )

        artifact_data = draft_next_artifact(intake_data)
        source_ids = [source.id for source in saved_sources]
        artifact = MedicationAffordabilityArtifact(
            session_id=session_id,
            artifact_type=artifact_data["artifact_type"],
            title=artifact_data["title"],
            content=artifact_data["content"],
            status="ready",
            metadata_json={"source_ids": source_ids},
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
        await _mark_run_completed(db, run)
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
                "source_ids": source_ids,
                "created_at": artifact.created_at.isoformat() if artifact.created_at else None,
                "updated_at": artifact.updated_at.isoformat() if artifact.updated_at else None,
            },
        )
        yield _event(
            "activity_completed",
            session_id,
            run.id,
            {"id": completed.id, "title": completed.title, "summary": completed.summary},
        )
        yield _event("run_done", session_id, run.id, {"status": "completed"})
    except Exception as exc:
        await _mark_run_failed(db, run, str(exc))
        yield _event("run_error", session_id, run.id, {"status": "failed", "message": str(exc)})


def _is_ozempic_intake(intake: MedicationAffordabilityIntakeCreate) -> bool:
    medication = intake.medication_name.lower()
    return "ozempic" in medication or "semaglutide" in medication


async def run_agent_investigation(
    db: AsyncSession, session_id: int
) -> AsyncIterator[MedicationAffordabilityStreamEvent]:
    intake = await get_intake_model(db, session_id)
    state = await get_case_state_model(db, session_id)
    if intake is None or state is None:
        raise ValueError(f"Session {session_id} not found")

    messages = (
        await db.scalars(
            select(MedicationAffordabilityMessage)
            .where(MedicationAffordabilityMessage.session_id == session_id)
            .order_by(MedicationAffordabilityMessage.created_at, MedicationAffordabilityMessage.id)
        )
    ).all()
    run = await _start_run(db, session_id)
    deps = MedicationAgentDeps(session=db, session_id=session_id, run_id=run.id)

    try:
        started = MedicationAffordabilityActivity(
            session_id=session_id,
            run_id=run.id,
            event_type="activity_started",
            title="Starting agent investigation",
            summary=(
                "The agent is loading session context and planning the next affordability step."
            ),
            payload_json={"mode": "agent"},
        )
        db.add(started)
        await db.commit()
        yield _event(
            "activity_started",
            session_id,
            run.id,
            {"id": started.id, "title": started.title, "summary": started.summary},
        )

        prompt = build_medication_agent_prompt(intake, state, list(messages))
        async with medication_affordability_agent.run_stream(
            prompt,
            deps=deps,
            model=build_medication_model(),
        ) as result:
            final_parts: list[str] = []
            async for delta in result.stream_text(delta=True):
                for event in deps.drain_events():
                    yield event
                if delta:
                    final_parts.append(delta)
                    yield _event("agent_delta", session_id, run.id, {"delta": delta})
            for event in deps.drain_events():
                yield event
            output = await result.get_output()
            final_text = str(output or "".join(final_parts)).strip()

        if final_text:
            message = MedicationAffordabilityMessage(
                session_id=session_id,
                role="assistant",
                content=final_text,
                metadata_json={"run_id": run.id, "mode": "agent"},
            )
            db.add(message)
            await db.commit()
            yield _event("agent_message", session_id, run.id, {"content": final_text})

        completed = MedicationAffordabilityActivity(
            session_id=session_id,
            run_id=run.id,
            event_type="activity_completed",
            title="Agent investigation step completed",
            summary="The agent finished this investigation pass and persisted its findings.",
            payload_json={"mode": "agent"},
        )
        db.add(completed)
        await _mark_run_completed(db, run)
        yield _event(
            "activity_completed",
            session_id,
            run.id,
            {"id": completed.id, "title": completed.title, "summary": completed.summary},
        )
        yield _event("run_done", session_id, run.id, {"status": "completed"})
    except Exception as exc:
        for event in deps.drain_events():
            yield event
        await _mark_run_failed(db, run, str(exc))
        yield _event("run_error", session_id, run.id, {"status": "failed", "message": str(exc)})
