import type { RunKind } from "../../shared/contracts.js";

export type HarnessRunState =
  | "running"
  | "awaiting_confirmation"
  | "executing_tool"
  | "completed"
  | "aborted"
  | "failed";

export type HarnessRiskLevel = "safe" | "guarded" | "dangerous";

export type HarnessApprovalKind = "shell" | "file_write" | "mcp";

export type HarnessRunScope = {
  sessionId: string;
  runId: string;
};

export type HarnessPendingApproval = {
  kind: HarnessApprovalKind;
  payloadHash: string;
  reason: string;
  createdAt: number;
};

export type HarnessRunSnapshot = HarnessRunScope & {
  requestId: string;
  modelEntryId: string;
  runKind: RunKind;
  state: HarnessRunState;
  startedAt: number;
  endedAt?: number;
  currentStepId?: string;
  pendingApproval?: HarnessPendingApproval;
  cancelled: boolean;
};

export type HarnessPolicyDecision =
  | { type: "allow"; reason?: string }
  | { type: "confirm"; reason: string }
  | { type: "deny"; reason: string };

export type HarnessPolicyEvaluation = {
  toolName: string;
  riskLevel: HarnessRiskLevel;
  decision: HarnessPolicyDecision;
  normalizedArgs?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type HarnessAuditAction =
  | "run_created"
  | "run_state_changed"
  | "run_cancel_requested"
  | "run_completed"
  | "run_aborted"
  | "run_failed"
  | "tool_policy_evaluated";

export type HarnessAuditEvent = HarnessRunScope & {
  action: HarnessAuditAction;
  timestamp: number;
  state?: HarnessRunState;
  toolName?: string;
  decision?: HarnessPolicyDecision["type"];
  reason?: string;
  metadata?: Record<string, unknown>;
};
