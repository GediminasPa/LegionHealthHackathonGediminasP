from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

MessageRole = Literal["user", "assistant", "system"]
RunStatus = Literal["running", "completed", "failed"]
CostDropType = Literal["price_reduction", "cash_flow_smoothing", "coverage_path", "unknown"]
CostConfidence = Literal[
    "found_source",
    "eligibility_unknown",
    "needs_user_confirmation",
    "user_confirmed",
]
StreamEventType = Literal[
    "agent_message",
    "agent_delta",
    "activity_started",
    "activity_updated",
    "activity_completed",
    "tool_call",
    "tool_result",
    "case_state_patch",
    "cost_tracker_update",
    "source_added",
    "option_added",
    "option_updated",
    "artifact_created",
    "artifact_updated",
    "question",
    "run_done",
    "run_error",
]


class CostTrackerState(BaseModel):
    quoted_price_cents: int = Field(ge=0)
    current_best_label: str
    current_best_estimated_price_cents: int | None = Field(default=None, ge=0)
    potential_drop_cents: int | None = Field(default=None, ge=0)
    drop_type: CostDropType = "unknown"
    confidence: CostConfidence = "needs_user_confirmation"
    explanation: str
    source_ids: list[int | str] = Field(default_factory=list)


class MedicationAffordabilityIntakeCreate(BaseModel):
    patient_name: str = Field(default="", max_length=200)
    state: str = Field(min_length=1, max_length=100)
    medication_name: str = Field(min_length=1, max_length=250)
    strength: str | None = Field(default=None, max_length=150)
    dose: str | None = Field(default=None, max_length=150)
    quoted_price_cents: int = Field(ge=0)
    insurance_type: str = Field(min_length=1, max_length=100)
    pa_status: str = Field(min_length=1, max_length=100)
    plan_name: str | None = Field(default=None, max_length=250)
    plan_id: str | None = Field(default=None, max_length=100)
    diagnosis: str | None = Field(default=None, max_length=250)
    pasted_text: str | None = None

    @field_validator("patient_name", mode="before")
    @classmethod
    def normalize_patient_name(cls, value: Any) -> Any:
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        return value


class MedicationAffordabilityIntakeRead(MedicationAffordabilityIntakeCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    created_at: datetime


class MedicationAffordabilitySessionCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    intake: MedicationAffordabilityIntakeCreate


class MedicationAffordabilitySessionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    status: str
    created_at: datetime
    updated_at: datetime


class MedicationAffordabilitySessionCreateResponse(BaseModel):
    session_id: int
    session: MedicationAffordabilitySessionSummary


class MedicationAffordabilityMessageCreate(BaseModel):
    content: str = Field(min_length=1)
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class MedicationAffordabilityMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    role: str
    content: str
    metadata_json: dict[str, Any]
    created_at: datetime


class MedicationAffordabilityRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    status: str
    started_at: datetime
    finished_at: datetime | None
    error: str | None


class MedicationAffordabilityActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    run_id: int | None
    event_type: str
    title: str
    summary: str | None
    payload_json: dict[str, Any]
    created_at: datetime


class MedicationAffordabilityCaseStateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    state_json: dict[str, Any]
    version: int
    updated_at: datetime


class MedicationAffordabilitySourceCreate(BaseModel):
    title: str = Field(min_length=1, max_length=250)
    url: str = Field(min_length=1)
    source_type: str = Field(min_length=1, max_length=100)
    publisher: str | None = Field(default=None, max_length=200)
    checked_at: datetime | None = None
    summary: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)


class MedicationAffordabilitySourceRead(MedicationAffordabilitySourceCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    created_at: datetime


class MedicationAffordabilityArtifactCreate(BaseModel):
    artifact_type: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=250)
    content: str = Field(min_length=1)
    status: str = Field(default="draft", max_length=50)
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class MedicationAffordabilityArtifactRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    artifact_type: str
    title: str
    content: str
    status: str
    metadata_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class MedicationAffordabilitySessionDetailRead(BaseModel):
    session: MedicationAffordabilitySessionSummary
    intake: MedicationAffordabilityIntakeRead
    messages: list[MedicationAffordabilityMessageRead]
    runs: list[MedicationAffordabilityRunRead]
    activities: list[MedicationAffordabilityActivityRead]
    case_state: MedicationAffordabilityCaseStateRead
    sources: list[MedicationAffordabilitySourceRead]
    artifacts: list[MedicationAffordabilityArtifactRead]


class MedicationAffordabilityDemoCase(BaseModel):
    id: str
    title: str
    summary: str
    intake: MedicationAffordabilityIntakeCreate


class MedicationAffordabilityRunRequest(BaseModel):
    mode: Literal["mock", "agent"] = "agent"


class MedicationAffordabilityStreamEvent(BaseModel):
    type: StreamEventType
    session_id: int
    run_id: int | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
