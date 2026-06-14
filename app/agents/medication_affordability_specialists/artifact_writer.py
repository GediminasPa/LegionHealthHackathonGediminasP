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
                        "CopayGuard action plan:",
                        "1. Check the commercial claim path for diagnosis fit, coverage "
                        "rules, and preferred pharmacy pricing.",
                        "2. Compare the savings-offer route against NovoCare public "
                        "self-pay bands.",
                        "3. Flag any self-pay path that would miss deductible or "
                        "out-of-pocket credit.",
                        "4. Prepare prescriber discussion options only if coverage or "
                        "savings routes are not workable.",
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
                    "CopayGuard action plan:",
                    "1. Check likely coverage rules and preferred pharmacy pricing before pickup.",
                    "2. Compare covered generic, biosimilar, or clinically appropriate "
                    "alternative routes.",
                    "3. Compare cash pricing only with a warning that it may miss "
                    "deductible or out-of-pocket progress.",
                    "4. Prepare the prescriber discussion path if the first route is not workable.",
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
                    "CopayGuard action plan:",
                    "1. Treat prior authorization as already handled when the intake "
                    "says approved.",
                    "2. Screen independent foundation funds and manufacturer "
                    "free-drug/PAP support before accepting the specialty quote as final.",
                    "3. Keep the Medicare Prescription Payment Plan as payment "
                    "smoothing only, not true savings.",
                    "4. Prepare the exception, coverage-determination, or "
                    "prescriber-alternative path if support routes are unavailable.",
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
                    "CopayGuard action plan:",
                    "1. Screen manufacturer patient assistance program eligibility.",
                    "2. Compare cash price across discount-card and direct-pay programs.",
                    "3. Check clinic financial counselor, FQHC, or charity-care options.",
                    "4. Prepare prescriber alternatives if the cash price is still unaffordable.",
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
                "CopayGuard action plan:",
                "1. Check whether manufacturer assistance counts toward the deductible.",
                "2. Check whether it counts toward the out-of-pocket maximum.",
                "3. Detect PrudentRx, SaveOnSP, or variable-copay program routing.",
                "4. Estimate the true patient responsibility after assistance is exhausted.",
            ]
        ),
    }


def _is_ozempic(intake: MedicationAffordabilityIntakeCreate) -> bool:
    medication = intake.medication_name.lower()
    return "ozempic" in medication or "semaglutide" in medication
