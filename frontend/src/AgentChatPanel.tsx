import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { Bot, SendHorizontal, UserRound } from "lucide-react";
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
      <section className="flex h-full min-h-0 flex-col bg-[#1f1e1d]">
        <div className="border-b border-white/12 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center border border-white/12 bg-[#302e2c] text-[#f7f2ec]">
                <Bot size={17} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-[#f7f2ec]">Care navigator</h2>
                <p className="ui-sans text-xs uppercase tracking-[0.08em] text-[#c7c0b8]">
                  Medication affordability review
                </p>
              </div>
            </div>
            <span
              className={`ui-sans border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${
                running
                  ? "border-[#ef6844]/60 bg-[#1f1e1d] text-[#ef6844]"
                  : "border-white/12 bg-[#1f1e1d] text-[#c7c0b8]"
              }`}
            >
              {running ? "Reviewing" : "Ready"}
            </span>
          </div>
        </div>
        <div className="scrollbar-soft flex-1 space-y-3 overflow-y-auto bg-[#1f1e1d] px-4 py-4">
          {messages.length === 0 ? (
            <div className="ui-sans border border-dashed border-white/12 bg-[#2b2928] p-4 text-sm leading-6 text-[#c7c0b8]">
              Preparing the first affordability pass.
            </div>
          ) : null}
          {messages.map((message) => (
            <article
              className={`flex max-w-[92%] gap-2 border px-3 py-2 text-sm leading-6 ${
                message.role === "user"
                  ? "ui-sans ml-auto border-[#ef6844] bg-[#ef6844] text-white"
                  : "border-white/12 bg-[#302e2c] text-[#f7f2ec]"
              }`}
              key={message.id}
            >
              {message.role === "assistant" ? (
                <Bot className="mt-1 shrink-0 text-[#ef6844]" size={15} />
              ) : (
                <UserRound className="mt-1 shrink-0 text-white/85" size={15} />
              )}
              <span className="min-w-0 whitespace-pre-wrap">{message.content}</span>
            </article>
          ))}
          {running ? (
            <div className="ui-sans inline-flex items-center gap-2 border border-white/12 bg-[#302e2c] px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]">
              <span className="h-2 w-2 animate-pulse bg-[#ef6844]" />
              Reviewing
            </div>
          ) : null}
        </div>
        <form
          className="border-t border-white/12 bg-[#1f1e1d] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              aria-label="Message care navigator"
              className="ui-sans min-h-11 flex-1 resize-none border border-white/12 bg-[#1f1e1d] px-3 py-2 text-sm text-[#f7f2ec] outline-none transition focus:border-[#ef6844] focus:ring-1 focus:ring-[#ef6844]/30"
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button
              aria-label="Send"
              className="button-press inline-flex h-11 w-11 shrink-0 items-center justify-center bg-[#ef6844] text-white hover:bg-[#ff7a52] disabled:cursor-not-allowed disabled:bg-[#3a302c] disabled:text-[#777777]"
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
