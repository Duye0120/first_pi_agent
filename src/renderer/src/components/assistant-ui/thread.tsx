import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FC,
} from "react";
import {
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BotIcon,
  BrainCircuitIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CopyIcon,
  LoaderCircleIcon,
  PencilIcon,
  RotateCcwIcon,
  SendHorizonalIcon,
  SquareIcon,
  Wand2Icon,
  XIcon,
} from "lucide-react";
import type {
  GitBranchSummary,
  InterruptedApprovalGroup,
  InterruptedApprovalNotice,
  ModelEntry,
  PendingApprovalGroup,
  PendingApprovalNotice,
  QueuedMessage,
  RunChangeSummary,
  RuntimeSkillUsage,
  ProviderSource,
  SelectedFile,
  ThinkingLevel,
} from "@shared/contracts";
import { extractRuntimeSkillUsages } from "@shared/skill-usage";

import {
  ComposerAttachments,
  DesktopComposerAddAttachment,
  UserMessageAttachments,
} from "@renderer/components/assistant-ui/attachment";
import { BranchSwitcher } from "@renderer/components/assistant-ui/branch-switcher";
import { Badge } from "@renderer/components/assistant-ui/badge";
import { Button } from "@renderer/components/assistant-ui/button";
import {
  InterruptedApprovalNoticeBar,
  PendingApprovalNoticeBar,
} from "@renderer/components/assistant-ui/approval-notice-bar";
import { ContextSummaryTrigger } from "@renderer/components/assistant-ui/context-summary-trigger";
import { MarkdownText } from "@renderer/components/assistant-ui/markdown-text";
import {
  ModelSelector,
  type ModelOption,
} from "@renderer/components/assistant-ui/model-selector";
import {
  EMPTY_CONTEXT_USAGE_SUMMARY,
  formatTokenCount,
  type ContextUsageSummary,
} from "@renderer/lib/context-usage";
import { Reasoning } from "@renderer/components/assistant-ui/reasoning";
import { SkillUsageStrip } from "@renderer/components/assistant-ui/skill-usage-strip";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from "@renderer/components/assistant-ui/select";
import { ToolFallback } from "@renderer/components/assistant-ui/tool-fallback";
import { TooltipIconButton } from "@renderer/components/assistant-ui/tooltip-icon-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";
import {
  selectedFileToCreateAttachment,
  toPersistedMessageAttachment,
} from "@renderer/lib/assistant-ui-attachments";
import {
  buildInterruptedApprovalRunConfig,
  readInterruptedApprovalInternalRun,
} from "@renderer/lib/interrupted-approval-run-config";
import {
  buildSelectableModelOptions,
  findEntryLabel,
  loadProviderDirectory,
  subscribeProviderDirectoryChanged,
} from "@renderer/lib/provider-directory";
import {
  canConfigureThinking,
  getEffectiveThinkingLevel,
  getThinkingHint,
  getThinkingLevelLabel,
  getThinkingOptionsForModel,
  normalizeThinkingLevel,
} from "@renderer/lib/thinking-levels";
import type { ChatRunStage } from "@renderer/lib/chat-run-status";
import { cn } from "@renderer/lib/utils";

type ThreadProps = {
  sessionId: string;
  draft?: string;
  attachments?: SelectedFile[];
  isPickingFiles?: boolean;
  terminalOpen?: boolean;
  visible?: boolean;
  onAttachFiles?: () => void;
  onPasteFiles?: (files: File[]) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  onDraftChange?: (draft: string) => void;
  currentModelId?: string;
  thinkingLevel?: ThinkingLevel;
  onModelChange?: (modelEntryId: string) => void;
  onThinkingLevelChange?: (level: ThinkingLevel) => void;
  onCancelRun?: () => void;
  queuedMessages?: QueuedMessage[];
  runCompletionSerial?: number;
  runStage?: ChatRunStage;
  runStatusLabel?: string;
  isCancelling?: boolean;
  branchSummary?: GitBranchSummary | null;
  contextSummary?: ContextUsageSummary;
  interruptedApprovalGroups?: InterruptedApprovalGroup[];
  pendingApprovalGroups?: PendingApprovalGroup[];
  onDismissInterruptedApproval?: (runId: string) => void | Promise<void>;
  onResumeInterruptedApproval?: (runId: string) => Promise<string>;
  onResolvePendingApproval?: (
    requestId: string,
    allowed: boolean,
  ) => Promise<void>;
  onCompactContext?: () => void | Promise<void>;
  onEnqueueQueuedMessage?: (text: string) => Promise<string>;
  onTriggerQueuedMessage?: (messageId: string) => Promise<void>;
  onGuideQueuedMessage?: (text: string) => Promise<void>;
  onRemoveQueuedMessage?: (messageId: string) => Promise<void>;
  onBranchChanged?: () => void | Promise<void>;
  disableGlobalSideEffects?: boolean;
};

type ThreadResolvedProps = {
  attachments: SelectedFile[];
  isPickingFiles: boolean;
  visible: boolean;
  modelOptions: ModelOption[];
  onAttachFiles: () => void;
  onPasteFiles: (files: File[]) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  currentModelId: string;
  currentModelEntry: ModelEntry | null;
  thinkingLevel: ThinkingLevel;
  onModelChange: (modelEntryId: string) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  onCancelRun: () => void;
  queuedMessages: QueuedMessage[];
  runCompletionSerial: number;
  runStage: ChatRunStage;
  runStatusLabel: string;
  isCancelling: boolean;
  branchSummary: GitBranchSummary | null;
  contextSummary: ContextUsageSummary;
  interruptedApprovalGroups: InterruptedApprovalGroup[];
  pendingApprovalGroups: PendingApprovalGroup[];
  onDismissInterruptedApproval: (runId: string) => void | Promise<void>;
  onResumeInterruptedApproval: (runId: string) => Promise<string>;
  onResolvePendingApproval: (
    requestId: string,
    allowed: boolean,
  ) => Promise<void>;
  onCompactContext: () => void | Promise<void>;
  onEnqueueQueuedMessage: (text: string) => Promise<string>;
  onTriggerQueuedMessage: (messageId: string) => Promise<void>;
  onGuideQueuedMessage: (text: string) => Promise<void>;
  onRemoveQueuedMessage: (messageId: string) => Promise<void>;
  onBranchChanged: () => void | Promise<void>;
  disableGlobalSideEffects: boolean;
};

type ThreadRunStatusContextValue = {
  runStage: ChatRunStage;
  runStatusLabel: string;
  isCancelling: boolean;
};

const ThreadRunStatusContext = createContext<ThreadRunStatusContextValue>({
  runStage: "idle",
  runStatusLabel: "",
  isCancelling: false,
});

function formatStatusTokenCount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  if (value < 1_000) {
    return String(Math.round(value));
  }

  return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1).replace(/\.0$/, "")}k`;
}

function isBtwCommand(text: string) {
  return /^\/btw(?:\s|$)/i.test(text.trim());
}

function useThreadRunStatus() {
  return useContext(ThreadRunStatusContext);
}

function buildModelOptions(
  sources: ProviderSource[],
  entries: ModelEntry[],
  currentModelId: string,
): ModelOption[] {
  const options: ModelOption[] = buildSelectableModelOptions(sources, entries).map((model) => ({
    id: model.value,
    name: model.label,
    description: model.description,
    groupId: model.groupId,
    groupLabel: model.groupLabel,
    icon: <BotIcon className="size-4" />,
    disabled: false,
  }));

  return options;
}

function collectClipboardFiles(dataTransfer: DataTransfer): File[] {
  const files: File[] = [];
  const seen = new Set<string>();

  const appendFile = (file: File | null) => {
    if (!file) return;

    const fileKey = [file.name, file.size, file.type, file.lastModified].join(
      ":",
    );

    if (seen.has(fileKey)) return;
    seen.add(fileKey);
    files.push(file);
  };

  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== "file") continue;
    appendFile(item.getAsFile());
  }

  for (const file of Array.from(dataTransfer.files)) {
    appendFile(file);
  }

  return files;
}

export const Thread: FC<ThreadProps> = ({
  sessionId,
  draft = "",
  attachments = [],
  isPickingFiles = false,
  terminalOpen = false,
  visible = true,
  onAttachFiles = () => undefined,
  onPasteFiles = () => undefined,
  onRemoveAttachment = () => undefined,
  onDraftChange = () => undefined,
  currentModelId = "builtin:anthropic:claude-sonnet-4-20250514",
  thinkingLevel = "off",
  onModelChange = () => undefined,
  onThinkingLevelChange = () => undefined,
  onCancelRun = () => undefined,
  queuedMessages = [],
  runCompletionSerial = 0,
  runStage = "idle",
  runStatusLabel = "",
  isCancelling = false,
  branchSummary = null,
  contextSummary = EMPTY_CONTEXT_USAGE_SUMMARY,
  interruptedApprovalGroups = [],
  pendingApprovalGroups = [],
  onDismissInterruptedApproval = () => undefined,
  onResumeInterruptedApproval = async () => {
    throw new Error("恢复执行当前不可用。");
  },
  onResolvePendingApproval = async () => undefined,
  onCompactContext = () => undefined,
  onEnqueueQueuedMessage = async () => "",
  onTriggerQueuedMessage = async () => undefined,
  onGuideQueuedMessage = async () => undefined,
  onRemoveQueuedMessage = async () => undefined,
  onBranchChanged = () => undefined,
  disableGlobalSideEffects = false,
}) => {
  const aui = useAui();
  const composerText = useAuiState((state) => state.composer.text);
  const viewportRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(visible);
  const hydratedDraftSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (hydratedDraftSessionIdRef.current === sessionId) {
      return;
    }

    hydratedDraftSessionIdRef.current = sessionId;
    aui.composer().setText(draft);
  }, [aui, draft, sessionId]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    onDraftChange(composerText);
  }, [composerText, onDraftChange, visible]);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (!terminalOpen || !viewportRef.current) {
      return;
    }

    const viewport = viewportRef.current;
    let frameId = 0;
    let timeoutId = 0;

    const scrollToBottom = (behavior: ScrollBehavior) => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior,
      });
    };

    const scheduleScroll = (behavior: ScrollBehavior) => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }

      frameId = requestAnimationFrame(() => {
        scrollToBottom(behavior);
      });
    };

    scheduleScroll("auto");

    const resizeObserver = new ResizeObserver(() => {
      scheduleScroll("auto");
    });
    resizeObserver.observe(viewport);

    timeoutId = window.setTimeout(() => {
      scrollToBottom("smooth");
    }, 260);

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      resizeObserver.disconnect();
    };
  }, [terminalOpen]);

  const [sources, setSources] = useState<ProviderSource[]>([]);
  const [entries, setEntries] = useState<ModelEntry[]>([]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    let disposed = false;
    let activeController: AbortController | null = null;

    const syncProviderDirectory = async (force = false) => {
      if (!window.desktopApi) return;

      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      try {
        const nextDirectory = await loadProviderDirectory(window.desktopApi, {
          force,
          signal: controller.signal,
        });

        if (disposed || controller.signal.aborted || !visibleRef.current) {
          return;
        }

        setSources(nextDirectory.sources);
        setEntries(nextDirectory.entries);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        console.warn("[provider-directory] 同步 provider 目录失败", error);
      } finally {
        if (activeController === controller) {
          activeController = null;
        }
      }
    };

    void syncProviderDirectory();

    const unsubscribe = subscribeProviderDirectoryChanged(() => {
      void syncProviderDirectory(true);
    });

    return () => {
      disposed = true;
      activeController?.abort();
      unsubscribe();
    };
  }, [visible]);

  const modelOptions = useMemo(
    () => buildModelOptions(sources, entries, currentModelId),
    [currentModelId, entries, sources],
  );
  const currentModelEntry = useMemo(
    () => entries.find((entry) => entry.id === currentModelId) ?? null,
    [currentModelId, entries],
  );

  return (
    <ThreadRunStatusContext.Provider
      value={{ runStage, runStatusLabel, isCancelling }}
    >
      <ThreadPrimitive.Root
        className="@container flex h-full min-h-0 flex-col bg-shell-panel"
        style={{
          ["--thread-max-width" as string]: "100%",
          ["--composer-radius" as string]: "8px",
          ["--composer-padding" as string]: "12px",
        }}
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          <ThreadPrimitive.Viewport
            ref={viewportRef}
            turnAnchor="bottom"
            autoScroll
            scrollToBottomOnInitialize
            scrollToBottomOnThreadSwitch
            className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto scroll-smooth px-6 pt-4"
          >
            <AuiIf condition={(s) => s.thread.isEmpty}>
              <ThreadWelcome />
            </AuiIf>

            <ThreadPrimitive.Messages>
              {() => <ThreadMessage />}
            </ThreadPrimitive.Messages>
          </ThreadPrimitive.Viewport>

          <div
            className={
              terminalOpen
                ? "relative mx-auto flex w-full max-w-(--thread-max-width) shrink-0 flex-col gap-2 overflow-visible bg-gradient-to-t from-shell-panel via-shell-panel/85 to-transparent px-6 pb-4 pt-2"
                : "relative mx-auto flex w-full max-w-(--thread-max-width) shrink-0 flex-col gap-3 overflow-visible bg-gradient-to-t from-shell-panel via-shell-panel to-transparent px-6 pb-6 pt-4 md:pb-6"
            }
          >
            <ThreadScrollToBottom />
            <Composer
              attachments={attachments}
              isPickingFiles={isPickingFiles}
              modelOptions={modelOptions}
              onAttachFiles={onAttachFiles}
              onPasteFiles={onPasteFiles}
              onRemoveAttachment={onRemoveAttachment}
              currentModelId={currentModelId}
              currentModelEntry={currentModelEntry}
              thinkingLevel={thinkingLevel}
              onModelChange={onModelChange}
              onThinkingLevelChange={onThinkingLevelChange}
              onCancelRun={onCancelRun}
              queuedMessages={queuedMessages}
              runCompletionSerial={runCompletionSerial}
              runStage={runStage}
              runStatusLabel={runStatusLabel}
              isCancelling={isCancelling}
              visible={visible}
              branchSummary={branchSummary}
              contextSummary={contextSummary}
              interruptedApprovalGroups={interruptedApprovalGroups}
              pendingApprovalGroups={pendingApprovalGroups}
              onDismissInterruptedApproval={onDismissInterruptedApproval}
              onResumeInterruptedApproval={onResumeInterruptedApproval}
              onResolvePendingApproval={onResolvePendingApproval}
              onCompactContext={onCompactContext}
              onEnqueueQueuedMessage={onEnqueueQueuedMessage}
              onTriggerQueuedMessage={onTriggerQueuedMessage}
              onGuideQueuedMessage={onGuideQueuedMessage}
              onRemoveQueuedMessage={onRemoveQueuedMessage}
              onBranchChanged={onBranchChanged}
              disableGlobalSideEffects={disableGlobalSideEffects}
            />
          </div>
        </div>
      </ThreadPrimitive.Root>
    </ThreadRunStatusContext.Provider>
  );
};

const ThreadMessage: FC = () => {
  const role = useAuiState((s) => s.message.role);
  return role === "user" ? <UserMessage /> : <AssistantMessage />;
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="滚至底部"
        variant="outline"
        className="absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <div className="mx-auto my-auto flex w-full max-w-(--thread-max-width) grow flex-col">
      <div className="flex w-full grow flex-col items-start justify-center">
        <div className="flex size-full max-w-xl flex-col justify-center px-6 text-left">
          <h1 className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both font-semibold text-[2.2rem] tracking-[-0.03em] text-foreground duration-200">
            你好
          </h1>
          <p className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-base text-muted-foreground delay-75 duration-200">
            今天想让我帮你做什么？
          </p>
        </div>
      </div>
    </div>
  );
};

const Composer: FC<ThreadResolvedProps> = ({
  attachments,
  isPickingFiles,
  modelOptions,
  onAttachFiles,
  onPasteFiles,
  onRemoveAttachment,
  currentModelId,
  currentModelEntry,
  thinkingLevel,
  onModelChange,
  onThinkingLevelChange,
  onCancelRun,
  queuedMessages,
  runCompletionSerial,
  runStatusLabel,
  isCancelling,
  visible,
  branchSummary,
  contextSummary,
  interruptedApprovalGroups,
  pendingApprovalGroups,
  onDismissInterruptedApproval,
  onResumeInterruptedApproval,
  onResolvePendingApproval,
  onCompactContext,
  onEnqueueQueuedMessage,
  onTriggerQueuedMessage,
  onGuideQueuedMessage,
  onRemoveQueuedMessage,
  onBranchChanged,
  disableGlobalSideEffects,
}) => {
  const aui = useAui();
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  const queuedAutoDispatchingIdRef = useRef<string | null>(null);
  const queuedAutoDispatchLockedRef = useRef(false);
  const queuedAwaitingCompletionRef = useRef<{
    messageId: string;
    runCompletionSerial: number;
  } | null>(null);
  // 用户主动按「停止」时记录当时的队列首位 id；effect 看到此标记时跳过自动派发，
  // 直到队列首位变化或用户显式点击「引导」（引导路径会设置 awaitingCompletion 覆盖）。
  const queuedManualCancelHeadIdRef = useRef<string | null>(null);

  const [inputScrollable, setInputScrollable] = useState(false);
  const supportsVision =
    currentModelEntry?.capabilities.vision ??
    currentModelEntry?.detectedCapabilities.vision ??
    null;
  const hasImageAttachments = attachments.some(
    (attachment) =>
      attachment.kind === "image" ||
      attachment.mimeType?.startsWith("image/") === true,
  );
  const isVisionBlocked = hasImageAttachments && supportsVision === false;
  const isThreadRunning = useAuiState((s) => s.thread.isRunning);
  const queuedHeadMessage = queuedMessages[0] ?? null;
  const remainingQueuedCount = Math.max(queuedMessages.length - 1, 0);

  const syncInputOverflow = useCallback(() => {
    const textarea = composerInputRef.current;
    if (!textarea) return;

    const nextScrollable = textarea.scrollHeight > textarea.clientHeight + 1;
    setInputScrollable((current) =>
      current === nextScrollable ? current : nextScrollable,
    );
  }, []);

  const handleInputPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const files = collectClipboardFiles(clipboardData);
      if (files.length === 0) return;

      event.preventDefault();
      onPasteFiles(files);
    },
    [onPasteFiles],
  );

  const resumeInterruptedApproval = useCallback(
    async (approval: InterruptedApprovalNotice) => {
      const requestedRunId = await onResumeInterruptedApproval(approval.runId);
      const parentId = aui.thread().getState().messages.at(-1)?.id ?? null;

      aui.thread().startRun({
        parentId,
        sourceId: null,
        runConfig: buildInterruptedApprovalRunConfig(
          approval.recoveryPrompt,
          requestedRunId,
        ),
      });
      await onDismissInterruptedApproval(approval.runId);
    },
    [aui, onDismissInterruptedApproval, onResumeInterruptedApproval],
  );

  const dispatchQueuedMessage = useCallback(
    async (queuedMessage: QueuedMessage) => {
      if (queuedAutoDispatchingIdRef.current === queuedMessage.id) {
        return;
      }

      queuedAutoDispatchingIdRef.current = queuedMessage.id;
      queuedAutoDispatchLockedRef.current = true;
      try {
        await onRemoveQueuedMessage(queuedMessage.id);

        // 等一帧让 runtime 真正进入 idle，再 append 用户消息触发新 run；
        // 锁的释放放在 append 之后的同一帧，避免 effect 在两个 RAF 之间重入。
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );

        try {
          aui.thread().append({
            role: "user",
            content: [{ type: "text", text: queuedMessage.text }],
          });
        } catch (error) {
          console.error("[queued-dispatch] thread.append 失败", error);
        } finally {
          queuedAutoDispatchLockedRef.current = false;
          syncInputOverflow();
          composerInputRef.current?.focus();
        }
      } catch (error) {
        console.error("[queued-dispatch] 派发挂起消息失败", error);
        queuedAutoDispatchingIdRef.current = null;
        queuedAutoDispatchLockedRef.current = false;
      }
    },
    [aui, onRemoveQueuedMessage, syncInputOverflow],
  );

  // 用户主动按「停止」按钮：标记当前队列首位为「已被主动取消」，
  // effect 在 isCancelling 复位后不会自动派发，必须用户显式点队列卡的「引导」才继续。
  const handleManualCancelRun = useCallback(() => {
    queuedManualCancelHeadIdRef.current = queuedHeadMessage?.id ?? null;
    onCancelRun();
  }, [onCancelRun, queuedHeadMessage]);

  useEffect(() => {
    syncInputOverflow();
  }, [syncInputOverflow]);

  useEffect(() => {
    if (visible) {
      composerInputRef.current?.focus();
    }
  }, [visible]);

  useEffect(() => {
    if (!queuedHeadMessage) {
      queuedAutoDispatchingIdRef.current = null;
      queuedAutoDispatchLockedRef.current = false;
      queuedAwaitingCompletionRef.current = null;
      queuedManualCancelHeadIdRef.current = null;
      return;
    }

    // 队列首位变了（用户已经处理过/移除/插队），失效旧的「主动取消」标记。
    if (
      queuedManualCancelHeadIdRef.current &&
      queuedManualCancelHeadIdRef.current !== queuedHeadMessage.id
    ) {
      queuedManualCancelHeadIdRef.current = null;
    }

    if (isThreadRunning || isCancelling) {
      return;
    }

    if (queuedAutoDispatchLockedRef.current) {
      return;
    }

    const awaitingCompletion = queuedAwaitingCompletionRef.current;
    if (
      awaitingCompletion &&
      awaitingCompletion.messageId === queuedHeadMessage.id &&
      runCompletionSerial <= awaitingCompletion.runCompletionSerial
    ) {
      return;
    }

    if (
      awaitingCompletion &&
      awaitingCompletion.messageId === queuedHeadMessage.id &&
      runCompletionSerial > awaitingCompletion.runCompletionSerial
    ) {
      queuedAwaitingCompletionRef.current = null;
    }

    // 用户曾按「停止」中断当前 run，且队列首位仍是当时那条消息；
    // 不能在 isCancelling 复位后自动派发，等用户手动点队列卡或显式发送。
    if (
      !awaitingCompletion &&
      queuedManualCancelHeadIdRef.current === queuedHeadMessage.id
    ) {
      return;
    }

    if (queuedAutoDispatchingIdRef.current === queuedHeadMessage.id) {
      return;
    }

    void dispatchQueuedMessage(queuedHeadMessage);
  }, [
    dispatchQueuedMessage,
    isCancelling,
    isThreadRunning,
    queuedHeadMessage,
    runCompletionSerial,
  ]);

  const recoverContextTask = useCallback(async () => {
    const text = [
      "请恢复上次未完成的任务，先读取当前上下文摘要和任务状态板，再继续推进。",
      contextSummary.lastToolFailure
        ? `最近工具失败：${contextSummary.lastToolFailure.toolName} - ${contextSummary.lastToolFailure.error}`
        : "",
      contextSummary.recoverableRun?.reason
        ? `恢复线索：${contextSummary.recoverableRun.reason}`
        : "",
      contextSummary.todos.length > 0
        ? `当前任务板：${contextSummary.todos.map((todo) => `${todo.status}:${todo.content}`).join("；")}`
        : "",
    ].filter(Boolean).join("\n");

    if (text.trim()) {
      await onEnqueueQueuedMessage(text);
    }
  }, [contextSummary, onEnqueueQueuedMessage]);

  return (
    <ComposerPrimitive.Root className="relative flex w-full flex-col gap-1.5">
      <ComposerAttachmentSync
        attachments={attachments}
        onRemoveAttachment={onRemoveAttachment}
      />
      {pendingApprovalGroups.length > 0 ? (
        <PendingApprovalNoticeBar
          groups={pendingApprovalGroups}
          onResolve={async (approval: PendingApprovalNotice, allowed: boolean) => {
            await onResolvePendingApproval(approval.approval.requestId, allowed);
          }}
        />
      ) : null}
      {interruptedApprovalGroups.length > 0 ? (
        <InterruptedApprovalNoticeBar
          groups={interruptedApprovalGroups}
          onDismiss={onDismissInterruptedApproval}
          onResume={resumeInterruptedApproval}
        />
      ) : null}
      {queuedHeadMessage ? (
        <QueuedMessageCard
          message={queuedHeadMessage}
          remainingCount={remainingQueuedCount}
          disabled={isCancelling}
          onTrigger={async () => {
            if (isThreadRunning && !isCancelling) {
              queuedAwaitingCompletionRef.current = {
                messageId: queuedHeadMessage.id,
                runCompletionSerial,
              };
            }

            const triggerPromise = onTriggerQueuedMessage(queuedHeadMessage.id);
            if (isThreadRunning && !isCancelling) {
              onCancelRun();
            }
            await triggerPromise;
          }}
          onRemove={async () => onRemoveQueuedMessage(queuedHeadMessage.id)}
        />
      ) : null}
      <div className="flex w-full flex-col gap-2 rounded-[var(--radius-shell)] bg-[color:var(--color-composer-surface)] p-(--composer-padding) shadow-[0_12px_32px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.05)] transition-shadow focus-within:ring-2 focus-within:ring-ring/12">
        <ComposerAttachments />

        <ComposerPrimitive.Input
          placeholder="向 Chela 提问..."
          ref={composerInputRef}
          className={`min-h-0 w-full resize-none bg-transparent px-1 py-1 text-[15px] leading-6 text-foreground outline-none placeholder:text-[color:var(--color-text-secondary)]/85 ${inputScrollable ? "overflow-y-auto pr-2" : "overflow-y-hidden"
            }`}
          minRows={1}
          maxRows={5}
          autoFocus={visible}
          onChange={() => {
            requestAnimationFrame(syncInputOverflow);
          }}
          onHeightChange={() => {
            requestAnimationFrame(syncInputOverflow);
          }}
          onPaste={handleInputPaste}
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              event.shiftKey ||
              isComposingRef.current ||
              event.nativeEvent.isComposing ||
              !isThreadRunning ||
              isCancelling
            ) {
              return;
            }

            const nextDraft = event.currentTarget.value.trim();
            if (!nextDraft) {
              return;
            }

            event.preventDefault();
            void onEnqueueQueuedMessage(nextDraft).then(() => {
              aui.composer().setText("");
              requestAnimationFrame(() => {
                syncInputOverflow();
                composerInputRef.current?.focus();
              });
            });
          }}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          aria-label="消息输入框"
        />
        <ComposerAction
          isPickingFiles={isPickingFiles}
          onAttachFiles={onAttachFiles}
          attachments={attachments}
          modelOptions={modelOptions}
          currentModelId={currentModelId}
          currentModelEntry={currentModelEntry}
          thinkingLevel={thinkingLevel}
          onModelChange={onModelChange}
          onThinkingLevelChange={onThinkingLevelChange}
          onCancelRun={handleManualCancelRun}
          runStatusLabel={runStatusLabel}
          isCancelling={isCancelling}
          isVisionBlocked={isVisionBlocked}
          onEnqueueQueuedMessage={onEnqueueQueuedMessage}
          onGuideQueuedMessage={onGuideQueuedMessage}
          onAfterComposerEnqueue={() => {
            requestAnimationFrame(() => {
              syncInputOverflow();
              composerInputRef.current?.focus();
            });
          }}
        />
        {isVisionBlocked ? (
          <p className="px-1 text-[12px] leading-5 text-[color:var(--color-status-error)]">
            当前模型不支持图片，请切换到支持视觉的模型后再发送。
          </p>
        ) : null}
      </div>
      <ComposerStatusBar
        branchSummary={branchSummary}
        contextSummary={contextSummary}
        runStatusLabel={runStatusLabel}
        onCompactContext={onCompactContext}
        onRecoverContext={recoverContextTask}
        onBranchChanged={onBranchChanged}
        disableGlobalSideEffects={disableGlobalSideEffects}
      />
    </ComposerPrimitive.Root>
  );
};

const QueuedMessageCard: FC<{
  message: QueuedMessage;
  remainingCount: number;
  disabled: boolean;
  onTrigger: () => Promise<void>;
  onRemove: () => Promise<void>;
}> = ({ message, remainingCount, disabled, onTrigger, onRemove }) => {
  return (
    <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-panel-bg)] px-3 py-2 text-[13px] text-[color:var(--color-text-secondary)] shadow-[var(--color-control-shadow)]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[12px] font-medium text-[color:var(--color-text-secondary)]">
              当前回复结束后继续
            </p>
            {remainingCount > 0 ? (
              <Badge variant="secondary" className="px-2 py-0.5 text-[10px]">
                还有 {remainingCount} 条
              </Badge>
            ) : null}
          </div>
          <p
            className="mt-1 truncate text-[13px] leading-5 text-foreground"
            title={message.text}
          >
            {message.text}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              void onRemove();
            }}
            className="h-8 w-8 rounded-[var(--radius-shell)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-control-bg-hover)] hover:text-foreground"
            aria-label="删除排队消息"
          >
            <XIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="default"
            disabled={disabled}
            onClick={() => {
              void onTrigger();
            }}
            className="h-8 rounded-[var(--radius-shell)] px-3 shadow-none"
          >
            引导
          </Button>
        </div>
      </div>
    </div>
  );
};

const ComposerAction: FC<
  Pick<
    ThreadResolvedProps,
    | "isPickingFiles"
    | "onAttachFiles"
    | "attachments"
    | "modelOptions"
    | "currentModelId"
    | "currentModelEntry"
    | "thinkingLevel"
    | "onModelChange"
    | "onThinkingLevelChange"
    | "onCancelRun"
    | "runStatusLabel"
    | "isCancelling"
  > & {
    isVisionBlocked: boolean;
    onEnqueueQueuedMessage: (text: string) => Promise<string>;
    onGuideQueuedMessage: (text: string) => Promise<void>;
    onAfterComposerEnqueue?: () => void;
  }
> = ({
  isPickingFiles,
  onAttachFiles,
  attachments,
  modelOptions,
  currentModelId,
  currentModelEntry,
  thinkingLevel,
  onModelChange,
  onThinkingLevelChange,
  onCancelRun,
  runStatusLabel,
  isCancelling,
  isVisionBlocked,
  onEnqueueQueuedMessage,
  onGuideQueuedMessage,
  onAfterComposerEnqueue,
}) => {
    const aui = useAui();
    const isThreadRunning = useAuiState((s) => s.thread.isRunning);
    const composerText = useAuiState((s) => s.composer.text);
    const composerHasText = composerText.trim().length > 0;
    const currentModel = modelOptions.find((model) => model.id === currentModelId);
    const normalizedThinkingLevel = normalizeThinkingLevel(thinkingLevel);
    const effectiveThinkingLevel = getEffectiveThinkingLevel(
      currentModelEntry,
      normalizedThinkingLevel,
    );
    const thinkingOptions = getThinkingOptionsForModel(
      currentModelEntry,
      effectiveThinkingLevel,
    );
    const thinkingEnabled = canConfigureThinking(currentModelEntry);
    const thinkingTitle = thinkingEnabled
      ? getThinkingLevelLabel(effectiveThinkingLevel)
      : getThinkingHint(currentModelEntry);
    const showStopAction = isThreadRunning || isCancelling;
    const disableSend =
      isVisionBlocked ||
      (!showStopAction && attachments.length === 0 && !composerHasText);

    return (
      <div className="relative flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5">
          <DesktopComposerAddAttachment
            isPickingFiles={isPickingFiles}
            onAttachFiles={onAttachFiles}
          />
          <ModelSelector.Root
            models={modelOptions}
            value={currentModelId}
            onValueChange={onModelChange}
          >
            <ModelSelector.Trigger
              variant="ghost"
              size="sm"
              title={currentModel?.name ?? "选择模型"}
              aria-label={currentModel?.name ? `当前模型：${currentModel.name}` : "选择模型"}
              className="h-8 rounded-[var(--radius-shell)] bg-transparent px-2 text-[12px] text-[color:var(--color-text-secondary)] shadow-none ring-0 hover:bg-[color:var(--color-control-bg-hover)] hover:text-foreground hover:ring-0"
            >
              <BotIcon className="size-4 shrink-0" />
            </ModelSelector.Trigger>
            <ModelSelector.Content
              side="top"
              align="start"
              sideOffset={8}
              className="min-w-[220px]"
            />
          </ModelSelector.Root>
          {thinkingEnabled ? (
            <SelectRoot
              value={effectiveThinkingLevel}
              onValueChange={(value) =>
                onThinkingLevelChange(value as ThinkingLevel)
              }
            >
              <SelectTrigger
                variant="ghost"
                size="sm"
                title={thinkingTitle}
                aria-label={`当前思考强度：${thinkingTitle}`}
                className="h-8 rounded-[var(--radius-shell)] bg-transparent px-2 text-[12px] text-[color:var(--color-text-secondary)] shadow-none ring-0 hover:bg-[color:var(--color-control-bg-hover)] hover:text-foreground hover:ring-0"
              >
                <BrainCircuitIcon className="size-4 shrink-0" />
              </SelectTrigger>
              <SelectContent side="top" align="start" sideOffset={8}>
                {thinkingOptions.map((level) => (
                  <SelectItem
                    key={level.value}
                    value={level.value}
                    textValue={level.label}
                  >
                    <span className="flex items-center gap-2">
                      <BrainCircuitIcon className="size-4 shrink-0" />
                      <span>{level.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          ) : (
            <div
              title={thinkingTitle}
              aria-label={thinkingTitle}
              className="flex h-8 items-center justify-center rounded-[var(--radius-shell)] bg-transparent px-2 text-[color:var(--color-text-secondary)]"
            >
              <BrainCircuitIcon className="size-4 shrink-0 opacity-55" />
            </div>
          )}
        </div>
        {showStopAction ? (
          <div className="flex items-center gap-1.5">
            <TooltipIconButton
              tooltip="发送（当前回复结束后再发送这条）"
              side="bottom"
              type="button"
              variant="ghost"
              size="icon"
              disabled={!composerHasText || isCancelling}
              onClick={() => {
                const draft = composerText.trim();
                if (!draft) return;
                void onEnqueueQueuedMessage(draft).then(() => {
                  aui.composer().setText("");
                  onAfterComposerEnqueue?.();
                });
              }}
              className="size-8 rounded-[var(--radius-shell)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-control-bg-hover)] hover:text-foreground disabled:opacity-40"
              aria-label="发送：当前回复结束后再发送"
            >
              <SendHorizonalIcon className="size-4" />
            </TooltipIconButton>
            <TooltipIconButton
              tooltip="引导（停止当前回复并立即接着说）"
              side="bottom"
              type="button"
              variant="ghost"
              size="icon"
              disabled={!composerHasText || isCancelling}
              onClick={() => {
                const draft = composerText.trim();
                if (!draft) return;
                void onGuideQueuedMessage(draft).then(() => {
                  aui.composer().setText("");
                  onAfterComposerEnqueue?.();
                });
              }}
              className="size-8 rounded-[var(--radius-shell)] text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/12 hover:text-[color:var(--color-accent)] disabled:opacity-40"
              aria-label="引导：停止当前回复并立即接着说"
            >
              <Wand2Icon className="size-4" />
            </TooltipIconButton>
            <Button
              type="button"
              variant="default"
              onClick={() => {
                if (!isCancelling) {
                  onCancelRun();
                }
              }}
              disabled={isCancelling}
              className="flex h-8 items-center gap-1.5 rounded-[var(--radius-shell)] bg-[color:var(--color-accent)]/12 px-2.5 text-[color:var(--color-accent)] shadow-none hover:bg-[color:var(--color-accent)]/18 disabled:cursor-not-allowed disabled:opacity-100"
              aria-label={isCancelling ? runStatusLabel || "正在停止…" : "停止生成"}
            >
              {isCancelling ? (
                <LoaderCircleIcon className="size-3.5 animate-spin" />
              ) : (
                <SquareIcon className="size-3 fill-current" />
              )}
              <span className="text-[12px] font-medium">
                {isCancelling ? runStatusLabel || "正在停止…" : "停止"}
              </span>
            </Button>
          </div>
        ) : (
          <>
            {disableSend ? (
              <TooltipIconButton
                tooltip={
                  isVisionBlocked
                    ? "当前模型不支持图片"
                    : "请输入消息或附加文件后再发送"
                }
                side="bottom"
                type="button"
                variant="default"
                size="icon"
                disabled
                className="size-8 rounded-[var(--radius-shell)] bg-[color:var(--color-accent)] text-white shadow-none hover:bg-[color:var(--color-accent-hover)]"
                aria-label="Send message"
              >
                <ArrowUpIcon className="size-4" />
              </TooltipIconButton>
            ) : (
              <ComposerPrimitive.Send asChild>
                <TooltipIconButton
                  tooltip="发送"
                  side="bottom"
                  type="button"
                  variant="default"
                  size="icon"
                  className="size-8 rounded-[var(--radius-shell)] bg-[color:var(--color-accent)] text-white shadow-none hover:bg-[color:var(--color-accent-hover)]"
                  aria-label="Send message"
                >
                  <ArrowUpIcon className="size-4" />
                </TooltipIconButton>
              </ComposerPrimitive.Send>
            )}
          </>
        )}
      </div>
    );
  };

const ComposerStatusBar: FC<{
  branchSummary: GitBranchSummary | null;
  contextSummary: ContextUsageSummary;
  runStatusLabel: string;
  onCompactContext: () => void | Promise<void>;
  onRecoverContext: () => void | Promise<void>;
  onBranchChanged: () => void | Promise<void>;
  disableGlobalSideEffects: boolean;
}> = ({
  branchSummary,
  contextSummary,
  runStatusLabel,
  onCompactContext,
  onRecoverContext,
  onBranchChanged,
  disableGlobalSideEffects,
}) => {
    const isThreadRunning = useAuiState((s) => s.thread.isRunning);
    const composerText = useAuiState((s) => s.composer.text);
    const { runStage, isCancelling } = useThreadRunStatus();
    const showUsage =
      typeof contextSummary.latestInputTokens === "number" ||
      typeof contextSummary.latestOutputTokens === "number";
    const totalUsageTokens =
      contextSummary.usageTotalInputTokens + contextSummary.usageTotalOutputTokens;
    const showBtw = isBtwCommand(composerText);
    const branchInteractionDisabled =
      disableGlobalSideEffects ||
      isThreadRunning ||
      isCancelling ||
      runStage !== "idle";

    return (
      <div className="flex items-center justify-between gap-3 px-1">
        <BranchSwitcher
          branchSummary={branchSummary}
          disabled={branchInteractionDisabled}
          onBranchChanged={onBranchChanged}
        />

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-hidden">
          {showBtw ? (
            <span className="shrink-0 rounded-full bg-[var(--color-accent-subtle)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--color-accent)]">
              /btw 旁路补充
            </span>
          ) : null}

          {runStage !== "idle" && runStatusLabel ? (
            <span className="min-w-0 truncate rounded-full bg-shell-panel px-2.5 py-1 text-[11px] font-medium text-[color:var(--color-text-secondary)] dark:bg-white/8">
              {runStatusLabel}
            </span>
          ) : null}

          {showUsage ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="shrink-0 cursor-help px-1 text-[11px] font-medium text-[color:var(--color-text-secondary)] [font-variant-numeric:tabular-nums] hover:text-foreground"
                >
                  in {formatStatusTokenCount(contextSummary.latestInputTokens)} · out{" "}
                  {formatStatusTokenCount(contextSummary.latestOutputTokens)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                最近输入 {formatTokenCount(contextSummary.latestInputTokens)} / 最近输出 {formatTokenCount(contextSummary.latestOutputTokens)}
              </TooltipContent>
            </Tooltip>
          ) : null}

          {contextSummary.usageMessageCount > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="hidden shrink-0 cursor-help border-l border-[color:var(--color-control-border)]/60 pl-2 pr-1 text-[11px] font-medium text-[color:var(--color-text-secondary)] [font-variant-numeric:tabular-nums] hover:text-foreground md:inline-flex"
                >
                  total {formatStatusTokenCount(totalUsageTokens)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                累计 {contextSummary.usageMessageCount} 轮，输入 {formatTokenCount(contextSummary.usageTotalInputTokens)} / 输出 {formatTokenCount(contextSummary.usageTotalOutputTokens)}
              </TooltipContent>
            </Tooltip>
          ) : null}

        </div>

        <ContextSummaryTrigger
          summary={contextSummary}
          onCompact={onCompactContext}
          onRecover={onRecoverContext}
        />
      </div>
    );
  };

const AssistantRunningNotice: FC<{ label: string; compact?: boolean }> = ({
  label,
  compact = false,
}) => {
  return (
    <div
      className={cn(
        "flex w-fit items-center gap-2.5 py-1 px-1 text-left select-none transition-all",
        compact && "mb-2",
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">
        <LoaderCircleIcon className="size-3 animate-spin" />
      </span>
      <span className="text-[13px] font-medium text-foreground/80">
        {label}
      </span>
    </div>
  );
};

const AssistantCancelledNotice: FC<{ compact?: boolean }> = ({
  compact = false,
}) => {
  return (
    <div
      className={cn(
        "flex w-fit items-center gap-2.5 py-1 px-1 text-left select-none transition-all",
        compact && "mb-2",
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <SquareIcon className="size-3 fill-current" />
      </span>
      <span className="text-[13px] font-medium text-foreground/80">
        已停止
      </span>
    </div>
  );
};

const AssistantMessageTextPart: FC = () => {
  const text = useAuiState((s) =>
    s.part.type === "text" ? s.part.text : "",
  );

  if (text.trim()) {
    return <MarkdownText />;
  }

  return null;
};

const AssistantMessageSkillUsages: FC = () => {
  const rawSkillUsages = useAuiState((s) => {
    const custom = s.message.metadata?.custom as
      | { skillUsages?: RuntimeSkillUsage[] }
      | undefined;
    return custom?.skillUsages ?? null;
  });
  const skillUsages = useMemo(
    () => extractRuntimeSkillUsages(rawSkillUsages),
    [rawSkillUsages],
  );

  if (skillUsages.length === 0) {
    return null;
  }

  return <SkillUsageStrip skillUsages={skillUsages} className="mb-3" />;
};

const AssistantMessageStatus: FC = () => {
  const { runStatusLabel } = useThreadRunStatus();
  const status = useAuiState((s) => s.message.status);
  const isLast = useAuiState((s) => s.message.isLast);
  const hasTextContent = useAuiState((s) =>
    s.message.parts.some(
      (part) =>
        part.type === "text" &&
        typeof part.text === "string" &&
        part.text.trim().length > 0,
    ),
  );
  const hasVisibleProgressPart = useAuiState((s) =>
    s.message.parts.some(
      (part) =>
        (part.type === "reasoning" &&
          typeof part.text === "string" &&
          part.text.trim().length > 0) ||
        part.type === "tool-call",
    ),
  );

  if (!isLast || hasTextContent || hasVisibleProgressPart) return null;

  if (status?.type === "running" && runStatusLabel) {
    return <AssistantRunningNotice label={runStatusLabel} compact />;
  }

  if (status?.type === "incomplete" && status.reason === "cancelled") {
    return <AssistantCancelledNotice compact />;
  }

  return null;
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="mt-2 rounded-[var(--radius-shell)] bg-destructive/10 p-3 text-sm text-destructive dark:bg-destructive/5 dark:text-red-200">
        <ErrorPrimitive.Message className="line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const runChangeLabels: Record<
  RunChangeSummary["files"][number]["changeKind"],
  string
> = {
  added: "已新增",
  updated: "已编辑",
  reverted: "已恢复",
};

const runChangeStatusLabels: Record<
  RunChangeSummary["files"][number]["status"],
  string
> = {
  modified: "变更",
  deleted: "删除",
  untracked: "新增",
};

const numberFormatter = new Intl.NumberFormat("zh-CN");

function formatSignedCount(value: number, sign: "+" | "-") {
  return `${sign}${numberFormatter.format(value)}`;
}

function getFileName(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").pop() || normalized;
}

const AssistantMessageRunChangeSummary: FC = () => {
  const summary = useAuiState((s) => {
    const custom = s.message.metadata?.custom as
      | {
        runChangeSummary?: RunChangeSummary | null;
      }
      | undefined;
    return custom?.runChangeSummary ?? null;
  });
  const [expanded, setExpanded] = useState(true);

  if (!summary || summary.fileCount === 0) {
    return null;
  }

  const primaryFile = summary.files[0];
  const summaryTarget =
    summary.fileCount === 1 ? getFileName(primaryFile.path) : `${summary.fileCount} 个文件`;
  const summaryLabel =
    summary.fileCount === 1 ? runChangeLabels[primaryFile.changeKind] : "已编辑";

  return (
    <div className="mt-3 max-w-full">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="inline-flex max-w-full items-center gap-2 rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-3 py-1.5 text-left shadow-[var(--color-control-shadow)] transition hover:bg-[color:var(--color-control-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-control-focus-ring)]"
        aria-expanded={expanded}
      >
        <span className="shrink-0 text-[13px] font-medium text-[color:var(--chela-text-secondary)]">
          {summaryLabel}
        </span>
        <code className="min-w-0 truncate font-mono text-[13px] font-medium text-[color:var(--chela-text-primary)]">
          {summaryTarget}
        </code>
        <span className="shrink-0 font-mono text-[12px] font-semibold text-[color:var(--color-diff-add-text)]">
          {formatSignedCount(summary.additions, "+")}
        </span>
        <span className="shrink-0 font-mono text-[12px] font-semibold text-[color:var(--color-diff-del-text)]">
          {formatSignedCount(summary.deletions, "-")}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 text-[color:var(--chela-text-tertiary)] transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded ? (
        <div className="mt-2 overflow-hidden rounded-[var(--radius-shell)] bg-[color:var(--color-control-panel-bg)] shadow-[var(--color-control-shadow)]">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="flex w-full items-center gap-2 bg-[color:var(--color-control-bg)] px-3 py-2 text-left transition hover:bg-[color:var(--color-control-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-control-focus-ring)]"
          >
            <span className="text-[13px] font-medium text-[color:var(--chela-text-secondary)]">
              已编辑的文件
            </span>
            <span className="rounded-full bg-[color:var(--color-control-panel-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--chela-text-tertiary)]">
              {summary.fileCount}
            </span>
            <ChevronUpIcon className="ml-auto size-3.5 text-[color:var(--chela-text-tertiary)]" />
          </button>

          <div className="max-h-[260px] overflow-y-auto py-1">
            {summary.files.map((file) => (
              <div
                key={`${file.changeKind}:${file.path}`}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2 text-[12px] leading-5 transition hover:bg-[color:var(--color-control-bg)]"
              >
                <span className="shrink-0 rounded-full bg-[color:var(--color-control-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--chela-text-secondary)]">
                  {runChangeLabels[file.changeKind]}
                </span>
                <div className="min-w-0">
                  <code className="block truncate font-mono text-[12px] font-medium text-[color:var(--chela-text-primary)]">
                    {file.path}
                  </code>
                  <span className="text-[11px] text-[color:var(--chela-text-tertiary)]">
                    {runChangeStatusLabels[file.status]}
                  </span>
                </div>
                <span className="font-mono text-[12px] font-semibold text-[color:var(--color-diff-add-text)]">
                  {formatSignedCount(file.additions, "+")}
                </span>
                <span className="font-mono text-[12px] font-semibold text-[color:var(--color-diff-del-text)]">
                  {formatSignedCount(file.deletions, "-")}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="fade-in slide-in-from-bottom-1 relative mx-auto w-full max-w-(--thread-max-width) animate-in py-5 duration-150"
      data-role="assistant"
    >
      <div className="wrap-break-word px-2 py-2 text-[15px] leading-7 text-foreground">
        <AssistantMessageStatus />
        <AssistantMessageSkillUsages />
        <MessagePrimitive.Parts
          components={{
            Text: AssistantMessageTextPart,
            Reasoning: () => <Reasoning />,
            tools: {
              Fallback: ToolFallback,
            },
          }}
        />
        <MessageError />
        <AssistantMessageRunChangeSummary />
      </div>

      <div className="mt-2 ml-3 flex min-h-6 items-center">
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="-ml-1 flex gap-1 text-muted-foreground items-center"
    >
      <AssistantReloadButton />
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="复制">
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <MessageBranchPicker />
    </ActionBarPrimitive.Root>
  );
};

const AssistantReloadButton: FC = () => {
  const aui = useAui();
  const internalRunPrompt = useAuiState((s) => {
    const internalRun = readInterruptedApprovalInternalRun(
      s.message.metadata?.custom,
    );
    return internalRun?.prompt ?? null;
  });

  return (
    <TooltipIconButton
      tooltip="重新生成"
      onClick={() => {
        if (internalRunPrompt) {
          aui.message().reload({
            runConfig: buildInterruptedApprovalRunConfig(internalRunPrompt),
          });
          return;
        }

        aui.message().reload();
      }}
    >
      <RotateCcwIcon className="size-4" />
    </TooltipIconButton>
  );
};

const MessageBranchPicker: FC<{ className?: string }> = ({ className }) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "inline-flex items-center text-xs text-muted-foreground ml-1 gap-1",
        className
      )}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="上一项" variant="ghost" className="size-6 p-0 hover:bg-slate-200 dark:hover:bg-slate-700">
          <ChevronLeftIcon className="size-3.5" />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="font-medium text-[11px] text-foreground/70 select-none">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="下一项" variant="ghost" className="size-6 p-0 hover:bg-slate-200 dark:hover:bg-slate-700">
          <ChevronRightIcon className="size-3.5" />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  const aui = useAui();
  const text = useAuiState((s) => s.composer.text);

  return (
    <ComposerPrimitive.Root className="relative col-start-2 min-w-0">
      <div className="wrap-break-word peer grid rounded-[var(--radius-shell)] bg-slate-100/80 px-4 py-2 text-[15px] leading-7 text-slate-900 shadow-sm dark:bg-slate-800/80 dark:text-slate-100">
        <div className="pointer-events-none col-start-1 row-start-1 invisible break-words whitespace-pre-wrap">
          {text + "\u200b"}
        </div>
        <ComposerPrimitive.Input
          autoFocus
          onBlur={() => aui.composer().cancel()}
          className="col-start-1 row-start-1 m-0 flex max-h-[80vh] w-full resize-none border-0 bg-transparent p-0 shadow-none outline-none ring-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
        />
      </div>
    </ComposerPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="fade-in slide-in-from-bottom-1 mx-auto grid w-full max-w-(--thread-max-width) animate-in auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 py-5 duration-150 [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <UserMessageAttachments />
      <ComposerPrimitive.If editing>
        <EditComposer />
      </ComposerPrimitive.If>

      <ComposerPrimitive.If editing={false}>
        <div className="relative col-start-2 min-w-0">
          <div className="wrap-break-word peer rounded-[var(--radius-shell)] bg-slate-100/80 dark:bg-slate-800/80 px-4 py-2 text-[15px] leading-7 text-slate-900 dark:text-slate-100 shadow-sm empty:hidden">
            <MessagePrimitive.Parts />
          </div>
          <div className="mt-1 flex min-h-6 justify-end">
            <ActionBarPrimitive.Root
              hideWhenRunning
              autohide="not-last"
              className="flex gap-1 text-muted-foreground items-center"
            >
              <ActionBarPrimitive.Edit asChild>
                <TooltipIconButton tooltip="编辑">
                  <PencilIcon className="size-4" />
                </TooltipIconButton>
              </ActionBarPrimitive.Edit>
              <ActionBarPrimitive.Copy asChild>
                <TooltipIconButton tooltip="复制">
                  <AuiIf condition={(s) => s.message.isCopied}>
                    <CheckIcon />
                  </AuiIf>
                  <AuiIf condition={(s) => !s.message.isCopied}>
                    <CopyIcon />
                  </AuiIf>
                </TooltipIconButton>
              </ActionBarPrimitive.Copy>
              <MessageBranchPicker />
            </ActionBarPrimitive.Root>
          </div>
        </div>
      </ComposerPrimitive.If>
    </MessagePrimitive.Root>
  );
};

const ComposerAttachmentSync: FC<{
  attachments: SelectedFile[];
  onRemoveAttachment: (attachmentId: string) => void;
}> = ({ attachments, onRemoveAttachment }) => {
  const aui = useAui();
  const runtimeAttachments = useAuiState((s) => s.composer.attachments);
  const isApplyingExternalSync = useRef(false);
  const lastAppliedExternalSignatureRef = useRef<string | null>(null);
  const externalSignature = attachments
    .map((attachment) => attachment.id)
    .join("|");

  useEffect(() => {
    if (lastAppliedExternalSignatureRef.current === externalSignature) return;

    let cancelled = false;
    isApplyingExternalSync.current = true;
    lastAppliedExternalSignatureRef.current = externalSignature;

    void (async () => {
      await aui.composer().clearAttachments();

      for (const attachment of attachments) {
        if (cancelled) return;
        await aui
          .composer()
          .addAttachment(
            selectedFileToCreateAttachment(
              toPersistedMessageAttachment(attachment),
            ),
          );
      }
    })().finally(() => {
      if (!cancelled) {
        isApplyingExternalSync.current = false;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [attachments, aui, externalSignature]);

  useEffect(() => {
    if (isApplyingExternalSync.current) return;

    const runtimeIds = new Set(
      runtimeAttachments.map((attachment) => attachment.id),
    );
    const removedIds = attachments
      .filter((attachment) => !runtimeIds.has(attachment.id))
      .map((attachment) => attachment.id);

    if (removedIds.length === 0) return;

    lastAppliedExternalSignatureRef.current = null;
    removedIds.forEach((attachmentId) => {
      onRemoveAttachment(attachmentId);
    });
  }, [attachments, onRemoveAttachment, runtimeAttachments]);

  return null;
};
