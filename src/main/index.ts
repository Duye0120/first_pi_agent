import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import {
  pickFiles,
  readFilePreview,
  readImageDataUrl,
  saveClipboardFile,
} from "./files.js";
import {
  archiveSession,
  createGroup,
  createSession,
  deleteGroup,
  deleteSession,
  getUiState,
  listArchivedSessions,
  listGroups,
  listSessions,
  loadSession,
  renameGroup,
  renameSession,
  saveSession,
  setDiffPanelOpen,
  setSessionGroup,
  unarchiveSession,
} from "./store.js";
import { compactSession, getContextSummary } from "./context/service.js";
import { IPC_CHANNELS } from "../shared/ipc.js";
import type { ChatSession, SendMessageInput } from "../shared/contracts.js";
import { ElectronAdapter } from "./adapter.js";
import {
  bindHandleToRun,
  completeRun,
  initAgent,
  promptAgent,
  cancelAgent,
  destroyAgent,
  destroyAllAgents,
  getHandle,
} from "./agent.js";
import { getSettings, updateSettings } from "./settings.js";
import {
  appendAssistantMessageEvent,
  appendRunFinishedEvent,
  appendRunStartedEvent,
  appendUserMessageEvent,
  recoverInterruptedRuns,
} from "./session/service.js";
import {
  deleteEntry,
  deleteSource,
  getCredentials,
  getEntry,
  getSource,
  listEntries,
  listEntriesBySource,
  listSources,
  resolveModelEntry,
  saveEntry,
  saveSource,
  setCredentials,
  testSource,
} from "./providers.js";
import {
  createAndSwitchGitBranch,
  getGitDiffSnapshot,
  listGitBranches,
  switchGitBranch,
} from "./git.js";
import { getSoulFilesStatus } from "./soul.js";
import {
  setTerminalWindow,
  createTerminal,
  writeTerminal,
  resizeTerminal,
  destroyTerminal,
  destroyAllTerminals,
} from "./terminal.js";
import { HarnessRunCancelledError } from "./harness/runtime.js";
import { harnessRuntime } from "./harness/singleton.js";

let mainWindow: BrowserWindow | null = null;
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIN_WINDOW_WIDTH = 920;
const MIN_WINDOW_HEIGHT = 600;
function getPreloadPath() {
  return join(__dirname, "../preload/index.mjs");
}

function getRendererPath() {
  return join(__dirname, "../renderer/index.html");
}

function getDevServerUrl() {
  return process.env.ELECTRON_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL;
}

function computeWindowFrameState() {
  const window = requireMainWindow();
  return {
    isMaximized: window.isMaximized(),
  };
}

function notifyWindowState() {
  if (!mainWindow) {
    return;
  }

  mainWindow.webContents.send(
    IPC_CHANNELS.windowStateChanged,
    computeWindowFrameState(),
  );
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    frame: false,
    backgroundColor: "#e8edf3",
    title: "first_pi_agent",
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on("maximize", notifyWindowState);
  mainWindow.on("unmaximize", notifyWindowState);
  mainWindow.on("ready-to-show", notifyWindowState);
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;

    const isDevToolsShortcut =
      input.key === "F12" ||
      ((input.control || input.meta) &&
        input.shift &&
        input.key.toUpperCase() === "I");

    if (isDevToolsShortcut) {
      event.preventDefault();
      if (mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow?.webContents.openDevTools({ mode: "detach" });
      }
      return;
    }

    // Ctrl+R / Cmd+R / F5: reload renderer
    const isReloadShortcut =
      input.key === "F5" ||
      ((input.control || input.meta) &&
        !input.shift &&
        input.key.toUpperCase() === "R");

    if (isReloadShortcut) {
      event.preventDefault();
      mainWindow?.webContents.reload();
      return;
    }
  });

  const devServerUrl = getDevServerUrl();

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(getRendererPath());
  }
}

function requireMainWindow() {
  if (!mainWindow) {
    throw new Error("Main window is not ready yet.");
  }

  return mainWindow;
}

function registerIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.filesPick, async () =>
    pickFiles(requireMainWindow()),
  );
  ipcMain.handle(
    IPC_CHANNELS.filesReadPreview,
    async (_event, filePath: string) => readFilePreview(filePath),
  );
  ipcMain.handle(
    IPC_CHANNELS.filesReadImageDataUrl,
    async (_event, filePath: string) => readImageDataUrl(filePath),
  );
  ipcMain.handle(IPC_CHANNELS.filesSaveFromClipboard, async (_event, payload) =>
    saveClipboardFile(payload),
  );

  ipcMain.handle(IPC_CHANNELS.sessionsList, async () => listSessions());
  ipcMain.handle(IPC_CHANNELS.sessionsLoad, async (_event, sessionId: string) =>
    loadSession(sessionId),
  );
  ipcMain.handle(
    IPC_CHANNELS.sessionsSave,
    async (_event, session: ChatSession) => saveSession(session),
  );
  ipcMain.handle(IPC_CHANNELS.sessionsCreate, async () => createSession());
  ipcMain.handle(
    IPC_CHANNELS.sessionsArchive,
    async (_event, sessionId: string) => archiveSession(sessionId),
  );
  ipcMain.handle(
    IPC_CHANNELS.sessionsUnarchive,
    async (_event, sessionId: string) => unarchiveSession(sessionId),
  );
  ipcMain.handle(IPC_CHANNELS.sessionsListArchived, async () =>
    listArchivedSessions(),
  );
  ipcMain.handle(
    IPC_CHANNELS.sessionsDelete,
    async (_event, sessionId: string) => deleteSession(sessionId),
  );
  ipcMain.handle(
    IPC_CHANNELS.sessionsSetGroup,
    async (_event, sessionId: string, groupId: string | null) =>
      setSessionGroup(sessionId, groupId),
  );
  ipcMain.handle(
    IPC_CHANNELS.sessionsRename,
    async (_event, sessionId: string, title: string) =>
      renameSession(sessionId, title),
  );
  ipcMain.handle(
    IPC_CHANNELS.contextGetSummary,
    async (_event, sessionId: string) => getContextSummary(sessionId),
  );
  ipcMain.handle(
    IPC_CHANNELS.contextCompact,
    async (_event, sessionId: string) => compactSession(sessionId),
  );

  ipcMain.handle(IPC_CHANNELS.groupsList, async () => listGroups());
  ipcMain.handle(IPC_CHANNELS.groupsCreate, async (_event, name: string) =>
    createGroup(name),
  );
  ipcMain.handle(
    IPC_CHANNELS.groupsRename,
    async (_event, groupId: string, name: string) => renameGroup(groupId, name),
  );
  ipcMain.handle(IPC_CHANNELS.groupsDelete, async (_event, groupId: string) =>
    deleteGroup(groupId),
  );

  ipcMain.handle(
    IPC_CHANNELS.chatSend,
    async (_event, input: SendMessageInput) => {
      const settings = getSettings();
      const existingSession = loadSession(input.sessionId);
      if (!existingSession) {
        throw new Error("会话不存在，无法继续发送。");
      }

      const resolvedModel = resolveModelEntry(settings.defaultModelId);
      const runScope = {
        sessionId: input.sessionId,
        runId: input.runId,
      };
      const scopedAdapter = new ElectronAdapter(requireMainWindow(), {
        sessionId: input.sessionId,
        runId: input.runId,
      });

      let createdHandle = false;
      let handle: ReturnType<typeof getHandle> = null;
      let runCreated = false;
      let transcriptStarted = false;

      try {
        harnessRuntime.createRun({
          ...runScope,
          modelEntryId: resolvedModel.entry.id,
          runKind: "chat",
        });
        runCreated = true;
        appendUserMessageEvent({
          sessionId: input.sessionId,
          text: input.text,
          attachments: input.attachments,
          modelEntryId: resolvedModel.entry.id,
          thinkingLevel: settings.thinkingLevel,
        });
        appendRunStartedEvent({
          sessionId: input.sessionId,
          runId: input.runId,
          runKind: "chat",
          modelEntryId: resolvedModel.entry.id,
          thinkingLevel: settings.thinkingLevel,
        });
        transcriptStarted = true;
        harnessRuntime.assertRunActive(runScope);

        handle = getHandle(input.sessionId);
        if (
          !handle ||
          handle.modelEntryId !== resolvedModel.entry.id ||
          handle.runtimeSignature !== resolvedModel.runtimeSignature ||
          handle.thinkingLevel !== settings.thinkingLevel
        ) {
          harnessRuntime.assertRunActive(runScope);

          handle = await initAgent(
            input.sessionId,
            scopedAdapter,
            existingSession.messages,
          );
          createdHandle = true;
        }

        bindHandleToRun(handle, scopedAdapter, input.runId);
        harnessRuntime.attachHandle(runScope, handle);
        harnessRuntime.assertRunActive(runScope);

        await promptAgent(handle, input.text, input.attachments);
        const assistantMessage = scopedAdapter.buildAssistantMessage("completed");
        if (assistantMessage) {
          appendAssistantMessageEvent({
            sessionId: input.sessionId,
            runId: input.runId,
            message: assistantMessage,
          });
        }
        appendRunFinishedEvent({
          sessionId: input.sessionId,
          runId: input.runId,
          finalState: "completed",
        });
        harnessRuntime.finishRun(runScope, "completed");
        scopedAdapter.flushTerminalEvent({ type: "agent_end" });
      } catch (err) {
        if (
          err instanceof HarnessRunCancelledError ||
          harnessRuntime.isCancelRequested(runScope)
        ) {
          const cancelledMessage = scopedAdapter.buildAssistantMessage("cancelled");
          if (cancelledMessage && transcriptStarted) {
            appendAssistantMessageEvent({
              sessionId: input.sessionId,
              runId: input.runId,
              message: cancelledMessage,
            });
          }
          if (transcriptStarted) {
            appendRunFinishedEvent({
              sessionId: input.sessionId,
              runId: input.runId,
              finalState: "aborted",
              reason: "用户取消了当前 run。",
            });
          }
          if (createdHandle && handle) {
            await destroyAgent(handle);
          }
          if (runCreated) {
            harnessRuntime.finishRun(runScope, "aborted", {
              reason: "用户取消了当前 run。",
            });
          }
          scopedAdapter.flushTerminalEvent({ type: "agent_end" });
          return;
        }

        const errorMessage =
          err instanceof Error ? err.message : "Agent 执行失败";
        const failedMessage = scopedAdapter.buildAssistantMessage(
          "error",
          errorMessage,
        );
        if (failedMessage && transcriptStarted) {
          appendAssistantMessageEvent({
            sessionId: input.sessionId,
            runId: input.runId,
            message: failedMessage,
          });
        }
        if (transcriptStarted) {
          appendRunFinishedEvent({
            sessionId: input.sessionId,
            runId: input.runId,
            finalState: "failed",
            reason: errorMessage,
          });
        }
        if (runCreated) {
          harnessRuntime.finishRun(runScope, "failed", {
            reason: errorMessage,
          });
        }
        scopedAdapter.queueTerminalError(errorMessage);
        scopedAdapter.flushTerminalEvent({
          type: "agent_error",
          message: errorMessage,
        });
      } finally {
        if (handle) {
          completeRun(handle, input.runId);
        }
      }
      // Return void — response comes via agent events
    },
  );

  ipcMain.handle(IPC_CHANNELS.agentCancel, async (_event, scope) => {
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
  });

  // Settings
  ipcMain.handle(IPC_CHANNELS.settingsGet, async () => getSettings());
  ipcMain.handle(IPC_CHANNELS.settingsUpdate, async (_event, partial) =>
    updateSettings(partial),
  );

  // Providers
  ipcMain.handle(IPC_CHANNELS.providersListSources, async () => listSources());
  ipcMain.handle(
    IPC_CHANNELS.providersGetSource,
    async (_event, sourceId: string) => getSource(sourceId),
  );
  ipcMain.handle(
    IPC_CHANNELS.providersSaveSource,
    async (_event, draft) => saveSource(draft),
  );
  ipcMain.handle(
    IPC_CHANNELS.providersDeleteSource,
    async (_event, sourceId: string) => deleteSource(sourceId),
  );
  ipcMain.handle(
    IPC_CHANNELS.providersTestSource,
    async (_event, draft) => testSource(draft),
  );
  ipcMain.handle(
    IPC_CHANNELS.providersGetCredentials,
    async (_event, sourceId: string) => getCredentials(sourceId),
  );
  ipcMain.handle(
    IPC_CHANNELS.providersSetCredentials,
    async (_event, sourceId: string, apiKey: string) =>
      setCredentials(sourceId, apiKey),
  );

  // Models
  ipcMain.handle(IPC_CHANNELS.modelsListEntries, async () => listEntries());
  ipcMain.handle(
    IPC_CHANNELS.modelsListEntriesBySource,
    async (_event, sourceId: string) => listEntriesBySource(sourceId),
  );
  ipcMain.handle(
    IPC_CHANNELS.modelsSaveEntry,
    async (_event, draft) => saveEntry(draft),
  );
  ipcMain.handle(
    IPC_CHANNELS.modelsDeleteEntry,
    async (_event, entryId: string) => deleteEntry(entryId),
  );
  ipcMain.handle(
    IPC_CHANNELS.modelsGetEntry,
    async (_event, entryId: string) => getEntry(entryId),
  );

  // Workspace
  ipcMain.handle(IPC_CHANNELS.workspaceChange, async (_event, path: string) => {
    updateSettings({ workspace: path });
  });
  ipcMain.handle(IPC_CHANNELS.workspaceGetSoul, async () => {
    const settings = getSettings();
    return getSoulFilesStatus(settings.workspace);
  });

  // Terminal
  ipcMain.handle(
    IPC_CHANNELS.terminalCreate,
    async (_event, options?: { cwd?: string }) => createTerminal(options),
  );
  ipcMain.handle(
    IPC_CHANNELS.terminalWrite,
    async (_event, id: string, data: string) => writeTerminal(id, data),
  );
  ipcMain.handle(
    IPC_CHANNELS.terminalResize,
    async (_event, id: string, cols: number, rows: number) =>
      resizeTerminal(id, cols, rows),
  );
  ipcMain.handle(IPC_CHANNELS.terminalDestroy, async (_event, id: string) =>
    destroyTerminal(id),
  );
  ipcMain.handle(IPC_CHANNELS.gitStatus, async () =>
    getGitDiffSnapshot(getSettings().workspace),
  );
  ipcMain.handle(IPC_CHANNELS.gitListBranches, async () =>
    listGitBranches(getSettings().workspace),
  );
  ipcMain.handle(
    IPC_CHANNELS.gitSwitchBranch,
    async (_event, branchName: string) =>
      switchGitBranch(getSettings().workspace, branchName),
  );
  ipcMain.handle(
    IPC_CHANNELS.gitCreateBranch,
    async (_event, branchName: string) =>
      createAndSwitchGitBranch(getSettings().workspace, branchName),
  );

  ipcMain.handle(IPC_CHANNELS.uiGetState, async () => getUiState());
  ipcMain.handle(
    IPC_CHANNELS.uiSetDiffPanelOpen,
    async (_event, open: boolean) => setDiffPanelOpen(open),
  );

  ipcMain.handle(IPC_CHANNELS.windowGetState, async () => {
    return computeWindowFrameState();
  });
  ipcMain.on(IPC_CHANNELS.windowMinimize, () => requireMainWindow().minimize());
  ipcMain.handle(IPC_CHANNELS.windowToggleMaximize, async () => {
    const window = requireMainWindow();

    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }

    return computeWindowFrameState();
  });
  ipcMain.on(IPC_CHANNELS.windowClose, () => requireMainWindow().close());
}

app.whenReady().then(() => {
  const recoveredRuns = harnessRuntime.hydrateFromDisk();
  recoverInterruptedRuns(recoveredRuns);
  registerIpcHandlers();
  createMainWindow();
  setTerminalWindow(mainWindow!);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  void destroyAllAgents();
  destroyAllTerminals();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
