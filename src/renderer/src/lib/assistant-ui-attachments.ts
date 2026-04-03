import type {
  CompleteAttachment,
  CreateAttachment,
  ThreadUserMessagePart,
} from "@assistant-ui/react";
import type { SelectedFile } from "@shared/contracts";

export type PersistedMessageAttachment = Pick<
  SelectedFile,
  "id" | "name" | "size" | "kind" | "extension" | "path" | "previewText"
>;

function selectedFileToAttachmentType(
  file: Pick<SelectedFile, "kind">,
): "image" | "document" | "file" {
  if (file.kind === "image") return "image";
  if (file.kind === "text") return "document";
  return "file";
}

function toFileUrl(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  return encodeURI(
    normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`,
  );
}

function selectedFileToContent(
  file: Pick<SelectedFile, "kind" | "path" | "previewText" | "name">,
): ThreadUserMessagePart[] {
  if (file.kind === "image") {
    return [
      {
        type: "image",
        image: toFileUrl(file.path),
      },
    ];
  }

  const text =
    file.previewText?.trim() ||
    `<attachment name="${file.name}">\n文件已附加到当前对话。\n</attachment>`;

  return [
    {
      type: "text",
      text,
    },
  ];
}

export function toPersistedMessageAttachment(
  file: SelectedFile,
): PersistedMessageAttachment {
  return {
    id: file.id,
    name: file.name,
    size: file.size,
    kind: file.kind,
    extension: file.extension,
    path: file.path,
    previewText: file.previewText,
  };
}

export function selectedFileToCreateAttachment(
  file: PersistedMessageAttachment,
): CreateAttachment {
  return {
    id: file.id,
    type: selectedFileToAttachmentType(file),
    name: file.name,
    content: selectedFileToContent(file),
  };
}

export function selectedFileToCompleteAttachment(
  file: PersistedMessageAttachment,
): CompleteAttachment {
  return {
    id: file.id,
    type: selectedFileToAttachmentType(file),
    name: file.name,
    status: { type: "complete" },
    contentType: undefined,
    content: selectedFileToContent(file),
  };
}
