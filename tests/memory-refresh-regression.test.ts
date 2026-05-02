import assert from "node:assert/strict";
import { createMemoryRefreshQueue } from "../src/main/memory/pipeline.ts";

{
  const runs: string[] = [];
  const queue = createMemoryRefreshQueue(async (input) => {
    runs.push(`${input.sessionId}:${input.sourceRunId}`);
    return {
      sessionId: input.sessionId,
      sourceRunId: input.sourceRunId,
      status: "completed",
      extractedCount: 1,
      acceptedCount: 1,
      savedCount: 1,
      duplicateCount: 0,
      mergedCount: 0,
      conflictCount: 0,
      vectorWrittenCount: 1,
      vectorFailedCount: 0,
      completedAt: "2026-04-30T10:00:00.000Z",
    };
  });

  const first = queue.schedule({ sessionId: "s1", sourceRunId: "r1" });
  const second = queue.schedule({ sessionId: "s1", sourceRunId: "r1" });
  assert.equal(first, second);

  const [firstReport, secondReport] = await Promise.all([first, second]);
  assert.equal(firstReport, secondReport);
  assert.deepEqual(runs, ["s1:r1"]);

  await queue.schedule({ sessionId: "s1", sourceRunId: "r1" });
  assert.deepEqual(runs, ["s1:r1", "s1:r1"]);
}

console.log("memory refresh regression tests passed");
