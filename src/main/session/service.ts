import { app } from "electron";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type {
  AgentResponseStatus,
  ChatMessage,
  ChatSession,
  ChatSessionSummary,
  RunKind,
  SelectedFile,
  SessionMemorySnapshot,
  SessionTranscriptEvent,
} from "../../shared/contracts.js";
import { createEmptySession } from "../../shared/contracts.js";
import type { HarnessRunSnapshot } from "../harness/types.js";

const LEGACY_STORE_FILE = "desktop-shell-state.json";
const SESSIONS_DIR = "sessions";
const INDEX_FILE = "index.json";
const SESSION_FILE = "session.json";
const TRANSCRIPT_FILE = "transcript.jsonl";
const SNAPSHOT_FILE = "context-snapshot.json";

type SessionIndex = {
  summaries: ChatSessionSummary[];
};

export type SessionTodoStatus = "pending" | "in_progress" | "completed";

export type SessionTodoItem = {
  id: string;
  content: string;
  activeForm: string;
  status: SessionTodoStatus;
};

export type PersistedSessionMeta = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  groupId?: string;
  draft: string;
  attachments: SelectedFile[];
  lastModelEntryId: string | null;
  lastRunId: string | null;
  lastRunState?: AgentResponseStatus | "awaiting_confirmation" | "running";
  transcriptSeq: number;
  snapshotRevision: number;
  autoCompactFailureCount: number;
  autoCompactBlockedAt?: string;
  todos?: SessionTodoItem[];
};

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function atomicWrite(filePath: string, data: string): void {
  ensureDir(dirname(filePath));
  const tempPath = filePath + ".tmp";
  writeFileSync(tempPath, data, "utf-8");
  renameSync(tempPath, filePath);
}

function appendLine(filePath: string, line: string): void {
  ensureDir(dirname(filePath));
  const current = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  atomicWrite(filePath, current + line + "\n");
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function getDataDir(): string {
  return join(app.getPath("userData"), "data");
}

function getSessionsDir(): string {
  return join(getDataDir(), SESSIONS_DIR);
}

function getSessionDir(sessionId: string): string {
  return join(getSessionsDir(), sessionId);
}

function getIndexPath(): string {
  return join(getSessionsDir(), INDEX_FILE);
}

function getSessionMetaPath(sessionId: string): string {
  return join(getSessionDir(sessionId), SESSION_FILE);
}

function getTranscriptPath(sessionId: string): string {
  return join(getSessionDir(sessionId), TRANSCRIPT_FILE);
}

function getSnapshotPath(sessionId: string): string {
  return join(getSessionDir(sessionId), SNAPSHOT_FILE);
}

function getLegacyStorePath(): string {
  return join(app.getPath("userData"), LEGACY_STORE_FILE);
}

function getLegacyFlatSessionPath(sessionId: string): string {
  return join(getSessionsDir(), `${sessionId}.json`);
}

function toIsoTimestamp(value: number | string): string {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
  }

  return new Date(value).toISOString();
}

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

function createEmptySnapshot(sessionId: string): SessionMemorySnapshot {
  return {
    version: 1,
    sessionId,
    revision: 0,
    updatedAt: new Date(0).toISOString(),
    compactedUntilSeq: 0,
    summary: "",
    currentTask: null,
    currentState: null,
    decisions: [],
    importantFiles: [],
    importantAttachments: [],
    openLoops: [],
    nextActions: [],
    risks: [],
    workspace: {
      branchName: null,
      modelEntryId: null,
      thinkingLevel: null,
    },
    sourceRunIds: [],
    sourceMessageIds: [],
  };
}

function createMetaFromSession(session: ChatSession): PersistedSessionMeta {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    archived: session.archived,
    groupId: session.groupId,
    draft: session.draft,
    attachments: session.attachments,
    lastModelEntryId: null,
    lastRunId: null,
    transcriptSeq: 0,
    snapshotRevision: 0,
    autoCompactFailureCount: 0,
    todos: [],
  };
}

function normalizePersistedSessionMeta(meta: PersistedSessionMeta): PersistedSessionMeta {
  return {
    ...meta,
    transcriptSeq: Number.isFinite(meta.transcriptSeq) ? Math.max(0, meta.transcriptSeq) : 0,
    snapshotRevision: Number.isFinite(meta.snapshotRevision) ? Math.max(0, meta.snapshotRevision) : 0,
    autoCompactFailureCount: Number.isFinite(meta.autoCompactFailureCount)
      ? Math.max(0, meta.autoCompactFailureCount)
      : 0,
    todos: Array.isArray(meta.todos) ? meta.todos.map(normalizeTodoItem) : [],
  };
}

function normalizeTodoStatus(value: unknown): SessionTodoStatus {
  switch (value) {
    case "pending":
    case "in_progress":
    case "completed":
      return value;
    default:
      return "pending";
  }
}

function normalizeTodoItem(item: Partial<SessionTodoItem>): SessionTodoItem {
  const content = typeof item.content === "string" ? item.content.trim() : "";
  const activeForm =
    typeof item.activeForm === "string" && item.activeForm.trim()
      ? item.activeForm.trim()
      : content;

  return {
    id:
      typeof item.id === "string" && item.id.trim()
        ? item.id
        : `todo-${randomUUID()}`,
    content,
    activeForm,
    status: normalizeTodoStatus(item.status),
  };
}

function writeMeta(meta: PersistedSessionMeta): void {
  atomicWrite(
    getSessionMetaPath(meta.id),
    JSON.stringify(normalizePersistedSessionMeta(meta), null, 2),
  );
}

function readMeta(sessionId: string): PersistedSessionMeta | null {
  const filePath = getSessionMetaPath(sessionId);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return normalizePersistedSessionMeta(
      JSON.parse(readFileSync(filePath, "utf-8")) as PersistedSessionMeta,
    );
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot: SessionMemorySnapshot): void {
  atomicWrite(
    getSnapshotPath(snapshot.sessionId),
    JSON.stringify(snapshot, null, 2),
  );
}

function readSnapshot(sessionId: string): SessionMemorySnapshot {
  return readJsonFile(getSnapshotPath(sessionId), createEmptySnapshot(sessionId));
}

function loadTranscript(sessionId: string): SessionTranscriptEvent[] {
  const filePath = getTranscriptPath(sessionId);
  if (!existsSync(filePath)) {
    return [];
  }

  const lines = readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const events: SessionTranscriptEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as SessionTranscriptEvent);
    } catch {
      // Skip malformed event lines so one bad line doesn't brick the session.
    }
  }

  return events;
}

function countMaterializedMessages(events: SessionTranscriptEvent[]): number {
  let count = 0;
  for (const event of events) {
    if (event.type === "user_message" || event.type === "assistant_message") {
      count += 1;
      continue;
    }

    if (
      event.type === "run_finished" &&
      event.finalState === "failed" &&
      event.reason === "app_restart_interrupted"
    ) {
      count += 1;
    }
  }
  return count;
}

function materializeMessages(events: SessionTranscriptEvent[]): ChatMessage[] {
  const messages: ChatMessage[] = [];

  for (const event of events) {
    if (event.type === "user_message" || event.type === "assistant_message") {
      messages.push(event.message);
      continue;
    }

    if (
      event.type === "run_finished" &&
      event.finalState === "failed" &&
      event.reason === "app_restart_interrupted"
    ) {
      messages.push({
        id: `system-${event.runId}-${event.seq}`,
        role: "system",
        content: "上次运行在应用退出或重启时中断，已标记为失败，可继续接着处理。",
        timestamp: event.timestamp,
        status: "done",
      });
    }
  }

  return messages;
}

function materializeSession(meta: PersistedSessionMeta): ChatSession {
  const transcript = loadTranscript(meta.id);

  return {
    id: meta.id,
    title: meta.title,
    messages: materializeMessages(transcript),
    attachments: meta.attachments,
    draft: meta.draft,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    archived: meta.archived,
    groupId: meta.groupId,
  };
}

function readIndex(): SessionIndex {
  ensureSessionStorageReady();
  return readJsonFile(getIndexPath(), { summaries: [] } satisfies SessionIndex);
}

function writeIndex(index: SessionIndex): void {
  atomicWrite(getIndexPath(), JSON.stringify(index, null, 2));
}

function updateIndexWithMeta(meta: PersistedSessionMeta): void {
  const transcript = loadTranscript(meta.id);
  const summary: ChatSessionSummary = {
    id: meta.id,
    title: meta.title,
    updatedAt: meta.updatedAt,
    messageCount: countMaterializedMessages(transcript),
    archived: meta.archived,
    groupId: meta.groupId,
    lastRunState: meta.lastRunState,
  };

  const index = readIndex();
  const filtered = index.summaries.filter((entry) => entry.id !== meta.id);
  filtered.push(summary);
  filtered.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  writeIndex({ summaries: filtered });
}

function removeFromIndex(sessionId: string): void {
  const index = readIndex();
  if (!index.summaries.some((summary) => summary.id === sessionId)) {
    return;
  }

  writeIndex({
    summaries: index.summaries.filter((summary) => summary.id !== sessionId),
  });
}

function appendTranscriptEvent(
  sessionId: string,
  buildEvent: (nextSeq: number, meta: PersistedSessionMeta) => SessionTranscriptEvent,
): SessionTranscriptEvent {
  const meta = readMeta(sessionId);
  if (!meta) {
    throw new Error(`会话不存在：${sessionId}`);
  }

  const nextSeq = meta.transcriptSeq + 1;
  const event = buildEvent(nextSeq, meta);

  appendLine(getTranscriptPath(sessionId), JSON.stringify(event));
  meta.transcriptSeq = nextSeq;
  meta.updatedAt = event.timestamp;
  writeMeta(meta);
  updateIndexWithMeta(meta);
  return event;
}

function migrateLegacyDesktopShellState(): void {
  const legacyPath = getLegacyStorePath();
  if (!existsSync(legacyPath)) {
    return;
  }

  try {
    const parsed = JSON.parse(readFileSync(legacyPath, "utf-8")) as {
      sessions?: ChatSession[];
    };

    if (Array.isArray(parsed.sessions)) {
      for (const session of parsed.sessions) {
        const flatPath = getLegacyFlatSessionPath(session.id);
        if (!existsSync(flatPath) && !existsSync(getSessionDir(session.id))) {
          atomicWrite(flatPath, JSON.stringify(session, null, 2));
        }
      }
    }

    renameSync(legacyPath, legacyPath + ".bak");
  } catch {
    // Leave the legacy file in place if migration fails.
  }
}

function migrateFlatSessionFiles(): void {
  ensureDir(getSessionsDir());

  const entries = readdirSync(getSessionsDir(), { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    if (entry.name === INDEX_FILE) {
      continue;
    }

    const flatPath = join(getSessionsDir(), entry.name);
    let session: ChatSession | null = null;
    try {
      session = JSON.parse(readFileSync(flatPath, "utf-8")) as ChatSession;
    } catch {
      session = null;
    }

    if (!session) {
      continue;
    }

    const sessionDir = getSessionDir(session.id);
    if (!existsSync(sessionDir)) {
      ensureDir(sessionDir);
      const meta = createMetaFromSession(session);
      writeMeta(meta);
      writeSnapshot(createEmptySnapshot(session.id));

      let lastAssistantRunState: PersistedSessionMeta["lastRunState"] = undefined;
      const lines: string[] = [];
      let seq = 0;

      for (const message of session.messages) {
        if (message.role === "user") {
          seq += 1;
          lines.push(
            JSON.stringify({
              seq,
              sessionId: session.id,
              timestamp: message.timestamp,
              type: "user_message",
              message,
            } satisfies SessionTranscriptEvent),
          );
          continue;
        }

        const legacyRunId = `legacy-${message.id}`;
        seq += 1;
        lines.push(
          JSON.stringify({
            seq,
            sessionId: session.id,
            runId: legacyRunId,
            timestamp: message.timestamp,
            type: "run_started",
            runKind: "chat",
            modelEntryId: meta.lastModelEntryId ?? "legacy",
            thinkingLevel: "off",
          } satisfies SessionTranscriptEvent),
        );
        seq += 1;
        lines.push(
          JSON.stringify({
            seq,
            sessionId: session.id,
            runId: legacyRunId,
            timestamp: message.timestamp,
            type: "assistant_message",
            message,
          } satisfies SessionTranscriptEvent),
        );
        seq += 1;
        const finalState =
          message.status === "error" ? "error" : "completed";
        lines.push(
          JSON.stringify({
            seq,
            sessionId: session.id,
            runId: legacyRunId,
            timestamp: message.timestamp,
            type: "run_finished",
            finalState: message.status === "error" ? "failed" : "completed",
          } satisfies SessionTranscriptEvent),
        );
        lastAssistantRunState = finalState;
      }

      meta.transcriptSeq = seq;
      meta.lastRunState = lastAssistantRunState;
      writeMeta(meta);
      atomicWrite(getTranscriptPath(session.id), lines.join(lines.length > 0 ? "\n" : ""));
      updateIndexWithMeta(meta);
    }

    try {
      unlinkSync(flatPath);
    } catch {
      // Keep the legacy file if cleanup fails.
    }
  }
}

let storageReady = false;

export function ensureSessionStorageReady(): void {
  if (storageReady) {
    return;
  }

  storageReady = true;
  ensureDir(getSessionsDir());
  migrateLegacyDesktopShellState();
  migrateFlatSessionFiles();
  if (!existsSync(getIndexPath())) {
    writeIndex({ summaries: [] });
  }
}

export function listPersistedSessions(): ChatSessionSummary[] {
  return readIndex().summaries
    .filter((summary) => !summary.archived)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function listPersistedArchivedSessions(): ChatSessionSummary[] {
  return readIndex().summaries
    .filter((summary) => summary.archived)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function loadPersistedSession(sessionId: string): ChatSession | null {
  const meta = readMeta(sessionId);
  return meta ? materializeSession(meta) : null;
}

export function saveSessionProjection(session: ChatSession): void {
  ensureSessionStorageReady();
  const meta = readMeta(session.id);
  if (!meta) {
    return;
  }

  meta.title = session.title;
  meta.updatedAt = session.updatedAt;
  meta.archived = session.archived;
  meta.groupId = session.groupId;
  meta.draft = session.draft;
  meta.attachments = session.attachments;
  writeMeta(meta);
  updateIndexWithMeta(meta);
}

export function createPersistedSession(): ChatSession {
  ensureSessionStorageReady();
  const session = createEmptySession();
  const meta = createMetaFromSession(session);

  ensureDir(getSessionDir(session.id));
  writeMeta(meta);
  atomicWrite(getTranscriptPath(session.id), "");
  writeSnapshot(createEmptySnapshot(session.id));
  updateIndexWithMeta(meta);

  return materializeSession(meta);
}

export function deletePersistedSession(sessionId: string): void {
  ensureSessionStorageReady();
  const sessionDir = getSessionDir(sessionId);
  if (existsSync(sessionDir)) {
    rmSync(sessionDir, { recursive: true, force: true });
  }
  removeFromIndex(sessionId);
}

export function archivePersistedSession(sessionId: string): void {
  updateSessionMeta(sessionId, (meta) => {
    meta.archived = true;
  });
}

export function unarchivePersistedSession(sessionId: string): void {
  updateSessionMeta(sessionId, (meta) => {
    meta.archived = false;
  });
}

export function renamePersistedSession(sessionId: string, title: string): void {
  updateSessionMeta(sessionId, (meta) => {
    meta.title = title;
  });
}

export function setPersistedSessionGroup(
  sessionId: string,
  groupId: string | null,
): void {
  updateSessionMeta(sessionId, (meta) => {
    if (groupId === null) {
      delete meta.groupId;
    } else {
      meta.groupId = groupId;
    }
  });
}

export function getPersistedSnapshot(sessionId: string): SessionMemorySnapshot {
  ensureSessionStorageReady();
  return readSnapshot(sessionId);
}

export function writePersistedSnapshot(snapshot: SessionMemorySnapshot): void {
  ensureSessionStorageReady();
  const meta = readMeta(snapshot.sessionId);
  if (!meta) {
    throw new Error(`会话不存在：${snapshot.sessionId}`);
  }

  meta.snapshotRevision = snapshot.revision;
  meta.updatedAt = new Date().toISOString();
  writeMeta(meta);
  writeSnapshot(snapshot);
  updateIndexWithMeta(meta);
}

export function loadTranscriptEvents(sessionId: string): SessionTranscriptEvent[] {
  ensureSessionStorageReady();
  return loadTranscript(sessionId);
}

export function updateSessionMeta(
  sessionId: string,
  updater: (meta: PersistedSessionMeta) => void,
): PersistedSessionMeta | null {
  ensureSessionStorageReady();
  const meta = readMeta(sessionId);
  if (!meta) {
    return null;
  }

  updater(meta);
  meta.updatedAt = new Date().toISOString();
  writeMeta(meta);
  updateIndexWithMeta(meta);
  return meta;
}

export function appendUserMessageEvent(input: {
  sessionId: string;
  text: string;
  attachments: SelectedFile[];
  modelEntryId: string;
  thinkingLevel: string;
}): { message: ChatMessage; title: string } {
  ensureSessionStorageReady();
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
  runKind: RunKind;
  modelEntryId: string;
  thinkingLevel: string;
}): SessionTranscriptEvent {
  const event = appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    timestamp: new Date().toISOString(),
    type: "run_started",
    runKind: input.runKind,
    modelEntryId: input.modelEntryId,
    thinkingLevel: input.thinkingLevel,
  }));

  updateSessionMeta(input.sessionId, (meta) => {
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

  updateSessionMeta(input.sessionId, (meta) => {
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

export function appendRunFinishedEvent(input: {
  sessionId: string;
  runId: string;
  finalState: "completed" | "aborted" | "failed";
  reason?: string;
}): SessionTranscriptEvent {
  const event = appendTranscriptEvent(input.sessionId, (nextSeq) => ({
    seq: nextSeq,
    sessionId: input.sessionId,
    runId: input.runId,
    timestamp: new Date().toISOString(),
    type: "run_finished",
    finalState: input.finalState,
    reason: input.reason,
  }));

  updateSessionMeta(input.sessionId, (meta) => {
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

export function recoverInterruptedRuns(runs: HarnessRunSnapshot[]): void {
  ensureSessionStorageReady();

  for (const run of runs) {
    const meta = readMeta(run.sessionId);
    if (!meta) {
      continue;
    }

    appendRunFinishedEvent({
      sessionId: run.sessionId,
      runId: run.runId,
      finalState: "failed",
      reason: "app_restart_interrupted",
    });
  }
}

export function getSessionMeta(sessionId: string): PersistedSessionMeta | null {
  ensureSessionStorageReady();
  return readMeta(sessionId);
}

export function listSessionTodos(sessionId: string): SessionTodoItem[] {
  ensureSessionStorageReady();
  return readMeta(sessionId)?.todos?.map(normalizeTodoItem) ?? [];
}

export function writeSessionTodos(
  sessionId: string,
  items: SessionTodoItem[],
): SessionTodoItem[] {
  const normalizedItems = items
    .map(normalizeTodoItem)
    .filter((item) => item.content.length > 0);

  updateSessionMeta(sessionId, (meta) => {
    meta.todos = normalizedItems;
  });

  return normalizedItems;
}
