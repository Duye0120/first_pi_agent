// ---------------------------------------------------------------------------
// Ambient Context — 环境感知上下文
// ---------------------------------------------------------------------------
//
// 自动收集当前环境信息（时间、Git 状态、工作目录等），
// 注入到 system prompt 中，让 Agent 感知上下文。
// ---------------------------------------------------------------------------

import { execSync } from "node:child_process";
import type { PromptSection } from "./prompt-control-plane.js";
import { appLogger } from "./logger.js";
import { getSettings } from "./settings.js";
import {
  formatDateTimeInTimeZone,
  getWeekdayLabelInTimeZone,
  resolveConfiguredTimeZone,
} from "../shared/timezone.js";

// ---------------------------------------------------------------------------
// 环境数据收集
// ---------------------------------------------------------------------------

type AmbientData = {
  localTime: string;
  timeZone: string;
  dayOfWeek: string;
  platform: string;
  workspacePath: string;
  gitBranch: string | null;
  gitDirty: boolean;
  gitLastCommit: string | null;
};
function safeExec(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, timeout: 3000, encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

export function collectAmbientData(workspacePath: string): AmbientData {
  const now = new Date();
  const timeZone = resolveConfiguredTimeZone(getSettings().timeZone);

  return {
    localTime: formatDateTimeInTimeZone(now, timeZone),
    timeZone,
    dayOfWeek: getWeekdayLabelInTimeZone(now, timeZone),
    platform: process.platform,
    workspacePath,
    gitBranch: safeExec("git rev-parse --abbrev-ref HEAD", workspacePath),
    gitDirty: safeExec("git status --porcelain", workspacePath) !== "",
    gitLastCommit: safeExec("git log -1 --oneline --no-decorate", workspacePath),
  };
}

// ---------------------------------------------------------------------------
// Prompt Section 构建
// ---------------------------------------------------------------------------

export function buildAmbientContextSection(
  workspacePath: string,
): PromptSection {
  let data: AmbientData;
  try {
    data = collectAmbientData(workspacePath);
  } catch (err) {
    appLogger.warn({
      scope: "ambient",
      message: "收集环境感知数据失败",
      error: err instanceof Error ? err : new Error(String(err)),
    });
    // 降级：只提供时间
    const now = new Date();
    const timeZone = resolveConfiguredTimeZone(getSettings().timeZone);
    data = {
      localTime: formatDateTimeInTimeZone(now, timeZone),
      timeZone,
      dayOfWeek: getWeekdayLabelInTimeZone(now, timeZone),
      platform: process.platform,
      workspacePath,
      gitBranch: null,
      gitDirty: false,
      gitLastCommit: null,
    };
  }

  const lines = [
    "## Ambient Context",
    `- 当前时间：${data.localTime}（${data.dayOfWeek}，${data.timeZone}）`,
    `- 运行平台：${data.platform}`,
    `- 工作目录：${data.workspacePath}`,
  ];

  if (data.gitBranch) {
    lines.push(`- Git 分支：${data.gitBranch}${data.gitDirty ? "（有未提交改动）" : ""}`);
  }
  if (data.gitLastCommit) {
    lines.push(`- 最近提交：${data.gitLastCommit}`);
  }

  return {
    id: "ambient-context",
    layer: "runtime",
    role: "fact",
    authority: "soft",
    priority: 45,
    cacheScope: "turn", // 每次都刷新
    trimPriority: 10,   // 接近上限时优先丢弃
    writableBack: false,
    content: lines.join("\n"),
  };
}
