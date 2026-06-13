from dataclasses import dataclass
from pathlib import Path

from pydantic_ai import Agent, RunContext
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.openai import OpenAIProvider
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.services import items as items_service

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"


@dataclass
class AgentDeps:
    session: AsyncSession


def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.md").read_text()


def _agent_provider() -> str:
    model = get_settings().agent_model
    if ":" not in model:
        return "grok"
    return model.split(":", 1)[0].lower()


def _agent_model_name() -> str:
    model = get_settings().agent_model
    if ":" not in model:
        return model
    return model.split(":", 1)[1]


def required_api_key_name() -> str:
    provider = _agent_provider()
    if provider in {"grok", "xai"}:
        return "GROK_API_KEY"
    if provider == "anthropic":
        return "ANTHROPIC_API_KEY"
    return "API key"


def agent_api_key_is_set() -> bool:
    settings = get_settings()
    provider = _agent_provider()
    if provider in {"grok", "xai"}:
        return bool(settings.grok_api_key)
    if provider == "anthropic":
        return bool(settings.anthropic_api_key)
    return False


def build_model() -> AnthropicModel | OpenAIChatModel:
    # The model is built per-request so the API key comes from settings (.env),
    # which pydantic-settings does not export to os.environ.
    settings = get_settings()
    provider = _agent_provider()
    model_name = _agent_model_name()
    if provider in {"grok", "xai"}:
        return OpenAIChatModel(
            model_name,
            provider=OpenAIProvider(
                api_key=settings.grok_api_key,
                base_url=settings.grok_base_url,
            ),
        )
    if provider == "anthropic":
        return AnthropicModel(
            model_name, provider=AnthropicProvider(api_key=settings.anthropic_api_key)
        )
    raise ValueError("Unsupported AGENT_MODEL provider. Use 'grok:<model>' or 'anthropic:<model>'.")


assistant: Agent[AgentDeps, str] = Agent(
    deps_type=AgentDeps,
    instructions=load_prompt("assistant"),
)


@assistant.tool
async def list_items(ctx: RunContext[AgentDeps], limit: int = 20) -> list[dict[str, object]]:
    """List the most recent items stored in the database."""
    items = await items_service.list_items(ctx.deps.session, limit=limit)
    return [{"id": i.id, "name": i.name, "description": i.description} for i in items]
