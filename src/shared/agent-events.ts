// ── Agent Event Types ──────────────────────────────────────────
// Discriminated union of all events emitted by the agent engine
// via IPC to the renderer. Maps 1:1 with pi-agent-core's subscribe events.

export type AgentEvent =
  | AgentStartEvent
  | AgentEndEvent
  | TurnStartEvent
  | TurnEndEvent
  | MessageStartEvent
  | MessageEndEvent
  | ThinkingDeltaEvent
  | TextDeltaEvent
  | ToolExecutionStartEvent
  | ToolExecutionUpdateEvent
  | ToolExecutionEndEvent
  | AgentErrorEvent
  | ConfirmationRequestEvent;

// ── Lifecycle ──────────────────────────────────────────────────

export interface AgentStartEvent {
  type: "agent_start";
  sessionId: string;
  timestamp: number;
}

export interface AgentEndEvent {
  type: "agent_end";
  sessionId: string;
  timestamp: number;
  totalTokens?: number;
  cost?: number;
}

export interface TurnStartEvent {
  type: "turn_start";
  turnIndex: number;
  timestamp: number;
}

export interface TurnEndEvent {
  type: "turn_end";
  turnIndex: number;
  timestamp: number;
}

export interface MessageStartEvent {
  type: "message_start";
  role: "assistant";
  timestamp: number;
}

export interface MessageEndEvent {
  type: "message_end";
  usage?: { inputTokens: number; outputTokens: number };
  cost?: number;
  timestamp: number;
}

// ── Streaming Content ──────────────────────────────────────────

export interface ThinkingDeltaEvent {
  type: "thinking_delta";
  delta: string;
  timestamp: number;
}

export interface TextDeltaEvent {
  type: "text_delta";
  delta: string;
  timestamp: number;
}

// ── Tool Execution ─────────────────────────────────────────────

export interface ToolExecutionStartEvent {
  type: "tool_execution_start";
  stepId: string;
  toolName: string;
  args: Record<string, unknown>;
  timestamp: number;
}

export interface ToolExecutionUpdateEvent {
  type: "tool_execution_update";
  stepId: string;
  output: string;
  stream?: "stdout" | "stderr";
  timestamp: number;
}

export interface ToolExecutionEndEvent {
  type: "tool_execution_end";
  stepId: string;
  result?: unknown;
  error?: string;
  durationMs: number;
  timestamp: number;
}

// ── Error ──────────────────────────────────────────────────────

export interface AgentErrorEvent {
  type: "agent_error";
  message: string;
  code?: string;
  timestamp: number;
}

// ── Confirmation (Main → Renderer → Main) ──────────────────────

export interface ConfirmationRequestEvent {
  type: "confirmation_request";
  requestId: string;
  title: string;
  description: string;
  detail?: string;
  allowRemember?: boolean;
  timestamp: number;
}

export interface ConfirmationResponse {
  requestId: string;
  allowed: boolean;
  remember?: boolean;
}
