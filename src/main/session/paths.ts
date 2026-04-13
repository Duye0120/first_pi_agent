import { app } from "electron";
import { join } from "node:path";

const LEGACY_STORE_FILE = "desktop-shell-state.json";
const SESSIONS_DIR = "sessions";
export const INDEX_FILE = "index.json";
const SESSION_FILE = "session.json";
const TRANSCRIPT_FILE = "transcript.jsonl";
const SNAPSHOT_FILE = "context-snapshot.json";

export function getDataDir(): string {
  return join(app.getPath("userData"), "data");
}

export function getSessionsDir(): string {
  return join(getDataDir(), SESSIONS_DIR);
}

export function getSessionDir(sessionId: string): string {
  return join(getSessionsDir(), sessionId);
}

export function getIndexPath(): string {
  return join(getSessionsDir(), INDEX_FILE);
}

export function getSessionMetaPath(sessionId: string): string {
  return join(getSessionDir(sessionId), SESSION_FILE);
}

export function getTranscriptPath(sessionId: string): string {
  return join(getSessionDir(sessionId), TRANSCRIPT_FILE);
}

export function getSnapshotPath(sessionId: string): string {
  return join(getSessionDir(sessionId), SNAPSHOT_FILE);
}

export function getLegacyStorePath(): string {
  return join(app.getPath("userData"), LEGACY_STORE_FILE);
}

export function getLegacyFlatSessionPath(sessionId: string): string {
  return join(getSessionsDir(), `${sessionId}.json`);
}
