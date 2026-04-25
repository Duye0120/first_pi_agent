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
  PendingApprovalGroup,
  RunChangeSummary,
  RuntimeSkillUsage,
  ThinkingLevel,
} from "@shared/contracts";
import { extractRuntimeSkillUsages } from "@shared/skill-usage";
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
import {
  readInterruptedApprovalInternalRun,
  resolveSendMessageOrigin,
  toInterruptedApprovalReloadConfig,
  type InterruptedApprovalReloadConfig,
} from "@renderer/lib/interrupted-approval-run-config";

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

function createStep(kind: AgentStep["kind"], id?: string): AgentStep {
  return {
    id: id ?? crypto.randomUUID(),
    kind,
    status: "executing",
    startedAt: Date.now(),
  };
}

type RuntimeResponse = AgentResponse & {
  internalRun?: InterruptedApprovalReloadConfig | null;
  errorMessage?: string;
};

function createResponse(
  id: string,
  internalRun: InterruptedApprovalReloadConfig | null = null,
): RuntimeResponse {
  return {
    id,
    status: "running",
    steps: [],
    finalText: "",
    skillUsages: [],
    runChangeSummary: null,
    internalRun,
    startedAt: Date.now(),
    errorMessage: undefined,
  };
}

function getLatestThinkingStep(steps: AgentStep[]) {
  return [...steps].reverse().find((step) => step.kind === "thinking");
}

function mergeRuntimeSkillUsages(
  current: RuntimeSkillUsage[],
  next: RuntimeSkillUsage[],
) {
  const byKey = new Map<string, RuntimeSkillUsage>();
  for (const item of current) {
    byKey.set(`${item.skillId}:${item.entryPointId}`, item);
  }
  for (const item of next) {
    byKey.set(`${item.skillId}:${item.entryPointId}`, item);
  }

  return [...byKey.values()];
}

function buildPendingApprovalGroupsSignature(groups: PendingApprovalGroup[]) {
  return groups
    .map((group) =>
      [
        group.sessionId,
        group.ownerId,
        group.count,
        group.latestCreatedAt,
        group.approvals
          .map((approval) => `${approval.approval.requestId}:${approval.state ?? "unknown"}`)
          .join(","),
      ].join(":"),
    )
    .join("|");
}

function buildRuntimeMessageCustomMetadata(response: RuntimeResponse) {
  const custom: Record<string, unknown> = {};

  if (response.skillUsages && response.skillUsages.length > 0) {
    custom.skillUsages = response.skillUsages;
  }

  if (response.runChangeSummary) {
    custom.runChangeSummary = response.runChangeSummary;
  }

  if (response.internalRun) {
    custom.internalRun = response.internalRun;
  }

  return Object.keys(custom).length > 0 ? custom : undefined;
}

type ActivityThreadAssistantMessagePart = ThreadAssistantMessagePart & {
  status?: MessagePartStatus | ToolCallMessagePartStatus;
  startedAt?: number;
  endedAt?: number;
};

type CommandGroupEntry = {
  id: string;
  label: string;
  status: AgentStep["status"];
  toolName: string;
  detailTitle?: string;
  detailText?: string;
  errorText?: string;
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

function quoteCommandValue(value: string) {
  return value.includes(" ") ? JSON.stringify(value) : value;
}

function getStringArg(args: Record<string, unknown> | undefined, key: string) {
  const value = args?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNumberArg(args: Record<string, unknown> | undefined, key: string) {
  const value = args?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeCommandDetailText(text: string) {
  return text.replace(/\r\n|\n\r|\r/g, "\n").trimEnd();
}

function stringifyCommandDetail(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string") {
    return normalizeCommandDetailText(value);
  }

  try {
    return normalizeCommandDetailText(JSON.stringify(value, null, 2));
  } catch {
    return normalizeCommandDetailText(String(value));
  }
}

function extractResultText(result: unknown): string | null {
  if (typeof result === "string") {
    return normalizeCommandDetailText(result);
  }

  if (!result || typeof result !== "object") {
    return null;
  }

  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return stringifyCommandDetail(result);
  }

  const textParts = content.flatMap((part) => {
    if (!part || typeof part !== "object") {
      return [];
    }

    const text = (part as { type?: unknown; text?: unknown }).text;
    return typeof text === "string" && text.trim()
      ? [normalizeCommandDetailText(text)]
      : [];
  });

  return textParts.length > 0 ? textParts.join("\n\n") : null;
}

function extractResultDetails(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== "object") {
    return null;
  }

  const details = (result as { details?: unknown }).details;
  return details && typeof details === "object"
    ? (details as Record<string, unknown>)
    : null;
}

function getCommandDetailTitle(toolName: string) {
  if (toolName === "shell_exec") {
    return "Shell";
  }

  if (toolName === "file_read") {
    return "File read";
  }

  if (toolName === "file_write") {
    return "File write";
  }

  if (toolName === "file_edit" || toolName === "edit_file") {
    return "File edit";
  }

  return toolName.replace(/_/g, " ");
}

function getCommandDetailText(step: AgentStep, label: string) {
  const toolName = step.toolName ?? "tool";
  const result = step.toolError ?? step.toolResult ?? step.streamOutput;
  const details = extractResultDetails(step.toolResult);

  if (toolName === "shell_exec") {
    const stdout = typeof details?.stdout === "string" ? details.stdout.trimEnd() : "";
    const stderr = typeof details?.stderr === "string" ? details.stderr.trimEnd() : "";
    const output = [stdout, stderr].filter(Boolean).join("\n");
    return [`$ ${label}`, output].filter(Boolean).join("\n");
  }

  const resultText = extractResultText(result);
  return resultText?.trim() ? resultText : null;
}

function formatToolCommand(step: AgentStep) {
  const args = step.toolArgs ?? {};
  const toolName = step.toolName ?? "tool";

  if (toolName === "shell_exec") {
    return getStringArg(args, "command") ?? "shell_exec";
  }

  if (toolName === "grep_search") {
    const pattern = getStringArg(args, "pattern") ?? "";
    const path = getStringArg(args, "path") ?? ".";
    const filePattern = getStringArg(args, "filePattern");
    const maxResults = getNumberArg(args, "maxResults");
    return [
      "rg -n",
      pattern ? quoteCommandValue(pattern) : null,
      filePattern ? `-g ${quoteCommandValue(filePattern)}` : null,
      path,
      maxResults !== null ? `--max-count ${maxResults}` : null,
    ].filter(Boolean).join(" ");
  }

  if (toolName === "glob_search") {
    const pattern = getStringArg(args, "pattern") ?? "*";
    const path = getStringArg(args, "path") ?? ".";
    return `rg --files ${path} -g ${quoteCommandValue(pattern)}`;
  }

  if (toolName === "file_read") {
    return `read ${getStringArg(args, "path") ?? "file"}`;
  }

  if (toolName === "file_write") {
    return `write ${getStringArg(args, "path") ?? "file"}`;
  }

  if (toolName === "file_edit" || toolName === "edit_file") {
    return `edit ${getStringArg(args, "path") ?? "file"}`;
  }

  if (toolName === "web_fetch") {
    return `fetch ${getStringArg(args, "url") ?? "url"}`;
  }

  if (toolName === "web_search") {
    return `search ${getStringArg(args, "query") ?? "web"}`;
  }

  return toolName.replace(/_/g, " ");
}

function buildCommandGroupPart(
  group: AgentStep[],
): ActivityThreadAssistantMessagePart | null {
  if (group.length === 0) {
    return null;
  }

  const first = group[0];
  const last = group[group.length - 1];
  const runningStep = group.find((step) => step.status === "executing");
  const errorStep = group.find((step) => step.status === "error");
  const cancelledStep = group.find((step) => step.status === "cancelled");
  const statusStep = runningStep ?? errorStep ?? cancelledStep ?? last;
  const commands: CommandGroupEntry[] = group.map((step) => ({
    id: step.id,
    label: formatToolCommand(step),
    status: step.status,
    toolName: step.toolName ?? "tool",
  })).map((command, index) => ({
    ...command,
    detailTitle: getCommandDetailTitle(command.toolName),
    detailText: getCommandDetailText(group[index], command.label) ?? undefined,
    errorText: stringifyCommandDetail(group[index].toolError) ?? undefined,
  }));

  return {
    type: "tool-call",
    toolCallId: `command-group-${first.id}-${group.length}`,
    toolName: "command_group",
    args: {},
    argsText: "{}",
    result: {
      content: [
        {
          type: "text",
          text: `Ran ${group.length} ${group.length === 1 ? "command" : "commands"}`,
        },
      ],
      details: {
        commands,
      },
    },
    isError: group.some((step) => step.status === "error"),
    status: toPartStatus(statusStep),
    startedAt: first.startedAt,
    endedAt: runningStep ? undefined : last.endedAt,
  };
}

function buildAssistantParts(steps: AgentStep[], finalText: string): ThreadAssistantMessagePart[] {
  const parts: ActivityThreadAssistantMessagePart[] = [];
  let toolGroup: AgentStep[] = [];

  const flushToolGroup = () => {
    const groupPart = buildCommandGroupPart(toolGroup);
    if (groupPart) {
      parts.push(groupPart);
    }
    toolGroup = [];
  };

  for (const step of steps) {
    if (step.kind === "thinking" && step.thinkingText) {
      flushToolGroup();
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
      toolGroup.push(step);
    }
  }
  flushToolGroup();

  if (finalText) {
    parts.push({
      type: "text",
      text: finalText,
    });
  }

  return parts;
}

function toThreadMessage(message: ChatMessage): ThreadMessageLike | null {
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
  const skillUsages = extractRuntimeSkillUsages(message.meta?.skillUsages);

  if (message.role === "assistant") {
    const parts = buildAssistantParts(message.steps ?? [], message.content);
    if (parts.length === 0) {
      return null;
    }

    return {
      id: message.id,
      role: "assistant",
      createdAt,
      content: parts,
      status:
        message.status === "error"
          ? { type: "incomplete", reason: "error", error: message.content }
          : { type: "complete", reason: "stop" },
      metadata: {
        custom: {
          rawMessageId: message.id,
          ...(message.meta?.runChangeSummary
            ? { runChangeSummary: message.meta.runChangeSummary as RunChangeSummary }
            : {}),
          ...(skillUsages.length > 0 ? { skillUsages } : {}),
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
    finish(update?: ChatModelRunResult) {
      finished = true;
      if (update) {
        queue.push(update);
      }
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

function buildRuntimeStatus(response: RuntimeResponse): MessageStatus {
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
      // R31: UI 只展示产品级中文文案，避免直接 dump 内部 error 字符串。
      error: response.errorMessage || "执行遇到问题，请稍后重试。",
    };
  }

  return { type: "running" };
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
  const draftPersistTimerRef = useRef<number | null>(null);
  const latestRunStateChangeRef = useRef(onRunStateChange);
  const activeRunUnsubscribeRef = useRef<(() => void) | null>(null);
  const pendingApprovalRequestSerialRef = useRef(0);
  const pendingApprovalSignatureRef = useRef("");
  // R14: confirmation_request 可能在短时间内连续发送多个，合并为一次 IPC 调用。
  const pendingApprovalDebounceRef = useRef<number | null>(null);
  const pendingApprovalLatestSessionIdRef = useRef<string | null>(null);
  const cancelRunRef = useRef<(() => void) | null>(null);
  const activeRunTokenRef = useRef<string | null>(null);
  const activeRunScopeRef = useRef<AgentRunScope | null>(null);
  const stageTransitionTimerRef = useRef<number | null>(null);
  const slowConnectionTimerRef = useRef<number | null>(null);
  const resetRunStateTimerRef = useRef<number | null>(null);
  const [runStage, setRunStage] = useState<ChatRunStage>("idle");
  const [isSlowConnection, setIsSlowConnection] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [runCompletionSerial, setRunCompletionSerial] = useState(0);
  const [pendingApprovalGroups, setPendingApprovalGroups] = useState<
    PendingApprovalGroup[]
  >([]);
  const initialMessagesRef = useRef<ThreadMessageLike[]>(
    session.messages.flatMap((message) => {
      const nextMessage = toThreadMessage(message);
      return nextMessage ? [nextMessage] : [];
    }),
  );
  const initialMessages = initialMessagesRef.current;

  useEffect(() => {
    latestSessionRef.current = session;
  }, [session]);

  useEffect(() => {
    latestPersistSessionRef.current = onPersistSession;
  }, [onPersistSession]);

  useEffect(() => {
    latestReloadSessionRef.current = onReloadSession;
  }, [onReloadSession]);

  useEffect(() => () => {
    if (draftPersistTimerRef.current !== null) {
      window.clearTimeout(draftPersistTimerRef.current);
      draftPersistTimerRef.current = null;
    }
  }, []);

  const handleDraftChange = useCallback((draft: string) => {
    if (draftPersistTimerRef.current !== null) {
      window.clearTimeout(draftPersistTimerRef.current);
    }

    const sourceSession = latestSessionRef.current;
    draftPersistTimerRef.current = window.setTimeout(() => {
      draftPersistTimerRef.current = null;
      if (sourceSession.draft === draft) {
        return;
      }

      latestPersistSessionRef.current({
        ...sourceSession,
        draft,
        updatedAt: new Date().toISOString(),
      });
    }, 250);
  }, []);

  useEffect(() => {
    latestRunStateChangeRef.current = onRunStateChange;
  }, [onRunStateChange]);

  const refreshPendingApprovalGroups = useCallback(
    async (sessionId: string) => {
      const requestSerial = ++pendingApprovalRequestSerialRef.current;

      if (!desktopApi.agent.listPendingApprovalGroups) {
        pendingApprovalSignatureRef.current = "";
        setPendingApprovalGroups((current) => (current.length === 0 ? current : []));
        return [] as PendingApprovalGroup[];
      }

      try {
        const groups = await desktopApi.agent.listPendingApprovalGroups(sessionId);
        if (
          pendingApprovalRequestSerialRef.current !== requestSerial ||
          latestSessionRef.current.id !== sessionId
        ) {
          return groups;
        }

        const signature = buildPendingApprovalGroupsSignature(groups);
        if (pendingApprovalSignatureRef.current !== signature) {
          pendingApprovalSignatureRef.current = signature;
          setPendingApprovalGroups(groups);
        }
        return groups;
      } catch {
        if (
          pendingApprovalRequestSerialRef.current === requestSerial &&
          latestSessionRef.current.id === sessionId
        ) {
          pendingApprovalSignatureRef.current = "";
          setPendingApprovalGroups((current) => (current.length === 0 ? current : []));
        }
        return [] as PendingApprovalGroup[];
      }
    },
    [desktopApi],
  );

  // R14: confirmation_request 风暴去重 — 100ms trailing debounce，连续 N 个事件只触发一次 IPC。
  const scheduleApprovalRefresh = useCallback(
    (sessionId: string) => {
      pendingApprovalLatestSessionIdRef.current = sessionId;
      if (pendingApprovalDebounceRef.current !== null) {
        return;
      }
      pendingApprovalDebounceRef.current = window.setTimeout(() => {
        pendingApprovalDebounceRef.current = null;
        const targetSessionId = pendingApprovalLatestSessionIdRef.current;
        if (!targetSessionId) return;
        void refreshPendingApprovalGroups(targetSessionId);
      }, 100);
    },
    [refreshPendingApprovalGroups],
  );

  useEffect(() => {
    return () => {
      if (pendingApprovalDebounceRef.current !== null) {
        window.clearTimeout(pendingApprovalDebounceRef.current);
        pendingApprovalDebounceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    void refreshPendingApprovalGroups(session.id);
  }, [refreshPendingApprovalGroups, session.id]);

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

  const clearActiveRunSubscription = useCallback(() => {
    const unsubscribe = activeRunUnsubscribeRef.current;
    activeRunUnsubscribeRef.current = null;
    unsubscribe?.();
  }, []);

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
    clearActiveRunSubscription();
    clearRunFeedbackTimers();
    activeRunTokenRef.current = null;
    if (activeRunScopeRef.current) {
      latestRunStateChangeRef.current(activeRunScopeRef.current.sessionId, false);
      activeRunScopeRef.current = null;
    }
  }, [clearActiveRunSubscription, clearRunFeedbackTimers]);

  const runStatusLabel = useMemo(
    () => getRunStatusLabel(runStage, { isSlowConnection }),
    [isSlowConnection, runStage],
  );

  const handleCancelRun = useCallback(() => {
    cancelRunRef.current?.();
  }, []);

  const handleEnqueueQueuedMessage = useCallback(
    async (text: string) => {
      const queuedMessage = await desktopApi.chat.enqueueQueuedMessage({
        sessionId: latestSessionRef.current.id,
        text,
      });
      await latestReloadSessionRef.current(latestSessionRef.current.id);
      return queuedMessage.id;
    },
    [desktopApi],
  );

  const handleTriggerQueuedMessage = useCallback(
    async (messageId: string) => {
      await desktopApi.chat.triggerQueuedMessage({
        sessionId: latestSessionRef.current.id,
        messageId,
        runId: activeRunScopeRef.current?.runId ?? null,
      });
      await latestReloadSessionRef.current(latestSessionRef.current.id);
    },
    [desktopApi],
  );

  const handleGuideQueuedMessage = useCallback(
    async (text: string) => {
      // 先把新消息入队并移到队首，再触发取消。
      // 顺序不能颠倒：如果 cancel 在 trigger 移到队首之前完成，run 结束后
      // 自动派发 effect 会看到旧队首并误派发，引导就失效了。
      const queuedId = await handleEnqueueQueuedMessage(text);
      await handleTriggerQueuedMessage(queuedId);
      cancelRunRef.current?.();
    },
    [handleEnqueueQueuedMessage, handleTriggerQueuedMessage],
  );

  const handleRemoveQueuedMessage = useCallback(async (messageId: string) => {
    await desktopApi.chat.removeQueuedMessage({
      sessionId: latestSessionRef.current.id,
      messageId,
    });
    await latestReloadSessionRef.current(latestSessionRef.current.id);
  }, [desktopApi]);

  const chatModel = useMemo<ChatModelAdapter>(() => ({
    run: async function* ({ messages, runConfig, abortSignal }) {
      const currentSession = latestSessionRef.current;
      const internalRun = readInterruptedApprovalInternalRun(runConfig?.custom);
      const runId = internalRun?.requestedRunId ?? crypto.randomUUID();
      const runScope: AgentRunScope = {
        sessionId: currentSession.id,
        runId,
      };
      const text = internalRun?.prompt ?? extractUserText(messages);
      const pendingAttachments = internalRun ? [] : currentSession.attachments;
      const title =
        !internalRun && currentSession.messages.length === 0
          ? deriveSessionTitle(text, pendingAttachments)
          : currentSession.title;
      const sessionAfterUserMessage: ChatSession = {
        ...currentSession,
        title,
        draft: "",
        attachments: [],
        updatedAt: new Date().toISOString(),
      };

      if (!internalRun) {
        latestPersistSessionRef.current(sessionAfterUserMessage);
      }
      activeRunScopeRef.current = runScope;
      latestRunStateChangeRef.current(currentSession.id, true);

      const runToken = beginRunFeedback();
      const response = createResponse(
        runId,
        toInterruptedApprovalReloadConfig(internalRun),
      );
      const queue = createRunQueue();

      let settled = false;
      let cleanedUp = false;
      let unsubscribe: () => void = () => { };
      let abort: (() => void) | null = null;
      let receivedMessageEnd = false;

      clearActiveRunSubscription();

      const disposeSubscription = () => {
        unsubscribe();
        unsubscribe = () => { };
        if (activeRunUnsubscribeRef.current === disposeSubscription) {
          activeRunUnsubscribeRef.current = null;
        }
      };

      const publish = () => {
        if (settled) return;

        const parts = buildAssistantParts(response.steps, response.finalText);
        if (parts.length === 0) {
          return;
        }

        queue.push({
          content: parts,
          status: buildRuntimeStatus(response),
          metadata: {
            custom: buildRuntimeMessageCustomMetadata(response),
          },
        });
      };

      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        disposeSubscription();
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

        const parts = buildAssistantParts(response.steps, response.finalText);
        if (nextStatus === "cancelled" && !response.finalText.trim()) {
          // 无论之前有没有 thinking/tool_call，只要取消时还没产出最终文本，
          // 都在末尾补一句占位，避免 UI 没有任何「已取消」指示。
          parts.push({ type: "text", text: "（已取消）" });
          queue.finish({
            content: parts,
            status: buildRuntimeStatus(response),
            metadata: {
              custom: buildRuntimeMessageCustomMetadata(response),
            },
          });
          return;
        }

        const update: ChatModelRunResult = {
          content: parts,
          status: buildRuntimeStatus(response),
          metadata: {
            custom: buildRuntimeMessageCustomMetadata(response),
          },
        };

        queue.finish(update);
      };

      const handleEvent = (event: AgentEvent) => {
        if (event.sessionId !== currentSession.id || event.runId !== runId) {
          return;
        }

        if (settled) {
          if (event.type === "agent_end" || event.type === "agent_error") {
            setRunCompletionSerial((current) => current + 1);
            void latestReloadSessionRef.current(currentSession.id);
            disposeSubscription();
          }
          return;
        }

        switch (event.type) {
          case "agent_start":
            advanceRunFeedback(runToken, "connecting");
            publish();
            break;

          case "confirmation_request":
            // R14: 风暴场景下走 debounce 合并；用户体感无感知（100ms 延迟可忽略）。
            scheduleApprovalRefresh(currentSession.id);
            break;

          case "run_state_changed":
            if (event.state !== "awaiting_confirmation") {
              scheduleApprovalRefresh(currentSession.id);
            }
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
            receivedMessageEnd = true;
            response.usage = event.usage;
            // R17: message_end 的 finalThinking 是模型确认的最终版本，必须无条件替换 deltas 累积的内容；
            // 否则断流或 deltas 不完整时，UI 会停留在 partial state，AGENTS.md 强约束要求兜底恢复。
            if (typeof event.finalThinking === "string" && event.finalThinking.trim()) {
              const existingThinkingStep = getLatestThinkingStep(response.steps);

              if (existingThinkingStep) {
                existingThinkingStep.thinkingText = event.finalThinking;
                if (existingThinkingStep.status === "executing") {
                  existingThinkingStep.status = "success";
                  existingThinkingStep.endedAt = Date.now();
                }
              } else {
                const thinkingStep = createStep("thinking");
                thinkingStep.thinkingText = event.finalThinking;
                thinkingStep.status = "success";
                thinkingStep.endedAt = Date.now();
                response.steps.push(thinkingStep);
              }
            }
            // R17: finalText 同样是最终版本；仅在非空时覆盖，避免某些 provider 给空串清掉 deltas。
            if (typeof event.finalText === "string" && event.finalText.length > 0) {
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
            const skillUsages = extractRuntimeSkillUsages(event.result);
            if (skillUsages.length > 0) {
              response.skillUsages = mergeRuntimeSkillUsages(
                response.skillUsages ?? [],
                skillUsages,
              );
            }
            publish();
            break;
          }

          case "agent_error":
            response.errorMessage = "执行遇到问题，请稍后重试。";
            finalize("error");
            setRunCompletionSerial((current) => current + 1);
            void refreshPendingApprovalGroups(currentSession.id);
            void latestReloadSessionRef.current(currentSession.id);
            break;

          case "agent_end":
            if (!receivedMessageEnd && (response.finalText.trim() || response.steps.length > 0)) {
              publish();
            }
            response.runChangeSummary = event.runChangeSummary ?? null;
            finalize("completed");
            setRunCompletionSerial((current) => current + 1);
            void refreshPendingApprovalGroups(currentSession.id);
            void latestReloadSessionRef.current(currentSession.id);
            break;
        }
      };

      unsubscribe = desktopApi.agent.onEvent(handleEvent);
      activeRunUnsubscribeRef.current = disposeSubscription;

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
          origin: resolveSendMessageOrigin(internalRun),
        })
        .catch((error) => {
          if (settled) return;

          response.errorMessage = "发送失败，请稍后重试。";
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

  const runtime = useLocalRuntime(chatModel, {
    initialMessages,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread
        sessionId={session.id}
        draft={session.draft}
        attachments={session.attachments}
        isPickingFiles={isPickingFiles}
        terminalOpen={terminalOpen}
        onAttachFiles={onAttachFiles}
        onPasteFiles={onPasteFiles}
        onRemoveAttachment={onRemoveAttachment}
        onDraftChange={handleDraftChange}
        currentModelId={currentModelId}
        thinkingLevel={thinkingLevel}
        onModelChange={onModelChange}
        onThinkingLevelChange={onThinkingLevelChange}
        onCancelRun={handleCancelRun}
        queuedMessages={session.queuedMessages ?? []}
        runCompletionSerial={runCompletionSerial}
        runStage={runStage}
        runStatusLabel={runStatusLabel}
        isCancelling={isCancelling}
        visible={visible}
        branchSummary={branchSummary}
        contextSummary={contextSummary}
        interruptedApprovalGroups={interruptedApprovalGroups}
        onDismissInterruptedApproval={onDismissInterruptedApproval}
        onResumeInterruptedApproval={onResumeInterruptedApproval}
        pendingApprovalGroups={pendingApprovalGroups}
        onResolvePendingApproval={async (requestId, allowed) => {
          await desktopApi.agent.confirmResponse({
            requestId,
            allowed,
          });
          await refreshPendingApprovalGroups(session.id);
        }}
        onCompactContext={async () => {
          try {
            await desktopApi.context.compact(session.id);
            await latestReloadSessionRef.current(session.id);
          } catch {
            // Compact 失败时保留当前线程 UI，不额外打断聊天流。
          }
        }}
        onEnqueueQueuedMessage={handleEnqueueQueuedMessage}
        onTriggerQueuedMessage={handleTriggerQueuedMessage}
        onGuideQueuedMessage={handleGuideQueuedMessage}
        onRemoveQueuedMessage={handleRemoveQueuedMessage}
        onBranchChanged={onBranchChanged}
        disableGlobalSideEffects={disableGlobalSideEffects}
      />
    </AssistantRuntimeProvider>
  );
}

export const AssistantThreadPanel = memo(function AssistantThreadPanel(
  props: AssistantThreadPanelProps,
) {
  return <SessionRuntime key={props.session.id} {...props} />;
});
