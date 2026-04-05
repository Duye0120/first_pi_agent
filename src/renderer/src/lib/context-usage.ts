import type { ChatMessage, ChatSession, MessageUsage, ModelEntry } from "@shared/contracts";

export type ContextUsageState = "ready" | "window-only" | "usage-only" | "unknown";

export type ContextUsageSummary = {
  state: ContextUsageState;
  contextWindow: number | null;
  latestInputTokens: number | null;
  latestOutputTokens: number | null;
  estimatedRemainingTokens: number | null;
  remainingRatio: number | null;
};

export const EMPTY_CONTEXT_USAGE_SUMMARY: ContextUsageSummary = {
  state: "unknown",
  contextWindow: null,
  latestInputTokens: null,
  latestOutputTokens: null,
  estimatedRemainingTokens: null,
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
  const estimatedRemainingTokens =
    typeof contextWindow === "number" && typeof latestInputTokens === "number"
      ? Math.max(contextWindow - latestInputTokens, 0)
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
      estimatedRemainingTokens,
      remainingRatio,
    };
  }

  if (typeof contextWindow === "number") {
    return {
      state: "window-only",
      contextWindow,
      latestInputTokens,
      latestOutputTokens,
      estimatedRemainingTokens,
      remainingRatio,
    };
  }

  if (usage) {
    return {
      state: "usage-only",
      contextWindow,
      latestInputTokens,
      latestOutputTokens,
      estimatedRemainingTokens,
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

export function formatRemainingPercent(summary: ContextUsageSummary) {
  if (summary.remainingRatio === null) {
    return null;
  }

  return `${Math.round(summary.remainingRatio * 100)}%`;
}

export function getContextStatusCopy(summary: ContextUsageSummary) {
  const remainingPercent = formatRemainingPercent(summary);

  if (remainingPercent) {
    return `剩余 ${remainingPercent}`;
  }

  if (summary.state === "window-only") {
    return "等待 usage";
  }

  if (summary.state === "usage-only") {
    return "缺少窗口上限";
  }

  return "未知";
}

export function getContextSummaryDescription(summary: ContextUsageSummary) {
  if (summary.state === "ready") {
    return "基于最近一次已完成 assistant 回合的输入 tokens 估算。";
  }

  if (summary.state === "window-only") {
    return "模型提供了窗口上限，等待线程产生 usage 后再估算剩余比例。";
  }

  if (summary.state === "usage-only") {
    return "线程已有 usage，但当前模型没有提供 context window。";
  }

  return "当前模型和线程都还没有足够信息，暂时无法估算上下文余量。";
}
