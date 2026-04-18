import { IPC_CHANNELS } from "../../shared/ipc.js";
import type { ChatSession } from "../../shared/contracts.js";
import { compactSession, getContextSummary } from "../context/service.js";
import {
  archiveSession,
  rebuildSessionSearchIndex,
  createSession,
  deleteSession,
  listArchivedSessions,
  listSessions,
  loadSession,
  renameSession,
  saveSession,
  searchSessionSummaries,
  setSessionGroup,
  setSessionPinned,
  unarchiveSession,
} from "../session/facade.js";
import {
  createGroup,
  deleteGroup,
  listGroups,
  renameGroup,
} from "../ui-state.js";
import { handleIpc } from "./handle.js";

export function registerSessionsIpc(): void {
  handleIpc(IPC_CHANNELS.sessionsList, async () => listSessions());
  handleIpc(IPC_CHANNELS.sessionsLoad, async (_event, sessionId: string) =>
    loadSession(sessionId),
  );
  handleIpc(
    IPC_CHANNELS.sessionsSave,
    async (_event, session: ChatSession) => saveSession(session),
  );
  handleIpc(IPC_CHANNELS.sessionsCreate, async () => createSession());
  handleIpc(
    IPC_CHANNELS.sessionsArchive,
    async (_event, sessionId: string) => archiveSession(sessionId),
  );
  handleIpc(
    IPC_CHANNELS.sessionsUnarchive,
    async (_event, sessionId: string) => unarchiveSession(sessionId),
  );
  handleIpc(IPC_CHANNELS.sessionsListArchived, async () =>
    listArchivedSessions(),
  );
  handleIpc(
    IPC_CHANNELS.sessionsDelete,
    async (_event, sessionId: string) => deleteSession(sessionId),
  );
  handleIpc(
    IPC_CHANNELS.sessionsSetGroup,
    async (_event, sessionId: string, groupId: string | null) =>
      setSessionGroup(sessionId, groupId),
  );
  handleIpc(
    IPC_CHANNELS.sessionsRename,
    async (_event, sessionId: string, title: string) =>
      renameSession(sessionId, title),
  );
  handleIpc(
    IPC_CHANNELS.sessionsSetPinned,
    async (_event, sessionId: string, pinned: boolean) =>
      setSessionPinned(sessionId, pinned),
  );
  handleIpc(
    IPC_CHANNELS.sessionsSearch,
    async (_event, query: string, limit?: number) =>
      searchSessionSummaries(query, limit),
  );
  handleIpc(IPC_CHANNELS.sessionsReindexSearch, async () =>
    rebuildSessionSearchIndex(),
  );
  handleIpc(
    IPC_CHANNELS.contextGetSummary,
    async (_event, sessionId: string) => getContextSummary(sessionId),
  );
  handleIpc(
    IPC_CHANNELS.contextCompact,
    async (_event, sessionId: string) => compactSession(sessionId),
  );

  handleIpc(IPC_CHANNELS.groupsList, async () => listGroups());
  handleIpc(IPC_CHANNELS.groupsCreate, async (_event, name: string) =>
    createGroup(name),
  );
  handleIpc(
    IPC_CHANNELS.groupsRename,
    async (_event, groupId: string, name: string) => renameGroup(groupId, name),
  );
  handleIpc(IPC_CHANNELS.groupsDelete, async (_event, groupId: string) =>
    deleteGroup(groupId),
  );
}
