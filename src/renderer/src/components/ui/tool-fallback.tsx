"use client";

import { memo, useCallback, useState } from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  LoaderIcon,
  XCircleIcon,
} from "lucide-react";
import {
  type ToolCallMessagePartStatus,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import { cn } from "@renderer/lib/utils";

const ANIMATION_DURATION = 200;
const TOOL_NAME_LABELS: Record<string, string> = {
  shell_exec: "Shell 命令",
  file_read: "读取文件",
  file_write: "写入文件",
  mcp: "MCP 工具",
  command_history: "命令历史",
  web_fetch: "网页抓取",
  get_time: "获取时间",
};

export type ToolFallbackRootProps = Omit<
  React.ComponentProps<typeof Collapsible>,
  "open" | "onOpenChange"
> & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
};

function ToolFallbackRoot({
  className,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  children,
  ...props
}: ToolFallbackRootProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(open);
      }
      controlledOnOpenChange?.(open);
    },
    [isControlled, controlledOnOpenChange],
  );

  return (
    <Collapsible
      data-slot="tool-fallback-root"
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn(
        "aui-tool-fallback-root group/tool-fallback-root mb-1.5 w-full overflow-hidden rounded-[14px] border border-[color:var(--color-control-border)] bg-[color:var(--color-control-panel-bg)] shadow-[var(--color-control-shadow)] last:mb-0",
        className,
      )}
      style={
        {
          "--animation-duration": `${ANIMATION_DURATION}ms`,
        } as React.CSSProperties
      }
      {...props}
    >
      {children}
    </Collapsible>
  );
}

type ToolStatus = ToolCallMessagePartStatus["type"];

const statusIconMap: Record<ToolStatus, React.ElementType> = {
  running: LoaderIcon,
  complete: CheckIcon,
  incomplete: XCircleIcon,
  "requires-action": AlertCircleIcon,
};

function formatToolName(toolName: string) {
  return TOOL_NAME_LABELS[toolName] ?? toolName.replace(/_/g, " ");
}

function getStatusMeta(status?: ToolCallMessagePartStatus) {
  if (!status || status.type === "complete") {
    return {
      label: null,
      tone: "text-emerald-600 bg-emerald-500/10",
    };
  }

  if (status.type === "running") {
    return {
      label: "进行中",
      tone: "text-[var(--color-accent)] bg-[var(--color-accent-subtle)]",
    };
  }

  if (status.type === "requires-action") {
    return {
      label: "待确认",
      tone: "text-amber-600 bg-amber-400/12",
    };
  }

  if (status.reason === "cancelled") {
    return {
      label: "已停止",
      tone: "text-[color:var(--color-text-secondary)] bg-black/5 dark:bg-white/5",
    };
  }

  return {
    label: "出错",
    tone: "text-rose-600 bg-rose-500/10",
  };
}

function ToolFallbackTrigger({
  toolName,
  status,
  className,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger> & {
  toolName: string;
  status?: ToolCallMessagePartStatus;
}) {
  const statusType = status?.type ?? "complete";
  const isRunning = statusType === "running";
  const isCancelled =
    status?.type === "incomplete" && status.reason === "cancelled";
  const statusMeta = getStatusMeta(status);

  const Icon = statusIconMap[statusType];
  const displayName = formatToolName(toolName);

  return (
    <CollapsibleTrigger
      data-slot="tool-fallback-trigger"
      className={cn(
        "aui-tool-fallback-trigger group/trigger flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors data-[state=open]:bg-white/52 dark:data-[state=open]:bg-black/20 data-[state=closed]:hover:bg-white/42 dark:data-[state=closed]:hover:bg-black/20",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full",
          statusMeta.tone,
        )}
      >
        <Icon
          data-slot="tool-fallback-trigger-icon"
          className={cn(
            "aui-tool-fallback-trigger-icon size-3.5 shrink-0",
            isCancelled && "opacity-75",
            isRunning && "animate-spin",
          )}
        />
      </span>
      <span
        data-slot="tool-fallback-trigger-label"
        className="min-w-0 grow text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "truncate text-[13px] font-medium text-foreground",
              isCancelled && "text-[color:var(--color-text-secondary)]",
            )}
          >
            {displayName}
          </span>
          {statusMeta.label ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-full px-1.75 py-0.5 text-[10px] font-medium",
                statusMeta.tone,
              )}
            >
              {statusMeta.label}
            </span>
          ) : (
            <span className="shrink-0 text-[11px] font-medium text-[color:var(--color-text-muted)]">
              已完成
            </span>
          )}
        </span>
      </span>
      <ChevronDownIcon
        data-slot="tool-fallback-trigger-chevron"
        className={cn(
          "aui-tool-fallback-trigger-chevron size-4 shrink-0 text-[color:var(--color-text-secondary)]",
          "transition-transform duration-(--animation-duration) ease-out",
          "group-data-[state=closed]/trigger:-rotate-90",
          "group-data-[state=open]/trigger:rotate-0",
        )}
      />
    </CollapsibleTrigger>
  );
}

function ToolFallbackContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="tool-fallback-content"
      className={cn(
        "aui-tool-fallback-content relative overflow-hidden text-sm outline-none",
        "group/collapsible-content ease-out",
        "data-[state=closed]:animate-collapsible-up",
        "data-[state=open]:animate-collapsible-down",
        "data-[state=closed]:fill-mode-forwards",
        "data-[state=closed]:pointer-events-none",
        "data-[state=open]:duration-(--animation-duration)",
        "data-[state=closed]:duration-(--animation-duration)",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-1.5 px-3 pb-2.5 pt-0.5">{children}</div>
    </CollapsibleContent>
  );
}

function ToolFallbackArgs({
  argsText,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  argsText?: string;
}) {
  if (!argsText || argsText === "{}") return null;

  return (
    <div
      data-slot="tool-fallback-args"
      className={cn(
        "aui-tool-fallback-args rounded-[10px] bg-white/70 dark:bg-black/20 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
        className,
      )}
      {...props}
    >
      <p className="mb-1.5 text-[10px] font-medium text-[color:var(--color-text-muted)]">
        参数
      </p>
      <pre className="aui-tool-fallback-args-value overflow-x-auto whitespace-pre-wrap text-[11px] leading-5 text-[color:var(--color-text-secondary)]">
        {argsText}
      </pre>
    </div>
  );
}

function ToolFallbackResult({
  result,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  result?: unknown;
}) {
  if (result === undefined) return null;

  return (
    <div
      data-slot="tool-fallback-result"
      className={cn(
        "aui-tool-fallback-result rounded-[10px] bg-white/70 dark:bg-black/20 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
        className,
      )}
      {...props}
    >
      <p className="aui-tool-fallback-result-header mb-1.5 text-[10px] font-medium text-[color:var(--color-text-muted)]">
        输出
      </p>
      <pre className="aui-tool-fallback-result-content overflow-x-auto whitespace-pre-wrap text-[11px] leading-5 text-[color:var(--color-text-secondary)]">
        {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}

function stringifyToolResult(result: unknown) {
  if (result === undefined) return null;
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function extractToolResultText(result: unknown) {
  if (typeof result === "string") {
    return result;
  }

  if (
    result &&
    typeof result === "object" &&
    "content" in result &&
    Array.isArray((result as { content?: unknown }).content)
  ) {
    const parts = (result as { content: Array<{ type?: string; text?: string }> }).content
      .filter((item) => item.type === "text" && item.text)
      .map((item) => item.text);

    if (parts.length > 0) {
      return parts.join("\n");
    }
  }

  return stringifyToolResult(result);
}

function parseJsonObject(text: string | null) {
  if (!text) return null;

  try {
    const value = JSON.parse(text);
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function getToolDetails(result: unknown) {
  if (!result || typeof result !== "object" || !("details" in result)) {
    return null;
  }

  const details = (result as { details?: unknown }).details;
  return details && typeof details === "object"
    ? (details as Record<string, unknown>)
    : null;
}

function ToolFallbackSummary({
  toolName,
  result,
}: {
  toolName: string;
  result?: unknown;
}) {
  const text = extractToolResultText(result);
  const parsed = parseJsonObject(text);
  const details = getToolDetails(result);

  if (toolName === "command_history") {
    const entries = Array.isArray(parsed?.entries)
      ? parsed.entries.slice(0, 5)
      : [];
    if (entries.length === 0) {
      return (
        <div className="rounded-[10px] bg-white/70 px-2.5 py-2 text-[12px] leading-5 text-[color:var(--color-text-secondary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] dark:bg-black/20">
          暂无命令历史。
        </div>
      );
    }

    return (
      <div className="rounded-[10px] bg-white/70 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] dark:bg-black/20">
        <p className="mb-1.5 text-[10px] font-medium text-[color:var(--color-text-muted)]">
          最近命令
        </p>
        <div className="flex flex-col gap-1.5">
          {entries.map((entry, index) => {
            const item = entry as {
              command?: unknown;
              exitCode?: unknown;
              durationMs?: unknown;
            };
            const command = typeof item.command === "string" ? item.command : "";
            const exitCode = typeof item.exitCode === "number" ? item.exitCode : null;
            const durationMs = typeof item.durationMs === "number" ? item.durationMs : null;
            return (
              <div key={`${command}-${index}`} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-2 text-[11px] leading-5">
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 font-medium tabular-nums",
                  exitCode === 0
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-rose-500/10 text-rose-600",
                )}>
                  {exitCode ?? "—"}
                </span>
                <code className="truncate text-[color:var(--color-text-secondary)]">
                  {command || "—"}
                </code>
                <span className="text-[color:var(--color-text-muted)] tabular-nums">
                  {durationMs !== null ? `${durationMs}ms` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (toolName === "mcp") {
    const action = typeof details?.action === "string" ? details.action : null;
    const server = typeof details?.server === "string" ? details.server : null;
    const tool = typeof details?.tool === "string" ? details.tool : null;
    const count = typeof details?.count === "number" ? details.count : null;
    const truncated = details?.truncated === true || parsed?.truncated === true;

    return (
      <div className="rounded-[10px] bg-white/70 px-2.5 py-2 text-[12px] leading-5 text-[color:var(--color-text-secondary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] dark:bg-black/20">
        <span className="font-medium text-foreground">MCP {action ?? "result"}</span>
        {server ? <span> · {server}</span> : null}
        {tool ? <span> / {tool}</span> : null}
        {count !== null ? <span> · {count} tools</span> : null}
        {truncated ? <span> · 已截断</span> : null}
      </div>
    );
  }

  return null;
}

function ToolFallbackError({
  status,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  status?: ToolCallMessagePartStatus;
}) {
  if (status?.type !== "incomplete") return null;

  const error = status.error;
  const errorText = error
    ? typeof error === "string"
      ? error
      : JSON.stringify(error)
    : null;

  if (!errorText) return null;

  const isCancelled = status.reason === "cancelled";
  const headerText = isCancelled ? "停止原因" : "错误信息";

  return (
    <div
      data-slot="tool-fallback-error"
      className={cn(
        "aui-tool-fallback-error rounded-[10px] px-2.5 py-2",
        isCancelled
          ? "bg-black/4 dark:bg-white/5"
          : "bg-rose-500/8 text-rose-700 dark:text-rose-300",
        className,
      )}
      {...props}
    >
      <p className="aui-tool-fallback-error-header mb-1 text-[10px] font-medium text-[color:var(--color-text-muted)]">
        {headerText}
      </p>
      <p className="aui-tool-fallback-error-reason text-[11px] leading-5 text-[color:var(--color-text-secondary)]">
        {errorText}
      </p>
    </div>
  );
}

const ToolFallbackImpl: ToolCallMessagePartComponent = ({
  toolName,
  argsText,
  result,
  status,
}) => {
  const isCancelled =
    status?.type === "incomplete" && status.reason === "cancelled";

  return (
    <ToolFallbackRoot className={cn(isCancelled && "bg-[color:var(--color-control-bg)]/80")}>
      <ToolFallbackTrigger toolName={toolName} status={status} />
      <ToolFallbackContent>
        <ToolFallbackError status={status} />
        {!isCancelled && <ToolFallbackSummary toolName={toolName} result={result} />}
        <ToolFallbackArgs
          argsText={argsText}
          className={cn(isCancelled && "opacity-60")}
        />
        {!isCancelled && <ToolFallbackResult result={result} />}
      </ToolFallbackContent>
    </ToolFallbackRoot>
  );
};

const ToolFallback = memo(
  ToolFallbackImpl,
) as unknown as ToolCallMessagePartComponent & {
  Root: typeof ToolFallbackRoot;
  Trigger: typeof ToolFallbackTrigger;
  Content: typeof ToolFallbackContent;
  Args: typeof ToolFallbackArgs;
  Result: typeof ToolFallbackResult;
  Error: typeof ToolFallbackError;
};

ToolFallback.displayName = "ToolFallback";
ToolFallback.Root = ToolFallbackRoot;
ToolFallback.Trigger = ToolFallbackTrigger;
ToolFallback.Content = ToolFallbackContent;
ToolFallback.Args = ToolFallbackArgs;
ToolFallback.Result = ToolFallbackResult;
ToolFallback.Error = ToolFallbackError;

export {
  ToolFallback,
  ToolFallbackRoot,
  ToolFallbackTrigger,
  ToolFallbackContent,
  ToolFallbackArgs,
  ToolFallbackResult,
  ToolFallbackError,
};
