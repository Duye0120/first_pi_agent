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
const EXTENSION_MIME_MAP = new Map<string, string>([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
  ["gif", "image/gif"],
  ["bmp", "image/bmp"],
  ["svg", "image/svg+xml"],
  ["ico", "image/x-icon"],
]);
const TEXT_MIME_PREFIXES = ["text/"];
const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/typescript",
]);

function getExtension(filePath: string) {
  return extname(filePath).replace(/^\./, "").toLowerCase();
}

function inferFileKind(extension: string, mimeType?: string): FileKind {
  const normalizedMimeType = mimeType?.trim().toLowerCase();

  if (normalizedMimeType?.startsWith("image/")) {
    return "image";
  }

  if (
    normalizedMimeType &&
    (TEXT_MIME_PREFIXES.some((prefix) => normalizedMimeType.startsWith(prefix)) ||
      TEXT_MIME_TYPES.has(normalizedMimeType))
  ) {
    return "text";
  }

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

function inferMimeTypeFromExtension(extension: string) {
  if (!extension) return undefined;
  return EXTENSION_MIME_MAP.get(extension.toLowerCase());
}

function inferMimeTypeFromBuffer(buffer: Buffer) {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 6 &&
    buffer.subarray(0, 6).toString("ascii") === "GIF87a"
  ) {
    return "image/gif";
  }

  if (
    buffer.length >= 6 &&
    buffer.subarray(0, 6).toString("ascii") === "GIF89a"
  ) {
    return "image/gif";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return "image/bmp";
  }

  return undefined;
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
  const fileBuffer = Buffer.from(payload.buffer);
  const mimeType =
    payload.mimeType?.trim().toLowerCase() || inferMimeTypeFromBuffer(fileBuffer);
  const extension = getExtension(safeName) || inferExtensionFromMimeType(mimeType);
  const baseName =
    stripExtension(safeName) ||
    (mimeType?.startsWith("image/") ? "pasted-image" : "pasted-file");
  const displayName = safeName || (extension ? `${baseName}.${extension}` : baseName);
  const storedFileName = `${baseName}-${Date.now()}-${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;
  const filePath = join(getAttachmentsDir(), storedFileName);

  await mkdir(getAttachmentsDir(), { recursive: true });
  await writeFile(filePath, fileBuffer);

  return {
    id: crypto.randomUUID(),
    name: displayName,
    path: filePath,
    size: fileBuffer.byteLength,
    extension,
    kind: inferFileKind(extension, mimeType),
    mimeType,
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

export async function readImageDataUrl(filePath: string): Promise<string | null> {
  const imageContent = await readImageContent(filePath);
  if (!imageContent) {
    return null;
  }

  return `data:${imageContent.mimeType};base64,${imageContent.data}`;
}

export async function readImageContent(
  filePath: string,
  preferredMimeType?: string,
): Promise<{ data: string; mimeType: string } | null> {
  const extension = getExtension(filePath);
  const kind = inferFileKind(extension, preferredMimeType);

  if (kind !== "image") {
    return null;
  }

  try {
    const fileBuffer = await readFile(filePath);
    const mimeType =
      preferredMimeType?.trim().toLowerCase() ||
      inferMimeTypeFromExtension(extension) ||
      inferMimeTypeFromBuffer(fileBuffer) ||
      "application/octet-stream";

    return {
      data: fileBuffer.toString("base64"),
      mimeType,
    };
  } catch {
    return null;
  }
}
