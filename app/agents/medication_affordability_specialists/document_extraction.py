from __future__ import annotations

import re

from app.agents.medication_affordability_specialists.types import ExtractedTextFacts

ACCUMULATOR_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        "assistance_not_counting_to_deductible",
        re.compile(
            r"(will not|not|does not|do not|won't|cannot|excluded from|not applied to)"
            r".{0,80}(deductible)",
            re.IGNORECASE,
        ),
    ),
    (
        "oop_maximum_language",
        re.compile(
            r"(will not|not|does not|do not|won't|cannot|excluded from|not applied to)"
            r".{0,80}(out[- ]of[- ]pocket|oop)",
            re.IGNORECASE,
        ),
    ),
    ("variable_copay_program", re.compile(r"\bvariable copay\b", re.IGNORECASE)),
    ("coupon_adjustment", re.compile(r"\bcoupon adjustment\b", re.IGNORECASE)),
    (
        "non_essential_health_benefit",
        re.compile(r"\bnon[- ]essential health benefit\b", re.IGNORECASE),
    ),
    ("alternative_funding_program", re.compile(r"\balternative funding\b", re.IGNORECASE)),
]

VENDOR_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("prudentrx", re.compile(r"\bprudent\s*rx\b|\bprudentrx\b", re.IGNORECASE)),
    ("saveonsp", re.compile(r"\bsaveonsp\b|\bsaveon\s*sp\b", re.IGNORECASE)),
    ("copay_armor", re.compile(r"\bcopay armor\b", re.IGNORECASE)),
    ("payer_matrix", re.compile(r"\bpayer matrix\b", re.IGNORECASE)),
    ("sharx", re.compile(r"\bsharx\b", re.IGNORECASE)),
    ("paydhealth", re.compile(r"\bpaydhealth\b|\bpayd health\b", re.IGNORECASE)),
    ("variable_copay", re.compile(r"\bvariable copay\b", re.IGNORECASE)),
]

PA_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("prior_authorization", re.compile(r"\bprior authorization\b|\bpa required\b", re.IGNORECASE)),
    ("step_therapy", re.compile(r"\bstep therapy\b|\bst\b", re.IGNORECASE)),
    ("quantity_limit", re.compile(r"\bquantity limit\b|\bql\b", re.IGNORECASE)),
    ("formulary_exception", re.compile(r"\bformulary exception\b", re.IGNORECASE)),
]

REJECTION_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("claim_rejected", re.compile(r"\breject(ed|ion)?\b|\bclaim denied\b", re.IGNORECASE)),
    ("not_covered", re.compile(r"\bnot covered\b|\bnon[- ]formulary\b", re.IGNORECASE)),
    ("full_cost", re.compile(r"\bfull cost\b|\bcash price\b", re.IGNORECASE)),
]


def extract_facts_from_pasted_text(text: str | None) -> ExtractedTextFacts:
    value = text or ""
    flags: list[str] = []
    detected_terms: list[str] = []
    detected_vendors: list[str] = []

    for flag, pattern in ACCUMULATOR_PATTERNS:
        if pattern.search(value):
            flags.append(flag)
            detected_terms.append(flag)

    for vendor, pattern in VENDOR_PATTERNS:
        if pattern.search(value):
            flags.append(vendor)
            detected_vendors.append(vendor)

    pa_flags: list[str] = []
    for flag, pattern in PA_PATTERNS:
        if pattern.search(value):
            flags.append(flag)
            pa_flags.append(flag)

    rejection_flags: list[str] = []
    for flag, pattern in REJECTION_PATTERNS:
        if pattern.search(value):
            flags.append(flag)
            rejection_flags.append(flag)

    deduped_flags = list(dict.fromkeys(flags))
    return ExtractedTextFacts(
        flags=deduped_flags,
        has_accumulator_signal=any(
            flag
            in {
                "assistance_not_counting_to_deductible",
                "oop_maximum_language",
                "variable_copay_program",
                "coupon_adjustment",
                "non_essential_health_benefit",
                "alternative_funding_program",
                *[vendor for vendor, _ in VENDOR_PATTERNS],
            }
            for flag in deduped_flags
        ),
        has_pa_or_denial_signal=bool(pa_flags or rejection_flags),
        has_rejection_signal=bool(rejection_flags),
        detected_vendors=list(dict.fromkeys(detected_vendors)),
        detected_terms=list(dict.fromkeys(detected_terms)),
    )
