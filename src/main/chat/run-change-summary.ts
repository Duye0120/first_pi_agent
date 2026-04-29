import path from "node:path";
import type {
  AgentStep,
  GitDiffFile,
  GitDiffOverview,
  RunChangeSummary,
  RunChangeSummaryFile,
} from "../../shared/contracts.js";

const MUTATING_FILE_TOOLS = new Set(["file_edit", "edit_file", "file_write"]);

type BuildRunChangeSummaryOptions = {
  touchedPaths?: Iterable<string>;
};

function toFileMap(snapshot: GitDiffOverview | null): Map<string, GitDiffFile> {
  if (!snapshot?.isGitRepo) {
    return new Map();
  }

  return new Map(
    snapshot.sources.all.files.map((file) => [file.path, file] as const),
  );
}

function normalizeTouchedPath(rawPath: string, workspacePath?: string): string | null {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return null;
  }

  let candidate = trimmed.replace(/^["']|["']$/g, "");
  if (workspacePath && path.isAbsolute(candidate)) {
    const relativePath = path.relative(workspacePath, candidate);
    if (relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
      candidate = relativePath;
    }
  }

  const normalized = candidate
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");

  return normalized.length > 0 ? normalized : null;
}

function addPathFromValue(
  paths: Set<string>,
  value: unknown,
  workspacePath?: string,
): void {
  if (typeof value === "string") {
    const normalized = normalizeTouchedPath(value, workspacePath);
    if (normalized) {
      paths.add(normalized);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      addPathFromValue(paths, item, workspacePath);
    }
  }
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function collectStructuredPaths(
  paths: Set<string>,
  value: unknown,
  workspacePath?: string,
): void {
  const record = getRecord(value);
  if (!record) {
    return;
  }

  addPathFromValue(paths, record.path, workspacePath);
  addPathFromValue(paths, record.filePath, workspacePath);
  addPathFromValue(paths, record.paths, workspacePath);
  addPathFromValue(paths, record.filePaths, workspacePath);
}

export function collectRunTouchedPaths(
  steps: AgentStep[] | undefined,
  workspacePath?: string,
): Set<string> {
  const paths = new Set<string>();

  const visit = (step: AgentStep): void => {
    if (step.children) {
      for (const child of step.children) {
        visit(child);
      }
    }

    if (
      step.kind !== "tool_call" ||
      !step.toolName ||
      !MUTATING_FILE_TOOLS.has(step.toolName) ||
      step.status !== "success" ||
      step.toolResult === undefined
    ) {
      return;
    }

    collectStructuredPaths(paths, step.toolArgs, workspacePath);

    const result = getRecord(step.toolResult);
    collectStructuredPaths(paths, result?.details, workspacePath);
  };

  for (const step of steps ?? []) {
    visit(step);
  }

  return paths;
}

function compareFileChange(
  beforeFile: GitDiffFile | undefined,
  afterFile: GitDiffFile | undefined,
): RunChangeSummaryFile | null {
  if (!beforeFile && !afterFile) {
    return null;
  }

  if (!beforeFile && afterFile) {
    return {
      path: afterFile.path,
      status: afterFile.status,
      additions: afterFile.additions,
      deletions: afterFile.deletions,
      changeKind: "added",
    };
  }

  if (beforeFile && !afterFile) {
    return {
      path: beforeFile.path,
      status: beforeFile.status,
      additions: beforeFile.additions,
      deletions: beforeFile.deletions,
      changeKind: "reverted",
    };
  }

  const before = beforeFile!;
  const after = afterFile!;
  const additionsDelta = after.additions - before.additions;
  const deletionsDelta = after.deletions - before.deletions;
  const statusChanged = before.status !== after.status;

  if (additionsDelta === 0 && deletionsDelta === 0 && !statusChanged) {
    return null;
  }

  const afterMagnitude = after.additions + after.deletions;
  const beforeMagnitude = before.additions + before.deletions;
  const changeKind: RunChangeSummaryFile["changeKind"] =
    afterMagnitude < beforeMagnitude && additionsDelta <= 0 && deletionsDelta <= 0
      ? "reverted"
      : "updated";

  return {
    path: after.path,
    status: after.status,
    additions: Math.abs(additionsDelta),
    deletions: Math.abs(deletionsDelta),
    changeKind,
  };
}

export function buildRunChangeSummary(
  beforeSnapshot: GitDiffOverview | null,
  afterSnapshot: GitDiffOverview | null,
  options: BuildRunChangeSummaryOptions = {},
): RunChangeSummary | null {
  const beforeFiles = toFileMap(beforeSnapshot);
  const afterFiles = toFileMap(afterSnapshot);
  const touchedPaths =
    options.touchedPaths === undefined
      ? null
      : new Set(
          [...options.touchedPaths]
            .map((touchedPath) => normalizeTouchedPath(touchedPath))
            .filter((touchedPath): touchedPath is string => touchedPath !== null),
        );

  if (touchedPaths && touchedPaths.size === 0) {
    return null;
  }

  const paths = new Set<string>([
    ...beforeFiles.keys(),
    ...afterFiles.keys(),
  ]);

  const files = [...paths]
    .filter((path) => !touchedPaths || touchedPaths.has(path))
    .map((path) => compareFileChange(beforeFiles.get(path), afterFiles.get(path)))
    .filter((file): file is RunChangeSummaryFile => file !== null)
    .sort((left, right) => {
      const leftWeight = left.additions + left.deletions;
      const rightWeight = right.additions + right.deletions;
      if (leftWeight !== rightWeight) {
        return rightWeight - leftWeight;
      }
      return left.path.localeCompare(right.path, "en");
    });

  if (files.length === 0) {
    return null;
  }

  return {
    fileCount: files.length,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    files,
  };
}
