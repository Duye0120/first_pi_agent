import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { isPathAllowed } from "../security.js";
import {
  resolveWorkspaceBasePath,
  toRelativeWorkspacePath,
} from "./fs-utils.js";
import { resolveRipgrepCommand } from "./ripgrep.js";

const execFileAsync = promisify(execFile);

const parameters = Type.Object({
  pattern: Type.Optional(Type.String({ description: "要搜索的模式；默认按正则解释" })),
  query: Type.Optional(Type.String({ description: "兼容参数：旧版 literal 搜索词" })),
  path: Type.Optional(Type.String({ description: "可选搜索根目录，默认 workspace 根目录" })),
  glob: Type.Optional(Type.String({ description: "可选 glob 过滤，例如 src/**/*.ts" })),
  filePattern: Type.Optional(Type.String({ description: "兼容参数：旧版 glob 过滤" })),
  output_mode: Type.Optional(Type.String({ description: "files_with_matches | content | count" })),
  regex: Type.Optional(Type.Boolean({ description: "兼容参数：旧版是否按正则处理 query" })),
  caseSensitive: Type.Optional(Type.Boolean({ description: "兼容参数：旧版是否区分大小写" })),
  "-B": Type.Optional(Type.Number({ description: "前文行数" })),
  "-A": Type.Optional(Type.Number({ description: "后文行数" })),
  "-C": Type.Optional(Type.Number({ description: "上下文行数" })),
  context: Type.Optional(Type.Number({ description: "上下文行数" })),
  "-n": Type.Optional(Type.Boolean({ description: "是否显示行号" })),
  "-i": Type.Optional(Type.Boolean({ description: "是否忽略大小写" })),
  type: Type.Optional(Type.String({ description: "文件类型，例如 ts / rs / py" })),
  head_limit: Type.Optional(Type.Number({ description: "最多返回多少条，默认 250" })),
  offset: Type.Optional(Type.Number({ description: "从第几条开始截取，默认 0" })),
  multiline: Type.Optional(Type.Boolean({ description: "是否启用 multiline" })),
  maxResults: Type.Optional(Type.Number({ description: "兼容参数：旧版最大结果数" })),
});

type GrepSearchDetails = {
  mode: string;
  numFiles: number;
  filenames: string[];
  content: string | null;
  numLines: number | null;
  numMatches: number | null;
  appliedLimit: number | null;
  appliedOffset: number | null;
};

function toSafeInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value!)) : fallback;
}

function sliceItems<T>(
  items: T[],
  offset: number,
  limit: number,
): { items: T[]; appliedLimit: number | null; appliedOffset: number | null } {
  const sliced = items.slice(offset, offset + limit);
  return {
    items: sliced,
    appliedLimit: items.length > offset + limit ? limit : null,
    appliedOffset: offset > 0 ? offset : null,
  };
}

function normalizeMode(value?: string): "files_with_matches" | "content" | "count" {
  switch (value) {
    case "content":
    case "count":
      return value;
    default:
      return "files_with_matches";
  }
}

function normalizePattern(params: Record<string, unknown>): {
  pattern: string;
  fixedStrings: boolean;
  caseInsensitive: boolean;
} {
  const query = typeof params.query === "string" ? params.query.trim() : "";
  const pattern = typeof params.pattern === "string" ? params.pattern.trim() : "";
  const regex = params.regex === true;
  const caseSensitive = params.caseSensitive === true;
  const caseInsensitive = params["-i"] === true || (!caseSensitive && !params["-i"]);

  if (query) {
    return {
      pattern: query,
      fixedStrings: !regex,
      caseInsensitive,
    };
  }

  return {
    pattern,
    fixedStrings: false,
    caseInsensitive,
  };
}

async function runRipgrep(
  workspacePath: string,
  args: string[],
): Promise<string> {
  const result = await execFileAsync(resolveRipgrepCommand(), args, {
    cwd: workspacePath,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    encoding: "utf8",
  });

  return result.stdout ?? "";
}

function normalizeRipgrepPath(workspacePath: string, rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return trimmed;
  }

  return toRelativeWorkspacePath(workspacePath, path.resolve(workspacePath, trimmed));
}

function extractFilenameFromContentLine(
  workspacePath: string,
  line: string,
): string | null {
  const matchLine = line.match(/^(.+?):(\d+):/);
  if (matchLine?.[1]) {
    return normalizeRipgrepPath(workspacePath, matchLine[1]);
  }

  const contextLine = line.match(/^(.+?)-(\d+)-/);
  if (contextLine?.[1]) {
    return normalizeRipgrepPath(workspacePath, contextLine[1]);
  }

  return null;
}

export function createGrepSearchTool(workspacePath: string): AgentTool<typeof parameters, GrepSearchDetails> {
  return {
    name: "grep_search",
    label: "文本搜索",
    description: "在 workspace 中做高性能全文搜索。优先走原生 ripgrep。",
    parameters,
    async execute(_toolCallId, params) {
      const normalized = normalizePattern(params as Record<string, unknown>);
      if (!normalized.pattern) {
        const details: GrepSearchDetails = {
          mode: "files_with_matches",
          numFiles: 0,
          filenames: [],
          content: null,
          numLines: null,
          numMatches: null,
          appliedLimit: null,
          appliedOffset: null,
        };

        return {
          content: [{ type: "text", text: JSON.stringify({ error: "pattern 不能为空。" }, null, 2) }],
          details,
        };
      }

      const basePath = resolveWorkspaceBasePath(workspacePath, params.path);
      if (!isPathAllowed(basePath, workspacePath)) {
        const details: GrepSearchDetails = {
          mode: "files_with_matches",
          numFiles: 0,
          filenames: [],
          content: null,
          numLines: null,
          numMatches: null,
          appliedLimit: null,
          appliedOffset: null,
        };

        return {
          content: [{ type: "text", text: JSON.stringify({ error: "路径超出 workspace 范围。" }, null, 2) }],
          details,
        };
      }

      const mode = normalizeMode(params.output_mode);
      const rgBasePath = path.relative(workspacePath, basePath) || ".";
      const limit = Math.max(
        1,
        Math.min(
          toSafeInteger(params.head_limit, toSafeInteger(params.maxResults, 250)),
          1000,
        ),
      );
      const offset = toSafeInteger(params.offset, 0);
      const context = toSafeInteger(
        params.context ?? params["-C"] ?? undefined,
        0,
      );
      const before = toSafeInteger(params["-B"], context);
      const after = toSafeInteger(params["-A"], context);
      const glob = typeof params.glob === "string"
        ? params.glob
        : typeof params.filePattern === "string"
          ? params.filePattern
          : undefined;

      const commonArgs = ["--color", "never", "--no-heading"];
      if (normalized.caseInsensitive) {
        commonArgs.push("-i");
      }
      if (normalized.fixedStrings) {
        commonArgs.push("-F");
      }
      if (params.multiline) {
        commonArgs.push("--multiline");
      }
      if (glob?.trim()) {
        commonArgs.push("-g", glob.trim());
      }
      if (params.type?.trim()) {
        commonArgs.push("--type", params.type.trim());
      }

      let details: GrepSearchDetails;
      if (mode === "files_with_matches") {
        const stdout = await runRipgrep(workspacePath, [
          ...commonArgs,
          "-l",
          normalized.pattern,
          rgBasePath,
        ]).catch(() => "");

        const filenames = stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => normalizeRipgrepPath(workspacePath, line));
        const sliced = sliceItems(filenames, offset, limit);
        details = {
          mode,
          numFiles: sliced.items.length,
          filenames: sliced.items,
          content: null,
          numLines: null,
          numMatches: null,
          appliedLimit: sliced.appliedLimit,
          appliedOffset: sliced.appliedOffset,
        };
      } else if (mode === "count") {
        const stdout = await runRipgrep(workspacePath, [
          ...commonArgs,
          "--count-matches",
          normalized.pattern,
          rgBasePath,
        ]).catch(() => "");

        const rows = stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        const filenames = rows.map((row) => {
          const lastColonIndex = row.lastIndexOf(":");
          return normalizeRipgrepPath(
            workspacePath,
            lastColonIndex >= 0 ? row.slice(0, lastColonIndex) : row,
          );
        });
        const matchCounts = rows.reduce((sum, row) => {
          const tail = row.slice(row.lastIndexOf(":") + 1) || "0";
          const value = Number.parseInt(tail, 10);
          return sum + (Number.isFinite(value) ? value : 0);
        }, 0);
        const sliced = sliceItems(filenames, offset, limit);

        details = {
          mode,
          numFiles: sliced.items.length,
          filenames: sliced.items,
          content: null,
          numLines: null,
          numMatches: matchCounts,
          appliedLimit: sliced.appliedLimit,
          appliedOffset: sliced.appliedOffset,
        };
      } else {
        const stdout = await runRipgrep(workspacePath, [
          ...commonArgs,
          "-n",
          ...(before > 0 ? ["-B", String(before)] : []),
          ...(after > 0 ? ["-A", String(after)] : []),
          normalized.pattern,
          rgBasePath,
        ]).catch(() => "");

        const contentLines = stdout
          .split(/\r?\n/)
          .filter((line) => line.trim().length > 0);
        const sliced = sliceItems(contentLines, offset, limit);
        const filenames = [...new Set(
          sliced.items
            .map((line) => extractFilenameFromContentLine(workspacePath, line))
            .filter((value): value is string => !!value),
        )];

        details = {
          mode,
          numFiles: filenames.length,
          filenames,
          content: sliced.items.join("\n"),
          numLines: sliced.items.length,
          numMatches: null,
          appliedLimit: sliced.appliedLimit,
          appliedOffset: sliced.appliedOffset,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
        details,
      };
    },
  };
}
