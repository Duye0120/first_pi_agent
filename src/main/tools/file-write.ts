import fs from "node:fs";
import path from "node:path";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { isPathAllowed, isWritePathForbidden } from "../security.js";

const parameters = Type.Object({
  path: Type.String({ description: "文件路径（相对于 workspace 或绝对路径）" }),
  content: Type.String({ description: "要写入的内容" }),
  mode: Type.Optional(Type.Union([
    Type.Literal("overwrite"),
    Type.Literal("append"),
  ], { description: "覆盖还是追加（默认 overwrite）" })),
});

type FileWriteDetails = {
  path: string;
  size: number;
  isNew: boolean;
  previousContent?: string;
  newContent: string;
};

export function createFileWriteTool(workspacePath: string): AgentTool<typeof parameters, FileWriteDetails> {
  return {
    name: "file_write",
    label: "写入文件",
    description: "创建或写入本地文件。可以覆盖或追加内容。",
    parameters,
    async execute(_toolCallId, params) {
      const filePath = path.isAbsolute(params.path)
        ? params.path
        : path.resolve(workspacePath, params.path);

      if (!isPathAllowed(filePath, workspacePath)) {
        return {
          content: [{ type: "text", text: `路径超出 workspace 范围: ${params.path}` }],
          details: { path: params.path, size: 0, isNew: false, newContent: params.content },
        };
      }

      if (isWritePathForbidden(filePath)) {
        return {
          content: [{ type: "text", text: `不允许写入该目录: ${params.path}` }],
          details: { path: params.path, size: 0, isNew: false, newContent: params.content },
        };
      }

      const mode = params.mode ?? "overwrite";
      const exists = fs.existsSync(filePath);
      let previousContent: string | undefined;

      if (exists) {
        try {
          previousContent = fs.readFileSync(filePath, "utf-8");
        } catch {
          // Binary file or unreadable — skip previous content
        }
      }

      // Ensure parent directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (mode === "append") {
        fs.appendFileSync(filePath, params.content, "utf-8");
      } else {
        fs.writeFileSync(filePath, params.content, "utf-8");
      }

      const stat = fs.statSync(filePath);
      const isNew = !exists;

      const text = isNew
        ? `文件已创建: ${params.path}（${stat.size} 字节）`
        : mode === "append"
          ? `文件已追加: ${params.path}（${stat.size} 字节）`
          : `文件已更新: ${params.path}（${previousContent?.length ?? 0} → ${stat.size} 字节）`;

      return {
        content: [{ type: "text", text }],
        details: {
          path: params.path,
          size: stat.size,
          isNew,
          previousContent,
          newContent: params.content,
        },
      };
    },
  };
}
