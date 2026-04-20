import type { RunChangeSummary } from "./contracts.js";

// ── Agent Event Types ──────────────────────────────────────────
// Discriminated union of all events emitted by the agent engine
// via IPC to the renderer. Maps 1:1 with pi-agent-core's subscribe events.

export type AgentEvent =
  | AgentStartEvent
  | AgentEndEvent
  | RunStateChangedEvent
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

export interface AgentEventScope {
  sessionId: string;
  runId: string;
}

// ── Lifecycle ──────────────────────────────────────────────────

export interface AgentStartEvent extends AgentEventScope {
  type: "agent_start";
  timestamp: number;
}

export interface RunStateChangedEvent extends AgentEventScope {
  type: "run_state_changed";
  state: string;
  reason?: string;
  currentStepId?: string;
  timestamp: number;
}

export interface AgentEndEvent extends AgentEventScope {
  type: "agent_end";
  timestamp: number;
  totalTokens?: number;
  cost?: number;
  runChangeSummary?: RunChangeSummary | null;
}

export interface TurnStartEvent extends AgentEventScope {
  type: "turn_start";
  turnIndex: number;
  timestamp: number;
}

export interface TurnEndEvent extends AgentEventScope {
  type: "turn_end";
  turnIndex: number;
  timestamp: number;
}

export interface MessageStartEvent extends AgentEventScope {
  type: "message_start";
  role: "assistant";
  timestamp: number;
}

export interface MessageEndEvent extends AgentEventScope {
  type: "message_end";
  usage?: { inputTokens: number; outputTokens: number };
  cost?: number;
  finalText?: string;
  finalThinking?: string;
  timestamp: number;
}

// ── Streaming Content ──────────────────────────────────────────

export interface ThinkingDeltaEvent extends AgentEventScope {
  type: "thinking_delta";
  delta: string;
  timestamp: number;
}

export interface TextDeltaEvent extends AgentEventScope {
  type: "text_delta";
  delta: string;
  timestamp: number;
}

// ── Tool Execution ─────────────────────────────────────────────

export interface ToolExecutionStartEvent extends AgentEventScope {
  type: "tool_execution_start";
  stepId: string;
  toolName: string;
  args: Record<string, unknown>;
  timestamp: number;
}

export interface ToolExecutionUpdateEvent extends AgentEventScope {
  type: "tool_execution_update";
  stepId: string;
  output: string;
  stream?: "stdout" | "stderr";
  timestamp: number;
}

export interface ToolExecutionEndEvent extends AgentEventScope {
  type: "tool_execution_end";
  stepId: string;
  result?: unknown;
  error?: string;
  durationMs: number;
  timestamp: number;
}

// ── Error ──────────────────────────────────────────────────────

export interface AgentErrorEvent extends AgentEventScope {
  type: "agent_error";
  message: string;
  code?: string;
  timestamp: number;
}

// ── Confirmation (Main → Renderer → Main) ──────────────────────

export interface ConfirmationRequestEvent extends AgentEventScope {
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
