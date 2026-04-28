import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  BrainIcon,
  WrenchIcon,
  CheckCircle2Icon,
  XCircleIcon,
  Loader2Icon,
  ClockIcon,
  ListCollapseIcon,
  ListPlusIcon,
  ActivityIcon,
  XIcon,
} from "lucide-react";
import type { AgentEvent } from "@shared/agent-events";
import type { AgentStep, StepStatus } from "@shared/contracts";
import { cn } from "@renderer/lib/utils";
import { Button } from "@renderer/components/assistant-ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";

// ── Types ─────────────────────────────────────────────────────

type TraceRun = {
  runId: string;
  sessionId: string;
  status: "running" | "completed" | "error" | "cancelled";
  steps: AgentStep[];
  startedAt: number;
  endedAt?: number;
  finalText?: string;
  usage?: { inputTokens: number; outputTokens: number };
  error?: string;
};

type TracePanelProps = {
  sessionId: string;
  onClose: () => void;
  className?: string;
};

// ── Constants ─────────────────────────────────────────────────

const MAX_VISIBLE_RUNS = 20;
const MAX_STEP_DEPTH = 50;

// ── Helpers ───────────────────────────────────────────────────

function formatDuration(startedAt: number, endedAt?: number): string {
  const end = endedAt ?? Date.now();
  const ms = end - startedAt;
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const remaining = (s - m * 60).toFixed(0);
  return `${m}m ${remaining}s`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatToolLabel(step: AgentStep): string {
  const toolName = step.toolName ?? "tool";
  const args = step.toolArgs ?? {};

  if (toolName === "shell_exec") {
    const cmd = args.command as string | undefined;
    return cmd ? cmd.slice(0, 60) : "shell_exec";
  }
  if (toolName === "file_read" || toolName === "file_write") {
    const path = args.path as string | undefined;
    return path ? `${toolName.replace("_", " ")}: ${path.split(/[\\/]/).pop()}` : toolName.replace("_", " ");
  }
  if (toolName === "file_edit" || toolName === "edit_file") {
    const path = args.path as string | undefined;
    return path ? `edit: ${path.split(/[\\/]/).pop()}` : "file edit";
  }
  if (toolName === "web_fetch") {
    const url = args.url as string | undefined;
    return url ? `fetch: ${url.slice(0, 50)}` : "web fetch";
  }
  if (toolName === "web_search") {
    const query = args.query as string | undefined;
    return query ? `search: ${query.slice(0, 50)}` : "web search";
  }
  return toolName.replace(/_/g, " ");
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

function getStatusIcon(status: StepStatus, isRunning?: boolean) {
  if (isRunning) return <Loader2Icon className="size-3.5 animate-spin text-[color:var(--color-accent)]" />;
  switch (status) {
    case "success":
      return <CheckCircle2Icon className="size-3.5 text-emerald-500" />;
    case "error":
      return <XCircleIcon className="size-3.5 text-red-500" />;
    case "cancelled":
      return <XCircleIcon className="size-3.5 text-muted-foreground" />;
    default:
      return <ClockIcon className="size-3.5 text-muted-foreground" />;
  }
}

// ── StepRow ───────────────────────────────────────────────────

const StepRow = memo(function StepRow({
  step,
  depth = 0,
}: {
  step: AgentStep;
  depth?: number;
}) {
  const [open, setOpen] = useState(false);
  const isExecuting = step.status === "executing";
  const hasDetails = step.kind === "tool_call" && (step.toolResult || step.toolError || step.streamOutput);
  const hasThinking = step.kind === "thinking" && step.thinkingText;
  const expandable = hasDetails || hasThinking || (step.children && step.children.length > 0);

  const paddingLeft = depth * 16 + 8;

  return (
    <div className="group/step">
      <div
        className={cn(
          "flex items-start gap-2 py-1.5 px-2 rounded-md transition-colors",
          "hover:bg-[color:var(--color-control-bg)]",
          isExecuting && "bg-[color:var(--color-control-bg)]/50",
        )}
        style={{ paddingLeft }}
      >
        {expandable ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="mt-0.5 shrink-0 text-[color:var(--chela-text-tertiary)] hover:text-[color:var(--chela-text-primary)] transition-colors"
          >
            {open ? (
              <ChevronDownIcon className="size-3.5" />
            ) : (
              <ChevronRightIcon className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        <span className="mt-0.5 shrink-0">
          {getStatusIcon(step.status, isExecuting)}
        </span>

        <span className="mt-0.5 shrink-0">
          {step.kind === "thinking" ? (
            <BrainIcon className="size-3.5 text-[color:var(--chela-text-tertiary)]" />
          ) : (
            <WrenchIcon className="size-3.5 text-[color:var(--chela-text-tertiary)]" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-medium text-[color:var(--chela-text-primary)] truncate">
              {step.kind === "thinking"
                ? step.thinkingText
                  ? truncate(step.thinkingText.split("\n")[0] || "思考中…", 80)
                  : "思考中…"
                : formatToolLabel(step)}
            </span>
            <span className="text-[11px] text-[color:var(--chela-text-tertiary)] shrink-0">
              {formatTime(step.startedAt)}
            </span>
          </div>
        </div>
      </div>

      {expandable && (
        <div className={cn("overflow-hidden transition-all", open ? "max-h-[600px]" : "max-h-0")}>
          {step.kind === "thinking" && step.thinkingText && (
            <div
              className="mx-2 mb-2 px-3 py-2 rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] text-[12px] leading-relaxed whitespace-pre-wrap text-[color:var(--chela-text-secondary)] max-h-[240px] overflow-y-auto"
              style={{ marginLeft: paddingLeft + 24 }}
            >
              {step.thinkingText}
            </div>
          )}

          {step.kind === "tool_call" && (step.streamOutput || step.toolResult || step.toolError) && (
            <div
              className="mx-2 mb-2 px-3 py-2 rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-[color:var(--chela-text-secondary)] max-h-[240px] overflow-y-auto"
              style={{ marginLeft: paddingLeft + 24 }}
            >
              {step.toolError ? (
                <span className="text-red-400">{truncate(String(step.toolError), 2000)}</span>
              ) : (
                truncate(String(step.streamOutput ?? step.toolResult ?? ""), 2000)
              )}
            </div>
          )}

          {step.children && step.children.length > 0 && (
            <div style={{ paddingLeft: 0 }}>
              {step.children.map((child) => (
                <StepRow key={child.id} step={child} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ── RunCard ───────────────────────────────────────────────────

const RunCard = memo(function RunCard({
  run,
  isLatest,
}: {
  run: TraceRun;
  isLatest: boolean;
}) {
  const [open, setOpen] = useState(isLatest);
  const isRunning = run.status === "running";

  const stepCount = run.steps.length;
  const toolCount = run.steps.filter((s) => s.kind === "tool_call").length;
  const thinkingCount = run.steps.filter((s) => s.kind === "thinking").length;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-2">
      <CollapsibleTrigger
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2.5 rounded-[var(--radius-shell)] text-left transition-colors",
          "hover:bg-[color:var(--color-control-bg)]",
          isRunning && "bg-[color:var(--color-control-bg)]/60",
        )}
      >
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-[color:var(--chela-text-tertiary)] transition-transform duration-200",
            !open && "-rotate-90",
          )}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-[color:var(--chela-text-primary)]">
              Run {run.runId.slice(0, 8)}
            </span>
            {isRunning && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--color-accent)]">
                <Loader2Icon className="size-3 animate-spin" />
                运行中
              </span>
            )}
            {!isRunning && (
              <span className={cn(
                "text-[11px] font-medium",
                run.status === "completed" && "text-emerald-500",
                run.status === "error" && "text-red-500",
                run.status === "cancelled" && "text-muted-foreground",
              )}>
                {run.status === "completed" && "已完成"}
                {run.status === "error" && "错误"}
                {run.status === "cancelled" && "已取消"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[11px] text-[color:var(--chela-text-tertiary)]">
              {stepCount} 步
            </span>
            {thinkingCount > 0 && (
              <span className="text-[11px] text-[color:var(--chela-text-tertiary)]">
                {thinkingCount} 次思考
              </span>
            )}
            {toolCount > 0 && (
              <span className="text-[11px] text-[color:var(--chela-text-tertiary)]">
                {toolCount} 次工具调用
              </span>
            )}
            <span className="text-[11px] text-[color:var(--chela-text-tertiary)]">
              {formatDuration(run.startedAt, run.endedAt)}
            </span>
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="px-1 pb-1 pt-0.5">
          {run.steps.slice(0, MAX_STEP_DEPTH).map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
          {run.steps.length > MAX_STEP_DEPTH && (
            <div className="px-4 py-1.5 text-[11px] text-[color:var(--chela-text-tertiary)]">
              … 还有 {run.steps.length - MAX_STEP_DEPTH} 步未显示
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

// ── TracePanel ────────────────────────────────────────────────

export function TracePanel({ sessionId, onClose, className }: TracePanelProps) {
  const [runs, setRuns] = useState<Map<string, TraceRun>>(new Map());
  const [collapsed, setCollapsed] = useState(false);
  const runsRef = useRef(runs);
  runsRef.current = runs;

  const handleEvent = useCallback((event: AgentEvent) => {
    if (event.sessionId !== sessionId) return;
    const runId = (event as any).runId;
    if (!runId) return;

    setRuns((prev) => {
      const next = new Map(prev);
      const existing = next.get(runId);

      switch (event.type) {
        case "agent_start": {
          if (!existing) {
            next.set(runId, {
              runId,
              sessionId: event.sessionId,
              status: "running",
              steps: [],
              startedAt: event.timestamp,
            });
          }
          break;
        }

        case "agent_end": {
          const run = existing ?? {
            runId,
            sessionId: event.sessionId,
            status: "completed" as const,
            steps: [],
            startedAt: event.timestamp,
          };
          next.set(runId, { ...run, status: "completed", endedAt: event.timestamp });
          break;
        }

        case "agent_error": {
          const run = existing ?? {
            runId,
            sessionId: event.sessionId,
            status: "error" as const,
            steps: [],
            startedAt: event.timestamp,
          };
          next.set(runId, {
            ...run,
            status: "error",
            error: event.message,
            endedAt: event.timestamp,
          });
          break;
        }

        case "tool_execution_start": {
          if (!existing) {
            next.set(runId, {
              runId,
              sessionId: event.sessionId,
              status: "running",
              steps: [],
              startedAt: event.timestamp,
            });
          }
          const current = next.get(runId)!;
          const newSteps = [
            ...current.steps,
            {
              id: event.stepId,
              kind: "tool_call" as const,
              status: "executing" as const,
              startedAt: event.timestamp,
              toolName: event.toolName,
              toolArgs: event.args,
            },
          ];
          next.set(runId, { ...current, steps: newSteps });
          break;
        }

        case "tool_execution_update": {
          if (!existing) break;
          const current = next.get(runId)!;
          const stepIdx = current.steps.findIndex((s) => s.id === event.stepId);
          if (stepIdx < 0) break;
          const updatedSteps = [...current.steps];
          const step = { ...updatedSteps[stepIdx] };
          step.streamOutput = (step.streamOutput ?? "") + event.output;
          updatedSteps[stepIdx] = step;
          next.set(runId, { ...current, steps: updatedSteps });
          break;
        }

        case "tool_execution_end": {
          if (!existing) break;
          const current = next.get(runId)!;
          const stepIdx = current.steps.findIndex((s) => s.id === event.stepId);
          if (stepIdx < 0) break;
          const updatedSteps = [...current.steps];
          const step = { ...updatedSteps[stepIdx] };
          step.status = event.error ? ("error" as const) : ("success" as const);
          step.toolResult = event.result;
          step.toolError = event.error;
          step.endedAt = event.timestamp;
          updatedSteps[stepIdx] = step;
          next.set(runId, { ...current, steps: updatedSteps });
          break;
        }

        case "thinking_delta": {
          if (!existing) {
            next.set(runId, {
              runId,
              sessionId: event.sessionId,
              status: "running",
              steps: [],
              startedAt: event.timestamp,
            });
          }
          const current = next.get(runId)!;
          // Find the last executing thinking step
          const thinkingIdx = [...current.steps].reverse().findIndex(
            (s) => s.kind === "thinking" && s.status === "executing",
          );
          if (thinkingIdx >= 0) {
            const realIdx = current.steps.length - 1 - thinkingIdx;
            const updatedSteps = [...current.steps];
            const step = { ...updatedSteps[realIdx] };
            step.thinkingText = (step.thinkingText ?? "") + event.delta;
            updatedSteps[realIdx] = step;
            next.set(runId, { ...current, steps: updatedSteps });
          } else {
            // Create new thinking step
            const newStep = {
              id: `thinking-${Date.now()}`,
              kind: "thinking" as const,
              status: "executing" as const,
              startedAt: event.timestamp,
              thinkingText: event.delta,
            };
            next.set(runId, { ...current, steps: [...current.steps, newStep] });
          }
          break;
        }

        case "message_end": {
          if (!existing) break;
          const current = next.get(runId)!;
          // Mark all executing steps as success
          const updatedSteps = current.steps.map((s) =>
            s.status === "executing" ? { ...s, status: "success" as const, endedAt: event.timestamp } : s,
          );
          next.set(runId, {
            ...current,
            steps: updatedSteps,
            finalText: event.finalText,
            usage: event.usage,
            status: "completed",
            endedAt: event.timestamp,
          });
          break;
        }
      }

      return next;
    });
  }, [sessionId]);

  useEffect(() => {
    const unsub = window.desktopApi?.agent.onEvent(handleEvent);
    return () => unsub?.();
  }, [handleEvent]);

  const runList = useMemo(() => {
    const sorted = [...runs.values()].sort((a, b) => b.startedAt - a.startedAt);
    return sorted.slice(0, MAX_VISIBLE_RUNS);
  }, [runs]);

  const totalCount = runs.size;
  const runningCount = [...runs.values()].filter((r) => r.status === "running").length;

  if (collapsed) {
    return (
      <div className={cn("flex flex-col h-full", className)}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
          <div className="flex items-center gap-2">
            <ActivityIcon className="size-4 text-[color:var(--color-accent)]" />
            <span className="text-[13px] font-medium text-[color:var(--chela-text-primary)]">
              运行追踪
            </span>
            {(runningCount > 0 || totalCount > 0) && (
              <span className="text-[11px] text-[color:var(--chela-text-tertiary)]">
                {runningCount > 0 ? `${runningCount} 运行中` : `${totalCount} 次运行`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setCollapsed(false)}
                  className="h-7 w-7 rounded-[var(--radius-shell)] text-muted-foreground hover:text-foreground"
                >
                  <ListPlusIcon className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">展开</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-7 w-7 rounded-[var(--radius-shell)] text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">关闭</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {runList.length === 0 && (
          <div className="flex-1 flex items-center justify-center px-6 py-8">
            <div className="text-center">
              <ActivityIcon className="size-8 mx-auto text-[color:var(--chela-text-tertiary)] mb-2" />
              <p className="text-[13px] text-[color:var(--chela-text-secondary)]">
                暂无运行记录
              </p>
              <p className="text-[11px] text-[color:var(--chela-text-tertiary)] mt-1">
                发送消息后将在此显示运行步骤
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <ActivityIcon className="size-4 text-[color:var(--color-accent)]" />
          <span className="text-[13px] font-medium text-[color:var(--chela-text-primary)]">
            运行追踪
          </span>
          {(runningCount > 0 || totalCount > 0) && (
            <span className="text-[11px] text-[color:var(--chela-text-tertiary)]">
              {totalCount > 1 ? `${totalCount} 次运行` : `${totalCount} 次运行`}
              {runningCount > 0 && ` · ${runningCount} 运行中`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setCollapsed(true)}
                className="h-7 w-7 rounded-[var(--radius-shell)] text-muted-foreground hover:text-foreground"
              >
                <ListCollapseIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">折叠</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-7 w-7 rounded-[var(--radius-shell)] text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">关闭</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Body */}
      {runList.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-6 py-8">
          <div className="text-center">
            <ActivityIcon className="size-10 mx-auto text-[color:var(--chela-text-tertiary)] mb-3 opacity-60" />
            <p className="text-sm font-medium text-[color:var(--chela-text-primary)]">
              暂无运行记录
            </p>
            <p className="text-[12px] text-[color:var(--chela-text-tertiary)] mt-1.5 leading-relaxed">
              发送消息后，Agent 的思考过程和工具调用将在这里逐步展示
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
          {runList.map((run, idx) => (
            <RunCard key={run.runId} run={run} isLatest={idx === 0} />
          ))}
          {totalCount > MAX_VISIBLE_RUNS && (
            <div className="px-3 py-2 text-[11px] text-center text-[color:var(--chela-text-tertiary)]">
              … 还有 {totalCount - MAX_VISIBLE_RUNS} 次运行未显示
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TracePanel;
