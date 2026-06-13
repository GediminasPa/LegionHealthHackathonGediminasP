# LegionHealthHackathonGediminasP

FastAPI + Postgres + a Grok-powered Pydantic AI agent + React frontend, copied from `hackathon-starter` and prepared for local Docker development plus Vercel deployment.

## Stack

| Layer | What |
|---|---|
| API | FastAPI, async SQLAlchemy 2.0, Alembic, pydantic-settings |
| DB | Postgres 16 via `docker-compose.yml` |
| AI | Pydantic AI agent using xAI Grok, streaming SSE chat endpoint, prompts in `prompts/` |
| Frontend | Vite + React + TypeScript + Tailwind, typed API client, streaming chat UI |
| Quality | ruff, pyright, pytest, git hooks, `bin/check`, GitHub Action |

## Quickstart

Prereqs: `uv`, Node from `.nvmrc`, and Docker. OrbStack works as the Docker runtime.

```bash
cp .env.example .env
uv sync
npm --prefix frontend install
docker compose up -d --wait db
uv run alembic upgrade head
git config core.hooksPath .githooks
bin/dev
```

Open `http://localhost:5173`. The health badge should show the API and DB status.

To enable the app's main AI agent, add `GROK_API_KEY` or `XAI_API_KEY` to `.env` and restart `bin/dev`.

## Main Agent

The application uses xAI Grok as its primary agent model through Pydantic AI. The backend builds the model from `.env` per request, so local development and deployed environments both use the same settings:

```bash
GROK_API_KEY=<your-grok-key>
GROK_BASE_URL=https://api.x.ai/v1
AGENT_MODEL=grok:grok-4.3
```

The chat UI streams through `POST /api/agent/chat`. Anthropic remains available only as a fallback by setting `AGENT_MODEL=anthropic:<model>` and `ANTHROPIC_API_KEY`.

## Medication Affordability Workspace

The primary app screen is now the medication affordability investigation workspace. It
starts with intake, includes Medicare Enbrel and commercial accumulator demo cases, creates
a persisted session, and streams typed investigation events into chat, cost tracking,
activity, sources, options, and artifacts.

Core endpoints:

- `GET /api/medication-affordability/demo-cases`
- `POST /api/medication-affordability/sessions`
- `GET /api/medication-affordability/sessions/{session_id}`
- `POST /api/medication-affordability/sessions/{session_id}/messages`
- `POST /api/medication-affordability/sessions/{session_id}/runs`
- `POST /api/medication-affordability/sessions/{session_id}/artifacts`

The v1 run endpoint uses a persisted mocked investigation stream that follows the planned
event contract. The medication-specific Grok/xAI Responses helper and curated resource
registry are in place for the real agent loop.

## Day-to-day

```bash
bin/dev          # Postgres + API on :8000 + frontend on :5173
bin/check        # full quality gate
bin/up           # just Postgres + migrations
bin/db shell     # psql into the DB
bin/db revision "add orders"
bin/db reset
```

## Vercel

This repo includes:

- `api/index.py`, which exposes the existing FastAPI app to Vercel's Python runtime.
- `vercel.json`, which builds the Vite frontend from `frontend/`, serves `frontend/dist`, and routes `/api/*` to FastAPI.

Set these environment variables in Vercel before deploying:

```bash
APP_NAME=LegionHealthHackathonGediminasP
DATABASE_URL=<hosted-postgres-asyncpg-url>
GROK_API_KEY=<optional-until-agent-chat-is-needed>
GROK_BASE_URL=https://api.x.ai/v1
AGENT_MODEL=grok:grok-4.3
```

Use hosted Postgres for Vercel. The local `docker-compose.yml` database is only for development through Docker or OrbStack.

## Project Map

```text
app/
  main.py        # FastAPI app, routers registered here
  config.py      # typed settings from .env / environment
  models/        # SQLAlchemy models
  schemas/       # Pydantic request/response models
  services/      # DB logic
  routers/       # HTTP endpoints
  agents/        # Pydantic AI agent + tools
api/index.py     # Vercel Python entrypoint
prompts/         # agent system prompts
frontend/src/    # React app; api.ts = typed client + SSE streaming
tests/           # pytest against a real Postgres test database
```
