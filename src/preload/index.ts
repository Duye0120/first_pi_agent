import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentRunScope,
  ChatSession,
  DesktopApi,
  PendingApprovalGroup,
  InterruptedApprovalGroup,
  InterruptedApprovalNotice,
  RedirectMessageInput,
  SessionSearchResult,
  SessionGroup,
  WindowFrameState,
  SendMessageInput,
  SessionGroupCreateInput,
  TrimSessionMessagesInput,
} from "../shared/contracts.js";
import type { AgentEvent, ConfirmationResponse } from "../shared/agent-events.js";
import { IPC_CHANNELS } from "../shared/ipc.js";

const desktopApi: DesktopApi = {
  files: {
    pick: () => ipcRenderer.invoke(IPC_CHANNELS.filesPick),
    readPreview: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.filesReadPreview, filePath),
    readImageDataUrl: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.filesReadImageDataUrl, filePath),
    saveFromClipboard: (payload) => ipcRenderer.invoke(IPC_CHANNELS.filesSaveFromClipboard, payload),
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
    setPinned: (sessionId: string, pinned: boolean) => ipcRenderer.invoke(IPC_CHANNELS.sessionsSetPinned, sessionId, pinned),
    search: (query: string, limit?: number): Promise<SessionSearchResult[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.sessionsSearch, query, limit),
    reindexSearch: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.sessionsReindexSearch),
  },
  groups: {
    list: (): Promise<SessionGroup[]> => ipcRenderer.invoke(IPC_CHANNELS.groupsList),
    create: (input: SessionGroupCreateInput): Promise<SessionGroup> =>
      ipcRenderer.invoke(IPC_CHANNELS.groupsCreate, input),
    rename: (groupId: string, name: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.groupsRename, groupId, name),
    delete: (groupId: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.groupsDelete, groupId),
  },
  chat: {
    send: (input: SendMessageInput) => ipcRenderer.invoke(IPC_CHANNELS.chatSend, input),
    trimSessionMessages: (input: TrimSessionMessagesInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.chatTrimSessionMessages, input),
    queueRedirect: (input: RedirectMessageInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.chatQueueRedirect, input),
    clearRedirectDraft: (sessionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.chatClearRedirectDraft, sessionId),
  },
  context: {
    getSummary: (sessionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.contextGetSummary, sessionId),
    compact: (sessionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.contextCompact, sessionId),
  },

  // ── Agent (wired in Phase 1) ──────────────────────────────
  agent: {
    onEvent: (callback: (event: AgentEvent) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, event: AgentEvent) => callback(event);
      ipcRenderer.on(IPC_CHANNELS.agentEvent, handler);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.agentEvent, handler); };
    },
    cancel: (scope: AgentRunScope) => ipcRenderer.invoke(IPC_CHANNELS.agentCancel, scope),
    confirmResponse: (response: ConfirmationResponse) =>
      ipcRenderer.invoke(IPC_CHANNELS.agentConfirmResponse, response),
    listPendingApprovalGroups: (sessionId?: string): Promise<PendingApprovalGroup[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.agentListPendingApprovalGroups, sessionId),
    listInterruptedApprovals: (sessionId?: string): Promise<InterruptedApprovalNotice[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.agentListInterruptedApprovals, sessionId),
    listInterruptedApprovalGroups: (sessionId?: string): Promise<InterruptedApprovalGroup[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.agentListInterruptedApprovalGroups, sessionId),
    dismissInterruptedApproval: (runId: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.agentDismissInterruptedApproval, runId),
    resumeInterruptedApproval: (runId: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.agentResumeInterruptedApproval, runId),
  },

  // ── Settings (wired in Phase 1) ───────────────────────────
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    update: (partial) => ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, partial),
    getLogSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGetLogSnapshot),
    openLogFolder: (logId) => ipcRenderer.invoke(IPC_CHANNELS.settingsOpenLogFolder, logId),
  },
  skills: {
    listInstalled: () => ipcRenderer.invoke(IPC_CHANNELS.skillsListInstalled),
    searchCatalog: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.skillsSearchCatalog, query),
    install: (request) => ipcRenderer.invoke(IPC_CHANNELS.skillsInstall, request),
    openDirectory: (skillId: string, source) =>
      ipcRenderer.invoke(IPC_CHANNELS.skillsOpenDirectory, skillId, source),
    openSkillFile: (skillId: string, source) =>
      ipcRenderer.invoke(IPC_CHANNELS.skillsOpenSkillFile, skillId, source),
  },

  // ── Providers / Models ─────────────────────────────────────
  providers: {
    listSources: () => ipcRenderer.invoke(IPC_CHANNELS.providersListSources),
    getSource: (sourceId) => ipcRenderer.invoke(IPC_CHANNELS.providersGetSource, sourceId),
    saveSource: (draft) => ipcRenderer.invoke(IPC_CHANNELS.providersSaveSource, draft),
    deleteSource: (sourceId) => ipcRenderer.invoke(IPC_CHANNELS.providersDeleteSource, sourceId),
    testSource: (draft) => ipcRenderer.invoke(IPC_CHANNELS.providersTestSource, draft),
    getCredentials: (sourceId) => ipcRenderer.invoke(IPC_CHANNELS.providersGetCredentials, sourceId),
    setCredentials: (sourceId, apiKey) => ipcRenderer.invoke(IPC_CHANNELS.providersSetCredentials, sourceId, apiKey),
  },
  models: {
    listEntries: () => ipcRenderer.invoke(IPC_CHANNELS.modelsListEntries),
    listEntriesBySource: (sourceId) => ipcRenderer.invoke(IPC_CHANNELS.modelsListEntriesBySource, sourceId),
    saveEntry: (draft) => ipcRenderer.invoke(IPC_CHANNELS.modelsSaveEntry, draft),
    deleteEntry: (entryId) => ipcRenderer.invoke(IPC_CHANNELS.modelsDeleteEntry, entryId),
    getEntry: (entryId) => ipcRenderer.invoke(IPC_CHANNELS.modelsGetEntry, entryId),
  },

  // ── Workspace (wired in Phase 5) ──────────────────────────
  workspace: {
    change: (path) => ipcRenderer.invoke(IPC_CHANNELS.workspaceChange, path),
    getSoul: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceGetSoul),
    pickFolder: () => ipcRenderer.invoke(IPC_CHANNELS.workspacePickFolder),
    openFolder: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceOpenFolder),
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
  git: {
    getSummary: () => ipcRenderer.invoke(IPC_CHANNELS.gitSummary),
    getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.gitStatus),
    listBranches: () => ipcRenderer.invoke(IPC_CHANNELS.gitListBranches),
    switchBranch: (branchName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.gitSwitchBranch, branchName),
    createAndSwitchBranch: (branchName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.gitCreateBranch, branchName),
    stageFiles: (paths: string[]) => ipcRenderer.invoke(IPC_CHANNELS.gitStageFiles, paths),
    unstageFiles: (paths: string[]) => ipcRenderer.invoke(IPC_CHANNELS.gitUnstageFiles, paths),
    commit: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitCommit, input),
    push: () => ipcRenderer.invoke(IPC_CHANNELS.gitPush),
    pull: () => ipcRenderer.invoke(IPC_CHANNELS.gitPull),
  },
  worker: {
    generateCommitMessage: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.workerGenerateCommitMessage, request),
    generateCommitPlan: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.workerGenerateCommitPlan, request),
  },

  ui: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.uiGetState),
    setDiffPanelOpen: (open: boolean) => ipcRenderer.invoke(IPC_CHANNELS.uiSetDiffPanelOpen, open),
    setRightPanelState: (partial) => ipcRenderer.invoke(IPC_CHANNELS.uiSetRightPanelState, partial),
  },
  window: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.windowGetState),
    getBounds: () => ipcRenderer.invoke(IPC_CHANNELS.windowGetBounds),
    setBounds: (bounds) => ipcRenderer.invoke(IPC_CHANNELS.windowSetBounds, bounds),
    minimize: () => ipcRenderer.send(IPC_CHANNELS.windowMinimize),
    toggleMaximize: () => ipcRenderer.invoke(IPC_CHANNELS.windowToggleMaximize),
    close: () => ipcRenderer.send(IPC_CHANNELS.windowClose),
    onStateChange: (listener: (state: WindowFrameState) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, state: WindowFrameState) => {
        listener(state);
      };
      ipcRenderer.on(IPC_CHANNELS.windowStateChanged, wrappedListener);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.windowStateChanged, wrappedListener); };
    },
  },
  quickInvoke: {
    onFocusComposer: (listener: () => void) => {
      const handler = () => listener();
      ipcRenderer.on("quick-invoke:focus-composer", handler);
      return () => { ipcRenderer.removeListener("quick-invoke:focus-composer", handler); };
    },
  },
};

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
