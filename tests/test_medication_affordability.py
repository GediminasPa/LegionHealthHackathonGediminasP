import json
from collections.abc import AsyncIterator

import httpx
from pydantic_ai import models
from pydantic_ai.messages import ModelMessage
from pydantic_ai.models.function import (
    AgentInfo,
    DeltaToolCall,
    DeltaToolCalls,
    FunctionModel,
)

from app.agents.medication_affordability import (
    analyze_case,
    extract_facts_from_pasted_text,
    medication_affordability_agent,
    patient_friendly_question,
    public_program_copay_guardrail,
)
from app.config import get_settings
from app.schemas.medication_affordability import MedicationAffordabilityIntakeCreate

models.ALLOW_MODEL_REQUESTS = False


def _demo_payload() -> dict[str, object]:
    return {
        "intake": {
            "patient_name": "Maria Chen",
            "state": "CA",
            "medication_name": "Enbrel SureClick 50 mg/mL",
            "strength": "50 mg/mL",
            "dose": "weekly",
            "quoted_price_cents": 210000,
            "insurance_type": "Medicare Part D",
            "pa_status": "approved",
            "plan_name": "Medicare Value Script PDP",
            "plan_id": "S4802-163-0",
            "diagnosis": "rheumatoid arthritis",
            "pasted_text": None,
        }
    }


def _guided_enbrel_payload() -> dict[str, object]:
    return {
        "intake": {
            "patient_name": "Maria Chen",
            "state": "CA",
            "medication_name": "Enbrel SureClick 50 mg/mL",
            "strength": "50 mg/mL",
            "dose": "weekly",
            "quoted_price_cents": 210000,
            "insurance_type": "Medicare Part D",
            "pa_status": "approved",
            "plan_name": "Wellcare Value Script PDP",
            "plan_id": "S4802-163-0",
            "diagnosis": "rheumatoid arthritis",
            "pasted_text": (
                "Deductible remaining: $0 remaining\n"
                "Out-of-pocket remaining: about $2,000 remaining toward the yearly Part D cap\n"
                "Quantity / days supply: 4 SureClick pens / 28 days\n"
                "Preferred pharmacy: Wellcare preferred specialty pharmacy\n"
                "Pharmacy claim status: claim already run through Medicare Part D "
                "at the specialty pharmacy\n"
                "Pharmacy quote is $2,100 for Enbrel SureClick after the approved "
                "prior authorization."
            ),
        }
    }


def _commercial_payload() -> dict[str, object]:
    return {
        "intake": {
            "patient_name": "Jordan Lee",
            "state": "CA",
            "medication_name": "Enbrel SureClick",
            "strength": "50 mg/mL",
            "dose": "weekly",
            "quoted_price_cents": 185000,
            "insurance_type": "Commercial",
            "pa_status": "approved",
            "plan_name": "Acme PPO",
            "plan_id": None,
            "diagnosis": "rheumatoid arthritis",
            "pasted_text": (
                "Manufacturer assistance will not count toward your deductible or "
                "out-of-pocket maximum."
            ),
        }
    }


def _ozempic_prefill_payload() -> dict[str, object]:
    return {
        "intake": {
            "patient_name": "Nina Brooks",
            "state": "CA",
            "medication_name": "Ozempic",
            "strength": "0.25 mg or 0.5 mg dose pen",
            "dose": "weekly starter dose",
            "quoted_price_cents": 0,
            "insurance_type": "Commercial",
            "pa_status": "unknown",
            "plan_name": "Commercial PPO pharmacy benefit",
            "plan_id": None,
            "diagnosis": "type 2 diabetes",
            "pasted_text": (
                "Patient is before the first fill. Check prior authorization, step therapy, "
                "quantity limits, savings-card eligibility, NovoCare self-pay pricing, cash "
                "discount checks, and prescriber-reviewed alternatives such as metformin ER, "
                "Jardiance, Farxiga, Trulicity, or Mounjaro."
            ),
        }
    }


async def test_demo_cases_endpoint(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/medication-affordability/demo-cases")

    assert response.status_code == 200
    cases = response.json()
    assert {case["id"] for case in cases} == {
        "before-fill-adderall-options",
        "before-fill-ozempic-alternatives",
        "medicare-enbrel-wellcare",
        "commercial-enbrel-accumulator",
        "zepbound-sticker-shock-route",
    }
    prefill = next(case for case in cases if case["id"] == "before-fill-ozempic-alternatives")
    assert prefill["intake"]["quoted_price_cents"] == 0
    assert prefill["intake"]["medication_name"] == "Ozempic"


async def test_resource_registry_endpoint_includes_review_metadata(
    client: httpx.AsyncClient,
) -> None:
    response = await client.get("/api/medication-affordability/resources")

    assert response.status_code == 200
    resources = response.json()
    ozempic = next(resource for resource in resources if resource["id"] == "ozempic-cost-coverage")
    assert ozempic["status"] == "Curate now"
    assert "self-pay price bands" in ozempic["use"]
    assert ozempic["review_cadence"] == "Monthly and before demos"


async def test_resource_connection_catalog_endpoint(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/medication-affordability/resources")

    assert response.status_code == 200
    resources = response.json()
    resource_ids = {resource["id"] for resource in resources}
    assert {
        "rxnorm-drug-normalization",
        "openfda-ndc-directory",
        "nadac-price-basis",
        "medicare-extra-help",
        "goodrx-specialty-context",
        "stedi-x12-270-271",
        "covermymeds-epa",
    }.issubset(resource_ids)
    assert "xai-grok-agent-model" not in resource_ids
    assert all(resource["category"] != "Agent runtime" for resource in resources)
    assert all(resource["status"] for resource in resources)
    assert all(resource["category"] for resource in resources)


def test_preflight_treats_entered_oop_remaining_as_provided() -> None:
    payload = _demo_payload()["intake"]
    assert isinstance(payload, dict)
    payload["pasted_text"] = "Plan text says Part D out-of-pocket remaining is $2,000."

    analysis = analyze_case(MedicationAffordabilityIntakeCreate.model_validate(payload))

    assert analysis.extracted_facts.has_oop_remaining_signal is True
    assert "current_part_d_oop_progress" not in analysis.missing_facts
    assert "deductible_or_oop_remaining" not in analysis.missing_facts


def test_freeform_oop_progress_answer_counts_as_provided() -> None:
    facts = extract_facts_from_pasted_text("1000 out of 2000 have been met")

    assert facts["has_oop_remaining_signal"] is True


def test_part_d_question_does_not_reconfirm_entered_remaining_amount() -> None:
    question = (
        "Can you confirm the current Part D out-of-pocket progress or remaining "
        "(pasted text shows $2,000 remaining)? Also, has the claim been submitted "
        "to the plan yet?"
    )

    friendly = patient_friendly_question(question, facts={"has_oop_remaining_signal": True})

    assert friendly == (
        "Has the pharmacy already run this prescription through your Medicare Part D plan? "
        "If you are not sure, paste the pharmacy text or plan message."
    )
    assert "$2,000" not in friendly
    assert "confirm the current Part D" not in friendly


async def test_session_create_read_and_message_append(client: httpx.AsyncClient) -> None:
    created = await client.post("/api/medication-affordability/sessions", json=_demo_payload())

    assert created.status_code == 201
    session_id = created.json()["session_id"]

    message = await client.post(
        f"/api/medication-affordability/sessions/{session_id}/messages",
        json={"content": "Can you check foundation help?", "metadata_json": {"source": "test"}},
    )
    assert message.status_code == 201
    assert message.json()["role"] == "user"

    detail = await client.get(f"/api/medication-affordability/sessions/{session_id}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["intake"]["patient_name"] == "Maria Chen"
    assert body["messages"][0]["content"] == "Can you check foundation help?"
    assert body["case_state"]["state_json"]["cost_tracker"]["quoted_price_cents"] == 210000
    assert body["case_state"]["state_json"]["case_moment"] == "sticker_shock"
    assert (
        body["case_state"]["state_json"]["case_analysis"]["insurance_route"]["route_type"]
        == "medicare"
    )
    assert (
        "manufacturer_copay_card_as_secondary_payer"
        in (body["case_state"]["state_json"]["blocked_routes"])
    )


async def test_session_create_allows_missing_patient_name(client: httpx.AsyncClient) -> None:
    payload = _demo_payload()
    intake = payload["intake"]
    assert isinstance(intake, dict)
    intake.pop("patient_name")

    created = await client.post("/api/medication-affordability/sessions", json=payload)

    assert created.status_code == 201
    session_id = created.json()["session_id"]
    detail = await client.get(f"/api/medication-affordability/sessions/{session_id}")
    body = detail.json()
    assert body["intake"]["patient_name"] == ""
    assert body["session"]["title"] == "Enbrel SureClick 50 mg/mL"


async def test_run_stream_emits_typed_events_and_persists_state(
    client: httpx.AsyncClient,
) -> None:
    created = await client.post("/api/medication-affordability/sessions", json=_demo_payload())
    session_id = created.json()["session_id"]

    response = await client.post(
        f"/api/medication-affordability/sessions/{session_id}/runs",
        json={"mode": "mock"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    body = response.text
    assert "event: activity_started" in body
    assert body.count("event: activity_started") >= 4
    assert body.count("event: activity_completed") >= 4
    assert "Reading intake and plan text" in body
    assert "Checking evidence sources" in body
    assert "Ranking coverage and cost routes" in body
    assert "Preparing next-step artifact" in body
    assert "event: source_added" in body
    assert "event: cost_tracker_update" in body
    assert "event: artifact_created" in body
    assert "event: run_done" in body
    assert "Demo best" not in body
    assert "Demo mode" not in body

    detail = await client.get(f"/api/medication-affordability/sessions/{session_id}")
    payload = detail.json()
    assert payload["runs"][0]["status"] == "completed"
    assert payload["activities"]
    assert payload["sources"]
    assert payload["artifacts"][0]["status"] == "ready"
    options = payload["case_state"]["state_json"]["options"]
    assert options[0]["id"] == "medicare-foundation-pap-screen"
    assert {option["id"] for option in options} >= {
        "medicare-foundation-pap-screen",
        "medicare-payment-plan",
    }


async def test_guided_medicare_enbrel_asks_income_then_builds_pbm_packet(
    client: httpx.AsyncClient,
) -> None:
    created = await client.post(
        "/api/medication-affordability/sessions", json=_guided_enbrel_payload()
    )
    session_id = created.json()["session_id"]

    first_run = await client.post(
        f"/api/medication-affordability/sessions/{session_id}/runs",
        json={"mode": "mock"},
    )

    assert first_run.status_code == 200
    assert "event: question" in first_run.text
    assert "approximate annual household income" in first_run.text
    assert "out-of-pocket progress" not in first_run.text

    await client.post(
        f"/api/medication-affordability/sessions/{session_id}/messages",
        json={"content": "about $50,000/year"},
    )
    second_run = await client.post(
        f"/api/medication-affordability/sessions/{session_id}/runs",
        json={"mode": "mock"},
    )

    assert second_run.status_code == 200
    assert "$0 pickup" in second_run.text
    detail = await client.get(f"/api/medication-affordability/sessions/{session_id}")
    payload = detail.json()
    tracker = payload["case_state"]["state_json"]["cost_tracker"]
    assert tracker["current_best_estimated_price_cents"] == 0
    assert tracker["potential_drop_cents"] == 210000
    assert tracker["current_best_label"] == "Foundation/PAP packet: $0 pickup after PBM reprocess"
    assert payload["case_state"]["state_json"]["options"][0]["title"] == (
        "Apply for RA grant / free-drug support"
    )
    assert payload["artifacts"][0]["title"] == "Enbrel PBM cost-reduction packet"
    assert "drops from $2,100 to $0" in payload["artifacts"][0]["content"]


async def test_agent_run_uses_pydantic_ai_tools_and_persists_events(
    client: httpx.AsyncClient,
) -> None:
    created = await client.post("/api/medication-affordability/sessions", json=_demo_payload())
    session_id = created.json()["session_id"]
    await client.post(
        f"/api/medication-affordability/sessions/{session_id}/messages",
        json={"content": "I am not eligible for Extra Help; focus on foundation grants."},
    )

    seen_model_prompts: list[str] = []

    async def stream_agent(
        messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str | DeltaToolCalls]:
        del info
        seen_model_prompts.append(str(messages[0]))
        if len(messages) == 1:
            yield {
                0: DeltaToolCall(name="get_session_context", json_args="{}"),
                1: DeltaToolCall(
                    name="run_case_preflight",
                    json_args="{}",
                ),
                2: DeltaToolCall(
                    name="save_source",
                    json_args=json.dumps(
                        {
                            "title": "PAN Foundation rheumatoid arthritis fund",
                            "url": "https://www.panfoundation.org/disease-funds/rheumatoid-arthritis/",
                            "source_type": "curated_resource",
                            "publisher": "panfoundation.org",
                            "summary": "Fund status changes and must be checked.",
                            "confidence": 0.7,
                        }
                    ),
                ),
                3: DeltaToolCall(
                    name="save_option",
                    json_args=json.dumps(
                        {
                            "id": "foundation-grants",
                            "title": "Foundation grant screening",
                            "summary": "Screen RA foundation funds before assuming affordability.",
                            "confidence": "needs_user_confirmation",
                            "drop_type": "coverage_path",
                            "rank": 1,
                            "source_ids": [1],
                        }
                    ),
                ),
                4: DeltaToolCall(
                    name="update_cost_tracker",
                    json_args=json.dumps(
                        {
                            "current_best_label": "Foundation screening needed",
                            "explanation": "Fund availability and eligibility are unresolved.",
                            "drop_type": "coverage_path",
                            "confidence": "needs_user_confirmation",
                            "source_ids": [1],
                        }
                    ),
                ),
                5: DeltaToolCall(
                    name="ask_question",
                    json_args=json.dumps(
                        {
                            "question": "What is the household size and income range?",
                            "question_id": "income-screen",
                        }
                    ),
                ),
                6: DeltaToolCall(
                    name="save_artifact",
                    json_args=json.dumps(
                        {
                            "artifact_type": "checklist",
                            "title": "Foundation screening checklist",
                            "content": (
                                "Confirm income, household size, diagnosis, and fund status."
                            ),
                            "source_ids": [1],
                        }
                    ),
                ),
            }
        else:
            yield "I will focus on foundation grant screening and avoid assuming Extra Help."

    settings = get_settings()
    original_key = settings.grok_api_key
    settings.grok_api_key = "test-key"
    try:
        with medication_affordability_agent.override(
            model=FunctionModel(stream_function=stream_agent)
        ):
            response = await client.post(
                f"/api/medication-affordability/sessions/{session_id}/runs",
                json={"mode": "agent"},
            )
    finally:
        settings.grok_api_key = original_key

    assert response.status_code == 200
    assert "event: tool_call" in response.text
    assert "run_case_preflight" in response.text
    assert "event: question" in response.text
    assert "event: agent_delta" in response.text
    assert "event: run_done" in response.text
    assert "foundation grants" in seen_model_prompts[0]

    detail = await client.get(f"/api/medication-affordability/sessions/{session_id}")
    payload = detail.json()
    assert payload["runs"][0]["status"] == "completed"
    assert payload["sources"][0]["confidence"] == 0.7
    assert payload["case_state"]["state_json"]["questions"][0]["id"] == "income-screen"
    assert payload["case_state"]["state_json"]["options"][0]["id"] == "foundation-grants"
    assert payload["artifacts"][0]["metadata_json"]["source_ids"] == [1]
    assert payload["messages"][-1]["role"] == "assistant"


async def test_agent_run_without_key_returns_503_instead_of_mock(
    client: httpx.AsyncClient,
) -> None:
    created = await client.post("/api/medication-affordability/sessions", json=_demo_payload())
    session_id = created.json()["session_id"]

    settings = get_settings()
    original_key = settings.grok_api_key
    settings.grok_api_key = ""
    try:
        response = await client.post(
            f"/api/medication-affordability/sessions/{session_id}/runs",
            json={"mode": "agent"},
        )
    finally:
        settings.grok_api_key = original_key

    assert response.status_code == 503
    assert "GROK_API_KEY" in response.json()["detail"]

    detail = await client.get(f"/api/medication-affordability/sessions/{session_id}")
    assert detail.json()["runs"] == []


async def test_agent_stream_error_persists_failed_run(client: httpx.AsyncClient) -> None:
    created = await client.post("/api/medication-affordability/sessions", json=_demo_payload())
    session_id = created.json()["session_id"]

    async def failing_stream(
        messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str | DeltaToolCalls]:
        del messages, info
        raise RuntimeError("model failed")
        yield ""

    settings = get_settings()
    original_key = settings.grok_api_key
    settings.grok_api_key = "test-key"
    try:
        with medication_affordability_agent.override(
            model=FunctionModel(stream_function=failing_stream)
        ):
            response = await client.post(
                f"/api/medication-affordability/sessions/{session_id}/runs",
                json={"mode": "agent"},
            )
    finally:
        settings.grok_api_key = original_key

    assert response.status_code == 200
    assert "event: run_error" in response.text
    assert "model failed" in response.text

    detail = await client.get(f"/api/medication-affordability/sessions/{session_id}")
    run = detail.json()["runs"][0]
    assert run["status"] == "failed"
    assert "model failed" in run["error"]


async def test_mock_commercial_run_does_not_claim_unsupported_savings(
    client: httpx.AsyncClient,
) -> None:
    created = await client.post(
        "/api/medication-affordability/sessions", json=_commercial_payload()
    )
    session_id = created.json()["session_id"]

    response = await client.post(
        f"/api/medication-affordability/sessions/{session_id}/runs",
        json={"mode": "mock"},
    )

    assert response.status_code == 200
    detail = await client.get(f"/api/medication-affordability/sessions/{session_id}")
    tracker = detail.json()["case_state"]["state_json"]["cost_tracker"]
    assert tracker["current_best_estimated_price_cents"] is None
    assert tracker["potential_drop_cents"] is None
    assert tracker["drop_type"] == "unknown"


async def test_ozempic_prefill_mock_run_includes_estimate_bands_and_sources(
    client: httpx.AsyncClient,
) -> None:
    created = await client.post(
        "/api/medication-affordability/sessions", json=_ozempic_prefill_payload()
    )
    session_id = created.json()["session_id"]

    detail = await client.get(f"/api/medication-affordability/sessions/{session_id}")
    state = detail.json()["case_state"]["state_json"]
    assert state["case_moment"] == "before_fill"

    response = await client.post(
        f"/api/medication-affordability/sessions/{session_id}/runs",
        json={"mode": "mock"},
    )

    assert response.status_code == 200
    detail = await client.get(f"/api/medication-affordability/sessions/{session_id}")
    payload = detail.json()
    option = payload["case_state"]["state_json"]["options"][0]
    assert option["id"] == "ozempic-prefill-alternatives-and-estimates"
    assert {estimate["estimated_price_cents"] for estimate in option["price_estimates"]} >= {
        19900,
        34900,
        49900,
    }
    tracker = payload["case_state"]["state_json"]["cost_tracker"]
    assert tracker["current_best_label"] == "Best public estimate: covered commercial savings path"
    assert tracker["current_best_estimated_price_cents"] == 2500
    assert tracker["confidence"] == "found_source"
    assert payload["artifacts"][0]["title"] == "Ozempic pre-fill coverage and price checklist"
    assert {source["publisher"] for source in payload["sources"]} >= {
        "ozempic.com",
        "novocare.com",
        "diabetesjournals.org",
    }


def test_pasted_text_extraction_and_public_program_guardrail() -> None:
    facts = extract_facts_from_pasted_text(
        "Assistance will not count toward your deductible or out-of-pocket maximum. "
        "A variable copay program such as PrudentRx may apply."
    )

    assert facts["has_accumulator_signal"] is True
    assert "assistance_not_counting_to_deductible" in facts["flags"]
    assert "prudentrx" in facts["flags"]
    assert public_program_copay_guardrail("Medicare Part D") is not None
    assert public_program_copay_guardrail("commercial") is None
    assert public_program_copay_guardrail("Cigna ValueScript") is None


def test_case_analysis_classifies_coupon_behavior_and_specialist_plan() -> None:
    intake = MedicationAffordabilityIntakeCreate.model_validate(_commercial_payload()["intake"])
    analysis = analyze_case(intake)

    assert analysis.case_moment == "coupon_behavior"
    assert "assistance_not_counting_to_deductible" in analysis.flags
    assert analysis.insurance_route.route_type == "commercial"
    assert "accumulator_or_maximizer_status" in analysis.missing_facts
    assert any(
        step.specialist == "accumulator_maximizer_detector" for step in analysis.specialist_plan
    )
