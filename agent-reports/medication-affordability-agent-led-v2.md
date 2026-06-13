# Medication Affordability Agent Architecture V2

Planning worker: `medplan`  
Date: 2026-06-13  
Status: revised architecture after user feedback. This supersedes the earlier deterministic-routing draft as the plan of record.

## User Direction Captured

The target product is a real working agent, not a deterministic decision tree.

Agreed direction:

- The user starts with a short intake UI containing the most important fields.
- After intake, the app opens an agent workspace.
- Left side: chat-style agent conversation.
- Right side: a live information screen combining case state, evidence, activity feed, recommendations, and generated artifacts.
- The agent must search public resources. A curated resource registry should guide it to useful sources and reduce wasted search/tool calls.
- V1 document input is pasted text, not real file upload.
- Use persisted storage. The existing repo is already wired for Postgres, so the practical plan is to keep Postgres rather than introduce SQLite.
- Add an MCP server/tool surface so the agent or external clients can access medication-affordability sessions, case state, sources, and artifacts.

## Product Shape

### Intake Screen

Collect only fields that materially improve the first agent run:

- Patient first name or display name.
- State.
- Medication name.
- Strength/dose.
- Quoted pharmacy price.
- Insurance type.
- Prior authorization status.
- Plan name and/or plan ID.
- Diagnosis, optional but recommended.
- Pasted pharmacy/plan/PA/EOB text, optional.

Avoid overloading the first screen with household income, household size, detailed pharmacy fields, deductible remaining, or OOP remaining. The agent can ask for those later if relevant.

### Agent Workspace

After submit, create a session and open a two-panel workspace.

Left panel: chat

- Initial agent response starts automatically.
- User can answer follow-up questions.
- User can ask for a letter, call script, checklist, or alternative path.
- Agent messages should be concise but show progress.

Right panel: live case dashboard

- Case summary.
- Active investigation status.
- Activity feed.
- Evidence and sources.
- Working hypothesis.
- Insurance constraints.
- Assistance resources.
- Missing information.
- Recommended next action.
- Generated artifact.

The right panel should update while the agent works, not only at the end.

## Core Architecture

Use a session-based agent runtime.

High-level flow:

1. `POST /api/medication-affordability/sessions`
   - Saves intake.
   - Initializes case state.
   - Returns `session_id`.

2. Frontend navigates to `/medication-affordability/sessions/:id`.

3. `POST /api/medication-affordability/sessions/{id}/runs`
   - Starts an agent run.
   - Streams typed server-sent events.

4. The agent investigates.
   - Reads intake and pasted text.
   - Searches curated and public resources.
   - Calls tools.
   - Updates persisted case state.
   - Streams messages and dashboard patches.

5. User continues in chat.
   - Each user message appends to the session.
   - A new agent run resumes from persisted state.

## Backend Modules

Recommended files:

- `app/models/medication_affordability.py`
- `app/schemas/medication_affordability.py`
- `app/services/medication_affordability_sessions.py`
- `app/services/medication_affordability_search.py`
- `app/services/medication_affordability_resources.py`
- `app/routers/medication_affordability.py`
- `app/agents/medication_affordability.py`
- `prompts/medication_affordability.md`
- `app/data/medication_affordability/resources.json`
- `mcp/medication_affordability_server.py` or `app/mcp/medication_affordability.py`

Keep the generic `app/routers/agent.py` and `frontend/src/Chat.tsx` only if they remain useful for a separate demo. The medication agent should have its own domain endpoints and UI.

## API Design

### REST Endpoints

`POST /api/medication-affordability/sessions`

- Creates a session from intake.
- Persists initial `case_state`.
- Returns `session_id`, initial state, and route URL info.

`GET /api/medication-affordability/sessions/{session_id}`

- Returns session, intake, messages, case state, sources, artifacts, and activity entries.

`POST /api/medication-affordability/sessions/{session_id}/messages`

- Appends a user message.
- Returns the saved message.

`POST /api/medication-affordability/sessions/{session_id}/runs`

- Starts/resumes the agent.
- Streams SSE events.

`POST /api/medication-affordability/sessions/{session_id}/artifacts`

- Requests a specific artifact, such as prescriber message, call script, PAP checklist, appeal letter, or exception request.

`GET /api/medication-affordability/resources`

- Returns curated resource registry entries for debugging/admin display.

### SSE Event Types

Use typed events so the frontend does not parse prose to update the dashboard.

`agent_message`

```json
{
  "message_id": "msg_123",
  "role": "assistant",
  "content": "I am going to verify whether this is a coverage problem or a cost-sharing problem."
}
```

`agent_step`

```json
{
  "title": "Checking Medicare Part D constraints",
  "status": "running"
}
```

`tool_call`

```json
{
  "tool_call_id": "tool_123",
  "name": "search_resources",
  "summary": "Searching curated Medicare and Enbrel assistance resources"
}
```

`tool_result`

```json
{
  "tool_call_id": "tool_123",
  "status": "ok",
  "summary": "Found Medicare Extra Help, Medicare Prescription Payment Plan, and Enbrel support terms."
}
```

`case_state_patch`

```json
{
  "patch": {
    "working_hypothesis": "Covered specialty-tier cost sharing after PA approval",
    "insurance_constraints": [
      "Manufacturer copay card should not be used with Medicare Part D coverage"
    ]
  }
}
```

`source_added`

```json
{
  "title": "Medicare Extra Help",
  "url": "https://www.medicare.gov/basics/costs/help/drug-costs",
  "source_type": "public_web",
  "checked_at": "2026-06-13T00:00:00-07:00"
}
```

`artifact_update`

```json
{
  "artifact_id": "art_123",
  "artifact_type": "prescriber_message",
  "title": "Message to rheumatologist",
  "content": "Subject: Help needed with Enbrel affordability..."
}
```

`question`

```json
{
  "question": "Do you know whether the prescription was processed through Part D or Part B?",
  "field": "benefit_channel"
}
```

`done`

```json
{
  "run_id": "run_123",
  "status": "completed"
}
```

## Database Design

Use Postgres because the repo already has async SQLAlchemy, Alembic, Docker Postgres, and tests wired for Postgres. If "SQLite-like" means lightweight local persistence, Docker Postgres already gives that without adding a second database path.

### Tables

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
- `role`: `user`, `assistant`, `system`, `tool`
- `content`
- `metadata_json`
- `created_at`

`med_affordability_runs`

- `id`
- `session_id`
- `status`: `queued`, `running`, `completed`, `failed`, `cancelled`
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
- `status`: `draft`, `ready`, `superseded`
- `created_at`
- `updated_at`

`med_affordability_resource_registry`

- `id`
- `name`
- `resource_type`
- `url`
- `query_templates_json`
- `applies_to_json`
- `notes`
- `active`
- `created_at`
- `updated_at`

The `case_state_json` can evolve quickly during the hackathon without requiring a migration every time the right panel changes. Keep strongly typed Pydantic schemas at the API boundary so the UI still gets predictable shapes.

## Case State Shape

The right panel should render one structured object.

Suggested top-level fields:

- `summary`
- `active_status`
- `working_hypothesis`
- `medication`
- `insurance`
- `pa_status`
- `quoted_price`
- `detected_plan_facts`
- `insurance_constraints`
- `assistance_options`
- `recommended_next_action`
- `backup_options`
- `missing_information`
- `warnings`
- `sources`
- `current_artifact_id`

The agent should update this object with patches. The UI should apply patches and re-render without losing prior sections.

## Agent Runtime

Use a dedicated Pydantic AI agent for medication affordability.

The agent should:

- Start from intake and pasted text.
- Decide what to investigate next.
- Search public resources.
- Use curated resource registry entries before broad search.
- Summarize evidence into the case dashboard.
- Ask user follow-up questions when key facts are missing.
- Generate artifacts on request or when the next action is clear.
- Persist messages, activities, sources, state patches, and artifacts.

The agent should not:

- Claim it knows the live adjudicated copay.
- Guarantee approval or savings.
- Present manufacturer copay cards as valid secondary payer options for Medicare/Medicaid/federal programs.
- Hide source uncertainty.
- Generate formal appeal language without asking for denial reason and clinical support details when those are missing.

This is not deterministic routing. These are guardrails and product safety constraints around an autonomous agent.

## Agent Tools

Minimum tool set:

`get_session_context(session_id)`

- Loads intake, messages, current case state, sources, and artifacts.

`update_case_state(session_id, patch)`

- Persists a case-state patch.
- Emits `case_state_patch`.

`add_activity(session_id, run_id, event_type, title, summary, payload)`

- Persists activity.
- Emits `agent_step`, `tool_call`, or `tool_result`.

`search_curated_resources(query, context)`

- Searches local resource registry first.
- Returns relevant known sources, query templates, and suggested URLs.

`web_search(query, allowed_domains=None)`

- Searches the public web through a real search provider.
- Requires picking a provider/API key.

`fetch_public_page(url)`

- Fetches source page content where allowed.
- Extracts title, text, and checked timestamp.

`extract_facts_from_pasted_text(text)`

- Extracts plan name, PA status, rejection text, deductible/OOP language, accumulator/maximizer signals, specialty pharmacy terms, and quantity limits.

`save_source(session_id, source)`

- Persists source and emits `source_added`.

`save_artifact(session_id, artifact)`

- Persists artifact and emits `artifact_update`.

`generate_artifact(session_id, artifact_type, instructions)`

- Creates prescriber messages, call scripts, PAP checklists, appeal drafts, or exception requests using known facts and sources.

## Web Search Provider Decision

The production app cannot rely on Codex's internal browser/search tools. It needs an application-level search provider.

Options:

- Tavily or Exa: easiest agent-oriented web search APIs.
- Brave Search API: straightforward web search with independent API key.
- SerpAPI: broader Google-style results, heavier dependency/vendor choice.
- Curated-only fetch: cheapest, but weaker because the user explicitly wants the agent to search resources.

Recommended V1:

- Add a provider abstraction: `SearchProvider`.
- Implement `CuratedResourceProvider` immediately.
- Add one real web search provider behind env vars, likely Tavily/Exa/Brave depending on available keys.
- Let the agent query curated resources first, then broad search if needed.

Environment variables:

- `WEB_SEARCH_PROVIDER`
- `WEB_SEARCH_API_KEY`
- Optional provider-specific base URL.

## Curated Resource Registry

The curated registry is not a deterministic route. It is a search accelerator and source-quality guide.

Initial entries:

- Medicare Part D costs.
- Medicare Prescription Payment Plan.
- Medicare Extra Help.
- Medicare.gov plan/drug cost pages.
- Enbrel support terms.
- Amgen Safety Net Foundation.
- PAN rheumatoid arthritis fund.
- PAN disease fund directory.
- HealthWell AutoImmune Medicare Access fund.
- HealthWell disease fund directory.
- Wellcare formulary/EOC/Summary of Benefits URLs for the demo plan.
- GoodRx or cash-discount context, with clear "may not count toward OOP/deductible" warning.
- KFF or OIG background on copay accumulators/maximizers and federal program coupon constraints.

Each registry row should include:

- Display name.
- URL.
- Domains.
- Tags: `medicare`, `commercial`, `foundation`, `manufacturer`, `formulary`, `cash_discount`, `accumulator`.
- Query templates.
- Notes for agent use.
- Last checked date if manually curated.

## MCP Server

The MCP server should expose medication-affordability session data and curated resources. This gives external agents and tools a controlled way to inspect/update the same state.

Recommended MCP tools:

- `create_medication_session`
- `get_medication_session`
- `list_medication_sessions`
- `append_medication_message`
- `get_case_state`
- `update_case_state`
- `list_sources`
- `save_source`
- `list_artifacts`
- `save_artifact`
- `search_resource_registry`

Recommended MCP resources:

- `medication-affordability://sessions/{session_id}`
- `medication-affordability://sessions/{session_id}/case-state`
- `medication-affordability://sessions/{session_id}/sources`
- `medication-affordability://resource-registry`

Implementation note:

- Keep app persistence in normal FastAPI/SQLAlchemy services.
- Have the MCP server call the same service layer.
- Do not make MCP the only way the FastAPI app accesses its own database.

## Frontend Architecture

Recommended files:

- `frontend/src/MedicationAffordabilityApp.tsx`
- `frontend/src/MedicationIntake.tsx`
- `frontend/src/MedicationWorkspace.tsx`
- `frontend/src/AgentChatPanel.tsx`
- `frontend/src/CaseDashboardPanel.tsx`
- `frontend/src/ActivityFeed.tsx`
- `frontend/src/SourcesPanel.tsx`
- `frontend/src/ArtifactPanel.tsx`
- `frontend/src/api.ts` additions for session, message, and run APIs.

Workspace layout:

- Desktop: two columns.
  - Left: 42-48% width chat panel.
  - Right: 52-58% width case dashboard/activity panel.
- Mobile: tabs for `Chat`, `Case`, `Activity`, `Artifact`.

Right panel sections:

- Case header.
- Current status.
- Working hypothesis.
- Evidence and sources.
- Insurance constraints.
- Assistance options.
- Next action.
- Missing info.
- Draft artifact.

Do not make the first screen a landing page. The first screen should be intake.

## Prompt Design

Create a medication-specific system prompt.

Prompt responsibilities:

- Explain role: medication affordability investigation agent.
- Use tools to investigate; do not answer from memory when current resources are needed.
- Update the case dashboard throughout the investigation.
- Cite public sources for plan/program claims.
- Ask focused follow-up questions when needed.
- Use concise user-facing language.
- Make uncertainty visible.
- Generate practical artifacts.

Guardrail language:

- "You do not have live PBM adjudication access."
- "Do not guarantee exact copay or savings."
- "Do not recommend manufacturer copay cards for Medicare, Medicaid, TRICARE, VA, CHAMPVA, or other federal/state program prescriptions as if they can be used with that coverage."
- "For cash/discount options, explain they may not count toward deductible or out-of-pocket progress."
- "Foundation statuses change; verify and show checked-at timing."

## V1 Implementation Sequence

1. Replace old planning assumptions with this architecture.
2. Add DB models and migration for sessions, intake, messages, runs, activity, case state, sources, artifacts, and resource registry.
3. Add Pydantic schemas for intake, session read, message read/create, SSE events, case state, sources, and artifacts.
4. Add service layer for sessions and event persistence.
5. Add medication router endpoints.
6. Add curated resource registry JSON and seed/loading service.
7. Add dedicated medication Pydantic AI agent with tools.
8. Add first search provider abstraction and one real search provider.
9. Add SSE run loop that streams typed events and persists them.
10. Build intake UI.
11. Build workspace UI with chat left and live dashboard right.
12. Add pasted-text extraction tool.
13. Add MCP server using the same service layer.
14. Test agent runs with mocked model/tool responses.
15. Run full quality gate.

## Tests

Backend:

- Session creation persists intake.
- Message append preserves ordering.
- Run endpoint streams typed events.
- Case-state patch persists and appears in session read.
- Source save/list works.
- Artifact save/list works.
- Resource registry search returns curated resources.
- Pasted text extraction detects basic plan/PA/price/restriction fields.
- Guardrail tests verify Medicare/Medicaid copay-card language is blocked or corrected in final artifact generation.
- Agent tests use mocked models and tools, never real API calls.

Frontend:

- Intake form validates required fields.
- Submit creates session and opens workspace.
- SSE events update chat, activity, case state, sources, and artifact panels.
- User message appends and starts/resumes a run.
- Mobile tabs keep content readable.

MCP:

- MCP tools can read and update a test session.
- MCP resource registry returns active curated resources.
- MCP updates use the same service code as FastAPI.

## Open Decisions

These still need user confirmation:

1. Which web search provider should be used for V1: Tavily, Exa, Brave, SerpAPI, or another key the team already has?
2. For "Postgres but like SQLite or something", should we definitely keep the existing Docker Postgres setup, or do you want a true SQLite mode despite the repo already being Postgres-first?
3. Should the MCP server be implemented inside this repo as a local Python MCP process, or as HTTP endpoints that an MCP wrapper exposes?
4. Should the agent auto-start immediately after intake, or wait for the user to press "Start investigation" on the workspace?
5. Should the first demo still center on Enbrel/Wellcare, or should we build generic medication intake first and let Enbrel be just a seeded example?

