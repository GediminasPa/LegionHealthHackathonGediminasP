# hackathon-starter — GitHub template repo for instant project spin-up

## Problem
Before every hackathon and side project, Gediminas rebuilds the same scaffolding from scratch: FastAPI + async SQLAlchemy + Alembic, Postgres in docker-compose, Pydantic settings, Ruff/Pyright config, githooks, `bin/` scripts, `.env.example`, CLAUDE.md, and Anthropic SDK wiring. This burns the first hours of every event on undifferentiated setup instead of the actual idea, and the setup quality varies run to run (a survey of 6 existing repos confirmed these elements recur in 3+ repos each). A GitHub template repo with everything pre-wired — including AI agent plumbing and Claude Code skills — removes that tax permanently.

## Objectives & success metrics
- New project from "Use this template" to fully running locally (API + frontend + Postgres up, `bin/check` green) in **< 10 minutes** on a fresh clone.
- A working AI agent response (streamed to the frontend) within **< 15 minutes** of project creation — the only manual step being pasting `ANTHROPIC_API_KEY` into `.env`.
- (Stretch, built last) A public demo URL via **one command** (`bin/deploy`) — user deprioritized deploy; it is the final, optional ticket.
- Claude Code productive immediately: CLAUDE.md, settings, and project skills present so the first `/spec-builder` → build loop needs zero harness setup.
- Zero per-project edits beyond what `bin/init` automates (project name, env, DB).

## Users & stories
- As a **solo hacker (Gediminas)**, I want a template repo that boots a full stack in minutes so that hackathon time goes to the idea, not the plumbing.
- As a **solo hacker**, I want an agent endpoint with Pydantic AI already routing to Claude so that adding the first AI feature is editing a prompt, not wiring SDKs.
- As a **Claude Code agent working in the new repo**, I want CLAUDE.md, settings, and project skills pre-installed so that I can scaffold endpoints, agent tools, and demo prep without being taught the conventions each time.
- As a **demo presenter**, I want one-command deploy so that judges get a public URL without a deploy scramble.

## Scope
### In scope
- A GitHub **template repository** (`hackathon-starter`) with the full stack pre-wired.
- `bin/init` personalization script (run once after "Use this template").
- Backend: FastAPI + Uvicorn, async SQLAlchemy 2.0, Alembic, Postgres 16 (docker-compose), pydantic-settings.
- AI layer: **Pydantic AI** as the agent/routing layer with the Anthropic provider; streaming chat endpoint; `prompts/` directory; one example tool.
- Frontend: Vite + React + TypeScript, dev proxy to the API, typed API client, agent chat page with streaming.
- Dev tooling: Ruff, Pyright, pytest, `.githooks/` (pre-commit format/lint, pre-push `bin/check`), `bin/` scripts (`init`, `dev`, `up`, `db`, `check`, `deploy`).
- Claude Code setup: CLAUDE.md, `.claude/settings.json`, **project skills for agents** (highest-priority battery), `specs/` directory.
- One-command deploy of the whole app (API serving built frontend) + managed Postgres — **deferred to the end, optional** (user decision 2026-06-10).
- README quickstart.

### Out of scope
- **Auth** — explicitly skipped (user decision); hackathon demos rarely need it and it adds setup friction.
- **CI/CD pipelines beyond one basic GitHub Action** running `bin/check` — hackathon code doesn't need release engineering.
- **Template-update propagation** (syncing improvements from the template into already-created projects) — GitHub templates are copy-once by design; improvements flow forward only.
- **Multi-provider LLM routing / model fallbacks** — Pydantic AI supports it, but the template hard-defaults to Anthropic to stay simple; switching is a one-line provider change.
- **Monorepo tooling** (turborepo, nx), Kubernetes, mobile targets.
- **Next.js** — user chose the FastAPI + Vite split matching existing repos.

## Functional requirements
- **FR-1: Template repo + init script.** Repo is marked as a GitHub template. `bin/init <project-name>` renames the project (pyproject, package.json, docker-compose project name, CLAUDE.md title), creates `.env` from `.env.example`, creates the Python venv and installs deps (uv), installs frontend deps, starts Postgres, runs Alembic migrations, installs githooks (`git config core.hooksPath .githooks`), and prints next steps. Idempotent: safe to re-run.
- **FR-2: Backend skeleton.** FastAPI app with: `/api/health` endpoint; typed settings via pydantic-settings loading `.env`; async SQLAlchemy engine/session dependency; one example model (`Item`) with an Alembic migration; one example CRUD router demonstrating the model→schema→router→service convention.
- **FR-3: AI agent layer (Pydantic AI).** An `agents/` module defining a Pydantic AI agent with the Anthropic provider (model configurable via env, default a current Claude model); system prompt loaded from `prompts/`; one example tool (e.g., DB lookup against `Item`); `POST /api/agent/chat` streaming responses via SSE. With `ANTHROPIC_API_KEY` unset, the endpoint returns a clear 503 with setup instructions rather than a stack trace.
- **FR-4: Frontend skeleton.** Vite + React + TS app: dev server proxies `/api` to the backend; a typed API client; a home page showing backend health; an agent chat page that streams the SSE response token-by-token.
- **FR-5: Dev tooling.** Ruff + Pyright configured in pyproject (line length and Python version matching user's existing convention: 100–120 chars, py312); pytest with async fixtures and at least one passing API test and one agent test (provider mocked); `bin/check` runs ruff + pyright + pytest + frontend typecheck/build; `bin/dev` runs API + frontend + Postgres together; `bin/db` offers shell/reset/migrate helpers; githooks wired as in FR-1.
- **FR-6: Claude Code setup (highest priority).** `CLAUDE.md` documenting stack, conventions, commands, and commit format; `.claude/settings.json` with sensible permissions/hooks; `specs/` directory with a README pointing at the spec-builder → plan → implement loop; **project skills** in `.claude/skills/`: `new-endpoint` (scaffold model+migration+schema+router+test), `new-agent-tool` (add a Pydantic AI tool with test), `demo-prep` (pre-demo checklist: seed data, deploy, smoke-test the public URL).
- **FR-7: One-command deploy.** `bin/deploy` deploys the whole app to the chosen host (single artifact: multi-stage Dockerfile building the frontend and serving the static bundle from FastAPI), provisions/attaches managed Postgres, runs migrations on release, and prints the public URL. First run does interactive host login/app creation; subsequent runs are non-interactive.
- **FR-8: README quickstart.** README covering: create-from-template → `bin/init` → `bin/dev` → open app → paste API key → chat with agent → `bin/deploy`, in that order, each step copy-pasteable.

## Acceptance criteria
- **AC-1a (FR-1):** Given a fresh "Use this template" clone with Docker and uv installed, when I run `bin/init myproject`, then `.env` exists, deps are installed, Postgres is up, migrations are applied, githooks are active, and all project-name references say `myproject`.
- **AC-1b (FR-1):** Given `bin/init` was already run, when I run it again, then it completes without error and without clobbering my edited `.env`.
- **AC-2a (FR-2):** Given the stack is up, when I `GET /api/health`, then I receive 200 with JSON including app name and DB connectivity status.
- **AC-2b (FR-2):** Given the example CRUD router, when I `POST` then `GET` an `Item`, then the round-trip returns the persisted record.
- **AC-3a (FR-3):** Given `ANTHROPIC_API_KEY` is set, when I `POST /api/agent/chat` with a message, then I receive an SSE stream of tokens ending with a done event.
- **AC-3b (FR-3):** Given the agent is asked something requiring the example tool, when the request runs, then the tool is invoked and its result is reflected in the answer (verified in the mocked test).
- **AC-3c (FR-3):** Given `ANTHROPIC_API_KEY` is unset, when I call the chat endpoint, then I get a 503 with a message naming the missing variable.
- **AC-4a (FR-4):** Given `bin/dev` is running, when I open the frontend, then the home page shows backend health as OK via the proxied API.
- **AC-4b (FR-4):** Given the chat page, when I send a message, then tokens render incrementally (not as one final blob).
- **AC-5a (FR-5):** Given a fresh init, when I run `bin/check`, then ruff, pyright, pytest, and the frontend typecheck/build all pass with zero findings.
- **AC-5b (FR-5):** Given a file with a lint violation, when I `git commit`, then the pre-commit hook blocks or fixes it.
- **AC-6a (FR-6):** Given a new project from the template, when Claude Code opens it, then CLAUDE.md and `.claude/settings.json` load and the three project skills appear in the skills list.
- **AC-6b (FR-6):** Given the `new-endpoint` skill, when invoked with an entity name, then it produces model + migration + schema + router + passing test following the FR-2 convention.
- **AC-7a (FR-7):** Given host CLI authenticated, when I run `bin/deploy`, then a public URL is printed and serves both the frontend and `/api/health` with a live DB.
- **AC-8a (FR-8):** Given only the README, when a fresh machine follows it top to bottom, then every command succeeds in order with no undocumented steps.

## Edge cases & failure modes
- **Docker not running:** `bin/init`/`bin/dev` detect and print "start Docker Desktop" instead of a compose stack trace.
- **Port conflicts (5432/8000/5173):** compose and dev scripts use overridable env ports; init detects conflicts and says which env var to change.
- **Missing API key:** covered by AC-3c; frontend chat page also shows a friendly setup hint on 503.
- **Tool/runtime versions:** `.python-version` (3.12) and `.nvmrc` pinned; `bin/init` checks for uv/node/docker and names anything missing.
- **Re-running init / partial init failure:** idempotent steps; a failed step can be re-run without manual cleanup.
- **Deploy with uncommitted migrations:** release command runs `alembic upgrade head`; deploy script warns if local migrations aren't committed.
- **Template drift:** existing projects don't receive template updates — documented as a known limitation in README.

## Technical notes
- Patterns sourced from existing repos (verified): AIAutoResearch (`bin/` scripts `up`/`db`/`api`/`check`, `.githooks/`, backend/frontend split, prompts/ dir), QuantumAutoResearch (Alembic + db-migrate script), Gaussian_LLM_prediction (pytest TDD layout), shared docker-compose `postgres:16-alpine` + healthcheck, `.env.example` with `POSTGRES_*`/`ANTHROPIC_API_KEY`/`DATABASE_URL`, Ruff+Pyright in pyproject.
- Layout: `app/` (main, models, routers, schemas, services, agents), `alembic/`, `frontend/`, `prompts/`, `bin/`, `tests/`, `.claude/skills/`, `.githooks/`, `specs/`.
- Single-artifact deploy: multi-stage Dockerfile (node build stage → copy `frontend/dist` → Python slim stage; FastAPI mounts static files). Avoids two-host coordination (Vercel + API host) at demo time.
- This is a **new repo** — no existing code is modified. The spec file lives here until the repo exists, then moves into it.

## Assumptions
- **Package manager: uv** (answers "pip/requirements.txt or uv?") — existing repos use requirements.txt/pyproject, but uv is the right 2026 default for fast hackathon installs. Easy to swap.
- **Python 3.12** (answers "which Python?") — existing configs target py311; bumping one minor version.
- **Deploy host: Fly.io** (answers "Fly, Railway, or Render?") — single-artifact Docker deploy + managed Postgres + `fly launch` fits the one-command goal. See open question Q1.
- **Frontend styling: Tailwind CSS** (answers "Chakra like AIAutoResearch, or Tailwind?") — chosen for AI-codegen friendliness and hackathon speed; swap to Chakra if preferred.
- **"Skill setups for agents" = Claude Code project skills** in `.claude/skills/` of the template (answers "what did 'skill setups' mean?") — interpreted as the most important battery per user's note; the three skills in FR-6 are the proposed starter set.
- **Repo name: `hackathon-starter`** (answers "what's it called?").

## Open questions
- **Q1 (blocks T7):** Fly.io vs Railway for deploy? Assumed Fly.io; Railway is the alternative if you prefer dashboard-first provisioning.
- **Q2 (shapes T6, non-blocking):** Are `new-endpoint`, `new-agent-tool`, `demo-prep` the right three starter skills, or do you want others (e.g. `seed-data`, `new-page`)? T6 proceeds with these three unless told otherwise.

---

# Tickets

### T1: Scaffold repo with tooling, config, and quality gates
**Depends on:** —
**Covers:** FR-5 (partial), FR-1 (partial)
**Description:** Create the `hackathon-starter` repo skeleton: directory layout, `pyproject.toml` (uv, Ruff, Pyright, pytest config), `.gitignore`, `.env.example`, `.python-version`, `.nvmrc`, `.githooks/` (pre-commit, pre-push), `bin/check` (backend portions), `docker-compose.yml` with Postgres 16 + healthcheck.
**Acceptance criteria:**
- [ ] AC-5a backend portion: ruff + pyright + pytest pass on the empty skeleton.
- [ ] AC-5b: pre-commit hook blocks a lint violation.
**Out of scope for this ticket:** application code, frontend, init script.

### T2: Backend core — FastAPI, settings, DB, example CRUD
**Depends on:** T1
**Covers:** FR-2
**Description:** FastAPI app in `app/`: pydantic-settings, `/api/health` with DB check, async SQLAlchemy session dependency, Alembic setup, `Item` model + first migration, example CRUD router/schema/service, API tests, `bin/db` and `bin/up` helpers.
**Acceptance criteria:**
- [ ] AC-2a: health endpoint reports app + DB status.
- [ ] AC-2b: Item CRUD round-trip persists.
**Out of scope for this ticket:** agent endpoint, frontend.

### T3: Pydantic AI agent layer with streaming endpoint
**Depends on:** T2
**Covers:** FR-3
**Description:** `app/agents/` with a Pydantic AI agent (Anthropic provider, model from env), system prompt in `prompts/`, example DB-lookup tool, `POST /api/agent/chat` SSE endpoint, 503 guard for missing key, mocked-provider tests.
**Acceptance criteria:**
- [ ] AC-3a: SSE token stream with done event.
- [ ] AC-3b: tool invocation verified in mocked test.
- [ ] AC-3c: missing key → 503 naming the variable.
**Out of scope for this ticket:** chat UI, multi-provider routing.

### T4: Frontend — Vite + React + TS with streaming chat UI
**Depends on:** T3
**Covers:** FR-4, FR-5 (frontend checks)
**Description:** `frontend/` Vite app with Tailwind, dev proxy to `/api`, typed API client, health home page, streaming chat page; add frontend typecheck/build to `bin/check`; `bin/dev` runs API + frontend + Postgres together.
**Acceptance criteria:**
- [ ] AC-4a: home page shows backend health OK through the proxy.
- [ ] AC-4b: chat tokens render incrementally.
- [ ] AC-5a: full `bin/check` (now including frontend) passes.
**Out of scope for this ticket:** deploy bundling of the frontend.

### T5: Claude Code setup — CLAUDE.md, settings, project skills
**Depends on:** T4
**Covers:** FR-6
**Description:** Write `CLAUDE.md` (stack, conventions, commands, commit format), `.claude/settings.json`, `specs/README.md`, and three skills in `.claude/skills/`: `new-endpoint`, `new-agent-tool`, `demo-prep`. Skills must reference the real conventions established in T2/T3.
**Acceptance criteria:**
- [ ] AC-6a: skills appear in a fresh Claude Code session in the repo.
- [ ] AC-6b: `new-endpoint` produces a working entity scaffold with passing test.
**Out of scope for this ticket:** global (user-level) skills; only project-local ones.

### T6: One-command deploy *(deferred — final, optional ticket)*
**Depends on:** T8 — *also blocked on Q1 (Fly.io vs Railway)*. Reordered to the end per user decision 2026-06-10; build only when/if wanted.
**Covers:** FR-7
**Description:** Multi-stage Dockerfile (frontend build → static files served by FastAPI), `fly.toml` (or Railway config per Q1), release-phase migrations, `bin/deploy` handling first-run provisioning and subsequent non-interactive deploys.
**Acceptance criteria:**
- [ ] AC-7a: `bin/deploy` prints a public URL serving frontend + `/api/health` with live DB.
**Out of scope for this ticket:** custom domains, CI-triggered deploys.

### T7: Init script and README; mark repo as template
**Depends on:** T5
**Covers:** FR-1, FR-8
**Description:** `bin/init <name>`: version checks (uv/node/docker), project rename across files, `.env` creation, dependency install, Postgres up, migrations, githooks install; idempotent. README quickstart covering template→init→dev→key→chat→deploy. Mark the GitHub repo as a template. One basic GitHub Action running `bin/check`.
**Acceptance criteria:**
- [ ] AC-1a: fresh clone + `bin/init myproject` yields a fully running, renamed project.
- [ ] AC-1b: re-run is safe and preserves `.env`.
- [ ] AC-8a: README is followable end-to-end on a fresh machine.
**Out of scope for this ticket:** template-update propagation to existing projects.

### T8: End-to-end dry run — simulate a hackathon start
**Depends on:** T7
**Covers:** All FRs (validation)
**Description:** From a clean machine state: create a project from the template, time the path to running app (<10 min) and first agent response (<15 min), invoke each Claude Code skill once. (Deploy excluded — T6 is deferred.) Fix any friction found; update README/spec where reality diverged.
**Acceptance criteria:**
- [ ] Both timing objectives from "Objectives & success metrics" are met and recorded.
- [ ] All three skills run successfully in the fresh project.
**Out of scope for this ticket:** new features; this ticket only polishes the path.

> **Dry-run results (2026-06-12):** template copy → `bin/init demo-app` took **8s** (warm caches; fresh-machine time is download-bound but far under the 10-min objective). Health endpoint reported `db: ok`, Item CRUD persisted, agent endpoint correctly returned 503 without a key. Re-running `bin/init` preserved an edited `.env`. Full `bin/check` passed in the fresh project. Not exercised: the three Claude Code skills end-to-end (needs an interactive Claude Code session in a generated project) and a real streamed agent reply (no API key in the test environment) — the streaming path is covered by mocked tests.
