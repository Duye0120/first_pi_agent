import fs from "node:fs";
import path from "node:path";
import { isPathAllowed, isPathForbiddenRead } from "../security.js";

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".wasm",
  ".jar",
  ".ttf",
  ".woff",
  ".woff2",
]);

const DEFAULT_IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "out",
]);

export type WorkspaceFileEntry = {
  absolutePath: string;
  relativePath: string;
  mtimeMs: number;
};

function escapeRegExp(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function resolveWorkspacePath(
  workspacePath: string,
  targetPath: string,
): string {
  return path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(workspacePath, targetPath);
}

export function toRelativeWorkspacePath(
  workspacePath: string,
  targetPath: string,
): string {
  const relativePath = path.relative(workspacePath, targetPath);
  return relativePath.split(path.sep).join("/");
}

export function isTextFile(filePath: string): boolean {
  return !BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function readTextFileSafe(filePath: string): string | null {
  if (!isTextFile(filePath)) {
    return null;
  }

  const buffer = fs.readFileSync(filePath);
  if (buffer.includes(0)) {
    return null;
  }

  return buffer.toString("utf-8");
}

export function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.trim().replace(/\\/g, "/");
  if (!normalized || normalized === "**") {
    return /^.*$/;
  }

  let regex = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const nextChar = normalized[index + 1];
    const afterNextChar = normalized[index + 2];

    if (char === "*" && nextChar === "*" && afterNextChar === "/") {
      regex += "(?:.*/)?";
      index += 2;
      continue;
    }

    if (char === "*" && nextChar === "*") {
      regex += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      regex += "[^/]*";
      continue;
    }

    if (char === "?") {
      regex += "[^/]";
      continue;
    }

    regex += escapeRegExp(char);
  }

  return new RegExp(`^${regex}$`);
}

export function matchGlob(pattern: string, relativePath: string): boolean {
  return globToRegExp(pattern).test(relativePath.replace(/\\/g, "/"));
}

export function resolveWorkspaceBasePath(
  workspacePath: string,
  targetPath?: string | null,
): string {
  if (!targetPath?.trim()) {
    return workspacePath;
  }

  return resolveWorkspacePath(workspacePath, targetPath);
}

export function collectWorkspaceFileEntries(
  workspacePath: string,
  basePath: string,
  options?: {
    pattern?: string;
    includeHidden?: boolean;
    maxResults?: number;
  },
): WorkspaceFileEntry[] {
  const matches: WorkspaceFileEntry[] = [];
  const pattern = options?.pattern?.trim();
  const maxResults = Math.max(1, Math.min(options?.maxResults ?? 200, 2_000));
  const includeHidden = options?.includeHidden ?? false;
  const patternMatcher = pattern ? globToRegExp(pattern) : null;

  const walk = (dirPath: string) => {
    if (matches.length >= maxResults) {
      return;
    }

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (matches.length >= maxResults) {
        return;
      }

      if (!includeHidden && entry.name.startsWith(".")) {
        if (entry.isDirectory() && !DEFAULT_IGNORED_DIRS.has(entry.name)) {
          continue;
        }
        if (!entry.isDirectory()) {
          continue;
        }
      }

      const absolutePath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (DEFAULT_IGNORED_DIRS.has(entry.name)) {
          continue;
        }

        walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (
        !isPathAllowed(absolutePath, workspacePath) ||
        isPathForbiddenRead(absolutePath)
      ) {
        continue;
      }

      const relativePath = toRelativeWorkspacePath(workspacePath, absolutePath);
      if (patternMatcher && !patternMatcher.test(relativePath)) {
        continue;
      }

      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(absolutePath).mtimeMs;
      } catch {
        mtimeMs = 0;
      }

      matches.push({
        absolutePath,
        relativePath,
        mtimeMs,
      });
    }
  };

  if (!fs.existsSync(basePath)) {
    return [];
  }

  const stat = fs.statSync(basePath);
  if (stat.isFile()) {
    if (
      isPathAllowed(basePath, workspacePath) &&
      !isPathForbiddenRead(basePath)
    ) {
      const relativePath = toRelativeWorkspacePath(workspacePath, basePath);
      if (!patternMatcher || patternMatcher.test(relativePath)) {
        matches.push({
          absolutePath: basePath,
          relativePath,
          mtimeMs: stat.mtimeMs,
        });
      }
    }
    return matches;
  }

  walk(basePath);
  return matches;
}

export function listWorkspaceFiles(
  workspacePath: string,
  options?: {
    pattern?: string;
    includeHidden?: boolean;
    maxResults?: number;
  },
): string[] {
  return collectWorkspaceFileEntries(workspacePath, workspacePath, options)
    .map((entry) => entry.relativePath);
}

export function lineNumberAt(content: string, index: number): number {
  if (index <= 0) {
    return 1;
  }

  return content.slice(0, index).split(/\r?\n/).length;
}
