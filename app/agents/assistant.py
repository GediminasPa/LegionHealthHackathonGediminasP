from dataclasses import dataclass
from pathlib import Path

from pydantic_ai import Agent, RunContext
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.services import items as items_service

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"


@dataclass
class AgentDeps:
    session: AsyncSession


def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.md").read_text()


def build_model() -> AnthropicModel:
    # The model is built per-request so the API key comes from settings (.env),
    # which pydantic-settings does not export to os.environ.
    settings = get_settings()
    model_name = settings.agent_model.removeprefix("anthropic:")
    return AnthropicModel(
        model_name, provider=AnthropicProvider(api_key=settings.anthropic_api_key)
    )


assistant: Agent[AgentDeps, str] = Agent(
    deps_type=AgentDeps,
    instructions=load_prompt("assistant"),
)


@assistant.tool
async def list_items(ctx: RunContext[AgentDeps], limit: int = 20) -> list[dict[str, object]]:
    """List the most recent items stored in the database."""
    items = await items_service.list_items(ctx.deps.session, limit=limit)
    return [{"id": i.id, "name": i.name, "description": i.description} for i in items]
