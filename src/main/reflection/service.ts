// ---------------------------------------------------------------------------
// Reflection Service — 每日反思与日记生成
// ---------------------------------------------------------------------------
//
// 定时（凌晨 2 点或手动触发）收集今天的对话，生成反思报告，
// 将可学习内容写入 semantic memory，并把性格漂移候选交给 personality-drift。
// ---------------------------------------------------------------------------

import { app } from "electron";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { bus } from "../event-bus.js";
import { appLogger } from "../logger.js";
import { scheduler } from "../scheduler.js";
import { listSessions, loadSession } from "../session/facade.js";
import { getMemdirStore } from "../memory/service.js";
import { processPersonalityDrift, buildPersonalityDriftPromptText } from "./personality-drift.js";
import { getSettings } from "../settings.js";
import { getDateKeyInTimeZone, resolveConfiguredTimeZone } from "../../shared/timezone.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReflectionReport {
  date: string;
  userMoodSummary: string;
  whatWorked: string[];
  whatDidnt: string[];
  patterns: string[];
  tomorrowSuggestions: string[];
  actionableInsights: string[];
  personalityDrift: string[];
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DAILY_REFLECTION_TIME = "02:00"; // 凌晨 2 点

// ---------------------------------------------------------------------------
// 收集今天的对话
// ---------------------------------------------------------------------------

function getTodaySessions(): { sessionId: string; title: string; messageCount: number; messages: string[] }[] {
  const timeZone = resolveConfiguredTimeZone(getSettings().timeZone);
  const todayStr = getDateKeyInTimeZone(new Date(), timeZone);

  const summaries = listSessions();
  const result: { sessionId: string; title: string; messageCount: number; messages: string[] }[] = [];

  for (const summary of summaries) {
    // 按 updatedAt 过滤今天的 session
    if (getDateKeyInTimeZone(summary.updatedAt, timeZone) !== todayStr) continue;

    const session = loadSession(summary.id);
    if (!session || session.messages.length === 0) continue;

    // 提取消息摘要（只取 user/assistant 文本，截断长消息）
    const msgs: string[] = [];
    for (const msg of session.messages) {
      if (msg.role === "user" || msg.role === "assistant") {
        const text = msg.content?.slice(0, 300) || "";
        if (text) msgs.push(`[${msg.role}]: ${text}`);
      }
    }

    if (msgs.length > 0) {
      result.push({
        sessionId: summary.id,
        title: session.title,
        messageCount: session.messages.length,
        messages: msgs,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// 生成反思报告（轻量级本地分析，不需要 LLM）
// ---------------------------------------------------------------------------

function generateLocalReflection(
  sessions: { sessionId: string; title: string; messageCount: number; messages: string[] }[]
): ReflectionReport {
  const timeZone = resolveConfiguredTimeZone(getSettings().timeZone);
  const today = getDateKeyInTimeZone(new Date(), timeZone);

  if (sessions.length === 0) {
    return {
      date: today,
      userMoodSummary: "今天没有对话活动",
      whatWorked: [],
      whatDidnt: [],
      patterns: [],
      tomorrowSuggestions: [],
      actionableInsights: [],
      personalityDrift: [],
    };
  }

  // 基本统计
  const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0);
  const allUserMessages = sessions.flatMap((s) =>
    s.messages.filter((m) => m.startsWith("[user]:")).map((m) => m.slice(8))
  );

  // 简单情绪推断
  const positiveKeywords = ["谢谢", "不错", "好的", "可以", "厉害", "nice", "good", "thanks", "完美", "赞"];
  const negativeKeywords = ["不对", "错了", "不行", "重来", "bug", "问题", "烦", "崩"];
  let positiveCount = 0;
  let negativeCount = 0;
  for (const msg of allUserMessages) {
    const lower = msg.toLowerCase();
    if (positiveKeywords.some((kw) => lower.includes(kw))) positiveCount++;
    if (negativeKeywords.some((kw) => lower.includes(kw))) negativeCount++;
  }

  let userMoodSummary: string;
  if (positiveCount > negativeCount * 2) {
    userMoodSummary = "用户今天整体心情不错，对互动比较满意";
  } else if (negativeCount > positiveCount * 2) {
    userMoodSummary = "用户今天遇到了一些困难，可能有些沮丧";
  } else {
    userMoodSummary = "用户今天状态正常，有积极也有挫折";
  }

  // 提取高频关键词作为 patterns
  const wordFreq = new Map<string, number>();
  for (const msg of allUserMessages) {
    // 简单分词（中文按字符，英文按空格）
    const words = msg.split(/[\s,，。！？、；：""''()（）\[\]{}<>]+/).filter((w) => w.length >= 2);
    for (const w of words) {
      wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
    }
  }
  const patterns = [...wordFreq.entries()]
    .filter(([, count]) => count >= 3)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([word, count]) => `"${word}" 出现 ${count} 次`);

  return {
    date: today,
    userMoodSummary,
    whatWorked: [`今天共 ${sessions.length} 个对话，${totalMessages} 条消息`],
    whatDidnt: negativeCount > 0 ? [`用户反馈了 ${negativeCount} 次负面信息`] : [],
    patterns,
    tomorrowSuggestions: [],
    actionableInsights: positiveCount > negativeCount
      ? [`用户对今天的互动较满意，继续保持当前风格`]
      : negativeCount > positiveCount
        ? [`用户遇到较多困难，明天尝试更主动地提供帮助`]
        : [],
    personalityDrift: [],
  };
}

// ---------------------------------------------------------------------------
// 反思报告存储
// ---------------------------------------------------------------------------

function getReflectionDir(): string {
  return join(app.getPath("userData"), "data", "reflections");
}

function saveDailyReflection(report: ReflectionReport): void {
  const dir = getReflectionDir();
  mkdirSync(dir, { recursive: true });

  const filepath = join(dir, `${report.date}.json`);
  writeFileSync(filepath, JSON.stringify(report, null, 2), "utf-8");
}

function loadReflection(date: string): ReflectionReport | null {
  const filepath = join(getReflectionDir(), `${date}.json`);
  if (!existsSync(filepath)) return null;
  try {
    return JSON.parse(readFileSync(filepath, "utf-8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

export async function runDailyReflection(): Promise<ReflectionReport> {
  const sessions = getTodaySessions();

  appLogger.info({
    scope: "reflection",
    message: `开始每日反思 — 今天有 ${sessions.length} 个对话`,
  });

  // 本地生成反思报告
  const report = generateLocalReflection(sessions);

  // 存储报告
  saveDailyReflection(report);

  // 写入 semantic memory
  const store = getMemdirStore();
  for (const insight of report.actionableInsights) {
    store.save({
      summary: insight,
      topic: "reflections",
      source: "system:reflection",
    });
  }

  // 处理性格漂移
  if (report.personalityDrift.length > 0) {
    processPersonalityDrift(report.personalityDrift, report.date);
  }

  bus.emit("reflection:completed", {
    date: report.date,
    sessionCount: sessions.length,
    insightCount: report.actionableInsights.length,
  });

  appLogger.info({
    scope: "reflection",
    message: `每日反思完成 — ${report.actionableInsights.length} 条可执行洞察`,
  });

  return report;
}

// ---------------------------------------------------------------------------
// Prompt Section Builder (re-export personality drift)
// ---------------------------------------------------------------------------

export { buildPersonalityDriftPromptText };

// ---------------------------------------------------------------------------
// External API
// ---------------------------------------------------------------------------

export function getLatestReflection(): ReflectionReport | null {
  const timeZone = resolveConfiguredTimeZone(getSettings().timeZone);
  const today = getDateKeyInTimeZone(new Date(), timeZone);
  return loadReflection(today);
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initReflectionService(): void {
  scheduler.register(
    {
      id: "daily-reflection",
      name: "每日反思",
      type: "daily",
      time: DAILY_REFLECTION_TIME,
      enabled: true,
    },
    async () => {
      try {
        await runDailyReflection();
      } catch (err) {
        appLogger.error({
          scope: "reflection",
          message: "每日反思执行失败",
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }
  );

  appLogger.info({
    scope: "reflection",
    message: `反思服务已启动 — 每日 ${DAILY_REFLECTION_TIME} 自动执行`,
  });
}
