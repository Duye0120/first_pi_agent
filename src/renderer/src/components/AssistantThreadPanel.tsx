import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
  type ChatModelRunResult,
  type MessagePartStatus,
  type MessageStatus,
  type ThreadAssistantMessagePart,
  type ThreadMessageLike,
  type ToolCallMessagePartStatus,
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
  InterruptedApprovalGroup,
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
  type PersistedMessageAttachment,
} from "@renderer/lib/assistant-ui-attachments";

type AssistantThreadPanelProps = {
  session: ChatSession;
  desktopApi: DesktopApi;
  onPersistSession: (session: ChatSession) => void;
  onReloadSession: (sessionId: string) => void | Promise<void>;
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
  interruptedApprovalGroups: InterruptedApprovalGroup[];
  onDismissInterruptedApproval: (runId: string) => void | Promise<void>;
  onResumeInterruptedApproval: (runId: string) => Promise<string>;
  visible: boolean;
  disableGlobalSideEffects: boolean;
};

const CONNECTING_STAGE_DELAY_MS = 220;
const SLOW_CONNECTION_HINT_DELAY_MS = 4_000;
const CANCEL_RESET_DELAY_MS = 320;

type PendingMessageAction =
  | {
      messageId: string;
      type: "retry" | "edit";
    }
  | null;

type QueuedComposerAction = {
  text: string;
  attachments: SelectedFile[];
  autoSend: boolean;
};

type PendingComposerAction = QueuedComposerAction & {
  id: string;
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

function getLatestThinkingStep(steps: AgentStep[]) {
  return [...steps].reverse().find((step) => step.kind === "thinking");
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

function isPersistedSelectedFile(value: unknown): value is SelectedFile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SelectedFile>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.extension === "string" &&
    typeof candidate.kind === "string"
  );
}

function getMessageAttachments(message: ChatMessage): SelectedFile[] {
  const attachments = message.meta?.attachments;
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments.filter(isPersistedSelectedFile);
}

function buildSessionMessageSignature(messages: ChatMessage[]): string {
  return messages
    .map((message) => `${message.id}:${message.timestamp}:${message.status}`)
    .join("|");
}

function slugifyBranchPart(text: string): string {
  const asciiText = text.normalize("NFKD").replace(/[^\x00-\x7F]/g, "");
  const collapsed = asciiText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return collapsed.slice(0, 28);
}

function formatBranchTimestamp(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function buildEditBranchName(message: ChatMessage): string {
  const contentPart = slugifyBranchPart(message.content);
  const shortId = message.id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase();
  const suffix = contentPart || shortId || "message";

  return `chat-edit/${formatBranchTimestamp()}-${suffix}`;
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

type ActivityThreadAssistantMessagePart = ThreadAssistantMessagePart & {
  status?: MessagePartStatus | ToolCallMessagePartStatus;
  startedAt?: number;
  endedAt?: number;
};

function toPartStatus(
  step: AgentStep,
): MessagePartStatus | ToolCallMessagePartStatus {
  switch (step.status) {
    case "executing":
      return { type: "running" };
    case "success":
      return { type: "complete" };
    case "cancelled":
      return { type: "incomplete", reason: "cancelled" };
    case "error":
      return {
        type: "incomplete",
        reason: "error",
        error: step.toolError ?? step.toolResult ?? step.streamOutput,
      };
    default:
      return { type: "complete" };
  }
}

function buildAssistantParts(steps: AgentStep[], finalText: string): ThreadAssistantMessagePart[] {
  const parts: ActivityThreadAssistantMessagePart[] = [];

  for (const step of steps) {
    if (step.kind === "thinking" && step.thinkingText) {
      parts.push({
        type: "reasoning",
        text: step.thinkingText,
        status: toPartStatus(step),
        startedAt: step.startedAt,
        endedAt: step.endedAt,
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
        status: toPartStatus(step),
        startedAt: step.startedAt,
        endedAt: step.endedAt,
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

function LocalRuntimeThread({
  chatModel,
  session,
  attachments,
  isPickingFiles,
  terminalOpen,
  onAttachFiles,
  onPasteFiles,
  onRemoveAttachment,
  currentModelId,
  thinkingLevel,
  onModelChange,
  onThinkingLevelChange,
  onCancelRun,
  runStage,
  runStatusLabel,
  isCancelling,
  branchSummary,
  contextSummary,
  interruptedApprovalGroups,
  onDismissInterruptedApproval,
  onResumeInterruptedApproval,
  onCompactContext,
  onBranchChanged,
  disableGlobalSideEffects,
  visible,
  pendingComposerAction,
  onComposerActionApplied,
  onRetryMessage,
  onEditMessage,
  pendingMessageAction,
}: {
  chatModel: ChatModelAdapter;
  session: ChatSession;
  attachments: SelectedFile[];
  isPickingFiles: boolean;
  terminalOpen: boolean;
  onAttachFiles: () => void;
  onPasteFiles: (files: File[]) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  currentModelId: string;
  thinkingLevel: ThinkingLevel;
  onModelChange: (modelEntryId: string) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  onCancelRun: () => void;
  runStage: ChatRunStage;
  runStatusLabel: string;
  isCancelling: boolean;
  branchSummary: GitBranchSummary | null;
  contextSummary: ContextUsageSummary;
  interruptedApprovalGroups: InterruptedApprovalGroup[];
  onDismissInterruptedApproval: (runId: string) => void | Promise<void>;
  onResumeInterruptedApproval: (runId: string) => Promise<string>;
  onCompactContext: () => void | Promise<void>;
  onBranchChanged: () => void | Promise<void>;
  disableGlobalSideEffects: boolean;
  visible: boolean;
  pendingComposerAction: PendingComposerAction | null;
  onComposerActionApplied: (actionId: string) => void;
  onRetryMessage: (messageId: string) => Promise<void>;
  onEditMessage: (messageId: string) => Promise<void>;
  pendingMessageAction: PendingMessageAction;
}) {
  const runtime = useLocalRuntime(chatModel, {
    initialMessages: session.messages.map(toThreadMessage),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread
        attachments={attachments}
        isPickingFiles={isPickingFiles}
        terminalOpen={terminalOpen}
        onAttachFiles={onAttachFiles}
        onPasteFiles={onPasteFiles}
        onRemoveAttachment={onRemoveAttachment}
        currentModelId={currentModelId}
        thinkingLevel={thinkingLevel}
        onModelChange={onModelChange}
        onThinkingLevelChange={onThinkingLevelChange}
        onCancelRun={onCancelRun}
        runStage={runStage}
        runStatusLabel={runStatusLabel}
        isCancelling={isCancelling}
        visible={visible}
        branchSummary={branchSummary}
        contextSummary={contextSummary}
        interruptedApprovalGroups={interruptedApprovalGroups}
        onDismissInterruptedApproval={onDismissInterruptedApproval}
        onResumeInterruptedApproval={onResumeInterruptedApproval}
        onCompactContext={onCompactContext}
        onBranchChanged={onBranchChanged}
        disableGlobalSideEffects={disableGlobalSideEffects}
        pendingComposerAction={pendingComposerAction}
        onComposerActionApplied={onComposerActionApplied}
        onRetryMessage={onRetryMessage}
        onEditMessage={onEditMessage}
        pendingMessageAction={pendingMessageAction}
      />
    </AssistantRuntimeProvider>
  );
}

function SessionRuntime({
  session,
  desktopApi,
  onPersistSession,
  onReloadSession,
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
  interruptedApprovalGroups,
  onDismissInterruptedApproval,
  onResumeInterruptedApproval,
  visible,
  disableGlobalSideEffects,
}: AssistantThreadPanelProps) {
  const latestSessionRef = useRef(session);
  const latestPersistSessionRef = useRef(onPersistSession);
  const latestReloadSessionRef = useRef(onReloadSession);
  const latestRunStateChangeRef = useRef(onRunStateChange);
  const cancelRunRef = useRef<(() => void) | null>(null);
  const activeRunTokenRef = useRef<string | null>(null);
  const activeRunScopeRef = useRef<AgentRunScope | null>(null);
  const pendingRequestedRunIdRef = useRef<string | null>(null);
  const pendingThreadResetRef = useRef(false);
  const queuedComposerActionRef = useRef<QueuedComposerAction | null>(null);
  const stageTransitionTimerRef = useRef<number | null>(null);
  const slowConnectionTimerRef = useRef<number | null>(null);
  const resetRunStateTimerRef = useRef<number | null>(null);
  const [runStage, setRunStage] = useState<ChatRunStage>("idle");
  const [isSlowConnection, setIsSlowConnection] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [threadRuntimeKey, setThreadRuntimeKey] = useState(0);
  const [pendingComposerAction, setPendingComposerAction] =
    useState<PendingComposerAction | null>(null);
  const [pendingMessageAction, setPendingMessageAction] =
    useState<PendingMessageAction>(null);
  const sessionMessageSignature = useMemo(
    () => buildSessionMessageSignature(session.messages),
    [session.messages],
  );

  useEffect(() => {
    latestSessionRef.current = session;
  }, [session]);

  useEffect(() => {
    latestPersistSessionRef.current = onPersistSession;
  }, [onPersistSession]);

  useEffect(() => {
    latestReloadSessionRef.current = onReloadSession;
  }, [onReloadSession]);

  useEffect(() => {
    latestRunStateChangeRef.current = onRunStateChange;
  }, [onRunStateChange]);

  useEffect(() => {
    if (!pendingThreadResetRef.current) {
      return;
    }

    const queuedAction = queuedComposerActionRef.current;
    pendingThreadResetRef.current = false;
    queuedComposerActionRef.current = null;
    setThreadRuntimeKey((current) => current + 1);
    setPendingComposerAction(
      queuedAction
        ? {
            ...queuedAction,
            id: crypto.randomUUID(),
          }
        : null,
    );
  }, [session.updatedAt, sessionMessageSignature]);

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

  const handleResumeInterruptedApproval = useCallback(
    async (interruptedRunId: string) => {
      const nextRunId = await onResumeInterruptedApproval(interruptedRunId);
      pendingRequestedRunIdRef.current = nextRunId;
      return nextRunId;
    },
    [onResumeInterruptedApproval],
  );

  const refreshTrimmedSession = useCallback(
    async (attachments: SelectedFile[]) => {
      const sessionId = latestSessionRef.current.id;

      if (attachments.length > 0) {
        const trimmedSession = await desktopApi.sessions.load(sessionId);
        if (!trimmedSession) {
          throw new Error("裁剪后的会话加载失败。");
        }

        await desktopApi.sessions.save({
          ...trimmedSession,
          attachments,
          updatedAt: new Date().toISOString(),
        });
      }

      pendingThreadResetRef.current = true;
      try {
        await latestReloadSessionRef.current(sessionId);
      } catch (error) {
        pendingThreadResetRef.current = false;
        queuedComposerActionRef.current = null;
        throw error;
      }
    },
    [desktopApi.sessions],
  );

  const handleRetryMessage = useCallback(
    async (messageId: string) => {
      if (pendingMessageAction) {
        return;
      }

      const currentSession = latestSessionRef.current;
      const assistantIndex = currentSession.messages.findIndex(
        (message) => message.id === messageId && message.role === "assistant",
      );
      if (assistantIndex < 0) {
        return;
      }

      const previousUserMessage = [...currentSession.messages.slice(0, assistantIndex)]
        .reverse()
        .find((message) => message.role === "user");
      if (!previousUserMessage) {
        return;
      }

      const attachments = getMessageAttachments(previousUserMessage);
      setPendingMessageAction({ messageId, type: "retry" });

      try {
        await desktopApi.chat.trimSessionMessages({
          sessionId: currentSession.id,
          messageId: previousUserMessage.id,
        });
        queuedComposerActionRef.current = {
          text: previousUserMessage.content,
          attachments,
          autoSend: true,
        };
        await refreshTrimmedSession(attachments);
      } finally {
        setPendingMessageAction((current) =>
          current?.messageId === messageId && current.type === "retry"
            ? null
            : current,
        );
      }
    },
    [desktopApi.chat, pendingMessageAction, refreshTrimmedSession],
  );

  const handleEditMessage = useCallback(
    async (messageId: string) => {
      if (pendingMessageAction) {
        return;
      }

      const currentSession = latestSessionRef.current;
      const message = currentSession.messages.find(
        (entry) => entry.id === messageId && entry.role === "user",
      );
      if (!message) {
        return;
      }

      setPendingMessageAction({ messageId, type: "edit" });

      try {
        if (branchSummary?.branchName) {
          await desktopApi.git.createAndSwitchBranch(buildEditBranchName(message));
          await onBranchChanged();
        }

        const attachments = getMessageAttachments(message);
        await desktopApi.chat.trimSessionMessages({
          sessionId: currentSession.id,
          messageId,
        });
        queuedComposerActionRef.current = {
          text: message.content,
          attachments,
          autoSend: false,
        };
        await refreshTrimmedSession(attachments);
      } finally {
        setPendingMessageAction((current) =>
          current?.messageId === messageId && current.type === "edit"
            ? null
            : current,
        );
      }
    },
    [branchSummary?.branchName, desktopApi.chat, desktopApi.git, onBranchChanged, pendingMessageAction, refreshTrimmedSession],
  );

  const handleComposerActionApplied = useCallback((actionId: string) => {
    setPendingComposerAction((current) =>
      current?.id === actionId ? null : current,
    );
  }, []);

  const chatModel = useMemo<ChatModelAdapter>(() => ({
    run: async function* ({ messages, abortSignal }) {
      const currentSession = latestSessionRef.current;
      const runId = pendingRequestedRunIdRef.current ?? crypto.randomUUID();
      pendingRequestedRunIdRef.current = null;
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
      const sessionAfterUserMessage: ChatSession = {
        ...currentSession,
        title,
        draft: "",
        attachments: [],
        updatedAt: new Date().toISOString(),
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

        queue.finish(update);
      };

      const handleEvent = (event: AgentEvent) => {
        if (event.sessionId !== currentSession.id || event.runId !== runId) {
          return;
        }

        if (settled) {
          if (event.type === "agent_end" || event.type === "agent_error") {
            void latestReloadSessionRef.current(currentSession.id);
          }
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
            void latestReloadSessionRef.current(currentSession.id);
            break;

          case "agent_end":
            finalize("completed");
            void latestReloadSessionRef.current(currentSession.id);
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
          void latestReloadSessionRef.current(currentSession.id);
        });

      yield* queue.drain();
    },
  }), [
    advanceRunFeedback,
    beginRunFeedback,
    desktopApi,
    finishRunFeedback,
  ]);

  return (
    <LocalRuntimeThread
      key={`${session.id}:${threadRuntimeKey}`}
      chatModel={chatModel}
      session={session}
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
      interruptedApprovalGroups={interruptedApprovalGroups}
      onDismissInterruptedApproval={onDismissInterruptedApproval}
      onResumeInterruptedApproval={handleResumeInterruptedApproval}
      onCompactContext={async () => {
        try {
          await desktopApi.context.compact(session.id);
          await latestReloadSessionRef.current(session.id);
        } catch {
          // Compact 失败时保留当前线程 UI，不额外打断聊天流。
        }
      }}
      onBranchChanged={onBranchChanged}
      disableGlobalSideEffects={disableGlobalSideEffects}
      pendingComposerAction={pendingComposerAction}
      onComposerActionApplied={handleComposerActionApplied}
      onRetryMessage={handleRetryMessage}
      onEditMessage={handleEditMessage}
      pendingMessageAction={pendingMessageAction}
    />
  );
}

export const AssistantThreadPanel = memo(function AssistantThreadPanel(
  props: AssistantThreadPanelProps,
) {
  return <SessionRuntime key={props.session.id} {...props} />;
});
