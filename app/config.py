from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "LegionHealthHackathonGediminasP"
    database_url: str = "postgresql+asyncpg://app:app@localhost:5432/app"
    api_port: int = 8000

    anthropic_api_key: str = ""
    agent_model: str = "anthropic:claude-sonnet-4-6"


@lru_cache
def get_settings() -> Settings:
    return Settings()
