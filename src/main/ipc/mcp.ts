import { IPC_CHANNELS } from "../../shared/ipc.js";
import {
  disconnectMcpServerForActiveHandles,
  listMcpServerStatuses,
  reloadMcpConfigForActiveHandles,
  restartMcpServerForActiveHandles,
} from "../agent.js";
import { handleIpc } from "./handle.js";
import { validateServerNamePayload } from "./schema.js";

export function registerMcpIpc(): void {
  handleIpc(IPC_CHANNELS.mcpListStatus, async () => listMcpServerStatuses());
  handleIpc(IPC_CHANNELS.mcpReloadConfig, async () =>
    reloadMcpConfigForActiveHandles(),
  );
  handleIpc(IPC_CHANNELS.mcpRestartServer, async (_event, serverName: string) =>
    restartMcpServerForActiveHandles(
      validateServerNamePayload(IPC_CHANNELS.mcpRestartServer, serverName),
    ),
  );
  handleIpc(IPC_CHANNELS.mcpDisconnectServer, async (_event, serverName: string) =>
    disconnectMcpServerForActiveHandles(
      validateServerNamePayload(IPC_CHANNELS.mcpDisconnectServer, serverName),
    ),
  );
}
