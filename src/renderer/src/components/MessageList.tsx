import { useCallback, useRef } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { ChevronDownIcon, CloudIcon } from "@heroicons/react/24/outline";
import type { ChatMessage, AgentResponse } from "@shared/contracts";
import { formatTime } from "@renderer/lib/session";
import { AgentResponseBlock } from "./AgentResponseBlock";
import { FinalReply } from "./FinalReply";

type MessageListProps = {
  messages: ChatMessage[];
  streamingResponse?: AgentResponse | null;
  onCancelAgent?: () => void;
};

type ListItem =
  | { type: "message"; message: ChatMessage }
  | { type: "streaming"; response: AgentResponse };

export function MessageList({ messages, streamingResponse, onCancelAgent }: MessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Build the virtual list items
  const items: ListItem[] = messages.map((m) => ({ type: "message" as const, message: m }));
  if (streamingResponse && streamingResponse.status === "running") {
    items.push({ type: "streaming" as const, response: streamingResponse });
  }

  const renderItem = useCallback((_index: number, item: ListItem) => {
    if (item.type === "streaming") {
      return (
        <div className="max-w-4xl px-12 py-4">
          <AgentResponseBlock response={item.response} onCancel={onCancelAgent} />
        </div>
      );
    }

    const message = item.message;

    if (message.role === "system") {
      return (
        <div className="max-w-4xl px-12 py-4">
          <div className="rounded-2xl border border-amber-400/25 bg-amber-100 px-4 py-3 text-sm text-amber-900">
            {message.content}
          </div>
        </div>
      );
    }

    if (message.role === "user") {
      return (
        <article className="max-w-4xl px-12 py-4">
          <div className="mb-3 flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-shell-500">
            <span>You</span>
            <span className="tracking-normal">{formatTime(message.timestamp)}</span>
          </div>
          <div className="inline-flex rounded-2xl border border-accent-400/20 bg-accent-500/8 px-4 py-3 text-sm leading-7 text-shell-200">
            {message.content}
          </div>
        </article>
      );
    }

    // Assistant message
    if (message.steps && message.steps.length > 0) {
      return (
        <div className="max-w-4xl px-12 py-4">
          <AgentResponseBlock
            response={{
              id: message.id,
              status: message.status === "done" ? "completed" : "error",
              steps: message.steps,
              finalText: message.content,
              startedAt: new Date(message.timestamp).getTime(),
              endedAt: new Date(message.timestamp).getTime(),
            }}
          />
        </div>
      );
    }

    return (
      <article className="max-w-4xl px-12 py-4">
        <div className="mb-3 flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-shell-500">
          <span>Assistant</span>
          <span className="tracking-normal">{formatTime(message.timestamp)}</span>
        </div>
        <FinalReply text={message.content} />
      </article>
    );
  }, [onCancelAgent]);

  if (items.length === 0) {
    return (
      <section className="flex min-h-full flex-col items-center justify-center px-12 py-10">
        <div className="flex max-w-4xl flex-col items-center text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full border border-black/6 bg-[#f3f6fb] text-shell-500">
            <CloudIcon className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-[34px] font-semibold tracking-[-0.03em] text-shell-100">Let&apos;s build</h2>
          <button
            type="button"
            className="mt-4 inline-flex items-center gap-1 rounded-full border border-black/8 bg-white/80 px-3 py-1.5 text-sm text-shell-500"
          >
            first_pi_agent
            <ChevronDownIcon className="h-4 w-4" />
          </button>
        </div>
      </section>
    );
  }

  return (
    <Virtuoso
      ref={virtuosoRef}
      data={items}
      itemContent={renderItem}
      followOutput="smooth"
      initialTopMostItemIndex={items.length - 1}
      className="mx-auto w-full max-w-4xl"
      style={{ height: "100%" }}
    />
  );
}
