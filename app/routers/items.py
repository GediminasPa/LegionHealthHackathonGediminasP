from fastapi import APIRouter, HTTPException

from app.db import SessionDep
from app.schemas import ItemCreate, ItemRead
from app.services import items as items_service

router = APIRouter(prefix="/api/items", tags=["items"])


@router.post("", status_code=201)
async def create_item(data: ItemCreate, session: SessionDep) -> ItemRead:
    item = await items_service.create_item(session, data)
    return ItemRead.model_validate(item)


@router.get("")
async def list_items(session: SessionDep) -> list[ItemRead]:
    items = await items_service.list_items(session)
    return [ItemRead.model_validate(item) for item in items]


@router.get("/{item_id}")
async def get_item(item_id: int, session: SessionDep) -> ItemRead:
    item = await items_service.get_item(session, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return ItemRead.model_validate(item)
