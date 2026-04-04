import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { Settings } from "../shared/contracts.js";

const SETTINGS_FILE = "settings.json";

const DEFAULT_SETTINGS: Settings = {
  defaultModel: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
  },
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

function mergeSettings(source?: Partial<Settings> | null): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...source,
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
