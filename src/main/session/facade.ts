import type { ChatSession, ChatSessionSummary } from "../../shared/contracts.js";
import {
  archivePersistedSession,
  createPersistedSession,
  deletePersistedSession,
  listPersistedArchivedSessions,
  listPersistedSessions,
  loadPersistedSession,
  renamePersistedSession,
  saveSessionProjection,
  setPersistedSessionGroup,
  setPersistedSessionPinned,
  trimPersistedSessionMessages,
  unarchivePersistedSession,
} from "./service.js";

export function listSessions(): ChatSessionSummary[] {
  return listPersistedSessions();
}

export function loadSession(sessionId: string): ChatSession | null {
  return loadPersistedSession(sessionId);
}

export function saveSession(session: ChatSession): void {
  saveSessionProjection(session);
}

export function createSession(): ChatSession {
  return createPersistedSession();
}

export function deleteSession(sessionId: string): void {
  deletePersistedSession(sessionId);
}

export function trimSessionMessages(sessionId: string, messageId: string): ChatSession {
  return trimPersistedSessionMessages(sessionId, messageId);
}

export function listArchivedSessions(): ChatSessionSummary[] {
  return listPersistedArchivedSessions();
}

export function archiveSession(sessionId: string): void {
  archivePersistedSession(sessionId);
}

export function unarchiveSession(sessionId: string): void {
  unarchivePersistedSession(sessionId);
}

export function setSessionGroup(sessionId: string, groupId: string | null): void {
  setPersistedSessionGroup(sessionId, groupId);
}

export function renameSession(sessionId: string, title: string): void {
  const nextTitle = title.trim();
  if (!nextTitle) {
    return;
  }

  renamePersistedSession(sessionId, nextTitle);
}

export function setSessionPinned(sessionId: string, pinned: boolean): void {
  setPersistedSessionPinned(sessionId, pinned);
}
