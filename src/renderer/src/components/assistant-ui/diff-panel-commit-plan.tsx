import { useState } from "react";
import {
  CheckCheckIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react";
import type {
  CommitPlanGroup,
  GitDiffFile,
  RuntimeSkillUsage,
} from "@shared/contracts";
import { Badge } from "@renderer/components/assistant-ui/badge";
import { Button } from "@renderer/components/assistant-ui/button";
import { DEFAULT_VISIBLE_COMMIT_FILES } from "@renderer/components/assistant-ui/diff-panel-parts";
import { cn } from "@renderer/lib/utils";

type CommitPlanStatus =
  | "idle"
  | "staging"
  | "staged"
  | "committing"
  | "committed"
  | "error";

export type CommitPlanCardState = CommitPlanGroup & {
  status: CommitPlanStatus;
  error: string | null;
};

export type CommitPlanGenerationResult = {
  groups: CommitPlanCardState[];
  skillUsage: RuntimeSkillUsage | null;
};

export function createCommitPlanCardState(
  groups: CommitPlanGroup[],
): CommitPlanCardState[] {
  return groups.map((group) => ({
    ...group,
    status: "idle",
    error: null,
  }));
}

export async function generateCommitPlan(
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

export function buildCommitMessage(
  group: Pick<CommitPlanGroup, "title" | "description">,
): string {
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

export function CommitPlanCard({
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
            group.status === "staging" && "opacity-80 disabled:opacity-80 text-foreground border-[color:var(--color-control-focus-ring)]",
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
            group.status === "committing" && "opacity-100 disabled:opacity-100 bg-foreground/90",
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
