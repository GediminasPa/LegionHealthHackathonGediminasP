---
name: new-endpoint
description: Scaffold a new entity end-to-end — SQLAlchemy model, Alembic migration, Pydantic schemas, service, FastAPI router, and tests. Use when the user wants a new resource/entity/table/CRUD endpoint, e.g. "/new-endpoint Order" or "add a notes API".
---

# New endpoint

Scaffold a complete entity following the `Item` reference implementation. The entity name arrives as the argument (e.g. `Order`); derive `snake_case` and plural forms from it.

## Steps

1. **Model** — create `app/models/<entity>.py` mirroring `app/models/item.py` (typed `Mapped` columns, `created_at` with `server_default=func.now()`). Ask the user for the fields if they weren't given; default to `name: str` + `description: str | None` only if they say "whatever".
2. **Register** — export it from `app/models/__init__.py` (this is what makes Alembic see it).
3. **Migration** — run `bin/db revision "create <plural>"`, then open the generated file in `alembic/versions/` and verify it creates exactly the expected table (autogenerate output must be reviewed, not trusted). Apply with `bin/db migrate`.
4. **Schemas** — `app/schemas/<entity>.py`: `<Entity>Create` and `<Entity>Read` (with `model_config = ConfigDict(from_attributes=True)`), exported from `app/schemas/__init__.py`.
5. **Service** — `app/services/<plural>.py` with `create_*`, `list_*`, `get_*` (copy the shape of `app/services/items.py`).
6. **Router** — `app/routers/<plural>.py` with POST (201), GET list, GET by id (404 on miss); prefix `/api/<plural>`. Register in `app/main.py`.
7. **Tests** — `tests/test_<plural>.py` mirroring `tests/test_items.py` (round-trip + 404). Use the shared `client` fixture.
8. **Verify** — `bin/check` must pass. Report the new routes.

Don't add update/delete, pagination, or auth unless asked.
