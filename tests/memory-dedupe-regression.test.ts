import assert from "node:assert/strict";
import { classifyMemorySaveCandidate } from "../src/main/memory/dedupe.ts";

{
  const result = classifyMemorySaveCandidate(
    {
      summary: "用户偏好把长期约束写入 AGENTS.md",
      topic: "preferences",
    },
    [
      {
        summary: "用户偏好把长期约束写入 AGENTS.md",
        topic: "preferences",
      },
    ],
  );

  assert.equal(result.status, "duplicate");
}

{
  const result = classifyMemorySaveCandidate(
    {
      summary: "今天早上 8:30 在楼下买了个苹果",
      topic: "events",
    },
    [
      {
        summary: "今天早上买了个苹果",
        topic: "events",
      },
    ],
  );

  assert.equal(result.status, "merged");
  assert.equal(result.matchedSummary, "今天早上买了个苹果");
}

{
  const result = classifyMemorySaveCandidate(
    {
      summary: "今天早上 9:30 在楼下买了个苹果",
      topic: "events",
    },
    [
      {
        summary: "今天早上 8:30 在楼下买了个苹果",
        topic: "events",
      },
    ],
  );

  assert.equal(result.status, "conflict");
  assert.equal(result.matchedSummary, "今天早上 8:30 在楼下买了个苹果");
}

{
  const result = classifyMemorySaveCandidate(
    {
      summary: "项目使用 Electron 主进程承载工具执行",
      topic: "architecture",
    },
    [
      {
        summary: "用户偏好把长期约束写入 AGENTS.md",
        topic: "preferences",
      },
    ],
  );

  assert.equal(result.status, "saved");
}

console.log("memory dedupe regression tests passed");
