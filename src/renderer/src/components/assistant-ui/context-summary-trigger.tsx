import { useEffect, useRef, useState, type ReactNode } from "react";
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
  onCompact?: () => void | Promise<void>;
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
    return `本轮约用 ${formatCompactTokenCount(summary.estimatedUsedTokens)} / ${formatCompactTokenCount(summary.contextWindow)} tokens`;
  }

  if (typeof summary.contextWindow === "number") {
    return `窗口上限 ${formatCompactTokenCount(summary.contextWindow)} tokens`;
  }

  if (typeof summary.estimatedUsedTokens === "number") {
    return `本轮约用 ${formatCompactTokenCount(summary.estimatedUsedTokens)} tokens`;
  }

  return "等待 usage 资料";
}

function getCompactStatusCopy(summary: ContextUsageSummary) {
  if (summary.isCompacting) {
    return "正在整理 snapshot…";
  }

  if (summary.autoCompactBlocked) {
    return "自动 compact 已暂停，可手动整理。";
  }

  if (summary.canCompact) {
    return "可手动整理旧上下文。";
  }

  return "暂时不需要 compact。";
}

function getContinuityHeadline(summary: ContextUsageSummary) {
  if (summary.currentTask) {
    return summary.currentTask;
  }

  if (summary.openLoops[0]) {
    return summary.openLoops[0];
  }

  if (summary.nextActions[0]) {
    return summary.nextActions[0];
  }

  if (summary.snapshotSummary) {
    return summary.snapshotSummary.split(/\r?\n/)[0] ?? summary.snapshotSummary;
  }

  return "暂无历史 Snapshot";
}

function getContinuityRows(summary: ContextUsageSummary) {
  return [
    summary.currentTask
      ? { label: "当前任务", value: summary.currentTask }
      : null,
    summary.currentState
      ? { label: "当前状态", value: summary.currentState }
      : null,
    summary.branchName
      ? { label: "工作分支", value: summary.branchName }
      : null,
  ].filter((row): row is { label: string; value: string } => !!row);
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
    {
      label: "Snapshot",
      value:
        summary.snapshotRevision > 0
          ? `r${summary.snapshotRevision}`
          : "未生成",
    },
    { label: "已压到", value: summary.compactedUntilSeq ?? "—" },
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

function ContextStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="bg-[color:var(--color-shell-panel)] px-3 py-2.5">
      <p className="text-[10px] font-medium tracking-[0.18em] text-[color:var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-[13px] font-semibold text-foreground [font-variant-numeric:tabular-nums]">
        {value}
      </p>
    </div>
  );
}

function ContextHoverSummary({ summary }: ContextSummaryTriggerProps) {
  return (
    <div className="flex w-[240px] flex-col items-start text-left">
      <p className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--color-text-muted)]">
        Context 视窗
      </p>
      <p className="mt-2 text-[16px] font-semibold leading-snug tracking-[-0.02em] text-foreground [font-variant-numeric:tabular-nums]">
        {getContextStatusCopy(summary)}
      </p>
      <p className="mt-2 text-[13px] font-medium leading-5 text-[color:var(--color-text-secondary)] [font-variant-numeric:tabular-nums]">
        {getUsageLine(summary)}
      </p>
      <p className="mt-2 line-clamp-3 text-[12px] leading-5 text-[color:var(--color-text-secondary)] break-words">
        {getContinuityHeadline(summary)}
      </p>
      {summary.autoCompactBlocked ? (
        <p className="mt-2 text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
          自动 compact 已暂停，先手动执行一次即可恢复。
        </p>
      ) : null}
    </div>
  );
}

function ContextExpandedSummary({
  summary,
  onCompact,
}: ContextSummaryTriggerProps) {
  const usedPercent = formatUsedPercent(summary);
  const remainingPercent = formatRemainingPercent(summary);
  const continuityRows = getContinuityRows(summary);
  const detailRows = getDetailRows(summary);

  return (
    <div className="flex w-[268px] flex-col gap-2.5">
      <section className="rounded-[var(--radius-shell)] bg-[color:var(--color-shell-panel-elevated)] px-3.5 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--color-text-muted)]">
              Context 视窗
            </p>
            <p className="mt-1.5 text-[18px] font-semibold leading-[1.3] text-foreground [font-variant-numeric:tabular-nums] break-words">
              {getContextStatusCopy(summary)}
            </p>
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

        {(usedPercent || remainingPercent) && (
          <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-shell)] bg-[color:var(--color-border-light)]/80">
            <ContextStat label="已用" value={usedPercent ?? "—"} />
            <ContextStat label="剩余" value={remainingPercent ?? "—"} />
          </div>
        )}
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

      <ContextSection label="续接线索">
        <p className="mt-2 text-[13px] leading-5 text-foreground break-words">
          {getContinuityHeadline(summary)}
        </p>
        {summary.snapshotSummary &&
          summary.snapshotSummary !== getContinuityHeadline(summary) ? (
          <p className="mt-2 whitespace-pre-line text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
            {summary.snapshotSummary}
          </p>
        ) : null}
        {continuityRows.length > 0 ? (
          <dl className="mt-3 flex flex-col gap-1.5 text-[12px]">
            {continuityRows.map((row) => (
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
        ) : null}
      </ContextSection>

      {summary.openLoops.length > 0 || summary.nextActions.length > 0 ? (
        <ContextSection label="后续">
          {summary.nextActions.length > 0 ? (
            <div>
              <p className="mt-2 text-[11px] font-medium text-[color:var(--color-text-muted)]">
                下一步
              </p>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {summary.nextActions.map((item) => (
                  <p key={item} className="text-[12px] leading-5 text-foreground">
                    {item}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
          {summary.openLoops.length > 0 ? (
            <div className={cn(summary.nextActions.length > 0 ? "mt-3" : "mt-2")}>
              <p className="text-[11px] font-medium text-[color:var(--color-text-muted)]">
                未闭环
              </p>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {summary.openLoops.map((item) => (
                  <p
                    key={item}
                    className="text-[12px] leading-5 text-[color:var(--color-text-secondary)]"
                  >
                    {item}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </ContextSection>
      ) : null}

      {summary.risks.length > 0 || summary.importantFiles.length > 0 ? (
        <ContextSection label="补充">
          {summary.risks.length > 0 ? (
            <div>
              <p className="mt-2 text-[11px] font-medium text-[color:var(--color-text-muted)]">
                风险
              </p>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {summary.risks.map((item) => (
                  <p
                    key={item}
                    className="text-[12px] leading-5 text-[color:var(--color-text-secondary)]"
                  >
                    {item}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
          {summary.importantFiles.length > 0 ? (
            <div className={cn(summary.risks.length > 0 ? "mt-3" : "mt-2")}>
              <p className="text-[11px] font-medium text-[color:var(--color-text-muted)]">
                关键文件
              </p>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {summary.importantFiles.map((item) => (
                  <p
                    key={item}
                    className="truncate text-[12px] leading-5 text-[color:var(--color-text-secondary)]"
                  >
                    {item}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </ContextSection>
      ) : null}

      {summary.autoCompactBlocked ? (
        <ContextSection label="自动 Compact">
          <p className="mt-2 text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
            自动 compact 暂停，手动执行一次成功后会恢复。
          </p>
        </ContextSection>
      ) : null}

      <section className="rounded-[var(--radius-shell)] border border-[color:var(--color-control-border)] bg-[color:var(--color-control-bg)] px-3.5 py-3 shadow-[var(--color-control-shadow)]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-[color:var(--color-text-muted)]">
              Compact
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
            {summary.isCompacting ? "Compacting…" : "Compact"}
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
        aria-label="查看 Context 摘要"
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
              width: expanded ? 292 : 232,
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
              "absolute bottom-full right-0 z-50 mb-3 origin-bottom-right overflow-hidden will-change-transform",
              expanded
                ? "rounded-[var(--radius-shell)] bg-[color:var(--color-shell-overlay)] shadow-[var(--shadow-flyout)]"
                : "rounded-[var(--radius-shell)] bg-[color:var(--color-shell-overlay)] shadow-[var(--shadow-flyout)]",
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
