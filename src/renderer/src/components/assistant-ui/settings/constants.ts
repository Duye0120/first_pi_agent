import type {
  AvailableModel,
  ModelSelection,
  Settings,
  ThinkingLevel,
} from "@shared/contracts";
import type { SettingsSection } from "./types";

export const SETTINGS_SECTIONS: {
  id: SettingsSection;
  label: string;
  description: string;
}[] = [
  { id: "general", label: "常规", description: "默认模型、思考强度等基础行为设置。" },
  { id: "keys", label: "API Keys", description: "管理各模型提供商的密钥。" },
  { id: "appearance", label: "外观", description: "主题、字号和代码字体。" },
  { id: "terminal", label: "终端", description: "Shell、终端字体和滚动历史。" },
  { id: "workspace", label: "工作区", description: "查看当前工作目录和 Soul 文件状态。" },
  { id: "archived", label: "已归档", description: "统一查看、恢复或删除已归档线程。" },
  { id: "about", label: "关于", description: "应用信息与当前技术栈。" },
] as const;

export const PROVIDERS = [
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { id: "openai", label: "OpenAI", placeholder: "sk-..." },
  { id: "google", label: "Google", placeholder: "AIza..." },
] as const;

export const THINKING_LEVELS: { value: ThinkingLevel; label: string }[] = [
  { value: "off", label: "关闭" },
  { value: "minimal", label: "极低" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "xhigh", label: "极高" },
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

export function getModelValue(model: ModelSelection | AvailableModel) {
  return `${model.provider}/${model.model}`;
}

export function fallbackModelLabel(model: ModelSelection): string {
  return (model.model.split("/").pop() ?? model.model)
    .replace(/-\d{8}$/, "")
    .replace("claude-", "Claude ")
    .replace("gpt-", "GPT-")
    .replace("sonnet", "Sonnet")
    .replace("opus", "Opus")
    .replace("haiku", "Haiku");
}

export function parseNumericInput(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function formatArchivedTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
