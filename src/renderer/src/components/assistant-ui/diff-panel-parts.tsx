import { FileIcon, ImageIcon, ChevronDownIcon } from "lucide-react";
import type {
  GitDiffFile,
  GitDiffOverview,
  GitDiffSource,
  GitDiffSourceSnapshot,
} from "@shared/contracts";
import { Badge } from "@renderer/components/assistant-ui/badge";
import { DiffView } from "@renderer/components/DiffView";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from "@renderer/components/assistant-ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import { cn } from "@renderer/lib/utils";

export const DIFF_SOURCES: readonly GitDiffSource[] = ["unstaged", "staged", "all"];
export const EMPTY_SOURCE_SNAPSHOT: GitDiffSourceSnapshot = {
  files: [],
  totalFiles: 0,
  totalAdditions: 0,
  totalDeletions: 0,
};
export const DIFF_SOURCE_META: Record<GitDiffSource, { label: string; description: string }> = {
  unstaged: {
    label: "未暂存",
    description: "工作区相对 index 的改动。",
  },
  staged: {
    label: "已暂存",
    description: "index 相对 HEAD 的改动。",
  },
  all: {
    label: "全部改动",
    description: "工作区相对 HEAD 的完整预览。",
  },
};

export const DEFAULT_VISIBLE_COMMIT_FILES = 4;

const DIFF_COUNT_FORMATTER = new Intl.NumberFormat("zh-CN");

export function EmptyPanelState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-[220px] place-items-center rounded-[var(--radius-shell)] px-6 py-7 text-center">
      <div className="max-w-[260px]">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground opacity-80">{description}</p>
      </div>
    </div>
  );
}

export function SectionSurface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-shell)] border border-border bg-[color:var(--color-control-panel-bg)] p-3 shadow-sm",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function formatSignedCount(value: number, sign: "+" | "-") {
  return `${sign}${DIFF_COUNT_FORMATTER.format(value)}`;
}

export function getDiffFileDomId(path: string) {
  return `diff-file-${encodeURIComponent(path)}`;
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

export function formatBranchLabel(overview: GitDiffOverview) {
  if (!overview.isGitRepo) {
    return "非 Git 仓库";
  }

  if (overview.branch.isDetached) {
    return `Detached · ${overview.branch.branchName ?? "HEAD"}`;
  }

  return overview.branch.branchName ?? "未识别分支";
}

function DiffStatusPill({ status }: { status: GitDiffFile["status"] }) {
  const config = {
    modified: "warning",
    deleted: "destructive",
    untracked: "success",
  } satisfies Record<GitDiffFile["status"], "warning" | "destructive" | "success">;

  const label = {
    modified: "变更",
    deleted: "删除",
    untracked: "新增",
  } satisfies Record<GitDiffFile["status"], string>;

  return (
    <Badge variant={config[status]} className="justify-center px-2.5">
      {label[status]}
    </Badge>
  );
}

export function DiffSourceSelect({
  selectedSource,
  overview,
  onChange,
}: {
  selectedSource: GitDiffSource;
  overview: GitDiffOverview | null;
  onChange: (source: GitDiffSource) => void;
}) {
  const selectedMeta = DIFF_SOURCE_META[selectedSource];
  const selectedSnapshot = overview?.sources[selectedSource] ?? EMPTY_SOURCE_SNAPSHOT;

  return (
    <SelectRoot value={selectedSource} onValueChange={(value) => onChange(value as GitDiffSource)}>
      <SelectTrigger
        variant="ghost"
        className="h-7 w-full rounded-[var(--radius-shell)] px-2.5 text-[12px] border-0 bg-secondary/50 hover:bg-secondary/80 justify-between items-center"
      >
        <span className="truncate font-medium text-foreground">
          {selectedMeta.label} <span className="text-muted-foreground font-normal ml-1">({selectedSnapshot.totalFiles})</span>
        </span>
      </SelectTrigger>

      <SelectContent className="min-w-[240px] rounded-[var(--radius-shell)]">
        {DIFF_SOURCES.map((source) => {
          const meta = DIFF_SOURCE_META[source];
          const snapshot = overview?.sources[source] ?? EMPTY_SOURCE_SNAPSHOT;

          return (
            <SelectItem key={source} value={source} textValue={meta.label}>
              <div className="flex flex-col min-w-0 py-0.5 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium leading-none">{meta.label}</span>
                  <span className="text-[10px] text-muted-foreground font-mono leading-none">
                    {formatSignedCount(snapshot.totalAdditions, "+")} · {formatSignedCount(snapshot.totalDeletions, "-")}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground mt-1.5 leading-none">
                  {meta.description}
                </span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </SelectRoot>
  );
}

export function DiffSummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
}) {
  return (
    <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-3 py-2 shadow-none">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-text-secondary)]">{label}</p>
      <p
        className={cn(
          "mt-2 text-base font-semibold",
          tone === "positive"
            ? "text-diff-add-text"
            : tone === "negative"
              ? "text-diff-del-text"
              : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function DiffKindMeta({ kind }: { kind: GitDiffFile["kind"] }) {
  const icon = kind === "image" ? <ImageIcon className="size-3.5" /> : <FileIcon className="size-3.5" />;
  const label = kind === "image" ? "图片预览" : kind === "binary" ? "二进制" : "文本差异";

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      {icon}
      <span>{label}</span>
    </span>
  );
}

export function DiffFileCard({
  file,
  expanded,
  onExpandedChange,
  layout,
  className,
  selected,
  onSelectedChange,
}: {
  file: GitDiffFile;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  layout?: "vertical" | "horizontal";
  className?: string;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
}) {
  return (
    <Collapsible
      open={expanded}
      onOpenChange={onExpandedChange}
      className={cn("flex flex-col min-h-0 overflow-hidden rounded-[var(--radius-shell)] border border-border bg-[color:var(--color-control-panel-bg)]", className)}
    >
      <div
        className={cn(
          "flex shrink-0 w-full items-start gap-3 px-3 py-2 text-left transition-colors",
          expanded ? "bg-[color:var(--color-control-bg-hover)]" : "hover:bg-[color:var(--color-control-bg-hover)]/80",
        )}
      >
        {onSelectedChange ? (
          <input
            type="checkbox"
            checked={selected === true}
            onChange={(event) => onSelectedChange(event.currentTarget.checked)}
            className="mt-1 size-4 shrink-0 rounded border-border bg-background accent-foreground"
            aria-label={`选择 ${file.path}`}
          />
        ) : null}

        <CollapsibleTrigger className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{file.path}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <DiffKindMeta kind={file.kind} />
              <DiffStatusPill status={file.status} />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 pl-2">
            <div className="text-right text-[11px] leading-5">
              <p className="font-medium text-diff-add-text">{formatSignedCount(file.additions, "+")}</p>
              <p className="font-medium text-diff-del-text">{formatSignedCount(file.deletions, "-")}</p>
            </div>
            <ChevronDownIcon
              className={cn(
                "mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform",
                expanded && "rotate-180",
              )}
            />
          </div>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="flex flex-col flex-1 min-h-0 overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="flex flex-col flex-1 min-h-0">
          <DiffView
            patch={file.patch}
            fileName={file.path}
            kind={file.kind}
            previewPath={file.previewPath}
            status={file.status}
            maxHunks={12}
            maxLines={420}
            layout={layout}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
