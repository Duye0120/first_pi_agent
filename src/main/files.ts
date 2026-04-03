import { basename, extname, join } from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { app, dialog, type BrowserWindow } from "electron";
import type {
  ClipboardFilePayload,
  FileKind,
  FilePreviewResult,
  SelectedFile,
} from "../shared/contracts.js";

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
const MAX_PREVIEW_CHARACTERS = 6_000;
const MIME_EXTENSION_MAP = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/bmp", "bmp"],
  ["image/svg+xml", "svg"],
  ["text/plain", "txt"],
  ["text/markdown", "md"],
  ["application/json", "json"],
  ["application/pdf", "pdf"],
]);

function getExtension(filePath: string) {
  return extname(filePath).replace(/^\./, "").toLowerCase();
}

function inferFileKind(extension: string): FileKind {
  if (!extension) {
    return "unknown";
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    return "text";
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  return "binary";
}

function getAttachmentsDir() {
  return join(app.getPath("userData"), "data", "attachments");
}

function inferExtensionFromMimeType(mimeType?: string) {
  if (!mimeType) return "";
  return MIME_EXTENSION_MAP.get(mimeType.toLowerCase()) ?? "";
}

function sanitizeFileName(name: string) {
  return basename(name)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .trim();
}

function stripExtension(fileName: string) {
  const extension = extname(fileName);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}

export async function pickFiles(browserWindow: BrowserWindow) {
  const result = await dialog.showOpenDialog(browserWindow, {
    title: "选择要附加的本地文件",
    properties: ["openFile", "multiSelections"],
  });

  if (result.canceled) {
    return [];
  }

  const selectedFiles = await Promise.all(
    result.filePaths.map(async (filePath) => {
      const fileStat = await stat(filePath);
      const extension = getExtension(filePath);

      return {
        id: crypto.randomUUID(),
        name: basename(filePath),
        path: filePath,
        size: fileStat.size,
        extension,
        kind: inferFileKind(extension),
      } satisfies SelectedFile;
    }),
  );

  return selectedFiles;
}

export async function saveClipboardFile(
  payload: ClipboardFilePayload,
): Promise<SelectedFile> {
  const safeName = sanitizeFileName(payload.name ?? "");
  const extension = getExtension(safeName) || inferExtensionFromMimeType(payload.mimeType);
  const baseName =
    stripExtension(safeName) ||
    (payload.mimeType?.startsWith("image/") ? "pasted-image" : "pasted-file");
  const displayName =
    safeName || (extension ? `${baseName}.${extension}` : baseName);
  const storedFileName = `${baseName}-${Date.now()}-${crypto.randomUUID()}${
    extension ? `.${extension}` : ""
  }`;
  const filePath = join(getAttachmentsDir(), storedFileName);
  const fileBuffer = Buffer.from(payload.buffer);

  await mkdir(getAttachmentsDir(), { recursive: true });
  await writeFile(filePath, fileBuffer);

  return {
    id: crypto.randomUUID(),
    name: displayName,
    path: filePath,
    size: fileBuffer.byteLength,
    extension,
    kind: inferFileKind(extension),
  };
}

export async function readFilePreview(filePath: string): Promise<FilePreviewResult> {
  const extension = getExtension(filePath);
  const kind = inferFileKind(extension);

  if (kind !== "text") {
    return {
      path: filePath,
      truncated: false,
      error: "当前文件类型暂不支持文本预览。",
    };
  }

  try {
    const content = await readFile(filePath, "utf8");
    const truncated = content.length > MAX_PREVIEW_CHARACTERS;

    return {
      path: filePath,
      previewText: truncated ? content.slice(0, MAX_PREVIEW_CHARACTERS) : content,
      truncated,
    };
  } catch (error) {
    return {
      path: filePath,
      truncated: false,
      error: error instanceof Error ? error.message : "读取文件预览失败。",
    };
  }
}
