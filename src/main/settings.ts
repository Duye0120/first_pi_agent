import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { Settings } from "../shared/contracts.js";
import { DEFAULT_MODEL_ENTRY_ID } from "../shared/provider-directory.js";

const SETTINGS_FILE = "settings.json";

const DEFAULT_SETTINGS: Settings = {
  defaultModelId: DEFAULT_MODEL_ENTRY_ID,
  thinkingLevel: "off",
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
  workspace: process.cwd(),
};

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
    defaultModelId,
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
