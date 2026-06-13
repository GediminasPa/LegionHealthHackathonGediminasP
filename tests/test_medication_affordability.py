import httpx

from app.agents.medication_affordability import (
    extract_facts_from_pasted_text,
    public_program_copay_guardrail,
)


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
            "plan_name": "Wellcare Value Script PDP",
            "plan_id": "S4802-163-0",
            "diagnosis": "rheumatoid arthritis",
            "pasted_text": None,
        }
    }


async def test_demo_cases_endpoint(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/medication-affordability/demo-cases")

    assert response.status_code == 200
    cases = response.json()
    assert {case["id"] for case in cases} == {
        "medicare-enbrel-wellcare",
        "commercial-enbrel-accumulator",
    }
    assert cases[0]["intake"]["quoted_price_cents"] > 0


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
    assert "event: source_added" in body
    assert "event: cost_tracker_update" in body
    assert "event: artifact_created" in body
    assert "event: run_done" in body

    detail = await client.get(f"/api/medication-affordability/sessions/{session_id}")
    payload = detail.json()
    assert payload["runs"][0]["status"] == "completed"
    assert payload["activities"]
    assert payload["sources"]
    assert payload["artifacts"][0]["status"] == "ready"
    assert payload["case_state"]["state_json"]["options"][0]["id"] == "medicare-payment-plan"


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
