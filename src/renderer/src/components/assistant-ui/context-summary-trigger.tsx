import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { Button } from "@renderer/components/assistant-ui/button";
import { ContextUsageIndicator } from "@renderer/components/assistant-ui/context-usage-indicator";
import {
  formatRemainingPercent,
  formatTokenCount,
  formatUsedPercent,
  getContextStatusCopy,
  type ContextUsageSummary,
} from "@renderer/lib/context-usage";
import { cn } from "@renderer/lib/utils";

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
    return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }

  return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
}

function getUsageLine(summary: ContextUsageSummary) {
  if (
    typeof summary.estimatedUsedTokens === "number" &&
    typeof summary.contextWindow === "number"
  ) {
    return `已用 ${formatCompactTokenCount(summary.estimatedUsedTokens)} 标记，共 ${formatCompactTokenCount(summary.contextWindow)}`;
  }

  if (typeof summary.contextWindow === "number") {
    return `窗口上限 ${formatCompactTokenCount(summary.contextWindow)} 标记`;
  }

  if (typeof summary.estimatedUsedTokens === "number") {
    return `最近一轮已用 ${formatCompactTokenCount(summary.estimatedUsedTokens)} 标记`;
  }

  return "等待 usage 与窗口信息";
}

function getDetailRows(summary: ContextUsageSummary) {
  return [
    { label: "窗口上限", value: formatTokenCount(summary.contextWindow) },
    { label: "最近输入", value: formatTokenCount(summary.latestInputTokens) },
    { label: "最近输出", value: formatTokenCount(summary.latestOutputTokens) },
    { label: "估算已用", value: formatTokenCount(summary.estimatedUsedTokens) },
    { label: "估算剩余", value: formatTokenCount(summary.estimatedRemainingTokens) },
  ];
}

function ContextHoverSummary({ summary }: ContextSummaryTriggerProps) {
  return (
    <div className="flex min-w-[196px] flex-col items-start text-left">
      <p className="text-[12px] font-medium text-[color:var(--color-text-secondary)]">
        背景信息窗口：
      </p>
      <p className="mt-2 text-[15px] font-semibold leading-none tracking-[-0.02em] text-foreground [font-variant-numeric:tabular-nums]">
        {getContextStatusCopy(summary)}
      </p>
      <p className="mt-2 text-[13px] font-medium leading-5 text-[color:var(--color-text-secondary)] [font-variant-numeric:tabular-nums]">
        {getUsageLine(summary)}
      </p>
    </div>
  );
}

function ContextExpandedSummary({ summary }: ContextSummaryTriggerProps) {
  const usedPercent = formatUsedPercent(summary);
  const remainingPercent = formatRemainingPercent(summary);

  return (
    <div className="flex w-[240px] flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[color:var(--color-text-secondary)]">
            背景信息窗口：
          </p>
          <p className="mt-1.5 text-[16px] font-semibold text-foreground [font-variant-numeric:tabular-nums]">
            {getContextStatusCopy(summary)}
          </p>
          <p className="mt-1 text-[13px] text-[color:var(--color-text-secondary)] [font-variant-numeric:tabular-nums]">
            {getUsageLine(summary)}
          </p>
        </div>
        <ContextUsageIndicator
          summary={summary}
          size={30}
          strokeWidth={3.2}
          className="mt-0.5"
        />
      </div>

      {(usedPercent || remainingPercent) && (
        <div className="grid grid-cols-2 gap-2 rounded-[14px] bg-white/68 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
          <div>
            <p className="text-[10px] tracking-[0.18em] text-[color:var(--color-text-muted)]">
              已用
            </p>
            <p className="mt-1 text-[13px] font-semibold text-foreground [font-variant-numeric:tabular-nums]">
              {usedPercent ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.18em] text-[color:var(--color-text-muted)]">
              剩余
            </p>
            <p className="mt-1 text-[13px] font-semibold text-foreground [font-variant-numeric:tabular-nums]">
              {remainingPercent ?? "—"}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] [font-variant-numeric:tabular-nums]">
        {getDetailRows(summary).map((row) => (
          <div key={row.label} className="contents">
            <span className="text-[color:var(--color-text-muted)]">{row.label}</span>
            <span className="text-right text-[color:var(--color-text-secondary)]">
              {row.value}
            </span>
          </div>
        ))}
      </div>
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
        className={cn(
          "size-8 rounded-full bg-transparent text-[color:var(--color-text-secondary)] shadow-none",
          "transition-colors duration-150 ease-out hover:bg-transparent",
          panelVisible ? "text-foreground" : "hover:text-foreground",
        )}
      >
        <ContextUsageIndicator
          summary={summary}
          size={20}
          strokeWidth={2.6}
          className="transition-none"
        />
        <span className="sr-only">查看 Context 摘要</span>
      </Button>

      <AnimatePresence>
        {panelVisible ? (
          <motion.div
            initial={{
              opacity: 0,
              y: 10,
              scale: 0.96,
              width: 224,
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              width: expanded ? 280 : 224,
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
                stiffness: 260,
                damping: 25,
                mass: 0.92,
              },
              opacity: {
                duration: 0.18,
                ease: [0.22, 1, 0.36, 1],
              },
              y: {
                type: "spring",
                stiffness: 300,
                damping: 24,
                mass: 0.9,
              },
              scale: {
                type: "spring",
                stiffness: 300,
                damping: 24,
                mass: 0.9,
              },
            }}
            className={cn(
              "absolute bottom-full left-1/2 z-50 mb-3 -translate-x-1/2 origin-bottom overflow-hidden will-change-transform",
              expanded
                ? "rounded-[20px] bg-shell-panel shadow-[0_20px_48px_rgba(15,23,42,0.16)]"
                : "rounded-[16px] bg-shell-panel shadow-[0_14px_32px_rgba(15,23,42,0.18)]",
            )}
            layout
            role={expanded ? "dialog" : "tooltip"}
            aria-label={expanded ? "Context 详情" : "Context 摘要"}
          >
            <motion.div
              key={expanded ? "expanded" : "compact"}
              initial={{ opacity: 0, y: expanded ? 8 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className={expanded ? "px-4 py-3" : "px-4 py-3.5"}
            >
              {expanded ? (
                <ContextExpandedSummary summary={summary} />
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
