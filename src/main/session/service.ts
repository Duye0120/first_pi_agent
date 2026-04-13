import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import type {
  ChatSession,
  ChatSessionSummary,
  SessionMemorySnapshot,
  SessionTranscriptEvent,
} from "../../shared/contracts.js";
import { createEmptySession } from "../../shared/contracts.js";
import type { HarnessRunSnapshot } from "../harness/types.js";
import {
  atomicWrite,
  ensureDir,
  readJsonFile,
} from "./io.js";
import {
  INDEX_FILE,
  getIndexPath,
  getLegacyFlatSessionPath,
  getLegacyStorePath,
  getSessionDir,
  getSessionsDir,
  getSnapshotPath,
  getTranscriptPath,
} from "./paths.js";
import {
  createMetaFromSession,
  normalizeTodoItem,
  readIndex,
  readMeta,
  removeFromIndex,
  sortSessionSummaries,
  updateIndexWithMeta,
  updateMeta,
  writeIndex,
  writeMeta,
  type PersistedSessionMeta,
  type SessionTodoItem,
} from "./meta.js";
import {
  loadTranscript,
  materializeMessages,
} from "./transcript.js";
import {
  appendRunFinishedEvent as appendRunFinishedTranscriptEvent,
  appendUserMessageEvent as appendUserMessageTranscriptEvent,
} from "./transcript-writer.js";

export type {
  PersistedSessionMeta,
  SessionTodoItem,
  SessionTodoStatus,
} from "./meta.js";

export {
  appendAssistantMessageEvent,
  appendCompactAppliedEvent,
  appendConfirmationRequestedEvent,
  appendConfirmationResolvedEvent,
  appendRunFinishedEvent,
  appendRunStartedEvent,
  appendRunStateChangedEvent,
  appendToolFinishedEvent,
  appendToolStartedEvent,
} from "./transcript-writer.js";

function toIsoTimestamp(value: number | string): string {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
  }

  return new Date(value).toISOString();
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
    errors: [],
    learnings: [],
    workspace: {
      branchName: null,
      modelEntryId: null,
      thinkingLevel: null,
    },
    sourceRunIds: [],
    sourceMessageIds: [],
  };
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
    pinned: meta.pinned,
  };
}

function resolveLastRunFields(
  events: SessionTranscriptEvent[],
): Pick<PersistedSessionMeta, "lastModelEntryId" | "lastRunId" | "lastRunState"> {
  let lastModelEntryId: string | null = null;
  let lastRunId: string | null = null;
  let lastRunState: PersistedSessionMeta["lastRunState"] = undefined;

  for (const event of events) {
    switch (event.type) {
      case "run_started":
        lastModelEntryId = event.modelEntryId;
        lastRunId = event.runId;
        lastRunState = "running";
        break;
      case "run_state_changed":
        lastRunId = event.runId;
        lastRunState =
          event.state === "awaiting_confirmation" ? "awaiting_confirmation" : "running";
        break;
      case "run_finished":
        lastRunId = event.runId;
        lastRunState =
          event.finalState === "completed"
            ? "completed"
            : event.finalState === "aborted"
              ? "cancelled"
              : "error";
        break;
      default:
        break;
    }
  }

  return {
    lastModelEntryId,
    lastRunId,
    lastRunState,
  };
}

function createTrimmedSnapshot(
  sessionId: string,
  currentSnapshot: SessionMemorySnapshot,
  modelEntryId: string | null,
  updatedAt: string,
): SessionMemorySnapshot {
  return {
    ...createEmptySnapshot(sessionId),
    revision: currentSnapshot.revision + 1,
    updatedAt,
    workspace: {
      branchName: currentSnapshot.workspace.branchName,
      modelEntryId,
      thinkingLevel: currentSnapshot.workspace.thinkingLevel,
    },
  };
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
  ensureSessionStorageReady();
  return sortSessionSummaries(
    readIndex().summaries.filter((summary) => !summary.archived),
  );
}

export function listPersistedArchivedSessions(): ChatSessionSummary[] {
  ensureSessionStorageReady();
  return sortSessionSummaries(
    readIndex().summaries.filter((summary) => summary.archived),
  );
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
  meta.pinned = session.pinned;
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

export function trimPersistedSessionMessages(
  sessionId: string,
  messageId: string,
): ChatSession {
  ensureSessionStorageReady();

  const meta = readMeta(sessionId);
  if (!meta) {
    throw new Error(`会话不存在：${sessionId}`);
  }

  const transcript = loadTranscript(sessionId);
  const targetEvent = transcript.find(
    (event) =>
      (event.type === "user_message" || event.type === "assistant_message") &&
      event.message.id === messageId,
  );

  if (!targetEvent) {
    throw new Error(`未找到要裁剪的消息：${messageId}`);
  }

  const removedRunIds = new Set<string>();
  if (targetEvent.type === "assistant_message") {
    removedRunIds.add(targetEvent.runId);
  }

  const nextEvents = transcript.filter((event) => {
    if (event.seq >= targetEvent.seq) {
      return false;
    }

    return !("runId" in event && removedRunIds.has(event.runId));
  });

  const nextTranscript = nextEvents
    .map((event) => JSON.stringify(event))
    .join(nextEvents.length > 0 ? "\n" : "");
  atomicWrite(
    getTranscriptPath(sessionId),
    nextTranscript ? `${nextTranscript}\n` : "",
  );

  const updatedAt = new Date().toISOString();
  const currentSnapshot = readSnapshot(sessionId);
  const { lastModelEntryId, lastRunId, lastRunState } =
    resolveLastRunFields(nextEvents);

  meta.attachments = [];
  meta.draft = "";
  meta.transcriptSeq = nextEvents.at(-1)?.seq ?? 0;
  meta.lastModelEntryId = lastModelEntryId;
  meta.lastRunId = lastRunId;
  meta.lastRunState = lastRunState;
  meta.snapshotRevision = currentSnapshot.revision + 1;
  meta.updatedAt = updatedAt;
  writeMeta(meta);
  updateIndexWithMeta(meta);

  writeSnapshot(
    createTrimmedSnapshot(
      sessionId,
      currentSnapshot,
      lastModelEntryId,
      updatedAt,
    ),
  );

  return materializeSession(meta);
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

export function setPersistedSessionPinned(sessionId: string, pinned: boolean): void {
  updateSessionMeta(sessionId, (meta) => {
    meta.pinned = pinned;
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
  return updateMeta(sessionId, updater);
}

export function appendUserMessageEvent(
  input: Parameters<typeof appendUserMessageTranscriptEvent>[0],
): ReturnType<typeof appendUserMessageTranscriptEvent> {
  ensureSessionStorageReady();
  return appendUserMessageTranscriptEvent(input);
}

export function recoverInterruptedRuns(runs: HarnessRunSnapshot[]): void {
  ensureSessionStorageReady();

  for (const run of runs) {
    const meta = readMeta(run.sessionId);
    if (!meta) {
      continue;
    }

    appendRunFinishedTranscriptEvent({
      sessionId: run.sessionId,
      runId: run.runId,
      ownerId: run.ownerId,
      finalState:
        run.state === "awaiting_confirmation" ? "aborted" : "failed",
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
