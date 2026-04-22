import fs from "node:fs/promises";
import path from "node:path";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { isPathAllowed, isPathForbiddenRead } from "../security.js";

const parameters = Type.Object({
  path: Type.String({ description: "文件路径（相对于 workspace 或绝对路径）" }),
  offset: Type.Optional(Type.Number({ description: "从第几行开始读（默认 1）" })),
  limit: Type.Optional(Type.Number({ description: "读多少行（默认 200，最大 2000）" })),
});

type FileReadDetails = {
  path: string;
  totalLines: number;
  readRange: { from: number; to: number };
  truncated: boolean;
  truncatedByBytes: boolean;
  bytesRead: number;
};

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp",
  ".pdf", ".zip", ".tar", ".gz", ".7z", ".rar",
  ".exe", ".dll", ".so", ".dylib", ".wasm",
  ".mp3", ".mp4", ".mov", ".avi", ".webm",
  ".ttf", ".otf", ".woff", ".woff2",
]);

const MAX_BYTES = 1024 * 1024; // 1 MB hard cap to avoid pulling huge files into memory.
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 2000;

function emptyDetails(reqPath: string): FileReadDetails {
  return {
    path: reqPath,
    totalLines: 0,
    readRange: { from: 0, to: 0 },
    truncated: false,
    truncatedByBytes: false,
    bytesRead: 0,
  };
}

function errorResult(reqPath: string, message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    details: emptyDetails(reqPath),
  };
}

export function createFileReadTool(
  workspacePath: string,
): AgentTool<typeof parameters, FileReadDetails> {
  return {
    name: "file_read",
    label: "读取文件",
    description: "读取本地文件内容。返回带行号的指定区间，超出限制时给出明确的续读提示。",
    parameters,
    async execute(_toolCallId, params) {
      const filePath = path.isAbsolute(params.path)
        ? params.path
        : path.resolve(workspacePath, params.path);

      if (!isPathAllowed(filePath, workspacePath)) {
        return errorResult(params.path, `路径超出 workspace 范围: ${params.path}`);
      }
      if (isPathForbiddenRead(filePath)) {
        return errorResult(params.path, `该文件包含敏感信息，不允许读取: ${params.path}`);
      }

      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch {
        return errorResult(params.path, `文件不存在: ${params.path}`);
      }
      if (!stat.isFile()) {
        return errorResult(params.path, `${params.path} 不是文件`);
      }

      const ext = path.extname(filePath).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) {
        const sizeKB = (stat.size / 1024).toFixed(1);
        return errorResult(
          params.path,
          `这是一个二进制文件（${ext}，${sizeKB}KB），无法以文本形式读取。`,
        );
      }

      let buffer: Buffer;
      let truncatedByBytes = false;
      try {
        if (stat.size > MAX_BYTES) {
          const fh = await fs.open(filePath, "r");
          try {
            const slice = Buffer.alloc(MAX_BYTES);
            await fh.read(slice, 0, MAX_BYTES, 0);
            buffer = slice;
            truncatedByBytes = true;
          } finally {
            await fh.close();
          }
        } else {
          buffer = await fs.readFile(filePath);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取失败";
        return errorResult(params.path, `读取失败: ${message}`);
      }

      // Cheap binary heuristic: NUL byte in first 8KB.
      const sniff = buffer.subarray(0, Math.min(buffer.length, 8192));
      if (sniff.includes(0)) {
        return errorResult(
          params.path,
          `${params.path} 看起来是二进制内容，无法以文本形式读取。`,
        );
      }

      const raw = buffer.toString("utf-8");
      const allLines = raw.split("\n");
      const totalLines = allLines.length;
      const offset = Math.max(1, Math.floor(params.offset ?? 1));
      const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(params.limit ?? DEFAULT_LIMIT)));
      const from = Math.min(offset, Math.max(1, totalLines));
      const to = Math.min(from + limit - 1, totalLines);
      const truncatedByLines = to < totalLines;

      const selectedLines = allLines.slice(from - 1, to);
      const padWidth = String(to).length;
      const numbered = selectedLines
        .map((line, i) => `${String(from + i).padStart(padWidth, " ")}  ${line}`)
        .join("\n");

      const headerParts = [`文件: ${params.path}`, `第 ${from}-${to} 行 / 共 ${totalLines} 行`];
      if (truncatedByBytes) headerParts.push(`已按 ${MAX_BYTES} 字节上限截断`);
      const header = `${headerParts.join("，")}\n\n`;

      const tips: string[] = [];
      if (truncatedByLines) {
        tips.push(`仅显示到第 ${to} 行，可继续 offset=${to + 1} 读取后续内容。`);
      }
      if (truncatedByBytes) {
        tips.push("文件超过 1 MB，建议改用搜索/分段读取，避免占用过多上下文。");
      }
      const footer = tips.length ? `\n\n[${tips.join(" ")}]` : "";

      return {
        content: [{ type: "text" as const, text: header + numbered + footer }],
        details: {
          path: params.path,
          totalLines,
          readRange: { from, to },
          truncated: truncatedByLines || truncatedByBytes,
          truncatedByBytes,
          bytesRead: buffer.length,
        },
      };
    },
  };
}
