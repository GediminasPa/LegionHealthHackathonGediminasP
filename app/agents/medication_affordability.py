from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

from pydantic_ai import Agent, RunContext
from pydantic_ai.capabilities.web_search import WebSearch
from pydantic_ai.models.openai import OpenAIResponsesModel
from pydantic_ai.native_tools import WebSearchTool
from pydantic_ai.providers.openai import OpenAIProvider
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.medication_affordability_specialists import (
    analyze_case,
    curated_resource_hints,
    draft_next_artifact,
    public_program_copay_guardrail,
)
from app.agents.medication_affordability_specialists.artifact_writer import medication_label
from app.agents.medication_affordability_specialists.document_extraction import (
    extract_facts_from_pasted_text as extract_typed_facts_from_pasted_text,
)
from app.config import get_settings
from app.models import (
    MedicationAffordabilityActivity,
    MedicationAffordabilityArtifact,
    MedicationAffordabilityCaseState,
    MedicationAffordabilityIntake,
    MedicationAffordabilityMessage,
    MedicationAffordabilitySource,
)
from app.schemas.medication_affordability import (
    CostConfidence,
    CostDropType,
    CostTrackerState,
    MedicationAffordabilityArtifactRead,
    MedicationAffordabilityIntakeCreate,
    MedicationAffordabilityMessageRead,
    MedicationAffordabilitySourceRead,
    MedicationAffordabilityStreamEvent,
)
from app.services.medication_affordability_resources import search_curated_resources
from app.services.medication_affordability_search import grok_web_search as run_grok_web_search

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"

__all__ = [
    "MedicationAgentDeps",
    "analyze_case",
    "build_medication_agent_prompt",
    "build_medication_model",
    "curated_resource_hints",
    "draft_next_artifact",
    "extract_facts_from_pasted_text",
    "medication_affordability_agent",
    "medication_agent_api_key_is_set",
    "medication_agent_required_api_key_name",
    "patient_display_name",
    "public_program_copay_guardrail",
]


def load_medication_prompt() -> str:
    return (PROMPTS_DIR / "medication_affordability.md").read_text()


def extract_facts_from_pasted_text(text: str | None) -> dict[str, Any]:
    return extract_typed_facts_from_pasted_text(text).model_dump(mode="json")


def medication_agent_api_key_is_set() -> bool:
    return bool(get_settings().grok_api_key)


def medication_agent_required_api_key_name() -> str:
    return "GROK_API_KEY"


def build_medication_model() -> OpenAIResponsesModel:
    settings = get_settings()
    return OpenAIResponsesModel(
        settings.agent_model.split(":", 1)[-1],
        provider=OpenAIProvider(api_key=settings.grok_api_key, base_url=settings.grok_base_url),
    )


def build_web_search_capabilities(allowed_domains: list[str] | None = None) -> list[WebSearch]:
    return [
        WebSearch(
            native=WebSearchTool(
                search_context_size=cast(Any, None),
                allowed_domains=allowed_domains,
            )
        )
    ]


@dataclass
class MedicationAgentDeps:
    session: AsyncSession
    session_id: int
    run_id: int
    pending_events: list[MedicationAffordabilityStreamEvent] = field(default_factory=list)

    def emit(self, event_type: str, payload: dict[str, Any]) -> None:
        self.pending_events.append(
            MedicationAffordabilityStreamEvent(
                type=event_type,  # type: ignore[arg-type]
                session_id=self.session_id,
                run_id=self.run_id,
                payload=payload,
            )
        )

    def drain_events(self) -> list[MedicationAffordabilityStreamEvent]:
        events = self.pending_events[:]
        self.pending_events.clear()
        return events


medication_affordability_agent: Agent[MedicationAgentDeps, str] = Agent(
    deps_type=MedicationAgentDeps,
    instructions=load_medication_prompt(),
)


def build_medication_agent_prompt(
    intake: MedicationAffordabilityIntake,
    state: MedicationAffordabilityCaseState,
    messages: list[MedicationAffordabilityMessage],
) -> str:
    transcript = (
        "\n".join(f"{message.role}: {message.content}" for message in messages[-12:])
        or "No prior chat messages."
    )
    return "\n".join(
        [
            "Start or continue this medication affordability investigation.",
            "Always begin by calling get_session_context so you are using persisted state.",
            "Then call run_case_preflight before ranking routes or drafting artifacts.",
            "Use tools to persist every material source, option, question, cost update, "
            "activity, and artifact you create.",
            "Do not claim a price reduction unless a tool-persisted source supports it; "
            "use unknown or needs_user_confirmation when eligibility is unresolved.",
            "Write patient-facing text in plain English. Do not ask the patient to identify "
            "insurance jargon such as accumulator, maximizer, PA, ST, QL, formulary tier, "
            "or OOP max. Ask for visible facts, messages, documents, or permission to "
            "interpret pasted wording instead.",
            "Own the next steps. If CopayGuard can check a source or route, write it as "
            "'I will check...' or 'CopayGuard will check...', not as homework for the patient. "
            "Only ask the patient for one hidden patient-specific fact at a time.",
            "If you call ask_question, stop there. Do not also return a separate route summary "
            "or evidence recap in the same turn.",
            "",
            "Current intake:",
            f"- Patient/display name: {patient_display_name(intake.patient_name, 'not provided')}",
            f"- State: {intake.state}",
            f"- Medication: {medication_label(_intake_create_from_model(intake))}",
            f"- Quoted price cents: {intake.quoted_price_cents}",
            f"- Insurance type: {intake.insurance_type}",
            f"- Plan: {intake.plan_name or 'unknown'}",
            f"- PA status: {intake.pa_status}",
            f"- Diagnosis: {intake.diagnosis or 'unknown'}",
            "",
            "Persisted state snapshot:",
            str(state.state_json),
            "",
            "Current orchestrator preflight:",
            str(state.state_json.get("case_analysis") or {}),
            "",
            "Recent chat transcript:",
            transcript,
        ]
    )


def patient_display_name(patient_name: str | None, fallback: str = "the patient") -> str:
    value = (patient_name or "").strip()
    return value or fallback


@medication_affordability_agent.tool(sequential=True)
async def get_session_context(ctx: RunContext[MedicationAgentDeps]) -> dict[str, Any]:
    """Read the persisted intake, case state, prior messages, sources, and artifacts."""
    ctx.deps.emit("tool_call", {"name": "get_session_context", "args": {}})
    session = ctx.deps.session
    intake = await _get_intake(session, ctx.deps.session_id)
    state = await _get_case_state(session, ctx.deps.session_id)
    messages = (
        await session.scalars(
            select(MedicationAffordabilityMessage)
            .where(MedicationAffordabilityMessage.session_id == ctx.deps.session_id)
            .order_by(MedicationAffordabilityMessage.created_at, MedicationAffordabilityMessage.id)
        )
    ).all()
    sources = (
        await session.scalars(
            select(MedicationAffordabilitySource)
            .where(MedicationAffordabilitySource.session_id == ctx.deps.session_id)
            .order_by(MedicationAffordabilitySource.created_at, MedicationAffordabilitySource.id)
        )
    ).all()
    artifacts = (
        await session.scalars(
            select(MedicationAffordabilityArtifact)
            .where(MedicationAffordabilityArtifact.session_id == ctx.deps.session_id)
            .order_by(
                MedicationAffordabilityArtifact.created_at,
                MedicationAffordabilityArtifact.id,
            )
        )
    ).all()
    result = {
        "intake": _intake_create_from_model(intake).model_dump(mode="json"),
        "case_state": state.state_json,
        "messages": [
            MedicationAffordabilityMessageRead.model_validate(message).model_dump(mode="json")
            for message in messages
        ],
        "sources": [
            MedicationAffordabilitySourceRead.model_validate(source).model_dump(mode="json")
            for source in sources
        ],
        "artifacts": [
            MedicationAffordabilityArtifactRead.model_validate(artifact).model_dump(mode="json")
            for artifact in artifacts
        ],
    }
    ctx.deps.emit(
        "tool_result",
        {
            "name": "get_session_context",
            "result": {
                "message_count": len(messages),
                "source_count": len(sources),
                "artifact_count": len(artifacts),
            },
        },
    )
    return result


@medication_affordability_agent.tool(sequential=True)
async def run_case_preflight(ctx: RunContext[MedicationAgentDeps]) -> dict[str, Any]:
    """Run deterministic case classification, eligibility routing, and specialist planning."""
    ctx.deps.emit("tool_call", {"name": "run_case_preflight", "args": {}})
    intake = await _get_intake(ctx.deps.session, ctx.deps.session_id)
    analysis = analyze_case(_intake_create_from_model(intake))
    payload = analysis.model_dump(mode="json")
    patch = {
        "case_moment": analysis.case_moment,
        "case_analysis": payload,
        "flags": analysis.flags,
        "blocked_routes": analysis.blocked_routes,
        "missing_facts": analysis.missing_facts,
        "specialist_plan": [step.model_dump(mode="json") for step in analysis.specialist_plan],
    }
    state = await _merge_case_state(ctx.deps.session, ctx.deps.session_id, patch)
    await ctx.deps.session.commit()
    ctx.deps.emit("case_state_patch", {"patch": patch, "state": state.state_json})
    ctx.deps.emit(
        "tool_result",
        {
            "name": "run_case_preflight",
            "result": {
                "case_moment": analysis.case_moment,
                "flags": analysis.flags,
                "blocked_routes": analysis.blocked_routes,
                "missing_facts": analysis.missing_facts,
            },
        },
    )
    return payload


@medication_affordability_agent.tool(sequential=True)
async def add_activity(
    ctx: RunContext[MedicationAgentDeps],
    title: str,
    summary: str | None = None,
    event_type: str = "activity_started",
) -> dict[str, Any]:
    """Persist an activity row and stream it to the workspace."""
    allowed = {"activity_started", "activity_updated", "activity_completed"}
    if event_type not in allowed:
        event_type = "activity_updated"
    ctx.deps.emit(
        "tool_call",
        {"name": "add_activity", "args": {"title": title, "event_type": event_type}},
    )
    activity = MedicationAffordabilityActivity(
        session_id=ctx.deps.session_id,
        run_id=ctx.deps.run_id,
        event_type=event_type,
        title=title,
        summary=summary,
        payload_json={},
    )
    ctx.deps.session.add(activity)
    await ctx.deps.session.commit()
    await ctx.deps.session.refresh(activity)
    payload = {
        "id": activity.id,
        "title": activity.title,
        "summary": activity.summary,
        "created_at": activity.created_at.isoformat() if activity.created_at else None,
    }
    ctx.deps.emit(event_type, payload)
    ctx.deps.emit("tool_result", {"name": "add_activity", "result": payload})
    return payload


@medication_affordability_agent.tool(sequential=True)
async def update_case_state(
    ctx: RunContext[MedicationAgentDeps], patch: dict[str, Any]
) -> dict[str, Any]:
    """Merge a JSON patch-like object into the persisted case state."""
    ctx.deps.emit("tool_call", {"name": "update_case_state", "args": {"patch": patch}})
    state = await _merge_case_state(ctx.deps.session, ctx.deps.session_id, patch)
    await ctx.deps.session.commit()
    payload = {"patch": patch, "state": state.state_json, "version": state.version}
    ctx.deps.emit("case_state_patch", payload)
    ctx.deps.emit(
        "tool_result",
        {"name": "update_case_state", "result": {"version": state.version}},
    )
    return payload


@medication_affordability_agent.tool(sequential=True)
async def update_cost_tracker(
    ctx: RunContext[MedicationAgentDeps],
    current_best_label: str,
    explanation: str,
    current_best_estimated_price_cents: int | None = None,
    potential_drop_cents: int | None = None,
    drop_type: CostDropType = "unknown",
    confidence: CostConfidence = "needs_user_confirmation",
    source_ids: list[int | str] | None = None,
) -> dict[str, Any]:
    """Persist and stream the current affordability cost tracker."""
    ctx.deps.emit(
        "tool_call",
        {
            "name": "update_cost_tracker",
            "args": {"current_best_label": current_best_label, "drop_type": drop_type},
        },
    )
    intake = await _get_intake(ctx.deps.session, ctx.deps.session_id)
    tracker = CostTrackerState(
        quoted_price_cents=intake.quoted_price_cents,
        current_best_label=current_best_label,
        current_best_estimated_price_cents=current_best_estimated_price_cents,
        potential_drop_cents=potential_drop_cents,
        drop_type=drop_type,
        confidence=confidence,
        explanation=explanation,
        source_ids=source_ids or [],
    )
    patch = {"cost_tracker": tracker.model_dump(mode="json")}
    state = await _merge_case_state(ctx.deps.session, ctx.deps.session_id, patch)
    await ctx.deps.session.commit()
    payload = tracker.model_dump(mode="json")
    ctx.deps.emit("cost_tracker_update", payload)
    ctx.deps.emit("case_state_patch", {"patch": patch, "state": state.state_json})
    ctx.deps.emit("tool_result", {"name": "update_cost_tracker", "result": payload})
    return payload


@medication_affordability_agent.tool(name="search_curated_resources", sequential=True)
async def search_curated_resources_tool(
    ctx: RunContext[MedicationAgentDeps],
    query: str,
    tags: list[str] | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Search the curated affordability resource registry before web search."""
    ctx.deps.emit(
        "tool_call",
        {"name": "search_curated_resources", "args": {"query": query, "tags": tags or []}},
    )
    resources = search_curated_resources(query=query, tags=tags, limit=min(max(limit, 1), 8))
    ctx.deps.emit(
        "tool_result",
        {"name": "search_curated_resources", "result": {"count": len(resources)}},
    )
    return resources


@medication_affordability_agent.tool(sequential=True)
async def grok_web_search(
    ctx: RunContext[MedicationAgentDeps],
    query: str,
    allowed_domains: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Search the live web through xAI/Grok when curated resources are insufficient."""
    ctx.deps.emit(
        "tool_call",
        {
            "name": "grok_web_search",
            "args": {"query": query, "allowed_domains": allowed_domains or []},
        },
    )
    results = await run_grok_web_search(query, allowed_domains=allowed_domains)
    payload = [result.model_dump(mode="json") for result in results]
    ctx.deps.emit("tool_result", {"name": "grok_web_search", "result": {"count": len(payload)}})
    return payload


@medication_affordability_agent.tool(sequential=True)
async def extract_pasted_text_facts(
    ctx: RunContext[MedicationAgentDeps], text: str | None = None
) -> dict[str, Any]:
    """Extract accumulator, maximizer, and deductible/OOP clues from plan text."""
    ctx.deps.emit("tool_call", {"name": "extract_pasted_text_facts", "args": {}})
    if text is None:
        intake = await _get_intake(ctx.deps.session, ctx.deps.session_id)
        text = intake.pasted_text
    facts = extract_facts_from_pasted_text(text)
    ctx.deps.emit("tool_result", {"name": "extract_pasted_text_facts", "result": facts})
    return facts


@medication_affordability_agent.tool(sequential=True)
async def save_source(
    ctx: RunContext[MedicationAgentDeps],
    title: str,
    url: str,
    source_type: str,
    publisher: str | None = None,
    summary: str | None = None,
    confidence: float | None = None,
    checked_at: str | None = None,
) -> dict[str, Any]:
    """Persist a source used by the investigation and stream it to the source panel."""
    ctx.deps.emit("tool_call", {"name": "save_source", "args": {"title": title, "url": url}})
    source = MedicationAffordabilitySource(
        session_id=ctx.deps.session_id,
        title=title,
        url=url,
        source_type=source_type,
        publisher=publisher,
        checked_at=_parse_datetime(checked_at) or datetime.now(UTC),
        summary=summary,
        confidence=confidence,
    )
    ctx.deps.session.add(source)
    await ctx.deps.session.commit()
    await ctx.deps.session.refresh(source)
    payload = _source_payload(source)
    ctx.deps.emit("source_added", payload)
    ctx.deps.emit("tool_result", {"name": "save_source", "result": payload})
    return payload


@medication_affordability_agent.tool(sequential=True)
async def save_option(
    ctx: RunContext[MedicationAgentDeps],
    id: str,
    title: str,
    summary: str,
    confidence: CostConfidence = "needs_user_confirmation",
    drop_type: CostDropType = "unknown",
    rank: int | None = None,
    source_ids: list[int | str] | None = None,
) -> dict[str, Any]:
    """Persist or update an affordability option in case state."""
    ctx.deps.emit("tool_call", {"name": "save_option", "args": {"id": id, "title": title}})
    state = await _get_case_state(ctx.deps.session, ctx.deps.session_id)
    options = list(state.state_json.get("options") or [])
    option = {
        "id": id,
        "title": title,
        "rank": rank,
        "summary": summary,
        "confidence": confidence,
        "drop_type": drop_type,
        "source_ids": source_ids or [],
    }
    existing_index = next(
        (index for index, existing in enumerate(options) if existing.get("id") == id),
        None,
    )
    event_type = "option_added"
    if existing_index is None:
        options.append(option)
    else:
        options[existing_index] = {**options[existing_index], **option}
        event_type = "option_updated"
    state = await _merge_case_state(ctx.deps.session, ctx.deps.session_id, {"options": options})
    await ctx.deps.session.commit()
    ctx.deps.emit(event_type, option)
    ctx.deps.emit("case_state_patch", {"patch": {"options": options}, "state": state.state_json})
    ctx.deps.emit("tool_result", {"name": "save_option", "result": option})
    return option


@medication_affordability_agent.tool(sequential=True)
async def ask_question(
    ctx: RunContext[MedicationAgentDeps],
    question: str,
    question_id: str | None = None,
    choices: list[str] | None = None,
) -> dict[str, Any]:
    """Persist and stream a follow-up question when eligibility facts are missing."""
    question = patient_friendly_question(question)
    ctx.deps.emit("tool_call", {"name": "ask_question", "args": {"question": question}})
    state = await _get_case_state(ctx.deps.session, ctx.deps.session_id)
    questions = list(state.state_json.get("questions") or [])
    payload = {
        "id": question_id or f"question-{len(questions) + 1}",
        "question": question,
        "choices": choices or [],
    }
    questions.append(payload)
    state = await _merge_case_state(ctx.deps.session, ctx.deps.session_id, {"questions": questions})
    await ctx.deps.session.commit()
    ctx.deps.emit("question", payload)
    ctx.deps.emit(
        "case_state_patch",
        {"patch": {"questions": questions}, "state": state.state_json},
    )
    ctx.deps.emit("tool_result", {"name": "ask_question", "result": payload})
    return payload


def patient_friendly_question(question: str) -> str:
    value = " ".join(question.strip().split())
    lower = value.lower()
    if "household income" in lower and "household size" in lower:
        return "What is your approximate annual household income and household size?"
    if "household size" in lower and "income" not in lower:
        return "How many people are in your household?"
    if ("accumulator" in lower or "maximizer" in lower) and (
        "copay" in lower or "coupon" in lower or "deductible" in lower or "oop" in lower
    ):
        return (
            "When you used or expected the copay card, did the pharmacy, coupon terms, "
            "or insurance portal say the discount would not count toward your deductible "
            "or out-of-pocket total? If you are not sure, paste the message or plan wording "
            "and I will interpret it."
        )

    replacements = {
        "OOP": "out-of-pocket",
        "oop": "out-of-pocket",
        "PA": "prior authorization",
        "ST": "step therapy",
        "QL": "quantity limit",
        "manufacturer copay assistance": "manufacturer copay card",
        "eligibility": "whether you qualify",
    }
    for raw, friendly in replacements.items():
        value = value.replace(raw, friendly)
    return value


@medication_affordability_agent.tool(sequential=True)
async def save_artifact(
    ctx: RunContext[MedicationAgentDeps],
    artifact_type: str,
    title: str,
    content: str,
    status: str = "ready",
    source_ids: list[int | str] | None = None,
) -> dict[str, Any]:
    """Persist a generated artifact such as a checklist, call script, or message draft."""
    ctx.deps.emit("tool_call", {"name": "save_artifact", "args": {"title": title}})
    artifact = MedicationAffordabilityArtifact(
        session_id=ctx.deps.session_id,
        artifact_type=artifact_type,
        title=title,
        content=content,
        status=status,
        metadata_json={"source_ids": source_ids or []},
    )
    ctx.deps.session.add(artifact)
    await ctx.deps.session.commit()
    await ctx.deps.session.refresh(artifact)
    payload = _artifact_payload(artifact)
    ctx.deps.emit("artifact_created", payload)
    ctx.deps.emit("tool_result", {"name": "save_artifact", "result": payload})
    return payload


async def _get_intake(session: AsyncSession, session_id: int) -> MedicationAffordabilityIntake:
    intake = await session.scalar(
        select(MedicationAffordabilityIntake).where(
            MedicationAffordabilityIntake.session_id == session_id
        )
    )
    if intake is None:
        raise ValueError(f"Session {session_id} has no intake")
    return intake


async def _get_case_state(
    session: AsyncSession, session_id: int
) -> MedicationAffordabilityCaseState:
    state = await session.scalar(
        select(MedicationAffordabilityCaseState).where(
            MedicationAffordabilityCaseState.session_id == session_id
        )
    )
    if state is None:
        raise ValueError(f"Session {session_id} has no case state")
    return state


async def _merge_case_state(
    session: AsyncSession, session_id: int, patch: dict[str, Any]
) -> MedicationAffordabilityCaseState:
    state = await _get_case_state(session, session_id)
    merged = {**state.state_json}
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}
        else:
            merged[key] = value
    state.state_json = merged
    state.version += 1
    state.updated_at = datetime.now(UTC)
    await session.flush()
    return state


def _intake_create_from_model(
    intake: MedicationAffordabilityIntake,
) -> MedicationAffordabilityIntakeCreate:
    return MedicationAffordabilityIntakeCreate.model_validate(intake, from_attributes=True)


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _source_payload(source: MedicationAffordabilitySource) -> dict[str, Any]:
    return {
        "id": source.id,
        "title": source.title,
        "url": source.url,
        "publisher": source.publisher,
        "summary": source.summary,
        "checked_at": source.checked_at.isoformat() if source.checked_at else None,
        "confidence": source.confidence,
    }


def _artifact_payload(artifact: MedicationAffordabilityArtifact) -> dict[str, Any]:
    metadata = artifact.metadata_json or {}
    return {
        "id": artifact.id,
        "artifact_type": artifact.artifact_type,
        "title": artifact.title,
        "content": artifact.content,
        "status": artifact.status,
        "source_ids": metadata.get("source_ids") or [],
        "created_at": artifact.created_at.isoformat() if artifact.created_at else None,
        "updated_at": artifact.updated_at.isoformat() if artifact.updated_at else None,
    }
