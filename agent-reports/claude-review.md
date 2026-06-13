# Claude code review — medication affordability workspace

Reviewer: Claude (Opus 4.7)
Date: 2026-06-13
Worktree branch: `review-claude-implementation`
Plan reviewed against: `agent-reports/medication-affordability-implementation-plan.md`

## TL;DR

`bin/check` passes (10 tests, ruff/pyright clean, frontend tsc+build). The session
backbone, SSE stream skeleton, intake form, and right-panel layout (Milestones 1–3,
parts of Milestone 5/6) are wired end-to-end. **Milestone 4 — "Real Agent Loop" — is not
implemented**: the medication agent, Grok model builder, web-search capability, and HTTP
search client all exist as files but are never invoked by anything in the running code,
and the `/runs` endpoint hard-rejects `mode=agent` with HTTP 400. The mocked
investigation also makes one safety-relevant overstatement (commercial demo claims a
99.7 % potential price drop in the cost tracker) that conflicts with the plan's
"do not guarantee savings" guardrail.

`bin/check` result (run 2026-06-13):
- ruff format + lint: clean
- pyright: 0 errors
- pytest: 10 passed in 0.81s
- frontend tsc + vite build: clean

## Findings (severity-ordered)

### Critical

**1. Real agent loop is not implemented; the agent module is dead code.**
`app/agents/medication_affordability.py:49` defines `build_medication_model()`,
`app/agents/medication_affordability.py:57` defines
`build_web_search_capabilities()`, and `app/agents/medication_affordability.py:68`
defines `medication_affordability_agent` — none of them are referenced anywhere except
their own definitions (verified with `grep -rn "medication_affordability_agent|grok_web_search|build_medication_model|build_web_search_capabilities" app/ tests/`).
The `Agent[None, str]` instance is constructed with `instructions=` only — no model, no
tools, no capabilities. The plan's "Agent Tools" section lists nine `@tool` functions
(`get_session_context`, `add_activity`, `update_case_state`, `update_cost_tracker`,
`search_curated_resources`, `grok_web_search`, `extract_facts_from_pasted_text`,
`save_source`, `save_option`, `save_artifact`) — none are registered on the agent.
`app/routers/medication_affordability.py:72-75` explicitly rejects non-mock runs:

```python
if data.mode != "mock":
    raise HTTPException(status_code=400,
                        detail="Only mocked medication runs are enabled in v1.")
```

Repro:
```
POST /api/medication-affordability/sessions/{id}/runs {"mode":"agent"}
→ 400 {"detail":"Only mocked medication runs are enabled in v1."}
```

Effect: the two seeded demos described in the plan (Medicare Enbrel / Wellcare and
commercial accumulator) run through `run_mock_investigation`
(`app/services/medication_affordability_sessions.py:266`), a deterministic generator
that ignores user chat messages and always emits the same intro line, the same three
curated-resource sources, the same single option, and the same single artifact.
Milestone 4 of the plan is not delivered; the demo is not "agent-led" despite the v2
plan and the commit message ("Implement medication affordability workspace") implying
it is.

### High

**2. Mock cost tracker overstates savings, conflicting with the plan's guardrail.**
`app/services/medication_affordability_sessions.py:375-384`, for the commercial branch,
emits:

```json
{
  "quoted_price_cents": 185000,
  "current_best_estimated_price_cents": 500,
  "potential_drop_cents": 184500,
  "drop_type": "price_reduction",
  "confidence": "needs_user_confirmation"
}
```

The plan explicitly says "Do not guarantee savings" and "For commercial demo… The
right panel shows a warning that the card may lower today's charge but may not build
deductible/OOP credit." The mock invents a $5 best-estimate and a $1,845 potential drop
with no source backing. `CostTracker.tsx:23-25` renders `potential_drop_cents` and
`current_best_estimated_price_cents` as large prominent metrics; the cautionary
`explanation` is in small text below. On the demo screen the visual story is
"save 99.7 %", which is exactly the failure mode the plan warns against. Hard-coded
numeric drops of this size should be removed from the mock (or set to `null` with
`drop_type: "price_reduction"` + an "eligibility unknown" explanation) before the demo
runs.

**3. Stream event contract is partially implemented; frontend has no UI for several
required event types.** The plan (lines 217–238) lists 17 required event types. The
mock emits 9 of them (`activity_started`, `agent_message`, `source_added`,
`option_added`, `cost_tracker_update`, `case_state_patch`, `artifact_created`,
`activity_completed`, `run_done`). Missing entirely from both the mock and the frontend
mapping:

- `agent_delta` — never emitted; frontend has no streaming-token UI.
- `activity_updated` — never emitted; frontend has no in-progress activity UI.
- `tool_call`, `tool_result` — never emitted; frontend ignores.
- `option_updated`, `artifact_updated` — never emitted; frontend ignores.
- `question` — never emitted; **frontend has no UI surface for follow-up questions at
  all**, but the plan calls these out as a primary right-panel interaction
  ("Missing information questions are surfaced").
- `run_error` — never emitted (see finding 9); frontend handler exists but is
  unreachable.

`MedicationWorkspace.applyEvent` (`frontend/src/MedicationWorkspace.tsx:31-118`) silently
drops events whose type doesn't match a hard-coded branch.

**4. `grok_web_search` would not work against the real xAI API even if it were called.**
`app/services/medication_affordability_search.py:53-62` sends:

```python
json={
    "model": settings.agent_model.split(":", 1)[-1],
    "input": [{"role": "user", "content": query}],
    "tools": [{"type": "web_search"}],
    "filters": {"allowed_domains": allowed_domains or []},
}
```

xAI's Responses API does not accept a top-level `filters` field. Per the plan's own
notes (lines 354–355), domain filtering goes on the tool itself, e.g.
`{"type": "web_search", "allowed_domains": [...]}`. The current shape would silently
no-op the allow-list. `_extract_search_results`
(`app/services/medication_affordability_search.py:19-38`) also reads
`output[i]["annotations"]` directly; in the actual xAI Responses payload, annotations
are nested inside content blocks (`output[i].content[j].annotations[k]`), so the
extractor would return an empty list from any real response. Combined with finding 1,
this code path has never been exercised.

### Medium

**5. `assistant-ui` is only used as a runtime provider, not as a "polished chat-style
agent UI".** `frontend/src/AgentChatPanel.tsx:20-95` wires
`useExternalStoreRuntime` + `AssistantRuntimeProvider`, but the visible chat is fully
custom: hand-rolled `<article>` bubbles, a plain `<textarea>` composer, custom
`submit()`. No `<Thread>`, `<Composer>`, `<Message>`, or other assistant-ui primitive is
rendered. The `onNew` callback registered on the runtime is unreachable because nothing
inside the provider posts via assistant-ui's hooks — `submit()` calls `onSend(content)`
directly. Net effect: the dependency is paid for (~30 kB in the bundle) without the
"polished" UI the plan calls for, and the runtime/UI sync the runtime was added for is
implemented twice (once in the runtime, once in the custom JSX), which will drift.

**6. `case_state_patch` event sends the full state instead of a patch.**
`app/services/medication_affordability_sessions.py:393` emits `{"state":
state.state_json}` — the entire merged state, not a delta. The frontend
(`MedicationWorkspace.tsx:107-114`) reads only `state.flags` and ignores everything else
(no options, no cost tracker, no intake_summary, no version). Result: the same data is
delivered via two channels (`cost_tracker_update` + the cost_tracker key inside
`case_state_patch`) with no contract about which is authoritative, and the
`options` array inside the patch is never reconciled against the per-event
`option_added` list the frontend maintains. Rename to `case_state_replace` or send a
real patch (e.g. RFC-6902 operations or a per-field delta) and have the frontend pick
one source of truth.

**7. Run cannot be cancelled, errored, or cleaned up.**
`app/routers/medication_affordability.py:79-86` calls the generator without any
try/except. If `run_mock_investigation` raises mid-stream (DB error, future agent
failure), `MedicationAffordabilityRun.status` stays `"running"`,
`MedicationAffordabilityRun.finished_at` stays `NULL`, `error` stays `NULL`, and no
`run_error` SSE event is emitted — the client just sees the stream close. The frontend
makes this worse: `streamMedicationRun(sessionId)` is called without an `AbortSignal`
(`MedicationWorkspace.tsx:126` and `:154`), and the function signature accepts one
(`api.ts:166`), so closing the tab leaves the server generator running to completion.
Milestone 6's "cancellation / error handling" is not delivered.

**8. Frontend never re-uses the existing session for further investigation.**
`handleSend` (`MedicationWorkspace.tsx:141-155`) appends a user message then calls
`startRun()` again, which POSTs `/runs` and re-runs `run_mock_investigation`. Because
the mock ignores chat messages, the second run regenerates the same intro
(`"I am investigating … for …"`), the same three sources, the same option, and a second
artifact row with the same content. From the user's POV the chat is non-conversational.
This is consistent with "no agent loop" (finding 1), but it should be called out as a
demo-time problem: typing in the chat doesn't change anything.

**9. `MedicationAffordabilityRun.error` is never written and the SSE generator has no
error boundary.** Same as above; mentioned separately because it's a data-integrity
issue. If you want any observability of mock failures during the demo, either wrap
`run_mock_investigation` in a try/except that updates `run.status="failed"`, writes
`run.error`, and yields a `run_error` event, or move that logic into the router around
the `async for`.

**10. Plan-required artifact variety is not delivered.** Milestone 5 lists "prescriber
message, plan call script, PAP checklist, appeal/exception draft." `draft_next_artifact`
(`app/agents/medication_affordability.py:73-111`) returns exactly one of two artifacts
(`checklist` for Medicare, `call_script` for non-Medicare). The POST
`/sessions/{id}/artifacts` endpoint (`app/routers/medication_affordability.py:89-107`)
exists but is never wired from the frontend, so "let the user request additional
artifacts from the chat or artifact panel" (plan, line 474) is not implemented. There
are no tests with mocked model output for artifact generation either — only the
deterministic draft helper is exercised.

**11. Substring matching for the public-program guardrail is fragile.**
`public_program_copay_guardrail`
(`app/agents/medication_affordability.py:39-46`) does `term in insurance_type.lower()`
against `["medicare","medicaid","tricare","va","champva"]`. Insurance values containing
"va" as a substring (e.g. `"Vanguard plan"`, `"private/VA collaboration"`, or even the
literal string `"Cigna ValueScript"` if someone types it) will trigger the guardrail
incorrectly. Use word-boundary matching or a normalized allow-list. Same shape in
`extract_facts_from_pasted_text` (`:23-36`) for the `oop_maximum_language` flag — fires
on neutral mentions, not only on accumulator/maximizer language.

### Low

**12. Module-level disk read at import time.** `medication_affordability_agent` is
constructed at import time with `load_medication_prompt()` reading
`prompts/medication_affordability.md` from disk
(`app/agents/medication_affordability.py:68-70`). If the prompt file is missing or the
process's CWD/PYTHONPATH is unusual, the entire app fails to import. Either lazy-load
the prompt in `build_medication_model()` (which would also let `Agent(...)` get a
model attached) or guard the read.

**13. `confidence: "found_source"` is overstated for curated-registry sources.**
`run_mock_investigation` sets the Medicare option's confidence to `"found_source"`
(`app/services/medication_affordability_sessions.py:351`) after only emitting curated
JSON entries as sources. The plan defines `found_source` as a real, agent-verified
source; the registry is static curated content with a stale `last_checked_at`, so
`eligibility_unknown` or `needs_user_confirmation` is more honest.

**14. `SourcesPanel` doesn't render `checked_at` or `confidence`.**
`frontend/src/SourcesPanel.tsx:10-29` shows title + summary only. Plan Milestone 6 calls
for "source timestamps and confidence labels"; both are persisted server-side
(`app/models/medication_affordability.py:118-120`) and returned in the API but not
displayed.

**15. Each new user message duplicates DB rows.** Each `handleSend` call triggers a
full new mock run; each run inserts a new `MedicationAffordabilityActivity` row for
"Reading intake and plan text" / "Prepared next-step artifact", a new artifact row,
and three new source rows. The frontend uses `upsertById` for
activities/options/sources/artifacts, so the UI dedupes by id, but the DB now has N
copies after N user messages, and `GET /sessions/{id}` will return all of them.

**16. Curated registry is missing the Wellcare-specific resources the plan lists.**
Plan (lines 393–394): "Wellcare Value Script formulary/EOC/Summary of Benefits for
Enbrel demo." `app/data/medication_affordability/resources.json` has generic Medicare
links but no Wellcare Value Script formulary/EOC entry, which is the resource the
Medicare demo most concretely needs.

**17. `_event` helper uses `# type: ignore[arg-type]`.**
`app/services/medication_affordability_sessions.py:255-263` takes `event_type: str` and
passes it to `MedicationAffordabilityStreamEvent(type=event_type, ...)` with a
`# type: ignore`. Tighten the parameter to `StreamEventType` and the ignore disappears.

**18. Quoted price input rounds to whole dollars.**
`frontend/src/MedicationIntake.tsx:122-127` does
`value={Math.round(intake.quotedPriceCents / 100)}` and
`update("quotedPriceCents", Number(value)*100)`. Sub-dollar precision is lost on every
keystroke and the displayed number flickers if the underlying cents value wasn't a
whole dollar. For demo seeds this is fine; for any free-text entry it will surprise
the user.

**19. `bin/up` fails locally on this branch.** The shared dev DB is stamped with
revision `0004`, but only revisions `0001` and `0002` exist on this branch.
`tests/conftest.py` sidesteps Alembic entirely (`Base.metadata.create_all`), so
`bin/check` passes — but a fresh `bin/dev` on this branch will not. Either reset the
dev DB (`bin/db reset`) for demo prep, or note in the runbook. This is an environment
/ branch hygiene issue, not a code defect, but easy to trip over right before a demo.

**20. POST `/sessions/{id}/artifacts` creates an artifact directly in the router.**
`app/routers/medication_affordability.py:89-107` builds and persists
`MedicationAffordabilityArtifact` inline. Move to
`medication_affordability_sessions.create_artifact(...)` to match the rest of the slice
and to keep the router thin (and consistent with the project's documented
"router → service" convention in `CLAUDE.md`).

## Plan-conformance scorecard

| Plan item | Status |
| --- | --- |
| DB models + Alembic migration (M1) | ok |
| Schemas, session/intake/message APIs (M1) | ok |
| Demo cases endpoint (M1) | ok |
| Run table + activity persistence (M2) | ok |
| SSE run endpoint with typed events (M2) | partial — 9 of 17 event types |
| Case state patches + cost tracker update events (M2) | partial — "patch" is a full replace |
| Tests for streamed event format and persistence | minimal |
| Intake screen + demo buttons + workspace layout (M3) | ok |
| `assistant-ui` left chat panel (M3) | partial — runtime only, custom rendering |
| Right panel: cost tracker / activity / sources / options / artifacts (M3) | ok |
| Medication-specific prompt (M4) | file exists; never loaded into a working agent |
| Pydantic AI / Grok agent run path (M4) | not implemented (dead code) |
| State/event tools (M4) | not implemented (no `@agent.tool` registered) |
| Pasted-text extraction (M4) | ok |
| Curated resource registry (M4) | partial — missing Wellcare Value Script resources |
| Grok web search integration (M4) | not implemented (helper exists, unused, wrong shape) |
| Two seeded demos through real agent flow (M4) | not implemented (mock only) |
| Prescriber message / call script / PAP checklist / appeal draft artifacts (M5) | partial — one artifact per run |
| Artifact cards/drawers + copy controls (M5) | ok |
| Tests with mocked model output (M5) | not implemented |
| Source timestamps + confidence labels (M6) | partial — stored, not rendered |
| Cancellation/error handling (M6) | not implemented |
| Mobile tab layout (M6) | ok |
| `bin/check` clean | ok |

## Local verification commands run

- `bin/check` — 10 passed, ruff/pyright/tsc/vite all clean.
- Custom in-process probe via `httpx.ASGITransport` (script run from repo root, test
  DB recreated, all SSE events parsed):
  - Medicare Enbrel intake → SSE emits 11 events in the documented order; persistence
    confirmed (`runs=[completed]`, options `[medicare-payment-plan]`,
    flags include `public_program_copay_card_guardrail`, artifact = `checklist/ready`,
    3 sources).
  - Commercial Enbrel intake → SSE emits 11 events; persisted cost tracker shows
    `current_best_estimated_price_cents=500`, `potential_drop_cents=184500`
    (see finding 2).
  - `POST /runs` with `mode=agent` → 400 (see finding 1).
  - `POST /runs` for missing session → 404.
  - `POST /sessions` with empty `patient_name` / `medication_name` → 422 (validation
    works).
  - Second `POST /runs` on the same session → 11 more events, second artifact row
    written (see finding 15).

## Quick wins (suggested order)

1. Remove the misleading `$5` / `$1,845` numbers from
   `run_mock_investigation`'s commercial branch — set
   `current_best_estimated_price_cents=None` and `potential_drop_cents=None`, keep the
   cautionary `explanation`. This is the most demo-visible safety problem and a
   5-line change.
2. Wrap the SSE generator in `app/routers/medication_affordability.py` in a try/except
   that updates `run.status="failed"` / `run.error=...` and yields a `run_error` event.
3. Either wire `medication_affordability_agent` into `/runs` behind `mode="agent"`
   (with a model attached, a few `@agent.tool` functions, and the existing
   `extract_facts_from_pasted_text` / curated registry helpers) — or delete the dead
   `app/agents/medication_affordability.py`,
   `app/services/medication_affordability_search.py`, and the Grok-specific symbols so
   the codebase stops implying capabilities it doesn't have.
4. Make `case_state_patch` actually patch-shaped (or rename it) and pick one source of
   truth for cost tracker / options between the patch and the per-field events.
5. Pass an `AbortSignal` from `MedicationWorkspace` into `streamMedicationRun` so
   closed tabs stop runs.
6. Render `checked_at` and `confidence` in `SourcesPanel.tsx`.
