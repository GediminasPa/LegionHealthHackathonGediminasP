from fastapi import APIRouter
from sqlalchemy import text

from app.config import get_settings
from app.db import SessionDep

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health(session: SessionDep) -> dict[str, str]:
    try:
        await session.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "unavailable"
    return {"app": get_settings().app_name, "status": "ok", "db": db_status}
