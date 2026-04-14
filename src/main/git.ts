import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { createTwoFilesPatch, parsePatch } from "diff";
import type {
  GitBranchEntry,
  GitBranchSummary,
  GitDiffFile,
  GitDiffOverview,
  GitDiffSource,
  GitDiffSourceSnapshot,
} from "../shared/contracts.js";

const execFileAsync = promisify(execFile);
const EMPTY_TREE_HASH = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const GIT_MAX_BUFFER = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"]);
const TEXT_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "md",
  "txt",
  "yml",
  "yaml",
  "toml",
  "html",
  "css",
  "scss",
  "less",
  "py",
  "java",
  "go",
  "rs",
  "sh",
  "ps1",
  "xml",
  "csv",
  "env",
]);
const DIFF_SOURCES = ["unstaged", "staged", "all"] as const satisfies readonly GitDiffSource[];

type GitCommandResult = {
  stdout: string;
  stderr: string;
};

type GitStatusEntry = {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
  status: GitDiffFile["status"];
};

type GitStatusSnapshot = {
  branch: GitBranchSummary;
  entries: GitStatusEntry[];
};

async function runGit(args: string[], cwd: string): Promise<GitCommandResult> {
  const result = await execFileAsync("git", args, {
    cwd,
    windowsHide: true,
    maxBuffer: GIT_MAX_BUFFER,
    encoding: "utf8",
  });

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function createEmptySourceSnapshot(): GitDiffSourceSnapshot {
  return {
    files: [],
    totalFiles: 0,
    totalAdditions: 0,
    totalDeletions: 0,
  };
}

function createEmptyBranchSummary(): GitBranchSummary {
  return {
    branchName: null,
    isDetached: false,
    hasChanges: false,
  };
}

function createEmptyOverview(generatedAt: number, isGitRepo: boolean): GitDiffOverview {
  return {
    isGitRepo,
    generatedAt,
    branch: createEmptyBranchSummary(),
    sources: {
      unstaged: createEmptySourceSnapshot(),
      staged: createEmptySourceSnapshot(),
      all: createEmptySourceSnapshot(),
    },
  };
}

async function isGitRepository(workspacePath: string) {
  try {
    const result = await runGit(["rev-parse", "--is-inside-work-tree"], workspacePath);
    return result.stdout.trim() === "true";
  } catch {
    return false;
  }
}

function getGitErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const candidate = error as {
    stderr?: unknown;
    stdout?: unknown;
    message?: unknown;
  };
  const stderr =
    typeof candidate.stderr === "string" ? candidate.stderr.trim() : "";
  const stdout =
    typeof candidate.stdout === "string" ? candidate.stdout.trim() : "";

  if (stderr) return stderr;
  if (stdout) return stdout;
  if (typeof candidate.message === "string" && candidate.message.trim()) {
    return candidate.message.trim();
  }

  return fallback;
}

async function ensureGitRepository(workspacePath: string) {
  const repository = await isGitRepository(workspacePath);
  if (!repository) {
    throw new Error("当前 workspace 不是 Git 仓库。");
  }
}

async function assertBranchName(workspacePath: string, branchName: string) {
  const normalizedBranchName = branchName.trim();
  if (!normalizedBranchName) {
    throw new Error("分支名不能为空。");
  }

  try {
    await runGit(["check-ref-format", "--branch", normalizedBranchName], workspacePath);
  } catch (error) {
    throw new Error(getGitErrorMessage(error, "分支名不合法。"));
  }

  return normalizedBranchName;
}

async function resolveDiffBase(workspacePath: string) {
  try {
    await runGit(["rev-parse", "--verify", "HEAD"], workspacePath);
    return "HEAD";
  } catch {
    return EMPTY_TREE_HASH;
  }
}

function normalizeStatus(statusCode: string): GitDiffFile["status"] | null {
  if (statusCode === "??") {
    return "untracked";
  }

  if (statusCode === "!!") {
    return null;
  }

  if (statusCode.includes("D")) {
    return "deleted";
  }

  return "modified";
}

function normalizePath(rawPath: string) {
  if (rawPath.includes(" -> ")) {
    return rawPath.split(" -> ").at(-1) ?? rawPath;
  }

  return rawPath;
}

async function resolveDetachedHeadLabel(workspacePath: string): Promise<string> {
  try {
    const result = await runGit(["rev-parse", "--short", "HEAD"], workspacePath);
    const label = result.stdout.trim();
    return label || "HEAD";
  } catch {
    return "HEAD";
  }
}

async function resolveBranchSummary(
  branchLine: string | undefined,
  workspacePath: string,
): Promise<Omit<GitBranchSummary, "hasChanges">> {
  if (!branchLine || !branchLine.startsWith("## ")) {
    return {
      branchName: null,
      isDetached: false,
    };
  }

  const summary = branchLine.slice(3).trim();

  if (summary.startsWith("No commits yet on ")) {
    return {
      branchName: summary.slice("No commits yet on ".length).trim() || null,
      isDetached: false,
    };
  }

  if (summary.startsWith("HEAD")) {
    return {
      branchName: await resolveDetachedHeadLabel(workspacePath),
      isDetached: true,
    };
  }

  const branchName = summary.split("...")[0]?.trim() || null;
  return {
    branchName,
    isDetached: false,
  };
}

async function listStatusSnapshot(workspacePath: string): Promise<GitStatusSnapshot> {
  const result = await runGit(
    ["status", "--porcelain=v1", "--branch", "--untracked-files=all"],
    workspacePath,
  );

  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const firstLine = lines[0];
  const statusLines = firstLine?.startsWith("## ") ? lines.slice(1) : lines;
  const entries = statusLines
    .map((line) => {
      const statusCode = line.slice(0, 2);
      const fileStatus = normalizeStatus(statusCode);
      const filePath = normalizePath(line.slice(3));

      if (!fileStatus || !filePath) {
        return null;
      }

      return {
        path: filePath,
        indexStatus: statusCode[0] ?? " ",
        worktreeStatus: statusCode[1] ?? " ",
        status: fileStatus,
      };
    })
    .filter((entry): entry is GitStatusEntry => !!entry);
  const branch = await resolveBranchSummary(firstLine, workspacePath);

  return {
    branch: {
      ...branch,
      hasChanges: entries.length > 0,
    },
    entries,
  };
}

function isEntryInSource(entry: GitStatusEntry, source: GitDiffSource) {
  if (source === "staged") {
    return entry.status !== "untracked" && entry.indexStatus !== " " && entry.indexStatus !== "?";
  }

  if (source === "unstaged") {
    return entry.status === "untracked" || (entry.worktreeStatus !== " " && entry.worktreeStatus !== "?");
  }

  return true;
}

function resolveSourceStatus(entry: GitStatusEntry, source: GitDiffSource): GitDiffFile["status"] {
  if (source === "staged") {
    return entry.indexStatus === "D" ? "deleted" : "modified";
  }

  if (source === "unstaged") {
    if (entry.status === "untracked") {
      return "untracked";
    }

    return entry.worktreeStatus === "D" ? "deleted" : "modified";
  }

  return entry.status;
}

function getExtension(filePath: string) {
  return path.extname(filePath).replace(/^\./, "").toLowerCase();
}

function resolveFileKind(filePath: string, patch: string): GitDiffFile["kind"] {
  const extension = getExtension(filePath);

  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  if (patch.includes("Binary files")) {
    return "binary";
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    return "text";
  }

  return "binary";
}

function resolvePreviewPath(workspacePath: string, filePath: string, kind: GitDiffFile["kind"]) {
  if (kind !== "image") {
    return undefined;
  }

  const absolutePath = path.resolve(workspacePath, filePath);
  return existsSync(absolutePath) ? absolutePath : undefined;
}

function createUntrackedPatch(workspacePath: string, filePath: string) {
  const absolutePath = path.resolve(workspacePath, filePath);

  if (!existsSync(absolutePath)) {
    return `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n`;
  }

  const buffer = readFileSync(absolutePath);
  if (buffer.includes(0)) {
    return [
      `diff --git a/${filePath} b/${filePath}`,
      "new file mode 100644",
      `Binary files /dev/null and b/${filePath} differ`,
    ].join("\n");
  }

  const content = buffer.toString("utf8");
  return createTwoFilesPatch(
    filePath,
    filePath,
    "",
    content,
    "0000000",
    "working-tree",
    { context: 3 },
  );
}

async function createTrackedPatch(
  workspacePath: string,
  filePath: string,
  baseRef: string,
  source: GitDiffSource,
) {
  try {
    const sourceArgs =
      source === "staged"
        ? ["diff", "--cached", "--no-ext-diff", "--unified=3", "--relative", baseRef]
        : source === "all"
          ? ["diff", "--no-ext-diff", "--unified=3", "--relative", baseRef]
          : ["diff", "--no-ext-diff", "--unified=3", "--relative"];

    const result = await runGit(
      [...sourceArgs, "--", filePath],
      workspacePath,
    );

    return result.stdout;
  } catch {
    return "";
  }
}

function countPatchStats(patch: string) {
  const parsed = parsePatch(patch);
  let additions = 0;
  let deletions = 0;

  for (const filePatch of parsed) {
    for (const hunk of filePatch.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith("+")) {
          additions += 1;
        } else if (line.startsWith("-")) {
          deletions += 1;
        }
      }
    }
  }

  return { additions, deletions };
}

async function buildDiffFile(
  workspacePath: string,
  baseRef: string,
  source: GitDiffSource,
  entry: GitStatusEntry,
): Promise<GitDiffFile> {
  const status = resolveSourceStatus(entry, source);
  const patch =
    status === "untracked"
      ? createUntrackedPatch(workspacePath, entry.path)
      : await createTrackedPatch(workspacePath, entry.path, baseRef, source);
  const kind = resolveFileKind(entry.path, patch);
  const { additions, deletions } = countPatchStats(patch);

  return {
    path: entry.path,
    status,
    patch,
    kind,
    additions,
    deletions,
    previewPath: resolvePreviewPath(workspacePath, entry.path, kind),
  };
}

function createSourceSnapshot(files: GitDiffFile[]): GitDiffSourceSnapshot {
  return {
    files,
    totalFiles: files.length,
    totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
    totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
  };
}

async function buildSourceSnapshot(
  workspacePath: string,
  baseRef: string,
  source: GitDiffSource,
  entries: GitStatusEntry[],
): Promise<GitDiffSourceSnapshot> {
  const sourceEntries = entries
    .filter((entry) => isEntryInSource(entry, source))
    .sort((left, right) => left.path.localeCompare(right.path, "en"));

  if (sourceEntries.length === 0) {
    return createEmptySourceSnapshot();
  }

  const files = await Promise.all(
    sourceEntries.map((entry) => buildDiffFile(workspacePath, baseRef, source, entry)),
  );

  return createSourceSnapshot(files);
}

export async function getGitDiffSnapshot(workspacePath: string): Promise<GitDiffOverview> {
  const generatedAt = Date.now();
  const repository = await isGitRepository(workspacePath);

  if (!repository) {
    return createEmptyOverview(generatedAt, false);
  }

  const baseRef = await resolveDiffBase(workspacePath);
  const statusSnapshot = await listStatusSnapshot(workspacePath);
  const sourceSnapshots = await Promise.all(
    DIFF_SOURCES.map(async (source) => [
      source,
      await buildSourceSnapshot(workspacePath, baseRef, source, statusSnapshot.entries),
    ] as const),
  );

  return {
    isGitRepo: true,
    generatedAt,
    branch: statusSnapshot.branch,
    sources: Object.fromEntries(sourceSnapshots) as GitDiffOverview["sources"],
  };
}

export async function getGitBranchSummary(workspacePath: string): Promise<GitBranchSummary> {
  const repository = await isGitRepository(workspacePath);

  if (!repository) {
    return createEmptyBranchSummary();
  }

  try {
    const result = await runGit(["symbolic-ref", "--short", "-q", "HEAD"], workspacePath);
    const branchName = result.stdout.trim();
    if (branchName) {
      return {
        branchName,
        isDetached: false,
        hasChanges: false,
      };
    }
  } catch {
    // Detached HEAD 走下面的 fallback。
  }

  return {
    branchName: await resolveDetachedHeadLabel(workspacePath),
    isDetached: true,
    hasChanges: false,
  };
}

export async function listGitBranches(workspacePath: string): Promise<GitBranchEntry[]> {
  await ensureGitRepository(workspacePath);

  try {
    const result = await runGit(
      [
        "for-each-ref",
        "--format=%(refname:short)%00%(if)%(HEAD)%(then)1%(else)0%(end)",
        "refs/heads",
      ],
      workspacePath,
    );

    return result.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [name, isCurrentFlag] = line.split("\0");
        return {
          name: name?.trim() ?? "",
          isCurrent: isCurrentFlag === "1",
        } satisfies GitBranchEntry;
      })
      .filter((branch) => branch.name.length > 0)
      .sort((left, right) => {
        if (left.isCurrent !== right.isCurrent) {
          return left.isCurrent ? -1 : 1;
        }

        return left.name.localeCompare(right.name, "en");
      });
  } catch (error) {
    throw new Error(getGitErrorMessage(error, "读取本地分支失败。"));
  }
}

export async function switchGitBranch(
  workspacePath: string,
  branchName: string,
): Promise<void> {
  await ensureGitRepository(workspacePath);
  const normalizedBranchName = await assertBranchName(workspacePath, branchName);

  try {
    await runGit(["switch", "--quiet", normalizedBranchName], workspacePath);
  } catch (error) {
    throw new Error(getGitErrorMessage(error, "切换分支失败。"));
  }
}

export async function createAndSwitchGitBranch(
  workspacePath: string,
  branchName: string,
): Promise<void> {
  await ensureGitRepository(workspacePath);
  const normalizedBranchName = await assertBranchName(workspacePath, branchName);

  try {
    await runGit(["switch", "--quiet", "-c", normalizedBranchName], workspacePath);
  } catch (error) {
    throw new Error(getGitErrorMessage(error, "创建并切换分支失败。"));
  }
}

export async function stageGitFiles(workspacePath: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await runGit(["add", ...paths], workspacePath);
}

export async function unstageGitFiles(workspacePath: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await runGit(["reset", "HEAD", ...paths], workspacePath);
}

export async function commitGitChanges(workspacePath: string, message: string): Promise<void> {
  await runGit(["commit", "-m", message], workspacePath);
}

export async function pushGitChanges(workspacePath: string): Promise<void> {
  await runGit(["push"], workspacePath);
}
