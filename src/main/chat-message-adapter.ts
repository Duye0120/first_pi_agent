import type {
  AssistantMessage,
  ImageContent,
  Message,
  Model,
  TextContent,
  Usage,
  UserMessage,
} from "@mariozechner/pi-ai";
import type { ChatMessage, SelectedFile } from "../shared/contracts.js";
import { readFilePreview, readImageContent } from "./files.js";

type AttachmentLike = Pick<
  SelectedFile,
  | "id"
  | "name"
  | "path"
  | "size"
  | "extension"
  | "kind"
  | "mimeType"
  | "previewText"
  | "truncated"
  | "error"
>;

function isAttachmentLike(value: unknown): value is AttachmentLike {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AttachmentLike>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.extension === "string" &&
    typeof candidate.kind === "string"
  );
}

function extractPersistedAttachments(message: ChatMessage): AttachmentLike[] {
  const attachments = message.meta?.attachments;
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments.filter(isAttachmentLike);
}

function resolveTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function createZeroCostUsage(inputTokens: number, outputTokens: number): Usage {
  return {
    input: inputTokens,
    output: outputTokens,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: inputTokens + outputTokens,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function createTextBlock(text: string): TextContent {
  return {
    type: "text",
    text,
  };
}

async function attachmentToUserContent(
  attachment: AttachmentLike,
  allowImages: boolean,
): Promise<(TextContent | ImageContent)[]> {
  if (attachment.kind === "image") {
    if (!allowImages) {
      return [
        createTextBlock(
          `已附加图片“${attachment.name}”，但当前模型不支持直接查看图片内容。`,
        ),
      ];
    }

    const imageContent = await readImageContent(
      attachment.path,
      attachment.mimeType,
    );

    if (imageContent) {
      return [
        {
          type: "image",
          data: imageContent.data,
          mimeType: imageContent.mimeType,
        },
      ];
    }

    return [
      createTextBlock(
        `已附加图片“${attachment.name}”，但当前无法读取图片内容。`,
      ),
    ];
  }

  if (attachment.kind === "text") {
    let previewText = attachment.previewText;
    let truncated = attachment.truncated ?? false;
    let error = attachment.error;

    if (!previewText?.trim() && !error) {
      const preview = await readFilePreview(attachment.path);
      previewText = preview.previewText;
      truncated = preview.truncated;
      error = preview.error;
    }

    if (previewText?.trim()) {
      const suffix = truncated ? "\n\n[内容已截断]" : "";
      return [
        createTextBlock(
          `<attachment name="${attachment.name}" kind="text">\n${previewText}${suffix}\n</attachment>`,
        ),
      ];
    }

    return [
      createTextBlock(
        error
          ? `已附加文本文件“${attachment.name}”，但读取失败：${error}`
          : `已附加文本文件“${attachment.name}”，但当前没有可用预览。`,
      ),
    ];
  }

  const descriptor = attachment.mimeType
    ? `${attachment.mimeType}, ${attachment.size} bytes`
    : `${attachment.size} bytes`;

  return [
    createTextBlock(
      `已附加文件“${attachment.name}” (${descriptor})，当前无法直接读取其文本内容。`,
    ),
  ];
}

export async function buildUserMessageContent(
  text: string,
  attachments: ReadonlyArray<AttachmentLike>,
  allowImages = true,
): Promise<(TextContent | ImageContent)[]> {
  const content: (TextContent | ImageContent)[] = [];
  const trimmedText = text.trim();

  if (trimmedText) {
    content.push(createTextBlock(trimmedText));
  }

  for (const attachment of attachments) {
    content.push(...(await attachmentToUserContent(attachment, allowImages)));
  }

  if (content.length === 0) {
    throw new Error("消息不能为空。");
  }

  return content;
}

export async function buildUserPromptMessage(
  text: string,
  attachments: ReadonlyArray<SelectedFile>,
  allowImages = true,
): Promise<UserMessage> {
  return {
    role: "user",
    content: await buildUserMessageContent(text, attachments, allowImages),
    timestamp: Date.now(),
  };
}

function normalizeAssistantMessage(
  message: ChatMessage,
  model: Model<any>,
): AssistantMessage | null {
  const text = message.content.trim();
  if (!text) {
    return null;
  }

  const inputTokens = message.usage?.inputTokens ?? 0;
  const outputTokens = message.usage?.outputTokens ?? 0;

  return {
    role: "assistant",
    content: [createTextBlock(text)],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: createZeroCostUsage(inputTokens, outputTokens),
    stopReason: message.status === "error" ? "error" : "stop",
    timestamp: resolveTimestamp(message.timestamp),
  };
}

export async function normalizePersistedSessionMessages(
  messages: ReadonlyArray<ChatMessage>,
  model: Model<any>,
): Promise<Message[]> {
  const normalized: Message[] = [];
  const allowImages = model.input.includes("image");

  for (const message of messages) {
    if (message.role === "user") {
      try {
        normalized.push({
          role: "user",
          content: await buildUserMessageContent(
            message.content,
            extractPersistedAttachments(message),
            allowImages,
          ),
          timestamp: resolveTimestamp(message.timestamp),
        });
      } catch {
        // Skip malformed empty user messages so one bad record does not break session hydration.
      }
      continue;
    }

    if (message.role === "assistant") {
      const normalizedAssistantMessage = normalizeAssistantMessage(
        message,
        model,
      );
      if (normalizedAssistantMessage) {
        normalized.push(normalizedAssistantMessage);
      }
    }
  }

  return normalized;
}
