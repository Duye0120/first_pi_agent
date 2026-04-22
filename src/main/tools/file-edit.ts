import fs from "node:fs/promises";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { isPathAllowed, isWritePathForbidden } from "../security.js";
import {
  applyEditsToNormalizedContent,
  buildStructuredPatch,
  detectLineEnding,
  type Edit,
  normalizeToLF,
  restoreLineEndings,
  type StructuredPatchHunk,
  stripBom,
} from "./edit-diff.js";
import { withFileMutationQueue } from "./file-mutation-queue.js";
import { isTextFile, resolveWorkspacePath } from "./fs-utils.js";

const editEntrySchema = Type.Object({
  oldText: Type.String({ description: "要替换的原始文本（必须在原文中唯一可定位）" }),
  newText: Type.String({ description: "替换后的文本" }),
});

const parameters = Type.Object({
  path: Type.String({ description: "文件路径（相对于 workspace 或绝对路径）" }),
  edits: Type.Optional(
    Type.Array(editEntrySchema, {
      description:
        "一次调用可包含多段不相交的替换；每段 oldText 都基于原始文件匹配，不依赖前一段执行后的结果。",
    }),
  ),
  // 兼容历史参数：单段替换。
  old_string: Type.Optional(Type.String({ description: "兼容参数：单段替换的原始文本" })),
  new_string: Type.Optional(Type.String({ description: "兼容参数：单段替换的新文本" })),
  oldText: Type.Optional(Type.String({ description: "兼容参数：旧版 oldText" })),
  newText: Type.Optional(Type.String({ description: "兼容参数：旧版 newText" })),
  replace_all: Type.Optional(Type.Boolean({ description: "兼容参数：是否替换全部匹配（仅单段替换时生效）" })),
  replaceAll: Type.Optional(Type.Boolean({ description: "兼容参数：旧版 replaceAll" })),
});

type FileEditDetails = {
  filePath: string;
  edits: Edit[];
  oldString: string;
  newString: string;
  originalFile: string;
  newFile: string;
  structuredPatch: StructuredPatchHunk[];
  usedFuzzy: boolean;
  replaceAll: boolean;
  userModified: boolean;
  gitDiff: null;
};

function emptyDetails(filePath: string, edits: Edit[], replaceAll: boolean): FileEditDetails {
  const first = edits[0] ?? { oldText: "", newText: "" };
  return {
    filePath,
    edits,
    oldString: first.oldText,
    newString: first.newText,
    originalFile: "",
    newFile: "",
    structuredPatch: [],
    usedFuzzy: false,
    replaceAll,
    userModified: false,
    gitDiff: null,
  };
}

function errorResult(filePath: string, edits: Edit[], replaceAll: boolean, message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }],
    details: emptyDetails(filePath, edits, replaceAll),
  };
}

function normalizeEdits(params: Record<string, unknown>): Edit[] {
  if (Array.isArray(params.edits) && params.edits.length > 0) {
    return params.edits
      .filter(
        (entry): entry is { oldText: string; newText: string } =>
          !!entry &&
          typeof entry === "object" &&
          typeof (entry as Record<string, unknown>).oldText === "string" &&
          typeof (entry as Record<string, unknown>).newText === "string",
      )
      .map((entry) => ({ oldText: entry.oldText, newText: entry.newText }));
  }

  const oldText =
    (typeof params.old_string === "string" ? params.old_string : undefined) ??
    (typeof params.oldText === "string" ? params.oldText : undefined) ??
    "";
  const newText =
    (typeof params.new_string === "string" ? params.new_string : undefined) ??
    (typeof params.newText === "string" ? params.newText : undefined) ??
    "";

  if (!oldText.length && !newText.length) {
    return [];
  }

  return [{ oldText, newText }];
}

function expandReplaceAll(originalContent: string, edit: Edit): Edit[] {
  // replace_all 仅在单段、且原文存在多处精确匹配时才展开成多段 edits。
  if (!edit.oldText.length) return [edit];
  let from = 0;
  let count = 0;
  while (true) {
    const next = originalContent.indexOf(edit.oldText, from);
    if (next === -1) break;
    count += 1;
    from = next + edit.oldText.length;
    if (count > 200) break; // 安全上限
  }
  if (count <= 1) return [edit];
  return Array.from({ length: count }, () => ({
    oldText: edit.oldText,
    newText: edit.newText,
  }));
}

export function createFileEditTool(
  workspacePath: string,
): AgentTool<typeof parameters, FileEditDetails> {
  return {
    name: "file_edit",
    label: "编辑文件",
    description:
      "对已有文本文件做精确替换。支持一次调用多段不相交的 edits[]；oldText 必须在原文中唯一，否则需补充上下文。" +
      "对小幅空白/智能引号差异会启用容错匹配，并保留原文的 BOM 与行尾（CRLF/LF）。",
    parameters,
    async execute(_toolCallId, params) {
      const filePath = resolveWorkspacePath(workspacePath, params.path);
      const replaceAll = (params.replace_all ?? params.replaceAll) === true;
      const initialEdits = normalizeEdits(params as Record<string, unknown>);

      if (!initialEdits.length) {
        return errorResult(filePath, initialEdits, replaceAll, "edits 不能为空。");
      }

      if (!isPathAllowed(filePath, workspacePath)) {
        return errorResult(filePath, initialEdits, replaceAll, "路径超出 workspace 范围。");
      }
      if (isWritePathForbidden(filePath)) {
        return errorResult(filePath, initialEdits, replaceAll, "该目录受写保护。");
      }
      if (!isTextFile(filePath)) {
        return errorResult(filePath, initialEdits, replaceAll, "目标不是可安全编辑的文本文件。");
      }

      return withFileMutationQueue(filePath, async () => {
        let stat;
        try {
          stat = await fs.stat(filePath);
        } catch {
          return errorResult(filePath, initialEdits, replaceAll, "目标文件不存在。");
        }
        if (!stat.isFile()) {
          return errorResult(filePath, initialEdits, replaceAll, "目标路径不是普通文件。");
        }

        let buffer: Buffer;
        try {
          buffer = await fs.readFile(filePath);
        } catch (error) {
          const message = error instanceof Error ? error.message : "读取失败";
          return errorResult(filePath, initialEdits, replaceAll, `读取失败: ${message}`);
        }
        if (buffer.includes(0)) {
          return errorResult(filePath, initialEdits, replaceAll, "目标文件包含二进制数据，无法编辑。");
        }

        const rawContent = buffer.toString("utf-8");
        const { bom, text } = stripBom(rawContent);
        const lineEnding = detectLineEnding(text);
        const normalizedOriginal = normalizeToLF(text);

        let edits = initialEdits;
        if (replaceAll && edits.length === 1) {
          edits = expandReplaceAll(normalizedOriginal, {
            oldText: normalizeToLF(edits[0].oldText),
            newText: normalizeToLF(edits[0].newText),
          });
        }

        let applied;
        try {
          applied = applyEditsToNormalizedContent(normalizedOriginal, edits, params.path);
        } catch (error) {
          const message = error instanceof Error ? error.message : "编辑失败";
          return errorResult(filePath, edits, replaceAll, message);
        }

        const finalContent = bom + restoreLineEndings(applied.newContent, lineEnding);
        try {
          await fs.writeFile(filePath, finalContent, "utf-8");
        } catch (error) {
          const message = error instanceof Error ? error.message : "写入失败";
          return errorResult(filePath, edits, replaceAll, `写入失败: ${message}`);
        }

        const structuredPatch = buildStructuredPatch(
          filePath,
          applied.baseContent,
          applied.newContent,
        );
        const details: FileEditDetails = {
          filePath,
          edits,
          oldString: edits[0]?.oldText ?? "",
          newString: edits[0]?.newText ?? "",
          originalFile: applied.baseContent,
          newFile: applied.newContent,
          structuredPatch,
          usedFuzzy: applied.usedFuzzy,
          replaceAll,
          userModified: false,
          gitDiff: null,
        };

        const summary =
          edits.length === 1
            ? `已更新 ${params.path}（1 段替换${applied.usedFuzzy ? "，启用容错匹配" : ""}）。`
            : `已更新 ${params.path}（${edits.length} 段替换${applied.usedFuzzy ? "，启用容错匹配" : ""}）。`;

        return {
          content: [{ type: "text" as const, text: summary }],
          details,
        };
      });
    },
  };
}
