from __future__ import annotations

from app.schemas.medication_affordability import MedicationAffordabilityIntakeCreate


def medication_label(intake: MedicationAffordabilityIntakeCreate) -> str:
    if intake.strength and intake.strength.lower() not in intake.medication_name.lower():
        return f"{intake.medication_name} {intake.strength}"
    return intake.medication_name


def draft_next_artifact(intake: MedicationAffordabilityIntakeCreate) -> dict[str, str]:
    medication = medication_label(intake)
    insurance_type = intake.insurance_type.lower()
    pa_status = intake.pa_status.lower()

    if "denied" in pa_status:
        return {
            "artifact_type": "appeal_letter",
            "title": "Prior authorization appeal starter",
            "content": "\n".join(
                [
                    f"Patient: {intake.patient_name}",
                    f"Medication: {medication}",
                    f"Diagnosis: {intake.diagnosis or '[confirm diagnosis]'}",
                    "",
                    "Request:",
                    "Please reconsider coverage for this medication based on medical necessity.",
                    "",
                    "Attach or confirm:",
                    "1. Denial reason and appeal deadline.",
                    "2. Prior therapies tried, failed, or contraindicated.",
                    "3. Prescriber statement of medical necessity.",
                    "4. Relevant chart notes or lab history.",
                ]
            ),
        }

    if "medicare" in insurance_type:
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
                    "4. Has the member reached the current Part D out-of-pocket threshold?",
                    "",
                    "Screen separately for Extra Help, independent foundation support, "
                    "and PAP eligibility.",
                ]
            ),
        }

    if "uninsured" in insurance_type or "cash" in insurance_type:
        return {
            "artifact_type": "checklist",
            "title": "Uninsured affordability checklist",
            "content": "\n".join(
                [
                    f"Patient: {intake.patient_name}",
                    f"Medication: {medication}",
                    "",
                    "Check these routes:",
                    "1. Manufacturer patient assistance program eligibility.",
                    "2. Cash price across discount-card and direct-pay programs.",
                    "3. Clinic financial counselor, FQHC, or charity-care options.",
                    "4. Prescriber alternatives if the cash price is still unaffordable.",
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
