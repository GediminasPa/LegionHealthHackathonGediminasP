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

    if intake.quoted_price_cents <= 0:
        if _is_ozempic(intake):
            return {
                "artifact_type": "checklist",
                "title": "Ozempic pre-fill coverage and price checklist",
                "content": "\n".join(
                    [
                        f"Patient: {intake.patient_name}",
                        f"Medication: {medication}",
                        f"Diagnosis: {intake.diagnosis or '[confirm diagnosis]'}",
                        "",
                        "Before pickup, confirm:",
                        "1. Is Ozempic covered for the documented diagnosis?",
                        "2. Is prior authorization, step therapy, or a quantity limit required?",
                        "3. Which pharmacy or mail-order channel gives the lowest plan cost?",
                        "4. What is the expected copay after the claim is run with insurance?",
                        "5. Does a commercial savings offer apply, and what monthly cap applies?",
                        "6. If self-pay is used, will that spend miss deductible or OOP credit?",
                        "",
                        "Current public estimate bands to verify:",
                        "- Covered commercial route: savings offer may reduce eligible fills, "
                        "but plan coverage and monthly caps control the result.",
                        "- NovoCare self-pay route: public Ozempic pen offers currently list "
                        "$199 starter fills for eligible new patients, then $349/month for "
                        "0.25 mg, 0.5 mg, or 1 mg pens and $499/month for 2 mg pens.",
                        "- Generic alternative route: metformin ER or other generic diabetes "
                        "medicines can be far cheaper, but only if clinically appropriate.",
                        "",
                        "Alternatives to ask the prescriber about:",
                        "1. Metformin ER or another low-cost generic diabetes option.",
                        "2. SGLT2 inhibitor options such as Jardiance or Farxiga if the "
                        "patient profile fits.",
                        "3. Other GLP-1 or incretin options such as Trulicity or Mounjaro if "
                        "covered and clinically appropriate.",
                        "4. Wegovy or Zepbound only for obesity-labeled routes, not as a "
                        "simple Ozempic substitute.",
                        "",
                        "Do not switch therapies without prescriber confirmation.",
                    ]
                ),
            }

        return {
            "artifact_type": "checklist",
            "title": "Pre-fill price and access checklist",
            "content": "\n".join(
                [
                    f"Patient: {intake.patient_name}",
                    f"Medication: {medication}",
                    f"Diagnosis: {intake.diagnosis or '[confirm diagnosis]'}",
                    "",
                    "Before pickup, confirm:",
                    "1. Is prior authorization, step therapy, or a quantity limit required?",
                    "2. Does the plan prefer a generic, biosimilar, or therapeutic alternative?",
                    "3. What is the expected cost at the preferred pharmacy?",
                    "4. What cash price is available if the claim is not favorable?",
                    "5. Would cash payment fail to count toward deductible or "
                    "out-of-pocket progress?",
                    "",
                    "Ask the prescriber before changing to any therapeutic alternative.",
                ]
            ),
        }

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


def _is_ozempic(intake: MedicationAffordabilityIntakeCreate) -> bool:
    medication = intake.medication_name.lower()
    return "ozempic" in medication or "semaglutide" in medication
