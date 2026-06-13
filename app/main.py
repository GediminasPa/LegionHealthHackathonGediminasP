from fastapi import FastAPI

from app.config import get_settings
from app.routers import agent, health, items

app = FastAPI(title=get_settings().app_name)

app.include_router(health.router)
app.include_router(items.router)
app.include_router(agent.router)
