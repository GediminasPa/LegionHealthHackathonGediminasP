# CopayGuard

CopayGuard is a prescription price-transparency and affordability-routing toolkit.
It helps patients understand why a medication is expensive, compare insurance and
cash paths, avoid eligibility traps, and generate the next action when a pharmacy
quote, prior authorization, copay card, or plan rule does not behave the way the
patient expected.

The product is deliberately not positioned as a live PBM price oracle. The exact
insured out-of-pocket price is still usually produced when a pharmacy or real-time
benefit tool adjudicates the claim. CopayGuard sits around that moment and turns
fragmented pricing signals, plan rules, assistance programs, and patient documents
into a practical decision path.

The application is built with FastAPI + Postgres + a Grok-powered Pydantic AI agent
+ React frontend, prepared for local Docker development plus Vercel deployment.

## Price Transparency Toolkit

CopayGuard is meant to work across the three moments where prescription price
surprises happen:

1. **Before fill**: identify whether a drug is likely expensive, specialty-tier,
   prior-authorization blocked, step-therapy constrained, or cheaper as a
   generic, biosimilar, cash-pay, or direct-to-consumer option.
2. **At sticker shock**: explain why the pharmacy quote is high and route the
   patient between insurance, cash/discount pricing, manufacturer copay support,
   patient assistance programs, foundation grants, plan exceptions, or appeals.
3. **After weird coupon behavior**: detect accumulator, maximizer, or alternative
   funding patterns where a copay card lowers today's price but does not count
   toward the deductible or out-of-pocket maximum.

The agent's job is to be eligibility-correct. For example, a commercial patient
may be routed toward a manufacturer copay card only after accumulator/maximizer
risk is checked, while a Medicare patient should be blocked from that route and
sent toward Part D tools, Extra Help screening, foundation grants, payment
smoothing, PAP review, or appeal support.

## Integration Roadmap

Highest-leverage connections for the agent:

1. **Drug identity and public cost basis**: RxNorm/RxNav, openFDA NDC, and NADAC.
   These are the low-friction backbone for normalizing medication names, resolving
   NDCs, and grounding price explanations in a real public acquisition-cost signal.
2. **Formulary and utilization management**: CMS Part D formulary public-use files
   and Da Vinci PDex US Drug Formulary FHIR. Use these to explain tier,
   prior-authorization, step-therapy, and quantity-limit signals where public data
   is available.
3. **Patient-provided documents**: pharmacy receipts, rejection messages, PA
   approvals or denials, EOBs, plan letters, insurance cards, and specialty
   pharmacy screenshots. OCR/document extraction is the fastest path to making the
   agent useful without PBM connectivity.
4. **Curated affordability programs**: manufacturer copay cards, PAPs, foundation
   funds, Medicare Extra Help, Medicare Prescription Payment Plan, Cost Plus Drugs,
   manufacturer direct cash programs, and disease-specific grants. This should
   remain structured data with checked-at timestamps, not freeform model memory.
5. **Accumulator/maximizer detection**: vendor and keyword tables for PrudentRx,
   SaveOnSP, variable copay language, non-essential health benefit language,
   alternative funding vendors, and coupon-adjustment terminology.
6. **Cash and coupon pricing**: GoodRx-style prices, SingleCare/RxSaver-style
   cards, or partner APIs when available. Treat these as alternatives to insurance,
   not stackable benefits, and warn when cash spend may not count toward deductible
   or out-of-pocket progress.
7. **Eligibility and real-time benefit checks**: Stedi or another X12 270/271
   clearinghouse for eligibility, and Surescripts/Arrive/RTPB-style integrations
   only through partnerships. These are the true patient-specific price rails, but
   they are gated and should be mocked or stubbed until access exists.
8. **Execution loops**: appeal letters, exception requests, copay enrollment
   packets, PAP pre-fill, fund-reopen monitoring, refill follow-ups, and reminders
   to ask the pharmacist to run insurance versus a cash discount.

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

Planning docs:

- [Agent architecture](docs/medication-affordability-agent/05-agent-architecture.md)
- [Source registry](docs/medication-affordability-agent/06-source-registry.md)

## Day-to-day

```bash
bin/dev          # Postgres + API on :8000 + frontend on :5173
bin/check        # full quality gate
bin/up           # just Postgres + migrations
bin/db shell     # psql into the DB
bin/db revision "add orders"
bin/db reset
```

## Docker / OrbStack

OrbStack is the local Docker runtime for this project. The default local loop uses it for
Postgres, while FastAPI and Vite run directly on the host for faster reloads:

```bash
bin/dev
```

For a container-style backend deployment path, the repo also includes a backend image and
Compose service:

```bash
docker compose up --build api
```

That starts Postgres, runs Alembic migrations, and serves FastAPI on `http://localhost:8000`.
The Vite frontend is still run separately unless you choose to containerize the frontend too:

```bash
npm --prefix frontend run dev
```

## Vercel

This repo includes:

- `api/index.py`, which exposes the existing FastAPI app to Vercel's Python runtime.
- `vercel.json`, which builds the Vite frontend from `frontend/`, serves `frontend/dist`, and routes `/api/*` to FastAPI.

Set these environment variables in Vercel before deploying:

```bash
APP_NAME=CopayGuard
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
