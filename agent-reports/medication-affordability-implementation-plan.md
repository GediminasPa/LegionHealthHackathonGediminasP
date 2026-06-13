# Medication Affordability Agent Implementation Plan

Date: 2026-06-13  
Status: agreed implementation plan after architecture discussion  
Scope: build plan only; no source implementation performed by this worker

## Agreed Product Direction

Build a real agent-led medication affordability workspace.

The app starts with a short intake form. The user reviews the intake and presses
`Start Investigation`. The app then opens a two-panel workspace:

- Left panel: polished chat-style agent UI using `assistant-ui`.
- Right panel: custom interactive investigation dashboard.
- Top/right visible cost tracker that reacts when the agent finds possible price drops,
  savings routes, or payment smoothing options.
- Right panel activity tracker showing what the agent is doing.
- Artifact cards/drawers that appear when the agent drafts a prescriber message, call
  script, appeal letter, exception request, or checklist.

The agent is not a deterministic rules engine. It should run its own investigation,
use Grok web search, consult curated resources first, update the UI as it works, and
ask the user follow-up questions when needed.

## Concrete Decisions

- Model/search: use Grok with native web search enabled.
- Search guidance: maintain a curated resource registry to reduce wasted search.
- Database: use existing Docker Postgres, async SQLAlchemy, and Alembic.
- MCP: do not build MCP for v1.
- Documents: pasted text only in v1, no file upload.
- Agent start: user presses `Start Investigation` after intake.
- Left panel: use `assistant-ui`.
- Right panel: custom React components.
- Seeded demos: two demo buttons/cases in the website.
  - Medicare Part D Enbrel/Wellcare.
  - Commercial specialty medication with accumulator/maximizer plan text.

## User Workflow

1. User lands directly on intake, not a marketing page.
2. User chooses either:
   - `Start blank case`
   - `Load Medicare Enbrel demo`
   - `Load Commercial accumulator demo`
3. Intake captures:
   - Patient/display name
   - State
   - Medication name
   - Strength/dose
   - Quoted price
   - Insurance type
   - PA status
   - Plan name and/or plan ID
   - Diagnosis, optional
   - Pasted pharmacy/plan/PA/EOB text, optional
4. User presses `Start Investigation`.
5. Backend creates a session and starts an agent run.
6. Left panel streams chat messages from the agent.
7. Right panel updates via typed stream events:
   - Cost tracker changes
   - Activity events appear
   - Sources are added
   - Options are ranked/refined
   - Artifacts appear when drafted
   - Missing information questions are surfaced
8. User can continue chatting. Each message resumes the same session and current case
   state.

## Backend Implementation

### New Backend Files

Add a dedicated medication affordability domain slice:

- `app/models/medication_affordability.py`
- `app/schemas/medication_affordability.py`
- `app/services/medication_affordability_sessions.py`
- `app/services/medication_affordability_events.py`
- `app/services/medication_affordability_resources.py`
- `app/services/medication_affordability_search.py`
- `app/routers/medication_affordability.py`
- `app/agents/medication_affordability.py`
- `prompts/medication_affordability.md`
- `app/data/medication_affordability/resources.json`
- `app/data/medication_affordability/demo_cases.json`

Register the router in `app/main.py`.

### Database Tables

Use JSON columns for rapidly evolving UI state, but keep messages, sources, artifacts,
and activities queryable as separate rows.

`med_affordability_sessions`

- `id`
- `title`
- `status`
- `created_at`
- `updated_at`

`med_affordability_intakes`

- `id`
- `session_id`
- `patient_name`
- `state`
- `medication_name`
- `strength`
- `dose`
- `quoted_price_cents`
- `insurance_type`
- `pa_status`
- `plan_name`
- `plan_id`
- `diagnosis`
- `pasted_text`
- `created_at`

`med_affordability_messages`

- `id`
- `session_id`
- `role`
- `content`
- `metadata_json`
- `created_at`

`med_affordability_runs`

- `id`
- `session_id`
- `status`
- `started_at`
- `finished_at`
- `error`

`med_affordability_activities`

- `id`
- `session_id`
- `run_id`
- `event_type`
- `title`
- `summary`
- `payload_json`
- `created_at`

`med_affordability_case_states`

- `id`
- `session_id`
- `state_json`
- `version`
- `updated_at`

`med_affordability_sources`

- `id`
- `session_id`
- `title`
- `url`
- `source_type`
- `publisher`
- `checked_at`
- `summary`
- `confidence`
- `created_at`

`med_affordability_artifacts`

- `id`
- `session_id`
- `artifact_type`
- `title`
- `content`
- `status`
- `created_at`
- `updated_at`

The curated resources can be JSON-backed for v1. Only move them to a DB table if we
need an admin/editing surface.

### API Endpoints

`GET /api/medication-affordability/demo-cases`

- Returns the two seeded demo intakes.

`POST /api/medication-affordability/sessions`

- Creates session and intake.
- Initializes empty case state.
- Returns session summary and `session_id`.

`GET /api/medication-affordability/sessions/{session_id}`

- Returns intake, messages, case state, sources, artifacts, and activities.

`POST /api/medication-affordability/sessions/{session_id}/messages`

- Saves a user chat message.
- Does not automatically start a run unless the frontend requests it.

`POST /api/medication-affordability/sessions/{session_id}/runs`

- Starts/resumes the agent investigation.
- Streams typed SSE events.

`POST /api/medication-affordability/sessions/{session_id}/artifacts`

- Requests a specific artifact from the agent.

## Stream Event Contract

The run endpoint should stream typed events. The chat panel and right dashboard should
consume the same stream but react to different event types.

Required event types:

- `agent_message`
- `agent_delta`
- `activity_started`
- `activity_updated`
- `activity_completed`
- `tool_call`
- `tool_result`
- `case_state_patch`
- `cost_tracker_update`
- `source_added`
- `option_added`
- `option_updated`
- `artifact_created`
- `artifact_updated`
- `question`
- `run_done`
- `run_error`

Important UI behavior:

- `agent_message` and `agent_delta` feed the left chat.
- `activity_*`, `tool_*`, `source_added`, and `question` feed the right activity/evidence
  panels.
- `case_state_patch` updates the right dashboard.
- `cost_tracker_update` updates the visible cost tracker immediately.
- `artifact_*` opens or updates the artifact card/drawer.

## Cost Tracker Design

The cost tracker should not only show lower prices. It should distinguish real price
reduction from cash-flow smoothing or eligibility-dependent assistance.

Fields:

- `quoted_price_cents`
- `current_best_label`
- `current_best_estimated_price_cents`
- `potential_drop_cents`
- `drop_type`: `price_reduction`, `cash_flow_smoothing`, `coverage_path`, `unknown`
- `confidence`: `found_source`, `eligibility_unknown`, `needs_user_confirmation`,
  `user_confirmed`
- `explanation`
- `source_ids`

Examples:

- Manufacturer PAP: potential price may be `$0`, confidence `eligibility_unknown`.
- Foundation grant: potential drop depends on open fund and eligibility.
- Medicare Prescription Payment Plan: `drop_type` is `cash_flow_smoothing`, because total
  cost may not decrease.
- Cash coupon: show warning that it may not count toward deductible/OOP progress.

## Agent Implementation

### Agent Responsibilities

The agent should:

- Read intake and pasted text.
- Decide what to investigate.
- Search curated resources first.
- Use Grok web search for current public resources.
- Update the cost tracker when a potential route is found.
- Add sources with URLs and timestamps.
- Add activity events as it works.
- Ask follow-up questions for missing facts.
- Generate artifacts when useful or requested.
- Preserve uncertainty and avoid claiming exact adjudicated copays.

### Guardrails

Guardrails should constrain unsafe output without turning the product into a deterministic
rules engine.

- Do not claim live PBM adjudication access.
- Do not guarantee savings.
- Do not present manufacturer copay cards as valid with Medicare, Medicaid, TRICARE, VA,
  CHAMPVA, or other government-program coverage.
- For cash/discount routes, warn that spending may not count toward deductible or OOP
  progress.
- For foundation grants, show that status changes and include checked-at timing.
- For formal appeals, ask for denial reason and prescriber/clinical details if missing.

### Agent Tools

Implement tools around persisted state and search:

- `get_session_context(session_id)`
- `add_activity(session_id, run_id, event)`
- `update_case_state(session_id, patch)`
- `update_cost_tracker(session_id, update)`
- `search_curated_resources(query, tags)`
- `grok_web_search(query, preferred_domains)`
- `extract_facts_from_pasted_text(text)`
- `save_source(session_id, source)`
- `save_option(session_id, option)`
- `save_artifact(session_id, artifact)`

### Grok Web Search Integration

Use xAI/Grok native web search for v1.

Resolved implementation choice:

- Prefer Pydantic AI `OpenAIResponsesModel` pointed at `https://api.x.ai/v1` with
  `WebSearch`/`WebSearchTool` support.
- Keep the current generic chat path on `OpenAIChatModel` if desired, but use a medication
  agent model builder for search-enabled runs.
- If the Pydantic AI Responses path has citation/streaming gaps, call xAI's Responses API
  directly for medication investigation runs.
- Do not add the heavier `pydantic-ai-slim[xai]`/`xai-sdk` dependency for v1 unless the
  OpenAI-compatible Responses path fails.
- Verified locally with the `.env` Grok key:
  - Direct xAI Responses streaming emits events including `response.web_search_call.*`,
    `response.output_text.delta`, `response.output_text.annotation.added`, and
    `response.completed`.
  - Pydantic AI `OpenAIResponsesModel` works with xAI web search when `WebSearchTool` is
    constructed with `search_context_size=None`; the default `search_context_size` payload
    is rejected by xAI.

xAI's current docs show web search on the Responses API via:

```json
{
  "model": "grok-4.3",
  "input": [{"role": "user", "content": "..."}],
  "tools": [{"type": "web_search"}]
}
```

They also support domain filtering through `allowed_domains`/`excluded_domains`, which maps
well to our curated resource registry.

Implementation note:

```python
from pydantic_ai.capabilities.web_search import WebSearch
from pydantic_ai.native_tools import WebSearchTool

capabilities = [
    WebSearch(
        native=WebSearchTool(
            search_context_size=None,
            allowed_domains=["medicare.gov"],
        )
    )
]
```

Do not add Tavily, Exa, Brave, or SerpAPI unless Grok native search is blocked.

## Curated Resource Registry

The registry guides search. It is not the source of truth and not a deterministic router.

Each resource entry:

- `id`
- `name`
- `url`
- `domains`
- `tags`
- `query_templates`
- `notes_for_agent`
- `last_checked_at`

Initial resources:

- Medicare Part D costs.
- Medicare Prescription Payment Plan.
- Medicare Extra Help.
- Wellcare Value Script formulary/EOC/Summary of Benefits for Enbrel demo.
- Enbrel support terms.
- Amgen Safety Net Foundation.
- PAN rheumatoid arthritis fund and disease fund directory.
- HealthWell AutoImmune Medicare Access fund and disease fund directory.
- GoodRx/cash discount context.
- KFF/OIG background on copay accumulators/maximizers and public-program coupon constraints.

## Frontend Implementation

### Dependencies

Add `assistant-ui` for the left chat panel:

- `@assistant-ui/react`

Use `assistant-ui`'s custom-backend support rather than adopting a full Next.js/Vercel AI
SDK stack. Because this app owns persisted messages and dashboard state in Postgres,
the best v1 fit is:

- `ExternalStoreRuntime` for the chat panel.
- Our own React state/store as the source of truth for messages.
- `onNew` posts the user message, starts a backend run, parses the SSE stream, appends
  assistant deltas, and applies right-panel events.

`LocalRuntime` is also viable, but `ExternalStoreRuntime` fits better because the app already
needs to coordinate chat messages with case-state patches, activity events, cost tracker
updates, and artifacts from the same stream.

### New Frontend Files

- `frontend/src/MedicationAffordabilityApp.tsx`
- `frontend/src/MedicationIntake.tsx`
- `frontend/src/MedicationWorkspace.tsx`
- `frontend/src/AgentChatPanel.tsx`
- `frontend/src/CostTracker.tsx`
- `frontend/src/ActivityFeed.tsx`
- `frontend/src/CaseDashboard.tsx`
- `frontend/src/OptionsBoard.tsx`
- `frontend/src/SourcesPanel.tsx`
- `frontend/src/ArtifactPanel.tsx`
- `frontend/src/medicationTypes.ts`

Update `frontend/src/api.ts` with medication session and run APIs.

### Layout

Desktop:

- App shell fills viewport.
- Intake screen centered but work-focused.
- Workspace uses two columns:
  - Left chat: around 42-46%.
  - Right dashboard: around 54-58%.
- Cost tracker stays visible at the top of the right panel.
- Activity feed and artifact sections can scroll below it.

Mobile:

- Use tabs: `Chat`, `Case`, `Activity`, `Artifact`.
- Cost tracker should remain visible in the `Case` tab and summarized in the header.

### Right Panel Sections

Top persistent section:

- `CostTracker`

Below:

- `ActivityFeed`
- `CaseDashboard`
- `OptionsBoard`
- `SourcesPanel`
- `ArtifactPanel`

Artifact behavior:

- Auto-generate one best next artifact during the investigation when the agent has enough
  information.
- Let the user request additional artifacts from the chat or artifact panel.
- When an artifact is created, show a visible card/drawer.
- Include copy button.
- Include artifact type, source references, and timestamp.
- Allow regenerate/request-next-artifact later.

## Seeded Demos

### Demo 1: Medicare Enbrel/Wellcare

Purpose:

- Shows "PA approved but still expensive".
- Shows Medicare Part D/cost-sharing investigation.
- Shows invalid manufacturer copay-card path being avoided.
- Shows Extra Help, foundation, PAP, and Medicare Prescription Payment Plan options.

Seed fields:

- Patient: Maria Chen
- State: CA
- Drug: Enbrel SureClick 50 mg/mL
- Dose: weekly
- Quoted price: `$2,100`
- Insurance: Medicare Part D
- Plan: Wellcare Value Script PDP, S4802-163-0
- PA status: approved
- Diagnosis: rheumatoid arthritis

### Demo 2: Commercial Accumulator/Maximizer

Purpose:

- Uses the same medication as Demo 1 to highlight that insurance context changes the
  correct affordability path.
- Shows commercial copay card investigation.
- Shows pasted plan text extraction.
- Shows accumulator/maximizer warning.
- Shows agent generating a plan-call script.

Seed fields:

- Patient: Jordan Lee
- State: CA
- Drug: Enbrel SureClick 50 mg/mL
- Dose: weekly
- Diagnosis: rheumatoid arthritis
- Insurance: commercial
- Plan: employer-sponsored PPO with specialty pharmacy benefit
- PA status: approved
- Quoted price: `$1,850`
- Pasted text includes terms like:
  - "copay assistance will not count toward your deductible"
  - "will not apply to your out-of-pocket maximum"
  - "variable copay"
  - "PrudentRx" or "SaveOnSP"

Expected demo behavior:

- The cost tracker initially shows the pharmacy quote.
- The agent finds Enbrel commercial support/copay resources.
- The pasted plan text triggers accumulator/maximizer concern.
- The agent avoids a simplistic "just use the copay card" answer.
- The right panel shows a warning that the card may lower today's charge but may not build
  deductible/OOP credit.
- The auto-generated artifact is a plan/PBM call script asking whether manufacturer
  assistance counts toward deductible and OOP maximum, whether a specialty copay program
  is required, and what the true patient responsibility will be.

## Milestones

### Milestone 1: Session Backbone

- Add DB models and Alembic migration.
- Add schemas.
- Add session create/read APIs.
- Add message persistence.
- Add demo cases endpoint.
- Tests for session creation and readback.

### Milestone 2: Event Stream and Right-Panel State

- Add run table and activity/event persistence.
- Add SSE run endpoint with mocked event generation.
- Add case state patches.
- Add cost tracker update event.
- Tests for streamed event format and persistence.

### Milestone 3: Frontend Shell

- Build intake screen.
- Add demo buttons.
- Build workspace layout.
- Add assistant-ui left chat panel.
- Add custom right panel with cost tracker, activity feed, sources, options, artifacts.
- Wire mocked SSE events end to end.

### Milestone 4: Real Agent Loop

- Add medication-specific prompt.
- Add Pydantic AI/Grok agent.
- Add state/event tools.
- Add pasted-text extraction.
- Add curated resource registry.
- Integrate Grok web search.
- Run the two seeded demos through real agent flow.

### Milestone 5: Artifact Generation

- Generate prescriber message, plan call script, PAP checklist, appeal/exception draft.
- Show artifact cards/drawers in right panel.
- Add copy controls.
- Add tests with mocked model output.

### Milestone 6: Polish and Demo Hardening

- Improve right-panel visual hierarchy.
- Add loading/working states.
- Add cancellation/error handling.
- Add source timestamps and confidence labels.
- Verify mobile layout.
- Run `bin/check`.

## Test Plan

Backend:

- Session create/read.
- Demo cases endpoint.
- Message append.
- Run SSE emits typed events.
- Activity persistence.
- Case state patch persistence.
- Cost tracker update persistence.
- Source/artifact persistence.
- Pasted text extraction for accumulator signals.
- Guardrail tests for public-program copay-card language.
- Agent tests with mocked model/tool calls; no real API calls in tests.

Frontend:

- Intake validation.
- Demo case loading.
- Start Investigation creates session and starts stream.
- Chat panel renders agent messages.
- Cost tracker updates from stream.
- Activity feed updates from stream.
- Artifact appears from stream and copy button works.
- Mobile tab layout remains usable.

Manual demo QA:

- Medicare demo produces a visible cost tracker and correct Medicare-cautious language.
- Commercial demo detects accumulator/maximizer text and generates a plan-call script.
- Right panel visibly changes while the agent works.

## Open Items Before Coding

Resolved:

1. Commercial demo medication: Enbrel SureClick 50 mg/mL, reused from the Medicare demo.
2. `assistant-ui` integration: use `ExternalStoreRuntime` with a small SSE adapter owned by
   the app.
3. Grok web search: use xAI Responses API semantics through Pydantic AI
   `OpenAIResponsesModel` first; direct xAI Responses API fallback if needed.
4. Artifact behavior: auto-generate one best next artifact, then let the user request more.

Remaining coding spike:

- None for planning. During implementation, preserve a small integration test/manual script
  for Grok web-search streaming because provider event shapes can change.
