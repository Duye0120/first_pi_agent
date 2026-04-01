import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircleIcon,
  XCircleIcon,
  ChevronRightIcon,
} from "@heroicons/react/20/solid";
import type { AgentStep } from "@shared/contracts";
import { ThinkingContent } from "./step-content/ThinkingContent";
import { GenericToolContent } from "./step-content/GenericToolContent";
import { FileReadContent } from "./step-content/FileReadContent";
import { FileWriteContent } from "./step-content/FileWriteContent";
import { ShellExecContent } from "./step-content/ShellExecContent";
import { WebFetchContent } from "./step-content/WebFetchContent";

type Props = { step: AgentStep };

/** Generate a human-readable summary for a step */
function getStepSummary(step: AgentStep): string {
  if (step.kind === "thinking") {
    if (step.status === "executing") return "思考中…";
    const dur = step.endedAt && step.startedAt
      ? ((step.endedAt - step.startedAt) / 1000).toFixed(1)
      : null;
    return dur ? `思考了 ${dur} 秒` : "思考完成";
  }

  const name = step.toolName ?? "工具";
  const args = step.toolArgs ?? {};

  switch (name) {
    case "get_time":
      return step.status === "executing" ? "查询当前时间…" : "查询了当前时间";
    case "file_read": {
      const p = (args.path as string) ?? "";
      const range = args.offset || args.limit
        ? `（第 ${args.offset ?? 1}-${(args.offset as number ?? 0) + (args.limit as number ?? 200)} 行）`
        : "";
      return step.status === "executing" ? `读取 ${p}${range}…` : `读取了 ${p}${range}`;
    }
    case "file_write": {
      const p = (args.path as string) ?? "";
      return step.status === "executing" ? `写入 ${p}…` : `写入了 ${p}`;
    }
    case "shell_exec": {
      const cmd = (args.command as string) ?? "";
      const short = cmd.length > 60 ? cmd.slice(0, 57) + "…" : cmd;
      if (step.status === "executing") return `执行 ${short}…`;
      const code = step.toolResult && typeof step.toolResult === "object" && "exitCode" in (step.toolResult as any)
        ? (step.toolResult as any).exitCode
        : null;
      const dur = step.endedAt && step.startedAt
        ? ((step.endedAt - step.startedAt) / 1000).toFixed(1) + "s"
        : "";
      return code === 0
        ? `${short}（退出码 0${dur ? `，${dur}` : ""}）`
        : step.toolError
          ? `${short} 失败`
          : `执行了 ${short}${dur ? `（${dur}）` : ""}`;
    }
    case "web_fetch": {
      const url = (args.url as string) ?? "";
      const short = url.length > 50 ? url.slice(0, 47) + "…" : url;
      return step.status === "executing" ? `获取 ${short}…` : `获取了 ${short}`;
    }
    case "memory_search":
      return step.status === "executing" ? "检索记忆…" : "检索了相关记忆";
    default: {
      // MCP or unknown tools
      const argKeys = Object.keys(args);
      const argSummary = argKeys.length > 0 ? `(${argKeys.join(", ")})` : "";
      return step.status === "executing" ? `调用 ${name}${argSummary}…` : `调用了 ${name}${argSummary}`;
    }
  }
}

function getDuration(step: AgentStep): string | null {
  if (!step.endedAt || !step.startedAt) return null;
  const ms = step.endedAt - step.startedAt;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const STATUS_COLORS: Record<string, string> = {
  executing: "bg-status-exec",
  success: "bg-status-ok",
  error: "bg-status-err",
  cancelled: "bg-status-cancel",
};

const BAR_COLORS: Record<string, string> = {
  executing: "bg-status-exec",
  success: "bg-status-ok",
  error: "bg-status-err",
  cancelled: "bg-status-cancel",
};

export function StepCard({ step }: Props) {
  // Error steps default to expanded
  const [expanded, setExpanded] = useState(step.status === "error");

  const summary = getStepSummary(step);
  const duration = getDuration(step);
  const barColor = step.kind === "thinking" && step.status === "executing"
    ? "bg-status-think"
    : (BAR_COLORS[step.status] ?? "bg-status-cancel");

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="overflow-hidden rounded-lg border border-step-border bg-step-card"
    >
      {/* Summary row */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-step-hover"
      >
        {/* Left color bar */}
        <div className={`h-5 w-[3px] flex-shrink-0 rounded-full ${barColor} ${
          step.status === "executing" ? "animate-pulse" : ""
        }`} />

        {/* Status icon */}
        {step.status === "executing" ? (
          <svg className="h-4 w-4 flex-shrink-0 animate-spin text-status-exec" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : step.status === "success" ? (
          <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-status-ok" />
        ) : step.status === "error" ? (
          <XCircleIcon className="h-4 w-4 flex-shrink-0 text-status-err" />
        ) : (
          <div className="h-4 w-4 flex-shrink-0 rounded-full bg-status-cancel opacity-50" />
        )}

        {/* Summary text */}
        <span className="flex-1 truncate text-[13px] text-text-secondary">{summary}</span>

        {/* Duration */}
        {duration && (
          <span className="flex-shrink-0 text-[11px] text-text-muted">{duration}</span>
        )}

        {/* Expand arrow */}
        <ChevronRightIcon
          className={`h-4 w-4 flex-shrink-0 text-text-muted transition-transform duration-150 ${
            expanded ? "rotate-90" : ""
          }`}
        />
      </button>

      {/* Expandable content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden border-t border-step-border"
          >
            {step.kind === "thinking" ? (
              <ThinkingContent step={step} />
            ) : step.toolName === "file_read" ? (
              <FileReadContent step={step} />
            ) : step.toolName === "file_write" ? (
              <FileWriteContent step={step} />
            ) : step.toolName === "shell_exec" ? (
              <ShellExecContent step={step} />
            ) : step.toolName === "web_fetch" ? (
              <WebFetchContent step={step} />
            ) : (
              <GenericToolContent step={step} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
