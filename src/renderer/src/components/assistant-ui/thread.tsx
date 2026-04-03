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
  SquareIcon,
} from "lucide-react";
import type {
  AvailableModel,
  ModelSelection,
  SelectedFile,
  ThinkingLevel,
} from "@shared/contracts";

import {
  ComposerAttachments,
  DesktopComposerAddAttachment,
  UserMessageAttachments,
} from "@renderer/components/assistant-ui/attachment";
import { Button } from "@renderer/components/assistant-ui/button";
import { MarkdownText } from "@renderer/components/assistant-ui/markdown-text";
import {
  ModelSelector,
  type ModelOption,
} from "@renderer/components/assistant-ui/model-selector";
import { Reasoning } from "@renderer/components/assistant-ui/reasoning";
import { Select } from "@renderer/components/assistant-ui/select";
import { ToolFallback } from "@renderer/components/assistant-ui/tool-fallback";
import { TooltipIconButton } from "@renderer/components/assistant-ui/tooltip-icon-button";
import {
  selectedFileToCreateAttachment,
  toPersistedMessageAttachment,
} from "@renderer/lib/assistant-ui-attachments";

type ThreadProps = {
  attachments?: SelectedFile[];
  isPickingFiles?: boolean;
  terminalOpen?: boolean;
  onAttachFiles?: () => void;
  onPasteFiles?: (files: File[]) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  currentModel?: ModelSelection;
  thinkingLevel?: ThinkingLevel;
  onModelChange?: (model: ModelSelection) => void;
  onThinkingLevelChange?: (level: ThinkingLevel) => void;
};

type ThreadResolvedProps = {
  attachments: SelectedFile[];
  isPickingFiles: boolean;
  modelOptions: ModelOption[];
  onAttachFiles: () => void;
  onPasteFiles: (files: File[]) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  currentModel: ModelSelection;
  thinkingLevel: ThinkingLevel;
  onModelChange: (model: ModelSelection) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
};

const THINKING_LEVELS: { value: ThinkingLevel; label: string }[] = [
  { value: "off", label: "关闭" },
  { value: "minimal", label: "极低" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "xhigh", label: "极高" },
];

function getModelValue(model: ModelSelection | AvailableModel) {
  return `${model.provider}/${model.model}`;
}

function fallbackModelLabel(model: ModelSelection): string {
  return (model.model.split("/").pop() ?? model.model)
    .replace(/-\d{8}$/, "")
    .replace("claude-", "Claude ")
    .replace("gpt-", "GPT-")
    .replace("sonnet", "Sonnet")
    .replace("opus", "Opus")
    .replace("haiku", "Haiku");
}

function buildModelOptions(
  availableModels: AvailableModel[],
  currentModel: ModelSelection,
): ModelOption[] {
  const options: ModelOption[] = availableModels.map((model) => ({
    id: getModelValue(model),
    name: model.label,
    description: model.available
      ? `${model.provider} provider model`
      : "需配置 Key",
    icon: <BotIcon className="size-4" />,
    disabled: !model.available,
  }));

  if (!options.some((option) => option.id === getModelValue(currentModel))) {
    options.unshift({
      id: getModelValue(currentModel),
      name: fallbackModelLabel(currentModel),
      description: `${currentModel.provider} provider model`,
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
  currentModel = { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  thinkingLevel = "off",
  onModelChange = () => undefined,
  onThinkingLevelChange = () => undefined,
}) => {
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);

  useEffect(() => {
    let cancelled = false;

    void window.desktopApi?.models.listAvailable().then((models) => {
      if (!cancelled && Array.isArray(models)) {
        setAvailableModels(models);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const modelOptions = useMemo(
    () => buildModelOptions(availableModels, currentModel),
    [availableModels, currentModel],
  );

  return (
    <ThreadPrimitive.Root
      className="@container flex h-full flex-col bg-white"
      style={{
        ["--thread-max-width" as string]: "56rem",
        ["--composer-radius" as string]: "8px",
        ["--composer-padding" as string]: "12px",
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth px-8 pt-3"
      >
        <AuiIf condition={(s) => s.thread.isEmpty}>
          <ThreadWelcome />
        </AuiIf>

        <ThreadPrimitive.Messages>
          {() => <ThreadMessage />}
        </ThreadPrimitive.Messages>

        <ThreadPrimitive.ViewportFooter
          className={
            terminalOpen
              ? "sticky bottom-0 mx-auto mt-auto flex w-full max-w-(--thread-max-width) flex-col gap-2 overflow-visible bg-gradient-to-t from-white/92 via-white/84 to-transparent pb-2 pt-4"
              : "sticky bottom-0 mx-auto mt-auto flex w-full max-w-(--thread-max-width) flex-col gap-3 overflow-visible bg-gradient-to-t from-white via-white to-transparent pb-6 pt-10 md:pb-7"
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
            currentModel={currentModel}
            thinkingLevel={thinkingLevel}
            onModelChange={onModelChange}
            onThinkingLevelChange={onThinkingLevelChange}
          />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
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
          <h1 className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both font-semibold text-[2.2rem] tracking-[-0.03em] text-slate-900 duration-200">
            你好
          </h1>
          <p className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-base text-slate-500 delay-75 duration-200">
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
  currentModel,
  thinkingLevel,
  onModelChange,
  onThinkingLevelChange,
}) => {
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

  return (
    <ComposerPrimitive.Root className="relative flex w-full flex-col">
      <ComposerAttachmentSync
        attachments={attachments}
        onRemoveAttachment={onRemoveAttachment}
      />
      <div className="flex w-full flex-col gap-2 rounded-(--composer-radius) border border-black/8 bg-white p-(--composer-padding) shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-shadow focus-within:border-ring/30 focus-within:ring-2 focus-within:ring-ring/8">
        <ComposerAttachments />

        <ComposerPrimitive.Input
          placeholder="向 Pi Agent 提问..."
          className="max-h-32 min-h-0 w-full resize-none bg-transparent px-1 py-1 text-[15px] leading-6 outline-none placeholder:text-muted-foreground/80"
          rows={1}
          autoFocus
          onPaste={handleInputPaste}
          aria-label="消息输入框"
        />
        <ComposerAction
          isPickingFiles={isPickingFiles}
          onAttachFiles={onAttachFiles}
          modelOptions={modelOptions}
          currentModel={currentModel}
          thinkingLevel={thinkingLevel}
          onModelChange={onModelChange}
          onThinkingLevelChange={onThinkingLevelChange}
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
    | "currentModel"
    | "thinkingLevel"
    | "onModelChange"
    | "onThinkingLevelChange"
  >
> = ({
  isPickingFiles,
  onAttachFiles,
  modelOptions,
  currentModel,
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
          value={getModelValue(currentModel)}
          onValueChange={(value) => {
            const [provider, ...modelParts] = value.split("/");
            const model = modelParts.join("/");
            if (!provider || !model) return;
            onModelChange({ provider, model });
          }}
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
          className="h-8 rounded-md border border-input bg-transparent"
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
            className="size-9 rounded-full border border-slate-900 bg-slate-900 shadow-none hover:bg-slate-800"
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
            className="size-8 rounded-full"
            aria-label="停止生成"
          >
            <SquareIcon className="size-3 fill-current" />
          </Button>
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </div>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive dark:bg-destructive/5 dark:text-red-200">
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
  const externalSignature = attachments
    .map((attachment) => attachment.id)
    .join("|");
  const runtimeSignature = runtimeAttachments
    .map((attachment) => attachment.id)
    .join("|");

  useEffect(() => {
    if (externalSignature === runtimeSignature) return;

    let cancelled = false;
    isApplyingExternalSync.current = true;

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
  }, [attachments, aui, externalSignature, runtimeSignature]);

  useEffect(() => {
    if (isApplyingExternalSync.current) return;

    const runtimeIds = new Set(
      runtimeAttachments.map((attachment) => attachment.id),
    );
    const removedIds = attachments
      .filter((attachment) => !runtimeIds.has(attachment.id))
      .map((attachment) => attachment.id);

    if (removedIds.length === 0) return;

    removedIds.forEach((attachmentId) => {
      onRemoveAttachment(attachmentId);
    });
  }, [attachments, onRemoveAttachment, runtimeAttachments]);

  return null;
};
