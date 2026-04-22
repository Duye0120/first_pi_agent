import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { appLogger, summarizeIpcArgs } from "../logger.js";

function normalizeIpcError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string" && error.trim()) {
    return new Error(error.trim());
  }

  return new Error("操作失败，请稍后重试。");
}

export function handleIpc(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<unknown> | unknown,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (error) {
      appLogger.error({
        scope: "ipc",
        message: "IPC 调用失败",
        data: {
          channel,
          args: summarizeIpcArgs(args),
        },
        error,
      });
      throw normalizeIpcError(error);
    }
  });
}
