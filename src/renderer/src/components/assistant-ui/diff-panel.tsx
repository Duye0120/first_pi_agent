import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDownIcon,
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
  UserIcon,
  FolderTreeIcon,
  ListTreeIcon,
  TrashIcon,
} from "lucide-react";
import type {
  GitDiffFile,
  GitDiffOverview,
  GitDiffSource,
  GitDiffSourceSnapshot,
} from "@shared/contracts";
import { Badge } from "@renderer/components/assistant-ui/badge";
import { Button } from "@renderer/components/assistant-ui/button";
import { DiffView } from "@renderer/components/DiffView";
import { CommitDescriptionEditor } from "@renderer/components/ui/commit-description-editor";
import { FileTreeView } from "@renderer/components/assistant-ui/diff-tree";
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

type ExpandedDiffState = Partial<Record<GitDiffSource, string[]>>;

type DiffPanelProps = {
  open: boolean;
  onClose: () => void;
  overview: GitDiffOverview | null;
  isLoading: boolean;
  onRefresh: () => void | Promise<void>;
};

function EmptyPanelState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-[220px] place-items-center rounded-[6px] border border-border bg-[color:var(--color-control-panel-bg)] px-6 py-7 text-center">
      <div className="max-w-[260px]">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
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
        "rounded-[6px] border border-border bg-[color:var(--color-control-panel-bg)] p-3 shadow-sm",
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
        className="h-7 w-full rounded-[6px] px-2.5 text-[12px] border-0 bg-secondary/50 hover:bg-secondary/80 justify-between items-center"
      >
        <span className="truncate font-medium text-foreground">
          {selectedMeta.label} <span className="text-muted-foreground font-normal ml-1">({selectedSnapshot.totalFiles})</span>
        </span>
      </SelectTrigger>

      <SelectContent className="min-w-[240px] rounded-[6px]">
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
    <div className="rounded-[6px] bg-[color:var(--color-control-bg)] px-3 py-2 shadow-none">
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
}: {
  file: GitDiffFile;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  layout?: "vertical" | "horizontal";
  className?: string;
}) {
  return (
    <Collapsible
      open={expanded}
      onOpenChange={onExpandedChange}
      className={cn("flex flex-col min-h-0 overflow-hidden rounded-[6px] border border-border bg-[color:var(--color-control-panel-bg)]", className)}
    >
      <CollapsibleTrigger
        className={cn(
          "flex shrink-0 w-full items-start gap-3 px-3 py-2 text-left transition-colors",
          expanded ? "bg-[color:var(--color-control-bg-hover)]" : "hover:bg-[color:var(--color-control-bg-hover)]/80",
        )}
      >
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
        </div>
      </CollapsibleTrigger>

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

function arePathListsEqual(left: string[] | undefined, right: string[]) {
  if (!left || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function getFirstNonEmptySource(overview: GitDiffOverview | null) {
  if (!overview) {
    return null;
  }

  return DIFF_SOURCES.find((source) => overview.sources[source].totalFiles > 0) ?? null;
}

function hydrateExpandedState(current: ExpandedDiffState, overview: GitDiffOverview) {
  let changed = false;
  const next: ExpandedDiffState = { ...current };

  for (const source of DIFF_SOURCES) {
    const files = overview.sources[source].files;
    const existing = current[source];

    if (!existing) {
      next[source] = files[0] ? [files[0].path] : [];
      changed = true;
      continue;
    }

    const filtered = existing.filter((path) => files.some((file) => file.path === path));
    const normalized =
      filtered.length > 0 || existing.length === 0
        ? filtered
        : files[0]
          ? [files[0].path]
          : [];

    if (!arePathListsEqual(existing, normalized)) {
      next[source] = normalized;
      changed = true;
    }
  }

  return changed ? next : current;
}

// ─── Mock commit message generator ────────────────────────────────────────

async function generateCommitMessage(
  _selectedFiles: GitDiffFile[],
  _diffs: string,
): Promise<{ title: string; description: string }> {
  // TODO: Replace with actual AI-powered commit message generation.
  // For now, return a mock result with a nice mocked markdown template.

  return {
    title: "feat: update files based on recent changes",
    description: `## Summary of changes

- Updated configuration to support new layout parsing.
- Refactored commit message formatting.
- Resolved styling issues in the diff view panel.

> Note: This is an automatically generated mock description for testing WYSIWYG markdown.`,
  };
}

function DiffPanelInner({
  open,
  onClose,
  overview,
  isLoading,
  onRefresh,
}: DiffPanelProps) {
  // ── State: layout & sizing ──────────────────────────────────────────
  const { size: panelWidth, handleMouseDown: handlePanelResize } = useResizable({
    axis: "horizontal",
    initial: typeof window !== "undefined" ? window.innerWidth * 0.5 : 900,
    min: 400,
    max: typeof window !== "undefined" ? window.innerWidth - 100 : 900,
    invert: true,
  });

  const { size: treeWidth, handleMouseDown: handleTreeResize } = useResizable({
    axis: "horizontal",
    initial: 350,
    min: 200,
    max: Math.max(200, panelWidth - 200),
  });

  const { size: commitPanelHeight, handleMouseDown: handleCommitResize } = useResizable({
    axis: "vertical",
    initial: 240,
    min: 150,
    max: 500,
    invert: true,
  });

  const [layout, setLayout] = useState<"vertical" | "horizontal">("vertical");
  const [viewMode, setViewMode] = useState<"tree" | "list">("tree");

  // ── State: diff source & expansion ──────────────────────────────────
  const [selectedDiffSource, setSelectedDiffSource] = useState<GitDiffSource>("all");
  const [expandedDiffPaths, setExpandedDiffPaths] = useState<ExpandedDiffState>({});
  const diffCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ── State: file selection ───────────────────────────────────────────
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [selectedPathsChanged, setSelectedPathsChanged] = useState(false);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  // ── State: commit ───────────────────────────────────────────────────
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);

  // ── Effects ─────────────────────────────────────────────────────────
  useEffect(() => {
    setSelectedPaths(new Set());
    setSelectedPathsChanged(false);
  }, [selectedDiffSource, overview]);

  useEffect(() => {
    if (!overview && !isLoading) {
      onRefresh();
    }
  }, [isLoading, onRefresh, overview]);

  useEffect(() => {
    if (!overview) return;
    setExpandedDiffPaths((current) => hydrateExpandedState(current, overview));
    setSelectedDiffSource((current) => {
      if (overview.sources[current].totalFiles > 0) return current;
      return getFirstNonEmptySource(overview) ?? current;
    });
  }, [overview]);

  // ── Handlers: selection ─────────────────────────────────────────────
  const handleToggleSelection = useCallback((paths: string[], isSelected: boolean) => {
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
    setIsStaging(true);
    try {
      await window.desktopApi.git.unstageFiles(Array.from(selectedPaths));
      await onRefresh();
    } finally {
      setIsStaging(false);
    }
  }, [selectedPaths, onRefresh]);

  // ── Handlers: commit ────────────────────────────────────────────────
  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) return;
    setIsCommitting(true);
    try {
      await window.desktopApi.git.commit(commitMessage);
      setCommitMessage("");
      setSelectedPathsChanged(false);
      await onRefresh();
    } finally {
      setIsCommitting(false);
    }
  }, [commitMessage, onRefresh]);

  const handlePush = useCallback(async () => {
    setIsPushing(true);
    try {
      await window.desktopApi.git.push();
    } finally {
      setIsPushing(false);
    }
  }, []);

  const handlePull = useCallback(async () => {
    setIsPulling(true);
    try {
      await window.desktopApi.git.pull();
    } finally {
      setIsPulling(false);
    }
  }, []);

  // ── Handler: generate commit message ────────────────────────────────
  const handleGenerateMessage = useCallback(async () => {
    if (!overview) return;
    const files = overview.sources[selectedDiffSource].files.filter((f) =>
      selectedPaths.size === 0 ? true : selectedPaths.has(f.path),
    );
    const diffs = files.map((f) => f.patch).join("\n");

    setIsGeneratingMessage(true);
    try {
      const result = await generateCommitMessage(files, diffs);
      setCommitMessage(result.title + "\n" + result.description);
      setSelectedPathsChanged(false);
    } finally {
      setIsGeneratingMessage(false);
    }
  }, [overview, selectedDiffSource, selectedPaths]);

  // ── Handlers: file expansion ────────────────────────────────────────
  const handleToggleFile = useCallback((path: string, open: boolean) => {
    setExpandedDiffPaths((current) => {
      const sourcePaths = current[selectedDiffSource] ?? [];
      const nextPaths = open
        ? Array.from(new Set([...sourcePaths, path]))
        : sourcePaths.filter((item) => item !== path);

      if (arePathListsEqual(sourcePaths, nextPaths)) return current;

      return {
        ...current,
        [selectedDiffSource]: nextPaths,
      };
    });
  }, [selectedDiffSource]);

  const handleJumpToFile = useCallback((path: string) => {
    setActiveFile(path);
  }, []);

  const bindCardRef = useCallback((path: string, element: HTMLDivElement | null) => {
    diffCardRefs.current[`${selectedDiffSource}:${path}`] = element;
  }, [selectedDiffSource]);

  // ── Derived values ──────────────────────────────────────────────────
  const drawerBase =
    "fixed right-0 top-0 bottom-0 z-50 flex h-full min-h-0 flex-col bg-background px-4 py-4 rounded-[8px] transform transition-transform duration-300 ease-in-out";
  const drawerClosed = `${drawerBase} translate-x-full`;
  const drawerOpen = `${drawerBase} translate-x-0`;
  const drawerClass = open ? drawerOpen : drawerClosed;

  const currentSourceSnapshot = overview?.sources[selectedDiffSource] ?? EMPTY_SOURCE_SNAPSHOT;
  const currentExpandedPaths = expandedDiffPaths[selectedDiffSource] ?? [];
  const expandedPathSet = new Set(currentExpandedPaths);
  const hasAnyChanges = DIFF_SOURCES.some(
    (source) => (overview?.sources[source]?.totalFiles ?? 0) > 0,
  );
  const meta = DIFF_SOURCE_META[selectedDiffSource];

  // Sparkles highlight: selectedPaths changed + commitMessage non-empty
  const showSparklesHint = selectedPathsChanged && commitMessage.trim().length > 0;

  // ── Render: empty states ────────────────────────────────────────────
  function ResizeHandle() {
    return (
      <div
        className="absolute left-[-2px] w-[5px] top-0 bottom-0 cursor-col-resize z-50 group flex justify-center"
        onMouseDown={handlePanelResize}
      >
        <div className="w-[2px] h-full bg-primary/60 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-200" />
      </div>
    );
  }

  function DrawerHeader({ children }: { children: React.ReactNode }) {
    return (
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-7 w-7 shrink-0 rounded-[6px] text-muted-foreground hover:bg-[color:var(--color-control-bg-hover)]"
          aria-label="关闭 Diff 面板"
        >
          <XIcon className="size-4" />
        </Button>
      </div>
    );
  }

  if (!overview) {
    return (
      <aside className={drawerClass} style={{ width: open ? panelWidth : 900 }}>
        {open && <ResizeHandle />}
        <DrawerHeader>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-text-secondary)]">Diff</p>
        </DrawerHeader>
        <div className="mt-4">
          <EmptyPanelState
            title={isLoading ? "正在读取变更" : "准备读取变更"}
            description="稍等一下，正在从当前 workspace 拉取 Git diff 快照。"
          />
        </div>
      </aside>
    );
  }

  if (!overview.isGitRepo) {
    return (
      <aside className={drawerClass} style={{ width: open ? panelWidth : 900 }}>
        {open && <ResizeHandle />}
        <DrawerHeader>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-text-secondary)]">Diff</p>
        </DrawerHeader>
        <div className="mt-2">
          <h3 className="text-lg font-semibold text-foreground">工作区 Diff</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            当前 workspace 没有可读取的 Git 仓库。
          </p>
        </div>
        <div className="mt-4">
          <EmptyPanelState
            title="不是 Git 仓库"
            description="当前 workspace 没有可读取的 Git 仓库，所以这里暂时无法展示 diff。"
          />
        </div>
      </aside>
    );
  }

  // ── Render: main content ────────────────────────────────────────────
  return (
    <aside className={drawerClass} style={{ width: open ? panelWidth : 900 }}>
      {open && <ResizeHandle />}
      <DrawerHeader>
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-text-secondary)]">Diff</p>
          <h3 className="text-lg font-semibold text-foreground">工作区 Diff</h3>
          <p className="mt-1 text-xs text-muted-foreground">{meta.description}</p>
        </div>
      </DrawerHeader>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              onClick={onRefresh}
              className="h-7 rounded-[6px] px-2.5 text-[12px] text-muted-foreground bg-secondary/50 border-0 hover:bg-secondary/80 flex items-center gap-1.5 shrink-0"
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
              className="h-7 rounded-[6px] px-2.5 text-[12px] text-muted-foreground bg-secondary/50 border-0 hover:bg-secondary/80 flex items-center gap-1.5 shrink-0"
              aria-label="切换视图布局"
            >
              {layout === "vertical" ? (
                <ColumnsIcon className="size-3.5" />
              ) : (
                <ListIcon className="size-3.5" />
              )}
              <span>{layout === "vertical" ? "横向对比" : "垂直对比"}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {layout === "vertical" ? "切换为横向对比" : "切换为垂直对比"}
          </TooltipContent>
        </Tooltip>

        <div className="w-[1px] h-4 bg-border/50 mx-1 shrink-0" />

        <Button
          type="button"
          variant="outline"
          onClick={handlePull}
          disabled={isPulling}
          className="h-7 rounded-[6px] px-2.5 text-[12px] text-muted-foreground bg-secondary/50 border-0 hover:bg-secondary/80 flex items-center gap-1.5 shrink-0"
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
          className="h-7 rounded-[6px] px-2.5 text-[12px] text-muted-foreground bg-secondary/50 border-0 hover:bg-secondary/80 flex items-center gap-1.5 shrink-0"
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
          <span className="inline-flex items-center rounded-[6px] bg-[color:var(--color-control-bg)] px-2 py-1 text-[11px] text-foreground">
            {formatBranchLabel(overview)}
          </span>
          <span className="inline-flex items-center rounded-[6px] bg-secondary/50 px-2 py-1 text-[11px] text-muted-foreground">
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
            <EmptyPanelState
              title="暂无改动"
              description="当前 workspace 没有未提交改动；一旦出现修改、删除或新增文件，这里会自动刷新。"
            />
          ) : currentSourceSnapshot.files.length === 0 ? (
            <EmptyPanelState
              title={`${meta.label}为空`}
              description="这个来源当前没有可展示的改动，可以切换到其他来源继续查看。"
            />
          ) : (
            <div className="relative flex min-h-0 flex-1 overflow-hidden">
              {/* ── Left sidebar: tree + commit panel (siblings) ─────── */}
              <div
                className="shrink-0 flex flex-col min-h-0 pr-3"
                style={{ width: treeWidth }}
              >
                {/* ── Tree area (top) ───────────────────────────────── */}
                <div className="flex-1 flex flex-col min-h-0 pt-1">
                  <div className="flex items-center justify-between mb-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2.5 text-[12px] text-muted-foreground hover:bg-secondary/80 bg-secondary/50 rounded-[4px]"
                        onClick={handleSelectAll}
                      >
                        {selectedPaths.size > 0 &&
                          selectedPaths.size === currentSourceSnapshot.files.length
                          ? "取消全选"
                          : "全选"}
                      </Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-[4px] text-muted-foreground hover:bg-secondary/80 bg-secondary/50"
                            onClick={() => setViewMode(v => v === "tree" ? "list" : "tree")}
                          >
                            {viewMode === "tree" ? <ListTreeIcon className="size-3.5" /> : <FolderTreeIcon className="size-3.5" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>切换{viewMode === "tree" ? '平铺' : '树状'}视图</TooltipContent>
                      </Tooltip>
                    </div>

                    {selectedDiffSource === "unstaged" || selectedDiffSource === "all" ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 px-2.5 text-[12px] rounded-[4px] gap-1.5"
                            onClick={handleStageSelected}
                            disabled={selectedPaths.size === 0 || isStaging}
                          >
                            <PlusIcon className="w-3.5 h-3.5" />
                            暂存
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>暂存选中文件</TooltipContent>
                      </Tooltip>
                    ) : selectedDiffSource === "staged" ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 px-2.5 text-[12px] rounded-[4px] gap-1.5"
                            onClick={handleUnstageSelected}
                            disabled={selectedPaths.size === 0 || isStaging}
                          >
                            <MinusIcon className="w-3.5 h-3.5" />
                            取消暂存
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>取消暂存选中文件</TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>

                  <div className="flex-1 overflow-y-auto min-h-0 pr-1">
                    <FileTreeView
                      files={currentSourceSnapshot.files}
                      onSelectFile={(path) => handleJumpToFile(path)}
                      selectedPaths={selectedPaths}
                      onToggleSelection={handleToggleSelection}
                      viewMode={viewMode}
                    />
                  </div>
                </div>

                {/* ── Resizable divider ─────────────────────────────── */}
                <div
                  className="h-[2px] w-full cursor-row-resize hover:bg-primary/50 active:bg-primary/50 bg-border/40 transition-colors z-10 shrink-0 my-1 rounded-full"
                  onMouseDown={handleCommitResize}
                />

                {/* ── Commit panel (bottom) ────────────────────────── */}
                <div
                  className="flex flex-col shrink-0 flex-none pb-2"
                  style={{ height: commitPanelHeight }}
                >
                  <div className="flex flex-col flex-1 rounded-[4px] bg-[color:var(--color-control-panel-bg)] transition-colors overflow-hidden">
                    {/* First row: avatar + title input + sparkles */}
                    <div className="flex items-center gap-1 px-2 py-1.5 shrink-0 bg-secondary/10">
                      <div className="flex items-center justify-center size-[18px] bg-secondary rounded-full mr-1 shrink-0 overflow-hidden text-muted-foreground/80">
                        <UserIcon className="size-3" />
                      </div>
                      <input
                        placeholder="Update files..."
                        className="flex-1 bg-transparent text-[12px] font-medium placeholder:text-muted-foreground focus:outline-none min-w-0"
                        value={commitMessage.split("\n")[0] || ""}
                        onChange={(e) => {
                          const lines = commitMessage.split("\n");
                          lines[0] = e.target.value;
                          setCommitMessage(lines.join("\n"));
                        }}
                      />
                    </div>

                    {/* Second row: description */}
                    <div className="flex flex-col flex-1 w-full relative min-h-0">
                      <CommitDescriptionEditor
                        value={
                          commitMessage.includes("\n")
                            ? commitMessage.substring(commitMessage.indexOf("\n") + 1)
                            : ""
                        }
                        onChange={(newDesc) => {
                          const firstLine = commitMessage.split("\n")[0] || "";
                          setCommitMessage(firstLine + "\n" + newDesc);
                        }}
                      />
                    </div>
                  </div>

                  {/* Commit & Push actions */}
                  <div className="flex items-center justify-between mt-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            className="h-7 px-2 text-[12px] rounded-[6px] font-medium tracking-wide flex items-center justify-center gap-1.5"
                            onClick={handleCommit}
                            disabled={selectedPaths.size === 0 || !commitMessage.trim() || isCommitting}
                          >
                            <CheckIcon className="size-3.5" />
                            {isCommitting ? "提交中…" : `Commit (${selectedPaths.size})`}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {selectedPaths.size === 0 ? "请先勾选需要提交的文件" : (isCommitting ? "正在提交…" : "提交更改")}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <div className="flex items-center gap-1">
                      {commitMessage.trim() && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 rounded-[6px] shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setCommitMessage("")}
                            >
                              <TrashIcon className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>清空内容</TooltipContent>
                        </Tooltip>
                      )}

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "size-7 rounded-[6px] shrink-0 text-muted-foreground hover:text-foreground relative",
                              isGeneratingMessage && "animate-pulse"
                            )}
                            onClick={handleGenerateMessage}
                            disabled={selectedPaths.size === 0 || isGeneratingMessage}
                          >
                            <SparklesIcon className="size-3.5" />
                            {showSparklesHint && (
                              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-accent/80" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {selectedPaths.size === 0 ? "需勾选文件后生成" : (isGeneratingMessage ? "正在生成…" : "生成提交信息")}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Tree resize handle ──────────────────────────────── */}
              <div
                className="w-[2px] cursor-col-resize hover:bg-primary/50 active:bg-primary/50 bg-border/40 transition-colors z-10 shrink-0 self-stretch mr-2 ml-[-1px]"
                onMouseDown={handleTreeResize}
              />

              {/* ── Right: diff cards ───────────────────────────────── */}
              <div className="min-h-0 flex flex-col flex-1 overflow-y-auto border-l border-border/50 pl-3">
                <div className="flex flex-col flex-1 min-h-0 gap-3">
                  {/* Replace Right Side List mapping with Single Active File viewing or Empty state */}
                  {(() => {
                    const activeFileObj = activeFile ? currentSourceSnapshot.files.find(f => f.path === activeFile) : null;
                    if (!activeFileObj && currentSourceSnapshot.files.length > 0) {
                      return (
                        <div className="flex flex-col items-center justify-center flex-1 h-full min-h-[300px] text-muted-foreground/50 gap-3">
                          <FileIcon className="size-12 opacity-30 stroke-1" />
                          <div className="text-sm font-medium">点击左侧文件查看 diff 内容</div>
                        </div>
                      );
                    }
                    if (!activeFileObj) return null; // When empty repo, it's handled above the SectionSurface technically, but just in case
                    return (
                      <div key={activeFileObj.path} className="flex flex-col flex-1 h-full min-h-0">
                        <DiffFileCard
                          className="flex-1 h-full min-h-0 flex flex-col"
                          file={activeFileObj}
                          layout={layout}
                          expanded={true}
                          onExpandedChange={() => { }}
                        />
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </SectionSurface>
      </div>
    </aside>
  );
}

export function DiffPanel(props: DiffPanelProps) {
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
      <DiffPanelInner {...props} />
    </>
  );
}
