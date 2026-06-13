# Fresh Agent Orientation

## Repo purpose

This repo is a hackathon app scaffold being shaped into a medication affordability routing agent. The current product thesis is a post-prior-authorization prescription price rescue agent: given a drug, quoted pharmacy price, insurance type, PA status, and optional documents, it explains why the medication is expensive and produces the next practical artifact.

The active demo target appears to be Enbrel SureClick on Wellcare Value Script Medicare Part D in California, with PA approved but a roughly $2,100 first-fill quote.

## Current stack

- Backend: FastAPI, async SQLAlchemy 2.0, Alembic, pydantic-settings, Postgres 16 via Docker Compose.
- Agent: Pydantic AI, xAI Grok through OpenAI-compatible provider, Anthropic fallback, streaming SSE endpoint at `POST /api/agent/chat`.
- Frontend: Vite, React 19, TypeScript, Tailwind CSS 4, simple chat UI and typed API helpers.
- Tooling: `uv`, npm, ruff, pyright, pytest, git hooks, `bin/check`.
- Deployment: Vercel Python entrypoint in `api/index.py`, Vite static frontend via `vercel.json`.

## App/frontend structure

- `app/main.py` wires FastAPI routers.
- `app/routers/agent.py` streams chat tokens over SSE.
- `app/agents/assistant.py` builds the model per request and currently exposes only a starter `list_items` tool.
- `prompts/assistant.md` is still a generic placeholder prompt.
- `frontend/src/App.tsx` shows health status and renders `Chat`.
- `frontend/src/Chat.tsx` is a minimal streaming chat surface.
- `frontend/src/api.ts` contains health/items helpers plus SSE parsing for chat.

## Active docs found

- `README.md`: stack, quickstart, Grok setup, Vercel notes, project map.
- `docs/medication-affordability-agent/README.md`: product focus and hackathon promise.
- `docs/medication-affordability-agent/01-product-scope.md`: MVP flow and demo framing.
- `docs/medication-affordability-agent/02-real-demo-case-enbrel-wellcare.md`: concrete demo case.
- `docs/medication-affordability-agent/03-agent-routing-rules.md`: deterministic routing rules.
- `docs/medication-affordability-agent/04-demo-agent-output.md`: sample answer and artifacts.
- `docs/medication-affordability-agent/demo-routing-data.json`: structured seed data.
- `docs/medication-affordability-agent/sources.md`: source links.
- `specs/README.md`: spec workflow.
- Existing reports: `agent-reports/grok-setup.md`, `agent-reports/medication-affordability-agent-led-v2.md`, `agent-reports/medication-affordability-tech-plan.md`.

## Likely next implementation tasks

- Replace the generic assistant prompt with medication-affordability domain instructions and the required output format.
- Add deterministic routing logic around the LLM for Medicare/copay-card blocking, commercial accumulator checks, PA-status branching, and cash-price warnings.
- Load or encode `demo-routing-data.json` as a demo knowledge seed for Enbrel/Wellcare.
- Introduce structured intake fields in the API and/or frontend: drug, price, insurance type, PA status, plan, state, diagnosis, and optional uploaded text.
- Generate copy-ready artifacts from route results: prescriber message, plan call script, appeal/exception request, or assistance checklist.
- Add focused tests for routing rules, especially Medicare Part D blocking manufacturer copay cards and PA-approved cost-sharing diagnosis.
- Upgrade the frontend from a generic chat box to an intake-plus-results workflow suitable for the hackathon demo.

## Questions for the user

- Should the first build target be a deterministic demo flow for Enbrel/Wellcare, or a more general intake/routing engine?
- Should routing results be exposed as a separate structured endpoint, or only through the existing chat stream?
- Do you want document upload/text extraction in scope now, or should uploaded text be pasted manually for the demo?
- Which generated artifact should be the primary wow moment: prescriber message, Wellcare call script, appeal/exception letter, or assistance checklist?
- Are the 2026 Wellcare/Medicare facts in `demo-routing-data.json` the source of truth for the demo?

## Notes

The worktree already had uncommitted changes before this report pass: modified `README.md` and untracked `docs/` plus `agent-reports/`. I did not edit source files, commit, or push.
