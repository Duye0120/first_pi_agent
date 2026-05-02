import type { MemoryAddInput } from "../../shared/contracts.js";
import type { MemorySaveStatus } from "../memory/dedupe.js";
import type { MemdirEntry } from "../memory/service.js";

export type MemoryVectorPersistResult =
  | { status: "written" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

export function shouldPersistMemoryToVectorStore(
  status: MemorySaveStatus,
): boolean {
  return status === "saved" || status === "merged" || status === "conflict";
}

export function buildMemoryVectorAddInput(
  entry: MemdirEntry,
  detail?: string,
): MemoryAddInput {
  const content = [entry.summary, detail?.trim()].filter(Boolean).join("\n\n");

  return {
    content,
    metadata: {
      source: "memory_save",
      topic: entry.topic,
      memdirStatus: entry.status,
      pipelineSource: "memory_save",
      originalSource: entry.source,
      reason: entry.reason,
      matchedSummary: entry.matchedSummary,
      tags: [entry.topic, "memory_save", entry.status],
    },
  };
}
