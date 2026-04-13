import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { getPersistedSnapshot } from "../session/service.js";
import {
  ensureContextSnapshotCoverage,
  getRequiredCompactedUntilSeq,
} from "./snapshot.js";

const CONTEXT_BUDGET_RATIO = 0.7;
const PROTECTED_USER_TURNS = 6;

function getAgentMessageRole(message: AgentMessage): string | null {
  if (!message || typeof message !== "object" || !("role" in message)) {
    return null;
  }

  const role = (message as { role?: unknown }).role;
  return typeof role === "string" ? role : null;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((part) => {
      if (!part || typeof part !== "object") {
        return [];
      }

      const textPart = part as {
        type?: unknown;
        text?: unknown;
        thinking?: unknown;
      };

      if (textPart.type === "text" && typeof textPart.text === "string") {
        return [textPart.text];
      }

      if (textPart.type === "thinking" && typeof textPart.thinking === "string") {
        return [textPart.thinking];
      }

      return [];
    })
    .join("\n");
}

function estimateMessageTokens(message: AgentMessage): number {
  if (!message || typeof message !== "object") {
    return 0;
  }

  const role = getAgentMessageRole(message);
  const content = extractTextFromContent((message as { content?: unknown }).content);
  const base = role === "user" || role === "assistant" ? 18 : 8;
  return base + Math.ceil(content.length * 0.8);
}

function estimateMessagesTokens(messages: AgentMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
}

function findProtectedTailIndex(messages: AgentMessage[]): number {
  let userTurns = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (getAgentMessageRole(messages[index]) !== "user") {
      continue;
    }

    userTurns += 1;
    if (userTurns >= PROTECTED_USER_TURNS) {
      return index;
    }
  }

  return 0;
}

function isShortChatter(message: AgentMessage): boolean {
  const role = getAgentMessageRole(message);
  if (role !== "user" && role !== "assistant") {
    return false;
  }

  const text = extractTextFromContent((message as { content?: unknown }).content);
  return text.length < 60;
}

function isToolResultMessage(message: AgentMessage): boolean {
  return getAgentMessageRole(message) === "tool";
}

function truncateToolResult(message: AgentMessage): AgentMessage {
  const content = (message as { content?: unknown }).content;
  if (typeof content !== "string" && !Array.isArray(content)) {
    return message;
  }

  const text = extractTextFromContent(content);
  if (text.length <= 200) {
    return message;
  }

  return {
    ...message,
    content: `${text.slice(0, 100)}\n...[已截断]...\n${text.slice(-50)}`,
  } as AgentMessage;
}

function applyBudgetAllocation(
  messages: AgentMessage[],
  budget: number,
  protectedTailIndex: number,
): AgentMessage[] {
  let working = [...messages];
  let estimated = estimateMessagesTokens(working);

  if (estimated <= budget) {
    return working;
  }

  for (let index = 0; index < protectedTailIndex && estimated > budget; index += 1) {
    if (!isShortChatter(working[index])) {
      continue;
    }

    estimated -= estimateMessageTokens(working[index]);
    working[index] = null as unknown as AgentMessage;
  }
  working = working.filter(Boolean);

  if (estimated <= budget) {
    return working;
  }

  const newProtectedIndex = findProtectedTailIndex(working);
  for (let index = 0; index < newProtectedIndex && estimated > budget; index += 1) {
    if (!isToolResultMessage(working[index])) {
      continue;
    }

    const before = estimateMessageTokens(working[index]);
    working[index] = truncateToolResult(working[index]);
    const after = estimateMessageTokens(working[index]);
    estimated -= before - after;
  }

  if (estimated <= budget) {
    return working;
  }

  const finalProtectedIndex = findProtectedTailIndex(working);
  return finalProtectedIndex > 0 ? working.slice(finalProtectedIndex) : working;
}

export function createTransformContext(
  sessionId: string,
  contextWindow: number | null,
): (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]> {
  return async (messages, signal) => {
    if (signal?.aborted || messages.length === 0) {
      return messages;
    }

    const budget =
      typeof contextWindow === "number" && contextWindow > 0
        ? Math.floor(contextWindow * CONTEXT_BUDGET_RATIO)
        : null;
    if (!budget) {
      return messages;
    }

    const estimatedTotal = estimateMessagesTokens(messages);
    if (estimatedTotal <= budget) {
      return messages;
    }

    const protectedTailIndex = findProtectedTailIndex(messages);
    if (protectedTailIndex <= 0) {
      return messages;
    }

    const requiredCompactedUntilSeq = getRequiredCompactedUntilSeq(sessionId);
    const snapshot = getPersistedSnapshot(sessionId);
    if (requiredCompactedUntilSeq > snapshot.compactedUntilSeq) {
      await ensureContextSnapshotCoverage(sessionId);
    }

    return applyBudgetAllocation(messages, budget, protectedTailIndex);
  };
}
