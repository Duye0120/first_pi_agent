import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { Button } from "@renderer/components/assistant-ui/button";
import { ContextUsageIndicator } from "@renderer/components/assistant-ui/context-usage-indicator";
import {
  formatRemainingPercent,
  formatTokenCount,
  formatUsedPercent,
  type ContextUsageSummary,
} from "@renderer/lib/context-usage";
import { cn } from "@renderer/lib/utils";

type ContextSummaryTriggerProps = {
  summary: ContextUsageSummary;
  onCompact?: () => void | Promise<void>;
};

const CONTEXT_HOVER_CONTENT_WIDTH = 240;
const CONTEXT_EXPANDED_CONTENT_WIDTH = 268;
const CONTEXT_PANEL_HORIZONTAL_PADDING = 28;
const CONTEXT_HOVER_PANEL_WIDTH =
  CONTEXT_HOVER_CONTENT_WIDTH + CONTEXT_PANEL_HORIZONTAL_PADDING;
const CONTEXT_EXPANDED_PANEL_WIDTH =
  CONTEXT_EXPANDED_CONTENT_WIDTH + CONTEXT_PANEL_HORIZONTAL_PADDING;

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
    return `本轮约用 ${formatCompactTokenCount(summary.estimatedUsedTokens)} / ${formatCompactTokenCount(summary.contextWindow)} 词元`;
  }

  if (typeof summary.contextWindow === "number") {
    return `窗口上限 ${formatCompactTokenCount(summary.contextWindow)} 词元`;
  }

  if (typeof summary.estimatedUsedTokens === "number") {
    return `本轮约用 ${formatCompactTokenCount(summary.estimatedUsedTokens)} 词元`;
  }

  return "等待用量数据";
}

function getCompactStatusCopy(summary: ContextUsageSummary) {
  if (summary.isCompacting) {
    return "正在整理历史消息。";
  }

  if (summary.autoCompactBlocked) {
    return "自动整理已暂停，可手动整理。";
  }

  if (summary.canCompact) {
    return "可手动整理旧上下文。";
  }

  return "暂时不需要整理。";
}

function formatSnapshotTimestamp(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatCompactedCount(summary: ContextUsageSummary) {
  if (summary.compactedMessageCount <= 0) {
    return "0 条";
  }

  return `${summary.compactedMessageCount} 条`;
}

function getSnapshotStatusCopy(summary: ContextUsageSummary) {
  if (summary.isCompacting) {
    return "正在整理历史消息";
  }

  if (summary.snapshotRevision > 0 && summary.canCompact) {
    return `已整理 ${formatCompactedCount(summary)} 历史消息，还能继续整理`;
  }

  if (summary.snapshotRevision > 0) {
    return `已整理 ${formatCompactedCount(summary)} 历史消息`;
  }

  return "当前还没有整理历史消息";
}

function getHoverFootnote(summary: ContextUsageSummary) {
  if (summary.autoCompactBlocked) {
    return "自动整理已暂停，手动执行一次后恢复。";
  }

  if (summary.isCompacting) {
    return "旧消息正在整理。";
  }

  if (summary.snapshotRevision > 0) {
    return getSnapshotStatusCopy(summary);
  }

  if (summary.canCompact) {
    return "旧消息已堆积，可以手动整理一次。";
  }

  return "当前窗口主要保留最近消息。";
}

function getHeadlineRows(summary: ContextUsageSummary) {
  return [
    { label: "已用", value: formatUsedPercent(summary) ?? "—" },
    { label: "剩余", value: formatRemainingPercent(summary) ?? "—" },
  ];
}

function getSummaryRows(summary: ContextUsageSummary) {
  return [
    {
      label: "已整理",
      value:
        summary.snapshotRevision > 0
          ? `${formatCompactedCount(summary)} 历史消息`
          : "0 条",
    },
    {
      label: "最近整理",
      value: formatSnapshotTimestamp(summary.snapshotUpdatedAt),
    },
  ];
}

function getDetailRows(summary: ContextUsageSummary) {
  return [
    { label: "窗口上限", value: formatTokenCount(summary.contextWindow) },
    { label: "最近输入", value: formatTokenCount(summary.latestInputTokens) },
    { label: "最近输出", value: formatTokenCount(summary.latestOutputTokens) },
    { label: "估算已用", value: formatTokenCount(summary.estimatedUsedTokens) },
    {
      label: "估算剩余",
      value: formatTokenCount(summary.estimatedRemainingTokens),
    },
  ];
}

function ContextSection({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-shell)] bg-[color:var(--color-shell-panel-muted)] px-3.5 py-3",
        className,
      )}
    >
      <p className="text-[10px] font-medium tracking-[0.18em] text-[color:var(--color-text-muted)]">
        {label}
      </p>
      {children}
    </section>
  );
}

function ContextHoverSummary({ summary }: ContextSummaryTriggerProps) {
  const headlineRows = getHeadlineRows(summary);

  return (
    <div
      className="flex flex-col items-start text-left"
      style={{ width: CONTEXT_HOVER_CONTENT_WIDTH }}
    >
      <p className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--color-text-muted)]">
        上下文窗口
      </p>
      <div className="mt-2 space-y-1.5">
        {headlineRows.map((row) => (
          <p
            key={row.label}
            className="text-[16px] font-semibold leading-snug tracking-[-0.02em] text-foreground [font-variant-numeric:tabular-nums]"
          >
            {row.value} {row.label}
          </p>
        ))}
      </div>
      <p className="mt-2 text-[13px] font-medium leading-5 text-[color:var(--color-text-secondary)] [font-variant-numeric:tabular-nums]">
        {getUsageLine(summary)}
      </p>
      <p className="mt-2 line-clamp-3 text-[12px] leading-5 text-[color:var(--color-text-secondary)] break-words">
        {getHoverFootnote(summary)}
      </p>
    </div>
  );
}

function ContextExpandedSummary({
  summary,
  onCompact,
}: ContextSummaryTriggerProps) {
  const headlineRows = getHeadlineRows(summary);
  const summaryRows = getSummaryRows(summary);
  const detailRows = getDetailRows(summary);

  return (
    <div
      className="flex flex-col gap-2.5"
      style={{ width: CONTEXT_EXPANDED_CONTENT_WIDTH }}
    >
      <section className="rounded-[var(--radius-shell)] bg-[color:var(--color-shell-panel-elevated)] px-3.5 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--color-text-muted)]">
              上下文窗口
            </p>
            <div className="mt-1.5 space-y-1.5">
              {headlineRows.map((row) => (
                <p
                  key={row.label}
                  className="text-[18px] font-semibold leading-[1.3] text-foreground [font-variant-numeric:tabular-nums] break-words"
                >
                  {row.value} {row.label}
                </p>
              ))}
            </div>
            <p className="mt-1.5 text-[13px] leading-5 text-[color:var(--color-text-secondary)] [font-variant-numeric:tabular-nums]">
              {getUsageLine(summary)}
            </p>
          </div>
          <ContextUsageIndicator
            summary={summary}
            size={34}
            strokeWidth={3}
            className="mt-0.5 shrink-0"
          />
        </div>
      </section>

      <ContextSection label="窗口详情">
        <dl className="mt-2 flex flex-col gap-1.5 text-[12px] [font-variant-numeric:tabular-nums]">
          {detailRows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[1fr_auto] items-baseline gap-4"
            >
              <dt className="text-[color:var(--color-text-muted)]">{row.label}</dt>
              <dd className="text-right text-[color:var(--color-text-secondary)]">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </ContextSection>

      <ContextSection label="整理结果">
        <dl className="mt-3 flex flex-col gap-1.5 text-[12px]">
          {summaryRows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[1fr_auto] items-baseline gap-4"
            >
              <dt className="text-[color:var(--color-text-muted)]">{row.label}</dt>
              <dd className="text-right text-[color:var(--color-text-secondary)]">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </ContextSection>

      {summary.autoCompactBlocked ? (
        <ContextSection label="自动整理">
          <p className="mt-2 text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
            自动整理暂停，手动执行一次成功后会恢复。
          </p>
        </ContextSection>
      ) : null}

      <section className="rounded-[var(--radius-shell)] border border-[color:var(--color-control-border)] bg-[color:var(--color-control-bg)] px-3.5 py-3 shadow-[var(--color-control-shadow)]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-[color:var(--color-text-muted)]">
              整理
            </p>
            <p className="mt-1 text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
              {getCompactStatusCopy(summary)}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (!summary.isCompacting && summary.canCompact) {
                void onCompact?.();
              }
            }}
            disabled={!summary.canCompact || summary.isCompacting}
            className="h-8 shrink-0 rounded-[var(--radius-shell)] px-3 text-[12px]"
          >
            {summary.isCompacting ? "整理中…" : "整理"}
          </Button>
        </div>
      </section>
    </div>
  );
}

export function ContextSummaryTrigger({
  summary,
  onCompact,
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
        aria-label="查看上下文摘要"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded((current) => !current);
          setHoverOpen(true);
        }}
        className={cn(
          "relative z-10 size-8 rounded-full bg-transparent p-0 text-[color:var(--color-text-secondary)] shadow-none",
          "transition-colors duration-150 ease-out hover:bg-transparent hover:text-foreground",
          "focus-visible:ring-0 focus-visible:ring-transparent",
          expanded ? "text-foreground" : null,
        )}
      >
        <ContextUsageIndicator
          summary={summary}
          size={20}
          strokeWidth={2.6}
          className="transition-none"
        />
        <span className="sr-only">查看上下文摘要</span>
      </Button>

      <AnimatePresence>
        {panelVisible ? (
          <motion.div
            initial={{
              opacity: 0,
              y: 10,
              scale: 0.96,
              width: CONTEXT_HOVER_PANEL_WIDTH,
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              width: expanded
                ? CONTEXT_EXPANDED_PANEL_WIDTH
                : CONTEXT_HOVER_PANEL_WIDTH,
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
            className="absolute bottom-full right-0 z-50 mb-3 origin-bottom-right overflow-hidden rounded-[var(--radius-shell)] bg-[color:var(--color-shell-overlay)] shadow-[var(--shadow-flyout)] will-change-transform"
            layout
            role={expanded ? "dialog" : "tooltip"}
            aria-label={expanded ? "上下文详情" : "上下文摘要"}
          >
            <motion.div
              key={expanded ? "expanded" : "compact"}
              initial={{ opacity: 0, y: expanded ? 8 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="px-3.5 py-3.5"
            >
              {expanded ? (
                <ContextExpandedSummary
                  summary={summary}
                  onCompact={onCompact}
                />
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
