export const IPC_CHANNELS = {
  // Files
  filesPick: "files:pick",
  filesReadPreview: "files:read-preview",
  filesReadImageDataUrl: "files:read-image-data-url",
  filesSaveFromClipboard: "files:save-from-clipboard",

  // Sessions
  sessionsList: "sessions:list",
  sessionsLoad: "sessions:load",
  sessionsSave: "sessions:save",
  sessionsCreate: "sessions:create",
  sessionsArchive: "sessions:archive",
  sessionsUnarchive: "sessions:unarchive",
  sessionsListArchived: "sessions:list-archived",
  sessionsDelete: "sessions:delete",
  sessionsSetGroup: "sessions:set-group",
  sessionsRename: "sessions:rename",
  sessionsSetPinned: "sessions:set-pinned",

  // Groups
  groupsList: "groups:list",
  groupsCreate: "groups:create",
  groupsRename: "groups:rename",
  groupsDelete: "groups:delete",

  // Chat
  chatSend: "chat:send",
  chatTrimSessionMessages: "chat:trim-session-messages",
  contextGetSummary: "context:get-summary",
  contextCompact: "context:compact",

  // Agent events (main → renderer push)
  agentEvent: "agent:event",
  agentCancel: "agent:cancel",
  agentConfirmRequest: "agent:confirm-request",
  agentConfirmResponse: "agent:confirm-response",
  agentListPendingApprovalGroups: "agent:list-pending-approval-groups",
  agentListInterruptedApprovals: "agent:list-interrupted-approvals",
  agentListInterruptedApprovalGroups: "agent:list-interrupted-approval-groups",
  agentDismissInterruptedApproval: "agent:dismiss-interrupted-approval",
  agentResumeInterruptedApproval: "agent:resume-interrupted-approval",

  // Settings
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  settingsGetLogSnapshot: "settings:get-log-snapshot",
  settingsOpenLogFolder: "settings:open-log-folder",

  // Providers
  providersListSources: "providers:list-sources",
  providersGetSource: "providers:get-source",
  providersSaveSource: "providers:save-source",
  providersDeleteSource: "providers:delete-source",
  providersTestSource: "providers:test-source",
  providersGetCredentials: "providers:get-credentials",
  providersSetCredentials: "providers:set-credentials",

  // Models
  modelsListEntries: "models:list-entries",
  modelsListEntriesBySource: "models:list-entries-by-source",
  modelsSaveEntry: "models:save-entry",
  modelsDeleteEntry: "models:delete-entry",
  modelsGetEntry: "models:get-entry",

  // Workspace
  workspaceChange: "workspace:change",
  workspaceGetSoul: "workspace:get-soul",
  workspacePickFolder: "workspace:pick-folder",
  workspaceOpenFolder: "workspace:open-folder",

  // Terminal (main ↔ renderer)
  terminalCreate: "terminal:create",
  terminalWrite: "terminal:write",
  terminalResize: "terminal:resize",
  terminalDestroy: "terminal:destroy",
  terminalData: "terminal:data",
  terminalExit: "terminal:exit",

  // Git (for diff panel)
  gitStageFile: "git:stage-file",
  gitStageFiles: "git:stage-files",
  gitUnstageFiles: "git:unstage-files",
  gitCommit: "git:commit",
  gitPush: "git:push",
  gitStageHunk: "git:stage-hunk",
  gitRevertFile: "git:revert-file",
  gitRevertHunk: "git:revert-hunk",
  gitSummary: "git:summary",
  gitStatus: "git:status",
  gitListBranches: "git:list-branches",
  gitSwitchBranch: "git:switch-branch",
  gitCreateBranch: "git:create-branch",

  // UI
  uiGetState: "ui:get-state",
  uiSetDiffPanelOpen: "ui:set-diff-panel-open",

  // Window
  windowGetState: "window:get-state",
  windowMinimize: "window:minimize",
  windowToggleMaximize: "window:toggle-maximize",
  windowClose: "window:close",
  windowStateChanged: "window:state-changed",
} as const;
