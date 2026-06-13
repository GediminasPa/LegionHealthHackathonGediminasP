from __future__ import annotations

import re

from app.agents.medication_affordability_specialists.types import InsuranceEligibilityRoute

PUBLIC_PROGRAM_COPAY_CARD_GUARDRAIL = (
    "Do not present manufacturer copay cards as valid for Medicare, Medicaid, "
    "TRICARE, VA, CHAMPVA, or other government-program coverage."
)

PUBLIC_PROGRAM_PATTERN = re.compile(r"\b(medicare|medicaid|tricare|va|champva)\b", re.IGNORECASE)


def public_program_copay_guardrail(insurance_type: str) -> str | None:
    if PUBLIC_PROGRAM_PATTERN.search(insurance_type):
        return PUBLIC_PROGRAM_COPAY_CARD_GUARDRAIL
    return None


def route_insurance_eligibility(insurance_type: str) -> InsuranceEligibilityRoute:
    normalized = insurance_type.lower()
    if "medicare" in normalized:
        return InsuranceEligibilityRoute(
            route_type="medicare",
            blocked_routes=["manufacturer_copay_card_as_secondary_payer"],
            allowed_route_families=[
                "medicare_extra_help",
                "independent_foundation",
                "manufacturer_pap_if_eligible",
                "medicare_prescription_payment_plan",
                "formulary_exception_or_appeal",
                "cash_discount_instead_of_part_d_with_warning",
            ],
            warnings=[
                PUBLIC_PROGRAM_COPAY_CARD_GUARDRAIL,
                "Cash or discount-card spending may not count toward Part D "
                "out-of-pocket progress.",
            ],
            missing_facts=["income_household_size", "current_part_d_oop_progress"],
        )
    if "medicaid" in normalized:
        return InsuranceEligibilityRoute(
            route_type="medicaid",
            blocked_routes=["manufacturer_copay_card_as_secondary_payer"],
            allowed_route_families=[
                "medicaid_formulary_or_pa_appeal",
                "state_support",
                "manufacturer_pap_if_eligible",
            ],
            warnings=[PUBLIC_PROGRAM_COPAY_CARD_GUARDRAIL],
            missing_facts=["state_medicaid_plan", "denial_or_restriction_reason"],
        )
    if PUBLIC_PROGRAM_PATTERN.search(normalized):
        return InsuranceEligibilityRoute(
            route_type="government",
            blocked_routes=["manufacturer_copay_card_as_secondary_payer"],
            allowed_route_families=[
                "plan_exception_or_appeal",
                "public_program_support",
                "manufacturer_pap_if_eligible",
            ],
            warnings=[PUBLIC_PROGRAM_COPAY_CARD_GUARDRAIL],
            missing_facts=["program_type", "denial_or_restriction_reason"],
        )
    if any(token in normalized for token in ["uninsured", "self-pay", "self pay", "cash"]):
        return InsuranceEligibilityRoute(
            route_type="uninsured",
            blocked_routes=["insurance_secondary_copay_card_processing"],
            allowed_route_families=[
                "manufacturer_pap",
                "cash_discount",
                "direct_to_consumer_cash",
                "charity_care",
            ],
            warnings=[
                "Cash prices should still be compared across pharmacies and direct-pay programs."
            ],
            missing_facts=["household_income", "household_size"],
        )
    if any(token in normalized for token in ["commercial", "employer", "ppo", "hmo", "hdhp"]):
        return InsuranceEligibilityRoute(
            route_type="commercial",
            blocked_routes=[],
            allowed_route_families=[
                "manufacturer_copay_card",
                "cash_discount_instead_of_insurance_with_warning",
                "plan_exception_or_appeal",
                "biosimilar_or_formulary_alternative",
            ],
            warnings=[
                "Check accumulator or maximizer language before treating copay support "
                "as durable savings.",
                "Cash or discount-card spending may not count toward deductible or "
                "out-of-pocket maximum.",
            ],
            missing_facts=[
                "deductible_remaining",
                "oop_remaining",
                "accumulator_or_maximizer_status",
            ],
        )
    return InsuranceEligibilityRoute(
        route_type="unknown",
        blocked_routes=[],
        allowed_route_families=[
            "ask_insurance_type",
            "cash_discount_with_warning",
            "plan_document_review",
        ],
        warnings=[
            "Insurance type is required before routing to copay cards or public-program options."
        ],
        missing_facts=["insurance_type"],
    )
