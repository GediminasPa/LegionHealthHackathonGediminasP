import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { SendHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import type { ChatMessage } from "./medicationTypes";

type Props = {
  messages: ChatMessage[];
  onSend: (content: string) => Promise<void>;
  running: boolean;
};

export default function AgentChatPanel({ messages, onSend, running }: Props) {
  const [draft, setDraft] = useState("");
  const runtimeMessages = useMemo(() => messages, [messages]);
  const runtime = useExternalStoreRuntime<ChatMessage>({
    messages: runtimeMessages,
    convertMessage,
    isRunning: running,
    onNew: async (message) => {
      const text = appendMessageText(message);
      if (text.trim()) await onSend(text.trim());
    },
  });

  async function submit() {
    const content = draft.trim();
    if (!content || running) return;
    setDraft("");
    await onSend(content);
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <section className="flex h-full min-h-0 flex-col bg-white">
        <div className="border-b border-stone-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-stone-950">Agent</h2>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="rounded-md border border-dashed border-stone-300 p-4 text-sm leading-6 text-stone-600">
              Starting the investigation.
            </div>
          ) : null}
          {messages.map((message) => (
            <article
              className={`max-w-[92%] rounded-lg px-3 py-2 text-sm leading-6 ${
                message.role === "user"
                  ? "ml-auto bg-teal-700 text-white"
                  : "border border-stone-200 bg-stone-50 text-stone-900"
              }`}
              key={message.id}
            >
              {message.content}
            </article>
          ))}
          {running ? (
            <div className="inline-flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-teal-600" />
              Working
            </div>
          ) : null}
        </div>
        <form
          className="border-t border-stone-200 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              className="min-h-11 flex-1 resize-none rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button
              aria-label="Send"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-teal-700 text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-stone-300"
              disabled={!draft.trim() || running}
              type="submit"
            >
              <SendHorizontal size={18} />
            </button>
          </div>
        </form>
      </section>
    </AssistantRuntimeProvider>
  );
}

function convertMessage(message: ChatMessage): ThreadMessageLike {
  return {
    role: message.role,
    content: [{ type: "text", text: message.content }],
  };
}

function appendMessageText(message: AppendMessage): string {
  return message.content
    .map((part) => {
      if (typeof part === "string") return part;
      if ("text" in part && typeof part.text === "string") return part.text;
      return "";
    })
    .join("");
}
