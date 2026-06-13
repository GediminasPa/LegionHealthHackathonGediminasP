export type PaStatus = "approved" | "pending" | "denied" | "unknown";

export type MedicationIntakeData = {
  patientName: string;
  state: string;
  medicationName: string;
  strength: string;
  dose: string;
  quotedPriceCents: number;
  insuranceType: string;
  paStatus: PaStatus;
  planName: string;
  planId: string;
  diagnosis: string;
  pastedText: string;
};

export type DemoCase = {
  id: string;
  title: string;
  summary: string;
  intake: MedicationIntakeData;
};

export type MedicationResourceConnection = {
  id: string;
  name: string;
  url: string;
  domains: string[];
  tags: string[];
  queryTemplates: string[];
  notesForAgent: string;
  lastCheckedAt: string | null;
  category: string;
  status: string;
  use: string;
  reviewCadence: string;
  logoUrl: string | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type CostTrackerState = {
  quotedPriceCents: number;
  currentBestLabel: string;
  currentBestEstimatedPriceCents: number | null;
  potentialDropCents: number | null;
  dropType: "price_reduction" | "cash_flow_smoothing" | "coverage_path" | "unknown";
  confidence:
    | "found_source"
    | "eligibility_unknown"
    | "needs_user_confirmation"
    | "user_confirmed";
  explanation: string;
  sourceIds: Array<number | string>;
};

export type ActivityEvent = {
  id: string;
  eventType: string;
  title: string;
  summary: string;
  status: "running" | "completed" | "warning" | "error";
  createdAt: string;
};

export type AffordabilityOption = {
  id: string;
  title: string;
  rank?: number;
  summary: string;
  confidence: string;
  dropType?: string;
};

export type SourceRecord = {
  id: string;
  title: string;
  url: string;
  publisher?: string | null;
  summary?: string | null;
  checkedAt?: string | null;
  confidence?: number | null;
};

export type ArtifactRecord = {
  id: string;
  artifactType: string;
  title: string;
  content: string;
  status: string;
  sourceIds: Array<number | string>;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type MedicationSnapshot = {
  sessionId: string;
  intake: MedicationIntakeData;
  messages: ChatMessage[];
  costTracker: CostTrackerState;
  activities: ActivityEvent[];
  options: AffordabilityOption[];
  sources: SourceRecord[];
  artifacts: ArtifactRecord[];
  flags: string[];
  status: "intake" | "investigating" | "waiting" | "ready" | "error";
};

export type MedicationRunEvent = {
  type: string;
  payload: Record<string, unknown>;
};

export function blankMedicationIntake(): MedicationIntakeData {
  return {
    patientName: "",
    state: "CA",
    medicationName: "",
    strength: "",
    dose: "",
    quotedPriceCents: 0,
    insuranceType: "Commercial",
    paStatus: "unknown",
    planName: "",
    planId: "",
    diagnosis: "",
    pastedText: "",
  };
}

export function initialCostTracker(intake: MedicationIntakeData): CostTrackerState {
  return {
    quotedPriceCents: intake.quotedPriceCents,
    currentBestLabel: "Pharmacy quote",
    currentBestEstimatedPriceCents: intake.quotedPriceCents || null,
    potentialDropCents: 0,
    dropType: "unknown",
    confidence: "needs_user_confirmation",
    explanation: "Investigation has not started yet.",
    sourceIds: [],
  };
}
