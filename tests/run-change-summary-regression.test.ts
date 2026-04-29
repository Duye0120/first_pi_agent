import assert from "node:assert/strict";
import path from "node:path";
import type {
  AgentStep,
  GitDiffFile,
  GitDiffOverview,
} from "../src/shared/contracts.ts";
import {
  buildRunChangeSummary,
  collectRunTouchedPaths,
} from "../src/main/chat/run-change-summary.ts";

function diffFile(
  filePath: string,
  additions: number,
  deletions = 0,
): GitDiffFile {
  return {
    path: filePath,
    status: "modified",
    additions,
    deletions,
  };
}

function overview(files: GitDiffFile[]): GitDiffOverview {
  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);

  return {
    isGitRepo: true,
    generatedAt: Date.now(),
    branch: {
      branchName: "main",
      isDetached: false,
      hasChanges: files.length > 0,
    },
    sources: {
      unstaged: { files: [], totalFiles: 0, totalAdditions: 0, totalDeletions: 0 },
      staged: { files: [], totalFiles: 0, totalAdditions: 0, totalDeletions: 0 },
      all: {
        files,
        totalFiles: files.length,
        totalAdditions,
        totalDeletions,
      },
    },
  };
}

const before = overview([]);
const after = overview([
  diffFile("src/current-run.ts", 12, 2),
  diffFile("src/other-session.ts", 20, 1),
]);

const filtered = buildRunChangeSummary(before, after, {
  touchedPaths: [".\\src\\current-run.ts"],
});
assert.equal(filtered?.fileCount, 1);
assert.equal(filtered?.files[0]?.path, "src/current-run.ts");
assert.equal(filtered?.additions, 12);
assert.equal(filtered?.deletions, 2);

const emptyTouched = buildRunChangeSummary(before, after, {
  touchedPaths: [],
});
assert.equal(emptyTouched, null);

const workspacePath = path.resolve("D:/workspace/chela");
const steps: AgentStep[] = [
  {
    id: "read-only",
    kind: "tool_call",
    status: "success",
    startedAt: 1,
    toolName: "file_read",
    toolArgs: { path: "src/ignored.ts" },
  },
  {
    id: "edit",
    kind: "tool_call",
    status: "success",
    startedAt: 2,
    toolName: "file_edit",
    toolArgs: { path: ".\\src\\current-run.ts" },
    toolResult: {
      details: {
        filePath: path.join(workspacePath, "src", "current-run.ts"),
      },
    },
  },
  {
    id: "write",
    kind: "tool_call",
    status: "success",
    startedAt: 3,
    toolName: "file_write",
    toolArgs: { path: "docs\\changes\\2026-04-29\\changes.md" },
    toolResult: {
      details: {
        filePath: path.join(workspacePath, "src", "result-path.ts"),
      },
    },
  },
  {
    id: "failed-edit",
    kind: "tool_call",
    status: "error",
    startedAt: 4,
    toolName: "file_edit",
    toolArgs: { path: "src/failed.ts" },
    toolResult: {
      details: {
        filePath: path.join(workspacePath, "src", "failed.ts"),
      },
    },
  },
  {
    id: "incomplete-edit",
    kind: "tool_call",
    status: "success",
    startedAt: 5,
    toolName: "file_edit",
    toolArgs: { path: "src/incomplete.ts" },
  },
];

const touchedPaths = collectRunTouchedPaths(steps, workspacePath);
assert.deepEqual(
  [...touchedPaths].sort(),
  [
    "docs/changes/2026-04-29/changes.md",
    "src/current-run.ts",
    "src/result-path.ts",
  ],
);

console.log("run change summary regression tests passed");
