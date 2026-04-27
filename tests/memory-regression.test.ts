import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeMemoryMetadata } from "../src/main/memory/metadata.ts";
import { cosineSimilarity, QueryVectorCache, rankMemories } from "../src/main/memory/retrieval.ts";
import { MemoryStore } from "../src/main/memory/store.ts";

function withTempDir(test: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chela-memory-"));
  try {
    test(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

{
  const metadata = normalizeMemoryMetadata({
    source: " user ",
    tags: ["Agent", "agent", "workflow", "", "x".repeat(60)],
    sessionId: " session-1 ",
    messageId: "message-1",
    unsafeKey: "line\nbreak",
    "bad key": "ignored",
    score: 3,
    enabled: true,
  });

  assert.deepEqual(metadata, {
    source: "user",
    tags: ["Agent", "workflow"],
    sessionId: "session-1",
    messageId: "message-1",
    score: 3,
    enabled: true,
  });
}

{
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1], [1, 0]), 0);
}

{
  const ranked = rankMemories(
    [1, 0],
    [
      {
        id: 1,
        content: "agent runtime",
        embedding: JSON.stringify([0.9, 0.1]),
        metadata: { tags: ["agent"] },
        createdAt: "2026-04-27T00:00:00.000Z",
        matchCount: 0,
        feedbackScore: 0,
        lastMatchedAt: null,
      },
      {
        id: 2,
        content: "unrelated",
        embedding: JSON.stringify([0, 1]),
        metadata: null,
        createdAt: "2026-04-27T00:00:00.000Z",
        matchCount: 100,
        feedbackScore: 100,
        lastMatchedAt: null,
      },
    ],
    5,
  );

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].id, 1);
  assert.ok(ranked[0].score > 0.99);
}

{
  const cache = new QueryVectorCache(2);
  cache.set(" Hello ", "model-a", [1]);
  assert.deepEqual(cache.get("hello", "model-a"), [1]);
  cache.set("second", "model-a", [2]);
  cache.set("third", "model-a", [3]);
  assert.equal(cache.get("hello", "model-a"), null);
  assert.deepEqual(cache.get("third", "model-a"), [3]);
}

function runStoreRegression(): void {
  withTempDir((dir) => {
    const store = new MemoryStore(path.join(dir, "memory.sqlite"));
    try {
      const first = store.add(
        {
          content: "用户偏好 TypeScript 和 pnpm",
          metadata: { source: "manual", tags: ["preference", "tooling"] },
        },
        [1, 0, 0],
        "test-model",
      );
      const second = store.add(
        {
          content: "项目使用 Electron",
          metadata: { source: "manual", tags: ["project"] },
        },
        [0, 1, 0],
        "test-model",
      );

      assert.equal(first.id, 1);
      assert.equal(second.id, 2);
      assert.equal(store.getStats().totalMemories, 2);

      const candidates = store.listAllCandidates();
      assert.equal(candidates.length, 2);
      assert.deepEqual(candidates[0].metadata?.tags, ["preference", "tooling"]);

      store.recordMatches([first.id, first.id, second.id]);
      assert.equal(store.getStats().totalMatches, 2);
      assert.equal(store.adjustFeedback(first.id, 2), true);

      const byConfidence = store.listMemories({ sort: "confidence_desc", limit: 2 });
      assert.equal(byConfidence[0].id, first.id);
      assert.equal(byConfidence[0].matchCount, 1);
      assert.equal(byConfidence[0].feedbackScore, 2);

      assert.equal(store.adjustFeedback(first.id, -3), true);
      const afterDownvote = store.listMemories({ sort: "feedback_score_desc", limit: 2 });
      assert.equal(afterDownvote.find((item) => item.id === first.id)?.feedbackScore, -1);

      assert.equal(store.deleteMemory(first.id), true);
      assert.equal(store.deleteMemory(first.id), false);
      assert.equal(store.getStats().totalMemories, 1);
      assert.deepEqual(
        store.listAllCandidates().map((item) => item.id),
        [second.id],
      );
    } finally {
      store.close();
    }
  });
}

try {
  runStoreRegression();
} catch (error) {
  if (
    error instanceof Error &&
    error.message.includes("NODE_MODULE_VERSION") &&
    error.message.includes("better_sqlite3.node")
  ) {
    console.warn(
      "memory store regression skipped: better-sqlite3 native module needs rebuild for the active Node.js version.",
    );
  } else {
    throw error;
  }
}

console.log("memory regression tests passed");
