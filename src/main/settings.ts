import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type {
  ModelRoutingSettings,
  Settings,
  ThinkingLevel,
} from "../shared/contracts.js";
import {
  DEFAULT_MEMORY_EMBEDDING_MODEL_ID,
  DEFAULT_MEMORY_SEARCH_CANDIDATE_LIMIT,
} from "../shared/memory.js";
import { DEFAULT_MODEL_ENTRY_ID } from "../shared/provider-directory.js";
import { normalizeTimeZoneSetting, SYSTEM_TIME_ZONE } from "../shared/timezone.js";
import { appLogger } from "./logger.js";
import { applyGlobalNetworkSettings } from "./network/proxy.js";
import { findExecutableOnPath } from "./shell.js";

const SETTINGS_FILE = "settings.json";
const BUILTIN_TERMINAL_SHELLS = new Set([
  "default",
  "powershell",
  "cmd",
  "git-bash",
  "wsl",
]);
const ALLOWED_CUSTOM_THEME_KEYS = new Set([
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--border",
  "--input",
  "--ring",
]);
const ALLOWED_CUSTOM_THEME_PREFIXES = [
  "--chela-",
  "--color-",
  "--terminal-ansi-",
  "--radius-",
  "--shadow-",
  "--motion-",
] as const;
const MAX_CUSTOM_THEME_ENTRIES = 160;
const MAX_CUSTOM_THEME_VALUE_LENGTH = 256;

function getDefaultWorkspacePath(): string {
  try {
    const documentsPath = app.getPath("documents");
    if (documentsPath) {
      return documentsPath;
    }
  } catch {
    // ignore
  }

  try {
    const homePath = app.getPath("home");
    if (homePath) {
      return homePath;
    }
  } catch {
    // ignore
  }

  return process.cwd();
}

function createDefaultModelRouting(): ModelRoutingSettings {
  return {
    chat: {
      modelId: DEFAULT_MODEL_ENTRY_ID,
    },
    utility: {
      modelId: null,
    },
    subagent: {
      modelId: null,
    },
    compact: {
      modelId: null,
    },
  };
}

function createDefaultNetworkSettings(): Settings["network"] {
  return {
    proxy: {
      enabled: false,
      url: "",
      noProxy: "localhost,127.0.0.1",
    },
    timeoutMs: 30_000,
  };
}

function createDefaultMemorySettings(): Settings["memory"] {
  return {
    enabled: true,
    autoRetrieve: true,
    queryRewrite: true,
    searchCandidateLimit: DEFAULT_MEMORY_SEARCH_CANDIDATE_LIMIT,
    similarityThreshold: 65,
    autoSummarize: true,
    toolModelId: null,
    embeddingModelId: DEFAULT_MEMORY_EMBEDDING_MODEL_ID,
    embeddingProviderId: null,
  };
}

const DEFAULT_SETTINGS: Settings = {
  modelRouting: createDefaultModelRouting(),
  defaultModelId: DEFAULT_MODEL_ENTRY_ID,
  workerModelId: null,
  thinkingLevel: "off",
  timeZone: SYSTEM_TIME_ZONE,
  theme: "light",
  customTheme: null,
  terminal: {
    shell: "default",
    fontSize: 13,
    fontFamily: "JetBrains Mono",
    scrollback: 5000,
  },
  ui: {
    fontFamily:
      '"Segoe UI Variable", "PingFang SC", "Microsoft YaHei UI", sans-serif',
    fontSize: 13,
    codeFontSize: 13,
    codeFontFamily: "JetBrains Mono",
  },
  network: createDefaultNetworkSettings(),
  memory: createDefaultMemorySettings(),
  workspace: getDefaultWorkspacePath(),
};

function normalizeThinkingLevel(value: unknown): ThinkingLevel {
  switch (value) {
    case "off":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return value;
    case "minimal":
      return "low";
    default:
      return DEFAULT_SETTINGS.thinkingLevel;
  }
}

function resolveLegacyDefaultModelId(
  legacy: unknown,
): string | undefined {
  if (!legacy || typeof legacy !== "object") {
    return undefined;
  }

  const candidate = legacy as {
    provider?: string;
    model?: string;
  };

  if (
    candidate.provider === "anthropic" ||
    candidate.provider === "openai" ||
    candidate.provider === "google"
  ) {
    if (typeof candidate.model === "string" && candidate.model.trim()) {
      return `builtin:${candidate.provider}:${candidate.model.trim()}`;
    }
  }

  return undefined;
}

function normalizeOptionalModelId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeChatModelId(value: unknown): string {
  return normalizeOptionalModelId(value) ?? DEFAULT_MODEL_ENTRY_ID;
}

function normalizeModelRouting(
  source: Partial<ModelRoutingSettings> | null | undefined,
  legacyDefaultModelId: string,
  legacyWorkerModelId: string | null,
): ModelRoutingSettings {
  return {
    chat: {
      modelId: normalizeChatModelId(
        source?.chat?.modelId ?? legacyDefaultModelId,
      ),
    },
    utility: {
      modelId: normalizeOptionalModelId(
        source?.utility?.modelId ?? legacyWorkerModelId,
      ),
    },
    subagent: {
      modelId: normalizeOptionalModelId(source?.subagent?.modelId),
    },
    compact: {
      modelId: normalizeOptionalModelId(source?.compact?.modelId),
    },
  };
}

function mergeModelRouting(
  current: ModelRoutingSettings,
  partial?: Partial<ModelRoutingSettings>,
): ModelRoutingSettings {
  if (!partial) {
    return current;
  }

  return {
    chat: {
      ...current.chat,
      ...partial.chat,
    },
    utility: {
      ...current.utility,
      ...partial.utility,
    },
    subagent: {
      ...current.subagent,
      ...partial.subagent,
    },
    compact: {
      ...current.compact,
      ...partial.compact,
    },
  };
}

function normalizeTimeoutMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.network.timeoutMs;
  }

  return Math.min(120_000, Math.max(1_000, Math.round(value)));
}

function normalizeProxySettings(
  source: Partial<Settings["network"]["proxy"]> | null | undefined,
): Settings["network"]["proxy"] {
  return {
    enabled: source?.enabled === true,
    url:
      typeof source?.url === "string"
        ? source.url.trim()
        : DEFAULT_SETTINGS.network.proxy.url,
    noProxy:
      typeof source?.noProxy === "string"
        ? source.noProxy.trim()
        : DEFAULT_SETTINGS.network.proxy.noProxy,
  };
}

function normalizeNetworkSettings(
  source: Partial<Settings["network"]> | null | undefined,
): Settings["network"] {
  return {
    proxy: normalizeProxySettings(source?.proxy),
    timeoutMs: normalizeTimeoutMs(source?.timeoutMs),
  };
}

function normalizeMemorySettings(
  source: Partial<Settings["memory"]> | null | undefined,
): Settings["memory"] {
  const searchCandidateLimit = Number(source?.searchCandidateLimit);
  const similarityThreshold = Number(source?.similarityThreshold);

  return {
    enabled: source?.enabled !== false,
    autoRetrieve: source?.autoRetrieve !== false,
    queryRewrite: source?.queryRewrite !== false,
    searchCandidateLimit: Number.isFinite(searchCandidateLimit)
      ? Math.min(500, Math.max(1, Math.round(searchCandidateLimit)))
      : DEFAULT_SETTINGS.memory.searchCandidateLimit,
    similarityThreshold: Number.isFinite(similarityThreshold)
      ? Math.min(100, Math.max(0, Math.round(similarityThreshold)))
      : DEFAULT_SETTINGS.memory.similarityThreshold,
    autoSummarize: source?.autoSummarize !== false,
    toolModelId: normalizeOptionalModelId(source?.toolModelId),
    embeddingModelId:
      typeof source?.embeddingModelId === "string" && source.embeddingModelId.trim()
        ? source.embeddingModelId.trim()
        : DEFAULT_SETTINGS.memory.embeddingModelId,
    embeddingProviderId:
      typeof source?.embeddingProviderId === "string" &&
        source.embeddingProviderId.trim()
        ? source.embeddingProviderId.trim()
        : null,
  };
}

function isAllowedCustomThemeKey(key: string): boolean {
  return (
    ALLOWED_CUSTOM_THEME_KEYS.has(key) ||
    ALLOWED_CUSTOM_THEME_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

function normalizeCustomTheme(
  source: unknown,
): Settings["customTheme"] {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }

  const nextTheme: Record<string, string> = {};
  let acceptedCount = 0;

  for (const [rawKey, rawValue] of Object.entries(source)) {
    if (acceptedCount >= MAX_CUSTOM_THEME_ENTRIES) {
      break;
    }

    if (typeof rawValue !== "string") {
      continue;
    }

    const key = rawKey.startsWith("--") ? rawKey : `--${rawKey}`;
    if (!isAllowedCustomThemeKey(key)) {
      continue;
    }

    const value = rawValue.trim();
    if (
      !value ||
      value.length > MAX_CUSTOM_THEME_VALUE_LENGTH ||
      /[\0\r\n]/.test(value)
    ) {
      continue;
    }

    nextTheme[key] = value;
    acceptedCount += 1;
  }

  return Object.keys(nextTheme).length > 0
    ? (nextTheme as Settings["customTheme"])
    : null;
}

function normalizeTerminalShell(value: unknown): Settings["terminal"]["shell"] {
  if (typeof value !== "string") {
    return DEFAULT_SETTINGS.terminal.shell;
  }

  const trimmed = value.trim();
  if (!trimmed || /[\0\r\n]/.test(trimmed)) {
    return DEFAULT_SETTINGS.terminal.shell;
  }

  if (BUILTIN_TERMINAL_SHELLS.has(trimmed)) {
    return trimmed;
  }

  if (path.isAbsolute(trimmed)) {
    return fs.existsSync(trimmed) ? trimmed : DEFAULT_SETTINGS.terminal.shell;
  }

  if (trimmed.includes("/") || trimmed.includes("\\") || /\s/.test(trimmed)) {
    return DEFAULT_SETTINGS.terminal.shell;
  }

  return findExecutableOnPath([trimmed]) ?? DEFAULT_SETTINGS.terminal.shell;
}

function mergeSettings(source?: Partial<Settings> | null): Settings {
  const sourceWithLegacy = (source ?? {}) as Partial<Settings> & {
    defaultModel?: unknown;
    defaultModelId?: unknown;
    workerModelId?: unknown;
  };
  const legacyDefaultModelId =
    normalizeOptionalModelId(sourceWithLegacy.defaultModelId) ??
    resolveLegacyDefaultModelId(sourceWithLegacy.defaultModel) ??
    DEFAULT_MODEL_ENTRY_ID;
  const legacyWorkerModelId = normalizeOptionalModelId(
    sourceWithLegacy.workerModelId,
  );
  const modelRouting = normalizeModelRouting(
    sourceWithLegacy.modelRouting,
    legacyDefaultModelId,
    legacyWorkerModelId,
  );

  return {
    ...DEFAULT_SETTINGS,
    ...source,
    workspace:
      typeof source?.workspace === "string" && source.workspace.trim()
        ? source.workspace
        : getDefaultWorkspacePath(),
    modelRouting,
    defaultModelId: modelRouting.chat.modelId,
    workerModelId: modelRouting.utility.modelId,
    thinkingLevel: normalizeThinkingLevel(sourceWithLegacy.thinkingLevel),
    timeZone: normalizeTimeZoneSetting(sourceWithLegacy.timeZone),
    customTheme: normalizeCustomTheme(sourceWithLegacy.customTheme),
    terminal: {
      ...DEFAULT_SETTINGS.terminal,
      ...source?.terminal,
      shell: normalizeTerminalShell(source?.terminal?.shell),
    },
    ui: {
      ...DEFAULT_SETTINGS.ui,
      ...source?.ui,
    },
    network: normalizeNetworkSettings(source?.network),
    memory: normalizeMemorySettings(source?.memory),
  };
}

function getSettingsPath(): string {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

let cachedSettings: Settings | null = null;

export function getSettings(): Settings {
  if (cachedSettings) return cachedSettings;

  const filePath = getSettingsPath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<Settings>;
      cachedSettings = mergeSettings(parsed);
      return cachedSettings;
    }
  } catch {
    // Corrupt file — use defaults
  }

  cachedSettings = mergeSettings();
  return cachedSettings;
}

export function updateSettings(partial: Partial<Settings>): void {
  const current = getSettings();
  const previousNetwork = current.network;
  cachedSettings = mergeSettings({
    ...current,
    ...partial,
    modelRouting: mergeModelRouting(current.modelRouting, partial.modelRouting),
    terminal: {
      ...current.terminal,
      ...partial.terminal,
    },
    ui: {
      ...current.ui,
      ...partial.ui,
    },
    network: {
      ...current.network,
      ...partial.network,
      proxy: {
        ...current.network.proxy,
        ...partial.network?.proxy,
      },
    },
    memory: {
      ...current.memory,
      ...partial.memory,
    },
  });
  const serialized = {
    ...cachedSettings,
    defaultModelId: cachedSettings.modelRouting.chat.modelId,
    workerModelId: cachedSettings.modelRouting.utility.modelId,
  };
  const filePath = getSettingsPath();
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(serialized, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);

  try {
    // 仅当网络相关字段实际变更时才重建全局 dispatcher，避免改字体之类的设置也重置连接池。
    const nextNetwork = cachedSettings.network;
    const networkChanged =
      previousNetwork.timeoutMs !== nextNetwork.timeoutMs ||
      previousNetwork.proxy.enabled !== nextNetwork.proxy.enabled ||
      previousNetwork.proxy.url !== nextNetwork.proxy.url ||
      previousNetwork.proxy.noProxy !== nextNetwork.proxy.noProxy;
    if (!networkChanged) {
      return;
    }
    applyGlobalNetworkSettings(cachedSettings);
  } catch (error) {
    appLogger.warn({
      scope: "settings.update",
      message: "应用全局网络配置失败",
      error,
    });
  }
}
