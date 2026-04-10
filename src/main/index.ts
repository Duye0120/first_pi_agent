import { cpSync, existsSync, readdirSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
} from "electron";
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
  setSessionPinned,
  unarchiveSession,
} from "./store.js";
import { compactSession, getContextSummary, reactiveCompact } from "./context/service.js";
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
  getGitBranchSummary,
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
import { bus } from "./event-bus.js";
import { registerQuickInvoke, unregisterQuickInvoke } from "./quick-invoke.js";
import { initBusAuditLog } from "./bus-audit.js";
import { scheduler } from "./scheduler.js";
import { initSelfDiagnosis } from "./self-diagnosis/service.js";
import { initMetrics } from "./metrics.js";
import { initActiveLearning } from "./learning/engine.js";
import { initEmotionalStateMachine } from "./emotional/state-machine.js";
import { initReflectionService } from "./reflection/service.js";
import { initPersonalityDrift } from "./reflection/personality-drift.js";
import { startWebhookServer, stopWebhookServer } from "./webhook.js";
import {
  appLogger,
  attachWindowLogging,
  getDiagnosticLogSnapshot,
  openDiagnosticLogFolder,
  registerProcessLogging,
  summarizeIpcArgs,
} from "./logger.js";

// ── 错误分类辅助 ─────────────────────────────────────

/** 检测 API 返回的 prompt-too-long / context_length_exceeded 错误 */
function isPromptTooLongError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("prompt is too long") ||
    msg.includes("context_length_exceeded") ||
    msg.includes("maximum context length") ||
    msg.includes("too many tokens") ||
    msg.includes("prompt_too_long") ||
    msg.includes("request too large") ||
    msg.includes("请求过长") ||
    (msg.includes("context") && msg.includes("exceed"))
  );
}

/** 检测 max_output_tokens 截断（基于 stop_reason） */
function isMaxTokensTruncation(stopReason: string | undefined): boolean {
  if (!stopReason) return false;
  const normalized = stopReason.toLowerCase();
  return normalized === "max_tokens" || normalized === "length";
}

let mainWindow: BrowserWindow | null = null;
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIN_WINDOW_WIDTH = 920;
const MIN_WINDOW_HEIGHT = 600;
const APP_PRODUCT_NAME = "Chela";
const LEGACY_USER_DATA_DIR_NAMES = ["first-pi-agent", "first_pi_agent"];

app.setName(APP_PRODUCT_NAME);

function getPreloadPath() {
  return join(__dirname, "../preload/index.mjs");
}

function getRendererPath() {
  return join(__dirname, "../renderer/index.html");
}

function getDevServerUrl() {
  return process.env.ELECTRON_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL;
}

function migrateLegacyUserData(): void {
  const currentUserDataPath = app.getPath("userData");
  const hasCurrentData = existsSync(currentUserDataPath)
    && readdirSync(currentUserDataPath).length > 0;

  if (hasCurrentData) {
    return;
  }

  const appDataPath = app.getPath("appData");

  for (const legacyDirName of LEGACY_USER_DATA_DIR_NAMES) {
    const legacyUserDataPath = join(appDataPath, legacyDirName);
    if (legacyUserDataPath === currentUserDataPath || !existsSync(legacyUserDataPath)) {
      continue;
    }

    if (!existsSync(currentUserDataPath)) {
      renameSync(legacyUserDataPath, currentUserDataPath);
      return;
    }

    cpSync(legacyUserDataPath, currentUserDataPath, {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
    return;
  }
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
    title: APP_PRODUCT_NAME,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  attachWindowLogging(mainWindow);

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

  appLogger.info({
    scope: "app.window",
    message: "主窗口已创建",
    data: {
      devServerUrl: devServerUrl ?? null,
    },
  });
}

function requireMainWindow() {
  if (!mainWindow) {
    throw new Error("Main window is not ready yet.");
  }

  return mainWindow;
}

function handleIpc(
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
      throw error;
    }
  });
}

function registerIpcHandlers() {
  handleIpc(IPC_CHANNELS.filesPick, async () =>
    pickFiles(requireMainWindow()),
  );
  handleIpc(
    IPC_CHANNELS.filesReadPreview,
    async (_event, filePath: string) => readFilePreview(filePath),
  );
  handleIpc(
    IPC_CHANNELS.filesReadImageDataUrl,
    async (_event, filePath: string) => readImageDataUrl(filePath),
  );
  handleIpc(IPC_CHANNELS.filesSaveFromClipboard, async (_event, payload) =>
    saveClipboardFile(payload),
  );

  handleIpc(IPC_CHANNELS.sessionsList, async () => listSessions());
  handleIpc(IPC_CHANNELS.sessionsLoad, async (_event, sessionId: string) =>
    loadSession(sessionId),
  );
  handleIpc(
    IPC_CHANNELS.sessionsSave,
    async (_event, session: ChatSession) => saveSession(session),
  );
  handleIpc(IPC_CHANNELS.sessionsCreate, async () => createSession());
  handleIpc(
    IPC_CHANNELS.sessionsArchive,
    async (_event, sessionId: string) => archiveSession(sessionId),
  );
  handleIpc(
    IPC_CHANNELS.sessionsUnarchive,
    async (_event, sessionId: string) => unarchiveSession(sessionId),
  );
  handleIpc(IPC_CHANNELS.sessionsListArchived, async () =>
    listArchivedSessions(),
  );
  handleIpc(
    IPC_CHANNELS.sessionsDelete,
    async (_event, sessionId: string) => deleteSession(sessionId),
  );
  handleIpc(
    IPC_CHANNELS.sessionsSetGroup,
    async (_event, sessionId: string, groupId: string | null) =>
      setSessionGroup(sessionId, groupId),
  );
  handleIpc(
    IPC_CHANNELS.sessionsRename,
    async (_event, sessionId: string, title: string) =>
      renameSession(sessionId, title),
  );
  handleIpc(
    IPC_CHANNELS.sessionsSetPinned,
    async (_event, sessionId: string, pinned: boolean) =>
      setSessionPinned(sessionId, pinned),
  );
  handleIpc(
    IPC_CHANNELS.contextGetSummary,
    async (_event, sessionId: string) => getContextSummary(sessionId),
  );
  handleIpc(
    IPC_CHANNELS.contextCompact,
    async (_event, sessionId: string) => compactSession(sessionId),
  );

  handleIpc(IPC_CHANNELS.groupsList, async () => listGroups());
  handleIpc(IPC_CHANNELS.groupsCreate, async (_event, name: string) =>
    createGroup(name),
  );
  handleIpc(
    IPC_CHANNELS.groupsRename,
    async (_event, groupId: string, name: string) => renameGroup(groupId, name),
  );
  handleIpc(IPC_CHANNELS.groupsDelete, async (_event, groupId: string) =>
    deleteGroup(groupId),
  );

  handleIpc(
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

      appLogger.info({
        scope: "chat.send",
        message: "开始发送消息",
        data: {
          sessionId: input.sessionId,
          runId: input.runId,
          textLength: input.text.length,
          attachmentCount: input.attachments.length,
          modelEntryId: resolvedModel.entry.id,
        },
      });

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
        bus.emit("message:user", {
          sessionId: input.sessionId,
          text: input.text,
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

        // ── 带 PTL 恢复的 prompt 调用 ──
        try {
          await promptAgent(handle, input.text, input.attachments);
        } catch (promptErr) {
          if (
            isPromptTooLongError(promptErr) &&
            !harnessRuntime.isCancelRequested(runScope)
          ) {
            appLogger.warn({
              scope: "chat.send",
              message: "检测到 prompt-too-long，尝试反应式 compact 后重试",
              data: { sessionId: input.sessionId, runId: input.runId },
            });
            const compacted = await reactiveCompact(input.sessionId);
            if (compacted) {
              await promptAgent(handle, input.text, input.attachments);
            } else {
              throw promptErr;
            }
          } else {
            throw promptErr;
          }
        }

        // ── max_output_tokens 续写检测 ──
        const stopReason = scopedAdapter.getLastStopReason();
        if (
          isMaxTokensTruncation(stopReason) &&
          !harnessRuntime.isCancelRequested(runScope)
        ) {
          appLogger.info({
            scope: "chat.send",
            message: "检测到 max_output_tokens 截断，注入续写指令",
            data: { sessionId: input.sessionId, runId: input.runId, stopReason },
          });
          try {
            await promptAgent(
              handle,
              "直接继续，不要道歉，不要回顾，从中断处接着写。",
              [],
            );
          } catch (contErr) {
            // 续写失败不阻塞主流程，只记录日志
            appLogger.warn({
              scope: "chat.send",
              message: "max_tokens 续写失败",
              error: contErr,
            });
          }
        }

        const assistantMessage = scopedAdapter.buildAssistantMessage("completed");
        if (assistantMessage) {
          appendAssistantMessageEvent({
            sessionId: input.sessionId,
            runId: input.runId,
            message: assistantMessage,
          });
          bus.emit("message:assistant", {
            sessionId: input.sessionId,
            runId: input.runId,
          });
        }
        appendRunFinishedEvent({
          sessionId: input.sessionId,
          runId: input.runId,
          finalState: "completed",
        });
        harnessRuntime.finishRun(runScope, "completed");
        appLogger.info({
          scope: "chat.send",
          message: "消息发送完成",
          data: {
            sessionId: input.sessionId,
            runId: input.runId,
          },
        });
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
          appLogger.warn({
            scope: "chat.send",
            message: "消息发送被取消",
            data: {
              sessionId: input.sessionId,
              runId: input.runId,
            },
          });
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
        appLogger.error({
          scope: "chat.send",
          message: "消息发送失败",
          data: {
            sessionId: input.sessionId,
            runId: input.runId,
            createdHandle,
            runCreated,
            transcriptStarted,
          },
          error: err,
        });
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

  handleIpc(IPC_CHANNELS.agentCancel, async (_event, scope) => {
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

  handleIpc(
    IPC_CHANNELS.agentConfirmResponse,
    async (_event, response) => harnessRuntime.resolvePendingApproval(response),
  );

  // Settings
  handleIpc(IPC_CHANNELS.settingsGet, async () => getSettings());
  handleIpc(IPC_CHANNELS.settingsUpdate, async (_event, partial) =>
    updateSettings(partial),
  );
  handleIpc(IPC_CHANNELS.settingsGetLogSnapshot, async () =>
    getDiagnosticLogSnapshot(),
  );
  handleIpc(IPC_CHANNELS.settingsOpenLogFolder, async (_event, logId) =>
    openDiagnosticLogFolder(logId),
  );

  // Providers
  handleIpc(IPC_CHANNELS.providersListSources, async () => listSources());
  handleIpc(
    IPC_CHANNELS.providersGetSource,
    async (_event, sourceId: string) => getSource(sourceId),
  );
  handleIpc(
    IPC_CHANNELS.providersSaveSource,
    async (_event, draft) => saveSource(draft),
  );
  handleIpc(
    IPC_CHANNELS.providersDeleteSource,
    async (_event, sourceId: string) => deleteSource(sourceId),
  );
  handleIpc(
    IPC_CHANNELS.providersTestSource,
    async (_event, draft) => testSource(draft),
  );
  handleIpc(
    IPC_CHANNELS.providersGetCredentials,
    async (_event, sourceId: string) => getCredentials(sourceId),
  );
  handleIpc(
    IPC_CHANNELS.providersSetCredentials,
    async (_event, sourceId: string, apiKey: string) =>
      setCredentials(sourceId, apiKey),
  );

  // Models
  handleIpc(IPC_CHANNELS.modelsListEntries, async () => listEntries());
  handleIpc(
    IPC_CHANNELS.modelsListEntriesBySource,
    async (_event, sourceId: string) => listEntriesBySource(sourceId),
  );
  handleIpc(
    IPC_CHANNELS.modelsSaveEntry,
    async (_event, draft) => saveEntry(draft),
  );
  handleIpc(
    IPC_CHANNELS.modelsDeleteEntry,
    async (_event, entryId: string) => deleteEntry(entryId),
  );
  handleIpc(
    IPC_CHANNELS.modelsGetEntry,
    async (_event, entryId: string) => getEntry(entryId),
  );

  // Workspace
  handleIpc(IPC_CHANNELS.workspaceChange, async (_event, path: string) => {
    updateSettings({ workspace: path });
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
    const browserWindow = mainWindow ?? BrowserWindow.getFocusedWindow();
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

  // Terminal
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

  handleIpc(IPC_CHANNELS.windowGetState, async () => {
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
    initBusAuditLog();
    initMetrics();
    initSelfDiagnosis();
    initActiveLearning();
    initPersonalityDrift();
    initEmotionalStateMachine();
    initReflectionService();
    scheduler.start();
    startWebhookServer();
    registerIpcHandlers();
    createMainWindow();
    setTerminalWindow(mainWindow!);
    registerQuickInvoke(() => mainWindow);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
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
  stopWebhookServer();
  scheduler.stop();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
