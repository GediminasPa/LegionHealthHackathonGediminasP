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


def _activity_payload(activity: MedicationAffordabilityActivity) -> dict[str, Any]:
    return {
        "id": activity.id,
        "title": activity.title,
        "summary": activity.summary,
        "created_at": activity.created_at.isoformat() if activity.created_at else None,
    }


async def _record_activity(
    db: AsyncSession,
    session_id: int,
    run_id: int,
    *,
    title: str,
    summary: str,
    step: str,
) -> MedicationAffordabilityActivity:
    activity = MedicationAffordabilityActivity(
        session_id=session_id,
        run_id=run_id,
        event_type="activity_started",
        title=title,
        summary=summary,
        payload_json={"step": step},
    )
    db.add(activity)
    await db.commit()
    await db.refresh(activity)
    return activity


async def _complete_activity(
    db: AsyncSession,
    activity: MedicationAffordabilityActivity,
    *,
    title: str | None = None,
    summary: str | None = None,
) -> MedicationAffordabilityActivity:
    activity.event_type = "activity_completed"
    if title is not None:
        activity.title = title
    if summary is not None:
        activity.summary = summary
    await db.commit()
    await db.refresh(activity)
    return activity


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
        intake_activity = await _record_activity(
            db,
            session_id,
            run.id,
            title="Reading intake and plan text",
            summary="CopayGuard is extracting insurance context and affordability signals.",
            step="intake",
        )
        yield _event(
            "activity_started",
            session_id,
            run.id,
            _activity_payload(intake_activity),
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
        intake_activity = await _complete_activity(
            db,
            intake_activity,
            title="Intake context loaded",
            summary="Medication, insurance, quote, and pasted plan text are ready for routing.",
        )
        yield _event("activity_completed", session_id, run.id, _activity_payload(intake_activity))

        source_activity = await _record_activity(
            db,
            session_id,
            run.id,
            title="Checking evidence sources",
            summary=(
                "CopayGuard is matching the case to curated plan, pricing, and assistance sources."
            ),
            step="sources",
        )
        yield _event("activity_started", session_id, run.id, _activity_payload(source_activity))
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
        source_activity = await _complete_activity(
            db,
            source_activity,
            title="Evidence sources checked",
            summary=f"{len(saved_sources)} curated sources are attached to this review.",
        )
        yield _event("activity_completed", session_id, run.id, _activity_payload(source_activity))

        route_activity = await _record_activity(
            db,
            session_id,
            run.id,
            title="Ranking coverage and cost routes",
            summary=(
                "CopayGuard is classifying the case moment and separating savings from smoothing."
            ),
            step="routing",
        )
        yield _event("activity_started", session_id, run.id, _activity_payload(route_activity))
        analysis = analyze_case(intake_data)
        case_moment = analysis.case_moment
        is_medicare = "medicare" in intake.insurance_type.lower()
        has_accumulator = extract_facts_from_pasted_text(intake.pasted_text)[
            "has_accumulator_signal"
        ]
        options, cost_tracker = _demo_options_and_cost_tracker(
            intake_data=intake_data,
            case_moment=case_moment,
            has_accumulator=has_accumulator,
            is_medicare=is_medicare,
            source_ids=[source.id for source in saved_sources],
        )

        state = await update_case_state(
            db,
            session_id,
            {"options": options, "cost_tracker": cost_tracker},
        )
        for option in options:
            yield _event("option_added", session_id, run.id, option)
        yield _event("cost_tracker_update", session_id, run.id, cost_tracker)
        yield _event(
            "case_state_patch",
            session_id,
            run.id,
            {
                "patch": {"options": options, "cost_tracker": cost_tracker},
                "state": state.state_json,
            },
        )
        route_activity = await _complete_activity(
            db,
            route_activity,
            title="Route and price estimate ready",
            summary=(
                "The top route, cost tracker, and guardrails are now reflected "
                "in the result packet."
            ),
        )
        yield _event("activity_completed", session_id, run.id, _activity_payload(route_activity))

        artifact_activity = await _record_activity(
            db,
            session_id,
            run.id,
            title="Preparing next-step artifact",
            summary=(
                "CopayGuard is drafting the call script or checklist for the recommended path."
            ),
            step="artifact",
        )
        yield _event("activity_started", session_id, run.id, _activity_payload(artifact_activity))
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
        artifact_activity.payload_json = {"artifact_type": artifact.artifact_type}
        artifact_activity = await _complete_activity(
            db,
            artifact_activity,
            title="Prepared next-step artifact",
            summary="A practical call script or checklist is ready for review.",
        )
        yield _event(
            "activity_completed",
            session_id,
            run.id,
            _activity_payload(artifact_activity),
        )
        yield _event("run_done", session_id, run.id, {"status": "completed"})
    except Exception as exc:
        await _mark_run_failed(db, run, str(exc))
        yield _event("run_error", session_id, run.id, {"status": "failed", "message": str(exc)})


def _is_ozempic_intake(intake: MedicationAffordabilityIntakeCreate) -> bool:
    medication = intake.medication_name.lower()
    return "ozempic" in medication or "semaglutide" in medication


def _demo_options_and_cost_tracker(
    *,
    intake_data: MedicationAffordabilityIntakeCreate,
    case_moment: str,
    has_accumulator: bool,
    is_medicare: bool,
    source_ids: list[int],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if case_moment == "before_fill":
        if _is_ozempic_intake(intake_data):
            options = [
                {
                    "id": "ozempic-prefill-alternatives-and-estimates",
                    "title": "Ozempic pre-fill price map",
                    "rank": 1,
                    "summary": (
                        "CopayGuard found the useful first-pass map: covered commercial claim "
                        "plus savings offer if the plan covers it, NovoCare self-pay bands if "
                        "coverage is weak, and prescriber-reviewed diabetes alternatives."
                    ),
                    "confidence": "found_source",
                    "drop_type": "unknown",
                    "price_estimates": [
                        {
                            "route": "Covered commercial plan plus savings offer",
                            "estimated_price_cents": 2500,
                            "caveat": (
                                "Only if the plan covers Ozempic and current commercial offer "
                                "terms apply; monthly caps still control the result."
                            ),
                        },
                        {
                            "route": "NovoCare starter-fill public band",
                            "estimated_price_cents": 19900,
                            "caveat": (
                                "Public self-pay starter band; eligibility and terms must be "
                                "rechecked before use."
                            ),
                        },
                        {
                            "route": "NovoCare ongoing public self-pay band",
                            "estimated_price_cents": 34900,
                            "caveat": (
                                "Public monthly band for common starter/maintenance pen strengths; "
                                "self-pay spend may miss deductible or out-of-pocket credit."
                            ),
                        },
                        {
                            "route": "NovoCare higher-dose public self-pay band",
                            "estimated_price_cents": 49900,
                            "caveat": (
                                "Public monthly band for the higher-dose pen; eligibility and "
                                "terms must be rechecked."
                            ),
                        },
                    ],
                    "source_ids": source_ids,
                },
                {
                    "id": "ozempic-prescriber-alternatives",
                    "title": "Prescriber-reviewed diabetes alternatives",
                    "rank": 2,
                    "summary": (
                        "If Ozempic coverage is blocked, CopayGuard keeps metformin ER, SGLT2 "
                        "options, and other GLP-1/incretin choices as prescriber discussion "
                        "paths, not automatic substitutions."
                    ),
                    "confidence": "found_source",
                    "drop_type": "coverage_path",
                    "source_ids": source_ids,
                },
            ]
            cost_tracker = _cost_tracker(
                intake_data,
                current_best_label="Best public estimate: covered commercial savings path",
                current_best_estimated_price_cents=2500,
                potential_drop_cents=None,
                drop_type="price_reduction",
                confidence="found_source",
                explanation=(
                    "CopayGuard found source-backed public price paths before the first fill. "
                    "The lowest visible path is a covered-commercial savings offer, but it is "
                    "not a live claim result until the plan and pharmacy process it."
                ),
                source_ids=source_ids,
            )
            return options, cost_tracker

        if _is_adderall_intake(intake_data):
            options = [
                {
                    "id": "generic-stimulant-first-pass",
                    "title": "Generic stimulant first-pass check",
                    "rank": 1,
                    "summary": (
                        "CopayGuard will compare generic mixed amphetamine salts ER against the "
                        "insurance claim path before pickup, then keep lisdexamfetamine and "
                        "methylphenidate ER as prescriber-reviewed alternatives if the plan blocks "
                        "or prices Adderall XR poorly."
                    ),
                    "confidence": "eligibility_unknown",
                    "drop_type": "unknown",
                    "source_ids": source_ids,
                },
                {
                    "id": "cash-vs-insurance-stimulant",
                    "title": "Cash versus insurance comparison",
                    "rank": 2,
                    "summary": (
                        "Because the patient has a deductible left, CopayGuard will compare retail "
                        "cash/discount context with insurance pricing and warn if cash spend would "
                        "not count toward deductible progress."
                    ),
                    "confidence": "eligibility_unknown",
                    "drop_type": "unknown",
                    "source_ids": source_ids,
                },
            ]
            cost_tracker = _cost_tracker(
                intake_data,
                current_best_label="No fill quote yet; pre-fill comparison ready",
                current_best_estimated_price_cents=None,
                potential_drop_cents=None,
                drop_type="unknown",
                confidence="eligibility_unknown",
                explanation=(
                    "This is a before-fill estimate case. CopayGuard has enough intake detail to "
                    "rank the work: generic-first pricing, plan-preferred alternatives, and "
                    "cash-versus-insurance tradeoffs before the patient reaches the counter."
                ),
                source_ids=source_ids,
            )
            return options, cost_tracker

        options = [
            {
                "id": "pre-fill-price-and-access-check",
                "title": "Pre-fill price and access check",
                "rank": 1,
                "summary": (
                    "CopayGuard will check likely plan blockers, generic or clinically appropriate "
                    "alternatives, and cash-versus-insurance tradeoffs before pickup."
                ),
                "confidence": "eligibility_unknown",
                "drop_type": "unknown",
                "source_ids": source_ids,
            }
        ]
        cost_tracker = _cost_tracker(
            intake_data,
            current_best_label="No fill quote yet; pre-fill review ready",
            current_best_estimated_price_cents=None,
            potential_drop_cents=None,
            drop_type="unknown",
            confidence="eligibility_unknown",
            explanation=(
                "No pharmacy quote is available yet, so CopayGuard is preventing the surprise "
                "instead of claiming savings."
            ),
            source_ids=source_ids,
        )
        return options, cost_tracker

    if case_moment == "coupon_behavior" or has_accumulator:
        options = [
            {
                "id": "accumulator-maximizer-check",
                "title": "Copay-card credit check",
                "rank": 1,
                "summary": (
                    "The pasted plan language says manufacturer assistance may lower today's "
                    "charge without counting toward deductible or out-of-pocket progress. "
                    "CopayGuard treats that as unstable savings until the credit rule is clear."
                ),
                "confidence": "found_source",
                "drop_type": "unknown",
                "source_ids": source_ids,
            },
            {
                "id": "specialty-program-routing",
                "title": "Specialty program routing",
                "rank": 2,
                "summary": (
                    "CopayGuard will separate normal manufacturer support from PrudentRx, "
                    "SaveOnSP, or variable-copay routing so the patient knows what happens "
                    "after the first low charge."
                ),
                "confidence": "needs_user_confirmation",
                "drop_type": "unknown",
                "source_ids": source_ids,
            },
        ]
        cost_tracker = _cost_tracker(
            intake_data,
            current_best_label="Possible coupon relief; durable savings unverified",
            current_best_estimated_price_cents=None,
            potential_drop_cents=None,
            drop_type="unknown",
            confidence="needs_user_confirmation",
            explanation=(
                "The issue is not just today's charge. CopayGuard found language that may keep "
                "manufacturer assistance from counting toward deductible or out-of-pocket "
                "progress, so it will not label the coupon as true savings yet."
            ),
            source_ids=source_ids,
        )
        return options, cost_tracker

    if is_medicare:
        options = [
            {
                "id": "medicare-foundation-pap-screen",
                "title": "Foundation or free-drug screening",
                "rank": 1,
                "summary": (
                    "Prior authorization is already approved and the pharmacy quote is known. "
                    "CopayGuard's first cost-lowering route is RA/autoimmune foundation funds "
                    "and Amgen Safety Net/free-drug eligibility, because Medicare blocks normal "
                    "manufacturer copay cards."
                ),
                "confidence": "eligibility_unknown",
                "drop_type": "coverage_path",
                "source_ids": source_ids,
            },
            {
                "id": "medicare-payment-plan",
                "title": "Medicare Prescription Payment Plan",
                "rank": 2,
                "summary": (
                    "Use this only if the problem is timing of the $2,100 payment. It can spread "
                    "cost across monthly bills but does not reduce the total drug cost."
                ),
                "confidence": "found_source",
                "drop_type": "cash_flow_smoothing",
                "source_ids": source_ids,
            },
            {
                "id": "part-d-exception-or-alternative",
                "title": "Plan exception or prescriber alternative",
                "rank": 3,
                "summary": (
                    "If foundation or PAP routes are unavailable, CopayGuard will prepare the "
                    "coverage-determination, exception, or prescriber-alternative path."
                ),
                "confidence": "eligibility_unknown",
                "drop_type": "coverage_path",
                "source_ids": source_ids,
            },
        ]
        cost_tracker = _cost_tracker(
            intake_data,
            current_best_label="Cost-lowering routes identified; no lower price verified yet",
            current_best_estimated_price_cents=intake_data.quoted_price_cents,
            potential_drop_cents=0,
            drop_type="coverage_path",
            confidence="eligibility_unknown",
            explanation=(
                "The $2,100 quote is already after the Medicare Part D claim and approved prior "
                "authorization. CopayGuard found the right Medicare paths: foundation/PAP "
                "screening for possible cost reduction, payment-plan smoothing for cash flow, "
                "and exception or alternative routing if support is unavailable."
            ),
            source_ids=source_ids,
        )
        return options, cost_tracker

    if _is_zepbound_intake(intake_data):
        options = [
            {
                "id": "zepbound-coverage-savings-split",
                "title": "Coverage and savings-card split",
                "rank": 1,
                "summary": (
                    "The $550 quote appears to be after savings-card review while plan coverage "
                    "is still pending. CopayGuard will separate the insurance answer from the "
                    "savings-card cap before recommending a route."
                ),
                "confidence": "eligibility_unknown",
                "drop_type": "unknown",
                "source_ids": source_ids,
            },
            {
                "id": "zepbound-direct-pay-fallback",
                "title": "Direct self-pay fallback",
                "rank": 2,
                "summary": (
                    "CopayGuard will compare LillyDirect/Zepbound self-pay options against the "
                    "quoted $550 and warn that self-pay usually will not count toward deductible "
                    "or out-of-pocket progress."
                ),
                "confidence": "found_source",
                "drop_type": "unknown",
                "source_ids": source_ids,
            },
            {
                "id": "zepbound-exception-or-alternative",
                "title": "Exception or prescriber alternative",
                "rank": 3,
                "summary": (
                    "If coverage is denied or the savings route is capped, CopayGuard will prepare "
                    "the plan-exception or prescriber-alternative discussion."
                ),
                "confidence": "eligibility_unknown",
                "drop_type": "coverage_path",
                "source_ids": source_ids,
            },
        ]
        cost_tracker = _cost_tracker(
            intake_data,
            current_best_label="Savings-card quote is current best known price",
            current_best_estimated_price_cents=intake_data.quoted_price_cents,
            potential_drop_cents=None,
            drop_type="unknown",
            confidence="eligibility_unknown",
            explanation=(
                "CopayGuard is treating the $550 pharmacy quote as the current known price, then "
                "checking whether coverage approval, savings-card limits, or direct self-pay "
                "routes produce a better patient-specific path."
            ),
            source_ids=source_ids,
        )
        return options, cost_tracker

    options = [
        {
            "id": "commercial-sticker-shock-routing",
            "title": "Commercial sticker-shock routing",
            "rank": 1,
            "summary": (
                "CopayGuard will rank insurance processing, cash pricing, manufacturer support, "
                "plan exception, and prescriber alternatives before choosing a route."
            ),
            "confidence": "eligibility_unknown",
            "drop_type": "unknown",
            "source_ids": source_ids,
        }
    ]
    cost_tracker = _cost_tracker(
        intake_data,
        current_best_label="Commercial route still needs ranking",
        current_best_estimated_price_cents=None,
        potential_drop_cents=None,
        drop_type="unknown",
        confidence="eligibility_unknown",
        explanation=(
            "CopayGuard has the quote and plan clues; the result should now rank the route "
            "instead of asking the patient to do the checks."
        ),
        source_ids=source_ids,
    )
    return options, cost_tracker


def _cost_tracker(
    intake_data: MedicationAffordabilityIntakeCreate,
    *,
    current_best_label: str,
    current_best_estimated_price_cents: int | None,
    potential_drop_cents: int | None,
    drop_type: str,
    confidence: str,
    explanation: str,
    source_ids: list[int],
) -> dict[str, Any]:
    return {
        "quoted_price_cents": intake_data.quoted_price_cents,
        "current_best_label": current_best_label,
        "current_best_estimated_price_cents": current_best_estimated_price_cents,
        "potential_drop_cents": potential_drop_cents,
        "drop_type": drop_type,
        "confidence": confidence,
        "explanation": explanation,
        "source_ids": source_ids,
    }


def _is_adderall_intake(intake: MedicationAffordabilityIntakeCreate) -> bool:
    medication = intake.medication_name.lower()
    return "adderall" in medication or "amphetamine" in medication


def _is_zepbound_intake(intake: MedicationAffordabilityIntakeCreate) -> bool:
    medication = intake.medication_name.lower()
    return "zepbound" in medication or "tirzepatide" in medication


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

        for event in await _ensure_structured_demo_result(
            db=db,
            session_id=session_id,
            run_id=run.id,
            intake=intake,
        ):
            yield event

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


async def _ensure_structured_demo_result(
    *,
    db: AsyncSession,
    session_id: int,
    run_id: int,
    intake: MedicationAffordabilityIntake,
) -> list[MedicationAffordabilityStreamEvent]:
    state = await get_case_state_model(db, session_id)
    if state is None:
        return []
    existing_options = list(state.state_json.get("options") or [])
    existing_sources = (
        await db.scalars(
            select(MedicationAffordabilitySource)
            .where(MedicationAffordabilitySource.session_id == session_id)
            .order_by(MedicationAffordabilitySource.created_at, MedicationAffordabilitySource.id)
        )
    ).all()
    existing_artifacts = (
        await db.scalars(
            select(MedicationAffordabilityArtifact)
            .where(MedicationAffordabilityArtifact.session_id == session_id)
            .order_by(
                MedicationAffordabilityArtifact.created_at,
                MedicationAffordabilityArtifact.id,
            )
        )
    ).all()
    if existing_options and existing_sources and existing_artifacts:
        return []

    events: list[MedicationAffordabilityStreamEvent] = []
    intake_data = MedicationAffordabilityIntakeCreate.model_validate(intake, from_attributes=True)
    saved_sources = list(existing_sources)
    if not saved_sources:
        for resource in curated_resource_hints(intake_data)[:4]:
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
            events.append(
                _event(
                    "source_added",
                    session_id,
                    run_id,
                    {
                        "id": source.id,
                        "title": source.title,
                        "url": source.url,
                        "publisher": source.publisher,
                        "summary": source.summary,
                        "checked_at": (
                            source.checked_at.isoformat() if source.checked_at else None
                        ),
                        "confidence": source.confidence,
                    },
                )
            )
        await db.commit()

    source_ids = [source.id for source in saved_sources]
    if not existing_options:
        analysis = analyze_case(intake_data)
        options, cost_tracker = _demo_options_and_cost_tracker(
            intake_data=intake_data,
            case_moment=analysis.case_moment,
            has_accumulator=extract_facts_from_pasted_text(intake.pasted_text)[
                "has_accumulator_signal"
            ],
            is_medicare="medicare" in intake.insurance_type.lower(),
            source_ids=source_ids,
        )
        state = await update_case_state(
            db,
            session_id,
            {"options": options, "cost_tracker": cost_tracker},
        )
        await db.commit()
        events.extend(_event("option_added", session_id, run_id, option) for option in options)
        events.append(_event("cost_tracker_update", session_id, run_id, cost_tracker))
        events.append(
            _event(
                "case_state_patch",
                session_id,
                run_id,
                {
                    "patch": {"options": options, "cost_tracker": cost_tracker},
                    "state": state.state_json,
                },
            )
        )

    if not existing_artifacts:
        artifact_data = draft_next_artifact(intake_data)
        artifact = MedicationAffordabilityArtifact(
            session_id=session_id,
            artifact_type=artifact_data["artifact_type"],
            title=artifact_data["title"],
            content=artifact_data["content"],
            status="ready",
            metadata_json={"source_ids": source_ids},
        )
        db.add(artifact)
        await db.commit()
        await db.refresh(artifact)
        events.append(
            _event(
                "artifact_created",
                session_id,
                run_id,
                {
                    "id": artifact.id,
                    "artifact_type": artifact.artifact_type,
                    "title": artifact.title,
                    "content": artifact.content,
                    "status": artifact.status,
                    "source_ids": source_ids,
                    "created_at": (
                        artifact.created_at.isoformat() if artifact.created_at else None
                    ),
                    "updated_at": (
                        artifact.updated_at.isoformat() if artifact.updated_at else None
                    ),
                },
            )
        )

    return events
