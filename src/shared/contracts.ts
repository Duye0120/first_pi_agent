import type { AgentEvent, ConfirmationResponse } from "./agent-events.js";

export type ChatRole = "user" | "assistant" | "system";
export type ChatMessageStatus = "idle" | "streaming" | "done" | "error";
export type FileKind = "text" | "image" | "binary" | "unknown";

// ── Agent Step Types (persisted with messages) ─────────────────

export type StepStatus = "executing" | "success" | "error" | "cancelled";

export type AgentStep = {
  id: string;
  kind: "thinking" | "tool_call";
  status: StepStatus;
  startedAt: number;
  endedAt?: number;

  // thinking
  thinkingText?: string;

  // tool_call
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  toolError?: string;

  // shell_exec streaming output
  streamOutput?: string;

  // parallel sub-steps
  children?: AgentStep[];
};

export type AgentResponseStatus = "running" | "completed" | "error" | "cancelled";

export type AgentResponse = {
  id: string;
  status: AgentResponseStatus;
  steps: AgentStep[];
  finalText: string;
  startedAt: number;
  endedAt?: number;
  usage?: MessageUsage;
  totalTokens?: number;
  cost?: number;
};

// ── Settings & Providers ───────────────────────────────────────

export type ProviderType =
  | "anthropic"
  | "openai"
  | "google"
  | "openai-compatible";

export type ProviderSourceKind = "builtin" | "custom";
export type ProviderSourceMode = "native" | "custom";

export type ModelCapabilities = {
  vision: boolean | null;
  imageOutput: boolean | null;
  toolCalling: boolean | null;
  reasoning: boolean | null;
  embedding: boolean | null;
};

export type ModelCapabilitiesOverride = ModelCapabilities;

export type ModelLimits = {
  contextWindow: number | null;
  maxOutputTokens: number | null;
};

export type ModelLimitsOverride = ModelLimits;

export type ProviderSource = {
  id: string;
  name: string;
  kind: ProviderSourceKind;
  providerType: ProviderType;
  mode: ProviderSourceMode;
  enabled: boolean;
  baseUrl: string | null;
};

export type ProviderSourceDraft = {
  id?: string;
  name: string;
  providerType: ProviderType;
  mode: ProviderSourceMode;
  enabled: boolean;
  baseUrl?: string | null;
};

export type ModelEntry = {
  id: string;
  sourceId: string;
  name: string;
  modelId: string;
  enabled: boolean;
  builtin: boolean;
  capabilities: ModelCapabilitiesOverride;
  limits: ModelLimitsOverride;
  providerOptions: Record<string, unknown> | null;
  detectedCapabilities: ModelCapabilities;
  detectedLimits: ModelLimits;
};

export type ModelEntryDraft = {
  id?: string;
  sourceId: string;
  name: string;
  modelId: string;
  enabled: boolean;
  builtin?: boolean;
  capabilities?: ModelCapabilitiesOverride;
  limits?: ModelLimitsOverride;
  providerOptions?: Record<string, unknown> | null;
};

export type ModelUsageConflict = {
  scope: "settings" | "unknown";
  referenceType: "default-model";
  referenceId: string;
  message: string;
};

export type SourceCredentials = {
  sourceId: string;
  masked: string;
  hasKey: boolean;
};

export type SourceTestResult = {
  success: boolean;
  error?: string;
  models?: string[];
};

export type ThinkingLevel = "off" | "low" | "medium" | "high" | "xhigh";

export type Settings = {
  defaultModelId: string;
  thinkingLevel: ThinkingLevel;
  timeZone: string;
  theme: "light" | "dark" | "custom";
  customTheme: Record<string, string> | null;
  terminal: {
    shell: string;
    fontSize: number;
    fontFamily: string;
    scrollback: number;
  };
  ui: {
    fontFamily: string;
    fontSize: number;
    codeFontSize: number;
    codeFontFamily: string;
  };
  workspace: string;
};

export type SoulFilesStatus = {
  soul: { exists: boolean; sizeBytes: number };
  user: { exists: boolean; sizeBytes: number };
  agents: { exists: boolean; sizeBytes: number };
};

export type SelectedFile = {
  id: string;
  name: string;
  path: string;
  size: number;
  extension: string;
  kind: FileKind;
  mimeType?: string;
  previewText?: string;
  truncated?: boolean;
  error?: string;
};

export type FilePreviewResult = {
  path: string;
  previewText?: string;
  truncated: boolean;
  error?: string;
};

export type ClipboardFilePayload = {
  name?: string;
  mimeType?: string;
  buffer: ArrayBuffer;
};

export type MessageUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type DiagnosticLogId = "app" | "audit";

export type DiagnosticLogSnapshot = {
  id: DiagnosticLogId;
  label: string;
  path: string;
  exists: boolean;
  sizeBytes: number;
  updatedAt: string | null;
  tail: string;
  lineCount: number;
};

export type DiagnosticLogBundle = {
  generatedAt: string;
  files: DiagnosticLogSnapshot[];
};

export type RunSource = "user" | "renderer" | "system" | "subagent";

export type RunKind = "chat" | "compact" | "memory_refresh" | "system" | "subagent";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  status: ChatMessageStatus;
  usage?: MessageUsage;
  meta?: Record<string, unknown>;
  steps?: AgentStep[];
};

export type AssistantMessage = ChatMessage;

export type SessionGroup = {
  id: string;
  name: string;
};

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  attachments: SelectedFile[];
  draft: string;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  groupId?: string;
  pinned?: boolean;
};

export type ChatSessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  archived?: boolean;
  groupId?: string;
  pinned?: boolean;
  lastRunState?: AgentResponseStatus | "awaiting_confirmation" | "running";
};

export type SessionMemorySnapshot = {
  version: 1;
  sessionId: string;
  revision: number;
  updatedAt: string;
  compactedUntilSeq: number;
  summary: string;
  currentTask: string | null;
  currentState: string | null;
  decisions: string[];
  importantFiles: string[];
  importantAttachments: {
    id: string;
    name: string;
    path: string;
    kind: string;
  }[];
  openLoops: string[];
  nextActions: string[];
  risks: string[];
  errors: string[];
  learnings: string[];
  workspace: {
    branchName: string | null;
    modelEntryId: string | null;
    thinkingLevel: string | null;
  };
  sourceRunIds: string[];
  sourceMessageIds: string[];
};

export type SessionTranscriptEvent =
  | {
      seq: number;
      sessionId: string;
      timestamp: string;
      type: "user_message";
      message: ChatMessage;
    }
  | {
      seq: number;
      sessionId: string;
      runId: string;
      ownerId?: string;
      timestamp: string;
      type: "run_started";
      runKind: RunKind;
      modelEntryId: string;
      thinkingLevel: string;
    }
  | {
      seq: number;
      sessionId: string;
      runId: string;
      timestamp: string;
      type: "run_state_changed";
      state: string;
      reason?: string;
      currentStepId?: string;
    }
  | {
      seq: number;
      sessionId: string;
      runId: string;
      timestamp: string;
      type: "tool_started";
      stepId: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  | {
      seq: number;
      sessionId: string;
      runId: string;
      timestamp: string;
      type: "tool_finished";
      stepId: string;
      toolName: string;
      result?: unknown;
      error?: string;
    }
  | {
      seq: number;
      sessionId: string;
      runId: string;
      timestamp: string;
      type: "confirmation_requested";
      requestId: string;
      title: string;
      description: string;
      detail?: string;
    }
  | {
      seq: number;
      sessionId: string;
      runId: string;
      timestamp: string;
      type: "confirmation_resolved";
      requestId: string;
      allowed: boolean;
    }
  | {
      seq: number;
      sessionId: string;
      runId: string;
      timestamp: string;
      type: "assistant_message";
      message: ChatMessage;
    }
  | {
      seq: number;
      sessionId: string;
      runId: string;
      timestamp: string;
      type: "compact_applied";
      snapshotRevision: number;
      compactedUntilSeq: number;
      reason: "manual" | "auto";
    }
  | {
      seq: number;
      sessionId: string;
      runId: string;
      ownerId?: string;
      timestamp: string;
      type: "run_finished";
      finalState: "completed" | "aborted" | "failed";
      reason?: string;
    };

export type AgentRunScope = {
  sessionId: string;
  runId: string;
};

export type InterruptedApprovalNotice = {
  sessionId: string;
  runId: string;
  ownerId: string;
  modelEntryId: string | null;
  runKind: RunKind | null;
  runSource: RunSource | null;
  lane: "foreground" | "background" | null;
  state:
    | "running"
    | "awaiting_confirmation"
    | "executing_tool"
    | "completed"
    | "aborted"
    | "failed"
    | null;
  startedAt: number | null;
  currentStepId: string | null;
  canResume: boolean;
  recoveryStatus: "interrupted";
  recoveryPrompt: string;
  interruptedAt: number;
  approval: {
    requestId: string;
    kind: "shell" | "file_write" | "mcp";
    payloadHash: string;
    reason: string;
    createdAt: number;
    title: string;
    description: string;
    detail?: string;
  };
};

export type InterruptedApprovalGroup = {
  sessionId: string;
  ownerId: string;
  count: number;
  latestInterruptedAt: number;
  approvals: InterruptedApprovalNotice[];
};

export type SendMessageInput = AgentRunScope & {
  text: string;
  attachments: SelectedFile[];
};

export type TrimSessionMessagesInput = {
  sessionId: string;
  messageId: string;
};

export type WindowUiState = {
  diffPanelOpen: boolean;
};

export type ContextSummary = {
  state: "ready" | "window-only" | "usage-only" | "unknown";
  contextWindow: number | null;
  latestInputTokens: number | null;
  latestOutputTokens: number | null;
  usageMessageCount: number;
  usageTotalInputTokens: number;
  usageTotalOutputTokens: number;
  estimatedUsedTokens: number | null;
  estimatedRemainingTokens: number | null;
  usedRatio: number | null;
  remainingRatio: number | null;
  snapshotRevision: number;
  snapshotUpdatedAt: string | null;
  compactedUntilSeq: number | null;
  snapshotSummary: string | null;
  currentTask: string | null;
  currentState: string | null;
  branchName: string | null;
  importantFiles: string[];
  openLoops: string[];
  nextActions: string[];
  risks: string[];
  autoCompactFailureCount: number;
  autoCompactBlocked: boolean;
  autoCompactBlockedAt: string | null;
  canCompact: boolean;
  isCompacting: boolean;
};

export type GitBranchSummary = {
  branchName: string | null;
  isDetached: boolean;
  hasChanges: boolean;
};

export type GitBranchEntry = {
  name: string;
  isCurrent: boolean;
};

export type GitDiffSource = "unstaged" | "staged" | "all";

export type GitDiffFile = {
  path: string;
  status: "modified" | "deleted" | "untracked";
  patch: string;
  kind: "text" | "image" | "binary";
  additions: number;
  deletions: number;
  previewPath?: string;
};

export type GitDiffSourceSnapshot = {
  files: GitDiffFile[];
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
};

export type GitDiffOverview = {
  isGitRepo: boolean;
  generatedAt: number;
  branch: GitBranchSummary;
  sources: Record<GitDiffSource, GitDiffSourceSnapshot>;
};

export type GitDiffSnapshot = GitDiffOverview;

export type WindowFrameState = {
  isMaximized: boolean;
};

export type PersistedAppState = {
  sessions: ChatSession[];
  ui: WindowUiState;
};

export type DesktopApi = {
  files: {
    pick: () => Promise<SelectedFile[]>;
    readPreview: (filePath: string) => Promise<FilePreviewResult>;
    readImageDataUrl: (filePath: string) => Promise<string | null>;
    saveFromClipboard: (
      payload: ClipboardFilePayload,
    ) => Promise<SelectedFile>;
  };
  sessions: {
    list: () => Promise<ChatSessionSummary[]>;
    load: (sessionId: string) => Promise<ChatSession | null>;
    save: (session: ChatSession) => Promise<void>;
    create: () => Promise<ChatSession>;
    archive: (sessionId: string) => Promise<void>;
    unarchive: (sessionId: string) => Promise<void>;
    listArchived: () => Promise<ChatSessionSummary[]>;
    delete: (sessionId: string) => Promise<void>;
    setGroup: (sessionId: string, groupId: string | null) => Promise<void>;
    rename: (sessionId: string, title: string) => Promise<void>;
    setPinned: (sessionId: string, pinned: boolean) => Promise<void>;
  };
  groups: {
    list: () => Promise<SessionGroup[]>;
    create: (name: string) => Promise<SessionGroup>;
    rename: (groupId: string, name: string) => Promise<void>;
    delete: (groupId: string) => Promise<void>;
  };
  chat: {
    /** Phase 0: returns mock reply. Phase 1+: returns void, response comes via agent.onEvent */
    send: (input: SendMessageInput) => Promise<AssistantMessage | void>;
    trimSessionMessages: (input: TrimSessionMessagesInput) => Promise<void>;
  };
  context: {
    getSummary: (sessionId: string) => Promise<ContextSummary>;
    compact: (sessionId: string) => Promise<ContextSummary>;
  };
  agent: {
    onEvent: (callback: (event: AgentEvent) => void) => () => void;
    cancel: (scope: AgentRunScope) => Promise<void>;
    confirmResponse: (response: ConfirmationResponse) => Promise<void>;
    listInterruptedApprovals: (
      sessionId?: string,
    ) => Promise<InterruptedApprovalNotice[]>;
    listInterruptedApprovalGroups: (
      sessionId?: string,
    ) => Promise<InterruptedApprovalGroup[]>;
    dismissInterruptedApproval: (runId: string) => Promise<boolean>;
    resumeInterruptedApproval: (runId: string) => Promise<string>;
  };
  settings: {
    get: () => Promise<Settings>;
    update: (partial: Partial<Settings>) => Promise<void>;
    getLogSnapshot: () => Promise<DiagnosticLogBundle>;
    openLogFolder: (logId: DiagnosticLogId) => Promise<void>;
  };
  providers: {
    listSources: () => Promise<ProviderSource[]>;
    getSource: (sourceId: string) => Promise<ProviderSource | null>;
    saveSource: (draft: ProviderSourceDraft) => Promise<ProviderSource>;
    deleteSource: (sourceId: string) => Promise<void>;
    testSource: (draft: ProviderSourceDraft) => Promise<SourceTestResult>;
    getCredentials: (sourceId: string) => Promise<SourceCredentials>;
    setCredentials: (sourceId: string, apiKey: string) => Promise<void>;
  };
  models: {
    listEntries: () => Promise<ModelEntry[]>;
    listEntriesBySource: (sourceId: string) => Promise<ModelEntry[]>;
    saveEntry: (draft: ModelEntryDraft) => Promise<ModelEntry>;
    deleteEntry: (entryId: string) => Promise<void>;
    getEntry: (entryId: string) => Promise<ModelEntry | null>;
  };
  workspace: {
    change: (path: string) => Promise<void>;
    getSoul: () => Promise<SoulFilesStatus>;
    pickFolder: () => Promise<string | null>;
    openFolder: () => Promise<void>;
  };
  terminal: {
    create: (options?: { cwd?: string }) => Promise<string>;
    write: (terminalId: string, data: string) => Promise<void>;
    resize: (terminalId: string, cols: number, rows: number) => Promise<void>;
    destroy: (terminalId: string) => Promise<void>;
    onData: (callback: (terminalId: string, data: string) => void) => () => void;
    onExit: (callback: (terminalId: string, exitCode: number) => void) => () => void;
  };
  git: {
    getSummary: () => Promise<GitBranchSummary>;
    getSnapshot: () => Promise<GitDiffOverview>;
    listBranches: () => Promise<GitBranchEntry[]>;
    switchBranch: (branchName: string) => Promise<void>;
    createAndSwitchBranch: (branchName: string) => Promise<void>;
  };
  ui: {
    getState: () => Promise<WindowUiState>;
    setDiffPanelOpen: (open: boolean) => Promise<void>;
  };
  window: {
    getState: () => Promise<WindowFrameState>;
    minimize: () => void;
    toggleMaximize: () => Promise<WindowFrameState>;
    close: () => void;
    onStateChange: (listener: (state: WindowFrameState) => void) => () => void;
  };
  quickInvoke: {
    onFocusComposer: (listener: () => void) => () => void;
  };
};

export function createEmptySession(): ChatSession {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: "新的工作线程",
    messages: [],
    attachments: [],
    draft: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function summarizeSession(session: ChatSession): ChatSessionSummary {
  return {
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
    archived: session.archived,
    groupId: session.groupId,
    pinned: session.pinned,
  };
}
