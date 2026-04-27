import { existsSync } from "node:fs";
import { dirname } from "node:path";
import {
  BrowserWindow,
  dialog,
  shell,
  type OpenDialogOptions,
} from "electron";
import { IPC_CHANNELS } from "../../shared/ipc.js";
import { getSoulFilesStatus } from "../soul.js";
import { getSettings, updateSettings } from "../settings.js";
import { getMainWindow } from "../window.js";
import { handleIpc } from "./handle.js";
import { validateWorkspacePathPayload } from "./schema.js";

export function registerWorkspaceIpc(): void {
  handleIpc(IPC_CHANNELS.workspaceChange, async (_event, path: string) => {
    updateSettings({ workspace: validateWorkspacePathPayload(path) });
  });
  handleIpc(IPC_CHANNELS.workspaceGetSoul, async () => {
    const settings = getSettings();
    return getSoulFilesStatus(settings.workspace);
  });
  handleIpc(IPC_CHANNELS.workspacePickFolder, async () => {
    const options: OpenDialogOptions = {
      title: "选择默认工作区",
      defaultPath: getSettings().workspace,
      properties: ["openDirectory"],
    };
    const browserWindow = getMainWindow() ?? BrowserWindow.getFocusedWindow();
    const result = browserWindow
      ? await dialog.showOpenDialog(browserWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled) {
      return null;
    }

    return result.filePaths[0] ?? null;
  });
  handleIpc(IPC_CHANNELS.workspaceOpenFolder, async () => {
    const { workspace } = getSettings();
    const targetPath = existsSync(workspace) ? workspace : dirname(workspace);
    const result = await shell.openPath(targetPath);
    if (result) {
      throw new Error(result);
    }
  });
}
