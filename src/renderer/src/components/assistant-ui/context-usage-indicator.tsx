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
    if (summary.remainingRatio <= 0.15) {
      return "stroke-rose-400";
    }

    if (summary.remainingRatio <= 0.35) {
      return "stroke-amber-300";
    }

    return "stroke-[var(--color-accent)]";
  }

  if (summary.state === "window-only") {
    return "stroke-[var(--color-accent)]/50";
  }

  return "stroke-white/20";
}

export function ContextUsageIndicator({
  summary,
  size = 30,
  strokeWidth = 3,
  className,
}: ContextUsageIndicatorProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = summary.remainingRatio ?? (summary.state === "window-only" ? 1 : 0);
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
          className="stroke-white/10"
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
          className={cn("transition-all duration-300 ease-out", getIndicatorTone(summary))}
        />
      </svg>
      <span className="absolute size-1.5 rounded-full bg-white/50" />
    </span>
  );
}
