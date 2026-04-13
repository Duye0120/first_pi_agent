import { randomUUID } from "node:crypto";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { loadTranscript } from "../session/transcript.js";

const MAX_HISTORY_ENTRIES = 200;

export type ShellCommandHistoryEntry = {
  id: string;
  sessionId: string;
  command: string;
  cwd: string;
  exitCode: number;
  durationMs: number;
  createdAt: string;
};

const commandHistoryParameters = Type.Object({
  limit: Type.Optional(Type.Number({ description: "返回最近命令数量，默认 20，上限 100" })),
  query: Type.Optional(Type.String({ description: "按命令内容过滤" })),
  failedOnly: Type.Optional(Type.Boolean({ description: "只返回失败命令" })),
});

type CommandHistoryDetails = {
  count: number;
  entries: ShellCommandHistoryEntry[];
};

const commandHistory: ShellCommandHistoryEntry[] = [];

const SENSITIVE_COMMAND_PATTERNS: Array<[RegExp, string]> = [
  [/(api[_-]?key|token|secret|password|passwd|pwd)=("[^"]*"|'[^']*'|[^\s]+)/gi, "$1=[redacted]"],
  [/--(api[_-]?key|token|secret|password|passwd|pwd)(=|\s+)("[^"]*"|'[^']*'|[^\s]+)/gi, "--$1$2[redacted]"],
  [/(bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, "$1[redacted]"],
  [/(sk-[A-Za-z0-9_-]{8})[A-Za-z0-9_-]+/g, "$1[redacted]"],
];

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function redactSensitiveCommand(command: string): string {
  return SENSITIVE_COMMAND_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    command,
  );
}

function getShellResultDetails(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== "object" || !("details" in result)) {
    return {};
  }

  const details = (result as { details?: unknown }).details;
  return details && typeof details === "object"
    ? (details as Record<string, unknown>)
    : {};
}

function loadTranscriptCommandHistory(sessionId: string): ShellCommandHistoryEntry[] {
  const started = new Map<string, {
    command: string;
    cwd: string;
    createdAt: string;
  }>();
  const entries: ShellCommandHistoryEntry[] = [];

  for (const event of loadTranscript(sessionId)) {
    if (event.type === "tool_started" && event.toolName === "shell_exec") {
      const command = getString(event.args.command);
      if (command) {
        started.set(event.stepId, {
          command,
          cwd: getString(event.args.cwd) ?? "",
          createdAt: event.timestamp,
        });
      }
      continue;
    }

    if (event.type === "tool_finished" && event.toolName === "shell_exec") {
      const firstSeen = started.get(event.stepId);
      const details = getShellResultDetails(event.result);
      const command = getString(details.command) ?? firstSeen?.command;

      if (!command) {
        continue;
      }

      entries.push({
        id: `cmd-${event.stepId}`,
        sessionId,
        command,
        cwd: getString(details.cwd) ?? firstSeen?.cwd ?? "",
        exitCode: getNumber(details.exitCode) ?? (event.error ? -1 : 0),
        durationMs: getNumber(details.durationMs) ?? 0,
        createdAt: event.timestamp,
      });
    }
  }

  return entries.reverse();
}

function entryKey(entry: ShellCommandHistoryEntry): string {
  return [
    entry.sessionId,
    entry.command,
    entry.cwd,
    entry.exitCode,
    Math.round(entry.durationMs / 100),
  ].join("\u0000");
}

function listCommandHistory(sessionId: string): ShellCommandHistoryEntry[] {
  const seen = new Set<string>();
  const entries: ShellCommandHistoryEntry[] = [];

  for (const entry of [
    ...commandHistory.filter((item) => item.sessionId === sessionId),
    ...loadTranscriptCommandHistory(sessionId),
  ]) {
    const key = entryKey(entry);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    entries.push(entry);
  }

  return entries.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export function recordShellCommand(
  entry: Omit<ShellCommandHistoryEntry, "id" | "createdAt">,
): void {
  commandHistory.unshift({
    ...entry,
    id: `cmd-${randomUUID()}`,
    createdAt: new Date().toISOString(),
  });

  if (commandHistory.length > MAX_HISTORY_ENTRIES) {
    commandHistory.splice(MAX_HISTORY_ENTRIES);
  }
}

export function createCommandHistoryTool(
  sessionId: string,
): AgentTool<typeof commandHistoryParameters, CommandHistoryDetails> {
  return {
    name: "command_history",
    label: "命令历史",
    description: "读取当前线程最近通过 shell_exec 执行过的命令、退出码和耗时。",
    parameters: commandHistoryParameters,
    async execute(_toolCallId, params) {
      const limit = Math.max(1, Math.min(params.limit ?? 20, 100));
      const query = params.query?.replace(/\s+/g, " ").trim().toLowerCase();
      const entries = listCommandHistory(sessionId)
        .filter((entry) => {
          if (params.failedOnly && entry.exitCode === 0) {
            return false;
          }

          if (!query) {
            return true;
          }

          return entry.command.toLowerCase().includes(query);
        })
        .slice(0, limit)
        .map((entry) => ({
          ...entry,
          command: redactSensitiveCommand(entry.command),
        }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            entries,
            count: entries.length,
          }, null, 2),
        }],
        details: {
          count: entries.length,
          entries,
        },
      };
    },
  };
}
