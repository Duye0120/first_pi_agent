import { IPC_CHANNELS } from "../../shared/ipc.js";
import { getChelaMemoryService } from "../memory/rag-service.js";
import { handleIpc } from "./handle.js";
import {
  validateMemoryAddPayload,
  validateMemoryFeedbackDeltaPayload,
  validateMemoryIdPayload,
  validateMemoryListPayload,
  validateMemorySearchLimitPayload,
  validateMemorySearchQueryPayload,
} from "./schema.js";

export function registerMemoryIpc(): void {
  const memoryService = getChelaMemoryService();

  handleIpc(IPC_CHANNELS.memoryAdd, async (_event, input) =>
    memoryService.add(validateMemoryAddPayload(input)),
  );
  handleIpc(IPC_CHANNELS.memorySearch, async (_event, query: string, limit?: number) =>
    memoryService.search(
      validateMemorySearchQueryPayload(query),
      validateMemorySearchLimitPayload(limit),
    ),
  );
  handleIpc(IPC_CHANNELS.memoryList, async (_event, input) =>
    memoryService.list(validateMemoryListPayload(input)),
  );
  handleIpc(IPC_CHANNELS.memoryGetStats, async () =>
    memoryService.getStats(),
  );
  handleIpc(IPC_CHANNELS.memoryRebuild, async () =>
    memoryService.rebuild(),
  );
  handleIpc(IPC_CHANNELS.memoryDelete, async (_event, memoryId: number) =>
    memoryService.delete(
      validateMemoryIdPayload(IPC_CHANNELS.memoryDelete, memoryId),
    ),
  );
  handleIpc(IPC_CHANNELS.memoryFeedback, async (_event, memoryId: number, delta: number) =>
    memoryService.feedback(
      validateMemoryIdPayload(IPC_CHANNELS.memoryFeedback, memoryId),
      validateMemoryFeedbackDeltaPayload(delta),
    ),
  );
}
