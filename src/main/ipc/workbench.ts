import { IPC_CHANNELS } from "../../shared/ipc.js";
import {
  createAndSwitchGitBranch,
  getGitBranchSummary,
  getGitDiffSnapshot,
  listGitBranches,
  switchGitBranch,
} from "../git.js";
import { getSettings } from "../settings.js";
import {
  createTerminal,
  destroyTerminal,
  resizeTerminal,
  writeTerminal,
} from "../terminal.js";
import { getUiState, setDiffPanelOpen } from "../ui-state.js";
import { handleIpc } from "./handle.js";

export function registerWorkbenchIpc(): void {
  handleIpc(
    IPC_CHANNELS.terminalCreate,
    async (_event, options?: { cwd?: string }) => createTerminal(options),
  );
  handleIpc(
    IPC_CHANNELS.terminalWrite,
    async (_event, id: string, data: string) => writeTerminal(id, data),
  );
  handleIpc(
    IPC_CHANNELS.terminalResize,
    async (_event, id: string, cols: number, rows: number) =>
      resizeTerminal(id, cols, rows),
  );
  handleIpc(IPC_CHANNELS.terminalDestroy, async (_event, id: string) =>
    destroyTerminal(id),
  );
  handleIpc(IPC_CHANNELS.gitSummary, async () =>
    getGitBranchSummary(getSettings().workspace),
  );
  handleIpc(IPC_CHANNELS.gitStatus, async () =>
    getGitDiffSnapshot(getSettings().workspace),
  );
  handleIpc(IPC_CHANNELS.gitListBranches, async () =>
    listGitBranches(getSettings().workspace),
  );
  handleIpc(
    IPC_CHANNELS.gitSwitchBranch,
    async (_event, branchName: string) =>
      switchGitBranch(getSettings().workspace, branchName),
  );
  handleIpc(
    IPC_CHANNELS.gitCreateBranch,
    async (_event, branchName: string) =>
      createAndSwitchGitBranch(getSettings().workspace, branchName),
  );
  handleIpc(IPC_CHANNELS.uiGetState, async () => getUiState());
  handleIpc(
    IPC_CHANNELS.uiSetDiffPanelOpen,
    async (_event, open: boolean) => setDiffPanelOpen(open),
  );
}
