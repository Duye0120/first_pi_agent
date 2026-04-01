export const IPC_CHANNELS = {
  // Files
  filesPick: "files:pick",
  filesReadPreview: "files:read-preview",

  // Sessions
  sessionsList: "sessions:list",
  sessionsLoad: "sessions:load",
  sessionsSave: "sessions:save",
  sessionsCreate: "sessions:create",

  // Chat
  chatSend: "chat:send",

  // Agent events (main → renderer push)
  agentEvent: "agent:event",
  agentCancel: "agent:cancel",
  agentConfirmRequest: "agent:confirm-request",
  agentConfirmResponse: "agent:confirm-response",

  // Settings
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",

  // Credentials
  credentialsGet: "credentials:get",
  credentialsSet: "credentials:set",
  credentialsTest: "credentials:test",
  credentialsDelete: "credentials:delete",

  // Models
  modelsListAvailable: "models:list-available",

  // Workspace
  workspaceChange: "workspace:change",
  workspaceGetSoul: "workspace:get-soul",

  // Terminal (main ↔ renderer)
  terminalCreate: "terminal:create",
  terminalWrite: "terminal:write",
  terminalResize: "terminal:resize",
  terminalDestroy: "terminal:destroy",
  terminalData: "terminal:data",
  terminalExit: "terminal:exit",

  // Git (for diff panel)
  gitStageFile: "git:stage-file",
  gitStageHunk: "git:stage-hunk",
  gitRevertFile: "git:revert-file",
  gitRevertHunk: "git:revert-hunk",
  gitStatus: "git:status",

  // UI
  uiGetState: "ui:get-state",
  uiSetRightPanelOpen: "ui:set-right-panel-open",

  // Window
  windowGetState: "window:get-state",
  windowMinimize: "window:minimize",
  windowToggleMaximize: "window:toggle-maximize",
  windowClose: "window:close",
  windowStateChanged: "window:state-changed",
} as const;
