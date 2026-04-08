import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { isPathAllowed, isPathForbiddenRead } from "../security.js";
import {
  collectWorkspaceFileEntries,
  resolveWorkspaceBasePath,
  toRelativeWorkspacePath,
} from "./fs-utils.js";
import { resolveRipgrepCommand } from "./ripgrep.js";

const execFileAsync = promisify(execFile);

const parameters = Type.Object({
  pattern: Type.String({ description: "glob 模式，例如 **/*.ts" }),
  path: Type.Optional(Type.String({ description: "可选搜索根目录，默认 workspace 根目录" })),
  maxResults: Type.Optional(Type.Number({ description: "最多返回多少个结果，默认 100" })),
  includeHidden: Type.Optional(Type.Boolean({ description: "是否包含隐藏文件，默认 false" })),
});

type GlobSearchDetails = {
  durationMs: number;
  numFiles: number;
  filenames: string[];
  truncated: boolean;
};

function createFallbackResult(
  workspacePath: string,
  basePath: string,
  pattern: string,
  maxResults: number,
  includeHidden: boolean,
  startedAt: number,
): GlobSearchDetails {
  const entries = collectWorkspaceFileEntries(workspacePath, basePath, {
    pattern,
    includeHidden,
    maxResults: Math.max(maxResults * 4, maxResults + 1),
  }).sort((left, right) => right.mtimeMs - left.mtimeMs);

  const truncated = entries.length > maxResults;
  const filenames = entries
    .slice(0, maxResults)
    .map((entry) => entry.relativePath);

  return {
    durationMs: Date.now() - startedAt,
    numFiles: filenames.length,
    filenames,
    truncated,
  };
}

async function runRipgrepGlob(
  workspacePath: string,
  basePath: string,
  pattern: string,
  maxResults: number,
  includeHidden: boolean,
  startedAt: number,
): Promise<GlobSearchDetails> {
  const rgBasePath = path.relative(workspacePath, basePath) || ".";
  const args = ["--files", rgBasePath, "-g", pattern];
  if (includeHidden) {
    args.push("--hidden");
  }

  const result = await execFileAsync(resolveRipgrepCommand(), args, {
    cwd: workspacePath,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    encoding: "utf8",
  });

  const paths = (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((filePath) => {
      const normalized = filePath.replace(/\//g, "\\");
      return !normalized.includes("\\.git\\");
    });

  const entries = paths
    .map((filePath) => {
      const absolutePath = resolveWorkspaceBasePath(workspacePath, filePath);
      if (
        !fs.existsSync(absolutePath) ||
        !isPathAllowed(absolutePath, workspacePath) ||
        isPathForbiddenRead(absolutePath)
      ) {
        return null;
      }

      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(absolutePath).mtimeMs;
      } catch {
        mtimeMs = 0;
      }

      return {
        relativePath: toRelativeWorkspacePath(workspacePath, absolutePath),
        mtimeMs,
      };
    })
    .filter((entry): entry is { relativePath: string; mtimeMs: number } => !!entry)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  const truncated = entries.length > maxResults;
  const filenames = entries.slice(0, maxResults).map((entry) => entry.relativePath);

  return {
    durationMs: Date.now() - startedAt,
    numFiles: filenames.length,
    filenames,
    truncated,
  };
}

export function createGlobSearchTool(workspacePath: string): AgentTool<typeof parameters, GlobSearchDetails> {
  return {
    name: "glob_search",
    label: "匹配文件",
    description: "按 glob 模式快速找文件。优先走原生 ripgrep，速度更稳。",
    parameters,
    async execute(_toolCallId, params) {
      const startedAt = Date.now();
      const maxResults = Math.max(1, Math.min(params.maxResults ?? 100, 500));
      const includeHidden = params.includeHidden ?? false;
      const basePath = resolveWorkspaceBasePath(workspacePath, params.path);

      if (!isPathAllowed(basePath, workspacePath)) {
        const details: GlobSearchDetails = {
          durationMs: Date.now() - startedAt,
          numFiles: 0,
          filenames: [],
          truncated: false,
        };

        return {
          content: [{ type: "text", text: JSON.stringify({ error: "路径超出 workspace 范围。" }, null, 2) }],
          details,
        };
      }

      let details: GlobSearchDetails;
      try {
        details = await runRipgrepGlob(
          workspacePath,
          basePath,
          params.pattern,
          maxResults,
          includeHidden,
          startedAt,
        );
      } catch {
        details = createFallbackResult(
          workspacePath,
          basePath,
          params.pattern,
          maxResults,
          includeHidden,
          startedAt,
        );
      }

      return {
        content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
        details,
      };
    },
  };
}
