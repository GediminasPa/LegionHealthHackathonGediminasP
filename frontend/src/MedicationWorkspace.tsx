import { useCallback, useEffect, useRef, useState } from "react";
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

export default function MedicationWorkspace({ snapshot, setSnapshot }: Props) {
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const autoRunStarted = useRef(false);

  const applyEvent = useCallback(
    (event: MedicationRunEvent) => {
      setSnapshot((current) => {
        if (!current) return current;
        const payload = event.payload;
        if (event.type === "agent_message") {
          return {
            ...current,
            messages: [
              ...current.messages,
              assistantMessage(String(payload.content ?? ""), current.messages.length),
            ],
          };
        }
        if (event.type === "activity_started" || event.type === "activity_completed") {
          const activity = activityFromPayload(payload, event.type);
          return {
            ...current,
            status: event.type === "activity_started" ? "investigating" : current.status,
            activities: upsertById(current.activities, activity),
          };
        }
        if (event.type === "source_added") {
          return {
            ...current,
            sources: upsertById(current.sources, sourceFromPayload(payload)),
          };
        }
        if (event.type === "option_added") {
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
        if (event.type === "artifact_created") {
          const artifact = artifactFromPayload(payload);
          return { ...current, artifacts: upsertById(current.artifacts, artifact) };
        }
        if (event.type === "case_state_patch" && typeof payload.state === "object") {
          const state = payload.state as Record<string, unknown>;
          return {
            ...current,
            flags: Array.isArray(state.flags) ? (state.flags as string[]) : current.flags,
            status: "investigating",
          };
        }
        if (event.type === "run_done") return { ...current, status: "ready" };
        if (event.type === "run_error") return { ...current, status: "error" };
        return current;
      });
    },
    [setSnapshot],
  );

  const startRun = useCallback(async () => {
    setRunning(true);
    try {
      for await (const event of streamMedicationRun(snapshot.sessionId)) {
        applyEvent(event);
      }
    } finally {
      setRunning(false);
    }
  }, [applyEvent, snapshot.sessionId]);

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
    <main className="mx-auto grid h-[calc(100vh-73px)] max-w-[1500px] gap-0 px-0 lg:grid-cols-[minmax(380px,44%)_1fr]">
      <div className="hidden min-h-0 border-r border-stone-200 bg-white lg:block">
        <AgentChatPanel messages={snapshot.messages} onSend={handleSend} running={running} />
      </div>

      <div className="min-h-0 overflow-hidden">
        <div className="border-b border-stone-200 bg-white p-3 lg:hidden">
          <div className="grid grid-cols-4 gap-1 rounded-md bg-stone-100 p-1">
            {(["chat", "case", "activity", "artifact"] as const).map((tab) => (
              <button
                className={`rounded px-2 py-2 text-xs font-semibold ${
                  activeTab === tab ? "bg-white text-teal-800 shadow-sm" : "text-stone-600"
                }`}
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className={activeTab === "chat" ? "h-full lg:hidden" : "hidden"}>
          <AgentChatPanel messages={snapshot.messages} onSend={handleSend} running={running} />
        </div>

        <div
          className={`h-full overflow-y-auto p-4 sm:p-5 ${
            activeTab === "chat" ? "hidden lg:block" : ""
          }`}
        >
          <div className="grid gap-4">
            <CostTracker tracker={snapshot.costTracker} />
            <div className={activeTab === "case" || activeTab === "chat" ? "grid gap-4" : "hidden lg:grid lg:gap-4"}>
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

function sourceFromPayload(payload: Record<string, unknown>): SourceRecord {
  return {
    id: String(payload.id),
    title: String(payload.title ?? "Source"),
    url: String(payload.url ?? ""),
    publisher: payload.publisher == null ? null : String(payload.publisher),
    summary: payload.summary == null ? null : String(payload.summary),
    checkedAt: new Date().toISOString(),
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
  };
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) return [...items, item];
  return items.map((existing, itemIndex) => (itemIndex === index ? item : existing));
}
