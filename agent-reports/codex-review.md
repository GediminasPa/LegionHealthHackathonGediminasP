# Codex Review: Medication Affordability Implementation

## Findings

### High: The shipped run path is mock-only, so the planned agent-led investigation is not implemented

The implementation plan calls for a real agent-led medication affordability workspace using Grok native web search, curated resources first, typed stream updates, and follow-up questions when needed. The shipped API rejects `mode: "agent"` outright and the frontend always requests `mode: "mock"`.

- `app/routers/medication_affordability.py:66` defines the run endpoint.
- `app/routers/medication_affordability.py:72` rejects every non-mock run with `400 Only mocked medication runs are enabled in v1.`
- `frontend/src/api.ts:165` starts medication runs, and `frontend/src/api.ts:172` hard-codes `{"mode":"mock"}`.
- `app/services/medication_affordability_sessions.py:266` through `app/services/medication_affordability_sessions.py:436` is a deterministic mock stream based on intake data and curated resource hints.
- `app/agents/medication_affordability.py:49` through `app/agents/medication_affordability.py:70` defines model/search helpers, but they are not wired into the run endpoint.

Reproduction:

```bash
curl -sS -H 'Content-Type: application/json' \
  -d '{"mode":"agent"}' \
  http://127.0.0.1:8017/api/medication-affordability/sessions/8/runs
```

Observed response:

```json
{"detail":"Only mocked medication runs are enabled in v1."}
```

Impact: the demos can show a scripted event sequence, but they do not perform live investigation, Grok web search, tool use, source discovery, or real uncertainty handling. This is the largest mismatch with the agreed product direction.

### High: Sensitive session data is exposed through unauthenticated sequential session IDs

Medication affordability sessions include patient/display name, medication, diagnosis, plan details, and pasted plan/pharmacy text. All medication affordability endpoints accept only a numeric `session_id`; there is no authentication, authorization, owner token, signed share token, or per-session secret before returning or mutating the session.

- `app/routers/medication_affordability.py:33` creates sessions and returns sequential integer IDs.
- `app/routers/medication_affordability.py:44` returns the full session detail for any `session_id`.
- `app/routers/medication_affordability.py:54`, `app/routers/medication_affordability.py:66`, and `app/routers/medication_affordability.py:89` let callers append messages, start runs, and create artifacts for any known ID.
- `app/schemas/medication_affordability.py:49` through `app/schemas/medication_affordability.py:61` includes patient, diagnosis, insurance, plan, and pasted text fields.
- `app/schemas/medication_affordability.py:181` through `app/schemas/medication_affordability.py:189` returns intake, messages, activities, case state, sources, and artifacts together.

Reproduction:

```bash
curl -sS http://127.0.0.1:8017/api/medication-affordability/sessions/4
```

Observed: the full created demo session is returned without credentials. The same pattern works for adjacent IDs created during testing.

Impact: this is a privacy risk for medication and benefit data, especially because pasted EOB/plan text can contain sensitive details. Before any non-local demo, session access needs an ownership model or unguessable session token at minimum.

### High: Follow-up chat messages are saved but ignored by subsequent runs

The plan says the user can continue chatting and each message resumes the same session and current case state. The frontend does post the message and starts another run, but the backend run ignores saved messages and only rereads the original intake, producing the same canned assistant message and duplicate artifacts/sources.

- `frontend/src/MedicationWorkspace.tsx:141` through `frontend/src/MedicationWorkspace.tsx:154` optimistically adds the user message, posts it, and starts a run.
- `app/services/medication_affordability_sessions.py:269` through `app/services/medication_affordability_sessions.py:272` loads only the intake for the run.
- `app/services/medication_affordability_sessions.py:295` through `app/services/medication_affordability_sessions.py:308` always emits the same intake-based assistant message.
- `app/services/medication_affordability_sessions.py:395` through `app/services/medication_affordability_sessions.py:402` always creates the next artifact from intake type, not the user request.

Reproduction:

1. Create the Medicare demo session.
2. Run the investigation once.
3. Post `I am not eligible for Extra Help; please focus on foundation grants.`
4. Run the investigation again.

Observed persisted readback:

```json
{
  "messages": [
    {"role": "assistant", "content": "I am investigating Enbrel SureClick 50 mg/mL for Maria Chen..."},
    {"role": "user", "content": "I am not eligible for Extra Help; please focus on foundation grants."},
    {"role": "assistant", "content": "I am investigating Enbrel SureClick 50 mg/mL for Maria Chen..."}
  ],
  "runs": 2,
  "sources": 6,
  "artifacts": [
    {"artifact_type": "checklist", "title": "Medicare affordability call checklist"},
    {"artifact_type": "checklist", "title": "Medicare affordability call checklist"}
  ]
}
```

Impact: the chat panel appears interactive but cannot answer the user, refine state, honor corrections, or generate requested artifacts. It also accumulates duplicate sources and artifacts on repeat runs.

### Medium: The artifact request endpoint creates caller-supplied artifacts instead of requesting agent-generated artifacts

The plan defines `POST /api/medication-affordability/sessions/{session_id}/artifacts` as a request for a specific artifact from the agent. The shipped endpoint requires the client to provide the final artifact `title`, `content`, and `status`, then inserts that row directly. The artifact panel also has no regenerate/request controls.

- `app/schemas/medication_affordability.py:160` through `app/schemas/medication_affordability.py:165` requires artifact content from the caller.
- `app/routers/medication_affordability.py:89` through `app/routers/medication_affordability.py:107` directly persists the submitted artifact.
- `frontend/src/ArtifactPanel.tsx:4` through `frontend/src/ArtifactPanel.tsx:35` only lists and copies existing artifacts.

Impact: users cannot request a prescriber message, appeal, exception draft, or PAP checklist from the artifact panel as planned. If exposed beyond trusted local use, arbitrary clients can also write artifact content into any known session because this shares the authorization issue above.

### Medium: Stream and frontend error paths do not persist or surface run failures

The plan includes cancellation/error handling and a `run_error` stream event. The shipped mock run has no try/except around the stream body, does not mark a run failed on exceptions or disconnects, and the frontend `startRun` only clears the local `running` flag in `finally`.

- `app/routers/medication_affordability.py:79` through `app/routers/medication_affordability.py:86` directly streams generator events without translating exceptions into `run_error`.
- `app/services/medication_affordability_sessions.py:273` creates a running row; `app/services/medication_affordability_sessions.py:413` through `app/services/medication_affordability_sessions.py:415` marks it completed only at the end.
- `frontend/src/MedicationWorkspace.tsx:123` through `frontend/src/MedicationWorkspace.tsx:131` does not catch stream errors or set snapshot status to `error`.

Impact: a backend exception, client disconnect, or network failure can leave a run stuck as `running` in persisted state and leave the user without a visible error state. This will become more likely once real model/search calls are wired in.

### Medium: The chat UI wraps assistant-ui runtime but renders a custom inaccessible textarea/list

The plan specifically calls for a polished chat-style agent UI using `assistant-ui` with an external store runtime. The implementation imports `@assistant-ui/react` and creates a runtime, but the visible UI is a hand-rendered message list and form. The textarea also has no visible label or `aria-label`.

- `frontend/src/AgentChatPanel.tsx:1` through `frontend/src/AgentChatPanel.tsx:6` imports assistant-ui runtime primitives.
- `frontend/src/AgentChatPanel.tsx:20` through `frontend/src/AgentChatPanel.tsx:28` creates the runtime.
- `frontend/src/AgentChatPanel.tsx:37` through `frontend/src/AgentChatPanel.tsx:93` renders custom articles, textarea, and button instead of assistant-ui thread/input components.
- `frontend/src/AgentChatPanel.tsx:76` through `frontend/src/AgentChatPanel.tsx:81` renders an unlabeled textarea.

Impact: this misses part of the planned UX and leaves a concrete accessibility issue for screen-reader users.

### Low: Artifact cards drop source references and timestamps

The plan says artifact cards/drawers should include artifact type, source references, and timestamp. The SSE `artifact_created` event includes `source_ids`, but the REST normalization drops source IDs, the artifact type has no timestamp field, and the panel does not render source references or created/updated time.

- `frontend/src/api.ts:314` through `frontend/src/api.ts:321` normalizes REST artifacts with `sourceIds: []`.
- `frontend/src/medicationTypes.ts:74` through `frontend/src/medicationTypes.ts:81` has no created/updated timestamp on `ArtifactRecord`.
- `frontend/src/ArtifactPanel.tsx:10` through `frontend/src/ArtifactPanel.tsx:30` renders title, type/status, copy button, and content only.

Impact: users cannot trace drafted artifacts back to the sources that supposedly support them, and refreshed sessions lose even the event-provided source IDs.

## Open Questions

- The review worktree was on branch `review-codex-implementation`, not a branch named `main`. I treated the checked-out code as the review target.
- Is mock-only medication investigation intentionally the accepted scope for this initial merge, despite the implementation plan's agreed product direction? The README says the v1 run endpoint is mocked, but the plan and user workflow describe the real agent-led product.
- What access model is expected for session data: authenticated app user, unguessable per-session token, or local-demo-only with no external exposure?

## Verification Commands

- `bin/check`
  - `ruff format --check`: passed.
  - `ruff check`: passed.
  - `pyright`: passed.
  - `pytest`: 10 passed.
  - Frontend step failed: `npm --prefix frontend run check` ended with `sh: tsc: command not found` because `frontend/node_modules` was not installed in this worktree.
- `uv run alembic upgrade head`: passed against the local Docker Postgres app database.
- `uv run uvicorn app.main:app --host 127.0.0.1 --port 8017`: app started successfully.
- `curl -sS http://127.0.0.1:8017/api/health`: returned `{"app":"LegionHealthHackathonGediminasP","status":"ok","db":"ok"}`.
- `curl -sS http://127.0.0.1:8017/api/medication-affordability/demo-cases`: returned the two planned demos, `medicare-enbrel-wellcare` and `commercial-enbrel-accumulator`.
- Created and streamed both demo sessions with `POST /sessions` and `POST /sessions/{id}/runs`.
  - Both emitted: `activity_started`, `agent_message`, three `source_added` events, `option_added`, `cost_tracker_update`, `case_state_patch`, `artifact_created`, `activity_completed`, `run_done`.
  - Medicare persisted one run, two activities, three sources, one checklist, and `public_program_copay_card_guardrail`.
  - Commercial persisted one run, two activities, three sources, one call script, and accumulator/maximizer flags.
- `POST /sessions/{id}/runs` with `{"mode":"agent"}` returned HTTP 400 with `Only mocked medication runs are enabled in v1.`
- Follow-up chat reproduction showed saved user messages do not affect the next run; the second run duplicated the same assistant intro, sources, and artifact.

## Residual Risks

- I did not run the React frontend in-browser because the local frontend dependencies were not installed and `bin/check` failed before typecheck/build. The API/demo/SSE flows were exercised with curl.
- Current tests use SQLAlchemy `Base.metadata.create_all` in `tests/conftest.py:36` through `tests/conftest.py:38`, so they do not verify Alembic migration drift.
- There are no frontend tests for intake validation, demo loading, stream parsing, mobile tabs, artifact copy, or accessibility.
- There are no mocked-model tests for the real medication agent loop, guardrail wording in generated responses, Grok web search payloads, or source/citation persistence because the real loop is not wired.
