import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDownIcon,
  FileIcon,
  ImageIcon,
  RefreshCwIcon,
  XIcon,
  ColumnsIcon,
  ListIcon,
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
    <div className="grid min-h-[220px] place-items-center rounded-[6px] border border-border bg-[color:var(--color-control-panel-bg)] px-6 py-7 text-center shadow-sm">
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
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium">{meta.label}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{meta.description}</p>
                </div>
                <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                  <p>{snapshot.totalFiles} 文件</p>
                  <p>{formatSignedCount(snapshot.totalAdditions, "+")} · {formatSignedCount(snapshot.totalDeletions, "-")}</p>
                </div>
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
}: {
  file: GitDiffFile;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  layout?: "vertical" | "horizontal";
}) {
  return (
    <Collapsible
      open={expanded}
      onOpenChange={onExpandedChange}
      className="overflow-hidden rounded-[6px] border border-border bg-[color:var(--color-control-panel-bg)] shadow-sm"
    >
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-start gap-3 px-3 py-2 text-left transition-colors",
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
          <ChevronDownIcon
            className={cn(
              "mt-0.5 size-4 text-muted-foreground transition-transform duration-200",
              expanded && "rotate-180",
            )}
          />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="px-3 pb-3">
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

function DiffPanelInner({
  open,
  onClose,
  overview,
  isLoading,
  onRefresh,
}: DiffPanelProps) {
  const [selectedDiffSource, setSelectedDiffSource] = useState<GitDiffSource>("all");
  const [layout, setLayout] = useState<"vertical" | "horizontal">("vertical");
  const [expandedDiffPaths, setExpandedDiffPaths] = useState<ExpandedDiffState>({});
  const diffCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!overview && !isLoading) {
      onRefresh();
    }
  }, [isLoading, onRefresh, overview]);

  useEffect(() => {
    if (!overview) {
      return;
    }

    setExpandedDiffPaths((current) => hydrateExpandedState(current, overview));
    setSelectedDiffSource((current) => {
      if (overview.sources[current].totalFiles > 0) {
        return current;
      }

      return getFirstNonEmptySource(overview) ?? current;
    });
  }, [overview]);

  const currentSourceSnapshot = overview?.sources[selectedDiffSource] ?? EMPTY_SOURCE_SNAPSHOT;
  const currentExpandedPaths = expandedDiffPaths[selectedDiffSource] ?? [];

  const [width, setWidth] = useState(384);
  const draggingRef = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';

    const handleMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const newWidth = window.innerWidth - ev.clientX;
      setWidth(Math.max(240, Math.min(newWidth, window.innerWidth - 100)));
    };

    const handleMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  const handleToggleFile = useCallback((path: string, open: boolean) => {
    setExpandedDiffPaths((current) => {
      const sourcePaths = current[selectedDiffSource] ?? [];
      const nextPaths = open
        ? Array.from(new Set([...sourcePaths, path]))
        : sourcePaths.filter((item) => item !== path);

      if (arePathListsEqual(sourcePaths, nextPaths)) {
        return current;
      }

      return {
        ...current,
        [selectedDiffSource]: nextPaths,
      };
    });
  }, [selectedDiffSource]);

  const handleJumpToFile = useCallback((path: string) => {
    setExpandedDiffPaths((current) => {
      const sourcePaths = current[selectedDiffSource] ?? [];
      if (sourcePaths.includes(path)) {
        return current;
      }

      return {
        ...current,
        [selectedDiffSource]: [...sourcePaths, path],
      };
    });

    window.setTimeout(() => {
      diffCardRefs.current[`${selectedDiffSource}:${path}`]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 40);
  }, [selectedDiffSource]);

  const bindCardRef = useCallback((path: string, element: HTMLDivElement | null) => {
    diffCardRefs.current[`${selectedDiffSource}:${path}`] = element;
  }, [selectedDiffSource]);

  // Drawer shell — fixed overlay that slides in/out via translate-x
  const drawerBase =
    "fixed right-0 top-0 bottom-0 z-50 flex h-full min-h-0 flex-col bg-background shadow-2xl px-4 py-4 rounded-[8px] transform transition-transform duration-300 ease-in-out";
  const drawerClosed = `${drawerBase} translate-x-full`;
  const drawerOpen = `${drawerBase} translate-x-0`;

  const drawerClass = open ? drawerOpen : drawerClosed;

  function ResizeHandle() {
    return (
      <div
        className="absolute left-[-2px] w-[5px] top-0 bottom-0 cursor-col-resize z-50 group flex justify-center"
        onMouseDown={handleMouseDown}
      >
        <div className="w-[2px] h-full bg-blue-500 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-200" />
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
      <aside className={drawerClass} style={{ width: open ? width : 384 }}>
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
      <aside className={drawerClass} style={{ width: open ? width : 384 }}>
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

  const meta = DIFF_SOURCE_META[selectedDiffSource];
  const hasAnyChanges = DIFF_SOURCES.some((source) => overview.sources[source].totalFiles > 0);
  const expandedPathSet = new Set(currentExpandedPaths);

  return (
    <aside className={drawerClass} style={{ width: open ? width : 384 }}>
      {open && <ResizeHandle />}
      <DrawerHeader>
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-text-secondary)]">Diff</p>
          <h3 className="text-lg font-semibold text-foreground">工作区 Diff</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {meta.description}
          </p>
        </div>
      </DrawerHeader>
      <div className="flex items-center gap-2 mb-4">
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
        <Button
          type="button"
          variant="outline"
          onClick={() => setLayout((prev) => (prev === "vertical" ? "horizontal" : "vertical"))}
          className="h-7 rounded-[6px] px-2.5 text-[12px] text-muted-foreground bg-secondary/50 border-0 hover:bg-secondary/80 flex items-center gap-1.5 shrink-0"
          aria-label="切换视图布局"
        >
          {layout === "vertical" ? <ColumnsIcon className="size-3.5" /> : <ListIcon className="size-3.5" />}
          <span>{layout === "vertical" ? "横向对比" : "垂直对比"}</span>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <SectionSurface className="flex h-full min-h-0 flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-[6px] bg-[color:var(--color-control-bg)] px-2 py-1 text-[11px] text-foreground shadow-none">
              {formatBranchLabel(overview)}
            </span>
            <span className="inline-flex items-center rounded-[6px] bg-secondary/50 px-2 py-1 text-[11px] text-muted-foreground shadow-none">
              {overview.branch.hasChanges ? "有未提交改动" : "工作区干净"}
            </span>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <DiffSourceSelect
                selectedSource={selectedDiffSource}
                overview={overview}
                onChange={setSelectedDiffSource}
              />
            </div>
            <Badge variant="secondary">{currentSourceSnapshot.totalFiles}</Badge>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2.5">
            <DiffSummaryCard label="文件" value={String(currentSourceSnapshot.totalFiles)} />
            <DiffSummaryCard label="新增" value={formatSignedCount(currentSourceSnapshot.totalAdditions, "+")} tone="positive" />
            <DiffSummaryCard label="删除" value={formatSignedCount(currentSourceSnapshot.totalDeletions, "-")} tone="negative" />
          </div>

          {!hasAnyChanges ? (
            <div className="mt-5">
              <EmptyPanelState
                title="暂无改动"
                description="当前 workspace 没有未提交改动；一旦出现修改、删除或新增文件，这里会自动刷新。"
              />
            </div>
          ) : currentSourceSnapshot.files.length === 0 ? (
            <div className="mt-5">
              <EmptyPanelState
                title={`${meta.label}为空`}
                description="这个来源当前没有可展示的改动，可以切换到其他来源继续查看。"
              />
            </div>
          ) : (
            <>
              <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="flex flex-col gap-3">
                  {currentSourceSnapshot.files.map((file) => (
                    <div
                      key={file.path}
                      ref={(element) => bindCardRef(file.path, element)}
                    >
                      <DiffFileCard
                        file={file}
                        layout={layout}
                        expanded={expandedPathSet.has(file.path)}
                        onExpandedChange={(open) => handleToggleFile(file.path, open)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
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
          props.open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={props.onClose}
        aria-hidden="true"
      />
      <DiffPanelInner {...props} />
    </>
  );
}

