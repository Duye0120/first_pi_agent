"use client";

import { memo, useEffect, useMemo, useState, type ComponentType, type FC } from "react";
import {
  AlertCircleIcon,
  BrainCircuitIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  FileIcon,
  GlobeIcon,
  LoaderCircleIcon,
  BookOpenIcon,
  SearchIcon,
  SparklesIcon,
  TerminalIcon,
  XCircleIcon,
} from "lucide-react";
import type {
  MessagePartStatus,
  ToolCallMessagePartStatus,
} from "@assistant-ui/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import { cn } from "@renderer/lib/utils";

type AgentActivityBarProps = {
  parts: readonly ActivityPart[];
  className?: string;
};

type ActivityStatus = MessagePartStatus | ToolCallMessagePartStatus | null | undefined;

type ActivityPart = {
  type: string;
  status?: ActivityStatus;
  startedAt?: number;
  endedAt?: number;
  toolName?: string;
  toolCallId?: string;
  argsText?: string;
  result?: unknown;
  isError?: boolean;
  text?: string;
};

type ActivityRow = {
  id: string;
  type: "thinking" | "tool";
  icon: ComponentType<{ className?: string }>;
  title: string;
  preview: string;
  detailText?: string;
  argsText?: string;
  resultText?: string;
  errorText?: string;
  status: ActivityStatus;
  startedAt?: number;
  durationMs?: number;
  isRunning: boolean;
  defaultOpen: boolean;
};

function formatDetailedDuration(ms?: number): string | null {
  if (ms === undefined || ms <= 0) return null;
  if (ms < 1000) return `${ms} 毫秒`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(3)} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes} 分 ${remainingSeconds.toFixed(1)} 秒`;
}

function formatCompactDuration(ms?: number): string | null {
  if (ms === undefined || ms <= 0) return null;
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)} s`;
  if (seconds < 100) return `${Math.round(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function getToolIcon(toolName: string): ComponentType<{ className?: string }> {
  const name = toolName.toLowerCase();
  if (name.includes("read") || name.includes("write") || name.includes("edit")) {
    return FileIcon;
  }
  if (name.includes("grep") || name.includes("search") || name.includes("glob")) return SearchIcon;
  if (name.includes("shell") || name.includes("exec") || name.includes("bash")) return TerminalIcon;
  if (name.includes("web") || name.includes("fetch")) return GlobeIcon;
  if (name.includes("memory") || name.includes("mem")) return BookOpenIcon;
  if (name.includes("skill")) return SparklesIcon;
  return FileIcon;
}

function getStatusMeta(status: ActivityStatus) {
  if (!status) {
    return {
      icon: LoaderCircleIcon,
      iconClassName: "text-[color:var(--color-accent)] animate-spin",
      badgeClassName: "bg-[var(--color-accent-subtle)] text-[color:var(--color-accent)]",
      badgeLabel: "进行中",
      dotClassName: "bg-[color:var(--color-accent)]",
    };
  }

  switch (status.type) {
    case "complete":
      return {
        icon: CheckCircle2Icon,
        iconClassName: "text-emerald-500",
        badgeClassName: "bg-emerald-500/10 text-emerald-600",
        badgeLabel: "已完成",
        dotClassName: "bg-emerald-500",
      };
    case "running":
      return {
        icon: LoaderCircleIcon,
        iconClassName: "text-[color:var(--color-accent)] animate-spin",
        badgeClassName: "bg-[var(--color-accent-subtle)] text-[color:var(--color-accent)]",
        badgeLabel: "进行中",
        dotClassName: "bg-[color:var(--color-accent)]",
      };
    case "requires-action":
      return {
        icon: AlertCircleIcon,
        iconClassName: "text-amber-500",
        badgeClassName: "bg-amber-400/12 text-amber-600",
        badgeLabel: "待确认",
        dotClassName: "bg-amber-500",
      };
    case "incomplete":
      if (status.reason === "cancelled") {
        return {
          icon: XCircleIcon,
          iconClassName: "text-[color:var(--color-text-muted)]",
          badgeClassName: "bg-black/5 text-[color:var(--color-text-secondary)] dark:bg-white/8",
          badgeLabel: "已停止",
          dotClassName: "bg-[color:var(--color-text-muted)]",
        };
      }
      return {
        icon: AlertCircleIcon,
        iconClassName: "text-rose-500",
        badgeClassName: "bg-rose-500/10 text-rose-600",
        badgeLabel: "出错",
        dotClassName: "bg-rose-500",
      };
    default:
      return {
        icon: CheckCircle2Icon,
        iconClassName: "text-emerald-500",
        badgeClassName: "bg-emerald-500/10 text-emerald-600",
        badgeLabel: "已完成",
        dotClassName: "bg-emerald-500",
      };
  }
}

function extractToolName(toolName: string): string {
  const labels: Record<string, string> = {
    shell_exec: "Shell",
    file_read: "Read",
    file_write: "Write",
    file_edit: "Edit",
    web_fetch: "Fetch",
    web_search: "Search",
    get_time: "Time",
    glob_search: "Glob",
    grep_search: "Grep",
    memory_save: "Memory",
    memory_list: "Memory",
    todo_read: "Todo",
    todo_write: "Todo",
  };
  return labels[toolName] ?? toolName.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
}

function safeParseArgs(argsText?: string) {
  if (!argsText || argsText === "{}") return null;
  try {
    const value = JSON.parse(argsText);
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function shortText(value: string, max = 88) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function shortPath(value: string, max = 56) {
  const normalized = value.replace(/\\/g, "/");
  if (normalized.length <= max) return normalized;

  const parts = normalized.split("/");
  const tail = parts.slice(-2).join("/");
  return tail.length + 4 <= max ? `.../${tail}` : `.../${parts[parts.length - 1]}`;
}

function extractPrimaryArg(args: Record<string, unknown> | null) {
  if (!args) return null;

  const pathKeys = ["path", "file", "filePath", "targetPath", "destination", "cwd"];
  for (const key of pathKeys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) {
      return shortPath(value.trim());
    }
  }

  const textKeys = ["command", "cmd", "query", "url", "pattern", "name"];
  for (const key of textKeys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) {
      return shortText(value.trim(), 52);
    }
  }

  return null;
}

function stringifyUnknown(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getStepDuration(part: ActivityPart) {
  if (!part.startedAt) return undefined;
  const endTime =
    part.endedAt ??
    (part.status?.type === "running" ? Date.now() : undefined);
  if (!endTime) return undefined;
  return Math.max(endTime - part.startedAt, 0);
}

function buildToolPreview(status: ActivityStatus, resultText: string | null, errorText: string | null) {
  if (status?.type === "running") {
    return resultText ? shortText(resultText, 96) : "流式执行中…";
  }
  if (status?.type === "requires-action") {
    return "等待确认后继续执行";
  }
  if (errorText) {
    return shortText(errorText, 96);
  }
  if (resultText) {
    return shortText(resultText, 96);
  }
  if (status?.type === "incomplete" && status.reason === "cancelled") {
    return "这一步已停止";
  }
  return "点击展开看详情";
}

function buildActivityRows(parts: readonly ActivityPart[]): ActivityRow[] {
  const rows: ActivityRow[] = [];

  for (const [index, rawPart] of parts.entries()) {
    const part = rawPart as ActivityPart;

    if (part.type === "reasoning") {
      if (!part.text?.trim()) continue;

      const durationMs = getStepDuration(part);
      rows.push({
        id: `thinking-${index}`,
        type: "thinking",
        icon: BrainCircuitIcon,
        title: durationMs ? `思考了 ${formatDetailedDuration(durationMs)}` : "思考",
        preview: shortText(part.text, 110),
        detailText: part.text,
        status: part.status ?? null,
        startedAt: part.startedAt,
        durationMs,
        isRunning: part.status?.type === "running",
        defaultOpen: part.status?.type === "running",
      });
      continue;
    }

    if (part.type !== "tool-call") continue;

    const args = safeParseArgs(part.argsText);
    const resultText = stringifyUnknown(part.result);
    const status = part.status ?? null;
    const errorText =
      status?.type === "incomplete" && status.reason !== "cancelled"
        ? stringifyUnknown(status.error) ?? resultText
        : null;
    const target = extractPrimaryArg(args);
    const durationMs = getStepDuration(part);

    rows.push({
      id: part.toolCallId ?? `tool-${index}`,
      type: "tool",
      icon: getToolIcon(part.toolName ?? "tool"),
      title: target
        ? `${extractToolName(part.toolName ?? "tool")} ${target}`
        : extractToolName(part.toolName ?? "tool"),
      preview: buildToolPreview(status, resultText, errorText),
      argsText: part.argsText && part.argsText !== "{}" ? part.argsText : undefined,
      resultText: resultText ?? undefined,
      errorText: errorText ?? undefined,
      status,
      startedAt: part.startedAt,
      durationMs,
      isRunning: status?.type === "running",
      defaultOpen: status?.type === "running" || status?.type === "incomplete",
    });
  }

  return rows;
}

type ActivityRowProps = {
  row: ActivityRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const ActivityRowItem: FC<ActivityRowProps> = ({
  row,
  open,
  onOpenChange,
}) => {
  const statusMeta = getStatusMeta(row.status);
  const StatusIcon = statusMeta.icon;
  const durationLabel = formatCompactDuration(row.durationMs);
  const canExpand = Boolean(row.detailText || row.argsText || row.resultText || row.errorText);

  return (
    <div className="relative pb-3 last:pb-0">
      <span
        className={cn(
          "absolute left-[-26px] top-4 size-2.5 rounded-full shadow-[0_0_0_4px_rgba(255,255,255,0.72)] dark:shadow-[0_0_0_4px_rgba(15,23,42,0.85)]",
          statusMeta.dotClassName,
        )}
      />

      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger
          disabled={!canExpand}
          className={cn(
            "group flex w-full items-start gap-3 rounded-[16px] bg-white/78 px-3 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition hover:bg-white/90 dark:bg-white/6 dark:hover:bg-white/10",
            row.isRunning && "bg-[var(--color-accent-subtle)]/55 dark:bg-[var(--color-accent-subtle)]/20",
            !canExpand && "cursor-default",
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-black/5 text-[color:var(--color-text-secondary)] dark:bg-white/8">
            <row.icon className="size-4" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[15px] font-medium text-foreground">
                {row.title}
              </span>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                  statusMeta.badgeClassName,
                )}
              >
                {statusMeta.badgeLabel}
              </span>
            </span>

            <span
              className={cn(
                "mt-1 block text-[12px] leading-5 text-[color:var(--color-text-secondary)]",
                row.isRunning && "streaming-cursor",
              )}
            >
              {row.preview}
            </span>
          </span>

          <span className="ml-auto flex items-center gap-2 pl-2">
            {durationLabel ? (
              <span className="shrink-0 text-[12px] font-medium text-[color:var(--color-text-muted)] tabular-nums">
                {durationLabel}
              </span>
            ) : null}
            <StatusIcon className={cn("size-4 shrink-0", statusMeta.iconClassName)} />
            {canExpand ? (
              <ChevronDownIcon
                className={cn(
                  "size-4 shrink-0 text-[color:var(--color-text-muted)] transition-transform duration-200",
                  open && "rotate-180",
                )}
              />
            ) : null}
          </span>
        </CollapsibleTrigger>

        {canExpand ? (
          <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
            <div className="mt-2 ml-2 space-y-2 rounded-[16px] bg-white/58 px-4 py-3 dark:bg-white/5">
              {row.detailText ? (
                <div className="rounded-[12px] bg-white/72 px-3 py-2.5 text-[12px] leading-6 whitespace-pre-wrap text-[color:var(--color-text-secondary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] dark:bg-black/16">
                  <span className={cn(row.isRunning && "streaming-cursor")}>
                    {row.detailText}
                  </span>
                </div>
              ) : null}

              {row.argsText ? (
                <div className="rounded-[12px] bg-white/72 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] dark:bg-black/16">
                  <p className="mb-1.5 text-[10px] font-medium tracking-[0.08em] text-[color:var(--color-text-muted)] uppercase">
                    Args
                  </p>
                  <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] leading-5 text-[color:var(--color-text-secondary)]">
                    {row.argsText}
                  </pre>
                </div>
              ) : null}

              {row.errorText ? (
                <div className="rounded-[12px] bg-rose-500/10 px-3 py-2.5 text-[11px] leading-5 text-rose-700 dark:text-rose-300">
                  <p className="mb-1 font-medium uppercase tracking-[0.08em] text-[10px] text-rose-600/80 dark:text-rose-300/80">
                    Error
                  </p>
                  <pre className="overflow-x-auto whitespace-pre-wrap">{row.errorText}</pre>
                </div>
              ) : null}

              {row.resultText && !row.errorText ? (
                <div className="rounded-[12px] bg-white/72 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] dark:bg-black/16">
                  <p className="mb-1.5 text-[10px] font-medium tracking-[0.08em] text-[color:var(--color-text-muted)] uppercase">
                    Output
                  </p>
                  <pre
                    className={cn(
                      "overflow-x-auto whitespace-pre-wrap text-[11px] leading-5 text-[color:var(--color-text-secondary)]",
                      row.isRunning && "streaming-cursor",
                    )}
                  >
                    {row.resultText}
                  </pre>
                </div>
              ) : null}
            </div>
          </CollapsibleContent>
        ) : null}
      </Collapsible>
    </div>
  );
};

const AgentActivityBarImpl: FC<AgentActivityBarProps> = ({
  parts,
  className,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});

  const rows = useMemo(
    () => buildActivityRows(parts),
    [parts],
  );

  useEffect(() => {
    if (rows.some((row) => row.isRunning) && !expanded) {
      setExpanded(true);
    }
  }, [expanded, rows]);

  useEffect(() => {
    setOpenRows((current) => {
      const next: Record<string, boolean> = {};
      let changed = false;

      for (const row of rows) {
        if (row.id in current) {
          next[row.id] = current[row.id];
        } else {
          next[row.id] = row.defaultOpen;
          changed = true;
        }
      }

      const currentKeys = Object.keys(current);
      if (currentKeys.length !== rows.length) {
        changed = true;
      }

      if (!changed) {
        for (const key of currentKeys) {
          if (!(key in next)) {
            changed = true;
            break;
          }
        }
      }

      return changed ? next : current;
    });
  }, [rows]);

  if (rows.length === 0) return null;

  const thinkingRow = rows.find((r) => r.type === "thinking");
  const summaryTitle = thinkingRow?.title ?? `已记录 ${rows.length} 个步骤`;
  const summaryText =
    rows.length === 1
      ? rows[0]?.preview
      : rows.some((row) => row.isRunning)
        ? `正在流式更新 ${rows.length} 个步骤`
        : `流程已完成，共 ${rows.length} 个步骤`;
  const summaryStatus = getStatusMeta(
    rows.find((row) => row.isRunning)?.status ??
      rows.find((row) => row.status?.type === "incomplete")?.status ??
      thinkingRow?.status ??
      rows[rows.length - 1]?.status ??
      null,
  );
  const SummaryIcon = summaryStatus.icon;

  return (
    <div
      className={cn(
        "mb-4 w-full max-w-[760px] overflow-hidden rounded-[24px]",
        "border border-[color:var(--color-control-border)] bg-[color:var(--color-control-panel-bg)] shadow-[var(--color-control-panel-shadow)]",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/28 dark:hover:bg-white/4"
        aria-label={expanded ? "收起流程" : "展开流程"}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-shell-panel text-[color:var(--color-text-secondary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.42)] dark:bg-white/8">
          {thinkingRow ? (
            <BrainCircuitIcon className="size-4" />
          ) : (
            <SummaryIcon className={cn("size-4", summaryStatus.iconClassName)} />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-foreground">
            {summaryTitle}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-[color:var(--color-text-secondary)]">
            {summaryText}
          </span>
        </span>

        <span className="inline-flex shrink-0 items-center rounded-full bg-shell-panel px-2.5 py-1 text-[10px] font-medium text-[color:var(--color-text-secondary)] dark:bg-white/8">
          {rows.length} 步
        </span>

        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-[color:var(--color-text-muted)] transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded ? (
        <div className="px-4 pb-4">
          <div className="relative ml-6 border-l border-white/58 pl-5 dark:border-white/10">
            {rows.map((row) => (
              <ActivityRowItem
                key={row.id}
                row={row}
                open={openRows[row.id] ?? row.defaultOpen}
                onOpenChange={(open) =>
                  setOpenRows((current) => ({ ...current, [row.id]: open }))
                }
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const AgentActivityBar = memo(AgentActivityBarImpl);
export { AgentActivityBarImpl as AgentActivityBarImpl };
