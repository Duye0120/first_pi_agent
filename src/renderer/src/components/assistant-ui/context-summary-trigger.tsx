import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@renderer/components/assistant-ui/button";
import { ContextUsageIndicator } from "@renderer/components/assistant-ui/context-usage-indicator";
import {
  formatRemainingPercent,
  formatTokenCount,
  getContextStatusCopy,
  getContextSummaryDescription,
  type ContextUsageSummary,
} from "@renderer/lib/context-usage";

type ContextSummaryTriggerProps = {
  summary: ContextUsageSummary;
};

function formatCompactTokenCount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  if (value < 1_000) {
    return String(Math.round(value));
  }

  if (value < 1_000_000) {
    const compactValue = value >= 100_000 ? value / 1_000 : value / 1_000;
    return `${compactValue.toFixed(value >= 100_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }

  return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
}

function getUsageHeadline(summary: ContextUsageSummary) {
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

  return "上下文未知";
}

function getRemainingBreakdown(summary: ContextUsageSummary) {
  if (
    typeof summary.estimatedRemainingTokens === "number" &&
    typeof summary.contextWindow === "number"
  ) {
    return {
      firstLine: `剩余 ${formatCompactTokenCount(summary.estimatedRemainingTokens)} 标记，共`,
      secondLine: `${formatCompactTokenCount(summary.contextWindow)}`,
    };
  }

  if (typeof summary.contextWindow === "number") {
    return {
      firstLine: "窗口上限",
      secondLine: `${formatCompactTokenCount(summary.contextWindow)} 标记`,
    };
  }

  if (typeof summary.latestInputTokens === "number") {
    return {
      firstLine: "最近输入",
      secondLine: `${formatCompactTokenCount(summary.latestInputTokens)} 标记`,
    };
  }

  return {
    firstLine: "等待 usage",
    secondLine: "与窗口信息",
  };
}

function getRemainingLine(summary: ContextUsageSummary) {
  const breakdown = getRemainingBreakdown(summary);
  return `${breakdown.firstLine} ${breakdown.secondLine}`.trim();
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[16px] bg-shell-panel px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-text-secondary)]">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
      {hint ? (
        <p className="mt-1 text-[11px] leading-5 text-[color:var(--color-text-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function ContextHoverSummary({ summary }: ContextSummaryTriggerProps) {
  const breakdown = getRemainingBreakdown(summary);

  return (
    <div className="flex min-w-[176px] flex-col items-center text-center">
      <p className="text-[12px] font-semibold tracking-[0.02em] text-[color:var(--color-text-secondary)]">
        背景信息窗口：
      </p>
      <p className="mt-2 text-[19px] font-semibold leading-none tracking-[-0.01em] text-foreground [font-variant-numeric:tabular-nums]">
        {getUsageHeadline(summary)}
      </p>
      <div className="mt-3 flex flex-col gap-1">
        <p className="text-[14px] font-semibold leading-none tracking-[-0.01em] text-foreground [font-variant-numeric:tabular-nums]">
          {breakdown.firstLine}
        </p>
        <p className="text-[16px] font-semibold leading-none tracking-[-0.01em] text-foreground [font-variant-numeric:tabular-nums]">
          {breakdown.secondLine}
        </p>
      </div>
    </div>
  );
}

function ContextPopoverSummary({ summary }: ContextSummaryTriggerProps) {
  const remainingPercent = formatRemainingPercent(summary);

  return (
    <div className="flex w-[320px] flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-secondary)]">
            Context
          </p>
          <p className="mt-2 text-xl font-semibold text-foreground">
            {remainingPercent ? `剩余 ${remainingPercent}` : getContextStatusCopy(summary)}
          </p>
          <p className="mt-1 text-[13px] text-[color:var(--color-text-secondary)] [font-variant-numeric:tabular-nums]">
            {getRemainingLine(summary)}
          </p>
        </div>
        <ContextUsageIndicator
          summary={summary}
          size={40}
          strokeWidth={4}
          className="mt-0.5"
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <MetricCard
          label="窗口上限"
          value={formatTokenCount(summary.contextWindow)}
          hint={
            summary.contextWindow === null ? "当前模型未提供 context window" : undefined
          }
        />
        <MetricCard
          label="最近输入"
          value={formatTokenCount(summary.latestInputTokens)}
          hint={
            summary.latestInputTokens === null
              ? "最近一次 assistant 回合暂无 usage"
              : undefined
          }
        />
        <MetricCard
          label="最近输出"
          value={formatTokenCount(summary.latestOutputTokens)}
        />
        <MetricCard
          label="估算剩余"
          value={formatTokenCount(summary.estimatedRemainingTokens)}
          hint={
            summary.estimatedRemainingTokens === null
              ? "缺少窗口上限或 usage，暂时无法估算"
              : undefined
          }
        />
      </div>

      <p className="text-xs leading-6 text-muted-foreground">
        {getContextSummaryDescription(summary)}
      </p>
    </div>
  );
}

export function ContextSummaryTrigger({
  summary,
}: ContextSummaryTriggerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const panelVisible = hoverOpen || expanded;

  useEffect(() => {
    if (!expanded) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setExpanded(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [expanded]);

  return (
    <div
      ref={rootRef}
      className="relative flex items-center"
      onMouseEnter={() => setHoverOpen(true)}
      onMouseLeave={() => setHoverOpen(false)}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="查看 Context 摘要"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded((current) => !current);
          setHoverOpen(true);
        }}
        className="size-9 rounded-full bg-transparent text-[color:var(--color-text-secondary)] shadow-none hover:bg-transparent hover:text-foreground"
      >
        <ContextUsageIndicator summary={summary} size={22} strokeWidth={2.75} />
        <span className="sr-only">查看 Context 摘要</span>
      </Button>

      <AnimatePresence>
        {panelVisible ? (
          <motion.div
            initial={{
              opacity: 0,
              y: 10,
              scale: 0.97,
              width: 248,
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              width: expanded ? 360 : 248,
            }}
            exit={{
              opacity: 0,
              y: 8,
              scale: 0.98,
              transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
            }}
            transition={{
              layout: {
                type: "spring",
                stiffness: 250,
                damping: 26,
                mass: 0.92,
              },
              opacity: {
                duration: 0.18,
                ease: [0.22, 1, 0.36, 1],
              },
              y: {
                type: "spring",
                stiffness: 280,
                damping: 24,
                mass: 0.9,
              },
              scale: {
                type: "spring",
                stiffness: 280,
                damping: 24,
                mass: 0.9,
              },
            }}
            className="absolute bottom-full left-1/2 z-50 mb-3 -translate-x-1/2 origin-bottom overflow-hidden rounded-[20px] bg-shell-panel shadow-[0_20px_48px_rgba(15,23,42,0.16)] will-change-transform"
            layout
            role={expanded ? "dialog" : "tooltip"}
            aria-label={expanded ? "Context 详情" : "Context 摘要"}
          >
            <motion.div
              key={expanded ? "expanded" : "compact"}
              initial={{ opacity: 0, y: expanded ? 8 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className={expanded ? "p-4" : "px-5 py-4"}
            >
              {expanded ? (
                <ContextPopoverSummary summary={summary} />
              ) : (
                <ContextHoverSummary summary={summary} />
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
