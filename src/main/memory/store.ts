import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  MemoryAddInput,
  MemoryListSort,
  MemoryListInput,
  MemoryMetadata,
  MemoryRecord,
} from "../../shared/contracts.js";
import { normalizeMemoryMetadata } from "./metadata.js";

type MemoryRow = {
  id: number;
  content: string;
  embedding: string;
  metadata: string | null;
  created_at: string;
  match_count: number | null;
  feedback_score: number | null;
  last_matched_at: string | null;
};

type MemoryMetaRow = {
  value: string;
};

export type MemoryStoreStats = {
  totalMemories: number;
  totalMatches: number;
  indexedModelId: string | null;
  lastIndexedAt: string | null;
  lastRebuiltAt: string | null;
};

export type StoredMemoryCandidate = {
  id: number;
  content: string;
  embedding: string;
  metadata: MemoryMetadata | null;
  createdAt: string;
  matchCount: number;
  feedbackScore: number;
  lastMatchedAt: string | null;
};

export type StoredMemoryEmbeddingUpdate = {
  id: number;
  embedding: number[];
};

const MEMORY_LIST_ORDER_BY: Record<MemoryListSort, string> = {
  created_desc: "created_at DESC, id DESC",
  last_matched_desc:
    "last_matched_at IS NULL ASC, last_matched_at DESC, created_at DESC, id DESC",
  match_count_desc: "match_count DESC, created_at DESC, id DESC",
  feedback_score_desc: "feedback_score DESC, created_at DESC, id DESC",
  confidence_desc:
    "(match_count + feedback_score) DESC, match_count DESC, created_at DESC, id DESC",
};

function ensureParentDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

function parseMetadata(value: string | null): MemoryMetadata | null {
  if (!value) {
    return null;
  }

  try {
    return normalizeMemoryMetadata(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

function normalizeRecord(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    content: row.content,
    metadata: parseMetadata(row.metadata),
    createdAt: row.created_at,
    matchCount: row.match_count ?? 0,
    feedbackScore: row.feedback_score ?? 0,
    lastMatchedAt: row.last_matched_at ?? null,
  };
}

function matchesTextFilter(value: unknown, expected: string | undefined): boolean {
  if (!expected?.trim()) {
    return true;
  }
  return typeof value === "string" && value.toLowerCase() === expected.trim().toLowerCase();
}

function matchesListFilters(
  record: MemoryRecord,
  filters: MemoryListInput | undefined,
): boolean {
  const metadata = record.metadata;
  if (!filters) {
    return true;
  }

  if (
    filters.status &&
    filters.status !== "all" &&
    metadata?.memdirStatus !== filters.status
  ) {
    return false;
  }
  if (!matchesTextFilter(metadata?.topic, filters.topic)) {
    return false;
  }
  if (
    filters.source?.trim() &&
    metadata?.source !== filters.source &&
    metadata?.pipelineSource !== filters.source
  ) {
    return false;
  }
  if (
    typeof filters.minConfidence === "number" &&
    typeof metadata?.confidence === "number" &&
    metadata.confidence < filters.minConfidence
  ) {
    return false;
  }
  if (
    typeof filters.minConfidence === "number" &&
    typeof metadata?.confidence !== "number"
  ) {
    return false;
  }

  return true;
}

export class MemoryStore {
  private readonly db: Database.Database;

  constructor(private readonly dbPath: string) {
    ensureParentDir(dbPath);
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        embedding TEXT NOT NULL,
        metadata TEXT,
        match_count INTEGER NOT NULL DEFAULT 0,
        feedback_score INTEGER NOT NULL DEFAULT 0,
        last_matched_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_memories_created_at
      ON memories (created_at DESC);

      CREATE TABLE IF NOT EXISTS memory_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    this.ensureColumn("memories", "match_count", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("memories", "feedback_score", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("memories", "last_matched_at", "DATETIME");
  }

  getPath(): string {
    return this.dbPath;
  }

  close(): void {
    this.db.close();
  }

  add(
    input: MemoryAddInput,
    embedding: number[],
    modelId: string,
  ): MemoryRecord {
    const normalizedMetadata = normalizeMemoryMetadata(input.metadata);
    const metadataJson = normalizedMetadata
      ? JSON.stringify(normalizedMetadata)
      : null;
    const embeddingJson = JSON.stringify(embedding);
    const insert = this.db.prepare(`
      INSERT INTO memories (content, embedding, metadata)
      VALUES (?, ?, ?)
    `);
    const result = insert.run(input.content, embeddingJson, metadataJson);
    this.setMeta("indexed_model_id", modelId);
    this.setMeta("last_indexed_at", new Date().toISOString());

    const row = this.db
      .prepare(`
        SELECT id, content, embedding, metadata, created_at
          , match_count, feedback_score, last_matched_at
        FROM memories
        WHERE id = ?
      `)
      .get(result.lastInsertRowid) as MemoryRow | undefined;

    if (!row) {
      throw new Error("Memory inserted but could not be reloaded.");
    }

    return normalizeRecord(row);
  }

  addMany(
    entries: Array<{ input: MemoryAddInput; embedding: number[] }>,
    modelId: string,
  ): number {
    if (entries.length === 0) {
      return 0;
    }

    const insert = this.db.prepare(`
      INSERT INTO memories (content, embedding, metadata)
      VALUES (?, ?, ?)
    `);
    const transaction = this.db.transaction(
      (
        batch: Array<{
          input: MemoryAddInput;
          embedding: number[];
        }>,
      ) => {
        for (const entry of batch) {
          const normalizedMetadata = normalizeMemoryMetadata(entry.input.metadata);
          insert.run(
            entry.input.content,
            JSON.stringify(entry.embedding),
            normalizedMetadata ? JSON.stringify(normalizedMetadata) : null,
          );
        }
      },
    );

    transaction(entries);
    this.setMeta("indexed_model_id", modelId);
    this.setMeta("last_indexed_at", new Date().toISOString());

    return entries.length;
  }

  listCandidates(limit: number): StoredMemoryCandidate[] {
    const rows = this.db
      .prepare(`
        SELECT id, content, embedding, metadata, created_at
          , match_count, feedback_score, last_matched_at
        FROM memories
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(limit) as MemoryRow[];

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      embedding: row.embedding,
      metadata: parseMetadata(row.metadata),
      createdAt: row.created_at,
      matchCount: row.match_count ?? 0,
      feedbackScore: row.feedback_score ?? 0,
      lastMatchedAt: row.last_matched_at ?? null,
    }));
  }

  listAllCandidates(): StoredMemoryCandidate[] {
    const rows = this.db
      .prepare(`
        SELECT id, content, embedding, metadata, created_at
          , match_count, feedback_score, last_matched_at
        FROM memories
        ORDER BY id ASC
      `)
      .all() as MemoryRow[];

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      embedding: row.embedding,
      metadata: parseMetadata(row.metadata),
      createdAt: row.created_at,
      matchCount: row.match_count ?? 0,
      feedbackScore: row.feedback_score ?? 0,
      lastMatchedAt: row.last_matched_at ?? null,
    }));
  }

  listMemories(input: {
    sort: MemoryListSort;
    limit: number;
    filters?: MemoryListInput;
  }): MemoryRecord[] {
    const orderBy = MEMORY_LIST_ORDER_BY[input.sort];
    const hasFilters =
      (!!input.filters?.status && input.filters.status !== "all") ||
      !!input.filters?.source?.trim() ||
      !!input.filters?.topic?.trim() ||
      typeof input.filters?.minConfidence === "number";
    const scanLimit = hasFilters ? -1 : input.limit;
    const rows = this.db
      .prepare(`
        SELECT id, content, embedding, metadata, created_at
          , match_count, feedback_score, last_matched_at
        FROM memories
        ORDER BY ${orderBy}
        LIMIT ?
      `)
      .all(scanLimit) as MemoryRow[];

    const records = rows.map(normalizeRecord);
    if (!hasFilters) {
      return records;
    }

    return records
      .filter((record) => matchesListFilters(record, input.filters))
      .slice(0, input.limit);
  }

  recordMatches(memoryIds: number[]): void {
    const uniqueIds = Array.from(
      new Set(memoryIds.filter((id) => Number.isInteger(id) && id > 0)),
    );
    if (uniqueIds.length === 0) {
      return;
    }

    const update = this.db.prepare(`
      UPDATE memories
      SET
        match_count = match_count + 1,
        last_matched_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const transaction = this.db.transaction((ids: number[]) => {
      for (const id of ids) {
        update.run(id);
      }
    });

    transaction(uniqueIds);
  }

  adjustFeedback(memoryId: number, delta: number): boolean {
    if (!Number.isInteger(memoryId) || memoryId <= 0 || !Number.isFinite(delta)) {
      return false;
    }

    const result = this.db
      .prepare(`
        UPDATE memories
        SET feedback_score = feedback_score + ?
        WHERE id = ?
      `)
      .run(Math.trunc(delta), memoryId);
    return result.changes > 0;
  }

  deleteMemory(memoryId: number): boolean {
    if (!Number.isInteger(memoryId) || memoryId <= 0) {
      return false;
    }

    const result = this.db
      .prepare(`
        DELETE FROM memories
        WHERE id = ?
      `)
      .run(memoryId);
    return result.changes > 0;
  }

  rebuildEmbeddings(
    updates: StoredMemoryEmbeddingUpdate[],
    modelId: string,
  ): number {
    if (updates.length === 0) {
      this.setMeta("indexed_model_id", modelId);
      this.setMeta("last_rebuilt_at", new Date().toISOString());
      return 0;
    }

    const update = this.db.prepare(`
      UPDATE memories
      SET embedding = ?
      WHERE id = ?
    `);

    const transaction = this.db.transaction(
      (items: StoredMemoryEmbeddingUpdate[]) => {
        for (const item of items) {
          update.run(JSON.stringify(item.embedding), item.id);
        }
      },
    );

    transaction(updates);
    this.setMeta("indexed_model_id", modelId);
    this.setMeta("last_indexed_at", new Date().toISOString());
    this.setMeta("last_rebuilt_at", new Date().toISOString());

    return updates.length;
  }

  getStats(): MemoryStoreStats {
    const row = this.db
      .prepare(`
        SELECT
          COUNT(*) as total,
          COALESCE(SUM(match_count), 0) as totalMatches
        FROM memories
      `)
      .get() as { total: number; totalMatches: number };

    return {
      totalMemories: row.total,
      totalMatches: row.totalMatches,
      indexedModelId: this.getMeta("indexed_model_id"),
      lastIndexedAt: this.getMeta("last_indexed_at"),
      lastRebuiltAt: this.getMeta("last_rebuilt_at"),
    };
  }

  private getMeta(key: string): string | null {
    const row = this.db
      .prepare(`
        SELECT value
        FROM memory_meta
        WHERE key = ?
      `)
      .get(key) as MemoryMetaRow | undefined;

    return row?.value ?? null;
  }

  private ensureColumn(tableName: string, columnName: string, ddl: string): void {
    const columns = this.db
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as Array<{ name: string }>;
    if (columns.some((column) => column.name === columnName)) {
      return;
    }

    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${ddl}`);
  }

  private setMeta(key: string, value: string): void {
    this.db
      .prepare(`
        INSERT INTO memory_meta (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `)
      .run(key, value);
  }
}
