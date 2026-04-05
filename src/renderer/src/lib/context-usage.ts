import type { ChatMessage, ChatSession, MessageUsage, ModelEntry } from "@shared/contracts";

export type ContextUsageState = "ready" | "window-only" | "usage-only" | "unknown";

export type ContextUsageSummary = {
  state: ContextUsageState;
  contextWindow: number | null;
  latestInputTokens: number | null;
  latestOutputTokens: number | null;
  estimatedUsedTokens: number | null;
  estimatedRemainingTokens: number | null;
  usedRatio: number | null;
  remainingRatio: number | null;
};

export const EMPTY_CONTEXT_USAGE_SUMMARY: ContextUsageSummary = {
  state: "unknown",
  contextWindow: null,
  latestInputTokens: null,
  latestOutputTokens: null,
  estimatedUsedTokens: null,
  estimatedRemainingTokens: null,
  usedRatio: null,
  remainingRatio: null,
};

export function resolveContextWindow(entry: ModelEntry | null) {
  return entry?.limits.contextWindow ?? entry?.detectedLimits.contextWindow ?? null;
}

export function getLatestAssistantUsage(session: ChatSession | null): MessageUsage | null {
  if (!session) {
    return null;
  }

  const latestUsageMessage = [...session.messages]
    .reverse()
    .find(
      (message): message is ChatMessage & { usage: NonNullable<ChatMessage["usage"]> } =>
        message.role === "assistant" &&
        message.status === "done" &&
        !!message.usage &&
        typeof message.usage.inputTokens === "number" &&
        typeof message.usage.outputTokens === "number",
    );

  return latestUsageMessage?.usage ?? null;
}

export function getContextUsageSummary(
  session: ChatSession | null,
  contextWindow: number | null,
): ContextUsageSummary {
  const usage = getLatestAssistantUsage(session);
  const latestInputTokens = usage?.inputTokens ?? null;
  const latestOutputTokens = usage?.outputTokens ?? null;
  const estimatedUsedTokens =
    typeof latestInputTokens === "number" && typeof latestOutputTokens === "number"
      ? Math.max(latestInputTokens + latestOutputTokens, 0)
      : typeof contextWindow === "number"
        ? 0
      : null;
  const estimatedRemainingTokens =
    typeof contextWindow === "number" && typeof estimatedUsedTokens === "number"
      ? Math.max(contextWindow - estimatedUsedTokens, 0)
      : null;
  const usedRatio =
    typeof estimatedUsedTokens === "number" &&
    typeof contextWindow === "number" &&
    contextWindow > 0
      ? Math.min(1, Math.max(0, estimatedUsedTokens / contextWindow))
      : null;
  const remainingRatio =
    typeof estimatedRemainingTokens === "number" &&
    typeof contextWindow === "number" &&
    contextWindow > 0
      ? Math.min(1, Math.max(0, estimatedRemainingTokens / contextWindow))
      : null;

  if (typeof contextWindow === "number" && usage) {
    return {
      state: "ready",
      contextWindow,
      latestInputTokens,
      latestOutputTokens,
      estimatedUsedTokens,
      estimatedRemainingTokens,
      usedRatio,
      remainingRatio,
    };
  }

  if (typeof contextWindow === "number") {
    return {
      state: "window-only",
      contextWindow,
      latestInputTokens,
      latestOutputTokens,
      estimatedUsedTokens,
      estimatedRemainingTokens,
      usedRatio,
      remainingRatio,
    };
  }

  if (usage) {
    return {
      state: "usage-only",
      contextWindow,
      latestInputTokens,
      latestOutputTokens,
      estimatedUsedTokens,
      estimatedRemainingTokens,
      usedRatio,
      remainingRatio,
    };
  }

  return EMPTY_CONTEXT_USAGE_SUMMARY;
}

export function formatTokenCount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatRatioPercent(ratio: number | null) {
  if (ratio === null) {
    return null;
  }

  if (ratio <= 0) {
    return "0%";
  }

  if (ratio >= 1) {
    return "100%";
  }

  const percent = ratio * 100;

  if (percent < 1) {
    return "0.1%";
  }

  if (percent > 99) {
    return "99.9%";
  }

  if (percent < 10) {
    return `${percent.toFixed(1).replace(/\.0$/, "")}%`;
  }

  return `${Math.round(percent)}%`;
}

export function formatRemainingPercent(summary: ContextUsageSummary) {
  return formatRatioPercent(summary.remainingRatio);
}

export function formatUsedPercent(summary: ContextUsageSummary) {
  return formatRatioPercent(summary.usedRatio);
}

export function getContextStatusCopy(summary: ContextUsageSummary) {
  const usedPercent = formatUsedPercent(summary);
  const remainingPercent = formatRemainingPercent(summary);

  if (usedPercent && remainingPercent) {
    return `${usedPercent} 已用（剩余 ${remainingPercent}）`;
  }

  if (summary.state === "window-only") {
    return "等待首轮 usage";
  }

  if (summary.state === "usage-only") {
    return "当前模型未提供 context window";
  }

  return "未知";
}

export function getContextSummaryDescription(summary: ContextUsageSummary) {
  if (summary.state === "ready") {
    return "基于最近一次已完成 assistant 回合的 input 与 output tokens 估算。";
  }

  if (summary.state === "window-only") {
    return "模型已提供窗口上限，等待线程产生 usage 后再估算已用与剩余比例。";
  }

  if (summary.state === "usage-only") {
    return "线程已有 usage，但当前模型没有提供 context window。";
  }

  return "当前模型和线程都还没有足够信息，暂时无法估算上下文余量。";
}
