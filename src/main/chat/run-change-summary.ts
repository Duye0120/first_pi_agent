import type {
  GitDiffFile,
  GitDiffOverview,
  RunChangeSummary,
  RunChangeSummaryFile,
} from "../../shared/contracts.js";

function toFileMap(snapshot: GitDiffOverview | null): Map<string, GitDiffFile> {
  if (!snapshot?.isGitRepo) {
    return new Map();
  }

  return new Map(
    snapshot.sources.all.files.map((file) => [file.path, file] as const),
  );
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
): RunChangeSummary | null {
  const beforeFiles = toFileMap(beforeSnapshot);
  const afterFiles = toFileMap(afterSnapshot);
  const paths = new Set<string>([
    ...beforeFiles.keys(),
    ...afterFiles.keys(),
  ]);

  const files = [...paths]
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
