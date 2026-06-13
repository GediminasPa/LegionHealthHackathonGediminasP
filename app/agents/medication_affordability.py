from __future__ import annotations

from pathlib import Path
from typing import Any, cast

from pydantic_ai import Agent
from pydantic_ai.capabilities.web_search import WebSearch
from pydantic_ai.models.openai import OpenAIResponsesModel
from pydantic_ai.native_tools import WebSearchTool
from pydantic_ai.providers.openai import OpenAIProvider

from app.config import get_settings
from app.schemas.medication_affordability import MedicationAffordabilityIntakeCreate
from app.services.medication_affordability_resources import search_curated_resources

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"


def load_medication_prompt() -> str:
    return (PROMPTS_DIR / "medication_affordability.md").read_text()


def extract_facts_from_pasted_text(text: str | None) -> dict[str, Any]:
    value = (text or "").lower()
    flags: list[str] = []
    if "will not count toward your deductible" in value or "not count toward deductible" in value:
        flags.append("assistance_not_counting_to_deductible")
    if "out-of-pocket maximum" in value or "out of pocket maximum" in value:
        flags.append("oop_maximum_language")
    if "variable copay" in value:
        flags.append("variable_copay_program")
    if "prudentrx" in value:
        flags.append("prudentrx")
    if "saveonsp" in value:
        flags.append("saveonsp")
    return {"flags": flags, "has_accumulator_signal": bool(flags)}


def public_program_copay_guardrail(insurance_type: str) -> str | None:
    public_terms = ["medicare", "medicaid", "tricare", "va", "champva"]
    if any(term in insurance_type.lower() for term in public_terms):
        return (
            "Do not present manufacturer copay cards as valid for Medicare, Medicaid, "
            "TRICARE, VA, CHAMPVA, or other government-program coverage."
        )
    return None


def build_medication_model() -> OpenAIResponsesModel:
    settings = get_settings()
    return OpenAIResponsesModel(
        settings.agent_model.split(":", 1)[-1],
        provider=OpenAIProvider(api_key=settings.grok_api_key, base_url=settings.grok_base_url),
    )


def build_web_search_capabilities(allowed_domains: list[str] | None = None) -> list[WebSearch]:
    return [
        WebSearch(
            native=WebSearchTool(
                search_context_size=cast(Any, None),
                allowed_domains=allowed_domains,
            )
        )
    ]


medication_affordability_agent: Agent[None, str] = Agent(
    instructions=load_medication_prompt(),
)


def draft_next_artifact(intake: MedicationAffordabilityIntakeCreate) -> dict[str, str]:
    medication = medication_label(intake)
    if "medicare" in intake.insurance_type.lower():
        return {
            "artifact_type": "checklist",
            "title": "Medicare affordability call checklist",
            "content": "\n".join(
                [
                    f"Patient: {intake.patient_name}",
                    f"Medication: {medication}",
                    "",
                    "Ask the plan:",
                    "1. What is the expected cost for the next fill at the preferred pharmacy?",
                    "2. Is the Medicare Prescription Payment Plan available for this member "
                    "and fill?",
                    "3. Are lower-cost formulary alternatives available for the prescriber "
                    "to review?",
                    "",
                    "Screen separately for Extra Help, independent foundation support, "
                    "and PAP eligibility.",
                ]
            ),
        }
    return {
        "artifact_type": "call_script",
        "title": "Accumulator plan-call script",
        "content": "\n".join(
            [
                f"Patient: {intake.patient_name}",
                f"Medication: {medication}",
                "",
                "Ask the plan or PBM:",
                "1. If manufacturer assistance is used, will it count toward the deductible?",
                "2. Will it count toward the out-of-pocket maximum?",
                "3. Is enrollment in PrudentRx, SaveOnSP, or a variable copay program required?",
                "4. What will the true patient responsibility be after assistance is exhausted?",
            ]
        ),
    }


def curated_resource_hints(intake: MedicationAffordabilityIntakeCreate) -> list[dict[str, Any]]:
    tags = ["enbrel"] if "enbrel" in intake.medication_name.lower() else []
    if "medicare" in intake.insurance_type.lower():
        tags.extend(["medicare", "foundation"])
    else:
        tags.extend(["commercial", "accumulator"])
    resources = search_curated_resources(
        f"{intake.medication_name} {intake.insurance_type} {intake.diagnosis or ''}",
        tags=tags,
        limit=8,
    )
    if "medicare" in intake.insurance_type.lower():
        preferred = [
            "medicare-prescription-payment-plan",
            "medicare-extra-help",
            "amgen-safety-net-foundation",
            "pan-foundation-ra",
            "healthwell-autoimmune-medicare",
        ]
    else:
        preferred = [
            "enbrel-support",
            "kff-copay-adjustment-programs",
            "goodrx-specialty-context",
        ]
    order = {resource_id: index for index, resource_id in enumerate(preferred)}
    return sorted(resources, key=lambda resource: order.get(str(resource["id"]), 99))[:4]


def medication_label(intake: MedicationAffordabilityIntakeCreate) -> str:
    if intake.strength and intake.strength.lower() not in intake.medication_name.lower():
        return f"{intake.medication_name} {intake.strength}"
    return intake.medication_name
