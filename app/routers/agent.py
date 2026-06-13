from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sse_starlette import EventSourceResponse, ServerSentEvent

from app.agents import (
    AgentDeps,
    agent_api_key_is_set,
    assistant,
    build_model,
    required_api_key_name,
)
from app.db import SessionDep

router = APIRouter(prefix="/api/agent", tags=["agent"])


class ChatRequest(BaseModel):
    message: str


@router.post("/chat")
async def chat(data: ChatRequest, session: SessionDep) -> EventSourceResponse:
    if not agent_api_key_is_set():
        key_name = required_api_key_name()
        raise HTTPException(
            status_code=503,
            detail=f"{key_name} is not set — add it to .env to enable the agent.",
        )

    deps = AgentDeps(session=session)

    async def stream() -> AsyncIterator[ServerSentEvent]:
        async with assistant.run_stream(data.message, deps=deps, model=build_model()) as result:
            async for delta in result.stream_text(delta=True):
                yield ServerSentEvent(event="token", data=delta)
        yield ServerSentEvent(event="done", data="")

    return EventSourceResponse(stream())
