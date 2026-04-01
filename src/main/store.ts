import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { createEmptySession, summarizeSession, type ChatSession, type ChatSessionSummary, type PersistedAppState, type WindowUiState } from "../shared/contracts.js";

const SESSIONS_DIR = "sessions";
const INDEX_FILE = "index.json";
const UI_STATE_FILE = "ui-state.json";
const LEGACY_STORE_FILE = "desktop-shell-state.json";

type SessionIndex = {
  summaries: ChatSessionSummary[];
};

function getDataDir(): string {
  return join(app.getPath("userData"), "data");
}

function getSessionsDir(): string {
  return join(getDataDir(), SESSIONS_DIR);
}

function getIndexPath(): string {
  return join(getSessionsDir(), INDEX_FILE);
}

function getSessionPath(id: string): string {
  return join(getSessionsDir(), `${id}.json`);
}

function getUiStatePath(): string {
  return join(getDataDir(), UI_STATE_FILE);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Atomic write: write to tmp then rename */
function atomicWrite(filePath: string, data: string): void {
  const tmp = filePath + ".tmp";
  writeFileSync(tmp, data, "utf-8");
  renameSync(tmp, filePath);
}

// ── Legacy migration ──────────────────────────────────────────

function migrateLegacyStore(): void {
  const legacyPath = join(app.getPath("userData"), LEGACY_STORE_FILE);
  if (!existsSync(legacyPath)) return;

  try {
    const raw = readFileSync(legacyPath, "utf-8");
    const legacy = JSON.parse(raw) as Partial<PersistedAppState>;

    if (Array.isArray(legacy.sessions) && legacy.sessions.length > 0) {
      ensureDir(getSessionsDir());

      const summaries: ChatSessionSummary[] = [];
      for (const session of legacy.sessions) {
        atomicWrite(getSessionPath(session.id), JSON.stringify(session, null, 2));
        summaries.push(summarizeSession(session));
      }

      summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      atomicWrite(getIndexPath(), JSON.stringify({ summaries } satisfies SessionIndex, null, 2));

      if (legacy.ui) {
        atomicWrite(getUiStatePath(), JSON.stringify(legacy.ui, null, 2));
      }
    }

    // Rename legacy file to .bak
    renameSync(legacyPath, legacyPath + ".bak");
  } catch {
    // If migration fails, leave legacy file in place
  }
}

// ── Index operations ──────────────────────────────────────────

let indexCache: SessionIndex | null = null;

function readIndex(): SessionIndex {
  if (indexCache) return indexCache;

  // Attempt migration on first access
  if (!existsSync(getSessionsDir())) {
    migrateLegacyStore();
  }

  ensureDir(getSessionsDir());
  const indexPath = getIndexPath();

  if (existsSync(indexPath)) {
    try {
      const raw = readFileSync(indexPath, "utf-8");
      indexCache = JSON.parse(raw) as SessionIndex;
      return indexCache;
    } catch { /* fall through */ }
  }

  // Rebuild index from session files
  const files = readdirSync(getSessionsDir()).filter(
    (f) => f.endsWith(".json") && f !== INDEX_FILE
  );

  const summaries: ChatSessionSummary[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(getSessionsDir(), file), "utf-8");
      const session = JSON.parse(raw) as ChatSession;
      summaries.push(summarizeSession(session));
    } catch { /* skip corrupt files */ }
  }

  summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  indexCache = { summaries };
  atomicWrite(indexPath, JSON.stringify(indexCache, null, 2));
  return indexCache;
}

function writeIndex(index: SessionIndex): void {
  indexCache = index;
  ensureDir(getSessionsDir());
  atomicWrite(getIndexPath(), JSON.stringify(index, null, 2));
}

// ── Public API ────────────────────────────────────────────────

export function listSessions(): ChatSessionSummary[] {
  const index = readIndex();
  return [...index.summaries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadSession(sessionId: string): ChatSession | null {
  const filePath = getSessionPath(sessionId);
  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ChatSession;
  } catch {
    return null;
  }
}

export function saveSession(session: ChatSession): void {
  ensureDir(getSessionsDir());
  atomicWrite(getSessionPath(session.id), JSON.stringify(session, null, 2));

  // Update index
  const index = readIndex();
  const existing = index.summaries.findIndex((s) => s.id === session.id);
  const summary = summarizeSession(session);

  if (existing === -1) {
    index.summaries.unshift(summary);
  } else {
    index.summaries[existing] = summary;
  }

  index.summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  writeIndex(index);
}

export function createSession(): ChatSession {
  const session = createEmptySession();
  saveSession(session);
  return session;
}

export function deleteSession(sessionId: string): void {
  const filePath = getSessionPath(sessionId);
  if (existsSync(filePath)) {
    try { unlinkSync(filePath); } catch { /* ignore */ }
  }

  const index = readIndex();
  index.summaries = index.summaries.filter((s) => s.id !== sessionId);
  writeIndex(index);
}

export function getUiState(): WindowUiState {
  const path = getUiStatePath();
  ensureDir(getDataDir());

  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, "utf-8");
      return JSON.parse(raw) as WindowUiState;
    } catch { /* fall through */ }
  }

  return { rightPanelOpen: true };
}

export function setRightPanelOpen(open: boolean): void {
  const ui = getUiState();
  ui.rightPanelOpen = open;
  ensureDir(getDataDir());
  atomicWrite(getUiStatePath(), JSON.stringify(ui, null, 2));
}
