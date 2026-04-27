import assert from "node:assert/strict";
import {
  deleteMemoryAndRefresh,
  feedbackMemoryAndRefresh,
  type MemoryActionDesktopApi,
} from "../src/renderer/src/components/assistant-ui/settings/memory-actions.ts";
import {
  formatMemoryErrorMessage,
  getRebuildStatusText,
} from "../src/renderer/src/components/assistant-ui/settings/memory-status.ts";

function createApi(calls: string[]): MemoryActionDesktopApi {
  return {
    memory: {
      delete: async (memoryId: number) => {
        calls.push(`delete:${memoryId}`);
        return true;
      },
      feedback: async (memoryId: number, delta: number) => {
        calls.push(`feedback:${memoryId}:${delta}`);
        return true;
      },
    },
  };
}

async function runMemoryUiRegression(): Promise<void> {
  const calls: string[] = [];
  const refreshers = {
    loadStats: async () => {
      calls.push("stats");
    },
    loadMemories: async () => {
      calls.push("memories");
    },
  };
  const api = createApi(calls);

  assert.equal(await deleteMemoryAndRefresh(api, 12, refreshers), true);
  assert.equal(await feedbackMemoryAndRefresh(api, 12, -1, refreshers), true);
  assert.deepEqual(calls, [
    "delete:12",
    "stats",
    "memories",
    "feedback:12:-1",
    "stats",
    "memories",
  ]);

  assert.equal(
    formatMemoryErrorMessage(
      new Error("The module better_sqlite3.node was compiled against a different NODE_MODULE_VERSION."),
    ),
    "Memory 数据库 native 依赖不可用。请使用 Node 22.19.0 运行 pnpm rebuild better-sqlite3 后重启 Chela。",
  );
  assert.equal(
    formatMemoryErrorMessage(new Error("远端嵌入接口失败 401")),
    "远端嵌入接口失败 401",
  );
  assert.equal(
    getRebuildStatusText({
      rebuiltCount: 3,
      modelId: "Xenova/all-MiniLM-L6-v2",
      completedAt: "2026-04-27T08:52:13.000Z",
    }),
    "上次重建：3 条，模型 Xenova/all-MiniLM-L6-v2，完成 2026-04-27T08:52:13.000Z",
  );
}

await runMemoryUiRegression();

console.log("memory ui regression tests passed");
