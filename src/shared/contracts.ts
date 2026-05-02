import type { AgentEvent, ConfirmationResponse } from "./agent-events.js";
import type { MemoryEmbeddingModelId } from "./memory.js";
import type { ChelaPluginManifest } from "./plugins.js";
import type { ProviderErrorCode } from "./provider-errors.js";
import type { RunFailureKind } from "./run-recovery.js";

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
  skillUsages?: RuntimeSkillUsage[];
  runChangeSummary?: RunChangeSummary | null;
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

export type ModelRoutingRole = "chat" | "utility" | "subagent" | "compact";

export type ModelRoutingSettings = {
  chat: {
    modelId: string;
  };
  utility: {
    modelId: string | null;
  };
  subagent: {
    modelId: string | null;
  };
  compact: {
    modelId: string | null;
  };
};

export type ModelUsageConflict = {
  scope: "settings" | "unknown";
  referenceType:
  | "chat-model"
  | "utility-model"
  | "subagent-model"
  | "compact-model";
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
  errorCode?: ProviderErrorCode;
  error?: string;
  models?: string[];
};

export type SourceModelsResult = {
  success: boolean;
  errorCode?: ProviderErrorCode;
  error?: string;
  models: string[];
};

export type ThinkingLevel = "off" | "low" | "medium" | "high" | "xhigh";

export type ThemeVariableKey =
  | `--chela-${string}`
  | `--color-${string}`
  | `--terminal-ansi-${string}`
  | `--radius-${string}`
  | `--shadow-${string}`
  | `--motion-${string}`
  | "--background"
  | "--foreground"
  | "--card"
  | "--card-foreground"
  | "--popover"
  | "--popover-foreground"
  | "--primary"
  | "--primary-foreground"
  | "--secondary"
  | "--secondary-foreground"
  | "--muted"
  | "--muted-foreground"
  | "--accent"
  | "--accent-foreground"
  | "--destructive"
  | "--destructive-foreground"
  | "--border"
  | "--input"
  | "--ring";

export type CustomTheme = Partial<Record<ThemeVariableKey, string>>;

export type BuiltinTerminalShell =
  | "default"
  | "powershell"
  | "cmd"
  | "git-bash"
  | "wsl";

export type TerminalShellSetting = BuiltinTerminalShell | string;

export type Settings = {
  modelRouting: ModelRoutingSettings;
  defaultModelId?: string;
  workerModelId?: string | null;
  thinkingLevel: ThinkingLevel;
  timeZone: string;
  theme: "light" | "dark" | "custom";
  customTheme: CustomTheme | null;
  terminal: {
    shell: TerminalShellSetting;
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
  network: {
    proxy: {
      enabled: boolean;
      url: string;
      noProxy: string;
    };
    timeoutMs: number;
  };
  memory: {
    enabled: boolean;
    autoRetrieve: boolean;
    queryRewrite: boolean;
    searchCandidateLimit: number;
    similarityThreshold: number;
    autoSummarize: boolean;
    toolModelId: string | null;
    embeddingModelId: MemoryEmbeddingModelId;
    embeddingProviderId: string | null;
  };
  workspace: string;
};

export type MemoryMetadataPrimitive = string | number | boolean | null;
export type MemoryMetadataValue = MemoryMetadataPrimitive | string[];
export type MemoryMemdirStatus = "saved" | "duplicate" | "merged" | "conflict";
export type MemoryPipelineSource = "memory_save" | "auto_refresh" | "manual";

export type MemoryMetadata = {
  source?: string;
  tags?: string[];
  sessionId?: string;
  messageId?: string;
  topic?: string;
  memdirStatus?: MemoryMemdirStatus;
  pipelineSource?: MemoryPipelineSource;
  sourceRunId?: string;
  confidence?: number;
  matchedSummary?: string;
  reason?: string;
  conflictWith?: string;
  supersedes?: string;
  [key: string]: MemoryMetadataValue | undefined;
};

export type MemoryAddInput = {
  content: string;
  metadata?: MemoryMetadata | null;
};

export type MemoryRecord = {
  id: number;
  content: string;
  metadata: MemoryMetadata | null;
  createdAt: string;
  matchCount: number;
  feedbackScore: number;
  lastMatchedAt: string | null;
};

export type MemorySearchResult = MemoryRecord & {
  score: number;
  rankScore: number;
};

export type MemoryListSort =
  | "created_desc"
  | "last_matched_desc"
  | "match_count_desc"
  | "feedback_score_desc"
  | "confidence_desc";

export type MemoryListInput = {
  sort?: MemoryListSort;
  limit?: number;
  status?: MemoryMemdirStatus | "all";
  source?: string;
  topic?: string;
  minConfidence?: number;
};

export type MemoryStats = {
  totalMemories: number;
  vectorMemoryCount?: number;
  memdirMemoryCount?: number;
  totalMatches: number;
  indexedModelId: string | null;
  selectedModelId: MemoryEmbeddingModelId;
  candidateLimit: number;
  lastIndexedAt: string | null;
  lastRebuiltAt: string | null;
  lastAutoRefreshAt?: string | null;
  lastFailureReason?: string | null;
  vectorSyncStatus?: "synced" | "memdir_ahead" | "vector_ahead" | "unknown";
  workerState: "idle" | "starting" | "ready" | "error";
  dbPath: string;
  modelLoaded: boolean;
};

export type MemoryRebuildResult = {
  rebuiltCount: number;
  failedCount?: number;
  modelId: MemoryEmbeddingModelId;
  completedAt: string;
};

export type SoulFilesStatus = {
  soul: { exists: boolean; sizeBytes: number };
  user: { exists: boolean; sizeBytes: number };
  agents: { exists: boolean; sizeBytes: number };
  claude: { exists: boolean; sizeBytes: number };
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

export type SkillUsageSurface = "right-panel" | "chat";

export type SkillUsageTrigger = "manual" | "automatic";

export type SkillUsageTarget = {
  entryPointId: string;
  label: string;
  surface: SkillUsageSurface;
  trigger: SkillUsageTrigger;
};

export type RuntimeSkillUsage = SkillUsageTarget & {
  skillId: string;
  skillLabel: string;
};

export type RunChangeSummaryFile = {
  path: string;
  status: "modified" | "deleted" | "untracked";
  additions: number;
  deletions: number;
  changeKind: "added" | "updated" | "reverted";
  patch?: string;
  kind?: GitDiffFile["kind"];
  previewPath?: string;
};

export type RunChangeSummary = {
  fileCount: number;
  additions: number;
  deletions: number;
  files: RunChangeSummaryFile[];
};

export type CodeDiagnosticSeverity = "error" | "warning" | "suggestion" | "message";

export type CodeDiagnostic = {
  filePath: string;
  line: number;
  character: number;
  code: string;
  severity: CodeDiagnosticSeverity;
  message: string;
};

export type CodeSymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "variable"
  | "component"
  | "method";

export type CodeSymbolSummary = {
  name: string;
  kind: CodeSymbolKind;
  line: number;
  exported: boolean;
};

export type CodeImportSummary = {
  source: string;
  names: string[];
  line: number;
};

export type CodeExportSummary = {
  name: string;
  kind: string;
  line: number;
};

export type CodeInspectDetails = {
  path: string;
  language: "typescript" | "tsx" | "javascript" | "jsx" | "unknown";
  imports: CodeImportSummary[];
  exports: CodeExportSummary[];
  symbols: CodeSymbolSummary[];
  diagnostics: CodeDiagnostic[];
};

export type CodeDiagnosticsDetails = {
  mode: "auto" | "typescript";
  filesChecked: string[];
  diagnostics: CodeDiagnostic[];
  errorCount: number;
  warningCount: number;
};

export type McpServerStatus = {
  name: string;
  configured: boolean;
  disabled: boolean;
  connected: boolean;
  type: "stdio" | "streamable-http";
  status: "connected" | "connecting" | "disconnected" | "failed" | "disabled";
  command: string | null;
  args: string[];
  url: string | null;
  cwd: string | null;
  headerCount: number | null;
  toolCount: number | null;
  resourceCount: number | null;
  startedAt: number | null;
  updatedAt: number | null;
  lastError: string | null;
};

export type McpServerConfigDraft = {
  originalName?: string | null;
  name: string;
  type: "stdio" | "streamable-http";
  command: string;
  args: string[];
  env: Record<string, string> | null;
  envPassthrough: string[];
  cwd: string | null;
  url: string | null;
  bearerTokenEnvVar: string | null;
  headers: Record<string, string> | null;
  headersFromEnv: Record<string, string> | null;
  disabled: boolean;
};

export type PluginStatus = {
  id: string;
  name: string;
  version: string;
  description: string | null;
  directory: string;
  manifestPath: string;
  enabled: boolean;
  toolCount: number;
  mcpServerCount: number;
  uiPanelCount: number;
  workflowCount: number;
  manifest: ChelaPluginManifest;
};

export type PluginStatusError = {
  directory: string;
  manifestPath: string;
  message: string;
};

export type PluginStatusBundle = {
  rootDir: string;
  statePath: string;
  plugins: PluginStatus[];
  errors: PluginStatusError[];
};

export type InstalledSkillSource = "project" | "user";

export type InstalledSkillInstance = {
  source: InstalledSkillSource;
  rootPath: string;
  skillPath: string;
  skillFilePath: string | null;
  readmePath: string | null;
  installedAt: string | null;
  updatedAt: string | null;
  missingSkillFile: boolean;
};

export type InstalledSkillSummary = {
  id: string;
  displayName: string;
  description: string;
  usageTargets: SkillUsageTarget[];
  sources: InstalledSkillSource[];
  primarySource: InstalledSkillSource;
  instances: InstalledSkillInstance[];
  installable: boolean;
  installedAt: string | null;
  updatedAt: string | null;
};

export type InstalledSkillDetail = InstalledSkillSummary & {
  contentPreview: string | null;
};

export type SkillCatalogEntry = {
  id: string;
  packageName: string;
  displayName: string;
  description: string;
  installCommand: string;
  sourceLabel: string | null;
  learnMoreUrl: string | null;
};

export type SkillDiscoveryResult = {
  query: string;
  entries: SkillCatalogEntry[];
  error: string | null;
  rawOutput: string;
};

export type SkillInstallRequest = {
  packageName: string;
  target?: Extract<InstalledSkillSource, "user">;
};

export type SkillInstallResult = {
  ok: boolean;
  message: string;
  installedSkillId: string | null;
  installedSkill: InstalledSkillDetail | null;
  skills: InstalledSkillDetail[];
};

export type RunSource = "user" | "renderer" | "system" | "subagent";

export type RunKind = "chat" | "compact" | "memory_refresh" | "system" | "subagent";

// ── Trace Types ────────────────────────────────────────────────

export type TraceEventType =
  | "run_started"
  | "run_created"
  | "run_state_changed"
  | "run_cancel_requested"
  | "run_completed"
  | "run_aborted"
  | "run_failed"
  | "tool_started"
  | "tool_executing"
  | "tool_completed"
  | "tool_failed"
  | "tool_policy_evaluated"
  | "approval_requested"
  | "approval_resolved"
  | "message_user"
  | "message_assistant";

export type TraceNodeStatus = "pending" | "success" | "error" | "cancelled";

export type TraceNode = {
  id: string;
  runId: string;
  sessionId: string;
  type: TraceEventType;
  timestamp: number;
  parentId: string | null;
  children: TraceNode[];
  data: Record<string, unknown>;
  durationMs?: number;
  status?: TraceNodeStatus;
  label?: string;
};

export type TraceTree = {
  runId: string;
  sessionId: string;
  rootNodes: TraceNode[];
  startedAt: number;
  endedAt?: number;
  metadata?: Record<string, unknown>;
};

export type TraceRunSummary = {
  runId: string;
  sessionId: string;
  nodeCount: number;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  toolCallCount: number;
  errorCount: number;
};

export type ChatMessageMeta = Record<string, unknown> & {
  skillUsages?: RuntimeSkillUsage[];
  runChangeSummary?: RunChangeSummary | null;
  sendOrigin?: SendMessageOrigin;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  status: ChatMessageStatus;
  usage?: MessageUsage;
  meta?: ChatMessageMeta;
  steps?: AgentStep[];
};

export type AssistantMessage = ChatMessage;

export type SessionGroup = {
  id: string;
  name: string;
  path: string;
};

export type SessionGroupCreateInput = {
  name: string;
  path: string;
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
  queuedMessages?: QueuedMessage[];
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
    metadata?: Record<string, unknown>;
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
    timestamp: string;
    type: "memory_refresh";
    sourceRunId: string;
    status: "completed" | "skipped" | "failed";
    extractedCount: number;
    acceptedCount: number;
    savedCount: number;
    duplicateCount: number;
    mergedCount: number;
    conflictCount: number;
    vectorWrittenCount: number;
    vectorFailedCount: number;
    failureReason?: string;
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
    metadata?: Record<string, unknown>;
  }
  | {
    seq: number;
    sessionId: string;
    runId: string;
    timestamp: string;
    type: "run_recovery_requested";
    resumedRunId: string;
    recoveryStatus: "requested";
    recoveryPrompt: string;
    source: "interrupted_approval" | "context_recovery";
  };

export type AgentRunScope = {
  sessionId: string;
  runId: string;
};

export type PendingApprovalNotice = {
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

export type PendingApprovalGroup = {
  sessionId: string;
  ownerId: string;
  count: number;
  latestCreatedAt: number;
  approvals: PendingApprovalNotice[];
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

export type SendMessageOrigin = "user" | "guided" | "resume_interrupted_approval";

export type SendMessageInput = AgentRunScope & {
  text: string;
  attachments: SelectedFile[];
  modelEntryId?: string;
  origin?: SendMessageOrigin;
};

export type QueuedMessage = {
  id: string;
  text: string;
  createdAt: string;
  source?: "queued" | "guided";
};

export type SessionTodoStatus = "pending" | "in_progress" | "completed";

export type SessionTodoItem = {
  id: string;
  content: string;
  activeForm: string;
  status: SessionTodoStatus;
};

export type EnqueueQueuedMessageInput = {
  sessionId: string;
  text: string;
  source?: QueuedMessage["source"];
};

export type TriggerQueuedMessageInput = {
  sessionId: string;
  messageId: string;
  runId?: string | null;
};

export type RemoveQueuedMessageInput = {
  sessionId: string;
  messageId: string;
};

export type SessionSearchResult = {
  sessionId: string;
  title: string;
  snippet: string;
  updatedAt: string;
};

export type TrimSessionMessagesInput = {
  sessionId: string;
  messageId: string;
};

export type RightPanelView = "diff" | "trace";

export type RightPanelState = {
  open: boolean;
  activeView: RightPanelView;
  width: number | null;
};

export type WindowUiState = {
  diffPanelOpen: boolean;
  rightPanel: RightPanelState;
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
  compactedMessageCount: number;
  snapshotSummary: string | null;
  currentTask: string | null;
  currentState: string | null;
  branchName: string | null;
  importantFiles: string[];
  openLoops: string[];
  nextActions: string[];
  risks: string[];
  todos: SessionTodoItem[];
  lastToolFailure: { toolName: string; error: string } | null;
  recoverableRun: {
    runId: string;
    reason: string;
    failureKind: RunFailureKind;
    recoveryStatus: "recoverable" | "recovered" | "failed";
    recoveryPrompt: string;
  } | null;
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
  ahead?: number;
  behind?: number;
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

export type GitCommitInput = {
  message: string;
  paths: string[];
};

export type GenerateCommitMessageRequest = {
  selectedFiles: GitDiffFile[];
  diffContent?: string;
  branchName?: string | null;
  latestCommitSubject?: string | null;
};

export type GenerateCommitMessageResult = {
  title: string;
  description: string;
  usedModelRole: "utility" | "chat" | "subagent";
  fallbackUsed: boolean;
  skillName: "commit";
  skillUsage: RuntimeSkillUsage;
};

export type GenerateCommitPlanRequest = GenerateCommitMessageRequest;

export type CommitPlanGroup = {
  id: string;
  title: string;
  description: string;
  filePaths: string[];
  reason?: string;
};

export type GenerateCommitPlanResult = {
  groups: CommitPlanGroup[];
  usedModelRole: "utility" | "chat" | "subagent";
  fallbackUsed: boolean;
  skillName: "commit";
  skillUsage: RuntimeSkillUsage;
};

export type WindowFrameState = {
  isMaximized: boolean;
};

export type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
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
    search: (query: string, limit?: number) => Promise<SessionSearchResult[]>;
    reindexSearch: () => Promise<void>;
  };
  groups: {
    list: () => Promise<SessionGroup[]>;
    create: (input: SessionGroupCreateInput) => Promise<SessionGroup>;
    rename: (groupId: string, name: string) => Promise<void>;
    delete: (groupId: string) => Promise<void>;
  };
  chat: {
    /** Phase 0: returns mock reply. Phase 1+: returns void, response comes via agent.onEvent */
    send: (input: SendMessageInput) => Promise<AssistantMessage | void>;
    trimSessionMessages: (input: TrimSessionMessagesInput) => Promise<void>;
    enqueueQueuedMessage: (input: EnqueueQueuedMessageInput) => Promise<QueuedMessage>;
    triggerQueuedMessage: (input: TriggerQueuedMessageInput) => Promise<void>;
    removeQueuedMessage: (input: RemoveQueuedMessageInput) => Promise<void>;
  };
  context: {
    getSummary: (sessionId: string) => Promise<ContextSummary>;
    compact: (sessionId: string) => Promise<ContextSummary>;
  };
  agent: {
    onEvent: (callback: (event: AgentEvent) => void) => () => void;
    cancel: (scope: AgentRunScope) => Promise<void>;
    confirmResponse: (response: ConfirmationResponse) => Promise<void>;
    listPendingApprovalGroups: (
      sessionId?: string,
    ) => Promise<PendingApprovalGroup[]>;
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
  memory: {
    add: (input: MemoryAddInput) => Promise<MemoryRecord>;
    search: (query: string, limit?: number) => Promise<MemorySearchResult[]>;
    list: (input?: MemoryListInput) => Promise<MemoryRecord[]>;
    getStats: () => Promise<MemoryStats>;
    rebuild: () => Promise<MemoryRebuildResult>;
    delete: (memoryId: number) => Promise<boolean>;
    feedback: (memoryId: number, delta: number) => Promise<boolean>;
  };
  skills: {
    listInstalled: () => Promise<InstalledSkillDetail[]>;
    searchCatalog: (query: string) => Promise<SkillDiscoveryResult>;
    install: (request: SkillInstallRequest) => Promise<SkillInstallResult>;
    openDirectory: (
      skillId: string,
      source: InstalledSkillSource,
    ) => Promise<void>;
    openSkillFile: (
      skillId: string,
      source: InstalledSkillSource,
    ) => Promise<void>;
  };
  mcp: {
    listStatus: () => Promise<McpServerStatus[]>;
    reloadConfig: () => Promise<McpServerStatus[]>;
    restartServer: (serverName: string) => Promise<McpServerStatus[]>;
    disconnectServer: (serverName: string) => Promise<McpServerStatus[]>;
    openConfig: () => Promise<void>;
    saveServer: (draft: McpServerConfigDraft) => Promise<McpServerStatus[]>;
    deleteServer: (serverName: string) => Promise<McpServerStatus[]>;
  };
  plugins: {
    listStatus: () => Promise<PluginStatusBundle>;
    setEnabled: (pluginId: string, enabled: boolean) => Promise<PluginStatusBundle>;
    openRootDirectory: () => Promise<void>;
    openDirectory: (pluginId: string) => Promise<void>;
    openManifest: (pluginId: string) => Promise<void>;
  };
  providers: {
    listSources: () => Promise<ProviderSource[]>;
    getSource: (sourceId: string) => Promise<ProviderSource | null>;
    saveSource: (draft: ProviderSourceDraft) => Promise<ProviderSource>;
    deleteSource: (sourceId: string) => Promise<void>;
    testSource: (draft: ProviderSourceDraft) => Promise<SourceTestResult>;
    fetchModels: (draft: ProviderSourceDraft) => Promise<SourceModelsResult>;
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
    stageFiles: (paths: string[]) => Promise<void>;
    unstageFiles: (paths: string[]) => Promise<void>;
    commit: (input: GitCommitInput) => Promise<void>;
    push: () => Promise<void>;
    pull: () => Promise<void>;
  };
  worker: {
    generateCommitMessage: (
      request: GenerateCommitMessageRequest,
    ) => Promise<GenerateCommitMessageResult>;
    generateCommitPlan: (
      request: GenerateCommitPlanRequest,
    ) => Promise<GenerateCommitPlanResult>;
  };
  ui: {
    getState: () => Promise<WindowUiState>;
    setDiffPanelOpen: (open: boolean) => Promise<void>;
    setRightPanelState: (partial: Partial<RightPanelState>) => Promise<void>;
  };
  window: {
    getState: () => Promise<WindowFrameState>;
    getBounds: () => Promise<WindowBounds>;
    setBounds: (bounds: WindowBounds) => Promise<WindowBounds>;
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
