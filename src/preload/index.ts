import { contextBridge, ipcRenderer } from "electron";
import type {
  DesktopApi,
  WindowFrameState,
  ChatSession,
  SendMessageInput,
  SessionGroup,
} from "../shared/contracts.js";
import type { AgentEvent, ConfirmationResponse } from "../shared/agent-events.js";
import { IPC_CHANNELS } from "../shared/ipc.js";

const desktopApi: DesktopApi = {
  files: {
    pick: () => ipcRenderer.invoke(IPC_CHANNELS.filesPick),
    readPreview: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.filesReadPreview, filePath),
  },
  sessions: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.sessionsList),
    load: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.sessionsLoad, sessionId),
    save: (session: ChatSession) => ipcRenderer.invoke(IPC_CHANNELS.sessionsSave, session),
    create: () => ipcRenderer.invoke(IPC_CHANNELS.sessionsCreate),
    archive: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.sessionsArchive, sessionId),
    unarchive: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.sessionsUnarchive, sessionId),
    listArchived: () => ipcRenderer.invoke(IPC_CHANNELS.sessionsListArchived),
    delete: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.sessionsDelete, sessionId),
    setGroup: (sessionId: string, groupId: string | null) => ipcRenderer.invoke(IPC_CHANNELS.sessionsSetGroup, sessionId, groupId),
    rename: (sessionId: string, title: string) => ipcRenderer.invoke(IPC_CHANNELS.sessionsRename, sessionId, title),
  },
  groups: {
    list: (): Promise<SessionGroup[]> => ipcRenderer.invoke(IPC_CHANNELS.groupsList),
    create: (name: string): Promise<SessionGroup> => ipcRenderer.invoke(IPC_CHANNELS.groupsCreate, name),
    rename: (groupId: string, name: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.groupsRename, groupId, name),
    delete: (groupId: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.groupsDelete, groupId),
  },
  chat: {
    send: (input: SendMessageInput) => ipcRenderer.invoke(IPC_CHANNELS.chatSend, input),
  },

  // ── Agent (wired in Phase 1) ──────────────────────────────
  agent: {
    onEvent: (callback: (event: AgentEvent) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, event: AgentEvent) => callback(event);
      ipcRenderer.on(IPC_CHANNELS.agentEvent, handler);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.agentEvent, handler); };
    },
    cancel: () => ipcRenderer.invoke(IPC_CHANNELS.agentCancel),
    confirmResponse: (response: ConfirmationResponse) =>
      ipcRenderer.invoke(IPC_CHANNELS.agentConfirmResponse, response),
  },

  // ── Settings (wired in Phase 1) ───────────────────────────
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    update: (partial) => ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, partial),
  },

  // ── Credentials (wired in Phase 1) ────────────────────────
  credentials: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.credentialsGet),
    set: (provider, apiKey) => ipcRenderer.invoke(IPC_CHANNELS.credentialsSet, provider, apiKey),
    test: (provider, apiKey) => ipcRenderer.invoke(IPC_CHANNELS.credentialsTest, provider, apiKey),
    delete: (provider) => ipcRenderer.invoke(IPC_CHANNELS.credentialsDelete, provider),
  },

  // ── Models (wired in Phase 4) ─────────────────────────────
  models: {
    listAvailable: () => ipcRenderer.invoke(IPC_CHANNELS.modelsListAvailable),
  },

  // ── Workspace (wired in Phase 5) ──────────────────────────
  workspace: {
    change: (path) => ipcRenderer.invoke(IPC_CHANNELS.workspaceChange, path),
    getSoul: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceGetSoul),
  },

  // ── Terminal (wired in Phase 7) ───────────────────────────
  terminal: {
    create: (options) => ipcRenderer.invoke(IPC_CHANNELS.terminalCreate, options),
    write: (id, data) => ipcRenderer.invoke(IPC_CHANNELS.terminalWrite, id, data),
    resize: (id, cols, rows) => ipcRenderer.invoke(IPC_CHANNELS.terminalResize, id, cols, rows),
    destroy: (id) => ipcRenderer.invoke(IPC_CHANNELS.terminalDestroy, id),
    onData: (callback: (terminalId: string, data: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, id: string, data: string) => callback(id, data);
      ipcRenderer.on(IPC_CHANNELS.terminalData, handler);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.terminalData, handler); };
    },
    onExit: (callback: (terminalId: string, exitCode: number) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, id: string, code: number) => callback(id, code);
      ipcRenderer.on(IPC_CHANNELS.terminalExit, handler);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.terminalExit, handler); };
    },
  },

  ui: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.uiGetState),
    setRightPanelOpen: (open: boolean) => ipcRenderer.invoke(IPC_CHANNELS.uiSetRightPanelOpen, open),
  },
  window: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.windowGetState),
    minimize: () => ipcRenderer.send(IPC_CHANNELS.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC_CHANNELS.windowToggleMaximize),
    close: () => ipcRenderer.send(IPC_CHANNELS.windowClose),
    onStateChange: (listener: (state: WindowFrameState) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, state: WindowFrameState) => {
        listener(state);
      };
      ipcRenderer.on(IPC_CHANNELS.windowStateChanged, wrappedListener);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.windowStateChanged, wrappedListener); };
    },
  },
};

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
