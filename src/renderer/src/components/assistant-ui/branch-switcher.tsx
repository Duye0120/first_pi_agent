import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  GitBranchIcon,
  LoaderCircleIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import type { GitBranchEntry, GitBranchSummary } from "@shared/contracts";

import { Button } from "@renderer/components/assistant-ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@renderer/components/ui/popover";
import { cn } from "@renderer/lib/utils";

type BranchSwitcherProps = {
  branchSummary: GitBranchSummary | null;
  disabled?: boolean;
  onBranchChanged?: () => void | Promise<void>;
};

const BRANCH_CACHE_TTL_MS = 5 * 60_000;

type BranchCache = {
  branches: GitBranchEntry[] | null;
  cachedAt: number;
  loadPromise: Promise<GitBranchEntry[]> | null;
};

function formatBranchLabel(branchSummary: GitBranchSummary | null) {
  if (!branchSummary) {
    return "读取中";
  }

  if (!branchSummary.branchName) {
    return "非 Git 仓库";
  }

  if (branchSummary.isDetached) {
    return `Detached · ${branchSummary.branchName}`;
  }

  return branchSummary.branchName;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "分支操作失败，请稍后重试。";
}

function sortBranches(branches: GitBranchEntry[]) {
  return [...branches].sort((left, right) => {
    if (left.isCurrent !== right.isCurrent) {
      return left.isCurrent ? -1 : 1;
    }

    return left.name.localeCompare(right.name, "en");
  });
}

function markCurrentBranch(
  branches: GitBranchEntry[],
  branchName: string,
): GitBranchEntry[] {
  return sortBranches(
    branches.map((branch) => ({
      ...branch,
      isCurrent: branch.name === branchName,
    })),
  );
}

export function BranchSwitcher({
  branchSummary,
  disabled = false,
  onBranchChanged,
}: BranchSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<GitBranchEntry[]>([]);
  const [query, setQuery] = useState("");
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [draftBranchName, setDraftBranchName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hasLoadedBranches, setHasLoadedBranches] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const branchCacheRef = useRef<BranchCache>({
    branches: null,
    cachedAt: 0,
    loadPromise: null,
  });

  const branchLabel = formatBranchLabel(branchSummary);
  const isGitRepo = !!branchSummary?.branchName;

  const loadBranches = useCallback(async () => {
    if (!window.desktopApi?.git || !isGitRepo) {
      return;
    }

    const cache = branchCacheRef.current;
    const isCacheFresh =
      !!cache.branches &&
      Date.now() - cache.cachedAt < BRANCH_CACHE_TTL_MS;

    if (isCacheFresh && cache.branches) {
      const currentBranches = branchSummary?.branchName
        ? markCurrentBranch(cache.branches, branchSummary.branchName)
        : cache.branches;
      setBranches(currentBranches);
      setHasLoadedBranches(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (!cache.loadPromise) {
        cache.loadPromise = window.desktopApi.git
          .listBranches()
          .then((nextBranches) => {
            const sorted = sortBranches(nextBranches);
            cache.branches = sorted;
            cache.cachedAt = Date.now();
            return sorted;
          })
          .finally(() => {
            cache.loadPromise = null;
          });
      }

      const nextBranches = await cache.loadPromise;
      const currentBranches = branchSummary?.branchName
        ? markCurrentBranch(
            cache.branches ?? nextBranches,
            branchSummary.branchName,
          )
        : (cache.branches ?? nextBranches);
      setBranches(currentBranches);
      setHasLoadedBranches(true);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [branchSummary?.branchName, isGitRepo]);

  useEffect(() => {
    if (!open || !isGitRepo || hasLoadedBranches || loading) {
      return;
    }

    void loadBranches();
  }, [hasLoadedBranches, isGitRepo, loadBranches, loading, open]);

  useEffect(() => {
    if (isGitRepo) {
      return;
    }

    branchCacheRef.current.branches = null;
    branchCacheRef.current.cachedAt = 0;
    branchCacheRef.current.loadPromise = null;
    setBranches([]);
    setHasLoadedBranches(false);
  }, [isGitRepo]);

  useEffect(() => {
    if (!hasLoadedBranches) {
      return;
    }

    const sorted = sortBranches(branches);
    branchCacheRef.current.branches = sorted;
    branchCacheRef.current.cachedAt = Date.now();
  }, [branches, hasLoadedBranches]);

  useEffect(() => {
    if (!branchSummary?.branchName || !hasLoadedBranches) {
      return;
    }

    const currentBranchName = branchSummary.branchName;

    setBranches((current) => {
      if (current.length === 0) {
        return current;
      }

      if (!current.some((branch) => branch.name === currentBranchName)) {
        return current;
      }

      const nextBranches = markCurrentBranch(current, currentBranchName);
      const changed = nextBranches.some(
        (branch, index) =>
          branch.name !== current[index]?.name ||
          branch.isCurrent !== current[index]?.isCurrent,
      );

      return changed ? nextBranches : current;
    });
  }, [branchSummary?.branchName, hasLoadedBranches]);

  const filteredBranches = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return branches;
    }

    return branches.filter((branch) =>
      branch.name.toLowerCase().includes(normalizedQuery),
    );
  }, [branches, deferredQuery]);

  const resetPanelState = useCallback(() => {
    setQuery("");
    setIsCreateMode(false);
    setDraftBranchName("");
    setError(null);
    setLoading(false);
    setSubmitting(false);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        resetPanelState();
      }
    },
    [resetPanelState],
  );

  const handleSwitchBranch = useCallback(
    async (branchName: string) => {
      if (!window.desktopApi?.git || submitting) {
        return;
      }

      setSubmitting(true);
      setError(null);

      try {
        await window.desktopApi.git.switchBranch(branchName);
        setBranches((current) => markCurrentBranch(current, branchName));
        setHasLoadedBranches(true);
        await onBranchChanged?.();
        handleOpenChange(false);
      } catch (nextError) {
        setError(getErrorMessage(nextError));
      } finally {
        setSubmitting(false);
      }
    },
    [handleOpenChange, onBranchChanged, submitting],
  );

  const handleCreateBranch = useCallback(async () => {
    const normalizedBranchName = draftBranchName.trim();
    if (!window.desktopApi?.git || !normalizedBranchName || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await window.desktopApi.git.createAndSwitchBranch(normalizedBranchName);
      setBranches((current) =>
        markCurrentBranch(
          current.some((branch) => branch.name === normalizedBranchName)
            ? current
            : [...current, { name: normalizedBranchName, isCurrent: true }],
          normalizedBranchName,
        ),
      );
      setHasLoadedBranches(true);
      await onBranchChanged?.();
      handleOpenChange(false);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setSubmitting(false);
    }
  }, [draftBranchName, handleOpenChange, onBranchChanged, submitting]);

  const handleDraftKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleCreateBranch();
      }
    },
    [handleCreateBranch],
  );

  if (!isGitRepo) {
    return (
      <div className="inline-flex min-w-0 max-w-[240px] items-center gap-2 px-1 py-1 text-[12px] font-medium text-[color:var(--color-text-secondary)]">
        <GitBranchIcon className="size-3.5 shrink-0" />
        <span className="truncate">{branchLabel}</span>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          title={
            disabled
              ? "聊天运行中，暂时不能切换分支"
              : `当前分支 ${branchLabel}`
          }
          className={cn(
            "h-8 min-w-0 max-w-[260px] rounded-[var(--radius-shell)] bg-transparent px-2 text-[12px] font-medium text-[color:var(--color-text-secondary)] shadow-none ring-0 hover:bg-[color:var(--color-control-bg-hover)] hover:text-foreground",
            "disabled:bg-transparent disabled:text-[color:var(--color-text-secondary)] disabled:opacity-70",
          )}
        >
          <GitBranchIcon className="size-3.5 shrink-0" />
          <span className="truncate">{branchLabel}</span>
          <ChevronDownIcon className="size-3.5 shrink-0" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={10}
        className="w-[344px] rounded-[var(--radius-shell)] bg-[color:var(--color-shell-overlay)] p-3.5 shadow-[var(--shadow-flyout)] backdrop-blur-[10px]"
      >
        <div className="flex flex-col gap-3.5">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[color:var(--color-text-secondary)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索分支"
              className="h-10 w-full rounded-[var(--radius-shell)] bg-[color:var(--color-shell-panel-elevated)] pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-[color:var(--color-text-secondary)] shadow-[var(--shadow-inset-soft)] ring-1 ring-[color:var(--color-control-border)]/60 focus-visible:bg-[color:var(--color-shell-panel)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-focus-ring)]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="px-1 text-[11px] font-medium tracking-[0.12em] text-[color:var(--color-text-muted)]">
              分支
            </p>
            <div className="max-h-[220px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-[color:var(--color-text-secondary)]">
                  <LoaderCircleIcon className="size-3.5 animate-spin" />
                  <span>正在读取本地分支…</span>
                </div>
              ) : filteredBranches.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {filteredBranches.map((branch) => (
                    <button
                      key={branch.name}
                      type="button"
                      disabled={submitting}
                      onClick={() => {
                        if (branch.isCurrent) {
                          handleOpenChange(false);
                          return;
                        }
                        void handleSwitchBranch(branch.name);
                      }}
                      className={cn(
                        "group flex w-full items-center gap-3 rounded-[var(--radius-shell)] px-3 py-2.5 text-left text-[14px] transition-all duration-fast ease-standard focus-visible:outline-none",
                        branch.isCurrent
                          ? "bg-[color:var(--color-selection-bg)] text-[color:var(--color-selection-fg)]"
                          : "bg-transparent hover:bg-[color:var(--color-selection-muted-bg)] focus-visible:bg-[color:var(--color-selection-muted-bg)]",
                        !submitting && "cursor-pointer",
                        submitting && "cursor-wait opacity-80",
                      )}
                    >
                      <GitBranchIcon
                        className={cn(
                          "size-3.5 shrink-0 transition-colors",
                          branch.isCurrent
                            ? "text-[color:var(--color-selection-fg)]"
                            : "text-[color:var(--color-text-secondary)] group-hover:text-foreground",
                        )}
                      />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate transition-colors",
                          branch.isCurrent
                            ? "font-medium text-[color:var(--color-selection-fg)]"
                            : "text-foreground/88 group-hover:text-foreground",
                        )}
                      >
                        {branch.name}
                      </span>
                      {branch.isCurrent ? (
                        <span className="flex size-4 shrink-0 items-center justify-center text-[color:var(--color-selection-fg)]">
                          <CheckIcon className="size-4" />
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-3 text-[12px] text-[color:var(--color-text-secondary)]">
                  没有匹配的本地分支。
                </div>
              )}
            </div>
          </div>

          {error ? (
            <div className="rounded-[var(--radius-shell)] bg-rose-500/8 px-3 py-2.5 text-[12px] leading-5 text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="border-t border-[color:var(--color-border-light)]/70 pt-3">
            {isCreateMode ? (
              <div className="flex flex-col gap-2">
                <input
                  autoFocus
                  value={draftBranchName}
                  onChange={(event) => setDraftBranchName(event.target.value)}
                  onKeyDown={handleDraftKeyDown}
                  placeholder="输入新分支名"
                  className="h-10 w-full rounded-[var(--radius-shell)] bg-[color:var(--color-shell-panel-elevated)] px-3 text-[13px] text-foreground outline-none placeholder:text-[color:var(--color-text-secondary)] shadow-[var(--shadow-inset-soft)] ring-1 ring-[color:var(--color-control-border)]/60 focus-visible:bg-[color:var(--color-shell-panel)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-focus-ring)]"
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={submitting}
                    onClick={() => {
                      setIsCreateMode(false);
                      setDraftBranchName("");
                      setError(null);
                    }}
                    className="rounded-[var(--radius-shell)] px-3 text-[12px]"
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={submitting || draftBranchName.trim().length === 0}
                    onClick={() => {
                      void handleCreateBranch();
                    }}
                    className="rounded-[var(--radius-shell)] px-3 text-[12px]"
                  >
                    {submitting ? (
                      <LoaderCircleIcon className="size-3.5 animate-spin" />
                    ) : (
                      <PlusIcon className="size-3.5" />
                    )}
                    <span>创建并检出</span>
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setIsCreateMode(true);
                  setError(null);
                }}
                className="group flex w-full items-center gap-2 rounded-[var(--radius-shell)] px-3 py-2.5 text-left text-[13px] font-medium text-foreground transition-all duration-fast ease-standard hover:bg-[color:var(--color-selection-muted-bg)] focus-visible:bg-[color:var(--color-selection-muted-bg)] focus-visible:outline-none"
              >
                <PlusIcon className="size-4 shrink-0 transition-transform duration-150 group-hover:translate-x-[1px]" />
                <span>创建并检出新分支…</span>
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
