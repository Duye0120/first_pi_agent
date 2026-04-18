import type { ChatSession, ChatSessionSummary } from "../../shared/contracts.js";
import {
  archivePersistedSession,
  clearPersistedRedirectDraft,
  createPersistedSession,
  deletePersistedSession,
  getPersistedRedirectDraft,
  listPersistedArchivedSessions,
  listPersistedSessions,
  loadPersistedSession,
  renamePersistedSession,
  saveSessionProjection,
  setPersistedRedirectDraft,
  setPersistedSessionGroup,
  setPersistedSessionPinned,
  trimPersistedSessionMessages,
  unarchivePersistedSession,
} from "./service.js";
import {
  reindexSessionSearch,
  searchSessions,
} from "./search.js";

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

export function setSessionRedirectDraft(sessionId: string, text: string): void {
  setPersistedRedirectDraft(sessionId, text);
}

export function clearSessionRedirectDraft(sessionId: string): void {
  clearPersistedRedirectDraft(sessionId);
}

export function getSessionRedirectDraft(sessionId: string): string {
  return getPersistedRedirectDraft(sessionId);
}

export function searchSessionSummaries(query: string, limit?: number) {
  return searchSessions(query, limit);
}

export function rebuildSessionSearchIndex(): void {
  reindexSessionSearch();
}
