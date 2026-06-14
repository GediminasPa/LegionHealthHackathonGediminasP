import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ArrowUp,
  ChevronRight,
  CheckCircle2,
  CircleDot,
  FileText,
  Loader2,
  MessageCircle,
  Route,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { postMedicationMessage, streamMedicationRun } from "./api";
import { formatCents } from "./CostTracker";
import type {
  ActivityEvent,
  AffordabilityOption,
  ArtifactRecord,
  ChatMessage,
  MedicationIntakeData,
  MedicationRunEvent,
  MedicationSnapshot,
  SourceRecord,
} from "./medicationTypes";

type Props = {
  snapshot: MedicationSnapshot;
  setSnapshot: Dispatch<SetStateAction<MedicationSnapshot | null>>;
};

const STREAMING_ASSISTANT_ID = "assistant-streaming";
const autoStartedSessionIds = globalStringSet("__copayGuardAutoStartedSessionIds");
const requestedRunKeys = globalStringSet("__copayGuardRequestedRunKeys");
const runningSessionIds = globalStringSet("__copayGuardRunningSessionIds");

export default function MedicationWorkspace({ snapshot, setSnapshot }: Props) {
  const [running, setRunning] = useState(false);
  const [draft, setDraft] = useState("");
  const autoRunStarted = useRef(false);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [snapshot.sessionId]);

  const applyEvent = useCallback(
    (event: MedicationRunEvent) => {
      setSnapshot((current) => {
        if (!current) return current;
        const payload = event.payload;
        if (event.type === "agent_delta") {
          return {
            ...current,
            messages: applyAssistantDelta(
              current.messages,
              String(payload.delta ?? ""),
            ),
            status: "investigating",
          };
        }
        if (event.type === "agent_message") {
          return {
            ...current,
            messages: applyFinalAssistantMessage(
              current.messages,
              String(payload.content ?? ""),
            ),
          };
        }
        if (
          event.type === "activity_started" ||
          event.type === "activity_updated" ||
          event.type === "activity_completed"
        ) {
          const activity = activityFromPayload(payload, event.type);
          return {
            ...current,
            status:
              event.type === "activity_started" && !hasPendingFollowUp(current.messages)
                ? "investigating"
                : current.status,
            activities: upsertById(current.activities, activity),
          };
        }
        if (event.type === "tool_call" || event.type === "tool_result") {
          return {
            ...current,
            activities: [
              ...current.activities,
              toolActivityFromPayload(payload, event.type, current.activities.length),
            ],
          };
        }
        if (event.type === "question") {
          const question = patientFriendlyQuestion(String(payload.question ?? payload.content ?? ""));
          return {
            ...current,
            messages: question
              ? [
                  ...current.messages,
                  assistantMessage(`I need one detail: ${question}`, current.messages.length),
                ]
              : current.messages,
            status: "waiting",
            activities: [
              ...current.activities,
              {
                id: `question-${Date.now()}-${current.activities.length}`,
                eventType: "question",
                title: "Question asked",
                summary: question,
                status: "warning",
                createdAt: new Date().toISOString(),
              },
            ],
          };
        }
        if (event.type === "source_added") {
          return {
            ...current,
            sources: upsertById(current.sources, sourceFromPayload(payload)),
          };
        }
        if (event.type === "option_added" || event.type === "option_updated") {
          return {
            ...current,
            options: upsertById(current.options, {
              id: String(payload.id),
              title: String(payload.title ?? "Affordability option"),
              summary: String(payload.summary ?? ""),
              confidence: String(payload.confidence ?? "needs_user_confirmation"),
              dropType: payload.drop_type == null ? undefined : String(payload.drop_type),
            }),
          };
        }
        if (event.type === "cost_tracker_update") {
          return {
            ...current,
            costTracker: {
              ...current.costTracker,
              quotedPriceCents: Number(
                payload.quoted_price_cents ?? current.costTracker.quotedPriceCents,
              ),
              currentBestLabel: String(
                payload.current_best_label ?? current.costTracker.currentBestLabel,
              ),
              currentBestEstimatedPriceCents:
                payload.current_best_estimated_price_cents == null
                  ? current.costTracker.currentBestEstimatedPriceCents
                  : Number(payload.current_best_estimated_price_cents),
              potentialDropCents:
                payload.potential_drop_cents == null
                  ? current.costTracker.potentialDropCents
                  : Number(payload.potential_drop_cents),
              dropType: String(
                payload.drop_type ?? current.costTracker.dropType,
              ) as typeof current.costTracker.dropType,
              confidence: String(
                payload.confidence ?? current.costTracker.confidence,
              ) as typeof current.costTracker.confidence,
              explanation: String(payload.explanation ?? current.costTracker.explanation),
              sourceIds: Array.isArray(payload.source_ids)
                ? (payload.source_ids as Array<number | string>)
                : current.costTracker.sourceIds,
            },
          };
        }
        if (event.type === "artifact_created" || event.type === "artifact_updated") {
          const artifact = artifactFromPayload(payload);
          return { ...current, artifacts: upsertById(current.artifacts, artifact) };
        }
        if (event.type === "case_state_patch" && typeof payload.state === "object") {
          const state = payload.state as Record<string, unknown>;
          return {
            ...current,
            flags: Array.isArray(state.flags) ? (state.flags as string[]) : current.flags,
            options: Array.isArray(state.options)
              ? (state.options as typeof current.options)
              : current.options,
            status: hasPendingFollowUp(current.messages) ? "waiting" : "investigating",
          };
        }
        if (event.type === "run_done") {
          return hasPendingFollowUp(current.messages)
            ? { ...current, status: "waiting" }
            : { ...current, status: "ready" };
        }
        if (event.type === "run_error") {
          const message = String(payload.message ?? "The investigation run failed.");
          return {
            ...current,
            status: "error",
            messages: [
              ...current.messages.filter((item) => item.id !== STREAMING_ASSISTANT_ID),
              assistantMessage(message, current.messages.length),
            ],
            activities: [
              ...current.activities,
              {
                id: `run-error-${Date.now()}`,
                eventType: "run_error",
                title: "Run failed",
                summary: message,
                status: "error",
                createdAt: new Date().toISOString(),
              },
            ],
          };
        }
        return current;
      });
    },
    [setSnapshot],
  );

  const startRun = useCallback(async (
    mode: "agent" | "mock" = "agent",
    requestToken = "initial",
  ) => {
    const requestKey = `${snapshot.sessionId}:${mode}:${requestToken}`;
    const runKey = `${snapshot.sessionId}:${mode}`;
    if (requestedRunKeys.has(requestKey)) return;
    if (runningSessionIds.has(runKey)) return;
    requestedRunKeys.add(requestKey);
    runningSessionIds.add(runKey);
    setRunning(true);
    setSnapshot((current) => (current ? { ...current, status: "investigating" } : current));
    try {
      for await (const event of streamMedicationRun(snapshot.sessionId, mode)) {
        applyEvent(event);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The investigation run failed.";
      applyEvent({ type: "run_error", payload: { message } });
    } finally {
      runningSessionIds.delete(runKey);
      setRunning(false);
    }
  }, [applyEvent, setSnapshot, snapshot.sessionId]);

  useEffect(() => {
    if (
      snapshot.status === "intake" &&
      !autoRunStarted.current &&
      !autoStartedSessionIds.has(snapshot.sessionId)
    ) {
      autoRunStarted.current = true;
      autoStartedSessionIds.add(snapshot.sessionId);
      void startRun("agent", "initial");
    }
  }, [snapshot.status, startRun]);

  async function handleSend(content: string) {
    const message: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setSnapshot((current) =>
      current
        ? { ...current, messages: [...current.messages, message], status: "investigating" }
        : current,
    );
    await postMedicationMessage(snapshot.sessionId, content);
    await startRun("agent", message.id);
  }

  async function submitFollowUp() {
    const content = draft.trim();
    if (!content || running) return;
    setDraft("");
    await handleSend(content);
  }

  const statusText = reviewStatusText(snapshot, running);

  return (
    <main className="flex min-h-0 flex-1 overflow-hidden bg-[#1f1e1d]">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1500px] flex-col px-3 py-3 sm:px-5 lg:px-8">
        <div className="workspace-grid grid h-full min-h-0 w-full flex-1 gap-4">
          <section className="workspace-primary flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
            <AgentWorkPanel
              draft={draft}
              running={running}
              setDraft={setDraft}
              snapshot={snapshot}
              status={snapshot.status}
              statusText={statusText}
              submitFollowUp={submitFollowUp}
            />
            {snapshot.status === "error" ? (
              <RunError running={running} startRun={() => void startRun("mock", "manual-mock")} />
            ) : null}
          </section>

          <aside className="workspace-panel-height workspace-sidebar scrollbar-soft flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-y-auto">
            <CaseReviewHeader
              intake={snapshot.intake}
              running={running}
              status={snapshot.status}
              statusText={statusText}
            />
            <RouteSummary options={snapshot.options} />
            <CaseSnapshot intake={snapshot.intake} flags={snapshot.flags} />
            <DraftSummary artifactCount={snapshot.artifacts.length} />
          </aside>
        </div>
      </div>
    </main>
  );
}

function CaseReviewHeader({
  intake,
  running,
  status,
  statusText,
}: {
  intake: MedicationIntakeData;
  running: boolean;
  status: MedicationSnapshot["status"];
  statusText: string;
}) {
  return (
    <section className="border border-white/12 bg-[#2b2928] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="ui-sans text-xs font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]">
            Case review
          </p>
          <h2 className="mt-2 break-words text-2xl font-semibold leading-8 text-[#f7f2ec]">
            {intake.medicationName || "Medication review"}
          </h2>
          <p className="ui-sans mt-2 max-w-[72ch] text-sm leading-6 text-[#c7c0b8]">
            {intake.planName || intake.insuranceType}
            {intake.quotedPriceCents > 0 ? `, quoted at ${formatCents(intake.quotedPriceCents)}` : ""}
          </p>
        </div>
        <span className={`ui-sans inline-flex shrink-0 items-center gap-2 border px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] ${statusBadgeClass(status)}`}>
          {running ? (
            <Loader2 className="animate-spin text-[#ef6844]" size={14} />
          ) : (
            <StatusIcon status={status} size={14} />
          )}
          {statusText}
        </span>
      </div>
    </section>
  );
}

function RunError({
  running,
  startRun,
}: {
  running: boolean;
  startRun: () => void;
}) {
  return (
    <div className="ui-sans flex flex-wrap items-center justify-between gap-3 border border-[#ff8a7c]/40 bg-[#2b1410] px-4 py-3 text-sm text-[#ffd9d3]">
      <span className="inline-flex items-center gap-2">
        <XCircle size={17} />
        The live agent run failed. You can run the local demo stream.
      </span>
      <button
        className="button-press bg-[#ef6844] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white hover:bg-[#ff7a52] disabled:cursor-not-allowed disabled:bg-[#3a302c] disabled:text-[#777777]"
        disabled={running}
        type="button"
        onClick={startRun}
      >
        Run mock demo
      </button>
    </div>
  );
}

function AgentWorkPanel({
  draft,
  running,
  setDraft,
  snapshot,
  status,
  statusText,
  submitFollowUp,
}: {
  draft: string;
  running: boolean;
  setDraft: Dispatch<SetStateAction<string>>;
  snapshot: MedicationSnapshot;
  status: MedicationSnapshot["status"];
  statusText: string;
  submitFollowUp: () => Promise<void>;
}) {
  const resultPacket = useMemo(() => buildResultPacket(snapshot), [snapshot]);

  return (
    <section className="workspace-panel-height flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden border border-white/12 bg-[#2b2928]">
      <div className="border-b border-white/12 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center bg-[#ef6844] text-white">
              <MessageCircle size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[#f7f2ec]">Agent chat</h2>
              <p className="ui-sans mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]">
                {statusText}
              </p>
            </div>
          </div>
          {running ? (
            <Loader2 className="shrink-0 animate-spin text-[#ef6844]" size={18} />
          ) : (
            <StatusIcon className="shrink-0 text-[#c7c0b8]" status={status} size={18} />
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <ResultPacketView messages={snapshot.messages} packet={resultPacket} running={running} />
        <FollowUpComposer
          draft={draft}
          running={running}
          setDraft={setDraft}
          submitFollowUp={submitFollowUp}
        />
      </div>
    </section>
  );
}

type CaseResultPacket = {
  status: MedicationSnapshot["status"];
  case: {
    patient: string;
    medication: string;
    plan: string;
    insurance: string;
    pa_status: string;
    diagnosis: string;
  };
  costs: {
    quoted_price: { cents: number; formatted: string };
    best_price: { label: string; cents: number | null; formatted: string };
    potential_savings: { cents: number | null; formatted: string | null };
    confidence: string;
  };
  what_we_found: string;
  best_route: {
    title: string;
    summary: string;
    confidence: string;
    drop_type: string | null;
  } | null;
  resources: Array<{
    title: string;
    publisher: string | null;
    url: string;
    summary: string | null;
  }>;
  next_steps: string[];
  guardrails: string[];
  drafts: Array<{
    title: string;
    type: string;
    status: string;
  }>;
};

function ResultPacketView({
  messages,
  packet,
  running,
}: {
  messages: ChatMessage[];
  packet: CaseResultPacket;
  running: boolean;
}) {
  const visibleMessages = messages.filter(
    (message) => message.role !== "assistant" || message.content.trim(),
  );

  return (
    <article className="agent-transcript-scroll min-h-0 flex-1 overflow-y-auto bg-[#1f1e1d] px-5 py-6 sm:px-7">
      <div className="mx-auto max-w-[68rem]">
        {packet.status === "ready" && packet.best_route ? (
          <AgentAnswerText packet={packet} />
        ) : visibleMessages.length ? (
          <AgentMessageStream messages={visibleMessages} />
        ) : (
          <AgentWorkingText packet={packet} running={running} />
        )}
      </div>
    </article>
  );
}

function AgentMessageStream({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="ui-sans space-y-5 text-sm leading-7 text-[#ded8d0]">
      {messages.map((message) => (
        <p
          className={message.role === "user" ? "text-[#f7f2ec]" : "whitespace-pre-wrap"}
          key={message.id}
        >
          {formatChatMessage(message)}
        </p>
      ))}
    </div>
  );
}

function formatChatMessage(message: ChatMessage): string {
  if (message.role === "user") return `You: ${message.content}`;
  const content = message.content.trim();
  const followUp = content.replace(/^I need one detail:\s*/i, "").trim();
  if (followUp !== content) return `I need one detail: ${patientFriendlyQuestion(followUp)}`;
  return patientFriendlyQuestion(content);
}

function patientFriendlyQuestion(question: string): string {
  const value = question.trim().replace(/\s+/g, " ");
  const lower = value.toLowerCase();
  if (
    (lower.includes("accumulator") || lower.includes("maximizer")) &&
    (lower.includes("copay") ||
      lower.includes("coupon") ||
      lower.includes("deductible") ||
      lower.includes("oop"))
  ) {
    return (
      "When you used or expected the copay card, did the pharmacy, coupon terms, or insurance " +
      "portal say the discount would not count toward your deductible or out-of-pocket total? " +
      "If you are not sure, paste the message or plan wording and I will interpret it."
    );
  }
  return value
    .replace(/\bOOP\b/g, "out-of-pocket")
    .replace(/\bPA\b/g, "prior authorization")
    .replace(/\bST\b/g, "step therapy")
    .replace(/\bQL\b/g, "quantity limit")
    .replace(/manufacturer copay assistance/gi, "manufacturer copay card")
    .replace(/eligibility/gi, "whether you qualify");
}

function AgentWorkingText({
  packet,
  running,
}: {
  packet: CaseResultPacket;
  running: boolean;
}) {
  const medication = packet.case.medication || "this medication";
  const quotedPrice =
    packet.costs.quoted_price.cents > 0
      ? ` The current quote is ${packet.costs.quoted_price.formatted}.`
      : "";

  return (
    <div className="ui-sans text-sm leading-7 text-[#ded8d0]">
      <p>
        {running
          ? `Checking ${medication} coverage, pricing routes, support programs, and pharmacy options.${quotedPrice}`
          : `Ready to continue the ${medication} review.`}
      </p>
    </div>
  );
}

function AgentAnswerText({ packet }: { packet: CaseResultPacket }) {
  const resourceList = packet.resources.slice(0, 5);
  const bestPriceLabel =
    packet.costs.best_price.cents == null || !packet.costs.best_price.label
      ? ""
      : ` (${packet.costs.best_price.label})`;
  const potentialSavings =
    packet.costs.potential_savings.cents == null || packet.costs.potential_savings.cents <= 0
      ? "needs an actual fill price"
      : packet.costs.potential_savings.formatted;

  return (
    <div className="ui-sans space-y-5 text-sm leading-7 text-[#ded8d0]">
      <p className="text-base font-semibold leading-7 text-[#f7f2ec]">
        Reviewing {packet.case.medication || "this medication"} for {packet.case.insurance}.
      </p>

      <section className="space-y-1">
        <h3 className="font-semibold text-[#f7f2ec]">1. Summary</h3>
        <p>{packet.what_we_found}</p>
      </section>

      <section className="space-y-1">
        <h3 className="font-semibold text-[#f7f2ec]">2. Price read</h3>
        <p>Quoted price: {packet.costs.quoted_price.formatted}</p>
        <p>
          Best current estimate: {packet.costs.best_price.formatted}
          {bestPriceLabel}
        </p>
        <p>Potential savings: {potentialSavings}</p>
        <p>Confidence: {labelize(packet.costs.confidence)}</p>
      </section>

      <section className="space-y-1">
        <h3 className="font-semibold text-[#f7f2ec]">3. Best route</h3>
        {packet.best_route ? (
          <>
            <p>{packet.best_route.title}</p>
            <p>{packet.best_route.summary}</p>
          </>
        ) : (
          <p>
            No route is ranked yet. I need the pharmacy estimate, preferred pharmacy, and plan rule
            details before making a recommendation.
          </p>
        )}
      </section>

      <section className="space-y-1">
        <h3 className="font-semibold text-[#f7f2ec]">4. Resources</h3>
        {resourceList.length ? (
          <ol className="list-decimal space-y-1 pl-5">
            {resourceList.map((source) => (
              <li key={`${source.title}-${source.url}`}>
                {source.url ? (
                  <a
                    className="text-[#ffd0be] underline decoration-[#ef6844]/50 underline-offset-4 hover:text-white"
                    href={source.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {source.publisher || source.title}
                  </a>
                ) : (
                  source.publisher || source.title
                )}
                {source.summary ? ` - ${source.summary}` : ""}
              </li>
            ))}
          </ol>
        ) : (
          <p>No evidence sources have been saved yet.</p>
        )}
      </section>

      <section className="space-y-1">
        <h3 className="font-semibold text-[#f7f2ec]">5. Next steps</h3>
        <ol className="list-decimal space-y-1 pl-5">
          {packet.next_steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function buildResultPacket(snapshot: MedicationSnapshot): CaseResultPacket {
  const bestRoute = snapshot.options[0] ?? null;
  const bestPriceCents = snapshot.costTracker.currentBestEstimatedPriceCents;
  const explanation = userFacingResultSummary(snapshot);
  return {
    status: snapshot.status,
    case: {
      patient: snapshot.intake.patientName || "Patient",
      medication: [snapshot.intake.medicationName, snapshot.intake.strength]
        .filter(Boolean)
        .join(" "),
      plan: snapshot.intake.planName || "Unknown plan",
      insurance: snapshot.intake.insuranceType,
      pa_status: snapshot.intake.paStatus,
      diagnosis: snapshot.intake.diagnosis || "Not provided",
    },
    costs: {
      quoted_price: {
        cents: snapshot.costTracker.quotedPriceCents,
        formatted: formatCents(snapshot.costTracker.quotedPriceCents),
      },
      best_price: {
        label: snapshot.costTracker.currentBestLabel || "Best estimate",
        cents: bestPriceCents,
        formatted: bestPriceCents == null ? "Needs confirmation" : formatCents(bestPriceCents),
      },
      potential_savings: {
        cents: snapshot.costTracker.potentialDropCents,
        formatted:
          snapshot.costTracker.potentialDropCents == null
            ? null
            : formatCents(snapshot.costTracker.potentialDropCents),
      },
      confidence: snapshot.costTracker.confidence,
    },
    what_we_found: explanation,
    best_route: bestRoute
      ? {
          title: bestRoute.title,
          summary: bestRoute.summary,
          confidence: bestRoute.confidence,
          drop_type: bestRoute.dropType ?? null,
        }
      : null,
    resources: snapshot.sources.map((source) => ({
      title: source.title,
      publisher: source.publisher ?? null,
      url: source.url,
      summary: source.summary ?? null,
    })),
    next_steps: deriveNextSteps(snapshot),
    guardrails: snapshot.flags.map(labelize),
    drafts: snapshot.artifacts.map((artifact) => ({
      title: artifact.title,
      type: labelize(artifact.artifactType),
      status: artifact.status,
    })),
  };
}

function userFacingResultSummary(snapshot: MedicationSnapshot): string {
  const explanation = snapshot.costTracker.explanation?.trim();
  if (explanation && explanation !== "Investigation has not started yet.") {
    return explanation;
  }

  if (snapshot.intake.quotedPriceCents <= 0) {
    return [
      "This is a pre-fill review.",
      "I do not have an actual pharmacy quote yet, so the next move is to check likely cost blockers,",
      "covered alternatives, and cash-versus-insurance pricing before pickup.",
    ].join(" ");
  }

  if (snapshot.status === "investigating") {
    return "I am checking coverage, pricing, assistance, and pharmacy routes for this case.";
  }

  if (latestFollowUpQuestion(snapshot.messages)) {
    return "I need one more detail before ranking a route.";
  }

  return "I do not have enough validated data to rank a route yet. Confirm the missing plan and pharmacy details first.";
}

function deriveNextSteps(snapshot: MedicationSnapshot): string[] {
  if (snapshot.intake.quotedPriceCents <= 0) {
    return [
      "Confirm the expected pharmacy price or plan estimate.",
      "Check whether prior authorization, step therapy, formulary tier, or quantity limits apply.",
      "Ask whether a covered generic, biosimilar, or clinically appropriate alternative is preferred.",
      "Compare insurance processing against cash or discount pricing before pickup.",
    ];
  }

  const pendingQuestion = latestFollowUpQuestion(snapshot.messages);
  if (pendingQuestion) {
    return [`Answer the follow-up so I can rank the route: ${pendingQuestion}`];
  }

  const artifactSteps = extractActionItems(snapshot.artifacts[0]?.content ?? "");
  if (artifactSteps.length) return artifactSteps.slice(0, 5);

  if (snapshot.options.length) {
    return [
      "Confirm the quoted price and eligibility details with the pharmacy or plan.",
      "Use the top ranked route first, then keep the fallback routes ready.",
      "Save the listed resources as evidence for any plan call, appeal, or exception request.",
    ];
  }

  if (snapshot.status === "investigating") {
    return ["Wait for CopayGuard to finish the structured affordability result."];
  }

  return [
    "Add the missing quote, plan, deductible, out-of-pocket, quantity, or preferred pharmacy details.",
  ];
}

function latestFollowUpQuestion(messages: ChatMessage[]): string | null {
  const question = [...messages]
    .reverse()
    .find((message) =>
      message.content.trim().toLowerCase().startsWith("i need one detail:"),
    );
  return question?.content.replace(/^I need one detail:\s*/i, "").trim() || null;
}

function extractActionItems(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, ""))
    .filter((line) => line.length > 0)
    .filter((line) => !line.endsWith(":"))
    .filter((line) => !line.toLowerCase().startsWith("patient:"))
    .filter((line) => !line.toLowerCase().startsWith("medication:"))
    .filter((line) => !line.toLowerCase().startsWith("diagnosis:"));
}

function RouteSummary({ options }: { options: AffordabilityOption[] }) {
  const topRoute = options[0];

  return (
    <details className="sidebar-disclosure border border-white/12 bg-[#2b2928]">
      <summary className="list-none p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold text-[#f7f2ec]">
              <Route size={17} />
              Best routes so far
            </h2>
            <p className="ui-sans mt-2 truncate text-xs leading-5 text-[#c7c0b8]">
              {topRoute ? `Top route: ${topRoute.title}` : "No ranked routes yet"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="ui-sans border border-white/12 bg-[#1f1e1d] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]">
              {options.length} found
            </span>
            <ChevronRight className="sidebar-disclosure-chevron text-[#8f8780]" size={17} />
          </div>
        </div>
      </summary>

      <div className="grid gap-3 border-t border-white/12 p-4 sm:p-5">
        {options.length === 0 ? (
          <p className="ui-sans border border-dashed border-white/12 bg-[#1f1e1d] p-3 text-sm leading-6 text-[#c7c0b8]">
            Ranked affordability routes will appear here as the agent validates them.
          </p>
        ) : null}
        {options.map((option, index) => (
          <article className="border border-white/12 bg-[#1f1e1d] p-3" key={option.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="min-w-0 text-sm font-semibold leading-6 text-[#f7f2ec]">
                {index + 1}. {option.title}
              </h3>
              <span className="ui-sans max-w-full shrink-0 break-words border border-white/12 bg-[#302e2c] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]">
                {labelize(option.confidence)}
              </span>
            </div>
            <p className="ui-sans mt-2 text-xs leading-5 text-[#c7c0b8]">{option.summary}</p>
            {option.dropType ? (
              <p className="ui-sans mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#ef6844]">
                {labelize(option.dropType)}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </details>
  );
}

function FollowUpComposer({
  draft,
  running,
  setDraft,
  submitFollowUp,
}: {
  draft: string;
  running: boolean;
  setDraft: Dispatch<SetStateAction<string>>;
  submitFollowUp: () => Promise<void>;
}) {
  return (
    <form
      className="rounded-[2rem] border border-white/16 bg-[#302e2c] p-2 shadow-[0_18px_70px_rgb(0_0_0/0.35)]"
      onSubmit={(event) => {
        event.preventDefault();
        void submitFollowUp();
      }}
    >
      <div className="flex items-center gap-2">
        <textarea
          aria-label="Ask a follow-up question"
          className="ui-sans max-h-28 min-h-12 flex-1 resize-none rounded-[1.5rem] border-0 bg-transparent px-3 py-3 text-sm leading-6 text-[#f7f2ec] outline-none placeholder:text-[#9c948e] sm:px-4"
          placeholder="Ask a follow-up question..."
          rows={1}
          value={draft}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submitFollowUp();
            }
          }}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          aria-label="Send follow-up"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#ef6844] text-white transition hover:bg-[#ff7a52] disabled:cursor-not-allowed disabled:bg-[#5f5a56] disabled:text-[#c7c0b8]"
          disabled={!draft.trim() || running}
          type="submit"
        >
          <ArrowUp size={22} />
        </button>
      </div>
    </form>
  );
}

function CaseSnapshot({
  intake,
  flags,
}: {
  intake: MedicationIntakeData;
  flags: string[];
}) {
  const compactSummary = compactCaseSummary(intake);

  return (
    <details className="sidebar-disclosure w-full min-w-0 overflow-hidden border border-white/12 bg-[#2b2928]">
      <summary className="list-none p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#f7f2ec]">Case</h2>
            <p className="ui-sans mt-2 text-xs leading-5 text-[#c7c0b8]">{compactSummary}</p>
          </div>
          <ChevronRight className="sidebar-disclosure-chevron mt-0.5 shrink-0 text-[#8f8780]" size={17} />
        </div>
      </summary>

      <div className="border-t border-white/12 p-4">
        <dl className="grid grid-cols-2 gap-2">
          <Fact label="Client" value={intake.patientName || "Patient"} />
          <Fact label="Medication" value={intake.medicationName || "Medication"} />
          <Fact label="Plan" value={intake.planName || intake.insuranceType} />
          <Fact label="Quote" value={formatCents(intake.quotedPriceCents)} />
        </dl>
        <div className="mt-3 border border-white/12 bg-[#1f1e1d] p-3">
          <p className="ui-sans flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#f7f2ec]">
            <ShieldCheck size={15} />
            Guardrails
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(flags.length ? flags : ["confirm eligibility", "no guaranteed savings"])
              .slice(0, 4)
              .map((flag) => (
                <span
                  className="ui-sans border border-white/12 bg-[#2b2928] px-2 py-1 text-xs font-semibold text-[#c7c0b8]"
                  key={flag}
                >
                  {labelize(flag)}
                </span>
              ))}
          </div>
        </div>
      </div>
    </details>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 overflow-hidden border border-white/12 bg-[#1f1e1d] p-2.5">
      <dt className="ui-sans text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]">
        {label}
      </dt>
      <dd className="mt-1 break-words text-xs font-semibold leading-5 text-[#f7f2ec]">{value}</dd>
    </div>
  );
}

function compactCaseSummary(intake: MedicationIntakeData): string {
  return [
    intake.patientName || "Patient",
    intake.medicationName || "Medication",
    intake.planName || intake.insuranceType,
    intake.quotedPriceCents > 0 ? `${formatCents(intake.quotedPriceCents)} quote` : null,
  ]
    .filter(Boolean)
    .join(" / ");
}

function DraftSummary({ artifactCount }: { artifactCount: number }) {
  return (
    <section className="w-full min-w-0 overflow-hidden border border-white/12 bg-[#2b2928] p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold text-[#f7f2ec]">
        <FileText size={17} />
        Drafts
      </h2>
      <p className="ui-sans mt-2 text-sm leading-6 text-[#c7c0b8]">
        {artifactCount
          ? `${artifactCount} draft${artifactCount === 1 ? "" : "s"} prepared for calls, messages, or appeals.`
          : "Drafts will appear after the agent identifies the right next step."}
      </p>
    </section>
  );
}

function reviewStatusText(
  snapshot: MedicationSnapshot,
  running: boolean,
): string {
  if (snapshot.status === "error") return "Review paused";
  if (running) return "Building result";
  if (snapshot.status === "waiting") return "Needs follow-up";
  if (snapshot.status === "ready") return "Review complete";
  return "Preparing review";
}

function statusBadgeClass(status: MedicationSnapshot["status"]): string {
  if (status === "ready") return "border-[#5a5a5a] bg-[#1f1e1d] text-[#f7f2ec]";
  if (status === "error") return "border-[#ff8a7c]/45 bg-[#1f1e1d] text-[#ffd9d3]";
  if (status === "waiting") return "border-[#ffc36a]/55 bg-[#1f1e1d] text-[#ffc36a]";
  if (status === "investigating") return "border-[#ef6844]/60 bg-[#1f1e1d] text-[#ef6844]";
  return "border-white/12 bg-[#1f1e1d] text-[#c7c0b8]";
}

function StatusIcon({
  className,
  size,
  status,
}: {
  className?: string;
  size: number;
  status: MedicationSnapshot["status"];
}) {
  if (status === "ready") return <CheckCircle2 className={className} size={size} />;
  if (status === "error") return <XCircle className={className} size={size} />;
  if (status === "waiting") return <MessageCircle className={className} size={size} />;
  return <CircleDot className={className} size={size} />;
}

function globalStringSet(key: string): Set<string> {
  const scope = globalThis as typeof globalThis & Record<string, Set<string> | undefined>;
  const existing = scope[key];
  if (existing) return existing;
  const created = new Set<string>();
  scope[key] = created;
  return created;
}

function labelize(value: string): string {
  return value.replaceAll("_", " ");
}

function assistantMessage(content: string, index: number): ChatMessage {
  return {
    id: `assistant-${Date.now()}-${index}`,
    role: "assistant",
    content,
    createdAt: new Date().toISOString(),
  };
}

function applyAssistantDelta(messages: ChatMessage[], delta: string): ChatMessage[] {
  if (!delta) return messages;
  const index = messages.findIndex((message) => message.id === STREAMING_ASSISTANT_ID);
  if (index === -1) {
    return [
      ...messages,
      {
        id: STREAMING_ASSISTANT_ID,
        role: "assistant",
        content: delta,
        createdAt: new Date().toISOString(),
      },
    ];
  }
  return messages.map((message, messageIndex) =>
    messageIndex === index ? { ...message, content: `${message.content}${delta}` } : message,
  );
}

function applyFinalAssistantMessage(messages: ChatMessage[], content: string): ChatMessage[] {
  const filtered = messages.filter((message) => message.id !== STREAMING_ASSISTANT_ID);
  if (!content.trim()) return filtered;
  return [...filtered, assistantMessage(content, filtered.length)];
}

function hasPendingFollowUp(messages: ChatMessage[]): boolean {
  let latestQuestionIndex = -1;
  let latestUserIndex = -1;
  messages.forEach((message, index) => {
    if (message.role === "user") {
      latestUserIndex = index;
      return;
    }
    if (message.content.trim().toLowerCase().startsWith("i need one detail:")) {
      latestQuestionIndex = index;
    }
  });
  return latestQuestionIndex !== -1 && latestUserIndex < latestQuestionIndex;
}

function activityFromPayload(payload: Record<string, unknown>, eventType: string): ActivityEvent {
  return {
    id: String(payload.id ?? payload.title ?? eventType),
    eventType,
    title: String(payload.title ?? "Activity"),
    summary: String(payload.summary ?? ""),
    status: eventType.includes("completed") ? "completed" : "running",
    createdAt: new Date().toISOString(),
  };
}

function toolActivityFromPayload(
  payload: Record<string, unknown>,
  eventType: string,
  index: number,
): ActivityEvent {
  const name = String(payload.name ?? "tool");
  const label = toolLabel(name);
  return {
    id: `${eventType}-${name}-${Date.now()}-${index}`,
    eventType,
    title: eventType === "tool_call" ? label.running : label.done,
    summary: summarizeToolPayload(payload),
    status: eventType === "tool_call" ? "running" : "completed",
    createdAt: new Date().toISOString(),
  };
}

function summarizeToolPayload(payload: Record<string, unknown>): string {
  const name = String(payload.name ?? "");
  if (name === "update_cost_tracker") return "Refreshing expected cost, savings type, and confidence.";
  if (name === "ask_question") return "The agent needs one answer before it can narrow the recommendation.";
  if (name === "save_option") return "Adding a ranked affordability route to the review.";
  if (name === "save_source") return "Saving an evidence source for the recommendation.";
  if (name === "save_artifact") return "Preparing a reusable draft for the next step.";
  if (name === "get_session_context") return "Reading case details and previous messages.";
  if (typeof payload.summary === "string") return payload.summary;
  return "";
}

function toolLabel(name: string): { running: string; done: string } {
  const labels: Record<string, { running: string; done: string }> = {
    ask_question: {
      running: "Preparing follow-up question",
      done: "Follow-up question ready",
    },
    get_session_context: {
      running: "Reading case context",
      done: "Case context loaded",
    },
    save_artifact: {
      running: "Drafting next-step artifact",
      done: "Draft artifact prepared",
    },
    save_option: {
      running: "Ranking affordability route",
      done: "Affordability route saved",
    },
    save_source: {
      running: "Saving evidence source",
      done: "Evidence source saved",
    },
    update_cost_tracker: {
      running: "Updating cost estimate",
      done: "Cost estimate updated",
    },
  };
  return labels[name] ?? {
    running: `Running ${labelize(name)}`,
    done: `${labelize(name)} complete`,
  };
}

function sourceFromPayload(payload: Record<string, unknown>): SourceRecord {
  return {
    id: String(payload.id),
    title: String(payload.title ?? "Source"),
    url: String(payload.url ?? ""),
    publisher: payload.publisher == null ? null : String(payload.publisher),
    summary: payload.summary == null ? null : String(payload.summary),
    checkedAt: payload.checked_at == null ? new Date().toISOString() : String(payload.checked_at),
    confidence: payload.confidence == null ? null : Number(payload.confidence),
  };
}

function artifactFromPayload(payload: Record<string, unknown>): ArtifactRecord {
  return {
    id: String(payload.id),
    artifactType: String(payload.artifact_type ?? "artifact"),
    title: String(payload.title ?? "Artifact"),
    content: String(payload.content ?? ""),
    status: String(payload.status ?? "draft"),
    sourceIds: Array.isArray(payload.source_ids) ? (payload.source_ids as Array<number | string>) : [],
    createdAt: payload.created_at == null ? null : String(payload.created_at),
    updatedAt: payload.updated_at == null ? null : String(payload.updated_at),
  };
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) return [...items, item];
  return items.map((existing, itemIndex) => (itemIndex === index ? item : existing));
}
