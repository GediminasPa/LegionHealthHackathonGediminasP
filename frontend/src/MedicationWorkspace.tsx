import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ClipboardList, FileText, MessageCircle } from "lucide-react";
import { postMedicationMessage, streamMedicationRun } from "./api";
import ActivityFeed from "./ActivityFeed";
import AgentChatPanel from "./AgentChatPanel";
import ArtifactPanel from "./ArtifactPanel";
import CaseDashboard from "./CaseDashboard";
import CostTracker from "./CostTracker";
import OptionsBoard from "./OptionsBoard";
import SourcesPanel from "./SourcesPanel";
import type {
  ActivityEvent,
  ArtifactRecord,
  ChatMessage,
  MedicationRunEvent,
  MedicationSnapshot,
  SourceRecord,
} from "./medicationTypes";

type Props = {
  snapshot: MedicationSnapshot;
  setSnapshot: React.Dispatch<React.SetStateAction<MedicationSnapshot | null>>;
};

type Tab = "chat" | "case" | "activity" | "artifact";
const STREAMING_ASSISTANT_ID = "assistant-streaming";

const mobileTabs: Array<{ id: Tab; label: string; icon: typeof MessageCircle }> = [
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "case", label: "Case", icon: ClipboardList },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "artifact", label: "Drafts", icon: FileText },
];

export default function MedicationWorkspace({ snapshot, setSnapshot }: Props) {
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("chat");
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

  return (
    <main className="mx-auto grid h-[calc(100dvh-80px)] max-w-[1500px] gap-0 bg-[#1f1e1d] px-0 lg:grid-cols-[minmax(390px,42%)_1fr]">
      <div className="hidden min-h-0 border-r border-white/12 bg-[#1f1e1d] lg:block">
        <AgentChatPanel messages={snapshot.messages} onSend={handleSend} running={running} />
      </div>

      <div className="flex min-h-0 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-white/12 bg-[#1f1e1d] p-3 lg:hidden">
          <div className="ui-sans grid grid-cols-4 gap-1 border border-white/12 bg-[#1f1e1d] p-1">
            {mobileTabs.map((tab) => {
              const Icon = tab.icon;
              return (
              <button
                className={`button-press flex min-h-10 items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold uppercase tracking-[0.08em] ${
                  activeTab === tab.id
                    ? "bg-[#ef6844] text-white"
                    : "text-[#c7c0b8] hover:bg-[#302e2c]"
                }`}
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={14} />
                <span className="hidden min-[360px]:inline">{tab.label}</span>
              </button>
              );
            })}
          </div>
        </div>

        <div className={activeTab === "chat" ? "min-h-0 flex-1 lg:hidden" : "hidden"}>
          <AgentChatPanel messages={snapshot.messages} onSend={handleSend} running={running} />
        </div>

        <div
          className={`scrollbar-soft min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6 ${
            activeTab === "chat" ? "hidden lg:block" : ""
          }`}
        >
          <div className="grid gap-4 pb-6">
            <CostTracker tracker={snapshot.costTracker} />
            {snapshot.status === "error" ? (
              <div className="border border-white/12 bg-[#1f1e1d] p-3">
                <button
                  className="button-press ui-sans bg-[#ef6844] px-4 py-2 text-sm font-semibold uppercase tracking-[0.08em] text-white hover:bg-[#ff7a52] disabled:cursor-not-allowed disabled:bg-[#3a302c] disabled:text-[#777777]"
                  disabled={running}
                  type="button"
                  onClick={() => void startRun("mock")}
                >
                  Run mock demo
                </button>
              </div>
            ) : null}
            <div
              className={
                activeTab === "case" || activeTab === "chat" ? "grid gap-4" : "hidden lg:grid lg:gap-4"
              }
            >
              <CaseDashboard intake={snapshot.intake} flags={snapshot.flags} status={snapshot.status} />
              <OptionsBoard options={snapshot.options} />
              <SourcesPanel sources={snapshot.sources} />
            </div>
            <div className={activeTab === "activity" ? "block" : "hidden lg:block"}>
              <ActivityFeed activities={snapshot.activities} running={running} />
            </div>
            <div className={activeTab === "artifact" ? "block" : "hidden lg:block"}>
              <ArtifactPanel artifacts={snapshot.artifacts} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
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
