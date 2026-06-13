from __future__ import annotations

import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException
from sse_starlette import EventSourceResponse, ServerSentEvent

from app.agents.medication_affordability import (
    medication_agent_api_key_is_set,
    medication_agent_required_api_key_name,
)
from app.db import SessionDep
from app.models import MedicationAffordabilityArtifact
from app.schemas import (
    MedicationAffordabilityArtifactCreate,
    MedicationAffordabilityArtifactRead,
    MedicationAffordabilityDemoCase,
    MedicationAffordabilityMessageCreate,
    MedicationAffordabilityMessageRead,
    MedicationAffordabilityRunRequest,
    MedicationAffordabilitySessionCreate,
    MedicationAffordabilitySessionCreateResponse,
    MedicationAffordabilitySessionDetailRead,
    MedicationAffordabilitySessionSummary,
)
from app.services import medication_affordability_sessions as med_sessions

router = APIRouter(prefix="/api/medication-affordability", tags=["medication-affordability"])


@router.get("/demo-cases")
async def list_demo_cases() -> list[MedicationAffordabilityDemoCase]:
    return med_sessions.list_demo_cases()


@router.post("/sessions", status_code=201)
async def create_session(
    data: MedicationAffordabilitySessionCreate, session: SessionDep
) -> MedicationAffordabilitySessionCreateResponse:
    created = await med_sessions.create_session(session, data)
    return MedicationAffordabilitySessionCreateResponse(
        session_id=created.id,
        session=MedicationAffordabilitySessionSummary.model_validate(created),
    )


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: int, session: SessionDep
) -> MedicationAffordabilitySessionDetailRead:
    detail = await med_sessions.get_session_detail(session, session_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Medication affordability session not found")
    return detail


@router.post("/sessions/{session_id}/messages", status_code=201)
async def add_message(
    session_id: int,
    data: MedicationAffordabilityMessageCreate,
    session: SessionDep,
) -> MedicationAffordabilityMessageRead:
    message = await med_sessions.add_message(session, session_id, "user", data)
    if message is None:
        raise HTTPException(status_code=404, detail="Medication affordability session not found")
    return MedicationAffordabilityMessageRead.model_validate(message)


@router.post("/sessions/{session_id}/runs")
async def start_run(
    session_id: int,
    data: MedicationAffordabilityRunRequest,
    session: SessionDep,
) -> EventSourceResponse:
    if data.mode == "agent" and not medication_agent_api_key_is_set():
        key_name = medication_agent_required_api_key_name()
        raise HTTPException(
            status_code=503,
            detail=f"{key_name} is not set; use mode=mock only for explicit demo/test runs.",
        )
    if await med_sessions.get_session_model(session, session_id) is None:
        raise HTTPException(status_code=404, detail="Medication affordability session not found")

    async def stream() -> AsyncIterator[ServerSentEvent]:
        runner = (
            med_sessions.run_mock_investigation
            if data.mode == "mock"
            else med_sessions.run_agent_investigation
        )
        async for event in runner(session, session_id):
            yield ServerSentEvent(
                event=event.type,
                data=json.dumps(event.model_dump(mode="json")),
            )

    return EventSourceResponse(stream())


@router.post("/sessions/{session_id}/artifacts", status_code=201)
async def create_artifact(
    session_id: int,
    data: MedicationAffordabilityArtifactCreate,
    session: SessionDep,
) -> MedicationAffordabilityArtifactRead:
    if await med_sessions.get_session_model(session, session_id) is None:
        raise HTTPException(status_code=404, detail="Medication affordability session not found")
    artifact = MedicationAffordabilityArtifact(
        session_id=session_id,
        artifact_type=data.artifact_type,
        title=data.title,
        content=data.content,
        status=data.status,
        metadata_json=data.metadata_json,
    )
    session.add(artifact)
    await session.commit()
    await session.refresh(artifact)
    return MedicationAffordabilityArtifactRead.model_validate(artifact)
