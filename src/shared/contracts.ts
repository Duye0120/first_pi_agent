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
  totalTokens?: number;
  cost?: number;
};

// ── Settings & Credentials ─────────────────────────────────────

export type ModelSelection = {
  provider: string;
  model: string;
};

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type Settings = {
  defaultModel: ModelSelection;
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
    fontSize: number;
    codeFontSize: number;
    codeFontFamily: string;
  };
  workspace: string;
};

export type CredentialsSafe = {
  [provider: string]: {
    masked: string;
    hasKey: boolean;
  };
};

export type AvailableModel = {
  provider: string;
  model: string;
  label: string;
  available: boolean;
};

export type CredentialTestResult = {
  success: boolean;
  error?: string;
  models?: string[];
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

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  status: ChatMessageStatus;
  meta?: Record<string, unknown>;
  steps?: AgentStep[];
};

export type AssistantMessage = ChatMessage;

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  attachments: SelectedFile[];
  draft: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatSessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

export type SendMessageInput = {
  sessionId: string;
  text: string;
  attachmentIds: string[];
};

export type WindowUiState = {
  rightPanelOpen: boolean;
};

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
  };
  sessions: {
    list: () => Promise<ChatSessionSummary[]>;
    load: (sessionId: string) => Promise<ChatSession | null>;
    save: (session: ChatSession) => Promise<void>;
    create: () => Promise<ChatSession>;
  };
  chat: {
    /** Phase 0: returns mock reply. Phase 1+: returns void, response comes via agent.onEvent */
    send: (input: SendMessageInput) => Promise<AssistantMessage | void>;
  };
  agent: {
    onEvent: (callback: (event: AgentEvent) => void) => () => void;
    cancel: () => Promise<void>;
    confirmResponse: (response: ConfirmationResponse) => Promise<void>;
  };
  settings: {
    get: () => Promise<Settings>;
    update: (partial: Partial<Settings>) => Promise<void>;
  };
  credentials: {
    get: () => Promise<CredentialsSafe>;
    set: (provider: string, apiKey: string) => Promise<void>;
    test: (provider: string, apiKey: string) => Promise<CredentialTestResult>;
    delete: (provider: string) => Promise<void>;
  };
  models: {
    listAvailable: () => Promise<AvailableModel[]>;
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
  ui: {
    getState: () => Promise<WindowUiState>;
    setRightPanelOpen: (open: boolean) => Promise<void>;
  };
  window: {
    getState: () => Promise<WindowFrameState>;
    minimize: () => void;
    toggleMaximize: () => void;
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
  };
}
