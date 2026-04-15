import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { Settings, ThinkingLevel } from "../shared/contracts.js";
import { DEFAULT_MODEL_ENTRY_ID } from "../shared/provider-directory.js";
import { normalizeTimeZoneSetting, SYSTEM_TIME_ZONE } from "../shared/timezone.js";

const SETTINGS_FILE = "settings.json";

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

const DEFAULT_SETTINGS: Settings = {
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

function mergeSettings(source?: Partial<Settings> | null): Settings {
  const sourceWithLegacy = (source ?? {}) as Partial<Settings> & {
    defaultModel?: unknown;
  };
  const defaultModelId =
    sourceWithLegacy.defaultModelId ??
    resolveLegacyDefaultModelId(sourceWithLegacy.defaultModel) ??
    DEFAULT_SETTINGS.defaultModelId;

  return {
    ...DEFAULT_SETTINGS,
    ...source,
    workspace:
      typeof source?.workspace === "string" && source.workspace.trim()
        ? source.workspace
        : getDefaultWorkspacePath(),
    defaultModelId,
    workerModelId:
      typeof source?.workerModelId === "string" && source.workerModelId.trim()
        ? source.workerModelId.trim()
        : null,
    thinkingLevel: normalizeThinkingLevel(sourceWithLegacy.thinkingLevel),
    timeZone: normalizeTimeZoneSetting(sourceWithLegacy.timeZone),
    terminal: {
      ...DEFAULT_SETTINGS.terminal,
      ...source?.terminal,
    },
    ui: {
      ...DEFAULT_SETTINGS.ui,
      ...source?.ui,
    },
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
  cachedSettings = mergeSettings({
    ...current,
    ...partial,
    terminal: {
      ...current.terminal,
      ...partial.terminal,
    },
    ui: {
      ...current.ui,
      ...partial.ui,
    },
  });
  const filePath = getSettingsPath();
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(cachedSettings, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}
