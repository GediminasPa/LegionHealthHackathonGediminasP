export type Health = { app: string; status: string; db: string };

export type Item = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
};

import type {
  AffordabilityOption,
  ArtifactRecord,
  CostTrackerState,
  DemoCase,
  MedicationIntakeData,
  MedicationRunEvent,
  MedicationSnapshot,
  SourceRecord,
} from "./medicationTypes";

export async function getHealth(): Promise<Health> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function listItems(): Promise<Item[]> {
  const res = await fetch("/api/items");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function createItem(name: string, description?: string): Promise<Item> {
  const res = await fetch("/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description: description ?? null }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Stream agent chat tokens over SSE. Yields each text delta as it arrives. */
export async function* streamChat(
  message: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const res = await fetch("/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `HTTP ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const raw of events) {
      let event = "message";
      const dataLines: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
      }
      if (event === "done") return;
      if (event === "token") yield dataLines.join("\n");
    }
  }
}

type ApiIntake = {
  patient_name: string;
  state: string;
  medication_name: string;
  strength: string | null;
  dose: string | null;
  quoted_price_cents: number;
  insurance_type: string;
  pa_status: string;
  plan_name: string | null;
  plan_id: string | null;
  diagnosis: string | null;
  pasted_text: string | null;
};

type ApiDemoCase = {
  id: string;
  title: string;
  summary: string;
  intake: ApiIntake;
};

export async function getMedicationDemoCases(): Promise<DemoCase[]> {
  const res = await fetch("/api/medication-affordability/demo-cases");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cases = (await res.json()) as ApiDemoCase[];
  return cases.map((demo) => ({
    id: demo.id,
    title: demo.title,
    summary: demo.summary,
    intake: fromApiIntake(demo.intake),
  }));
}

export async function createMedicationSession(
  intake: MedicationIntakeData,
): Promise<{ sessionId: string }> {
  const res = await fetch("/api/medication-affordability/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intake: toApiIntake(intake) }),
  });
  if (!res.ok) throw await errorFromResponse(res);
  const body = await res.json();
  return { sessionId: String(body.session_id) };
}

export async function getMedicationSession(sessionId: string): Promise<MedicationSnapshot> {
  const res = await fetch(`/api/medication-affordability/sessions/${sessionId}`);
  if (!res.ok) throw await errorFromResponse(res);
  const body = await res.json();
  const intake = fromApiIntake(body.intake);
  const state = body.case_state?.state_json ?? {};
  return {
    sessionId,
    intake,
    messages: (body.messages ?? []).map((message: Record<string, string | number>) => ({
      id: String(message.id),
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content ?? ""),
      createdAt: String(message.created_at ?? ""),
    })),
    costTracker: normalizeCostTracker(state.cost_tracker, intake),
    activities: (body.activities ?? []).map(normalizeActivity),
    options: (state.options ?? []) as AffordabilityOption[],
    sources: (body.sources ?? []).map(normalizeSource),
    artifacts: (body.artifacts ?? []).map(normalizeArtifact),
    flags: (state.flags ?? []) as string[],
    status: "ready",
  };
}

export async function postMedicationMessage(sessionId: string, content: string): Promise<void> {
  const res = await fetch(`/api/medication-affordability/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw await errorFromResponse(res);
}

export async function* streamMedicationRun(
  sessionId: string,
  signal?: AbortSignal,
): AsyncGenerator<MedicationRunEvent> {
  const res = await fetch(`/api/medication-affordability/sessions/${sessionId}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "mock" }),
    signal,
  });
  if (!res.ok) throw await errorFromResponse(res);

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Response body is not readable");
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    const rawEvents = buffer.split("\n\n");
    buffer = rawEvents.pop() ?? "";
    for (const raw of rawEvents) {
      const event = parseMedicationEvent(raw);
      if (event) yield event;
      if (event?.type === "run_done" || event?.type === "run_error") return;
    }
  }
  const finalEvent = parseMedicationEvent(buffer);
  if (finalEvent) yield finalEvent;
}

function parseMedicationEvent(raw: string): MedicationRunEvent | null {
  let eventType = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) eventType = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  const data = dataLines.join("\n");
  if (!data) return { type: eventType, payload: {} };
  try {
    const parsed = JSON.parse(data);
    return {
      type: String(parsed.type ?? eventType),
      payload: (parsed.payload ?? {}) as Record<string, unknown>,
    };
  } catch {
    return { type: eventType, payload: { content: data } };
  }
}

function toApiIntake(intake: MedicationIntakeData): ApiIntake {
  return {
    patient_name: intake.patientName,
    state: intake.state,
    medication_name: intake.medicationName,
    strength: intake.strength || null,
    dose: intake.dose || null,
    quoted_price_cents: intake.quotedPriceCents,
    insurance_type: intake.insuranceType,
    pa_status: intake.paStatus,
    plan_name: intake.planName || null,
    plan_id: intake.planId || null,
    diagnosis: intake.diagnosis || null,
    pasted_text: intake.pastedText || null,
  };
}

function fromApiIntake(intake: ApiIntake): MedicationIntakeData {
  return {
    patientName: intake.patient_name,
    state: intake.state,
    medicationName: intake.medication_name,
    strength: intake.strength ?? "",
    dose: intake.dose ?? "",
    quotedPriceCents: intake.quoted_price_cents,
    insuranceType: intake.insurance_type,
    paStatus:
      intake.pa_status === "approved" ||
      intake.pa_status === "pending" ||
      intake.pa_status === "denied"
        ? intake.pa_status
        : "unknown",
    planName: intake.plan_name ?? "",
    planId: intake.plan_id ?? "",
    diagnosis: intake.diagnosis ?? "",
    pastedText: intake.pasted_text ?? "",
  };
}

function normalizeCostTracker(value: unknown, intake: MedicationIntakeData): CostTrackerState {
  const fallback = {
    quotedPriceCents: intake.quotedPriceCents,
    currentBestLabel: "Pharmacy quote",
    currentBestEstimatedPriceCents: intake.quotedPriceCents,
    potentialDropCents: 0,
    dropType: "unknown" as const,
    confidence: "needs_user_confirmation" as const,
    explanation: "Investigation has not started yet.",
    sourceIds: [],
  };
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  return {
    quotedPriceCents: Number(raw.quoted_price_cents ?? fallback.quotedPriceCents),
    currentBestLabel: String(raw.current_best_label ?? fallback.currentBestLabel),
    currentBestEstimatedPriceCents:
      raw.current_best_estimated_price_cents == null
        ? null
        : Number(raw.current_best_estimated_price_cents),
    potentialDropCents:
      raw.potential_drop_cents == null ? null : Number(raw.potential_drop_cents),
    dropType: String(raw.drop_type ?? fallback.dropType) as CostTrackerState["dropType"],
    confidence: String(raw.confidence ?? fallback.confidence) as CostTrackerState["confidence"],
    explanation: String(raw.explanation ?? fallback.explanation),
    sourceIds: Array.isArray(raw.source_ids) ? (raw.source_ids as Array<number | string>) : [],
  };
}

function normalizeActivity(raw: Record<string, unknown>): {
  id: string;
  eventType: string;
  title: string;
  summary: string;
  status: "running" | "completed" | "warning" | "error";
  createdAt: string;
} {
  return {
    id: String(raw.id),
    eventType: String(raw.event_type ?? "activity"),
    title: String(raw.title ?? ""),
    summary: String(raw.summary ?? ""),
    status: String(raw.event_type ?? "").includes("completed") ? "completed" : "running",
    createdAt: String(raw.created_at ?? ""),
  };
}

function normalizeSource(raw: Record<string, unknown>): SourceRecord {
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    url: String(raw.url ?? ""),
    publisher: raw.publisher == null ? null : String(raw.publisher),
    summary: raw.summary == null ? null : String(raw.summary),
    checkedAt: raw.checked_at == null ? null : String(raw.checked_at),
  };
}

function normalizeArtifact(raw: Record<string, unknown>): ArtifactRecord {
  return {
    id: String(raw.id),
    artifactType: String(raw.artifact_type ?? "artifact"),
    title: String(raw.title ?? ""),
    content: String(raw.content ?? ""),
    status: String(raw.status ?? "draft"),
    sourceIds: [],
  };
}

async function errorFromResponse(res: Response): Promise<Error> {
  const body = await res.json().catch(() => null);
  return new Error(body?.detail ?? `HTTP ${res.status}`);
}
