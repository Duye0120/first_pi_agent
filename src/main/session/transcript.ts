import { existsSync, readFileSync } from "node:fs";
import type {
  ChatMessage,
  SessionTranscriptEvent,
} from "../../shared/contracts.js";
import { getTranscriptPath } from "./paths.js";

export function loadTranscript(sessionId: string): SessionTranscriptEvent[] {
  const filePath = getTranscriptPath(sessionId);
  if (!existsSync(filePath)) {
    return [];
  }

  const lines = readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const events: SessionTranscriptEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as SessionTranscriptEvent);
    } catch {
      // Skip malformed event lines so valid events continue loading.
    }
  }

  return events;
}

export function countMaterializedMessages(
  events: SessionTranscriptEvent[],
): number {
  let count = 0;
  for (const event of events) {
    if (event.type === "user_message" || event.type === "assistant_message") {
      count += 1;
      continue;
    }

    if (
      event.type === "run_finished" &&
      event.finalState === "failed" &&
      event.reason === "app_restart_interrupted"
    ) {
      count += 1;
    }
  }
  return count;
}

export function materializeMessages(
  events: SessionTranscriptEvent[],
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  for (const event of events) {
    if (event.type === "user_message" || event.type === "assistant_message") {
      messages.push(event.message);
      continue;
    }

    if (
      event.type === "run_finished" &&
      event.finalState === "failed" &&
      event.reason === "app_restart_interrupted"
    ) {
      messages.push({
        id: `system-${event.runId}-${event.seq}`,
        role: "system",
        content: "上次运行在应用退出或重启时中断，已标记为失败，可继续接着处理。",
        timestamp: event.timestamp,
        status: "done",
      });
    }
  }

  return messages;
}
