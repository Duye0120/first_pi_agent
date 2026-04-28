import { formatTimeInZone } from "@shared/timezone";
import type { Settings, ThinkingLevel } from "@shared/contracts";
import { SETTINGS_SECTIONS } from "@shared/settings-sections";
import { THINKING_LEVEL_OPTIONS } from "@renderer/lib/thinking-levels";
import type { SettingsSection } from "./types";

export { SETTINGS_SECTIONS };

export const THINKING_LEVELS: { value: ThinkingLevel; label: string }[] = [
  ...THINKING_LEVEL_OPTIONS,
];

export const THEME_OPTIONS: { value: Settings["theme"]; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "custom", label: "自定义" },
];

export const TERMINAL_SHELL_OPTIONS = [
  { value: "default", label: "系统默认" },
  { value: "powershell", label: "PowerShell" },
  { value: "cmd", label: "Command Prompt" },
  { value: "git-bash", label: "Git Bash" },
  { value: "wsl", label: "WSL" },
] as const;

export const SECTION_META = Object.fromEntries(
  SETTINGS_SECTIONS.map((section) => [section.id, section]),
) as Record<SettingsSection, (typeof SETTINGS_SECTIONS)[number]>;

export function parseNumericInput(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function formatArchivedTime(iso: string, timeZone: string) {
  try {
    return formatTimeInZone(iso, timeZone, "zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
