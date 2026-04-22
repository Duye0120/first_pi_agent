import fs from "node:fs/promises";
import path from "node:path";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { isPathAllowed, isWritePathForbidden } from "../security.js";
import { withFileMutationQueue } from "./file-mutation-queue.js";

const parameters = Type.Object({
  path: Type.String({ description: "文件路径（相对于 workspace 或绝对路径）" }),
  content: Type.String({ description: "要写入的内容" }),
  mode: Type.Optional(
    Type.Union([Type.Literal("overwrite"), Type.Literal("append")], {
      description: "覆盖还是追加（默认 overwrite）",
    }),
  ),
});

type FileWriteDetails = {
  path: string;
  size: number;
  isNew: boolean;
  previousContent?: string;
  newContent: string;
};

function emptyDetails(reqPath: string, content: string): FileWriteDetails {
  return { path: reqPath, size: 0, isNew: false, newContent: content };
}

function errorResult(reqPath: string, content: string, message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    details: emptyDetails(reqPath, content),
  };
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export function createFileWriteTool(
  workspacePath: string,
): AgentTool<typeof parameters, FileWriteDetails> {
  return {
    name: "file_write",
    label: "写入文件",
    description: "创建或写入本地文件。可选 overwrite/append。同一文件的写入与编辑会自动串行。",
    parameters,
    async execute(_toolCallId, params) {
      const filePath = path.isAbsolute(params.path)
        ? params.path
        : path.resolve(workspacePath, params.path);

      if (!isPathAllowed(filePath, workspacePath)) {
        return errorResult(params.path, params.content, `路径超出 workspace 范围: ${params.path}`);
      }
      if (isWritePathForbidden(filePath)) {
        return errorResult(params.path, params.content, `不允许写入该目录: ${params.path}`);
      }

      const mode = params.mode ?? "overwrite";

      return withFileMutationQueue(filePath, async () => {
        const alreadyExists = await exists(filePath);
        let previousContent: string | undefined;

        if (alreadyExists) {
          try {
            previousContent = await fs.readFile(filePath, "utf-8");
          } catch {
            // Binary or unreadable — leave as undefined.
          }
        }

        try {
          await fs.mkdir(path.dirname(filePath), { recursive: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : "目录创建失败";
          return errorResult(params.path, params.content, `目录创建失败: ${message}`);
        }

        try {
          if (mode === "append") {
            await fs.appendFile(filePath, params.content, "utf-8");
          } else {
            await fs.writeFile(filePath, params.content, "utf-8");
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "写入失败";
          return errorResult(params.path, params.content, `写入失败: ${message}`);
        }

        let stat;
        try {
          stat = await fs.stat(filePath);
        } catch (error) {
          const message = error instanceof Error ? error.message : "stat 失败";
          return errorResult(params.path, params.content, `写入完成但读取大小失败: ${message}`);
        }

        const isNew = !alreadyExists;
        const text = isNew
          ? `文件已创建: ${params.path}（${stat.size} 字节）`
          : mode === "append"
            ? `文件已追加: ${params.path}（${stat.size} 字节）`
            : `文件已更新: ${params.path}（${previousContent?.length ?? 0} → ${stat.size} 字节）`;

        return {
          content: [{ type: "text" as const, text }],
          details: {
            path: params.path,
            size: stat.size,
            isNew,
            previousContent,
            newContent: params.content,
          },
        };
      });
    },
  };
}
