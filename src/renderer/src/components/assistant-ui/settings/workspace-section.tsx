import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  ClipboardDocumentIcon,
  FolderIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import type {
  GitBranchSummary,
  Settings,
  SoulFilesStatus,
} from "@shared/contracts";
import { Badge } from "@renderer/components/assistant-ui/badge";
import { Button } from "@renderer/components/assistant-ui/button";
import { SettingsCard } from "./shared";

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getProjectName(workspace: string) {
  return workspace.split(/[\\/]/).filter(Boolean).at(-1) ?? workspace;
}

function RuleFileItem({
  label,
  exists,
  sizeBytes,
}: {
  label: string;
  exists: boolean;
  sizeBytes: number;
}) {
  return (
    <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-panel-bg)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`size-2 shrink-0 rounded-full ${exists ? "bg-emerald-500" : "bg-amber-400"}`}
          />
          <p className="truncate text-[12px] font-medium text-foreground">
            {label}
          </p>
        </div>
        <span
          className={`shrink-0 text-[11px] ${exists ? "text-emerald-600" : "text-amber-600"}`}
        >
          {exists ? "已加载" : "缺失"}
        </span>
      </div>
      <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">
        {exists ? `${formatBytes(sizeBytes)} · 已检测到` : "当前项目里还没有这个文件"}
      </p>
    </div>
  );
}

export function WorkspaceSection({
  settings,
  soulStatus,
  onSettingsChange,
}: {
  settings: Settings;
  soulStatus: SoulFilesStatus | null;
  onSettingsChange: (partial: Partial<Settings>) => void;
}) {
  const desktopApi = window.desktopApi;
  const [gitSummary, setGitSummary] = useState<GitBranchSummary | null>(null);
  const [openingFolder, setOpeningFolder] = useState(false);
  const [pickingFolder, setPickingFolder] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!desktopApi) {
      return;
    }

    let cancelled = false;
    setGitSummary(null);

    void desktopApi.git
      .getSummary()
      .then((summary) => {
        if (!cancelled) {
          setGitSummary(summary);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGitSummary(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [desktopApi, settings.workspace]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const projectName = useMemo(
    () => getProjectName(settings.workspace),
    [settings.workspace],
  );

  const soulItems = useMemo(
    () =>
      soulStatus
        ? [
            { key: "soul", label: "SOUL.md", ...soulStatus.soul },
            { key: "user", label: "USER.md", ...soulStatus.user },
            { key: "agents", label: "AGENTS.md", ...soulStatus.agents },
          ]
        : [],
    [soulStatus],
  );

  const loadedCount = soulItems.filter((item) => item.exists).length;

  const handleCopyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(settings.workspace);
      setCopyDone(true);
      setError(null);

      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }

      copyTimerRef.current = window.setTimeout(() => {
        setCopyDone(false);
        copyTimerRef.current = null;
      }, 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "复制路径失败");
    }
  }, [settings.workspace]);

  const handleOpenFolder = useCallback(async () => {
    if (!desktopApi) {
      return;
    }

    setOpeningFolder(true);
    setError(null);

    try {
      await desktopApi.workspace.openFolder();
    } catch (err) {
      setError(err instanceof Error ? err.message : "打开目录失败");
    } finally {
      setOpeningFolder(false);
    }
  }, [desktopApi]);

  const handlePickFolder = useCallback(async () => {
    if (!desktopApi) {
      return;
    }

    setPickingFolder(true);
    setError(null);

    try {
      const nextWorkspace = await desktopApi.workspace.pickFolder();
      if (!nextWorkspace || nextWorkspace === settings.workspace) {
        return;
      }

      onSettingsChange({ workspace: nextWorkspace });
    } catch (err) {
      setError(err instanceof Error ? err.message : "切换默认目录失败");
    } finally {
      setPickingFolder(false);
    }
  }, [desktopApi, onSettingsChange, settings.workspace]);

  return (
    <SettingsCard>
      <div className="space-y-4 px-6 pb-6 pt-1">
        <div className="rounded-[calc(var(--radius-shell)+4px)] bg-[color:var(--color-control-panel-bg)] p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1 space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-[calc(var(--radius-shell)+2px)] bg-[color:var(--color-control-bg-active)] text-foreground shadow-[var(--color-control-shadow)]">
                  <FolderIcon className="size-5" />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-[20px] font-semibold tracking-[-0.02em] text-foreground">
                      {projectName}
                    </h2>
                    <Badge className="bg-[color:var(--color-control-bg-active)] text-foreground">
                      默认工作区
                    </Badge>
                    {gitSummary?.branchName ? (
                      <Badge variant="secondary" className="text-muted-foreground">
                        {gitSummary.isDetached
                          ? `Detached · ${gitSummary.branchName}`
                          : `Git · ${gitSummary.branchName}`}
                      </Badge>
                    ) : null}
                  </div>

                  <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                    新对话默认会在这里执行。你改一次，后面打开 Chela 也会记住。
                  </p>
                </div>
              </div>

              <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-4 py-4 shadow-[var(--color-control-shadow)]">
                <p className="text-[11px] font-medium text-muted-foreground">
                  默认路径
                </p>
                <p className="mt-2 break-all font-mono text-[12px] leading-6 text-foreground">
                  {settings.workspace}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handlePickFolder()}
                disabled={pickingFolder}
              >
                <PencilSquareIcon className="size-4" />
                {pickingFolder ? "选择中…" : "更换目录"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleOpenFolder()}
                disabled={openingFolder}
              >
                <ArrowTopRightOnSquareIcon className="size-4" />
                {openingFolder ? "打开中…" : "打开目录"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleCopyPath()}
              >
                <ClipboardDocumentIcon className="size-4" />
                {copyDone ? "已复制" : "复制路径"}
              </Button>
            </div>
          </div>

          <div className="mt-5 rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-4 py-4 shadow-[var(--color-control-shadow)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-foreground">规则文件</p>
                <p className="mt-1 text-[12px] leading-6 text-muted-foreground">
                  SOUL.md、USER.md、AGENTS.md 会跟着当前项目一起读取。
                </p>
              </div>
              <Badge className="bg-[color:var(--color-control-bg-active)] text-foreground">
                {soulStatus ? `已加载 ${loadedCount} / 3` : "读取中…"}
              </Badge>
            </div>

            {soulStatus ? (
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {soulItems.map((item) => (
                  <RuleFileItem
                    key={item.key}
                    label={item.label}
                    exists={item.exists}
                    sizeBytes={item.sizeBytes}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-[var(--radius-shell)] bg-[color:var(--color-control-panel-bg)] px-4 py-4 text-[12px] text-muted-foreground">
                正在读取规则文件状态…
              </div>
            )}
          </div>
        </div>

        {error ? (
          <div className="rounded-[var(--radius-shell)] bg-[color:rgba(239,68,68,0.08)] px-4 py-3 text-[12px] leading-6 text-[color:rgb(185,28,28)]">
            {error}
          </div>
        ) : null}
      </div>
    </SettingsCard>
  );
}
