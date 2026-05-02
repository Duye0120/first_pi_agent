import { randomUUID } from "node:crypto";
import type {
  ChatMessage,
  RunKind,
  SelectedFile,
  SendMessageOrigin,
  SessionTranscriptEvent,
} from "../../shared/contracts.js";
import { appendLine } from "./io.js";
import {
  readMeta,
  updateIndexWithMeta,
  updateMeta,
  writeMeta,
  type PersistedSessionMeta,
} from "./meta.js";
import { getTranscriptPath } from "./paths.js";
import { loadTranscript } from "./transcript.js";
import { withSessionWriteLock } from "./write-lock.js";

function deriveSessionTitle(text: string, attachments: SelectedFile[]) {
  const trimmed = text.trim();
  if (trimmed) {
    return trimmed.slice(0, 24);
  }

  if (attachments.length > 0) {
    return `附件会话 · ${attachments[0]?.name ?? "未命名附件"}`;
  }

  return "新的工作线程";
}

export function appendTranscriptEvent(
  sessionId: string,
  buildEvent: (
    nextSeq: number,
    meta: PersistedSessionMeta,
  ) => SessionTranscriptEvent,
): SessionTranscriptEvent {
  return withSessionWriteLock(sessionId, () => {
    const meta = readMeta(sessionId);
    if (!meta) {
      throw new Error(`会话不存在：${sessionId}`);
    }

    const lastTranscriptSeq = loadTranscript(sessionId).at(-1)?.seq ?? 0;
    const nextSeq = Math.max(meta.transcriptSeq, lastTranscriptSeq) + 1;
    const event = buildEvent(nextSeq, meta);

    appendLine(getTranscriptPath(sessionId), JSON.stringify(event));
    meta.transcriptSeq = nextSeq;
    meta.updatedAt = event.timestamp;
    writeMeta(meta);
    updateIndexWithMeta(meta);
    return event;
  });
}

export function appendUserMessageEvent(input: {
  sessionId: string;
  text: string;
  attachments: SelectedFile[];
  modelEntryId: string;
  thinkingLevel: string;
  sendOrigin?: SendMessageOrigin;
}): { message: ChatMessage; title: string } {
  const meta = readMeta(input.sessionId);
  if (!meta) {
    throw new Error(`会话不存在：${input.sessionId}`);
  }

  const title =
    loadTranscript(input.sessionId).length === 0
      ? deriveSessionTitle(input.text, input.attachments)
      : meta.title;

  const message: ChatMessage = {
    id: randomUUID(),
    role: "user",
    content: input.text.trim(),
    timestamp: new Date().toISOString(),
    status: "done",
    meta: {
      attachmentIds: input.attachments.map((attachment) => attachment.id),
      attachments: input.attachments,
      sendOrigin: input.sendOrigin ?? "user",
    },
  };

  meta.title = title;
  meta.attachments = [];
  meta.draft = "";
  meta.lastModelEntryId = input.modelEntryId;
  meta.updatedAt = message.timestamp;
  writeMeta(meta);

  appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    timestamp: message.timestamp,
    type: "user_message",
    message,
  }));

  return { message, title };
}

export function appendRunStartedEvent(input: {
  sessionId: string;
  runId: string;
  ownerId?: string;
  runKind: RunKind;
  modelEntryId: string;
  thinkingLevel: string;
  metadata?: Record<string, unknown>;
}): SessionTranscriptEvent {
  const event = appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    ownerId: input.ownerId,
    timestamp: new Date().toISOString(),
    type: "run_started",
    runKind: input.runKind,
    modelEntryId: input.modelEntryId,
    thinkingLevel: input.thinkingLevel,
    metadata: input.metadata,
  }));

  updateMeta(input.sessionId, (meta) => {
    meta.lastRunId = input.runId;
    meta.lastModelEntryId = input.modelEntryId;
    meta.lastRunState = "running";
  });

  return event;
}

export function appendRunStateChangedEvent(input: {
  sessionId: string;
  runId: string;
  state: string;
  reason?: string;
  currentStepId?: string;
}): SessionTranscriptEvent {
  const event = appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    timestamp: new Date().toISOString(),
    type: "run_state_changed",
    state: input.state,
    reason: input.reason,
    currentStepId: input.currentStepId,
  }));

  updateMeta(input.sessionId, (meta) => {
    meta.lastRunId = input.runId;
    meta.lastRunState =
      input.state === "awaiting_confirmation"
        ? "awaiting_confirmation"
        : "running";
  });

  return event;
}

export function appendToolStartedEvent(input: {
  sessionId: string;
  runId: string;
  stepId: string;
  toolName: string;
  args: Record<string, unknown>;
}): SessionTranscriptEvent {
  return appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    timestamp: new Date().toISOString(),
    type: "tool_started",
    stepId: input.stepId,
    toolName: input.toolName,
    args: input.args,
  }));
}

export function appendToolFinishedEvent(input: {
  sessionId: string;
  runId: string;
  stepId: string;
  toolName: string;
  result?: unknown;
  error?: string;
}): SessionTranscriptEvent {
  return appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    timestamp: new Date().toISOString(),
    type: "tool_finished",
    stepId: input.stepId,
    toolName: input.toolName,
    result: input.result,
    error: input.error,
  }));
}

export function appendConfirmationRequestedEvent(input: {
  sessionId: string;
  runId: string;
  requestId: string;
  title: string;
  description: string;
  detail?: string;
}): SessionTranscriptEvent {
  return appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    timestamp: new Date().toISOString(),
    type: "confirmation_requested",
    requestId: input.requestId,
    title: input.title,
    description: input.description,
    detail: input.detail,
  }));
}

export function appendConfirmationResolvedEvent(input: {
  sessionId: string;
  runId: string;
  requestId: string;
  allowed: boolean;
}): SessionTranscriptEvent {
  return appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    timestamp: new Date().toISOString(),
    type: "confirmation_resolved",
    requestId: input.requestId,
    allowed: input.allowed,
  }));
}

export function appendAssistantMessageEvent(input: {
  sessionId: string;
  runId: string;
  message: ChatMessage;
}): SessionTranscriptEvent {
  return appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    timestamp: input.message.timestamp,
    type: "assistant_message",
    message: input.message,
  }));
}

export function appendCompactAppliedEvent(input: {
  sessionId: string;
  runId: string;
  snapshotRevision: number;
  compactedUntilSeq: number;
  reason: "manual" | "auto";
}): SessionTranscriptEvent {
  return appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    timestamp: new Date().toISOString(),
    type: "compact_applied",
    snapshotRevision: input.snapshotRevision,
    compactedUntilSeq: input.compactedUntilSeq,
    reason: input.reason,
  }));
}

export function appendMemoryRefreshEvent(input: {
  sessionId: string;
  runId: string;
  report: Omit<
    Extract<SessionTranscriptEvent, { type: "memory_refresh" }>,
    "seq" | "timestamp" | "type" | "runId"
  >;
}): SessionTranscriptEvent {
  return appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    timestamp: new Date().toISOString(),
    type: "memory_refresh",
    sourceRunId: input.report.sourceRunId,
    status: input.report.status,
    extractedCount: input.report.extractedCount,
    acceptedCount: input.report.acceptedCount,
    savedCount: input.report.savedCount,
    duplicateCount: input.report.duplicateCount,
    mergedCount: input.report.mergedCount,
    conflictCount: input.report.conflictCount,
    vectorWrittenCount: input.report.vectorWrittenCount,
    vectorFailedCount: input.report.vectorFailedCount,
    failureReason: input.report.failureReason,
  }));
}

export function appendRunFinishedEvent(input: {
  sessionId: string;
  runId: string;
  ownerId?: string;
  finalState: "completed" | "aborted" | "failed";
  reason?: string;
  metadata?: Record<string, unknown>;
}): SessionTranscriptEvent {
  const event = appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    ownerId: input.ownerId,
    timestamp: new Date().toISOString(),
    type: "run_finished",
    finalState: input.finalState,
    reason: input.reason,
    metadata: input.metadata,
  }));

  updateMeta(input.sessionId, (meta) => {
    meta.lastRunId = input.runId;
    meta.lastRunState =
      input.finalState === "completed"
        ? "completed"
        : input.finalState === "aborted"
          ? "cancelled"
          : "error";
  });

  return event;
}

export function appendRunRecoveryRequestedEvent(input: {
  sessionId: string;
  runId: string;
  resumedRunId: string;
  recoveryPrompt: string;
  source: "interrupted_approval" | "context_recovery";
}): SessionTranscriptEvent {
  return appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    timestamp: new Date().toISOString(),
    type: "run_recovery_requested",
    resumedRunId: input.resumedRunId,
    recoveryStatus: "requested",
    recoveryPrompt: input.recoveryPrompt,
    source: input.source,
  }));
}
