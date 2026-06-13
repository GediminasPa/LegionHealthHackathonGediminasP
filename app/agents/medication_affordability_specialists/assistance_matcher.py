from __future__ import annotations

from typing import Any

from app.schemas.medication_affordability import MedicationAffordabilityIntakeCreate
from app.services.medication_affordability_resources import search_curated_resources


def curated_resource_hints(intake: MedicationAffordabilityIntakeCreate) -> list[dict[str, Any]]:
    tags = ["enbrel"] if "enbrel" in intake.medication_name.lower() else []
    if "medicare" in intake.insurance_type.lower():
        tags.extend(["medicare", "foundation"])
    elif "commercial" in intake.insurance_type.lower():
        tags.extend(["commercial", "accumulator"])
    else:
        tags.extend(["cash", "pap"])

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
    elif "commercial" in intake.insurance_type.lower():
        preferred = [
            "enbrel-support",
            "kff-copay-adjustment-programs",
            "goodrx-specialty-context",
        ]
    else:
        preferred = [
            "goodrx-specialty-context",
            "amgen-safety-net-foundation",
        ]
    order = {resource_id: index for index, resource_id in enumerate(preferred)}
    return sorted(resources, key=lambda resource: order.get(str(resource["id"]), 99))[:4]
