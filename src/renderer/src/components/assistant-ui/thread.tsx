import {
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
  GitBranchIcon,
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
import { Button } from "@renderer/components/assistant-ui/button";
import { ContextUsageIndicator } from "@renderer/components/assistant-ui/context-usage-indicator";
import { MarkdownText } from "@renderer/components/assistant-ui/markdown-text";
import {
  ModelSelector,
  type ModelOption,
} from "@renderer/components/assistant-ui/model-selector";
import {
  EMPTY_CONTEXT_USAGE_SUMMARY,
  getContextStatusCopy,
  type ContextUsageSummary,
} from "@renderer/lib/context-usage";
import { Reasoning } from "@renderer/components/assistant-ui/reasoning";
import { Select } from "@renderer/components/assistant-ui/select";
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
import { cn } from "@renderer/lib/utils";

type ThreadProps = {
  attachments?: SelectedFile[];
  isPickingFiles?: boolean;
  terminalOpen?: boolean;
  onAttachFiles?: () => void;
  onPasteFiles?: (files: File[]) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  currentModelId?: string;
  thinkingLevel?: ThinkingLevel;
  onModelChange?: (modelEntryId: string) => void;
  onThinkingLevelChange?: (level: ThinkingLevel) => void;
  branchSummary?: GitBranchSummary | null;
  contextSummary?: ContextUsageSummary;
  contextPanelOpen?: boolean;
  onToggleContextPanel?: () => void;
};

type ThreadResolvedProps = {
  attachments: SelectedFile[];
  isPickingFiles: boolean;
  modelOptions: ModelOption[];
  onAttachFiles: () => void;
  onPasteFiles: (files: File[]) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  currentModelId: string;
  thinkingLevel: ThinkingLevel;
  onModelChange: (modelEntryId: string) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  branchSummary: GitBranchSummary | null;
  contextSummary: ContextUsageSummary;
  contextPanelOpen: boolean;
  onToggleContextPanel: () => void;
};

const THINKING_LEVELS: { value: ThinkingLevel; label: string }[] = [
  { value: "off", label: "关闭" },
  { value: "minimal", label: "极低" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "xhigh", label: "极高" },
];

function buildModelOptions(
  sources: ProviderSource[],
  entries: ModelEntry[],
  currentModelId: string,
): ModelOption[] {
  const options: ModelOption[] = buildSelectableModelOptions(sources, entries).map((model) => ({
    id: model.value,
    name: model.label,
    description: model.description,
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
  onAttachFiles = () => undefined,
  onPasteFiles = () => undefined,
  onRemoveAttachment = () => undefined,
  currentModelId = "builtin:anthropic:claude-sonnet-4-20250514",
  thinkingLevel = "off",
  onModelChange = () => undefined,
  onThinkingLevelChange = () => undefined,
  branchSummary = null,
  contextSummary = EMPTY_CONTEXT_USAGE_SUMMARY,
  contextPanelOpen = false,
  onToggleContextPanel = () => undefined,
}) => {
  const [sources, setSources] = useState<ProviderSource[]>([]);
  const [entries, setEntries] = useState<ModelEntry[]>([]);

  useEffect(() => {
    let cancelled = false;

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
  }, []);

  const modelOptions = useMemo(
    () => buildModelOptions(sources, entries, currentModelId),
    [currentModelId, entries, sources],
  );

  return (
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
          turnAnchor="top"
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
            thinkingLevel={thinkingLevel}
            onModelChange={onModelChange}
            onThinkingLevelChange={onThinkingLevelChange}
            branchSummary={branchSummary}
            contextSummary={contextSummary}
            contextPanelOpen={contextPanelOpen}
            onToggleContextPanel={onToggleContextPanel}
          />
        </div>
      </div>
    </ThreadPrimitive.Root>
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
  thinkingLevel,
  onModelChange,
  onThinkingLevelChange,
  branchSummary,
  contextSummary,
  contextPanelOpen,
  onToggleContextPanel,
}) => {
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const [inputScrollable, setInputScrollable] = useState(false);

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

  return (
    <ComposerPrimitive.Root className="relative flex w-full flex-col">
      <ComposerAttachmentSync
        attachments={attachments}
        onRemoveAttachment={onRemoveAttachment}
      />
      <div className="flex w-full flex-col gap-2 rounded-(--composer-radius) bg-shell-panel-muted p-(--composer-padding) shadow-[0_10px_30px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.03)] transition-shadow focus-within:ring-2 focus-within:ring-ring/12">
        <ComposerAttachments />

        <ComposerPrimitive.Input
          placeholder="向 Pi Agent 提问..."
          ref={composerInputRef}
          className={`min-h-0 w-full resize-none bg-transparent px-1 py-1 text-[15px] leading-6 outline-none placeholder:text-muted-foreground/80 ${
            inputScrollable ? "overflow-y-auto pr-2" : "overflow-y-hidden"
          }`}
          minRows={1}
          maxRows={5}
          autoFocus
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
          modelOptions={modelOptions}
          currentModelId={currentModelId}
          thinkingLevel={thinkingLevel}
          onModelChange={onModelChange}
          onThinkingLevelChange={onThinkingLevelChange}
        />
        <ComposerStatusBar
          branchSummary={branchSummary}
          contextSummary={contextSummary}
          contextPanelOpen={contextPanelOpen}
          onToggleContextPanel={onToggleContextPanel}
        />
      </div>
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC<
  Pick<
    ThreadResolvedProps,
    | "isPickingFiles"
    | "onAttachFiles"
    | "modelOptions"
    | "currentModelId"
    | "thinkingLevel"
    | "onModelChange"
    | "onThinkingLevelChange"
  >
> = ({
  isPickingFiles,
  onAttachFiles,
  modelOptions,
  currentModelId,
  thinkingLevel,
  onModelChange,
  onThinkingLevelChange,
}) => {
  return (
    <div className="relative flex items-center justify-between pt-1">
      <div className="flex items-center gap-1.5">
        <DesktopComposerAddAttachment
          isPickingFiles={isPickingFiles}
          onAttachFiles={onAttachFiles}
        />
        <ModelSelector
          models={modelOptions}
          value={currentModelId}
          onValueChange={onModelChange}
          variant="outline"
          size="sm"
          contentClassName="min-w-[220px]"
        />
        <Select
          value={thinkingLevel}
          onValueChange={(value) =>
            onThinkingLevelChange(value as ThinkingLevel)
          }
          options={THINKING_LEVELS.map((level) => ({
            value: level.value,
            textValue: level.label,
            label: (
              <span className="flex items-center gap-2">
                <BrainCircuitIcon className="size-4 shrink-0" />
                <span>{level.label}</span>
              </span>
            ),
          }))}
          className="h-8 rounded-md bg-shell-panel-elevated text-[12px]"
          placeholder="思考强度"
        />
      </div>
      <AuiIf condition={(s) => !s.thread.isRunning}>
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
      </AuiIf>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel asChild>
          <Button
            type="button"
            variant="default"
            size="icon"
            className="size-8 rounded-full bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]"
            aria-label="停止生成"
          >
            <SquareIcon className="size-3 fill-current" />
          </Button>
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </div>
  );
};

function formatBranchLabel(branchSummary: GitBranchSummary | null) {
  if (!branchSummary) {
    return "读取中";
  }

  if (!branchSummary.branchName) {
    return "非 Git 仓库";
  }

  if (branchSummary.isDetached) {
    return `Detached · ${branchSummary.branchName}`;
  }

  return branchSummary.branchName;
}

const ComposerStatusBar: FC<{
  branchSummary: GitBranchSummary | null;
  contextSummary: ContextUsageSummary;
  contextPanelOpen: boolean;
  onToggleContextPanel: () => void;
}> = ({
  branchSummary,
  contextSummary,
  contextPanelOpen,
  onToggleContextPanel,
}) => {
  const branchLabel = formatBranchLabel(branchSummary);
  const isGitRepo = !!branchSummary?.branchName;

  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <div
        className={cn(
          "inline-flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 text-[11px]",
          isGitRepo
            ? "bg-shell-panel text-foreground"
            : "bg-shell-panel/60 text-muted-foreground",
        )}
        aria-label={isGitRepo ? `当前分支 ${branchLabel}` : "当前 workspace 不是 Git 仓库"}
      >
        <GitBranchIcon className="size-3.5 shrink-0" />
        <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-secondary)]">
          Branch
        </span>
        <span className="truncate">{branchLabel}</span>
        {branchSummary?.hasChanges ? (
          <span className="size-1.5 shrink-0 rounded-full bg-amber-300" />
        ) : null}
      </div>

      <button
        type="button"
        onClick={onToggleContextPanel}
        aria-pressed={contextPanelOpen}
        aria-label={contextPanelOpen ? "收起 Context 面板" : "展开 Context 面板"}
        className={cn(
          "inline-flex items-center gap-2 rounded-full px-2.5 py-1.5 text-left transition-colors",
          contextPanelOpen
            ? "bg-shell-panel text-foreground"
            : "bg-shell-panel/60 text-muted-foreground hover:bg-shell-panel hover:text-foreground",
        )}
      >
        <ContextUsageIndicator summary={contextSummary} size={28} strokeWidth={3} />
        <span className="min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-secondary)]">
            Context
          </span>
          <span className="block truncate text-[11px]">
            {getContextStatusCopy(contextSummary)}
          </span>
        </span>
      </button>
    </div>
  );
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
        <MessagePrimitive.Parts
          components={{
            Text: () => <MarkdownText />,
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
