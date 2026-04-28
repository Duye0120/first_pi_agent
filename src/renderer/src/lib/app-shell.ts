import type { Settings } from "@shared/contracts";
import {
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "@renderer/components/assistant-ui/settings-view";

export const ACTIVE_SESSION_STORAGE_KEY = "chela.active-session-id";
export const LEGACY_ACTIVE_SESSION_STORAGE_KEY = "first-pi-agent.active-session-id";
export const SIDEBAR_WIDTH_STORAGE_KEY = "chela.sidebar-width";
export const LEGACY_SIDEBAR_WIDTH_STORAGE_KEY = "first-pi-agent.sidebar-width";
export const SIDEBAR_COLLAPSED_STORAGE_KEY = "chela.sidebar-collapsed";
export const DEFAULT_SIDEBAR_SIZE = 18;
export const MIN_SIDEBAR_WIDTH = 220;
export const MIN_RIGHT_PANEL_WIDTH = 480;
export const MAX_RIGHT_PANEL_WIDTH = 920;
export const MIN_THREAD_CONTENT_WIDTH = 320;
export const RIGHT_PANEL_GAP_PX = 8;
export const ROOT_UI_THEME_DATASET = "theme";
export const SETTINGS_ROUTE_PREFIX = "/settings";

const MIN_SIDEBAR_SIZE = 4;
export const MAX_SIDEBAR_SIZE = 85;
const SETTINGS_SECTION_IDS = SETTINGS_SECTIONS.map((section) => section.id);

export type DeepPartialSettings = {
  modelRouting?: {
    chat?: Partial<Settings["modelRouting"]["chat"]>;
    utility?: Partial<Settings["modelRouting"]["utility"]>;
    subagent?: Partial<Settings["modelRouting"]["subagent"]>;
    compact?: Partial<Settings["modelRouting"]["compact"]>;
  };
  defaultModelId?: Settings["defaultModelId"];
  workerModelId?: Settings["workerModelId"];
  thinkingLevel?: Settings["thinkingLevel"];
  timeZone?: Settings["timeZone"];
  theme?: Settings["theme"];
  customTheme?: Settings["customTheme"];
  terminal?: Partial<Settings["terminal"]>;
  ui?: Partial<Settings["ui"]>;
  network?: {
    proxy?: Partial<Settings["network"]["proxy"]>;
    timeoutMs?: Settings["network"]["timeoutMs"];
  };
  memory?: Partial<Settings["memory"]>;
  workspace?: Settings["workspace"];
};

export function resolveSettingsSectionFromPath(pathname: string): SettingsSection | null {
  if (!pathname.startsWith(SETTINGS_ROUTE_PREFIX)) {
    return null;
  }

  const section = pathname
    .slice(SETTINGS_ROUTE_PREFIX.length)
    .replace(/^\/+/, "");

  if (!section) {
    return "general";
  }

  return SETTINGS_SECTION_IDS.includes(section as SettingsSection)
    ? (section as SettingsSection)
    : "general";
}

export function clampSidebarSize(size: number) {
  return Math.min(MAX_SIDEBAR_SIZE, Math.max(MIN_SIDEBAR_SIZE, size));
}

export function clampRightPanelWidth(size: number, containerWidth: number) {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return Math.min(MAX_RIGHT_PANEL_WIDTH, Math.max(MIN_RIGHT_PANEL_WIDTH, size));
  }

  const maxWidth = Math.max(
    MIN_RIGHT_PANEL_WIDTH,
    Math.min(MAX_RIGHT_PANEL_WIDTH, containerWidth - MIN_THREAD_CONTENT_WIDTH),
  );

  return Math.min(maxWidth, Math.max(MIN_RIGHT_PANEL_WIDTH, size));
}

export function getDefaultRightPanelWidth(containerWidth: number) {
  return clampRightPanelWidth(Math.round(containerWidth * 0.44), containerWidth);
}

export function toSidebarPercentageSize(size: number) {
  return `${clampSidebarSize(size)}%`;
}

export function migrateLegacySidebarWidth(storedWidth: number) {
  if (storedWidth <= 100) {
    return clampSidebarSize(storedWidth);
  }

  if (typeof window === "undefined" || window.innerWidth <= 0) {
    return DEFAULT_SIDEBAR_SIZE;
  }

  return clampSidebarSize((storedWidth / window.innerWidth) * 100);
}

export function readStoredNumber(keys: string[]) {
  if (typeof window === "undefined") {
    return null;
  }

  for (const key of keys) {
    const value = Number(localStorage.getItem(key));
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

export function readStoredString(keys: string[]) {
  if (typeof window === "undefined") {
    return null;
  }

  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (value) {
      return value;
    }
  }

  return null;
}

export function clearStoredStrings(keys: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  for (const key of keys) {
    localStorage.removeItem(key);
  }
}

export function getProjectNameFromPath(projectPath: string) {
  return projectPath.split(/[\\/]/).filter(Boolean).at(-1) ?? projectPath;
}

export function applyCustomThemeVariables(
  root: HTMLElement,
  previousKeys: string[],
  nextTheme: Settings["customTheme"],
) {
  previousKeys.forEach((key) => root.style.removeProperty(key));

  const appliedKeys: string[] = [];
  if (!nextTheme) {
    return appliedKeys;
  }

  Object.entries(nextTheme).forEach(([rawKey, value]) => {
    const key = rawKey.startsWith("--") ? rawKey : `--${rawKey}`;
    root.style.setProperty(key, value ?? null);
    appliedKeys.push(key);
  });

  return appliedKeys;
}

export function mergeSettingsState(
  current: Settings,
  partial: DeepPartialSettings,
): Settings {
  return {
    ...current,
    ...partial,
    modelRouting: {
      ...current.modelRouting,
      ...partial.modelRouting,
      chat: {
        ...current.modelRouting.chat,
        ...partial.modelRouting?.chat,
      },
      utility: {
        ...current.modelRouting.utility,
        ...partial.modelRouting?.utility,
      },
      subagent: {
        ...current.modelRouting.subagent,
        ...partial.modelRouting?.subagent,
      },
      compact: {
        ...current.modelRouting.compact,
        ...partial.modelRouting?.compact,
      },
    },
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
  };
}
