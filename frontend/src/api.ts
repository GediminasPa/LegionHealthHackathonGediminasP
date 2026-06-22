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
  MedicationResourceConnection,
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

type ApiMedicationResourceConnection = {
  id: string;
  name: string;
  url: string;
  domains: string[];
  tags: string[];
  query_templates: string[];
  notes_for_agent: string;
  last_checked_at: string | null;
  category: string;
  status: string;
  use: string;
  review_cadence: string;
  logo_url: string | null;
};

const LOCAL_SESSION_PREFIX = "local-demo-";
const localSessionIntakes = new Map<string, MedicationIntakeData>();

const LOCAL_DEMO_CASES: DemoCase[] = [
  {
    id: "before-fill-adderall-options",
    title: "Adderall XR pre-fill pricing",
    summary:
      "Estimate likely blockers and compare generic stimulant options before the first pharmacy run.",
    intake: {
      patientName: "Ari Patel",
      state: "CA",
      medicationName: "Adderall XR",
      strength: "20 mg",
      dose: "once daily",
      quotedPriceCents: 0,
      insuranceType: "Commercial",
      paStatus: "unknown",
      planName: "High-deductible PPO",
      planId: "",
      deductibleRemaining: "$1,900 remaining",
      diagnosis: "ADHD",
      outOfPocketRemaining: "$5,600 remaining",
      pastedText:
        "Case reason: The patient wants likely drug cost, plan blockers, and lower-cost alternatives checked before pickup.\n\nPatient is before the first fill. They want likely price blockers checked before pickup: prior authorization, step therapy, quantity limits, generic substitution, cash discount pricing, and whether the plan prefers a different stimulant. Compare insurance processing with cash estimates for generic mixed amphetamine salts ER, brand Adderall XR, generic lisdexamfetamine, and methylphenidate ER if the prescriber considers alternatives clinically appropriate.",
      preferredPharmacy: "CVS retail pharmacy",
      quantityDaysSupply: "30 capsules / 30 days",
    },
  },
  {
    id: "medicare-enbrel-wellcare",
    title: "Medicare Enbrel / Wellcare",
    summary: "PA approved, high Part D specialty cost, and Medicare-correct assistance paths.",
    intake: {
      patientName: "Maria Chen",
      state: "CA",
      medicationName: "Enbrel SureClick 50 mg/mL",
      strength: "50 mg/mL",
      dose: "weekly",
      quotedPriceCents: 210000,
      insuranceType: "Medicare Part D",
      paStatus: "approved",
      planName: "Wellcare Value Script PDP",
      planId: "S4802-163-0",
      deductibleRemaining: "$0 remaining",
      diagnosis: "rheumatoid arthritis",
      outOfPocketRemaining: "about $2,000 remaining toward the yearly Part D cap",
      pastedText:
        "Case reason: The patient already has prior authorization approved but received a high Medicare specialty pharmacy quote, so CopayGuard should skip PA troubleshooting and rank Medicare-correct affordability routes.\n\nPharmacy claim status: claim already run through Medicare Part D at the specialty pharmacy\nAssistance screening: household income is not collected yet, so ask one simple income question before choosing between Extra Help, RA foundation grants, and Amgen Safety Net/free-drug support.\n\nPharmacy quote is $2,100 for Enbrel SureClick after the approved prior authorization. Commercial manufacturer copay cards should be treated as blocked because this is Medicare Part D. Rank independent foundation funds, Amgen Safety Net/free-drug screening, Medicare Extra Help/state assistance if eligible, the Medicare Prescription Payment Plan for payment smoothing, and a formulary exception or prescriber-reviewed alternative only if support routes fail.",
      preferredPharmacy: "Wellcare preferred specialty pharmacy",
      quantityDaysSupply: "4 SureClick pens / 28 days",
    },
  },
  {
    id: "commercial-enbrel-accumulator",
    title: "Commercial Enbrel accumulator",
    summary: "Copay support looks helpful today, but plan language suggests deductible credit risk.",
    intake: {
      patientName: "Jordan Lee",
      state: "CA",
      medicationName: "Enbrel SureClick 50 mg/mL",
      strength: "50 mg/mL",
      dose: "weekly",
      quotedPriceCents: 185000,
      insuranceType: "Commercial",
      paStatus: "approved",
      planName: "Employer PPO with specialty pharmacy benefit",
      planId: "",
      deductibleRemaining: "$2,300 remaining",
      diagnosis: "rheumatoid arthritis",
      outOfPocketRemaining: "$6,100 remaining",
      pastedText:
        "Case reason: The patient used or expected a copay card, but the plan language suggests the discount may not count toward deductible or out-of-pocket progress.\n\nPharmacy claim status: specialty pharmacy quote shown after benefit and copay support review\n\nSpecialty medication copay assistance will not count toward your deductible and will not apply to your out-of-pocket maximum. A variable copay program may apply. Members may be contacted by PrudentRx or SaveOnSP for enrollment. CopayGuard should separate today's low charge from whether the plan credits that support toward the deductible and annual out-of-pocket maximum.",
      preferredPharmacy: "Accredo specialty pharmacy",
      quantityDaysSupply: "4 SureClick pens / 28 days",
    },
  },
];

export async function getMedicationDemoCases(): Promise<DemoCase[]> {
  try {
    const res = await fetch("/api/medication-affordability/demo-cases");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cases = (await res.json()) as ApiDemoCase[];
    return cases.map((demo) => ({
      id: demo.id,
      title: demo.title,
      summary: demo.summary,
      intake: fromApiIntake(demo.intake),
    }));
  } catch {
    return LOCAL_DEMO_CASES;
  }
}

export async function getMedicationResources(): Promise<MedicationResourceConnection[]> {
  const res = await fetch("/api/medication-affordability/resources");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const resources = (await res.json()) as ApiMedicationResourceConnection[];
  return resources.map((resource) => ({
    id: resource.id,
    name: resource.name,
    url: resource.url,
    domains: resource.domains ?? [],
    tags: resource.tags ?? [],
    queryTemplates: resource.query_templates ?? [],
    notesForAgent: resource.notes_for_agent,
    lastCheckedAt: resource.last_checked_at,
    category: resource.category,
    status: resource.status,
    use: resource.use,
    reviewCadence: resource.review_cadence,
    logoUrl: resource.logo_url,
  }));
}

export async function createMedicationSession(
  intake: MedicationIntakeData,
): Promise<{ sessionId: string }> {
  try {
    const res = await fetch("/api/medication-affordability/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intake: toApiIntake(intake) }),
    });
    if (res.ok) {
      const body = await res.json();
      return { sessionId: String(body.session_id) };
    }
    if (res.status < 500) throw await errorFromResponse(res);
  } catch (error) {
    if (error instanceof Error && !shouldUseLocalDemoFallback(error)) throw error;
  }
  return createLocalMedicationSession(intake);
}

export async function getMedicationSession(sessionId: string): Promise<MedicationSnapshot> {
  const res = await fetch(`/api/medication-affordability/sessions/${sessionId}`);
  if (!res.ok) throw await errorFromResponse(res);
  const body = await res.json();
  const intake = fromApiIntake(body.intake);
  const state = body.case_state?.state_json ?? {};
  const messages = (body.messages ?? []).map((message: Record<string, string | number>) => ({
    id: String(message.id),
    role: message.role === "assistant" ? "assistant" : "user",
    content: String(message.content ?? ""),
    createdAt: String(message.created_at ?? ""),
  }));
  return {
    sessionId,
    intake,
    messages,
    costTracker: normalizeCostTracker(state.cost_tracker, intake),
    activities: (body.activities ?? []).map(normalizeActivity),
    options: (state.options ?? []) as AffordabilityOption[],
    sources: (body.sources ?? []).map(normalizeSource),
    artifacts: (body.artifacts ?? []).map(normalizeArtifact),
    flags: (state.flags ?? []) as string[],
    status: sessionStatusFromState(state, messages),
  };
}

export async function postMedicationMessage(sessionId: string, content: string): Promise<void> {
  if (isLocalMedicationSession(sessionId)) return;
  const res = await fetch(`/api/medication-affordability/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw await errorFromResponse(res);
}

export async function* streamMedicationRun(
  sessionId: string,
  mode: "agent" | "mock" = "agent",
  signal?: AbortSignal,
): AsyncGenerator<MedicationRunEvent> {
  if (isLocalMedicationSession(sessionId)) {
    yield* streamLocalMedicationRun(sessionId, signal);
    return;
  }

  const res = await fetch(`/api/medication-affordability/sessions/${sessionId}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
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

function createLocalMedicationSession(intake: MedicationIntakeData): { sessionId: string } {
  const sessionId = `${LOCAL_SESSION_PREFIX}${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  localSessionIntakes.set(sessionId, intake);
  return { sessionId };
}

function isLocalMedicationSession(sessionId: string): boolean {
  return sessionId.startsWith(LOCAL_SESSION_PREFIX);
}

function shouldUseLocalDemoFallback(error: Error): boolean {
  return error.message === "Failed to fetch" || error.message.startsWith("HTTP 5");
}

async function* streamLocalMedicationRun(
  sessionId: string,
  signal?: AbortSignal,
): AsyncGenerator<MedicationRunEvent> {
  const intake = localSessionIntakes.get(sessionId) ?? blankLocalIntake();
  const sourcePayloads = localSourcePayloads(intake);
  const sourceIds = sourcePayloads.map((source) => String(source.id));
  const option = localOptionPayload(intake, sourceIds);
  const costTracker = localCostTrackerPayload(intake, sourceIds);
  const artifact = localArtifactPayload(intake, sourceIds);

  const events: MedicationRunEvent[] = [
    {
      type: "activity_started",
      payload: {
        id: "local-intake",
        title: "Reading intake and plan text",
        summary: "CopayGuard is extracting coverage, price, and assistance signals.",
      },
    },
    {
      type: "agent_message",
      payload: {
        content: `I am checking ${intake.medicationName || "this medication"} across coverage, cash, assistance, and appeal routes.`,
      },
    },
    {
      type: "activity_completed",
      payload: {
        id: "local-intake",
        title: "Intake context loaded",
        summary: "Medication, insurance, quote, and pasted plan text are ready for routing.",
      },
    },
    {
      type: "activity_started",
      payload: {
        id: "local-sources",
        title: "Checking evidence sources",
        summary: "CopayGuard is matching the case to curated healthcare sources.",
      },
    },
    ...sourcePayloads.map((payload) => ({ type: "source_added", payload })),
    {
      type: "activity_completed",
      payload: {
        id: "local-sources",
        title: "Evidence sources checked",
        summary: `${sourcePayloads.length} curated sources are attached to this review.`,
      },
    },
    {
      type: "activity_started",
      payload: {
        id: "local-routing",
        title: "Ranking coverage and cost routes",
        summary: "CopayGuard is separating true savings from payment smoothing and eligibility-dependent help.",
      },
    },
    { type: "option_added", payload: option },
    { type: "cost_tracker_update", payload: costTracker },
    {
      type: "activity_completed",
      payload: {
        id: "local-routing",
        title: "Route and price estimate ready",
        summary: "The top route and cost tracker are now reflected in the result packet.",
      },
    },
    {
      type: "activity_started",
      payload: {
        id: "local-artifact",
        title: "Preparing next-step artifact",
        summary: "CopayGuard is drafting the call script or checklist for the recommended path.",
      },
    },
    {
      type: "artifact_created",
      payload: artifact,
    },
    {
      type: "activity_completed",
      payload: {
        id: "local-artifact",
        title: "Prepared next-step summary",
        summary: "An affordability route is ready for review.",
      },
    },
    { type: "run_done", payload: { status: "completed" } },
  ];

  for (const event of events) {
    if (signal?.aborted) return;
    await delay(220);
    yield event;
  }
}

function blankLocalIntake(): MedicationIntakeData {
  return {
    patientName: "",
    state: "CA",
    medicationName: "Medication",
    strength: "",
    dose: "",
    quotedPriceCents: 0,
    insuranceType: "Commercial",
    paStatus: "unknown",
    planName: "",
    planId: "",
    deductibleRemaining: "",
    diagnosis: "",
    outOfPocketRemaining: "",
    pastedText: "",
    preferredPharmacy: "",
    quantityDaysSupply: "",
  };
}

function localSourcePayloads(intake: MedicationIntakeData): Array<Record<string, unknown>> {
  const baseSources = [
    {
      id: "local-rxnav",
      title: "RxNorm / RxNav",
      url: "https://rxnav.nlm.nih.gov/",
      publisher: "rxnav.nlm.nih.gov",
      summary: "Drug identity and naming normalization for the medication under review.",
    },
    {
      id: "local-openfda",
      title: "openFDA NDC Directory",
      url: "https://open.fda.gov/apis/drug/ndc/",
      publisher: "open.fda.gov",
      summary: "Product, labeler, and packaging context for drug records.",
    },
    {
      id: "local-goodrx",
      title: "GoodRx cash discount context",
      url: "https://www.goodrx.com/",
      publisher: "goodrx.com",
      summary: "Cash discount comparison path with deductible and out-of-pocket caveats.",
    },
  ];

  if (intake.insuranceType.toLowerCase().includes("medicare")) {
    baseSources.push({
      id: "local-medicare",
      title: "Medicare Extra Help",
      url: "https://www.ssa.gov/medicare/part-d-extra-help",
      publisher: "ssa.gov",
      summary: "Screening route for Part D low-income subsidy support.",
    });
  } else {
    baseSources.push({
      id: "local-covermymeds",
      title: "CoverMyMeds ePA",
      url: "https://www.covermymeds.com/",
      publisher: "covermymeds.com",
      summary: "Prior authorization and appeal execution path for covered-benefit cases.",
    });
  }

  return baseSources.map((source) => ({
    ...source,
    source_type: "local_curated_resource",
    checked_at: new Date().toISOString(),
    confidence: 0.78,
  }));
}

function localOptionPayload(
  intake: MedicationIntakeData,
  sourceIds: string[],
): Record<string, unknown> {
  const text = `${intake.pastedText} ${intake.insuranceType}`.toLowerCase();
  if (text.includes("deductible") || text.includes("out-of-pocket")) {
    return {
      id: "local-accumulator-check",
      title: "Accumulator and coupon impact check",
      rank: 1,
      summary:
        "Confirm whether the coupon lowers today's charge without counting toward deductible or out-of-pocket progress.",
      confidence: "needs_user_confirmation",
      drop_type: "unknown",
      source_ids: sourceIds,
    };
  }
  if (intake.insuranceType.toLowerCase().includes("medicare")) {
    return {
      id: "local-medicare-route",
      title: "Medicare smoothing and subsidy screen",
      rank: 1,
      summary:
        "Check Extra Help and Medicare Prescription Payment Plan before treating the quote as the final cash burden.",
      confidence: "needs_user_confirmation",
      drop_type: "cash_flow_smoothing",
      source_ids: sourceIds,
    };
  }
  if (intake.quotedPriceCents <= 0) {
    return {
      id: "local-prefill-check",
      title: "Pre-fill price and coverage check",
      rank: 1,
      summary:
        "Check likely PA, tier, quantity, pharmacy, cash, and covered-alternative routes before pickup.",
      confidence: "needs_user_confirmation",
      drop_type: "unknown",
      source_ids: sourceIds,
    };
  }
  return {
    id: "local-commercial-route",
    title: "Commercial price route comparison",
    rank: 1,
    summary:
      "Compare insurance processing, cash pricing, manufacturer support, exception request, and prescriber alternatives.",
    confidence: "eligibility_unknown",
    drop_type: "price_reduction",
    source_ids: sourceIds,
  };
}

function localCostTrackerPayload(
  intake: MedicationIntakeData,
  sourceIds: string[],
): Record<string, unknown> {
  const hasQuote = intake.quotedPriceCents > 0;
  const estimated = hasQuote ? Math.max(2500, Math.round(intake.quotedPriceCents * 0.35)) : null;
  return {
    quoted_price_cents: intake.quotedPriceCents,
    current_best_label: hasQuote ? "Best route estimate" : "Estimate before first fill",
    current_best_estimated_price_cents: estimated,
    potential_drop_cents: estimated == null ? null : Math.max(0, intake.quotedPriceCents - estimated),
    drop_type: hasQuote ? "price_reduction" : "unknown",
    confidence: hasQuote ? "eligibility_unknown" : "needs_user_confirmation",
    explanation:
      "This review is ranking likely affordability routes from public and curated healthcare sources. Confirm coverage, eligibility, pharmacy, and deductible or out-of-pocket impact before treating any estimate as a claim result.",
    source_ids: sourceIds,
  };
}

function localArtifactPayload(
  intake: MedicationIntakeData,
  sourceIds: string[],
): Record<string, unknown> {
  return {
    id: "local-next-step-checklist",
    artifact_type: "checklist",
    title: `${intake.medicationName || "Medication"} affordability checklist`,
    content: [
      "1. Ask the pharmacy to rerun the claim through the active insurance benefit.",
      "2. Confirm PA, step therapy, quantity limits, preferred pharmacy, and deductible status.",
      "3. Compare cash pricing only after checking whether it counts toward deductible or out-of-pocket maximum.",
      "4. Screen manufacturer, foundation, Extra Help, or appeal routes based on insurance type.",
      "5. Keep prescriber-reviewed alternatives ready if the covered route stays unaffordable.",
    ].join("\n"),
    status: "ready",
    source_ids: sourceIds,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
    deductibleRemaining: "",
    diagnosis: intake.diagnosis ?? "",
    outOfPocketRemaining: "",
    pastedText: intake.pasted_text ?? "",
    preferredPharmacy: "",
    quantityDaysSupply: "",
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
    confidence: raw.confidence == null ? null : Number(raw.confidence),
  };
}

function normalizeArtifact(raw: Record<string, unknown>): ArtifactRecord {
  const metadata =
    raw.metadata_json && typeof raw.metadata_json === "object"
      ? (raw.metadata_json as Record<string, unknown>)
      : {};
  return {
    id: String(raw.id),
    artifactType: String(raw.artifact_type ?? "artifact"),
    title: String(raw.title ?? ""),
    content: String(raw.content ?? ""),
    status: String(raw.status ?? "draft"),
    sourceIds: Array.isArray(metadata.source_ids)
      ? (metadata.source_ids as Array<number | string>)
      : [],
    createdAt: raw.created_at == null ? null : String(raw.created_at),
    updatedAt: raw.updated_at == null ? null : String(raw.updated_at),
  };
}

function sessionStatusFromState(
  state: Record<string, unknown>,
  messages: Array<{ role: "user" | "assistant"; createdAt: string }>,
): MedicationSnapshot["status"] {
  const questions = Array.isArray(state.questions)
    ? (state.questions as Array<Record<string, unknown>>)
    : [];
  if (!questions.length) return "ready";

  const latestQuestionTime = Math.max(
    ...questions.map((question) => Date.parse(String(question.created_at ?? ""))),
  );
  const latestUserMessageTime = Math.max(
    ...messages
      .filter((message) => message.role === "user")
      .map((message) => Date.parse(message.createdAt)),
  );

  if (!Number.isFinite(latestQuestionTime)) {
    return messages.some((message) => message.role === "user") ? "ready" : "waiting";
  }
  return latestUserMessageTime > latestQuestionTime ? "ready" : "waiting";
}

async function errorFromResponse(res: Response): Promise<Error> {
  const body = await res.json().catch(() => null);
  return new Error(body?.detail ?? `HTTP ${res.status}`);
}
