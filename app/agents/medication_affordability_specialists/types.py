from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

CaseMoment = Literal[
    "before_fill",
    "sticker_shock",
    "coupon_behavior",
    "denial_or_pa",
    "unknown",
]

InsuranceRouteType = Literal[
    "commercial",
    "medicare",
    "medicaid",
    "government",
    "uninsured",
    "unknown",
]

SpecialistName = Literal[
    "intake_document_extraction",
    "drug_identity",
    "public_price_basis",
    "formulary_um",
    "insurance_eligibility_router",
    "cash_coupon_comparator",
    "assistance_matcher",
    "accumulator_maximizer_detector",
    "appeal_artifact_writer",
    "follow_up_monitor",
]


class ExtractedTextFacts(BaseModel):
    flags: list[str] = Field(default_factory=list)
    has_accumulator_signal: bool = False
    has_pa_or_denial_signal: bool = False
    has_rejection_signal: bool = False
    detected_vendors: list[str] = Field(default_factory=list)
    detected_terms: list[str] = Field(default_factory=list)


class InsuranceEligibilityRoute(BaseModel):
    route_type: InsuranceRouteType
    blocked_routes: list[str] = Field(default_factory=list)
    allowed_route_families: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    missing_facts: list[str] = Field(default_factory=list)


class SpecialistPlanStep(BaseModel):
    specialist: SpecialistName
    reason: str
    background_ok: bool = False


class CaseAnalysis(BaseModel):
    case_moment: CaseMoment
    case_moment_reasons: list[str] = Field(default_factory=list)
    extracted_facts: ExtractedTextFacts
    insurance_route: InsuranceEligibilityRoute
    flags: list[str] = Field(default_factory=list)
    blocked_routes: list[str] = Field(default_factory=list)
    missing_facts: list[str] = Field(default_factory=list)
    specialist_plan: list[SpecialistPlanStep] = Field(default_factory=list)
