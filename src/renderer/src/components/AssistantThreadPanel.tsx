import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  AgentRunScope,
  AgentStep,
  ChatMessage,
  ChatSession,
  DesktopApi,
  GitBranchSummary,
  SelectedFile,
  ThinkingLevel,
} from "@shared/contracts";
import { deriveSessionTitle } from "@renderer/lib/session";
import { Thread } from "@renderer/components/assistant-ui/thread";
import type { ContextUsageSummary } from "@renderer/lib/context-usage";
import {
  getRunStatusLabel,
  type ChatRunStage,
} from "@renderer/lib/chat-run-status";
import {
  selectedFileToCompleteAttachment,
  toPersistedMessageAttachment,
  type PersistedMessageAttachment,
} from "@renderer/lib/assistant-ui-attachments";

type AssistantThreadPanelProps = {
  session: ChatSession;
  desktopApi: DesktopApi;
  onPersistSession: (session: ChatSession) => void;
  currentModelId: string;
  thinkingLevel: ThinkingLevel;
  terminalOpen?: boolean;
  isPickingFiles: boolean;
  onAttachFiles: () => void;
  onPasteFiles: (files: File[]) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onModelChange: (modelEntryId: string) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  onBranchChanged: () => void | Promise<void>;
  onRunStateChange: (sessionId: string, isRunning: boolean) => void;
  branchSummary: GitBranchSummary | null;
  contextSummary: ContextUsageSummary;
  visible: boolean;
  disableGlobalSideEffects: boolean;
};

const CONNECTING_STAGE_DELAY_MS = 220;
const SLOW_CONNECTION_HINT_DELAY_MS = 4_000;
const CANCEL_RESET_DELAY_MS = 320;

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

function getLatestThinkingStep(steps: AgentStep[]) {
  return [...steps].reverse().find((step) => step.kind === "thinking");
}

function buildUserMessage(text: string, attachments: SelectedFile[]): ChatMessage {
  const trimmed = text.trim();

  return {
    id: crypto.randomUUID(),
    role: "user",
    content: trimmed,
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
    usage: response.usage,
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

function normalizeLineEndings(text: string) {
  return text.replace(/\r\n|\n\r|\r/g, "\n");
}

function getToolResultText(result: unknown): string | null {
  if (typeof result === "string") {
    return normalizeLineEndings(result);
  }

  if (!result || typeof result !== "object") {
    return null;
  }

  const candidate = result as {
    content?: unknown;
  };

  if (!Array.isArray(candidate.content)) {
    return null;
  }

  const textParts = candidate.content
    .flatMap((part) => {
      if (!part || typeof part !== "object") {
        return [];
      }

      const contentPart = part as {
        type?: unknown;
        text?: unknown;
      };

      if (
        contentPart.type === "text" &&
        typeof contentPart.text === "string" &&
        contentPart.text.trim()
      ) {
        return [normalizeLineEndings(contentPart.text)];
      }

      return [];
    });

  return textParts.length > 0 ? textParts.join("\n\n") : null;
}

function getToolResultDisplay(result: unknown): unknown {
  return getToolResultText(result) ?? result;
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
          ? getToolResultDisplay(step.streamOutput)
          : getToolResultDisplay(
              step.toolError ?? step.toolResult ?? step.streamOutput,
            );

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
  currentModelId,
  thinkingLevel,
  terminalOpen = false,
  isPickingFiles,
  onAttachFiles,
  onPasteFiles,
  onRemoveAttachment,
  onModelChange,
  onThinkingLevelChange,
  onBranchChanged,
  onRunStateChange,
  branchSummary,
  contextSummary,
  visible,
  disableGlobalSideEffects,
}: AssistantThreadPanelProps) {
  const latestSessionRef = useRef(session);
  const latestPersistSessionRef = useRef(onPersistSession);
  const latestRunStateChangeRef = useRef(onRunStateChange);
  const cancelRunRef = useRef<(() => void) | null>(null);
  const activeRunTokenRef = useRef<string | null>(null);
  const activeRunScopeRef = useRef<AgentRunScope | null>(null);
  const stageTransitionTimerRef = useRef<number | null>(null);
  const slowConnectionTimerRef = useRef<number | null>(null);
  const resetRunStateTimerRef = useRef<number | null>(null);
  const [runStage, setRunStage] = useState<ChatRunStage>("idle");
  const [isSlowConnection, setIsSlowConnection] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const initialMessagesRef = useRef<ThreadMessageLike[]>(
    session.messages.map(toThreadMessage),
  );
  const initialMessages = initialMessagesRef.current;

  useEffect(() => {
    latestSessionRef.current = session;
  }, [session]);

  useEffect(() => {
    latestPersistSessionRef.current = onPersistSession;
  }, [onPersistSession]);

  useEffect(() => {
    latestRunStateChangeRef.current = onRunStateChange;
  }, [onRunStateChange]);

  const clearConnectionTimers = useCallback(() => {
    if (stageTransitionTimerRef.current !== null) {
      window.clearTimeout(stageTransitionTimerRef.current);
      stageTransitionTimerRef.current = null;
    }

    if (slowConnectionTimerRef.current !== null) {
      window.clearTimeout(slowConnectionTimerRef.current);
      slowConnectionTimerRef.current = null;
    }
  }, []);

  const clearResetRunStateTimer = useCallback(() => {
    if (resetRunStateTimerRef.current !== null) {
      window.clearTimeout(resetRunStateTimerRef.current);
      resetRunStateTimerRef.current = null;
    }
  }, []);

  const clearRunFeedbackTimers = useCallback(() => {
    clearConnectionTimers();
    clearResetRunStateTimer();
  }, [clearConnectionTimers, clearResetRunStateTimer]);

  const beginRunFeedback = useCallback(() => {
    const runToken = crypto.randomUUID();
    activeRunTokenRef.current = runToken;
    clearRunFeedbackTimers();
    setRunStage("sending");
    setIsSlowConnection(false);
    setIsCancelling(false);

    stageTransitionTimerRef.current = window.setTimeout(() => {
      if (activeRunTokenRef.current !== runToken) return;

      setRunStage((current) =>
        current === "sending" ? "connecting" : current,
      );
    }, CONNECTING_STAGE_DELAY_MS);

    slowConnectionTimerRef.current = window.setTimeout(() => {
      if (activeRunTokenRef.current !== runToken) return;

      setRunStage((current) =>
        current === "sending" || current === "connecting"
          ? "connecting"
          : current,
      );
      setIsSlowConnection(true);
    }, SLOW_CONNECTION_HINT_DELAY_MS);

    return runToken;
  }, [clearRunFeedbackTimers]);

  const advanceRunFeedback = useCallback(
    (runToken: string, nextStage: Exclude<ChatRunStage, "idle">) => {
      if (activeRunTokenRef.current !== runToken) return;

      if (nextStage !== "sending" && nextStage !== "connecting") {
        clearConnectionTimers();
        setIsSlowConnection(false);
      }

      if (nextStage === "cancelling") {
        setIsCancelling(true);
      } else {
        setIsCancelling(false);
      }

      setRunStage((current) =>
        current === "cancelling" && nextStage !== "cancelling"
          ? current
          : nextStage,
      );
    },
    [clearConnectionTimers],
  );

  const finishRunFeedback = useCallback(
    (runToken: string, status: AgentResponse["status"]) => {
      if (activeRunTokenRef.current !== runToken) return;

      clearConnectionTimers();
      clearResetRunStateTimer();
      setIsSlowConnection(false);

      if (status === "cancelled") {
        setRunStage("cancelling");
        setIsCancelling(true);
        resetRunStateTimerRef.current = window.setTimeout(() => {
          if (activeRunTokenRef.current !== runToken) return;

          activeRunTokenRef.current = null;
          resetRunStateTimerRef.current = null;
          setRunStage("idle");
          setIsCancelling(false);
          setIsSlowConnection(false);
        }, CANCEL_RESET_DELAY_MS);
        return;
      }

      activeRunTokenRef.current = null;
      setRunStage("idle");
      setIsCancelling(false);
    },
    [clearConnectionTimers, clearResetRunStateTimer],
  );

  useEffect(() => () => {
    clearRunFeedbackTimers();
    activeRunTokenRef.current = null;
    if (activeRunScopeRef.current) {
      latestRunStateChangeRef.current(activeRunScopeRef.current.sessionId, false);
      activeRunScopeRef.current = null;
    }
  }, [clearRunFeedbackTimers]);

  const runStatusLabel = useMemo(
    () => getRunStatusLabel(runStage, { isSlowConnection }),
    [isSlowConnection, runStage],
  );

  const handleCancelRun = useCallback(() => {
    cancelRunRef.current?.();
  }, []);

  const chatModel = useMemo<ChatModelAdapter>(() => ({
    run: async function* ({ messages, abortSignal }) {
      const currentSession = latestSessionRef.current;
      const runId = crypto.randomUUID();
      const runScope: AgentRunScope = {
        sessionId: currentSession.id,
        runId,
      };
      const text = extractUserText(messages);
      const pendingAttachments = currentSession.attachments;
      const title =
        currentSession.messages.length === 0
          ? deriveSessionTitle(text, pendingAttachments)
          : currentSession.title;

      const userMessage = buildUserMessage(text, pendingAttachments);
      const sessionAfterUserMessage: ChatSession = {
        ...currentSession,
        title,
        messages: [...currentSession.messages, userMessage],
        draft: "",
        attachments: [],
        updatedAt: userMessage.timestamp,
      };

      latestPersistSessionRef.current(sessionAfterUserMessage);
      activeRunScopeRef.current = runScope;
      latestRunStateChangeRef.current(currentSession.id, true);

      const runToken = beginRunFeedback();
      const response = createResponse(runId);
      const queue = createRunQueue();

      let settled = false;
      let cleanedUp = false;
      let unsubscribe: () => void = () => {};
      let abort: (() => void) | null = null;

      const publish = () => {
        if (settled) return;

        queue.push({
          content: buildAssistantParts(response.steps, response.finalText),
          status: buildRuntimeStatus(response),
        });
      };

      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        unsubscribe();
        if (abort) {
          abortSignal.removeEventListener("abort", abort);
        }
        if (cancelRunRef.current === abort) {
          cancelRunRef.current = null;
        }
      };

      const finalize = (nextStatus: AgentResponse["status"]) => {
        if (settled) return;
        settled = true;
        response.status = nextStatus;
        response.endedAt = Date.now();
        cleanup();
        finishRunFeedback(runToken, nextStatus);
        if (activeRunScopeRef.current?.runId === runId) {
          activeRunScopeRef.current = null;
        }
        latestRunStateChangeRef.current(currentSession.id, false);

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
          latestPersistSessionRef.current({
            ...sessionAfterUserMessage,
            messages: [...sessionAfterUserMessage.messages, assistantMessage],
            updatedAt: assistantMessage.timestamp,
          });
        }

        queue.finish(update);
      };

      const handleEvent = (event: AgentEvent) => {
        if (
          settled ||
          event.sessionId !== currentSession.id ||
          event.runId !== runId
        ) {
          return;
        }

        switch (event.type) {
          case "agent_start":
            advanceRunFeedback(runToken, "connecting");
            publish();
            break;

          case "thinking_delta": {
            advanceRunFeedback(runToken, "thinking");

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
            advanceRunFeedback(runToken, "responding");
            response.finalText += event.delta;
            publish();
            break;

          case "message_end":
            response.usage = event.usage;
            if (typeof event.finalThinking === "string" && event.finalThinking.trim()) {
              const existingThinkingStep = getLatestThinkingStep(response.steps);

              if (existingThinkingStep) {
                if (!existingThinkingStep.thinkingText?.trim()) {
                  existingThinkingStep.thinkingText = event.finalThinking;
                }
              } else {
                const thinkingStep = createStep("thinking");
                thinkingStep.thinkingText = event.finalThinking;
                response.steps.push(thinkingStep);
              }
            }
            if (typeof event.finalText === "string") {
              response.finalText = event.finalText;
            }
            publish();
            break;

          case "tool_execution_start": {
            advanceRunFeedback(runToken, "tool");

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
            response.finalText += response.finalText
              ? `\n\n**错误：** ${event.message}`
              : `**错误：** ${event.message}`;
            finalize("error");
            break;

          case "agent_end":
            finalize("completed");
            break;
        }
      };

      unsubscribe = desktopApi.agent.onEvent(handleEvent);

      abort = () => {
        if (settled) return;

        advanceRunFeedback(runToken, "cancelling");
        void desktopApi.agent.cancel(runScope).catch(() => undefined);
        finalize("cancelled");
      };
      const abortHandler = abort;
      cancelRunRef.current = abortHandler;

      abortSignal.addEventListener("abort", abortHandler, { once: true });
      publish();

      void desktopApi.chat
        .send({
          sessionId: currentSession.id,
          runId,
          text,
          attachments: pendingAttachments,
        })
        .catch((error) => {
          if (settled) return;

          response.finalText =
            error instanceof Error ? error.message : "发送失败，请稍后重试。";
          finalize("error");
        });

      yield* queue.drain();
    },
  }), [
    advanceRunFeedback,
    beginRunFeedback,
    desktopApi,
    finishRunFeedback,
  ]);

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
        currentModelId={currentModelId}
        thinkingLevel={thinkingLevel}
        onModelChange={onModelChange}
        onThinkingLevelChange={onThinkingLevelChange}
        onCancelRun={handleCancelRun}
        runStage={runStage}
        runStatusLabel={runStatusLabel}
        isCancelling={isCancelling}
        visible={visible}
        branchSummary={branchSummary}
        contextSummary={contextSummary}
        onBranchChanged={onBranchChanged}
        disableGlobalSideEffects={disableGlobalSideEffects}
      />
    </AssistantRuntimeProvider>
  );
}

export function AssistantThreadPanel(props: AssistantThreadPanelProps) {
  return <SessionRuntime key={props.session.id} {...props} />;
}
