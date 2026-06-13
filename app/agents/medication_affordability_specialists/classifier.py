from __future__ import annotations

from app.agents.medication_affordability_specialists.types import CaseMoment, ExtractedTextFacts
from app.schemas.medication_affordability import MedicationAffordabilityIntakeCreate


def classify_case_moment(
    intake: MedicationAffordabilityIntakeCreate, facts: ExtractedTextFacts
) -> tuple[CaseMoment, list[str]]:
    reasons: list[str] = []
    pa_status = intake.pa_status.lower()
    has_quote = intake.quoted_price_cents > 0

    if facts.has_accumulator_signal:
        reasons.append("Plan or pasted text has accumulator/maximizer/coupon-adjustment signals.")
        return "coupon_behavior", reasons

    if "denied" in pa_status or facts.has_rejection_signal:
        reasons.append("PA or claim status indicates denial/rejection.")
        return "denial_or_pa", reasons

    if "pending" in pa_status or "unknown" in pa_status or facts.has_pa_or_denial_signal:
        reasons.append("PA or utilization-management status needs confirmation.")
        return "denial_or_pa", reasons

    if has_quote and intake.quoted_price_cents >= 10000:
        reasons.append("Patient has a high pharmacy quote that needs explanation.")
        return "sticker_shock", reasons

    if not has_quote:
        reasons.append(
            "No pharmacy quote yet; assess likely price and access blockers before fill."
        )
        return "before_fill", reasons

    reasons.append("Insufficient signals; start with general affordability triage.")
    return "unknown", reasons
