# Medication Affordability Agent Technical Plan

Planning worker: `medplan`  
Date: 2026-06-13  
Scope: planning only. No source files were edited.

## Source Files Read

Primary product docs:

- `docs/medication-affordability-agent/README.md`
- `docs/medication-affordability-agent/01-product-scope.md`
- `docs/medication-affordability-agent/02-real-demo-case-enbrel-wellcare.md`
- `docs/medication-affordability-agent/03-agent-routing-rules.md`
- `docs/medication-affordability-agent/04-demo-agent-output.md`
- `docs/medication-affordability-agent/demo-routing-data.json`
- `docs/medication-affordability-agent/sources.md`

Existing app and convention files:

- `README.md`
- `CLAUDE.md`
- `pyproject.toml`
- `api/index.py`
- `app/main.py`
- `app/config.py`
- `app/db.py`
- `app/routers/agent.py`
- `app/routers/items.py`
- `app/routers/__init__.py`
- `app/agents/assistant.py`
- `prompts/assistant.md`
- `app/models/item.py`
- `app/models/__init__.py`
- `app/schemas/item.py`
- `app/schemas/__init__.py`
- `app/services/items.py`
- `alembic/versions/0001_create_items.py`
- `tests/conftest.py`
- `tests/test_agent.py`
- `tests/test_items.py`
- `tests/test_health.py`
- `frontend/package.json`
- `frontend/src/api.ts`
- `frontend/src/App.tsx`
- `frontend/src/Chat.tsx`
- `frontend/src/index.css`
- `bin/check`
- `bin/dev`

## Product Goal and User Workflow

Goal: build a post-prior-authorization prescription price rescue agent. The product should help a patient who already has a prescription and was quoted an unaffordable pharmacy price, especially when prior authorization was approved but cost sharing remains high.

The app should not claim to know the live adjudicated copay. It should use patient-provided price, public formularies, public assistance resources, uploaded or pasted plan text, and deterministic eligibility rules to route the patient to the right next move.

Recommended user workflow:

1. Structured intake
   - Drug name, strength/dose, diagnosis, quoted pharmacy price.
   - Insurance type: commercial, Medicare, Medicaid, uninsured, unknown.
   - PA status: approved, denied, pending, unknown.
   - Optional plan name, plan ID, state, deductible/OOP remaining, pharmacy type, household size/income.
   - Optional pasted or uploaded pharmacy/plan/PA/EOB text.

2. Normalize and enrich
   - Normalize known demo drug data for Enbrel SureClick.
   - Lookup seeded formulary row for Wellcare Value Script PDP S4802-163-0.
   - Detect restrictions: PA, step therapy, quantity limit, specialty tier, network specialty pharmacy.
   - Detect accumulator/maximizer language in uploaded commercial plan text.

3. Deterministic route
   - Medicare/Medicaid/federal programs block commercial manufacturer copay-card routing.
   - Commercial plans can consider copay cards, but accumulator/maximizer signals change the warning and artifact.
   - PA status chooses the artifact family: appeal, follow-up, affordability plan, call script, PAP checklist.
   - Cash/discount prices are framed as "instead of insurance" with deductible/OOP warnings.

4. Present answer
   - "What is happening"
   - "What not to do"
   - "Best next step"
   - "Backup options"
   - "Generated artifact"
   - "Questions to confirm"

5. Execute next action
   - Demo should produce a copy-ready prescriber message and/or Wellcare call script for Maria Chen.
   - Later flows can generate appeal letters, coverage exception requests, office follow-up messages, PAP checklists, or plan-call scripts.

## Architecture Fit

The existing project is a compact FastAPI, async SQLAlchemy, Alembic, Pydantic AI, and React/Vite app. The current backend has an example `Item` entity and a generic streaming chat route at `POST /api/agent/chat`. The current frontend is a narrow generic chat UI.

Recommended approach: add medication affordability as a dedicated domain slice instead of burying it inside the generic chat endpoint.

Proposed backend layout:

- `app/models/medication_affordability.py`
- `app/schemas/medication_affordability.py`
- `app/services/medication_affordability.py`
- `app/routers/medication_affordability.py`
- `app/agents/medication_affordability.py` or targeted additions in `app/agents/assistant.py`
- `prompts/medication_affordability.md`
- `app/data/medication-affordability/demo-routing-data.json` or a DB seed equivalent
- `alembic/versions/0002_medication_affordability.py`

Register the router in `app/main.py` and export models/schemas through the existing `__init__.py` files, following the `Item` pattern.

## Data Model and API Changes

Use deterministic typed schemas first, then persist only what the demo needs. Use cents for money fields to avoid float problems.

### Core Enums

- `InsuranceType`: `commercial`, `medicare`, `medicaid`, `tricare`, `va`, `champva`, `uninsured`, `unknown`
- `PriorAuthorizationStatus`: `approved`, `denied`, `pending`, `unknown`
- `RestrictionType`: `prior_authorization`, `step_therapy`, `quantity_limit`, `specialty_pharmacy`, `non_formulary`, `unknown`
- `AssistanceType`: `extra_help`, `foundation`, `manufacturer_pap`, `manufacturer_copay_card`, `medicare_payment_plan`, `cash_discount`, `appeal`, `prescriber_message`, `plan_call`
- `ArtifactType`: `prescriber_message`, `plan_call_script`, `appeal_letter`, `coverage_exception_request`, `office_follow_up`, `pap_checklist`

### Proposed Tables

`medication_cases`

- `id`
- `patient_name`
- `state`
- `drug_name`
- `strength`
- `dose`
- `diagnosis`
- `quoted_price_cents`
- `insurance_type`
- `plan_name`
- `plan_id`
- `pa_status`
- `pharmacy_type`
- `deductible_remaining_cents`
- `oop_remaining_cents`
- `household_income_cents`
- `household_size`
- `uploaded_text`
- `routing_result_json`
- `created_at`
- `updated_at`

`formulary_entries`

- `id`
- `year`
- `state`
- `plan_name`
- `plan_id`
- `drug_brand_name`
- `drug_generic_name`
- `strength`
- `form`
- `tier`
- `tier_name`
- `coinsurance`
- `requires_prior_authorization`
- `requires_step_therapy`
- `quantity_limit`
- `specialty_pharmacy_required`
- `annual_deductible_cents`
- `part_d_oop_threshold_cents`
- `source_url`
- `source_checked_at`

`assistance_resources`

- `id`
- `name`
- `assistance_type`
- `drug_brand_name`
- `drug_generic_name`
- `diagnosis`
- `insurance_type_allowlist`
- `insurance_type_blocklist`
- `url`
- `status`
- `status_checked_at`
- `eligibility_notes`
- `rules_json`

Optional later table: `case_documents` for actual file upload metadata and extracted text. For hackathon speed, pasted text can go directly on `medication_cases.uploaded_text`.

### Pydantic Schemas

- `MedicationCaseCreate`
- `MedicationCaseRead`
- `MedicationAnalyzeRequest`
- `MedicationAnalyzeResponse`
- `MedicationRoutingResult`
- `MedicationDiagnosis`
- `RankedAction`
- `GeneratedArtifact`
- `SourceLink`
- `FormularyFact`
- `AssistanceResourceRead`

`MedicationAnalyzeResponse` should contain structured fields that the frontend can render without parsing prose:

- `case_id`
- `what_is_happening`
- `what_not_to_do`
- `best_next_step`
- `backup_options`
- `generated_artifacts`
- `questions_to_confirm`
- `detected_restrictions`
- `sources`
- `warnings`

### API Endpoints

Minimal MVP:

- `GET /api/medication-affordability/demo-case`
  - Returns the Maria Chen Enbrel/Wellcare demo input seeded from `demo-routing-data.json`.

- `POST /api/medication-affordability/analyze`
  - Accepts `MedicationAnalyzeRequest`.
  - Runs deterministic routing.
  - Optionally calls the Pydantic AI drafting path for the selected artifact.
  - Returns `MedicationAnalyzeResponse`.

- `POST /api/medication-affordability/cases`
  - Persists a case if the team wants recall/history.
  - Returns `MedicationCaseRead`.

- `GET /api/medication-affordability/cases/{case_id}`
  - Fetches prior case and result.

- `POST /api/medication-affordability/cases/{case_id}/artifact`
  - Regenerates a selected artifact type from a stored case and routing result.

Later upload endpoint:

- `POST /api/medication-affordability/extract-document`
  - Accepts `UploadFile`.
  - Extracts text and classifies document type.
  - Requires adding extraction libraries such as `pypdf` and `python-docx` if real PDFs/DOCX files are in scope.

## Agent Tools and Prompt Changes

The central rule from the product docs: deterministic code owns eligibility. The LLM can extract text and draft artifacts, but it must not invent eligibility rules.

Recommended split:

- Service layer applies all routing rules.
- Pydantic AI drafts patient-facing artifacts from structured routing output.
- Agent tools expose lookup/extraction helpers when chat follow-up is needed.

### Deterministic Service Functions

In `app/services/medication_affordability.py`:

- `normalize_medication(input) -> NormalizedMedication`
- `lookup_demo_formulary(plan_id, drug_name) -> FormularyFact | None`
- `lookup_assistance_resources(drug, diagnosis, insurance_type) -> list[AssistanceResource]`
- `detect_accumulator_signals(uploaded_text) -> list[str]`
- `detect_public_insurance_block(insurance_type) -> bool`
- `apply_routing_rules(case, formulary, resources, signals) -> MedicationRoutingResult`
- `select_artifact_type(case, routing_result) -> ArtifactType`

### Agent Tools

If using a dedicated medication agent:

- `lookup_formulary_fact(plan_id: str | None, drug_name: str) -> dict`
- `lookup_assistance_resources(drug_name: str, diagnosis: str | None, insurance_type: str) -> list[dict]`
- `scan_uploaded_text_for_plan_signals(text: str) -> dict`
- `get_routing_result(case: dict) -> dict`
- `draft_medication_artifact(artifact_type: str, case: dict, routing_result: dict) -> str`

The `get_routing_result` tool should call deterministic service code and return the final decision. The agent should not create a new route from scratch.

### Prompt Requirements

Create `prompts/medication_affordability.md` or replace the generic `prompts/assistant.md` if the app is fully repurposed for this demo.

Prompt constraints:

- Always state that the app is not a live PBM/plan adjudication tool.
- Do not claim a guaranteed lower price.
- Do not recommend manufacturer copay cards as secondary payer for Medicare, Medicaid, TRICARE, VA, CHAMPVA, or other government programs.
- For commercial insurance, check accumulator/maximizer terms before making copay card the main recommendation.
- Treat foundation fund status as volatile; include a checked-at timestamp.
- For cash/discount cards, warn that the spend may not count toward deductible or Part D OOP progress.
- Always render the six required sections.
- Ask concrete missing-data questions instead of guessing.
- Keep artifacts copy-ready and practical.

For the Maria Chen demo, the assistant should produce:

- Diagnosis: covered Tier 5 specialty drug with PA and cost sharing.
- Blocked route: Enbrel commercial copay card because Medicare Part D.
- Next routes: Extra Help, RA foundations with current-status caveat, Amgen Safety Net Foundation, Medicare Prescription Payment Plan, prescriber support.
- Artifact: prescriber message and/or Wellcare call script.

## Frontend Views and Components

The current frontend is a generic chat shell. The medication demo needs a structured workflow to make the deterministic route visible.

Recommended component layout:

- `MedicationAffordabilityPage`
  - Owns the workflow state: intake, analyzing, result, artifact selection.

- `MedicationIntakeForm`
  - Drug, dose, diagnosis, quoted price, insurance type, PA status, plan name/ID, state.
  - Optional deductible/OOP, household size/income.
  - Pasted document text area.
  - "Load Maria demo" control backed by `GET /api/medication-affordability/demo-case`.

- `InsuranceTypeSelector`
  - Segmented control or radio group for insurance type.

- `PaStatusSelector`
  - Segmented control for approved, denied, pending, unknown.

- `ResultSummary`
  - Renders "What is happening" and the main explanation.

- `DoNotDoPanel`
  - Prominent safety panel for blocked routes, especially Medicare/copay card.

- `RankedActionsList`
  - Cards or rows for primary and backup actions with eligibility labels.

- `ArtifactPanel`
  - Copy-ready generated artifact with artifact type selector.
  - For demo, support prescriber message and Wellcare call script.

- `SourcesPanel`
  - Shows source title, URL, and checked-at date.

- `QuestionsToConfirm`
  - Structured list of missing fields or clarification questions.

- `FollowUpChat`
  - Optional chat lane seeded with the current case/result, not the primary interface.

Design guidance for this app:

- Use a work-focused operational layout, not a marketing landing page.
- Wider than the current `max-w-2xl` chat shell, probably `max-w-6xl` with a two-column result view on desktop.
- On mobile, stack intake, result, actions, and artifact.
- Avoid making the user parse long chat bubbles for the core answer.
- Use stable form dimensions and keep text compact enough for repeated demo runs.

## Tests

Backend tests should focus on deterministic routing and API contracts. Keep real model calls disabled, following `tests/test_agent.py`.

Unit tests for routing service:

- Medicare Part D blocks manufacturer copay card and recommends Extra Help, foundations/PAP, Medicare Prescription Payment Plan, and prescriber/plan support.
- Medicaid/public program blocks copay card and routes to Medicaid/formulary/appeal support.
- Commercial insurance without accumulator signals can recommend manufacturer copay card when resource exists.
- Commercial insurance with accumulator/maximizer signals warns that assistance may not count toward deductible/OOP and generates a plan-call script.
- PA approved returns affordability/cost-sharing artifact family.
- PA denied returns appeal or coverage determination artifact family.
- PA pending returns office follow-up and missing-information checklist.
- Non-formulary returns formulary exception path.
- Quantity over limit returns quantity-limit exception path.
- Cash/discount route includes deductible/OOP warning.

API tests:

- `GET /api/medication-affordability/demo-case` returns Maria/Enbrel/Wellcare seed data.
- `POST /api/medication-affordability/analyze` with demo input returns 200 and the six required sections.
- Demo response includes no manufacturer copay card recommendation as a Medicare route.
- Demo response includes the Part D OOP threshold caveat and sources.
- Validation rejects missing required fields and invalid enum values.
- Artifact endpoint returns copy-ready text for selected artifact type.

Agent tests:

- Use `assistant.override(model=FunctionModel(...))` or a dedicated medication agent override.
- Assert the agent uses deterministic routing output rather than inventing a recommendation.
- Assert generated artifact text includes relevant patient fields and does not include banned Medicare copay-card advice.
- Keep `models.ALLOW_MODEL_REQUESTS = False`.

Frontend verification:

- `npm --prefix frontend run check`.
- Manual browser pass for desktop and mobile widths.
- Demo run: load Maria case, analyze, confirm blocked copay card route, confirm artifact renders and copy controls work.

Full gate:

- `bin/check` after implementation.

## Migration and Seed Strategy

Migration:

1. Add SQLAlchemy models for cases, formulary entries, and assistance resources.
2. Generate Alembic revision with `bin/db revision "add medication affordability"`.
3. Review generated migration manually.
4. Ensure `app.models.__init__` imports new models so test metadata creation sees them.

Seed:

- Use `docs/medication-affordability-agent/demo-routing-data.json` as the canonical demo fixture.
- Add an idempotent seed service or script rather than baking volatile foundation state deeply into a migration.
- Store source URLs and `source_checked_at` from `sources.md`.
- Keep fund availability statuses as "check now" / "closed as of checked date" / "volatile", not hardcoded permanent truth.

Recommended hackathon seed rows:

- Formulary entry for Enbrel SureClick 50 mg/mL under Wellcare Value Script PDP, CA, S4802-163-0.
- Drug facts: etanercept, RA, weekly dose, WAC proxy from source docs.
- Assistance resources:
  - Medicare Extra Help.
  - Medicare Prescription Payment Plan.
  - PAN rheumatoid arthritis fund with volatile status note.
  - HealthWell AutoImmune Medicare Access fund with checked-date caveat.
  - Amgen Safety Net Foundation.
  - Enbrel commercial copay card with Medicare/Medicaid/federal exclusion.

If time is short, skip persistence for case history and keep formulary/resource seed data as typed constants or JSON loaded by the service. Add database persistence only if the demo needs saved cases.

## Milestones

Milestone 1: deterministic backend foundation

- Define medication schemas/enums.
- Implement routing service from `03-agent-routing-rules.md`.
- Add demo data loader.
- Add unit tests for core rules.

Milestone 2: API demo path

- Add medication affordability router.
- Add demo-case and analyze endpoints.
- Register router in `app/main.py`.
- Add API tests for Maria Chen demo.

Milestone 3: artifact drafting

- Add medication prompt.
- Add constrained Pydantic AI artifact drafting.
- Keep deterministic route precomputed and passed into the model.
- Add mocked model tests.

Milestone 4: structured React workflow

- Replace or augment generic `Chat` with medication intake/result views.
- Add typed API client methods.
- Add "Load Maria demo" and one-click analyze path.
- Render sources, warnings, actions, artifact, and questions separately.

Milestone 5: document text and commercial branch

- Support pasted document text.
- Add accumulator/maximizer detection.
- Demo a commercial accumulator scenario if useful.
- Defer full PDF/DOCX extraction unless required.

Milestone 6: polish and deployment readiness

- Responsive QA.
- Copy-ready artifact UX.
- Source checked-at display.
- `bin/check`.
- Vercel env confirmation for DB and Grok key if deployed.

## Sequencing

Recommended implementation order:

1. Confirm MVP boundaries and artifact choice with the user.
2. Build deterministic service and schema tests first.
3. Add API endpoint around the service.
4. Seed demo data and assert the exact Maria output shape.
5. Add LLM artifact drafting after the deterministic response is stable.
6. Build the frontend around the structured API response.
7. Add upload/pasted-text processing and commercial accumulator branch.
8. Run the full quality gate.

This sequencing keeps the legally sensitive eligibility behavior testable before model output enters the path.

## Risks

- Live-price risk: the app must avoid implying it knows real point-of-sale copay before adjudication.
- Eligibility risk: public-program copay-card restrictions need deterministic enforcement.
- Foundation-status risk: PAN/HealthWell fund availability changes often, so the UI must show checked-at timestamps and "check now" language.
- LLM hallucination risk: model output must be constrained to a precomputed route and source list.
- Medical/legal advice risk: the app should frame actions as affordability/navigation support and encourage prescriber/plan confirmation.
- PII risk: patient names, income, insurance details, and uploaded plan documents need careful handling, especially if deployed.
- Upload scope risk: real PDF extraction needs dependencies and more edge-case testing; pasted text is safer for the first demo.
- Time risk: database persistence, upload extraction, multiple drugs, and multi-artifact generation can compete with the core demo.
- Frontend clarity risk: pure chat hides the product's differentiated routing logic; structured views are important.
- Deployment risk: Vercel needs a hosted Postgres and relevant agent API key; local Docker DB is development-only.

## Open Questions for User

Highest-leverage questions before implementation:

1. Should the first demo be Enbrel/Wellcare only, or should the implementation support a second scenario such as commercial insurance with accumulator language?
2. Which generated artifact should be the hero artifact for the first pass: prescriber message, Wellcare call script, or both?
3. Should cases be persisted in Postgres for the demo, or is a stateless analyze endpoint enough?
4. Should uploads in the MVP be real files, or is pasted document text acceptable for hackathon scope?
5. Do we want the generic chat assistant preserved, replaced, or moved into a follow-up panel underneath the structured affordability result?
6. Should the UI collect household income and household size now for PAP/Extra Help screening, or ask those only after the user chooses that route?
7. What level of source citation is required in the demo UI: visible links on every recommendation, or a compact sources panel?

