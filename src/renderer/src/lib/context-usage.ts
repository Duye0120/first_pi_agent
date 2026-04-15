import type { ContextSummary } from "@shared/contracts";

export type ContextUsageSummary = ContextSummary;

export const EMPTY_CONTEXT_USAGE_SUMMARY: ContextUsageSummary = {
  state: "unknown",
  contextWindow: null,
  latestInputTokens: null,
  latestOutputTokens: null,
  usageMessageCount: 0,
  usageTotalInputTokens: 0,
  usageTotalOutputTokens: 0,
  estimatedUsedTokens: null,
  estimatedRemainingTokens: null,
  usedRatio: null,
  remainingRatio: null,
  snapshotRevision: 0,
  snapshotUpdatedAt: null,
  compactedUntilSeq: null,
  compactedMessageCount: 0,
  snapshotSummary: null,
  currentTask: null,
  currentState: null,
  branchName: null,
  importantFiles: [],
  openLoops: [],
  nextActions: [],
  risks: [],
  autoCompactFailureCount: 0,
  autoCompactBlocked: false,
  autoCompactBlockedAt: null,
  canCompact: false,
  isCompacting: false,
};

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
    return `已用 ${usedPercent}，剩余 ${remainingPercent}`;
  }

  if (summary.state === "window-only") {
    return "等待首轮用量";
  }

  if (summary.state === "usage-only") {
    return "模型未提供窗口上限";
  }

  return "未知";
}
