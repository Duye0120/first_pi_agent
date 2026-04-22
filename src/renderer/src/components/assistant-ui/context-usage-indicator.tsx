import { cn } from "@renderer/lib/utils";
import type { ContextUsageSummary } from "@renderer/lib/context-usage";

type ContextUsageIndicatorProps = {
  summary: ContextUsageSummary;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

function hasMeasuredUsage(summary: ContextUsageSummary) {
  return summary.remainingRatio !== null || summary.usageMessageCount > 0;
}

function getIndicatorTone(summary: ContextUsageSummary) {
  if (summary.remainingRatio !== null) {
    const usedRatio = 1 - summary.remainingRatio;

    if (usedRatio >= 0.85) {
      return "var(--color-status-error)";
    }

    if (usedRatio >= 0.65) {
      return "var(--terminal-ansi-yellow)";
    }

    return "var(--color-context-indicator-rest)";
  }

  if (summary.state === "window-only") {
    return "var(--color-context-indicator-rest)";
  }

  return "var(--color-context-indicator-rest)";
}

function getIndicatorLabel(summary: ContextUsageSummary) {
  const progress = getIndicatorProgress(summary);
  const percent = Math.round(progress * 100);

  if (hasMeasuredUsage(summary)) {
    return `上下文使用率 ${percent}%`;
  }

  return "上下文使用率 0%，当前显示灰色空环";
}

function getIndicatorProgress(summary: ContextUsageSummary) {
  if (summary.remainingRatio !== null) {
    return 1 - summary.remainingRatio;
  }

  return 0;
}

export function ContextUsageIndicator({
  summary,
  size = 30,
  strokeWidth = 3,
  className,
}: ContextUsageIndicatorProps) {
  const normalizedStrokeWidth = (strokeWidth / size) * 100;
  const radius = 50 - normalizedStrokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = getIndicatorProgress(summary);
  const dashOffset = circumference * (1 - progress);
  const measured = hasMeasuredUsage(summary);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        className,
      )}
      style={{ width: size, height: size }}
      role="img"
      aria-label={getIndicatorLabel(summary)}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className="-rotate-90"
      >
        <circle
          cx={50}
          cy={50}
          r={radius}
          fill="none"
          strokeWidth={normalizedStrokeWidth}
          style={{
            stroke: measured
              ? "var(--color-context-indicator-track)"
              : "var(--color-context-indicator-rest)",
            opacity: measured ? 1 : 0.7,
          }}
        />
        <circle
          cx={50}
          cy={50}
          r={radius}
          fill="none"
          strokeWidth={normalizedStrokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ stroke: getIndicatorTone(summary) }}
          className="transition-all duration-300 ease-out"
        />
      </svg>
    </span>
  );
}
