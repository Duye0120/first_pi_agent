import type { MemorySaveStatus } from "../memory/dedupe.js";

export type MemorySaveResultView = {
  summary: string;
  topic: string;
  source: string;
  status: MemorySaveStatus;
  matchedSummary?: string;
  reason?: string;
};

export function formatMemorySaveResultText(entry: MemorySaveResultView): string {
  const location = `位置：[${entry.topic}] ${entry.summary}`;
  const matched = entry.matchedSummary
    ? `相近记忆：${entry.matchedSummary}`
    : "";

  switch (entry.status) {
    case "duplicate":
      return [
        "状态：duplicate。",
        location,
        matched,
        "结果：语义重复，保存已跳过。",
        "下一步：memory_save 本次已完成，请继续完成用户请求。",
      ].filter(Boolean).join("\n");

    case "merged":
      return [
        "状态：merged。",
        location,
        matched,
        "结果：已将相近记忆升级为更完整版本。",
        "下一步：memory_save 本次已完成，请继续完成用户请求。",
      ].filter(Boolean).join("\n");

    case "conflict":
      return [
        "状态：conflict。",
        location,
        matched,
        "结果：已保留新记忆，并标记为可能与相近记忆冲突。",
        "下一步：memory_save 本次已完成，请继续完成用户请求；需要时再向用户确认冲突事实。",
      ].filter(Boolean).join("\n");

    case "saved":
      return [
        "状态：saved。",
        location,
        "结果：记忆写入已完成。",
        "下一步：memory_save 本次已完成，请继续完成用户请求。",
      ].join("\n");
  }
}
