import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import type { SessionSearchResult, SessionTranscriptEvent } from "../../shared/contracts.js";
import { appLogger } from "../logger.js";
import { atomicWrite, readJsonFile } from "./io.js";
import { readMeta, type PersistedSessionMeta } from "./meta.js";
import { getDataDir, getSessionDir, getSessionsDir } from "./paths.js";

type SessionSearchDocument = {
  sessionId: string;
  title: string;
  updatedAt: string;
  archived: boolean;
  text: string;
};

type SessionSearchIndex = {
  version: 1;
  updatedAt: string;
  documents: Record<string, SessionSearchDocument>;
};

const SEARCH_INDEX_FILE = "session-search.json";

function getSearchIndexPath(): string {
  return join(getDataDir(), SEARCH_INDEX_FILE);
}

function createEmptySearchIndex(): SessionSearchIndex {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    documents: {},
  };
}

function readSearchIndex(): SessionSearchIndex {
  return readJsonFile(getSearchIndexPath(), createEmptySearchIndex());
}

function writeSearchIndex(index: SessionSearchIndex): void {
  const nextIndex: SessionSearchIndex = {
    ...index,
    updatedAt: new Date().toISOString(),
  };

  atomicWrite(getSearchIndexPath(), JSON.stringify(nextIndex, null, 2));
}

function normalizeSearchText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function loadTranscriptText(sessionId: string): string {
  const transcriptPath = join(getSessionDir(sessionId), "transcript.jsonl");
  if (!existsSync(transcriptPath)) {
    return "";
  }

  const lines = readFileSync(transcriptPath, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const parts: string[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as SessionTranscriptEvent;
      if (
        (event.type === "user_message" || event.type === "assistant_message") &&
        event.message.content.trim()
      ) {
        parts.push(event.message.content.trim());
      }
    } catch {
      continue;
    }
  }

  return parts.join("\n");
}

function loadSnapshotText(sessionId: string): string {
  const snapshotPath = join(getSessionDir(sessionId), "context-snapshot.json");
  if (!existsSync(snapshotPath)) {
    return "";
  }

  const snapshot = readJsonFile(snapshotPath, {
    summary: "",
    currentTask: null,
    learnings: [],
  }) as {
    summary?: string;
    currentTask?: string | null;
    learnings?: string[];
  };

  return [
    typeof snapshot.summary === "string" ? snapshot.summary : "",
    typeof snapshot.currentTask === "string" ? snapshot.currentTask : "",
    Array.isArray(snapshot.learnings) ? snapshot.learnings.join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildDocument(meta: PersistedSessionMeta): SessionSearchDocument | null {
  const transcriptText = loadTranscriptText(meta.id);
  const snapshotText = loadSnapshotText(meta.id);
  const text = normalizeSearchText(
    [meta.title, transcriptText, snapshotText].filter(Boolean).join("\n"),
  );

  if (!text) {
    return {
      sessionId: meta.id,
      title: meta.title,
      updatedAt: meta.updatedAt,
      archived: meta.archived === true,
      text: meta.title,
    };
  }

  return {
    sessionId: meta.id,
    title: meta.title,
    updatedAt: meta.updatedAt,
    archived: meta.archived === true,
    text,
  };
}

function tokenize(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ");

  const tokens = new Set<string>();

  for (const segment of normalized.split(/\s+/)) {
    if (!segment) continue;

    // 非中文片段：整体作为一个 token
    if (!/\p{Script=Han}/u.test(segment)) {
      tokens.add(segment);
      continue;
    }

    // 中文片段：按 bigram 切片，同时保留单字兜底
    const chars = Array.from(segment);
    if (chars.length === 1) {
      tokens.add(chars[0]);
      continue;
    }
    for (let i = 0; i < chars.length - 1; i++) {
      tokens.add(chars[i] + chars[i + 1]);
    }
  }

  return [...tokens];
}

function scoreDocument(document: SessionSearchDocument, queryTokens: string[]): number {
  if (queryTokens.length === 0) {
    return 0;
  }

  const haystack = document.text.toLowerCase();
  const title = document.title.toLowerCase();
  let score = 0;

  for (const token of queryTokens) {
    if (title.includes(token)) {
      score += 5;
      continue;
    }
    if (haystack.includes(token)) {
      score += 1;
    }
  }

  return score;
}

function buildSnippet(document: SessionSearchDocument, queryTokens: string[]): string {
  const haystack = document.text;
  const lowerHaystack = haystack.toLowerCase();
  const matchedToken = queryTokens.find((token) => lowerHaystack.includes(token));
  if (!matchedToken) {
    return haystack.slice(0, 160).trim();
  }

  const matchIndex = lowerHaystack.indexOf(matchedToken);
  const start = Math.max(0, matchIndex - 72);
  const end = Math.min(haystack.length, matchIndex + matchedToken.length + 96);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < haystack.length ? "…" : "";
  return `${prefix}${haystack.slice(start, end).trim()}${suffix}`;
}

function listSessionIdsFromDisk(): string[] {
  if (!existsSync(getSessionsDir())) {
    return [];
  }

  return readdirSync(getSessionsDir(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export function indexSessionSearchDocument(sessionId: string): void {
  const meta = readMeta(sessionId);
  const index = readSearchIndex();

  if (!meta) {
    delete index.documents[sessionId];
    writeSearchIndex(index);
    return;
  }

  const document = buildDocument(meta);
  if (!document || document.archived) {
    delete index.documents[sessionId];
    writeSearchIndex(index);
    return;
  }

  index.documents[sessionId] = document;
  writeSearchIndex(index);
}

export function removeSessionSearchDocument(sessionId: string): void {
  const index = readSearchIndex();
  if (!(sessionId in index.documents)) {
    return;
  }

  delete index.documents[sessionId];
  writeSearchIndex(index);
}

export function reindexSessionSearch(): void {
  const index = createEmptySearchIndex();

  for (const sessionId of listSessionIdsFromDisk()) {
    const meta = readMeta(sessionId);
    if (!meta) {
      continue;
    }

    const document = buildDocument(meta);
    if (!document || document.archived) {
      continue;
    }

    index.documents[sessionId] = document;
  }

  writeSearchIndex(index);
  appLogger.info({
    scope: "session.search",
    message: "会话搜索索引已重建",
    data: {
      documentCount: Object.keys(index.documents).length,
    },
  });
}

export function searchSessions(
  query: string,
  limit = 10,
): SessionSearchResult[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  const queryTokens = tokenize(trimmedQuery);
  const index = readSearchIndex();

  return Object.values(index.documents)
    .map((document) => ({
      document,
      score: scoreDocument(document, queryTokens),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.document.updatedAt.localeCompare(left.document.updatedAt);
    })
    .slice(0, Math.max(1, limit))
    .map(({ document }) => ({
      sessionId: document.sessionId,
      title: document.title,
      snippet: buildSnippet(document, queryTokens),
      updatedAt: document.updatedAt,
    }));
}
