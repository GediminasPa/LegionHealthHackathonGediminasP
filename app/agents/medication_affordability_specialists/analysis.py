from __future__ import annotations

from app.agents.medication_affordability_specialists.classifier import classify_case_moment
from app.agents.medication_affordability_specialists.document_extraction import (
    extract_facts_from_pasted_text,
)
from app.agents.medication_affordability_specialists.eligibility_router import (
    public_program_copay_guardrail,
    route_insurance_eligibility,
)
from app.agents.medication_affordability_specialists.types import (
    CaseAnalysis,
    SpecialistName,
    SpecialistPlanStep,
)
from app.schemas.medication_affordability import MedicationAffordabilityIntakeCreate


def analyze_case(intake: MedicationAffordabilityIntakeCreate) -> CaseAnalysis:
    facts = extract_facts_from_pasted_text(intake.pasted_text)
    insurance_route = route_insurance_eligibility(intake.insurance_type)
    case_moment, reasons = classify_case_moment(intake, facts)

    flags = list(facts.flags)
    guardrail = public_program_copay_guardrail(intake.insurance_type)
    if guardrail:
        flags.append("public_program_copay_card_guardrail")

    specialists: list[SpecialistPlanStep] = [
        SpecialistPlanStep(
            specialist="insurance_eligibility_router",
            reason="Every recommendation depends on the insurance route.",
        ),
        SpecialistPlanStep(
            specialist="drug_identity",
            reason="Normalize the medication before comparing programs or formularies.",
        ),
    ]

    if case_moment == "before_fill":
        specialists.extend(
            [
                _step("formulary_um", "Assess likely tier, PA, ST, QL, and specialty routing."),
                _step("public_price_basis", "Ground likely cost with public price signals."),
                _step("assistance_matcher", "Find eligible assistance routes before the fill."),
                _step("cash_coupon_comparator", "Compare cash paths with insurance caveats."),
            ]
        )
    elif case_moment == "sticker_shock":
        specialists.extend(
            [
                _step("intake_document_extraction", "Extract the quote and plan clues.", True),
                _step("assistance_matcher", "Route high-price case to eligible support."),
                _step("cash_coupon_comparator", "Check whether cash is a viable fallback."),
                _step("appeal_artifact_writer", "Prepare the next action artifact."),
            ]
        )
    elif case_moment == "coupon_behavior":
        specialists.extend(
            [
                _step("intake_document_extraction", "Extract coupon and plan language.", True),
                _step("accumulator_maximizer_detector", "Detect whether assistance may not count."),
                _step("appeal_artifact_writer", "Create a plan-call or appeal artifact."),
            ]
        )
    elif case_moment == "denial_or_pa":
        specialists.extend(
            [
                _step(
                    "intake_document_extraction",
                    "Extract denial, PA, or restriction details.",
                    True,
                ),
                _step("formulary_um", "Classify PA, ST, QL, or non-formulary blockers."),
                _step("appeal_artifact_writer", "Draft the appeal or exception artifact."),
            ]
        )
    else:
        specialists.extend(
            [
                _step(
                    "intake_document_extraction",
                    "Gather enough facts to classify the case.",
                    True,
                ),
                _step(
                    "assistance_matcher",
                    "Suggest safe broad routes while preserving uncertainty.",
                ),
            ]
        )

    missing_facts = list(
        dict.fromkeys(insurance_route.missing_facts + _moment_missing_facts(case_moment))
    )
    blocked_routes = list(dict.fromkeys(insurance_route.blocked_routes))
    return CaseAnalysis(
        case_moment=case_moment,
        case_moment_reasons=reasons,
        extracted_facts=facts,
        insurance_route=insurance_route,
        flags=list(dict.fromkeys(flags)),
        blocked_routes=blocked_routes,
        missing_facts=missing_facts,
        specialist_plan=specialists,
    )


def _step(
    specialist: SpecialistName, reason: str, background_ok: bool = False
) -> SpecialistPlanStep:
    return SpecialistPlanStep(
        specialist=specialist,
        reason=reason,
        background_ok=background_ok,
    )


def _moment_missing_facts(case_moment: str) -> list[str]:
    if case_moment == "coupon_behavior":
        return ["does_assistance_count_to_deductible", "does_assistance_count_to_oop_max"]
    if case_moment == "denial_or_pa":
        return ["denial_reason", "appeal_deadline", "prior_therapies"]
    if case_moment == "before_fill":
        return ["preferred_pharmacy", "expected_quantity_days_supply"]
    if case_moment == "sticker_shock":
        return ["pharmacy_claim_status", "preferred_pharmacy", "deductible_or_oop_remaining"]
    return ["insurance_type", "pa_status", "quoted_price_or_expected_fill_timing"]
