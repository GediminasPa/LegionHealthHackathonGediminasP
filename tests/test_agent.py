from collections.abc import AsyncIterator, Iterator

import httpx
import pytest
from pydantic_ai import models
from pydantic_ai.messages import ModelMessage
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, DeltaToolCalls, FunctionModel
from pydantic_ai.models.openai import OpenAIChatModel

from app.agents import assistant, build_model
from app.config import get_settings

models.ALLOW_MODEL_REQUESTS = False


@pytest.fixture
def agent_key_set() -> Iterator[None]:
    settings = get_settings()
    original = settings.grok_api_key
    settings.grok_api_key = "test-key"
    yield
    settings.grok_api_key = original


async def test_chat_without_key_returns_503(client: httpx.AsyncClient) -> None:
    settings = get_settings()
    original = settings.grok_api_key
    settings.grok_api_key = ""
    try:
        response = await client.post("/api/agent/chat", json={"message": "hi"})
    finally:
        settings.grok_api_key = original
    assert response.status_code == 503
    assert "GROK_API_KEY" in response.json()["detail"]


def test_build_model_defaults_to_grok(agent_key_set: None) -> None:
    model = build_model()

    assert isinstance(model, OpenAIChatModel)
    assert model.model_name == "grok-4.3"


async def _stream_with_tool_call(
    messages: list[ModelMessage], info: AgentInfo
) -> AsyncIterator[str | DeltaToolCalls]:
    if len(messages) == 1:
        yield {0: DeltaToolCall(name="list_items", json_args="{}")}
    else:
        tool_return = messages[-1].parts[0]
        yield "Stored items: "
        yield str(getattr(tool_return, "content", ""))


async def test_chat_streams_tokens_and_uses_tool(
    client: httpx.AsyncClient, agent_key_set: None
) -> None:
    seeded = await client.post("/api/items", json={"name": "tool-demo", "description": None})
    assert seeded.status_code == 201

    with assistant.override(model=FunctionModel(stream_function=_stream_with_tool_call)):
        response = await client.post("/api/agent/chat", json={"message": "what items exist?"})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    body = response.text
    assert "event: token" in body
    assert "tool-demo" in body
    assert "event: done" in body
