import { useCallback, useEffect, useState } from "react";
import {
  FileIcon,
  ImageIcon,
  RefreshCwIcon,
  XIcon,
  ColumnsIcon,
  ListIcon,
  UploadIcon,
  DownloadIcon,
  CheckIcon,
  PlusIcon,
  MinusIcon,
  SparklesIcon,
  TrashIcon,
  CheckCheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react";
import type {
  CommitPlanGroup,
  GitDiffFile,
  GitDiffOverview,
  GitDiffSource,
  GitDiffSourceSnapshot,
  RuntimeSkillUsage,
} from "@shared/contracts";
import { getRuntimeSkillUsage } from "@shared/skill-usage";
import { Badge } from "@renderer/components/assistant-ui/badge";
import { Button } from "@renderer/components/assistant-ui/button";
import { DiffView } from "@renderer/components/DiffView";
import { SkillUsageStrip } from "@renderer/components/assistant-ui/skill-usage-strip";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";
import { cn } from "@renderer/lib/utils";
import { useResizable } from "@renderer/hooks/use-resizable";

const DIFF_SOURCES: readonly GitDiffSource[] = ["unstaged", "staged", "all"];
const EMPTY_SOURCE_SNAPSHOT: GitDiffSourceSnapshot = {
  files: [],
  totalFiles: 0,
  totalAdditions: 0,
  totalDeletions: 0,
};
const DIFF_SOURCE_META: Record<GitDiffSource, { label: string; description: string }> = {
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

type DiffWorkbenchContentProps = {
  onClose: () => void;
  overview: GitDiffOverview | null;
  isLoading: boolean;
  onRefresh: () => void | Promise<void>;
  className?: string;
};

type DiffWorkbenchDraft = {
  layout: "vertical" | "horizontal";
  selectedDiffSource: GitDiffSource;
  commitPlanGroups: CommitPlanCardState[];
  commitPlanSkillUsage: RuntimeSkillUsage | null;
};

const DEFAULT_DIFF_WORKBENCH_DRAFT: DiffWorkbenchDraft = {
  layout: "vertical",
  selectedDiffSource: "all",
  commitPlanGroups: [],
  commitPlanSkillUsage: null,
};

let diffWorkbenchDraft: DiffWorkbenchDraft = { ...DEFAULT_DIFF_WORKBENCH_DRAFT };
const DEFAULT_VISIBLE_COMMIT_FILES = 4;

type CommitPlanStatus =
  | "idle"
  | "staging"
  | "staged"
  | "committing"
  | "committed"
  | "error";

type CommitPlanCardState = CommitPlanGroup & {
  status: CommitPlanStatus;
  error: string | null;
};

type CommitPlanGenerationResult = {
  groups: CommitPlanCardState[];
  skillUsage: RuntimeSkillUsage | null;
};

function EmptyPanelState({
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
        "rounded-[var(--radius-shell)] border border-border bg-[color:var(--color-control-panel-bg)] p-3 shadow-sm",
        className,
      )}
    >
      {children}
    </section>
  );
}

function formatSignedCount(value: number, sign: "+" | "-") {
  return `${sign}${new Intl.NumberFormat("zh-CN").format(value)}`;
}

function getDiffFileDomId(path: string) {
  return `diff-file-${encodeURIComponent(path)}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

function formatBranchLabel(overview: GitDiffOverview) {
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

function DiffSourceSelect({
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

function DiffSummaryCard({
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

function DiffFileCard({
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

function getFirstNonEmptySource(overview: GitDiffOverview | null) {
  if (!overview) {
    return null;
  }

  return DIFF_SOURCES.find((source) => overview.sources[source].totalFiles > 0) ?? null;
}

function createCommitPlanCardState(groups: CommitPlanGroup[]): CommitPlanCardState[] {
  return groups.map((group) => ({
    ...group,
    status: "idle",
    error: null,
  }));
}

async function generateCommitPlan(
  selectedFiles: GitDiffFile[],
): Promise<CommitPlanGenerationResult> {
  const result = await window.desktopApi.worker.generateCommitPlan({
    selectedFiles,
  });

  return {
    groups: createCommitPlanCardState(result.groups),
    skillUsage: result.skillUsage ?? null,
  };
}

function buildCommitMessage(group: Pick<CommitPlanGroup, "title" | "description">): string {
  const title = group.title.trim();
  const description = group.description.trim();

  if (!description) {
    return title;
  }

  return `${title}\n\n${description}`;
}

function getCommitPlanStatusMeta(status: CommitPlanStatus): {
  label: string;
  variant: "secondary" | "warning" | "success" | "destructive";
} {
  switch (status) {
    case "staging":
      return { label: "暂存中", variant: "warning" };
    case "staged":
      return { label: "已暂存", variant: "success" };
    case "committing":
      return { label: "提交中", variant: "warning" };
    case "committed":
      return { label: "已提交", variant: "success" };
    case "error":
      return { label: "失败", variant: "destructive" };
    default:
      return { label: "待处理", variant: "secondary" };
  }
}

function CommitPlanCard({
  group,
  index,
  disabled,
  onJumpToFile,
  onTitleChange,
  onDescriptionChange,
  onStage,
  onCommit,
}: {
  group: CommitPlanCardState;
  index: number;
  disabled: boolean;
  onJumpToFile: (path: string) => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onStage: () => void;
  onCommit: () => void;
}) {
  const statusMeta = getCommitPlanStatusMeta(group.status);
  const isBusy = group.status === "staging" || group.status === "committing";
  const isCommitted = group.status === "committed";
  const shouldCollapseFiles = group.filePaths.length > DEFAULT_VISIBLE_COMMIT_FILES;
  const [filesExpanded, setFilesExpanded] = useState(false);
  const visibleFilePaths =
    shouldCollapseFiles && !filesExpanded
      ? group.filePaths.slice(0, DEFAULT_VISIBLE_COMMIT_FILES)
      : group.filePaths;
  const hiddenFileCount = Math.max(
    0,
    group.filePaths.length - DEFAULT_VISIBLE_COMMIT_FILES,
  );

  return (
    <div
      className={cn(
        "rounded-[var(--radius-shell)] border border-[color:var(--color-control-border)] bg-[color:var(--color-control-bg)] px-3.5 py-3 shadow-[var(--color-control-shadow)] transition-all relative overflow-hidden",
        isCommitted && "bg-emerald-50/60 dark:bg-emerald-950/20",
        isBusy && "opacity-95 pointer-events-none",
      )}
    >
      <div className="flex items-center justify-between gap-3 relative z-10">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-6 items-center rounded-full bg-[color:var(--color-control-panel-bg)] px-2.5 text-[11px] font-medium text-[color:var(--color-text-secondary)] shadow-[var(--color-control-shadow)]">
            提交 {index + 1}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {group.filePaths.length} 个文件
          </span>
        </div>
        <Badge variant={statusMeta.variant} className="shrink-0">
          {statusMeta.label}
        </Badge>
      </div>

      <textarea
        rows={2}
        value={group.title}
        aria-label={`提交 ${index + 1} 标题`}
        disabled={disabled || isBusy}
        onChange={(event) => onTitleChange(event.target.value)}
        onInput={(event) => {
          const element = event.currentTarget;
          element.style.height = "auto";
          element.style.height = `${element.scrollHeight}px`;
        }}
        ref={(element) => {
          if (!element) return;
          element.style.height = "auto";
          element.style.height = `${element.scrollHeight}px`;
        }}
        className="mt-2 min-h-[52px] w-full resize-none rounded-[var(--radius-shell)] bg-background/78 px-3 py-2 text-[13px] font-semibold leading-5 text-foreground outline-none ring-1 ring-[color:var(--color-control-border)] transition-[background-color,box-shadow] placeholder:text-muted-foreground focus-visible:bg-[color:var(--color-control-bg-active)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-control-focus-ring)] disabled:cursor-not-allowed"
        placeholder="输入提交标题..."
      />

      <textarea
        rows={3}
        value={group.description}
        aria-label={`提交 ${index + 1} 说明`}
        disabled={disabled || isBusy}
        onChange={(event) => onDescriptionChange(event.target.value)}
        className="mt-2 min-h-[84px] w-full resize-y rounded-[var(--radius-shell)] bg-background/78 px-3 py-2.5 text-[12px] leading-6 text-foreground outline-none ring-1 ring-[color:var(--color-control-border)] transition-[background-color,box-shadow] placeholder:text-muted-foreground focus-visible:bg-[color:var(--color-control-bg-active)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-control-focus-ring)] disabled:cursor-not-allowed"
        placeholder="输入提交说明（支持 Markdown）..."
      />

      {group.reason ? (
        <div className="mt-2 rounded-[var(--radius-shell)] bg-[color:var(--color-control-panel-bg)] px-3 py-2 text-[11px] leading-5 text-muted-foreground">
          {group.reason}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-2">
        {visibleFilePaths.map((filePath) => (
          <button
            key={filePath}
            type="button"
            aria-label={`定位到 ${filePath}`}
            onClick={() => onJumpToFile(filePath)}
            className="max-w-full truncate rounded-[var(--radius-shell)] bg-[color:var(--color-control-panel-bg)] px-2.5 py-1.5 text-left text-[11px] leading-5 text-muted-foreground shadow-[var(--color-control-shadow)] transition-colors hover:bg-[color:var(--color-selection-muted-bg)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-control-focus-ring)]"
          >
            {filePath}
          </button>
        ))}
      </div>

      {shouldCollapseFiles ? (
        <button
          type="button"
          onClick={() => setFilesExpanded((current) => !current)}
          className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium leading-5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-control-focus-ring)] rounded-[var(--radius-shell)]"
        >
          {filesExpanded ? (
            <>
              <ChevronUpIcon className="size-3.5" />
              收起文件列表
            </>
          ) : (
            <>
              <ChevronDownIcon className="size-3.5" />
              展开其余 {hiddenFileCount} 个文件
            </>
          )}
        </button>
      ) : null}

      {group.error ? (
        <div className="mt-2 rounded-[var(--radius-shell)] bg-rose-500/8 px-2.5 py-2 text-[12px] leading-5 text-rose-700">
          {group.error}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-end gap-2 border-t border-[color:var(--color-control-border)]/70 pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onStage}
          disabled={disabled || isBusy || isCommitted || group.filePaths.length === 0}
          className={cn(
            "h-8 px-3 text-[12px] transition-all",
            group.status === "staging" && "opacity-80 disabled:opacity-80 text-foreground border-[color:var(--color-control-focus-ring)]"
          )}
        >
          {group.status === "staging" ? (
            <RefreshCwIcon className="size-3.5 animate-spin text-[color:var(--color-control-focus-ring)]" />
          ) : (
            <PlusIcon className="size-3.5" />
          )}
          {group.status === "staging" ? "暂存中…" : "暂存本组"}
        </Button>

        <Button
          type="button"
          size="sm"
          onClick={onCommit}
          disabled={disabled || isBusy || isCommitted || !group.title.trim() || group.filePaths.length === 0}
          className={cn(
            "h-8 px-3 text-[12px] transition-all",
            group.status === "committing" && "opacity-100 disabled:opacity-100 bg-foreground/90"
          )}
        >
          {group.status === "committing" ? (
            <RefreshCwIcon className="size-3.5 animate-spin" />
          ) : group.status === "committed" ? (
            <CheckCheckIcon className="size-3.5" />
          ) : (
            <CheckIcon className="size-3.5" />
          )}
          {group.status === "committing" ? "提交中…" : group.status === "committed" ? "已提交" : "提交本组"}
        </Button>
      </div>
    </div>
  );
}

export function DiffWorkbenchContent({
  onClose,
  overview,
  isLoading,
  onRefresh,
  className,
}: DiffWorkbenchContentProps) {
  // ── State: diff layout ──────────────────────────────────────────────
  const [layout, setLayout] = useState<"vertical" | "horizontal">(diffWorkbenchDraft.layout);

  // ── State: diff source & expansion ──────────────────────────────────
  const [selectedDiffSource, setSelectedDiffSource] = useState<GitDiffSource>(
    diffWorkbenchDraft.selectedDiffSource,
  );

  // ── State: file selection ───────────────────────────────────────────
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [selectedPathsChanged, setSelectedPathsChanged] = useState(false);
  const [expandedDiffPaths, setExpandedDiffPaths] = useState<Set<string>>(new Set());

  // ── State: commit plan ──────────────────────────────────────────────
  const [commitPlanGroups, setCommitPlanGroups] = useState(diffWorkbenchDraft.commitPlanGroups);
  const [commitPlanSkillUsage, setCommitPlanSkillUsage] = useState(
    diffWorkbenchDraft.commitPlanSkillUsage,
  );
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isCommittingAll, setIsCommittingAll] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const [commitPlanError, setCommitPlanError] = useState<string | null>(null);
  const [commitAllProgress, setCommitAllProgress] = useState({ current: 0, total: 0 });

  // ── Effects ─────────────────────────────────────────────────────────
  useEffect(() => {
    setSelectedPaths(new Set());
    setSelectedPathsChanged(false);
    setCommitPlanError(null);
  }, [selectedDiffSource, overview]);

  useEffect(() => {
    if (!overview) return;
    setSelectedDiffSource((current) => {
      if (overview.sources[current].totalFiles > 0) return current;
      return getFirstNonEmptySource(overview) ?? current;
    });
  }, [overview]);

  useEffect(() => {
    diffWorkbenchDraft = {
      layout,
      selectedDiffSource,
      commitPlanGroups,
      commitPlanSkillUsage,
    };
  }, [
    commitPlanGroups,
    commitPlanSkillUsage,
    layout,
    selectedDiffSource,
  ]);

  useEffect(() => {
    if (commitPlanGroups.length === 0) {
      setCommitPlanSkillUsage(null);
    }
  }, [commitPlanGroups.length]);

  useEffect(() => {
    if (!overview) {
      return;
    }

    setExpandedDiffPaths(new Set());
  }, [overview, selectedDiffSource]);

  // ── Handlers: selection ─────────────────────────────────────────────
  const handleToggleSelection = useCallback((paths: string[], isSelected: boolean) => {
    setCommitPlanError(null);
    setSelectedPaths((current) => {
      const next = new Set(current);
      for (const p of paths) {
        if (isSelected) next.add(p);
        else next.delete(p);
      }
      return next;
    });
    setSelectedPathsChanged(true);
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!overview) return;
    setCommitPlanError(null);
    const files = overview.sources[selectedDiffSource].files;
    if (selectedPaths.size === files.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(files.map((f) => f.path)));
    }
    setSelectedPathsChanged(true);
  }, [overview, selectedDiffSource, selectedPaths]);

  // ── Handlers: stage / unstage ───────────────────────────────────────
  const handleStageSelected = useCallback(async () => {
    if (selectedPaths.size === 0) return;
    setCommitPlanError(null);
    setIsStaging(true);
    try {
      await window.desktopApi.git.stageFiles(Array.from(selectedPaths));
      await onRefresh();
    } finally {
      setIsStaging(false);
    }
  }, [selectedPaths, onRefresh]);

  const handleUnstageSelected = useCallback(async () => {
    if (selectedPaths.size === 0) return;
    setCommitPlanError(null);
    setIsStaging(true);
    try {
      await window.desktopApi.git.unstageFiles(Array.from(selectedPaths));
      await onRefresh();
    } finally {
      setIsStaging(false);
    }
  }, [selectedPaths, onRefresh]);

  const handlePush = useCallback(async () => {
    setIsPushing(true);
    try {
      await window.desktopApi.git.push();
      await onRefresh();
    } finally {
      setIsPushing(false);
    }
  }, [onRefresh]);

  const handlePull = useCallback(async () => {
    setIsPulling(true);
    try {
      await window.desktopApi.git.pull();
      await onRefresh();
    } finally {
      setIsPulling(false);
    }
  }, [onRefresh]);

  const patchCommitPlanGroup = useCallback((
    groupId: string,
    updater: (group: CommitPlanCardState) => CommitPlanCardState,
  ) => {
    setCommitPlanGroups((current) =>
      current.map((group) => (group.id === groupId ? updater(group) : group)),
    );
  }, []);

  const handleGeneratePlan = useCallback(async () => {
    if (!overview) return;
    setCommitPlanError(null);
    const files = overview.sources[selectedDiffSource].files.filter((f) =>
      selectedPaths.has(f.path),
    );
    if (files.length === 0) return;

    setIsGeneratingPlan(true);
    try {
      const result = await generateCommitPlan(files);
      setCommitPlanGroups(result.groups);
      setCommitPlanSkillUsage(result.skillUsage);
      setSelectedPathsChanged(false);
    } catch (err) {
      const message = getErrorMessage(err, "生成提交计划失败");
      setCommitPlanError(message);
      // eslint-disable-next-line no-console
      console.error("[DiffPanel] generateCommitPlan failed:", message);
    } finally {
      setIsGeneratingPlan(false);
    }
  }, [overview, selectedDiffSource, selectedPaths]);

  const handlePlanTitleChange = useCallback((groupId: string, value: string) => {
    patchCommitPlanGroup(groupId, (group) => ({
      ...group,
      title: value.replace(/\r?\n/g, " "),
      status: group.status === "error" ? "idle" : group.status,
      error: null,
    }));
  }, [patchCommitPlanGroup]);

  const handlePlanDescriptionChange = useCallback((groupId: string, value: string) => {
    patchCommitPlanGroup(groupId, (group) => ({
      ...group,
      description: value,
      status: group.status === "error" ? "idle" : group.status,
      error: null,
    }));
  }, [patchCommitPlanGroup]);

  const handleStagePlanGroup = useCallback(async (groupId: string) => {
    const group = commitPlanGroups.find((item) => item.id === groupId);
    if (!group || group.filePaths.length === 0) return;

    setCommitPlanError(null);
    patchCommitPlanGroup(groupId, (current) => ({
      ...current,
      status: "staging",
      error: null,
    }));

    try {
      await window.desktopApi.git.stageFiles(group.filePaths);
      patchCommitPlanGroup(groupId, (current) => ({
        ...current,
        status: "staged",
        error: null,
      }));
      await onRefresh();
    } catch (err) {
      const message = getErrorMessage(err, "暂存失败");
      patchCommitPlanGroup(groupId, (current) => ({
        ...current,
        status: "error",
        error: message,
      }));
      setCommitPlanError(message);
    }
  }, [commitPlanGroups, onRefresh, patchCommitPlanGroup]);

  const handleCommitPlanGroup = useCallback(async (groupId: string) => {
    const group = commitPlanGroups.find((item) => item.id === groupId);
    if (!group || !group.title.trim() || group.filePaths.length === 0) return false;

    setCommitPlanError(null);
    patchCommitPlanGroup(groupId, (current) => ({
      ...current,
      status: "committing",
      error: null,
    }));

    try {
      await window.desktopApi.git.commit({
        message: buildCommitMessage(group),
        paths: group.filePaths,
      });
      setCommitPlanGroups((current) => current.filter((item) => item.id !== groupId));
      setSelectedPathsChanged(false);
      await onRefresh();
      return true;
    } catch (err) {
      const message = getErrorMessage(err, "提交失败");
      patchCommitPlanGroup(groupId, (current) => ({
        ...current,
        status: "error",
        error: message,
      }));
      setCommitPlanError(message);
      return false;
    }
  }, [commitPlanGroups, onRefresh, patchCommitPlanGroup]);

  const handleCommitAllPlanGroups = useCallback(async () => {
    if (commitPlanGroups.length === 0) return;

    const groupIds = commitPlanGroups.map((group) => group.id);
    setCommitPlanError(null);
    setIsCommittingAll(true);
    setCommitAllProgress({ current: 0, total: groupIds.length });

    try {
      for (let index = 0; index < groupIds.length; index += 1) {
        setCommitAllProgress({ current: index + 1, total: groupIds.length });
        const success = await handleCommitPlanGroup(groupIds[index]);
        if (!success) {
          break;
        }
      }
    } finally {
      setIsCommittingAll(false);
      setCommitAllProgress({ current: 0, total: 0 });
    }
  }, [commitPlanGroups, handleCommitPlanGroup]);

  const handleClearPlan = useCallback(() => {
    setCommitPlanError(null);
    setCommitPlanGroups([]);
    setCommitPlanSkillUsage(null);
  }, []);

  // ── Handlers: file expansion ────────────────────────────────────────
  const handleJumpToFile = useCallback((path: string) => {
    setExpandedDiffPaths((current) => {
      const next = new Set(current);
      next.add(path);
      return next;
    });

    window.requestAnimationFrame(() => {
      document.getElementById(getDiffFileDomId(path))?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  // ── Derived values ──────────────────────────────────────────────────
  const currentSourceSnapshot = overview?.sources[selectedDiffSource] ?? EMPTY_SOURCE_SNAPSHOT;
  const hasAnyChanges = DIFF_SOURCES.some(
    (source) => (overview?.sources[source]?.totalFiles ?? 0) > 0,
  );
  const meta = DIFF_SOURCE_META[selectedDiffSource];
  const selectedFiles = currentSourceSnapshot.files.filter((file) => selectedPaths.has(file.path));
  const hasBusyPlanGroup = commitPlanGroups.some(
    (group) => group.status === "staging" || group.status === "committing",
  );
  const isPlanBusy = isGeneratingPlan || hasBusyPlanGroup || isCommittingAll;
  const canGeneratePlan = selectedFiles.length > 0 && !isPlanBusy;
  const canCommitAll =
    commitPlanGroups.length > 0 &&
    commitPlanGroups.every(
      (group) => group.title.trim().length > 0 && group.filePaths.length > 0,
    ) &&
    !isPlanBusy;
  const generateTooltip = isGeneratingPlan
    ? "正在生成提交计划…"
    : selectedFiles.length === 0
      ? "请先勾选需要分析的文件"
      : `按已勾选 ${selectedFiles.length} 个文件生成`;
  const commitAllTooltip = isCommittingAll
    ? `依次提交全部（${commitAllProgress.current}/${commitAllProgress.total}）`
    : commitPlanGroups.length === 1
      ? "提交当前计划"
      : "依次提交全部";
  const showSparklesHint = selectedPathsChanged && commitPlanGroups.length > 0;
  const pendingCommitPlanSkillUsage = getRuntimeSkillUsage(
    "commit",
    "right-panel.commit-plan",
  );
  const visibleCommitPlanSkillUsage =
    commitPlanSkillUsage ?? (isGeneratingPlan ? pendingCommitPlanSkillUsage : null);
  const showCommitPlanSection =
    commitPlanGroups.length > 0 || isGeneratingPlan || commitPlanError !== null;

  const stageSelectionControl =
    selectedDiffSource === "unstaged" || selectedDiffSource === "all" ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className="size-7 rounded-[var(--radius-shell)]"
            onClick={handleStageSelected}
            disabled={selectedPaths.size === 0 || isStaging}
            aria-label="暂存选中文件"
          >
            <PlusIcon className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>暂存选中文件</TooltipContent>
      </Tooltip>
    ) : selectedDiffSource === "staged" ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className="size-7 rounded-[var(--radius-shell)]"
            onClick={handleUnstageSelected}
            disabled={selectedPaths.size === 0 || isStaging}
            aria-label="取消暂存选中文件"
          >
            <MinusIcon className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>取消暂存选中文件</TooltipContent>
      </Tooltip>
    ) : null;

  const commitPlanActionControls = (
    <div className="flex items-center gap-1">
      {commitPlanGroups.length > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isCommittingAll ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-7 rounded-[var(--radius-shell)] shrink-0 transition-all",
                isCommittingAll ? "bg-foreground/90 text-background px-2.5" : "w-7 p-0 text-muted-foreground hover:text-foreground"
              )}
              onClick={handleCommitAllPlanGroups}
              disabled={!canCommitAll}
              aria-label={commitPlanGroups.length === 1 ? "提交当前计划" : "依次提交全部"}
            >
              {isCommittingAll ? (
                <>
                  <RefreshCwIcon className="size-3.5 animate-spin mr-1.5" />
                  <span className="text-[11px] font-medium leading-none">{commitAllProgress.current} / {commitAllProgress.total}</span>
                </>
              ) : (
                <CheckCheckIcon className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{commitAllTooltip}</TooltipContent>
        </Tooltip>
      ) : null}

      {commitPlanGroups.length > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-[var(--radius-shell)] shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={handleClearPlan}
              disabled={isPlanBusy}
            >
              <TrashIcon className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>清空计划</TooltipContent>
        </Tooltip>
      ) : null}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isGeneratingPlan || showSparklesHint ? "default" : "ghost"}
            size="sm"
            className={cn(
              "h-7 rounded-[var(--radius-shell)] shrink-0 transition-all gap-1.5",
              isGeneratingPlan || showSparklesHint ? "bg-foreground/90 text-background px-2.5" : "w-7 p-0 text-muted-foreground hover:text-foreground",
            )}
            onClick={handleGeneratePlan}
            disabled={!canGeneratePlan}
          >
            {isGeneratingPlan ? (
              <>
                <SparklesIcon className="size-3.5 animate-pulse" />
                <span className="text-[11px] font-medium leading-none">生成中…</span>
              </>
            ) : showSparklesHint ? (
              <>
                <SparklesIcon className="size-3.5" />
                <span className="text-[11px] font-medium leading-none">重新生成</span>
              </>
            ) : (
              <SparklesIcon className="size-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{generateTooltip}</TooltipContent>
      </Tooltip>
    </div>
  );

  const compactCommitPlanPanel = (
    <div className="rounded-[calc(var(--radius-shell)+2px)] bg-[color:var(--color-control-panel-bg)] p-2.5 shadow-[var(--color-control-shadow)]">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="shrink-0 text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-text-secondary)]">
          提交计划
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge variant="secondary">已选 {selectedPaths.size}</Badge>
          <Badge variant="secondary">计划 {commitPlanGroups.length}</Badge>
          {visibleCommitPlanSkillUsage ? (
            <SkillUsageStrip
              skillUsages={[visibleCommitPlanSkillUsage]}
              leadLabel="由"
            />
          ) : null}
        </div>
      </div>

      {commitPlanError ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-2 rounded-[var(--radius-shell)] bg-rose-500/8 px-3 py-2 text-[12px] leading-5 text-rose-700"
        >
          {commitPlanError}
        </div>
      ) : null}

      {showSparklesHint ? (
        <div className="mt-2 rounded-[var(--radius-shell)] bg-secondary/30 px-3 py-2 text-[12px] leading-5 text-muted-foreground">
          勾选已更新，重新生成后计划会同步当前文件集合。
        </div>
      ) : null}

      <div className="mt-2">
        {commitPlanGroups.length === 0 ? (
          isGeneratingPlan ? (
            <div className="flex min-h-[300px] items-center justify-center px-3 py-6">
              <div className="flex w-full max-w-[360px] flex-col items-center justify-center px-4 py-8 text-center">
                <SparklesIcon className="mb-3 size-6 shrink-0 animate-pulse text-muted-foreground" />
                <p className="text-[12px] font-medium text-foreground">AI 正在阅读和分析代码变动</p>
                <p className="mt-1 text-balance text-[11px] text-muted-foreground">分析完成后会自动生成提交计划。</p>
              </div>
            </div>
          ) : (
            <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-3 py-2.5 text-[12px] leading-5 text-muted-foreground shadow-[var(--color-control-shadow)]">
              <p className="font-medium text-foreground">
                {selectedPaths.size > 0 ? "已选文件，点击右上角生成计划。" : "先勾选文件，再生成计划。"}
              </p>
              <p className="mt-1">计划会按当前勾选的文件生成。</p>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-2">
            {commitPlanGroups.map((group, index) => (
              <CommitPlanCard
                key={group.id}
                group={group}
                index={index}
                disabled={isPlanBusy}
                onJumpToFile={handleJumpToFile}
                onTitleChange={(value) => handlePlanTitleChange(group.id, value)}
                onDescriptionChange={(value) => handlePlanDescriptionChange(group.id, value)}
                onStage={() => void handleStagePlanGroup(group.id)}
                onCommit={() => void handleCommitPlanGroup(group.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const diffFileList = (
    <div className="flex flex-col gap-3">
      {currentSourceSnapshot.files.map((file) => (
        <div key={file.path} id={getDiffFileDomId(file.path)} className="scroll-mt-2">
          <DiffFileCard
            file={file}
            layout={layout}
            expanded={expandedDiffPaths.has(file.path)}
            onExpandedChange={(open) => {
              setExpandedDiffPaths((current) => {
                const next = new Set(current);
                if (open) {
                  next.add(file.path);
                } else {
                  next.delete(file.path);
                }
                return next;
              });
            }}
            selected={selectedPaths.has(file.path)}
            onSelectedChange={(selected) =>
              handleToggleSelection([file.path], selected)
            }
          />
        </div>
      ))}
    </div>
  );

  function PanelHeader({ children }: { children: React.ReactNode }) {
    return (
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-7 w-7 shrink-0 rounded-[var(--radius-shell)] text-muted-foreground hover:bg-[color:var(--color-control-bg-hover)]"
          aria-label="关闭右侧边栏"
        >
          <XIcon className="size-4" />
        </Button>
      </div>
    );
  }

  if (!overview) {
    return (
      <section className={cn("flex h-full min-h-0 flex-col bg-background px-4 py-4", className)}>
        <PanelHeader>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-text-secondary)]">边栏</p>
        </PanelHeader>
        <div className="mt-4">
          <EmptyPanelState
            title={isLoading ? "正在读取变更" : "准备读取变更"}
            description="稍等一下，正在从当前 workspace 拉取 Git 变更快照。"
          />
        </div>
      </section>
    );
  }

  if (!overview.isGitRepo) {
    return (
      <section className={cn("flex h-full min-h-0 flex-col bg-background px-4 py-4", className)}>
        <PanelHeader>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-text-secondary)]">边栏</p>
        </PanelHeader>
        <div className="mt-2">
          <h3 className="text-lg font-semibold text-foreground">工作区边栏</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            当前 workspace 没有可读取的 Git 仓库。
          </p>
        </div>
        <div className="mt-4">
          <EmptyPanelState
            title="Git 仓库未就绪"
            description="先在当前 workspace 初始化 Git 仓库，这里就能展示工作区改动。"
          />
        </div>
      </section>
    );
  }

  // ── Render: main content ────────────────────────────────────────────
  return (
    <section className={cn("flex h-full min-h-0 flex-col bg-background px-4 py-4", className)}>
      <PanelHeader>
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-text-secondary)]">边栏</p>
          <h3 className="text-lg font-semibold text-foreground">工作区边栏</h3>
          <p className="mt-1 text-xs text-muted-foreground">{meta.description}</p>
        </div>
      </PanelHeader>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              onClick={onRefresh}
              className="h-7 rounded-[var(--radius-shell)] px-2.5 text-[12px] text-muted-foreground bg-secondary/50 border-0 hover:bg-secondary/80 flex items-center gap-1.5 shrink-0"
              aria-label="刷新 diff"
            >
              <RefreshCwIcon className={cn("size-3.5", isLoading && "animate-spin")} />
              <span>刷新</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>刷新 diff</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLayout((prev) => (prev === "vertical" ? "horizontal" : "vertical"))}
              className="h-7 rounded-[var(--radius-shell)] px-2.5 text-[12px] text-muted-foreground bg-secondary/50 border-0 hover:bg-secondary/80 flex items-center gap-1.5 shrink-0"
              aria-label="切换 diff 对比方向"
            >
              {layout === "vertical" ? (
                <ColumnsIcon className="size-3.5" />
              ) : (
                <ListIcon className="size-3.5" />
              )}
              <span>{layout === "vertical" ? "横向对比" : "竖向对比"}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {layout === "vertical" ? "切换为横向对比" : "切换为竖向对比"}
          </TooltipContent>
        </Tooltip>

        <div className="w-[1px] h-4 bg-border/50 mx-1 shrink-0" />

        <Button
          type="button"
          variant="outline"
          onClick={handlePull}
          disabled={isPulling}
          className="h-7 rounded-[var(--radius-shell)] px-2.5 text-[12px] text-muted-foreground bg-secondary/50 border-0 hover:bg-secondary/80 flex items-center gap-1.5 shrink-0"
          aria-label="拉取代码"
        >
          <DownloadIcon className={cn("size-3.5", isPulling && "animate-bounce")} />
          <span>
            {isPulling
              ? "拉取中..."
              : overview?.branch.behind && overview.branch.behind > 0
                ? `拉取 (${overview.branch.behind})`
                : "拉取"}
          </span>
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={handlePush}
          disabled={isPushing}
          className="h-7 rounded-[var(--radius-shell)] px-2.5 text-[12px] text-muted-foreground bg-secondary/50 border-0 hover:bg-secondary/80 flex items-center gap-1.5 shrink-0"
          aria-label="推送代码"
        >
          <UploadIcon className={cn("size-3.5", isPushing && "animate-bounce")} />
          <span>
            {isPushing
              ? "推送中..."
              : overview?.branch.ahead && overview.branch.ahead > 0
                ? `推送 (${overview.branch.ahead})`
                : "推送"}
          </span>
        </Button>
      </div>

      {/* ── Fixed header: branch info + source selector ───────────── */}
      <div className="mb-3 flex flex-col gap-3">
        {/* Branch info bar */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-2 py-1 text-[11px] text-foreground">
            {formatBranchLabel(overview)}
          </span>
          <span className="inline-flex items-center rounded-[var(--radius-shell)] bg-secondary/50 px-2 py-1 text-[11px] text-muted-foreground">
            {overview.branch.hasChanges ? "有未提交改动" : "工作区干净"}
          </span>
          {currentSourceSnapshot.files.length > 0 && (
            <div className="ml-1 flex items-center gap-2 text-[11px] font-medium">
              <span className="text-[color:var(--color-diff-add-text)]">{formatSignedCount(currentSourceSnapshot.totalAdditions, "+")}</span>
              <span className="text-[color:var(--color-diff-del-text)]">{formatSignedCount(currentSourceSnapshot.totalDeletions, "-")}</span>
            </div>
          )}
        </div>

        {/* Diff source selector */}
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <DiffSourceSelect
              selectedSource={selectedDiffSource}
              overview={overview}
              onChange={setSelectedDiffSource}
            />
          </div>
        </div>
      </div>

      {/* ── Scrollable content area ───────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <SectionSurface className="flex h-full min-h-0 flex-col">
          {/* Empty state variants */}
          {!hasAnyChanges ? (
            <div className="flex min-h-0 flex-1 items-center justify-center py-6">
              <EmptyPanelState
                title="暂无改动"
                description="当前 workspace 没有未提交改动；一旦出现修改、删除或新增文件，这里会自动刷新。"
              />
            </div>
          ) : currentSourceSnapshot.files.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center py-6">
              <EmptyPanelState
                title={`${meta.label}为空`}
                description="这个来源当前没有可展示的改动，可以切换到其他来源继续查看。"
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2.5 text-[12px] text-muted-foreground hover:bg-secondary/80 bg-secondary/50 rounded-[var(--radius-shell)]"
                    onClick={handleSelectAll}
                  >
                    {selectedPaths.size > 0 &&
                      selectedPaths.size === currentSourceSnapshot.files.length
                      ? "取消全选"
                      : "全选"}
                  </Button>
                  <span className="truncate text-[12px] text-muted-foreground">
                    {currentSourceSnapshot.files.length} 个文件
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {stageSelectionControl}
                  {commitPlanActionControls}
                </div>
              </div>

              {showCommitPlanSection ? (
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    {compactCommitPlanPanel}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    {diffFileList}
                  </div>
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  {diffFileList}
                </div>
              )}
            </div>
          )}
        </SectionSurface>
      </div>
    </section>
  );
}

type DiffPanelProps = Omit<DiffWorkbenchContentProps, "className"> & {
  open: boolean;
};

export function DiffPanel(props: DiffPanelProps) {
  const { size: panelWidth, handleMouseDown: handlePanelResize } = useResizable({
    axis: "horizontal",
    initial: typeof window !== "undefined" ? window.innerWidth * 0.5 : 900,
    min: 400,
    max: typeof window !== "undefined" ? window.innerWidth - 100 : 900,
    invert: true,
  });
  const drawerBase =
    "fixed right-0 top-0 bottom-0 z-50 flex h-full min-h-0 flex-col bg-background transform transition-transform duration-300 ease-in-out";
  const drawerClosed = `${drawerBase} translate-x-full`;
  const drawerOpen = `${drawerBase} translate-x-0`;
  const drawerClass = props.open ? drawerOpen : drawerClosed;

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/10 transition-opacity duration-300",
          props.open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={props.onClose}
        aria-hidden="true"
      />
      <aside className={drawerClass} style={{ width: props.open ? panelWidth : 900 }}>
        {props.open ? (
          <div
            className="absolute left-[-2px] top-0 bottom-0 z-50 flex w-[5px] cursor-col-resize justify-center group"
            onMouseDown={handlePanelResize}
          >
            <div className="h-full w-[2px] bg-primary/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-active:opacity-100" />
          </div>
        ) : null}
        <DiffWorkbenchContent {...props} />
      </aside>
    </>
  );
}
