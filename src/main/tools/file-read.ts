import fs from "node:fs";
import path from "node:path";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { isPathAllowed, isPathForbiddenRead } from "../security.js";

const parameters = Type.Object({
  path: Type.String({ description: "文件路径（相对于 workspace 或绝对路径）" }),
  offset: Type.Optional(Type.Number({ description: "从第几行开始读（默认 1）" })),
  limit: Type.Optional(Type.Number({ description: "读多少行（默认 200）" })),
});

type FileReadDetails = {
  path: string;
  totalLines: number;
  readRange: { from: number; to: number };
  truncated: boolean;
};

export function createFileReadTool(workspacePath: string): AgentTool<typeof parameters, FileReadDetails> {
  return {
    name: "file_read",
    label: "读取文件",
    description: "读取本地文件内容。返回指定行范围的文本，用于查看代码、配置等文件。",
    parameters,
    async execute(_toolCallId, params) {
      const filePath = path.isAbsolute(params.path)
        ? params.path
        : path.resolve(workspacePath, params.path);

      if (!isPathAllowed(filePath, workspacePath)) {
        return {
          content: [{ type: "text", text: `路径超出 workspace 范围: ${params.path}` }],
          details: { path: params.path, totalLines: 0, readRange: { from: 0, to: 0 }, truncated: false },
        };
      }

      if (isPathForbiddenRead(filePath)) {
        return {
          content: [{ type: "text", text: `该文件包含敏感信息，不允许读取: ${params.path}` }],
          details: { path: params.path, totalLines: 0, readRange: { from: 0, to: 0 }, truncated: false },
        };
      }

      if (!fs.existsSync(filePath)) {
        return {
          content: [{ type: "text", text: `文件不存在: ${params.path}` }],
          details: { path: params.path, totalLines: 0, readRange: { from: 0, to: 0 }, truncated: false },
        };
      }

      const stat = fs.statSync(filePath);
      if (!stat.isFile()) {
        return {
          content: [{ type: "text", text: `${params.path} 不是文件` }],
          details: { path: params.path, totalLines: 0, readRange: { from: 0, to: 0 }, truncated: false },
        };
      }

      // Binary check
      const ext = path.extname(filePath).toLowerCase();
      const binaryExts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".pdf", ".zip", ".tar", ".gz", ".exe", ".dll", ".so", ".dylib", ".wasm"];
      if (binaryExts.includes(ext)) {
        const sizeKB = (stat.size / 1024).toFixed(1);
        return {
          content: [{ type: "text", text: `这是一个二进制文件（${ext}，${sizeKB}KB），无法以文本形式读取。` }],
          details: { path: params.path, totalLines: 0, readRange: { from: 0, to: 0 }, truncated: false },
        };
      }

      const raw = fs.readFileSync(filePath, "utf-8");
      const allLines = raw.split("\n");
      const totalLines = allLines.length;
      const offset = Math.max(1, params.offset ?? 1);
      const limit = Math.min(500, params.limit ?? 200);
      const from = offset;
      const to = Math.min(offset + limit - 1, totalLines);
      const truncated = to < totalLines;

      const selectedLines = allLines.slice(from - 1, to);
      const numbered = selectedLines.map((line, i) => `${from + i}  ${line}`).join("\n");

      const header = `文件: ${params.path}（第 ${from}-${to} 行，共 ${totalLines} 行）\n\n`;
      const footer = truncated
        ? `\n\n[文件共 ${totalLines} 行，当前显示第 ${from}-${to} 行。如需查看更多，请指定 offset 和 limit]`
        : "";

      return {
        content: [{ type: "text", text: header + numbered + footer }],
        details: { path: params.path, totalLines, readRange: { from, to }, truncated },
      };
    },
  };
}
