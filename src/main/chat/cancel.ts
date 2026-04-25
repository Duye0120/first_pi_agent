import { cancelAgent, getHandle } from "../agent.js";
import { harnessRuntime } from "../harness/singleton.js";
import type { HarnessRunScope } from "../harness/types.js";

const cancellingRunIds = new Set<string>();

export async function cancelChatRun(scope: HarnessRunScope): Promise<void> {
  if (cancellingRunIds.has(scope.runId)) {
    return;
  }

  cancellingRunIds.add(scope.runId);
  setTimeout(() => {
    cancellingRunIds.delete(scope.runId);
  }, 30_000).unref?.();

  const activeRun = harnessRuntime.requestCancel(scope);
  const activeHandle = harnessRuntime.getHandle(scope);
  if (activeRun) {
    if (activeHandle) {
      cancelAgent(activeHandle);
    }
    return;
  }

  const handle = getHandle(scope.sessionId);
  if (handle && handle.activeRunId === scope.runId) {
    cancelAgent(handle);
  }
}
