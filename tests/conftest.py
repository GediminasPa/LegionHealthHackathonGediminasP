import os
from collections.abc import AsyncIterator

# Point the app at a dedicated test database BEFORE any app module is imported.
_BASE_URL = os.environ.get("DATABASE_URL", "postgresql+asyncpg://app:app@localhost:5432/app")
_SERVER_URL, _DB_NAME = _BASE_URL.rsplit("/", 1)
TEST_DB_NAME = f"{_DB_NAME}_test"
os.environ["DATABASE_URL"] = f"{_SERVER_URL}/{TEST_DB_NAME}"
os.environ.setdefault("ANTHROPIC_API_KEY", "")
os.environ.setdefault("GROK_API_KEY", "")

import httpx  # noqa: E402
import pytest  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine  # noqa: E402

import app.models  # noqa: F401, E402
from app.db import Base, get_engine  # noqa: E402


async def _ensure_test_database() -> None:
    admin_engine = create_async_engine(f"{_SERVER_URL}/postgres", isolation_level="AUTOCOMMIT")
    async with admin_engine.connect() as conn:
        exists = await conn.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": TEST_DB_NAME}
        )
        if not exists:
            await conn.execute(text(f'CREATE DATABASE "{TEST_DB_NAME}"'))
    await admin_engine.dispose()


@pytest.fixture(scope="session")
async def engine() -> AsyncIterator[AsyncEngine]:
    await _ensure_test_database()
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
async def client(engine: AsyncEngine) -> AsyncIterator[httpx.AsyncClient]:
    from app.main import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
