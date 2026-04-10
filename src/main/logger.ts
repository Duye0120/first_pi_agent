import { app, shell, type BrowserWindow } from "electron";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { getHarnessAuditLogPath } from "./harness/audit.js";
import type { DiagnosticLogBundle, DiagnosticLogSnapshot } from "../shared/contracts.js";

export type AppLogLevel = "debug" | "info" | "warn" | "error";

type SerializedError = {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
};

type AppLogEntry = {
  timestamp: string;
  level: AppLogLevel;
  scope: string;
  message: string;
  pid: number;
  data?: unknown;
  error?: SerializedError;
};

type AppLogInput = {
  scope: string;
  message: string;
  data?: unknown;
  error?: unknown;
};

const REDACT_KEYS = [
  "apikey",
  "api_key",
  "authorization",
  "token",
  "password",
  "secret",
  "credential",
];

let processLoggingRegistered = false;

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function getLogDirPath(): string {
  try {
    return join(app.getPath("userData"), "logs");
  } catch {
    return join(process.cwd(), ".pi-logs");
  }
}

export function getAppLogPath(): string {
  return join(getLogDirPath(), "app.log");
}

function buildTail(content: string, maxLines: number): { tail: string; lineCount: number } {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const meaningfulLines =
    lines.length > 0 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
  const tailLines = meaningfulLines.slice(-maxLines);
  return {
    tail: tailLines.join("\n"),
    lineCount: tailLines.length,
  };
}

function buildLogSnapshot(
  input: { id: DiagnosticLogSnapshot["id"]; label: string; path: string },
  maxLines: number,
): DiagnosticLogSnapshot {
  if (!existsSync(input.path)) {
    return {
      id: input.id,
      label: input.label,
      path: input.path,
      exists: false,
      sizeBytes: 0,
      updatedAt: null,
      tail: "",
      lineCount: 0,
    };
  }

  const stat = statSync(input.path);
  const content = readFileSync(input.path, "utf-8");
  const { tail, lineCount } = buildTail(content, maxLines);

  return {
    id: input.id,
    label: input.label,
    path: input.path,
    exists: true,
    sizeBytes: stat.size,
    updatedAt: stat.mtime.toISOString(),
    tail,
    lineCount,
  };
}

export function getDiagnosticLogSnapshot(maxLines = 120): DiagnosticLogBundle {
  return {
    generatedAt: new Date().toISOString(),
    files: [
      buildLogSnapshot(
        { id: "app", label: "应用日志", path: getAppLogPath() },
        maxLines,
      ),
      buildLogSnapshot(
        { id: "audit", label: "审计日志", path: getHarnessAuditLogPath() },
        maxLines,
      ),
    ],
  };
}

export async function openDiagnosticLogFolder(
  logId: DiagnosticLogSnapshot["id"],
): Promise<void> {
  const filePath =
    logId === "audit"
      ? getHarnessAuditLogPath()
      : getAppLogPath();

  if (existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return;
  }

  const result = await shell.openPath(dirname(filePath));
  if (result) {
    throw new Error(result);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function shouldRedact(key: string): boolean {
  const normalized = key.replace(/[^a-z_]/gi, "").toLowerCase();
  return REDACT_KEYS.some((candidate) => normalized.includes(candidate));
}

function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return "[truncated]";
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return value.length <= 500 ? value : value.slice(0, 500) + "…";
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "function") {
    return `[function ${value.name || "anonymous"}]`;
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeForLog(item, depth + 1));
  }

  if (!isPlainObject(value)) {
    return String(value);
  }

  const next: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    next[key] = shouldRedact(key)
      ? "[redacted]"
      : sanitizeForLog(nested, depth + 1);
  }
  return next;
}

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    const serialized: SerializedError = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    const withCause = error as Error & { cause?: unknown };
    if (withCause.cause !== undefined) {
      serialized.cause = sanitizeForLog(withCause.cause);
    }

    return serialized;
  }

  return {
    name: "NonError",
    message: typeof error === "string" ? error : JSON.stringify(sanitizeForLog(error)),
  };
}

function writeLog(level: AppLogLevel, input: AppLogInput): void {
  const filePath = getAppLogPath();
  ensureDir(dirname(filePath));

  const entry: AppLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    scope: input.scope,
    message: input.message,
    pid: process.pid,
    data: input.data === undefined ? undefined : sanitizeForLog(input.data),
    error: input.error === undefined ? undefined : serializeError(input.error),
  };

  appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf-8");
}

export const appLogger = {
  debug(input: AppLogInput): void {
    writeLog("debug", input);
  },
  info(input: AppLogInput): void {
    writeLog("info", input);
  },
  warn(input: AppLogInput): void {
    writeLog("warn", input);
  },
  error(input: AppLogInput): void {
    writeLog("error", input);
  },
};

export function summarizeIpcArgs(args: unknown[]): unknown {
  return args.slice(0, 6).map((arg) => {
    if (typeof arg === "string") {
      return arg.length <= 180 ? arg : arg.slice(0, 180) + "…";
    }

    if (Array.isArray(arg)) {
      return { type: "array", length: arg.length };
    }

    if (!isPlainObject(arg)) {
      return sanitizeForLog(arg);
    }

    const result: Record<string, unknown> = {};
    for (const key of [
      "sessionId",
      "runId",
      "id",
      "name",
      "path",
      "title",
      "modelEntryId",
      "groupId",
      "branchName",
    ]) {
      if (key in arg) {
        result[key] = sanitizeForLog(arg[key]);
      }
    }

    if ("text" in arg && typeof arg.text === "string") {
      result.textLength = arg.text.length;
    }
    if ("attachments" in arg && Array.isArray(arg.attachments)) {
      result.attachmentCount = arg.attachments.length;
    }
    if ("cwd" in arg && typeof arg.cwd === "string") {
      result.cwd = arg.cwd;
    }

    return Object.keys(result).length > 0 ? result : sanitizeForLog(arg);
  });
}

export function registerProcessLogging(): void {
  if (processLoggingRegistered) {
    return;
  }

  processLoggingRegistered = true;

  process.on("uncaughtException", (error) => {
    appLogger.error({
      scope: "process",
      message: "未捕获异常",
      error,
    });
  });

  process.on("unhandledRejection", (reason) => {
    appLogger.error({
      scope: "process",
      message: "未处理 Promise 拒绝",
      error: reason,
    });
  });
}

export function attachWindowLogging(window: BrowserWindow): void {
  window.webContents.on(
    "console-message",
    (_event, level, message, line, sourceId) => {
      if (level < 2) {
        return;
      }

      const log = level >= 3 ? appLogger.error : appLogger.warn;
      log({
        scope: "renderer.console",
        message,
        data: {
          level,
          line,
          sourceId,
        },
      });
    },
  );

  window.webContents.on(
    "render-process-gone",
    (_event, details) => {
      appLogger.error({
        scope: "renderer.lifecycle",
        message: "Renderer 进程退出",
        data: details,
      });
    },
  );

  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      appLogger.error({
        scope: "renderer.lifecycle",
        message: "页面加载失败",
        data: {
          errorCode,
          errorDescription,
          validatedURL,
          isMainFrame,
        },
      });
    },
  );

  window.on("unresponsive", () => {
    appLogger.warn({
      scope: "renderer.lifecycle",
      message: "主窗口无响应",
    });
  });
}
