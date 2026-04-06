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
};

export type ChatSessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  archived?: boolean;
  groupId?: string;
};

export type AgentRunScope = {
  sessionId: string;
  runId: string;
};

export type SendMessageInput = AgentRunScope & {
  text: string;
  attachments: SelectedFile[];
};

export type WindowUiState = {
  diffPanelOpen: boolean;
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
  };
  agent: {
    onEvent: (callback: (event: AgentEvent) => void) => () => void;
    cancel: (scope: AgentRunScope) => Promise<void>;
    confirmResponse: (response: ConfirmationResponse) => Promise<void>;
  };
  settings: {
    get: () => Promise<Settings>;
    update: (partial: Partial<Settings>) => Promise<void>;
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
  };
}
