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
  CopyIcon,
  LoaderCircleIcon,
  SquareIcon,
} from "lucide-react";
import type {
  GitBranchSummary,
  ModelEntry,
  ProviderSource,
  SelectedFile,
  ThinkingLevel,
} from "@shared/contracts";

import {
  ComposerAttachments,
  DesktopComposerAddAttachment,
  UserMessageAttachments,
} from "@renderer/components/assistant-ui/attachment";
import { BranchSwitcher } from "@renderer/components/assistant-ui/branch-switcher";
import { Button } from "@renderer/components/assistant-ui/button";
import { ContextSummaryTrigger } from "@renderer/components/assistant-ui/context-summary-trigger";
import { MarkdownText } from "@renderer/components/assistant-ui/markdown-text";
import {
  ModelSelector,
  type ModelOption,
} from "@renderer/components/assistant-ui/model-selector";
import {
  EMPTY_CONTEXT_USAGE_SUMMARY,
  type ContextUsageSummary,
} from "@renderer/lib/context-usage";
import { Reasoning } from "@renderer/components/assistant-ui/reasoning";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from "@renderer/components/assistant-ui/select";
import { ToolFallback } from "@renderer/components/assistant-ui/tool-fallback";
import { TooltipIconButton } from "@renderer/components/assistant-ui/tooltip-icon-button";
import {
  selectedFileToCreateAttachment,
  toPersistedMessageAttachment,
} from "@renderer/lib/assistant-ui-attachments";
import {
  buildSelectableModelOptions,
  findEntryLabel,
  loadProviderDirectory,
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
  attachments?: SelectedFile[];
  isPickingFiles?: boolean;
  terminalOpen?: boolean;
  visible?: boolean;
  onAttachFiles?: () => void;
  onPasteFiles?: (files: File[]) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  currentModelId?: string;
  thinkingLevel?: ThinkingLevel;
  onModelChange?: (modelEntryId: string) => void;
  onThinkingLevelChange?: (level: ThinkingLevel) => void;
  onCancelRun?: () => void;
  runStage?: ChatRunStage;
  runStatusLabel?: string;
  isCancelling?: boolean;
  branchSummary?: GitBranchSummary | null;
  contextSummary?: ContextUsageSummary;
  onCompactContext?: () => void | Promise<void>;
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
  runStage: ChatRunStage;
  runStatusLabel: string;
  isCancelling: boolean;
  branchSummary: GitBranchSummary | null;
  contextSummary: ContextUsageSummary;
  onCompactContext: () => void | Promise<void>;
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

  if (!options.some((option) => option.id === currentModelId)) {
    options.unshift({
      id: currentModelId,
      name: findEntryLabel(currentModelId, sources, entries),
      description: "当前模型",
      icon: <BotIcon className="size-4" />,
      disabled: false,
    });
  }

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
  attachments = [],
  isPickingFiles = false,
  terminalOpen = false,
  visible = true,
  onAttachFiles = () => undefined,
  onPasteFiles = () => undefined,
  onRemoveAttachment = () => undefined,
  currentModelId = "builtin:anthropic:claude-sonnet-4-20250514",
  thinkingLevel = "off",
  onModelChange = () => undefined,
  onThinkingLevelChange = () => undefined,
  onCancelRun = () => undefined,
  runStage = "idle",
  runStatusLabel = "",
  isCancelling = false,
  branchSummary = null,
  contextSummary = EMPTY_CONTEXT_USAGE_SUMMARY,
  onCompactContext = () => undefined,
  onBranchChanged = () => undefined,
  disableGlobalSideEffects = false,
}) => {
  const [sources, setSources] = useState<ProviderSource[]>([]);
  const [entries, setEntries] = useState<ModelEntry[]>([]);

  useEffect(() => {
    let cancelled = false;

    if (!visible) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      if (!window.desktopApi) return;
      const nextDirectory = await loadProviderDirectory(window.desktopApi);
      if (!cancelled) {
        setSources(nextDirectory.sources);
        setEntries(nextDirectory.entries);
      }
    })();

    return () => {
      cancelled = true;
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
          ["--thread-max-width" as string]: "56rem",
          ["--composer-radius" as string]: "8px",
          ["--composer-padding" as string]: "12px",
        }}
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          <ThreadPrimitive.Viewport
            turnAnchor="bottom"
            autoScroll
            scrollToBottomOnInitialize
            scrollToBottomOnThreadSwitch
            className="relative mr-3 min-h-0 flex-1 overflow-x-auto overflow-y-auto scroll-smooth pl-8 pr-5 pt-3"
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
                ? "relative mx-auto flex w-full max-w-(--thread-max-width) shrink-0 flex-col gap-2 overflow-visible bg-gradient-to-t from-shell-panel via-shell-panel/85 to-transparent px-8 pb-3 pt-4"
                : "relative mx-auto flex w-full max-w-(--thread-max-width) shrink-0 flex-col gap-3 overflow-visible bg-gradient-to-t from-shell-panel via-shell-panel to-transparent px-8 pb-5 pt-9 md:pb-6"
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
              runStage={runStage}
              runStatusLabel={runStatusLabel}
              isCancelling={isCancelling}
              visible={visible}
              branchSummary={branchSummary}
              contextSummary={contextSummary}
              onCompactContext={onCompactContext}
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
        tooltip="Scroll to bottom"
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
  runStatusLabel,
  isCancelling,
  visible,
  branchSummary,
  contextSummary,
  onCompactContext,
  onBranchChanged,
  disableGlobalSideEffects,
}) => {
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
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

  useEffect(() => {
    syncInputOverflow();
  }, [syncInputOverflow]);

  useEffect(() => {
    if (visible) {
      composerInputRef.current?.focus();
    }
  }, [visible]);

  return (
    <ComposerPrimitive.Root className="relative flex w-full flex-col gap-1.5">
      <ComposerAttachmentSync
        attachments={attachments}
        onRemoveAttachment={onRemoveAttachment}
      />
      <div className="flex w-full flex-col gap-2 rounded-[12px] bg-[color:var(--color-composer-surface)] p-(--composer-padding) shadow-[0_12px_32px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.05)] transition-shadow focus-within:ring-2 focus-within:ring-ring/12">
        <ComposerAttachments />

        <ComposerPrimitive.Input
          placeholder="向 Pi Agent 提问..."
          ref={composerInputRef}
          className={`min-h-0 w-full resize-none bg-transparent px-1 py-1 text-[15px] leading-6 text-foreground outline-none placeholder:text-[color:var(--color-text-secondary)]/85 ${
            inputScrollable ? "overflow-y-auto pr-2" : "overflow-y-hidden"
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
          onCancelRun={onCancelRun}
          runStatusLabel={runStatusLabel}
          isCancelling={isCancelling}
          isVisionBlocked={isVisionBlocked}
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
        onCompactContext={onCompactContext}
        onBranchChanged={onBranchChanged}
        disableGlobalSideEffects={disableGlobalSideEffects}
      />
    </ComposerPrimitive.Root>
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
}) => {
  const isThreadRunning = useAuiState((s) => s.thread.isRunning);
  const composerHasText = useAuiState(
    (s) => s.composer.text.trim().length > 0,
  );
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
            variant="outline"
            size="sm"
            title={currentModel?.name ?? "选择模型"}
            aria-label={currentModel?.name ? `当前模型：${currentModel.name}` : "选择模型"}
            className="h-8 rounded-md bg-[color:var(--color-composer-control)] px-2 text-[12px] shadow-none hover:bg-shell-panel-contrast"
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
              variant="outline"
              size="sm"
              title={thinkingTitle}
              aria-label={`当前思考强度：${thinkingTitle}`}
              className="h-8 rounded-md bg-[color:var(--color-composer-control)] px-2 text-[12px] shadow-none hover:bg-shell-panel-contrast"
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
            className="flex h-8 items-center justify-center rounded-md px-2 text-[color:var(--color-text-secondary)]"
          >
            <BrainCircuitIcon className="size-4 shrink-0 opacity-55" />
          </div>
        )}
      </div>
      {showStopAction ? (
        <Button
          type="button"
          variant="default"
          onClick={() => {
            if (!isCancelling) {
              onCancelRun();
            }
          }}
          disabled={isCancelling}
          className="flex h-9 items-center gap-2 rounded-full bg-[var(--color-accent)] px-3 text-white shadow-none hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-100"
          aria-label={isCancelling ? runStatusLabel || "正在停止…" : "停止生成"}
        >
          {isCancelling ? (
            <LoaderCircleIcon className="size-3.5 animate-spin" />
          ) : (
            <SquareIcon className="size-3 fill-current" />
          )}
          <span className="text-[13px] font-medium">
            {isCancelling ? runStatusLabel || "正在停止…" : "停止"}
          </span>
        </Button>
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
              className="size-9 rounded-full bg-[var(--color-accent)] text-white shadow-none hover:bg-[var(--color-accent-hover)]"
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
                className="size-9 rounded-full bg-[var(--color-accent)] text-white shadow-none hover:bg-[var(--color-accent-hover)]"
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
  onCompactContext: () => void | Promise<void>;
  onBranchChanged: () => void | Promise<void>;
  disableGlobalSideEffects: boolean;
}> = ({
  branchSummary,
  contextSummary,
  onCompactContext,
  onBranchChanged,
  disableGlobalSideEffects,
}) => {
  const isThreadRunning = useAuiState((s) => s.thread.isRunning);
  const { runStage, isCancelling } = useThreadRunStatus();
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

      <ContextSummaryTrigger summary={contextSummary} onCompact={onCompactContext} />
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
        "inline-flex w-fit items-center gap-2 rounded-full bg-shell-panel-muted/85 px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        compact && "mb-3 text-[13px]",
      )}
    >
      <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin" />
      <span>{label}</span>
    </div>
  );
};

const AssistantCancelledNotice: FC<{ compact?: boolean }> = ({
  compact = false,
}) => {
  return (
    <div
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-full bg-shell-panel-muted/75 px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        compact && "mb-3 text-[13px]",
      )}
    >
      <SquareIcon className="size-3 shrink-0 fill-current" />
      <span>已停止</span>
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
      <ErrorPrimitive.Root className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive dark:bg-destructive/5 dark:text-red-200">
        <ErrorPrimitive.Message className="line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="fade-in slide-in-from-bottom-1 relative mx-auto w-full max-w-(--thread-max-width) animate-in py-4 duration-150"
      data-role="assistant"
    >
      <div className="wrap-break-word px-1 py-1 text-[15px] leading-7 text-foreground">
        <AssistantMessageStatus />
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
      className="-ml-1 flex gap-1 text-muted-foreground"
    >
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
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="fade-in slide-in-from-bottom-1 mx-auto grid w-full max-w-(--thread-max-width) animate-in auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 py-3 duration-150 [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <UserMessageAttachments />
      <div className="relative col-start-2 min-w-0">
        <div className="wrap-break-word peer rounded-[var(--radius-shell)] bg-slate-900 px-4 py-3 text-white shadow-sm empty:hidden">
          <MessagePrimitive.Parts />
        </div>
      </div>
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
