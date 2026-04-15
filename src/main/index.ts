import {
  app,
  BrowserWindow,
} from "electron";
import { registerFilesIpc } from "./ipc/files.js";
import { registerSessionsIpc } from "./ipc/sessions.js";
import { registerChatIpc } from "./ipc/chat.js";
import { registerHarnessIpc } from "./ipc/harness.js";
import { registerSettingsIpc } from "./ipc/settings.js";
import { registerWorkspaceIpc } from "./ipc/workspace.js";
import { registerProvidersIpc } from "./ipc/providers.js";
import { registerWorkbenchIpc } from "./ipc/workbench.js";
import { registerWindowIpc } from "./ipc/window.js";
import { registerWorkerIpc } from "./ipc/worker.js";
import {
  configureAppIdentity,
  createMainWindow,
  getMainWindow,
  migrateLegacyUserData,
} from "./window.js";
import {
  destroyAllAgents,
} from "./agent.js";
import {
  recoverInterruptedRuns,
} from "./session/service.js";
import {
  setTerminalWindow,
  destroyAllTerminals,
} from "./terminal.js";
import { harnessRuntime } from "./harness/singleton.js";
import { startBackgroundServices, stopBackgroundServices } from "./bootstrap/services.js";
import { registerQuickInvoke, unregisterQuickInvoke } from "./quick-invoke.js";
import {
  appLogger,
  registerProcessLogging,
} from "./logger.js";

configureAppIdentity();

function registerIpcHandlers() {
  registerFilesIpc();

  registerSessionsIpc();

  registerChatIpc();

  registerHarnessIpc();

  registerSettingsIpc();

  registerProvidersIpc();

  registerWorkspaceIpc();

  registerWorkbenchIpc();

  registerWorkerIpc();

  registerWindowIpc();
}

registerProcessLogging();

app.whenReady()
  .then(() => {
    migrateLegacyUserData();
    appLogger.info({
      scope: "app.lifecycle",
      message: "应用启动完成",
    });

    const recoveredRuns = harnessRuntime.hydrateFromDisk();
    recoverInterruptedRuns(recoveredRuns);
    startBackgroundServices();
    registerIpcHandlers();
    const window = createMainWindow();
    setTerminalWindow(window);
    registerQuickInvoke(getMainWindow);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const window = createMainWindow();
        setTerminalWindow(window);
      }
    });
  })
  .catch((error) => {
    appLogger.error({
      scope: "app.lifecycle",
      message: "应用启动失败",
      error,
    });
    throw error;
  });

app.on("window-all-closed", () => {
  appLogger.info({
    scope: "app.lifecycle",
    message: "所有窗口已关闭",
  });
  void destroyAllAgents();
  destroyAllTerminals();
  unregisterQuickInvoke();
  stopBackgroundServices();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
