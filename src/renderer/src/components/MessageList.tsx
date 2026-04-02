import { useCallback, useRef } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { CloudIcon } from "@heroicons/react/24/outline";
import type { ChatMessage, AgentResponse } from "@shared/contracts";
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
        <div className="px-8 py-2">
          <AgentResponseBlock response={item.response} onCancel={onCancelAgent} />
        </div>
      );
    }

    const message = item.message;

    if (message.role === "system") {
      return (
        <div className="px-8 py-2">
          <div className="rounded-xl border border-amber-400/20 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            {message.content}
          </div>
        </div>
      );
    }

    if (message.role === "user") {
      return (
        <article className="flex justify-end px-8 py-2">
          <div className="max-w-[75%] rounded-2xl bg-gray-100 px-3.5 py-2 text-[13px] leading-7 text-gray-800">
            {message.content}
          </div>
        </article>
      );
    }

    // Assistant message
    if (message.steps && message.steps.length > 0) {
      return (
        <div className="px-8 py-2">
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
      <article className="px-8 py-2">
        <FinalReply text={message.content} />
      </article>
    );
  }, [onCancelAgent]);

  if (items.length === 0) {
    return (
      <section className="flex min-h-full flex-col items-center justify-center px-8 py-8">
        <div className="flex flex-col items-center text-center">
          <div className="grid h-10 w-10 place-items-center rounded-full border border-black/6 bg-gray-50 text-gray-400">
            <CloudIcon className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-medium text-gray-700">开始构建</h2>
          <p className="mt-1 text-[13px] text-gray-300">first_pi_agent</p>
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
      className="mx-auto w-full max-w-3xl"
      style={{ height: "100%" }}
    />
  );
}
