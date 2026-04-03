import { useMemo } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
  type ChatModelRunResult,
  type MessageStatus,
  type ThreadAssistantMessagePart,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import type { AgentEvent } from "@shared/agent-events";
import type {
  AgentResponse,
  AgentStep,
  ChatMessage,
  ChatSession,
  DesktopApi,
  ModelSelection,
  SelectedFile,
  ThinkingLevel,
} from "@shared/contracts";
import { deriveSessionTitle } from "@renderer/lib/session";
import { Thread } from "@renderer/components/assistant-ui/thread";
import {
  selectedFileToCompleteAttachment,
  toPersistedMessageAttachment,
  type PersistedMessageAttachment,
} from "@renderer/lib/assistant-ui-attachments";

type AssistantThreadPanelProps = {
  session: ChatSession;
  desktopApi: DesktopApi;
  onPersistSession: (session: ChatSession) => void;
  currentModel: ModelSelection;
  thinkingLevel: ThinkingLevel;
  terminalOpen?: boolean;
  isPickingFiles: boolean;
  onAttachFiles: () => void;
  onPasteFiles: (files: File[]) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onModelChange: (model: ModelSelection) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
};

function createStep(kind: AgentStep["kind"], id?: string): AgentStep {
  return {
    id: id ?? crypto.randomUUID(),
    kind,
    status: "executing",
    startedAt: Date.now(),
  };
}

function createResponse(id: string): AgentResponse {
  return {
    id,
    status: "running",
    steps: [],
    finalText: "",
    startedAt: Date.now(),
  };
}

function buildUserMessage(text: string, attachments: SelectedFile[]): ChatMessage {
  const trimmed = text.trim();
  const fallback = attachments.length > 0 ? `附加了 ${attachments.length} 个本地文件。` : "空消息";

  return {
    id: crypto.randomUUID(),
    role: "user",
    content: trimmed || fallback,
    timestamp: new Date().toISOString(),
    status: "done",
    meta: {
      attachmentIds: attachments.map((attachment) => attachment.id),
      attachments: attachments.map(toPersistedMessageAttachment),
    },
  };
}

function buildAssistantMessage(response: AgentResponse): ChatMessage {
  return {
    id: response.id,
    role: "assistant",
    content: response.finalText,
    timestamp: new Date(response.endedAt ?? response.startedAt).toISOString(),
    status: response.status === "completed" ? "done" : "error",
    steps: response.steps,
  };
}

function safeArgsText(value: unknown) {
  if (value === undefined) return "{}";

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildAssistantParts(steps: AgentStep[], finalText: string): ThreadAssistantMessagePart[] {
  const parts: ThreadAssistantMessagePart[] = [];

  for (const step of steps) {
    if (step.kind === "thinking" && step.thinkingText) {
      parts.push({
        type: "reasoning",
        text: step.thinkingText,
      });
      continue;
    }

    if (step.kind === "tool_call") {
      const result =
        step.status === "executing"
          ? step.streamOutput
          : step.toolError ?? step.toolResult ?? step.streamOutput;

      parts.push({
        type: "tool-call",
        toolCallId: step.id,
        toolName: step.toolName ?? "tool",
        args: (step.toolArgs ?? {}) as any,
        argsText: safeArgsText(step.toolArgs ?? {}),
        result,
        isError: step.status === "error",
      });
    }
  }

  if (finalText) {
    parts.push({
      type: "text",
      text: finalText,
    });
  }

  return parts;
}

function toThreadMessage(message: ChatMessage): ThreadMessageLike {
  const createdAt = new Date(message.timestamp);
  const persistedAttachments = Array.isArray(message.meta?.attachments)
    ? message.meta.attachments.filter((attachment): attachment is PersistedMessageAttachment => {
        if (!attachment || typeof attachment !== "object") return false;

        const candidate = attachment as Partial<PersistedMessageAttachment>;
        return (
          typeof candidate.id === "string" &&
          typeof candidate.name === "string" &&
          typeof candidate.size === "number" &&
          typeof candidate.kind === "string" &&
          typeof candidate.extension === "string" &&
          typeof candidate.path === "string"
        );
      })
    : [];

  if (message.role === "assistant") {
    return {
      id: message.id,
      role: "assistant",
      createdAt,
      content: buildAssistantParts(message.steps ?? [], message.content),
      status:
        message.status === "error"
          ? { type: "incomplete", reason: "error", error: message.content }
          : { type: "complete", reason: "stop" },
      metadata: {
        custom: {
          rawMessageId: message.id,
        },
      },
    };
  }

  if (message.role === "system") {
    return {
      id: message.id,
      role: "system",
      createdAt,
      content: message.content || "系统消息",
      metadata: {
        custom: {
          rawMessageId: message.id,
        },
      },
    };
  }

  return {
    id: message.id,
    role: "user",
    createdAt,
    content: message.content,
    attachments: persistedAttachments.map(selectedFileToCompleteAttachment),
    metadata: {
      custom: {
        rawMessageId: message.id,
      },
    },
  };
}

function extractUserText(messages: readonly ThreadMessageLike[]) {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  if (!latestUserMessage) return "";

  if (typeof latestUserMessage.content === "string") {
    return latestUserMessage.content;
  }

  return latestUserMessage.content
    .filter((part): part is Extract<(typeof latestUserMessage.content)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function createRunQueue() {
  const queue: ChatModelRunResult[] = [];
  let notify: (() => void) | null = null;
  let finished = false;

  return {
    push(update: ChatModelRunResult) {
      queue.push(update);
      notify?.();
      notify = null;
    },
    finish(update: ChatModelRunResult) {
      finished = true;
      queue.push(update);
      notify?.();
      notify = null;
    },
    async *drain() {
      while (!finished || queue.length > 0) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            notify = resolve;
          });
          continue;
        }

        const update = queue.shift();
        if (update) {
          yield update;
        }
      }
    },
  };
}

function buildRuntimeStatus(response: AgentResponse): MessageStatus {
  if (response.status === "completed") {
    return { type: "complete", reason: "stop" };
  }

  if (response.status === "cancelled") {
    return { type: "incomplete", reason: "cancelled" };
  }

  if (response.status === "error") {
    return {
      type: "incomplete",
      reason: "error",
      error: response.finalText || "Agent 执行失败",
    };
  }

  return { type: "running" };
}

function SessionRuntime({
  session,
  desktopApi,
  onPersistSession,
  currentModel,
  thinkingLevel,
  terminalOpen = false,
  isPickingFiles,
  onAttachFiles,
  onPasteFiles,
  onRemoveAttachment,
  onModelChange,
  onThinkingLevelChange,
}: AssistantThreadPanelProps) {
  const initialMessages = useMemo(
    () => session.messages.map(toThreadMessage),
    [session.messages],
  );

  const chatModel = useMemo<ChatModelAdapter>(() => ({
    run: async function* ({ messages, abortSignal }) {
      const text = extractUserText(messages);
      const pendingAttachments = session.attachments;
      const title =
        session.messages.length === 0 ? deriveSessionTitle(text, pendingAttachments) : session.title;

      const userMessage = buildUserMessage(text, pendingAttachments);
      const sessionAfterUserMessage: ChatSession = {
        ...session,
        title,
        messages: [...session.messages, userMessage],
        draft: "",
        attachments: [],
        updatedAt: userMessage.timestamp,
      };

      onPersistSession(sessionAfterUserMessage);

      const response = createResponse(crypto.randomUUID());
      const queue = createRunQueue();

      let settled = false;

      const publish = () => {
        queue.push({
          content: buildAssistantParts(response.steps, response.finalText),
          status: buildRuntimeStatus(response),
        });
      };

      const finalize = (nextStatus: AgentResponse["status"]) => {
        if (settled) return;
        settled = true;
        response.status = nextStatus;
        response.endedAt = Date.now();

        for (const step of response.steps) {
          if (step.status === "executing") {
            step.status = nextStatus === "cancelled" ? "cancelled" : "success";
            step.endedAt = step.endedAt ?? Date.now();
          }
        }

        const update: ChatModelRunResult = {
          content: buildAssistantParts(response.steps, response.finalText),
          status: buildRuntimeStatus(response),
        };

        if (nextStatus === "completed" || nextStatus === "error") {
          const assistantMessage = buildAssistantMessage(response);
          onPersistSession({
            ...sessionAfterUserMessage,
            messages: [...sessionAfterUserMessage.messages, assistantMessage],
            updatedAt: assistantMessage.timestamp,
          });
        }

        queue.finish(update);
      };

      const handleEvent = (event: AgentEvent) => {
        switch (event.type) {
          case "agent_start":
            publish();
            break;

          case "thinking_delta": {
            let step = response.steps.find(
              (item) => item.kind === "thinking" && item.status === "executing",
            );

            if (!step) {
              step = createStep("thinking");
              response.steps.push(step);
            }

            step.thinkingText = (step.thinkingText ?? "") + event.delta;
            publish();
            break;
          }

          case "text_delta":
            response.finalText += event.delta;
            publish();
            break;

          case "tool_execution_start": {
            const thinking = response.steps.find(
              (item) => item.kind === "thinking" && item.status === "executing",
            );

            if (thinking) {
              thinking.status = "success";
              thinking.endedAt = Date.now();
            }

            const step = createStep("tool_call", event.stepId);
            step.toolName = event.toolName;
            step.toolArgs = event.args;
            response.steps.push(step);
            publish();
            break;
          }

          case "tool_execution_update": {
            const step = response.steps.find((item) => item.id === event.stepId);
            if (!step) break;

            step.streamOutput = (step.streamOutput ?? "") + event.output;
            publish();
            break;
          }

          case "tool_execution_end": {
            const step = response.steps.find((item) => item.id === event.stepId);
            if (!step) break;

            step.status = event.error ? "error" : "success";
            step.toolResult = event.result;
            step.toolError = event.error;
            step.endedAt = Date.now();
            publish();
            break;
          }

          case "agent_error":
            response.finalText += response.finalText ? `\n\n**错误：** ${event.message}` : `**错误：** ${event.message}`;
            finalize("error");
            break;

          case "agent_end":
            finalize("completed");
            break;
        }
      };

      const unsubscribe = desktopApi.agent.onEvent(handleEvent);

      const abort = () => {
        void desktopApi.agent.cancel();
        finalize("cancelled");
      };

      abortSignal.addEventListener("abort", abort, { once: true });

      void desktopApi.chat.send({
        sessionId: session.id,
        text,
        attachmentIds: pendingAttachments.map((attachment) => attachment.id),
      }).catch((error) => {
        if (settled) return;

        response.finalText = error instanceof Error ? error.message : "发送失败，请稍后重试。";
        finalize("error");
      }).finally(() => {
        unsubscribe();
        abortSignal.removeEventListener("abort", abort);
      });

      yield* queue.drain();
    },
  }), [desktopApi, onPersistSession, session]);

  const runtime = useLocalRuntime(chatModel, {
    initialMessages,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread
        attachments={session.attachments}
        isPickingFiles={isPickingFiles}
        terminalOpen={terminalOpen}
        onAttachFiles={onAttachFiles}
        onPasteFiles={onPasteFiles}
        onRemoveAttachment={onRemoveAttachment}
        currentModel={currentModel}
        thinkingLevel={thinkingLevel}
        onModelChange={onModelChange}
        onThinkingLevelChange={onThinkingLevelChange}
      />
    </AssistantRuntimeProvider>
  );
}

export function AssistantThreadPanel(props: AssistantThreadPanelProps) {
  return <SessionRuntime key={props.session.id} {...props} />;
}
