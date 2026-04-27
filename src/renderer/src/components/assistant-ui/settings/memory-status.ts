import type { MemoryRebuildResult } from "@shared/contracts";

export function formatMemoryErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/better[-_]?sqlite3|NODE_MODULE_VERSION|native module/i.test(message)) {
    return "Memory 数据库 native 依赖不可用。请使用 Node 22.19.0 运行 pnpm rebuild better-sqlite3 后重启 Chela。";
  }
  if (/fetch failed|Failed to fetch|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(message)) {
    return "远端嵌入模型请求失败。请检查 Provider 地址、网络和模型服务状态。";
  }
  return message || "Memory 操作失败";
}

export function getRebuildStatusText(
  result: MemoryRebuildResult | null,
): string | null {
  if (!result) {
    return null;
  }
  return `上次重建：${result.rebuiltCount} 条，模型 ${result.modelId}，完成 ${result.completedAt}`;
}
