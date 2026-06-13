from __future__ import annotations

from typing import Any

from app.schemas.medication_affordability import MedicationAffordabilityIntakeCreate
from app.services.medication_affordability_resources import search_curated_resources


def curated_resource_hints(intake: MedicationAffordabilityIntakeCreate) -> list[dict[str, Any]]:
    medication = intake.medication_name.lower()
    is_enbrel = "enbrel" in medication
    is_ozempic = "ozempic" in medication or "semaglutide" in medication
    is_glp1 = is_ozempic or any(
        name in medication for name in ["zepbound", "wegovy", "mounjaro", "trulicity"]
    )
    tags = []
    if is_enbrel:
        tags.append("enbrel")
    if is_ozempic:
        tags.extend(["ozempic", "semaglutide", "glp-1", "diabetes", "estimate"])
    elif is_glp1:
        tags.extend(["glp-1", "cash", "discount", "estimate"])

    insurance_type = intake.insurance_type.lower()
    if "medicare" in insurance_type:
        tags.extend(["medicare", "foundation"])
    elif "commercial" in insurance_type:
        tags.extend(["commercial"] if is_enbrel else ["cash", "discount"])
    else:
        tags.extend(["cash", "pap"])

    resources = search_curated_resources(
        f"{intake.medication_name} {intake.insurance_type} {intake.diagnosis or ''}",
        tags=tags,
        limit=8,
    )
    if "medicare" in insurance_type:
        preferred = [
            "medicare-prescription-payment-plan",
            "medicare-extra-help",
            "amgen-safety-net-foundation",
            "pan-foundation-ra",
            "healthwell-autoimmune-medicare",
        ]
    elif "commercial" in insurance_type and is_enbrel:
        preferred = ["enbrel-support", "kff-copay-adjustment-programs", "goodrx-specialty-context"]
    elif "commercial" in insurance_type and is_ozempic:
        preferred = [
            "ozempic-cost-coverage",
            "ozempic-savings-offer-terms",
            "ada-standards-type-2-diabetes-2026",
            "cost-plus-drugs-cash-pricing",
            "rxnorm-drug-normalization",
            "nadac-price-basis",
            "goodrx-specialty-context",
        ]
    elif "commercial" in insurance_type:
        preferred = [
            "goodrx-specialty-context",
            "rxnorm-drug-normalization",
            "nadac-price-basis",
        ]
    else:
        preferred = [
            "goodrx-specialty-context",
            "amgen-safety-net-foundation",
        ]
    order = {resource_id: index for index, resource_id in enumerate(preferred)}
    return sorted(resources, key=lambda resource: order.get(str(resource["id"]), 99))[:4]
