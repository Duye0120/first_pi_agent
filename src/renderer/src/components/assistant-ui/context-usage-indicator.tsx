import { cn } from "@renderer/lib/utils";
import type { ContextUsageSummary } from "@renderer/lib/context-usage";

type ContextUsageIndicatorProps = {
  summary: ContextUsageSummary;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

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
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = getIndicatorProgress(summary);
  const dashOffset = circumference * (1 - progress);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          style={{ stroke: "var(--color-context-indicator-track)" }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
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
