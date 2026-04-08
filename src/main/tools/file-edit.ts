import fs from "node:fs";
import { createTwoFilesPatch, parsePatch } from "diff";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { isPathAllowed, isWritePathForbidden } from "../security.js";
import {
  readTextFileSafe,
  resolveWorkspacePath,
} from "./fs-utils.js";

const parameters = Type.Object({
  path: Type.String({ description: "文件路径（相对于 workspace 或绝对路径）" }),
  old_string: Type.Optional(Type.String({ description: "要替换的原始文本" })),
  new_string: Type.Optional(Type.String({ description: "替换后的文本" })),
  replace_all: Type.Optional(Type.Boolean({ description: "是否替换全部匹配，默认 false" })),
  oldText: Type.Optional(Type.String({ description: "兼容参数：旧版 oldText" })),
  newText: Type.Optional(Type.String({ description: "兼容参数：旧版 newText" })),
  replaceAll: Type.Optional(Type.Boolean({ description: "兼容参数：旧版 replaceAll" })),
});

type StructuredPatchHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
};

type FileEditDetails = {
  filePath: string;
  oldString: string;
  newString: string;
  originalFile: string;
  structuredPatch: StructuredPatchHunk[];
  userModified: boolean;
  replaceAll: boolean;
  gitDiff: null;
};

function normalizePatch(originalPath: string, original: string, updated: string): StructuredPatchHunk[] {
  const patch = createTwoFilesPatch(
    originalPath,
    originalPath,
    original,
    updated,
    "original",
    "updated",
    { context: 3 },
  );
  const parsed = parsePatch(patch);

  return parsed.flatMap((entry) =>
    entry.hunks.map((hunk) => ({
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      lines: hunk.lines,
    })),
  );
}

export function createFileEditTool(workspacePath: string): AgentTool<typeof parameters, FileEditDetails> {
  return {
    name: "file_edit",
    label: "编辑文件",
    description: "对已有文本文件做精确替换。默认只替换首个匹配，可选 replace_all。",
    parameters,
    async execute(_toolCallId, params) {
      const filePath = resolveWorkspacePath(workspacePath, params.path);
      const oldString = params.old_string ?? params.oldText ?? "";
      const newString = params.new_string ?? params.newText ?? "";
      const replaceAll = params.replace_all ?? params.replaceAll ?? false;

      if (!isPathAllowed(filePath, workspacePath)) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "路径超出 workspace 范围。" }, null, 2) }],
          details: {
            filePath,
            oldString,
            newString,
            originalFile: "",
            structuredPatch: [],
            userModified: false,
            replaceAll,
            gitDiff: null,
          },
        };
      }

      if (isWritePathForbidden(filePath)) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "该目录受写保护。" }, null, 2) }],
          details: {
            filePath,
            oldString,
            newString,
            originalFile: "",
            structuredPatch: [],
            userModified: false,
            replaceAll,
            gitDiff: null,
          },
        };
      }

      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "目标文件不存在或不是普通文件。" }, null, 2) }],
          details: {
            filePath,
            oldString,
            newString,
            originalFile: "",
            structuredPatch: [],
            userModified: false,
            replaceAll,
            gitDiff: null,
          },
        };
      }

      if (!oldString.length) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "old_string 不能为空。" }, null, 2) }],
          details: {
            filePath,
            oldString,
            newString,
            originalFile: "",
            structuredPatch: [],
            userModified: false,
            replaceAll,
            gitDiff: null,
          },
        };
      }

      if (oldString === newString) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "old_string 和 new_string 不能相同。" }, null, 2) }],
          details: {
            filePath,
            oldString,
            newString,
            originalFile: "",
            structuredPatch: [],
            userModified: false,
            replaceAll,
            gitDiff: null,
          },
        };
      }

      const originalFile = readTextFileSafe(filePath);
      if (originalFile === null) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "该文件不是可安全编辑的文本文件。" }, null, 2) }],
          details: {
            filePath,
            oldString,
            newString,
            originalFile: "",
            structuredPatch: [],
            userModified: false,
            replaceAll,
            gitDiff: null,
          },
        };
      }

      if (!originalFile.includes(oldString)) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "old_string 未在文件中命中。" }, null, 2) }],
          details: {
            filePath,
            oldString,
            newString,
            originalFile,
            structuredPatch: [],
            userModified: false,
            replaceAll,
            gitDiff: null,
          },
        };
      }

      const updated = replaceAll
        ? originalFile.replaceAll(oldString, newString)
        : originalFile.replace(oldString, newString);
      fs.writeFileSync(filePath, updated, "utf-8");

      const details: FileEditDetails = {
        filePath,
        oldString,
        newString,
        originalFile,
        structuredPatch: normalizePatch(filePath, originalFile, updated),
        userModified: false,
        replaceAll,
        gitDiff: null,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
        details,
      };
    },
  };
}
