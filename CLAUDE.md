# LegionHealthHackathonGediminasP

## Routine Private Git Sync

After completing meaningful work in this repository, inspect the diff for secrets and unrelated files, run the relevant checks when practical, then commit and push the task-relevant changes to the configured private GitHub remote unless the user explicitly asks not to. Prefer small coherent commits; do not leave finished work only in the working tree.

This standing preference applies to private Git repository sync only. It does not authorize public repositories, hosted previews, GitHub Pages, deployments, or any live service publication.

FastAPI + Postgres + Pydantic AI starter. Everything is pre-wired — at a hackathon, go straight to building the idea.

## Commands

- `bin/dev` — run everything: Postgres (docker), API with reload on :8000, Vite frontend on :5173
- `bin/check` — full quality gate: ruff format/lint, pyright, pytest, frontend tsc + build. Must pass before every push (pre-push hook enforces it).
- `bin/up` — start Postgres + apply migrations
- `bin/db [shell|migrate|revision <msg>|reset|logs]` — database helpers
- `uv run pytest -q` — backend tests only (needs Postgres up)

## Stack

- **Backend:** FastAPI, async SQLAlchemy 2.0, Alembic, Postgres 16 (docker-compose), pydantic-settings (`app/config.py`, reads `.env`)
- **AI:** Pydantic AI agent in `app/agents/assistant.py`, xAI Grok via the OpenAI-compatible provider. System prompts live in `prompts/*.md`. Streaming chat endpoint: `POST /api/agent/chat` (SSE).
- **Frontend:** Vite + React + TS + Tailwind in `frontend/`. Dev server proxies `/api` to the backend. Typed client in `frontend/src/api.ts`.
- **Tooling:** uv, ruff, pyright, pytest (async, single session event loop)

## Conventions

- New entity flow: model (`app/models/`) → migration (`bin/db revision "<msg>"`, then check the generated file) → schema (`app/schemas/`) → service (`app/services/`) → router (`app/routers/`, registered in `app/main.py`) → test (`tests/`). Follow `Item` as the reference example.
- Agent tools are `@assistant.tool` functions in `app/agents/assistant.py`; they get DB access via `ctx.deps.session`.
- The LLM model is built per-request (`build_model()`) because pydantic-settings does not export `.env` to `os.environ`. Use `AGENT_MODEL=grok:<model>` with `GROK_API_KEY` by default, or `AGENT_MODEL=anthropic:<model>` with `ANTHROPIC_API_KEY` if needed. In tests, use `assistant.override(model=...)` with `TestModel`/`FunctionModel` — never real API calls (`models.ALLOW_MODEL_REQUESTS = False`).
- Tests run against a real Postgres test database (`<db>_test`), created automatically by `tests/conftest.py`.
- Line length 100, Python 3.12. Run `uv run ruff format .` before committing.

## Specs & tickets

Specs live in `specs/` (see `specs/README.md`). Reference the Linear ticket ID (e.g. GED-12) in commit messages when one exists.
