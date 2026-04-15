import { formatTimeInZone } from "@shared/timezone";
import type { Settings, ThinkingLevel } from "@shared/contracts";
import { THINKING_LEVEL_OPTIONS } from "@renderer/lib/thinking-levels";
import type { SettingsSection } from "./types";

export const SETTINGS_SECTIONS: {
  id: SettingsSection;
  label: string;
  description: string;
}[] = [
  {
    id: "general",
    label: "通用",
    description: "配置应用的默认行为、内置代理模型与通用设定。"
  },
  {
    id: "ai_model",
    label: "模型",
    description: "配置提供商鉴权、Base URL与模型目录配置。"
  },
  {
    id: "workspace",
    label: "工作区",
    description: "设置默认工作目录，顺手看规则文件状态。"
  },
  {
    id: "interface",
    label: "界面与终端",
    description: "应用视觉偏好、代码字号以及终端默认表现。"
  },
  {
    id: "system",
    label: "数据与系统",
    description: "归档对谈管理、应用日志追踪与程序信息。"
  }
] as const;

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
