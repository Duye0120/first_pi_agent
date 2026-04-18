import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type {
  AgentResponseStatus,
  ChatSession,
  ChatSessionSummary,
  SelectedFile,
} from "../../shared/contracts.js";
import { atomicWrite, readJsonFile } from "./io.js";
import { getIndexPath, getSessionMetaPath } from "./paths.js";
import {
  countMaterializedMessages,
  loadTranscript,
} from "./transcript.js";

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
  titleManuallySet?: boolean;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  groupId?: string;
  pinned?: boolean;
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
  pendingRedirectDraft?: string;
  pendingRedirectUpdatedAt?: string;
};

export function createMetaFromSession(session: ChatSession): PersistedSessionMeta {
  return {
    id: session.id,
    title: session.title,
    titleManuallySet: false,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    archived: session.archived,
    groupId: session.groupId,
    pinned: session.pinned,
    draft: session.draft,
    attachments: session.attachments,
    lastModelEntryId: null,
    lastRunId: null,
    transcriptSeq: 0,
    snapshotRevision: 0,
    autoCompactFailureCount: 0,
    todos: [],
    pendingRedirectDraft: "",
  };
}

export function normalizePersistedSessionMeta(
  meta: PersistedSessionMeta,
): PersistedSessionMeta {
  return {
    ...meta,
    titleManuallySet: meta.titleManuallySet === true,
    transcriptSeq: Number.isFinite(meta.transcriptSeq)
      ? Math.max(0, meta.transcriptSeq)
      : 0,
    snapshotRevision: Number.isFinite(meta.snapshotRevision)
      ? Math.max(0, meta.snapshotRevision)
      : 0,
    autoCompactFailureCount: Number.isFinite(meta.autoCompactFailureCount)
      ? Math.max(0, meta.autoCompactFailureCount)
      : 0,
    todos: Array.isArray(meta.todos) ? meta.todos.map(normalizeTodoItem) : [],
    pendingRedirectDraft:
      typeof meta.pendingRedirectDraft === "string"
        ? meta.pendingRedirectDraft
        : "",
    pendingRedirectUpdatedAt:
      typeof meta.pendingRedirectUpdatedAt === "string"
        ? meta.pendingRedirectUpdatedAt
        : undefined,
  };
}

export function normalizeTodoStatus(value: unknown): SessionTodoStatus {
  switch (value) {
    case "pending":
    case "in_progress":
    case "completed":
      return value;
    default:
      return "pending";
  }
}

export function normalizeTodoItem(item: Partial<SessionTodoItem>): SessionTodoItem {
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

export function writeMeta(meta: PersistedSessionMeta): void {
  atomicWrite(
    getSessionMetaPath(meta.id),
    JSON.stringify(normalizePersistedSessionMeta(meta), null, 2),
  );
}

export function readMeta(sessionId: string): PersistedSessionMeta | null {
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

export function readIndex(): SessionIndex {
  return readJsonFile(getIndexPath(), { summaries: [] } satisfies SessionIndex);
}

export function writeIndex(index: SessionIndex): void {
  atomicWrite(getIndexPath(), JSON.stringify(index, null, 2));
}

export function updateIndexWithMeta(meta: PersistedSessionMeta): void {
  const transcript = loadTranscript(meta.id);
  const summary: ChatSessionSummary = {
    id: meta.id,
    title: meta.title,
    updatedAt: meta.updatedAt,
    messageCount: countMaterializedMessages(transcript),
    archived: meta.archived,
    groupId: meta.groupId,
    pinned: meta.pinned,
    lastRunState: meta.lastRunState,
  };

  const index = readIndex();
  const filtered = index.summaries.filter((entry) => entry.id !== meta.id);
  filtered.push(summary);
  filtered.sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
  writeIndex({ summaries: filtered });
}

export function sortSessionSummaries(
  summaries: ChatSessionSummary[],
): ChatSessionSummary[] {
  return summaries.sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function removeFromIndex(sessionId: string): void {
  const index = readIndex();
  if (!index.summaries.some((summary) => summary.id === sessionId)) {
    return;
  }

  writeIndex({
    summaries: index.summaries.filter((summary) => summary.id !== sessionId),
  });
}

export function updateMeta(
  sessionId: string,
  updater: (meta: PersistedSessionMeta) => void,
): PersistedSessionMeta | null {
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
