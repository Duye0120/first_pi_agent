import type { MemoryRebuildResult } from "@shared/contracts";

export function formatMemoryErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/better[-_]?sqlite3|NODE_MODULE_VERSION|native module/i.test(message)) {
    return "Memory 数据库 native 依赖需要按 Electron 41.1.0 重建。请退出 Chela 后运行 pnpm dlx @electron/rebuild -f -o better-sqlite3 -v 41.1.0，然后重启 Chela。";
  }
  if (/memory worker.*code\s+1|exited with code\s+1/i.test(message)) {
    return "Memory worker 启动失败。请重启 Chela 后再试；如果仍失败，打开系统日志查看 memory.worker 详情。";
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
  const failed = result.failedCount && result.failedCount > 0
    ? `，失败 ${result.failedCount} 条`
    : "";
  return `上次重建：${result.rebuiltCount} 条${failed}，模型 ${result.modelId}，完成 ${result.completedAt}`;
}
