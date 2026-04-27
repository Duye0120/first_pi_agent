import { IPC_CHANNELS } from "../../shared/ipc.js";
import {
  disconnectMcpServerForActiveHandles,
  listMcpServerStatuses,
  reloadMcpConfigForActiveHandles,
  restartMcpServerForActiveHandles,
} from "../agent.js";
import { handleIpc } from "./handle.js";

export function registerMcpIpc(): void {
  handleIpc(IPC_CHANNELS.mcpListStatus, async () => listMcpServerStatuses());
  handleIpc(IPC_CHANNELS.mcpReloadConfig, async () =>
    reloadMcpConfigForActiveHandles(),
  );
  handleIpc(IPC_CHANNELS.mcpRestartServer, async (_event, serverName: string) =>
    restartMcpServerForActiveHandles(serverName),
  );
  handleIpc(IPC_CHANNELS.mcpDisconnectServer, async (_event, serverName: string) =>
    disconnectMcpServerForActiveHandles(serverName),
  );
}
