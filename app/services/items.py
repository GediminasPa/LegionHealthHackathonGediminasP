from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Item
from app.schemas import ItemCreate


async def create_item(session: AsyncSession, data: ItemCreate) -> Item:
    item = Item(name=data.name, description=data.description)
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item


async def list_items(session: AsyncSession, limit: int = 100) -> Sequence[Item]:
    result = await session.scalars(select(Item).order_by(Item.id.desc()).limit(limit))
    return result.all()


async def get_item(session: AsyncSession, item_id: int) -> Item | None:
    return await session.get(Item, item_id)
