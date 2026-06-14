from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "CopayGuard"
    database_url: str = "postgresql+asyncpg://app:app@localhost:5432/app"
    api_port: int = 8000

    anthropic_api_key: str = ""
    grok_api_key: str = Field(
        default="", validation_alias=AliasChoices("GROK_API_KEY", "XAI_API_KEY")
    )
    grok_base_url: str = "https://api.x.ai/v1"
    agent_model: str = "grok:grok-4.3"
    agent_reasoning_effort: Literal["none", "low", "medium", "high"] = "high"


@lru_cache
def get_settings() -> Settings:
    return Settings()
