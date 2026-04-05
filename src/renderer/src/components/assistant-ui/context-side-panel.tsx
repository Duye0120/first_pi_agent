import {
  PaperclipIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import type { ChatSession, SelectedFile } from "@shared/contracts";
import { Badge } from "@renderer/components/assistant-ui/badge";
import { Button } from "@renderer/components/assistant-ui/button";
import { ContextUsageIndicator } from "@renderer/components/assistant-ui/context-usage-indicator";
import {
  formatTokenCount,
  formatRemainingPercent,
  getContextStatusCopy,
  type ContextUsageSummary,
} from "@renderer/lib/context-usage";
import { cn } from "@renderer/lib/utils";

type ContextSidePanelProps = {
  session: ChatSession | null;
  summary: ContextUsageSummary;
  onRemoveAttachment: (attachmentId: string) => void;
  onClearAttachments: () => void;
};

function SectionSurface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[20px] bg-shell-panel-elevated p-4",
        className,
      )}
    >
      {children}
    </section>
  );
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
      <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-text-secondary)]">{label}</p>
      <p className="mt-2 text-base font-semibold text-foreground">{value}</p>
      {hint ? (
        <p className="mt-1 text-[11px] leading-5 text-[color:var(--color-text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

function EmptyPanelState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-[220px] place-items-center rounded-[20px] bg-shell-panel-elevated px-5 py-6 text-center">
      <div className="max-w-[260px]">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getSummaryDescription(summary: ContextUsageSummary) {
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

function AttachmentRow({
  attachment,
  onRemove,
}: {
  attachment: SelectedFile;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[16px] bg-shell-panel px-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{attachment.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {attachment.kind} · {formatFileSize(attachment.size)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="uppercase tracking-[0.16em]">
          {attachment.extension || "file"}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="size-8 rounded-[14px] text-muted-foreground hover:bg-shell-panel-contrast hover:text-foreground"
          aria-label={`移除附件 ${attachment.name}`}
        >
          <XIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function ContextSidePanel({
  session,
  summary,
  onRemoveAttachment,
  onClearAttachments,
}: ContextSidePanelProps) {
  const attachments = session?.attachments ?? [];
  const remainingPercent = formatRemainingPercent(summary);

  return (
    <aside className="flex h-full min-h-0 flex-col bg-shell-panel-muted px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-text-secondary)]">Context</p>
      <div className="mt-2">
        <h3 className="text-lg font-semibold text-foreground">上下文</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          只读查看当前线程的上下文占用估算和附件列表。
        </p>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-1 pr-1">
        <SectionSurface>
          <div className="flex items-center gap-4 rounded-[18px] bg-shell-panel px-4 py-4">
            <ContextUsageIndicator summary={summary} size={64} strokeWidth={6} />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-text-secondary)]">剩余上下文</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {remainingPercent ?? "—"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {getContextStatusCopy(summary)}
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-6 text-muted-foreground">
            {getSummaryDescription(summary)}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <MetricCard
              label="窗口上限"
              value={formatTokenCount(summary.contextWindow)}
              hint={summary.contextWindow === null ? "当前模型未提供 context window" : undefined}
            />
            <MetricCard
              label="最近输入"
              value={formatTokenCount(summary.latestInputTokens)}
              hint={summary.latestInputTokens === null ? "最近一次 assistant 回合暂无 usage" : undefined}
            />
            <MetricCard
              label="最近输出"
              value={formatTokenCount(summary.latestOutputTokens)}
            />
            <MetricCard
              label="估算剩余"
              value={formatTokenCount(summary.estimatedRemainingTokens)}
              hint={summary.estimatedRemainingTokens === null ? "缺少窗口上限或 usage，暂时无法估算" : undefined}
            />
          </div>
        </SectionSurface>

        <SectionSurface className="flex min-h-0 flex-col">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <PaperclipIcon className="size-4 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">附件</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                当前线程已挂载的本地文件。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{attachments.length}</Badge>
              {attachments.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onClearAttachments}
                  className="rounded-[14px] px-2.5 text-muted-foreground hover:bg-shell-panel hover:text-foreground"
                >
                  <Trash2Icon className="size-4" />
                  清空附件
                </Button>
              ) : null}
            </div>
          </div>

          {attachments.length === 0 ? (
            <div className="mt-4">
              <EmptyPanelState
                title="还没有附件"
                description="先从输入区选择本地文件，这里会显示当前线程的附件，并支持移除或清空。"
              />
            </div>
          ) : (
            <div className="mt-4 flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
              {attachments.map((attachment) => (
                <AttachmentRow
                  key={attachment.id}
                  attachment={attachment}
                  onRemove={() => onRemoveAttachment(attachment.id)}
                />
              ))}
            </div>
          )}
        </SectionSurface>
      </div>
    </aside>
  );
}
