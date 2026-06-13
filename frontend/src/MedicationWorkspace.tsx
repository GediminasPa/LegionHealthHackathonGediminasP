import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ArrowUp,
  Bot,
  ChevronDown,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  FileText,
  Loader2,
  MessageCircle,
  Route,
  Search,
  ShieldCheck,
  WalletCards,
  XCircle,
} from "lucide-react";
import { postMedicationMessage, streamMedicationRun } from "./api";
import { formatCents } from "./CostTracker";
import type {
  ActivityEvent,
  AffordabilityOption,
  ArtifactRecord,
  ChatMessage,
  CostTrackerState,
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

export default function MedicationWorkspace({ snapshot, setSnapshot }: Props) {
  const [running, setRunning] = useState(false);
  const [draft, setDraft] = useState("");
  const autoRunStarted = useRef(false);

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
            status: event.type === "activity_started" ? "investigating" : current.status,
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
          const question = String(payload.question ?? payload.content ?? "");
          return {
            ...current,
            messages: question
              ? [
                  ...current.messages,
                  assistantMessage(`I need one detail: ${question}`, current.messages.length),
                ]
              : current.messages,
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
            status: "investigating",
          };
        }
        if (event.type === "run_done") return { ...current, status: "ready" };
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

  const startRun = useCallback(async (mode: "agent" | "mock" = "agent") => {
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
      setRunning(false);
    }
  }, [applyEvent, setSnapshot, snapshot.sessionId]);

  useEffect(() => {
    if (snapshot.status === "intake" && !autoRunStarted.current) {
      autoRunStarted.current = true;
      void startRun();
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
    await startRun();
  }

  async function submitFollowUp() {
    const content = draft.trim();
    if (!content || running) return;
    setDraft("");
    await handleSend(content);
  }

  const assistantMessages = useMemo(
    () => snapshot.messages.filter((message) => message.role === "assistant"),
    [snapshot.messages],
  );
  const latestActivity = snapshot.activities.at(-1);
  const statusText = reviewStatusText(snapshot, running, latestActivity);
  const reviewQuestion = buildReviewQuestion(snapshot.intake);

  return (
    <main className="min-h-[calc(100dvh-80px)] bg-[#1f1e1d]">
      <div className="mx-auto flex min-h-[calc(100dvh-80px)] max-w-[1480px] flex-col px-4 pb-5 pt-5 sm:px-6 lg:px-10">
        <section className="relative mx-auto w-full max-w-[1120px]">
          <div className="pointer-events-none absolute -left-8 top-1 hidden h-28 w-28 rounded-full border-[12px] border-[#ef6844] border-r-transparent lg:block" />
          <div className="relative flex min-h-20 items-center gap-4 rounded-[2rem] border border-white/18 bg-[#302e2c] px-5 py-4 shadow-[0_18px_60px_rgb(0_0_0/0.22)] sm:px-7">
            <Search className="shrink-0 text-[#ef6844]" size={22} />
            <p className="min-w-0 flex-1 text-xl leading-8 text-[#f7f2ec] sm:text-2xl">
              {reviewQuestion}
            </p>
          </div>

          <div className="ui-sans mt-7 flex flex-wrap items-center gap-3 text-sm font-semibold text-[#c7c0b8]">
            <span className="inline-flex items-center gap-2">
              {running ? <Loader2 className="animate-spin text-[#ef6844]" size={17} /> : <CheckCircle2 size={17} />}
              {statusText}
            </span>
            <ChevronDown size={16} />
          </div>

          {snapshot.status === "error" ? (
            <div className="ui-sans mt-5 flex flex-wrap items-center justify-between gap-3 border border-[#ff8a7c]/40 bg-[#2b1410] px-4 py-3 text-sm text-[#ffd9d3]">
              <span className="inline-flex items-center gap-2">
                <XCircle size={17} />
                The live agent run failed. You can run the local demo stream.
              </span>
              <button
                className="button-press bg-[#ef6844] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white hover:bg-[#ff7a52] disabled:cursor-not-allowed disabled:bg-[#3a302c] disabled:text-[#777777]"
                disabled={running}
                type="button"
                onClick={() => void startRun("mock")}
              >
                Run mock demo
              </button>
            </div>
          ) : null}
        </section>

        <div className="mx-auto mt-8 grid w-full max-w-[1120px] flex-1 gap-7 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0">
            <AgentTranscript
              assistantMessages={assistantMessages}
              running={running}
              sources={snapshot.sources}
            />
            <RouteSummary options={snapshot.options} />
            <FollowUpComposer
              draft={draft}
              running={running}
              setDraft={setDraft}
              submitFollowUp={submitFollowUp}
            />
          </section>

          <aside className="grid content-start gap-4 xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto xl:pb-4">
            <CostImpact tracker={snapshot.costTracker} />
            <CaseSnapshot intake={snapshot.intake} flags={snapshot.flags} status={snapshot.status} />
            <LiveActivity activities={snapshot.activities} running={running} />
            <DraftSummary artifactCount={snapshot.artifacts.length} />
          </aside>
        </div>
      </div>
    </main>
  );
}

function AgentTranscript({
  assistantMessages,
  running,
  sources,
}: {
  assistantMessages: ChatMessage[];
  running: boolean;
  sources: SourceRecord[];
}) {
  return (
    <article className="min-h-[34rem] border border-white/12 bg-[#1f1e1d] px-5 py-5 sm:px-7 sm:py-7">
      {assistantMessages.length === 0 ? (
        <InitialResearchState running={running} />
      ) : (
        <div className="grid gap-8">
          {assistantMessages.map((message, index) => (
            <section className="grid gap-4" key={message.id}>
              {index > 0 ? (
                <div className="ui-sans flex items-center gap-2 border-t border-white/12 pt-6 text-xs font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]">
                  <MessageCircle size={14} />
                  Follow-up answer
                </div>
              ) : null}
              <AgentMarkdown content={message.content} />
            </section>
          ))}
        </div>
      )}

      {running ? (
        <div className="ui-sans mt-6 inline-flex items-center gap-2 border border-white/12 bg-[#302e2c] px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#ef6844]" />
          Summarizing
        </div>
      ) : null}

      {sources.length ? <SourceRibbon sources={sources} /> : null}
    </article>
  );
}

function InitialResearchState({ running }: { running: boolean }) {
  return (
    <div className="grid gap-6">
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ef6844] text-white">
          <Bot size={19} />
        </span>
        <div>
          <h2 className="text-2xl font-semibold leading-8 text-[#f7f2ec]">
            {running ? "Starting the affordability review." : "Ready to review the case."}
          </h2>
          <p className="ui-sans mt-2 max-w-[62ch] text-sm leading-6 text-[#c7c0b8]">
            I am checking coverage rules, patient assistance, savings routes, pharmacy options,
            and clinical guardrails before ranking the next steps.
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        {[0, 1, 2, 3].map((item) => (
          <div
            className="h-4 animate-pulse bg-[#302e2c]"
            key={item}
            style={{ width: `${92 - item * 13}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function AgentMarkdown({ content }: { content: string }) {
  const blocks = markdownBlocks(content);

  return (
    <div className="space-y-5 text-[1.08rem] leading-8 text-[#f7f2ec]">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const Heading = block.level === 2 ? "h2" : "h3";
          return (
            <Heading
              className="pt-2 text-2xl font-semibold leading-8 text-[#f7f2ec] sm:text-3xl"
              key={`${block.type}-${index}`}
            >
              {renderInline(block.text)}
            </Heading>
          );
        }

        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag
              className={`grid gap-2 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}
              key={`${block.type}-${index}`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ListTag>
          );
        }

        return (
          <p className="max-w-[72ch]" key={`${block.type}-${index}`}>
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}

type MarkdownBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

function markdownBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph.length = 0;
  }

  function flushList() {
    if (!list) return;
    blocks.push({ type: "list", ordered: list.ordered, items: list.items });
    list = null;
  }

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{2,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: heading[1].length === 2 ? 2 : 3,
        text: heading[2],
      });
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const orderedList = Boolean(ordered);
      if (!list || list.ordered !== orderedList) {
        flushList();
        list = { ordered: orderedList, items: [] };
      }
      list.items.push((unordered?.[1] ?? ordered?.[1] ?? "").trim());
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks.length ? blocks : [{ type: "paragraph", text: content }];
}

function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

function SourceRibbon({ sources }: { sources: SourceRecord[] }) {
  const visible = sources.slice(0, 5);
  const extraCount = Math.max(sources.length - visible.length, 0);

  return (
    <div className="ui-sans mt-7 flex flex-wrap items-center gap-2 border-t border-white/12 pt-5">
      {visible.map((source) =>
        source.url ? (
          <a
            className="inline-flex max-w-full items-center gap-2 rounded-full bg-[#625a55] px-3 py-1.5 text-sm font-semibold text-[#f7f2ec] hover:bg-[#746b65]"
            href={source.url}
            key={source.id}
            rel="noreferrer"
            target="_blank"
          >
            <span className="truncate">{source.publisher || source.title}</span>
            <ExternalLink className="shrink-0" size={13} />
          </a>
        ) : (
          <span
            className="inline-flex max-w-full items-center rounded-full bg-[#625a55] px-3 py-1.5 text-sm font-semibold text-[#f7f2ec]"
            key={source.id}
          >
            <span className="truncate">{source.publisher || source.title}</span>
          </span>
        ),
      )}
      {extraCount ? (
        <span className="rounded-full bg-[#625a55] px-3 py-1.5 text-sm font-semibold text-[#f7f2ec]">
          +{extraCount}
        </span>
      ) : null}
    </div>
  );
}

function RouteSummary({ options }: { options: AffordabilityOption[] }) {
  return (
    <section className="mt-5 border border-white/12 bg-[#2b2928] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-[#f7f2ec]">
          <Route size={19} />
          Best routes so far
        </h2>
        <span className="ui-sans border border-white/12 bg-[#1f1e1d] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]">
          {options.length} found
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {options.length === 0 ? (
          <p className="ui-sans border border-dashed border-white/12 bg-[#1f1e1d] p-4 text-sm leading-6 text-[#c7c0b8]">
            Ranked affordability routes will appear here as the agent validates them.
          </p>
        ) : null}
        {options.map((option, index) => (
          <article className="border border-white/12 bg-[#1f1e1d] p-4" key={option.id}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold leading-6 text-[#f7f2ec]">
                {index + 1}. {option.title}
              </h3>
              <span className="ui-sans shrink-0 border border-white/12 bg-[#302e2c] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]">
                {labelize(option.confidence)}
              </span>
            </div>
            <p className="ui-sans mt-2 text-sm leading-6 text-[#c7c0b8]">{option.summary}</p>
            {option.dropType ? (
              <p className="ui-sans mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#ef6844]">
                {labelize(option.dropType)}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
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
      className="mt-5 rounded-[2rem] border border-white/16 bg-[#302e2c] p-2 shadow-[0_18px_70px_rgb(0_0_0/0.35)]"
      onSubmit={(event) => {
        event.preventDefault();
        void submitFollowUp();
      }}
    >
      <div className="flex items-center gap-2">
        <textarea
          aria-label="Ask a follow-up question"
          className="ui-sans min-h-14 flex-1 resize-none rounded-[1.5rem] border-0 bg-transparent px-4 py-4 text-base text-[#f7f2ec] outline-none placeholder:text-[#9c948e]"
          placeholder="Ask a follow-up question..."
          rows={1}
          value={draft}
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

function CostImpact({ tracker }: { tracker: CostTrackerState }) {
  return (
    <section className="border border-white/12 bg-[#2b2928] p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold text-[#f7f2ec]">
        <WalletCards size={17} />
        Cost impact
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MiniMetric label="Quote" value={formatCents(tracker.quotedPriceCents)} />
        <MiniMetric label="Best" value={formatMaybeCents(tracker.currentBestEstimatedPriceCents)} />
        <MiniMetric label="Drop" tone="success" value={formatMaybeCents(tracker.potentialDropCents)} />
        <MiniMetric label="Type" value={labelize(tracker.dropType)} />
      </div>
      <p className="ui-sans mt-4 border border-white/12 bg-[#1f1e1d] p-3 text-sm leading-6 text-[#c7c0b8]">
        {tracker.explanation}
      </p>
    </section>
  );
}

function MiniMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success";
}) {
  return (
    <div className="border border-white/12 bg-[#1f1e1d] p-3">
      <dt className="ui-sans text-xs font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]">
        {label}
      </dt>
      <dd
        className={`mt-1 break-words text-sm font-semibold ${
          tone === "success" ? "text-[#76d7a6]" : "text-[#f7f2ec]"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function CaseSnapshot({
  intake,
  flags,
  status,
}: {
  intake: MedicationIntakeData;
  flags: string[];
  status: MedicationSnapshot["status"];
}) {
  return (
    <section className="border border-white/12 bg-[#2b2928] p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-[#f7f2ec]">Case</h2>
        <span className={`ui-sans border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${statusBadgeClass(status)}`}>
          {status}
        </span>
      </div>
      <dl className="mt-4 grid gap-3">
        <Fact label="Client" value={intake.patientName || "Patient"} />
        <Fact label="Medication" value={intake.medicationName || "Medication"} />
        <Fact label="Plan" value={intake.planName || intake.insuranceType} />
        <Fact label="Quote" value={formatCents(intake.quotedPriceCents)} />
      </dl>
      <div className="mt-4 border border-white/12 bg-[#1f1e1d] p-3">
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
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/12 bg-[#1f1e1d] p-3">
      <dt className="ui-sans text-xs font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold text-[#f7f2ec]">{value}</dd>
    </div>
  );
}

function LiveActivity({
  activities,
  running,
}: {
  activities: ActivityEvent[];
  running: boolean;
}) {
  const visible = activities.slice(-5).reverse();

  return (
    <section className="border border-white/12 bg-[#2b2928] p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[#f7f2ec]">Agent activity</h2>
        <span className="ui-sans border border-white/12 bg-[#1f1e1d] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]">
          {running ? "Running" : "Idle"}
        </span>
      </div>
      <div className="mt-4 grid gap-3">
        {visible.length === 0 ? (
          <p className="ui-sans border border-dashed border-white/12 bg-[#1f1e1d] p-3 text-sm leading-6 text-[#c7c0b8]">
            Starting the review sequence.
          </p>
        ) : null}
        {visible.map((activity) => (
          <div className="flex gap-3 border border-white/12 bg-[#1f1e1d] p-3" key={activity.id}>
            <span className="mt-0.5 text-[#ef6844]">
              {activity.status === "completed" ? <CheckCircle2 size={16} /> : <CircleDot size={16} />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#f7f2ec]">{activity.title}</p>
              {activity.summary ? (
                <p className="ui-sans mt-1 line-clamp-3 text-xs leading-5 text-[#c7c0b8]">
                  {activity.summary}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DraftSummary({ artifactCount }: { artifactCount: number }) {
  return (
    <section className="border border-white/12 bg-[#2b2928] p-4">
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

function buildReviewQuestion(intake: MedicationIntakeData): string {
  const medication = intake.medicationName.trim() || "this medication";
  const plan = intake.planName.trim() || intake.insuranceType.trim();
  const quote = intake.quotedPriceCents > 0 ? ` at ${formatCents(intake.quotedPriceCents)}` : "";
  const planText = plan ? ` under ${plan}` : "";
  return `Find the best affordability options for ${medication}${planText}${quote}`;
}

function reviewStatusText(
  snapshot: MedicationSnapshot,
  running: boolean,
  latestActivity: ActivityEvent | undefined,
): string {
  if (snapshot.status === "error") return "Review paused";
  if (running && latestActivity?.title) return `${latestActivity.title}`;
  if (running) return "Analyzing case, checking evidence";
  if (snapshot.status === "ready") return "Review complete";
  return "Preparing review";
}

function statusBadgeClass(status: MedicationSnapshot["status"]): string {
  if (status === "ready") return "border-[#5a5a5a] bg-[#1f1e1d] text-[#f7f2ec]";
  if (status === "error") return "border-[#ff8a7c]/45 bg-[#1f1e1d] text-[#ffd9d3]";
  if (status === "investigating") return "border-[#ef6844]/60 bg-[#1f1e1d] text-[#ef6844]";
  return "border-white/12 bg-[#1f1e1d] text-[#c7c0b8]";
}

function formatMaybeCents(cents: number | null): string {
  return cents == null ? "unknown" : formatCents(cents);
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
  return {
    id: `${eventType}-${name}-${Date.now()}-${index}`,
    eventType,
    title: eventType === "tool_call" ? `Calling ${name}` : `Finished ${name}`,
    summary: summarizeToolPayload(payload),
    status: eventType === "tool_call" ? "running" : "completed",
    createdAt: new Date().toISOString(),
  };
}

function summarizeToolPayload(payload: Record<string, unknown>): string {
  const value = payload.result ?? payload.args;
  if (!value) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
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
