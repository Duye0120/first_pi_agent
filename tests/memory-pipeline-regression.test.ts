import assert from "node:assert/strict";
import {
  createMemoryPipeline,
  filterMemoryCandidates,
  formatMemoryPromptSection,
} from "../src/main/memory/pipeline.ts";
import type { MemorySearchResult } from "../src/shared/contracts.ts";

const now = "2026-04-30T10:00:00.000Z";

function createSearchResult(
  id: number,
  content: string,
  score: number,
): MemorySearchResult {
  return {
    id,
    content,
    metadata: {
      source: "memory_save",
      topic: "preferences",
      memdirStatus: "saved",
      tags: ["preferences"],
    },
    createdAt: now,
    matchCount: 0,
    feedbackScore: 0,
    lastMatchedAt: null,
    score,
    rankScore: score,
  };
}

{
  const filtered = filterMemoryCandidates([
    {
      content: "用户偏好被称呼为老板",
      topic: "preferences",
      tags: ["preferences"],
      confidence: 0.95,
    },
    {
      content: "本轮正在讨论记忆系统 plan",
      topic: "workflow",
      tags: ["temporary"],
      confidence: 0.9,
    },
    {
      content: "今天天气不错",
      topic: "general",
      tags: ["smalltalk"],
      confidence: 0.9,
    },
  ]);

  assert.deepEqual(
    filtered.map((item) => item.content),
    ["用户偏好被称呼为老板"],
  );
}

{
  const section = formatMemoryPromptSection({
    query: "怎么称呼我",
    vectorResults: [
      createSearchResult(1, "用户偏好被称呼为老板", 0.91),
      createSearchResult(2, "无关记忆", 0.5),
    ],
    memdirResults: [
      {
        summary: "用户偏好直接、克制的回答",
        topic: "preferences",
        score: 1,
      },
    ],
    minScore: 0.65,
  });

  assert.match(section, /## 向量记忆检索结果/);
  assert.match(section, /用户偏好被称呼为老板/);
  assert.doesNotMatch(section, /无关记忆/);
  assert.match(section, /## 与当前话题相关的文件记忆/);
}

{
  const memdirSaves: Array<{ summary: string; topic: string }> = [];
  const vectorAdds: Array<{ content: string; sourceRunId?: string }> = [];
  const pipeline = createMemoryPipeline({
    saveMemdir(input) {
      memdirSaves.push({ summary: input.summary, topic: input.topic });
      return {
        summary: input.summary,
        topic: input.topic,
        source: input.source ?? "agent",
        status: "saved",
        reason: "new-memory",
      };
    },
    addVector: async (input) => {
      vectorAdds.push({
        content: input.content,
        sourceRunId: typeof input.metadata?.sourceRunId === "string"
          ? input.metadata.sourceRunId
          : undefined,
      });
      return { status: "written" };
    },
    searchVector: async () => [],
    searchMemdir: () => [],
    rewriteQuery: async (query) => query,
  });

  const result = await pipeline.saveCandidate(
    {
      content: "用户偏好被称呼为老板",
      topic: "preferences",
      detail: "用户明确说“以后叫我老板”。",
      tags: ["preferences"],
      confidence: 0.98,
      sessionId: "session-1",
      sourceRunId: "run-1",
    },
    "auto_refresh",
  );

  assert.equal(result.entry.status, "saved");
  assert.equal(result.vector.status, "written");
  assert.deepEqual(memdirSaves, [
    { summary: "用户偏好被称呼为老板", topic: "preferences" },
  ]);
  assert.deepEqual(vectorAdds, [
    {
      content: "用户偏好被称呼为老板\n\n用户明确说“以后叫我老板”。",
      sourceRunId: "run-1",
    },
  ]);
}

{
  const pipeline = createMemoryPipeline({
    saveMemdir(input) {
      return {
        summary: input.summary,
        topic: input.topic,
        source: input.source ?? "agent",
        status: "saved",
        reason: "new-memory",
      };
    },
    addVector: async () => ({ status: "written" }),
    searchVector: async () => {
      throw new Error("embedding unavailable");
    },
    searchMemdir: () => [
      {
        summary: "用户偏好直接、克制的回答",
        topic: "preferences",
        score: 1,
      },
    ],
    rewriteQuery: async (query) => query,
  });

  const result = await pipeline.retrieveForTurn({
    query: "怎么回复我",
    minScore: 0.65,
  });

  assert.match(result.promptSection, /## 与当前话题相关的文件记忆/);
  assert.match(result.promptSection, /用户偏好直接、克制的回答/);
  assert.deepEqual(result.vectorResults, []);
}

{
  let memdirQuery = "";
  const pipeline = createMemoryPipeline({
    saveMemdir(input) {
      return {
        summary: input.summary,
        topic: input.topic,
        source: input.source ?? "agent",
        status: "saved",
        reason: "new-memory",
      };
    },
    addVector: async () => ({ status: "written" }),
    searchVector: async () => [],
    searchMemdir: (query) => {
      memdirQuery = query;
      return [];
    },
    rewriteQuery: async () => {
      throw new Error("rewrite unavailable");
    },
  });

  const result = await pipeline.retrieveForTurn({
    query: "保留原始查询",
    minScore: 0.65,
  });

  assert.equal(result.rewrittenQuery, "保留原始查询");
  assert.equal(memdirQuery, "保留原始查询");
}

console.log("memory pipeline regression tests passed");
