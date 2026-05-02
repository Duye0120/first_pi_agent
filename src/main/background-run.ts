import { randomUUID } from "node:crypto";
import type { RunKind, RunSource } from "../shared/contracts.js";
import { buildSystemOwnerId } from "./agent-owners.js";
import { harnessRuntime } from "./harness/singleton.js";
import {
  appendRunFinishedEvent,
  appendRunStartedEvent,
} from "./session/service.js";

type ScheduledRunScope = {
  sessionId: string;
  runId: string;
};

type ExecuteScheduledRunInput<T> = {
  sessionId: string;
  lane: "foreground" | "background";
  runKind: RunKind;
  runSource: RunSource;
  modelEntryId: string;
  thinkingLevel: string;
  ownerId?: string;
  runIdPrefix?: string;
  metadata?: Record<string, unknown>;
  execute: (context: {
    runScope: ScheduledRunScope;
    lane: "foreground" | "background";
    runKind: RunKind;
    runSource: RunSource;
    ownerId: string;
  }) => Promise<T>;
};

type ExecuteBackgroundRunInput<T> = {
  sessionId: string;
  runKind: Extract<RunKind, "compact" | "system" | "memory_refresh" | "subagent">;
  modelEntryId: string;
  thinkingLevel: string;
  ownerId?: string;
  runIdPrefix?: string;
  metadata?: Record<string, unknown>;
  execute: (runScope: ScheduledRunScope) => Promise<T>;
};

export async function executeScheduledRun<T>(
  input: ExecuteScheduledRunInput<T>,
): Promise<T> {
  const ownerId = input.ownerId ?? buildSystemOwnerId(input.runKind);
  const runId = `${input.runIdPrefix ?? input.runKind}-${randomUUID()}`;
  const runScope = {
    sessionId: input.sessionId,
    runId,
  };

  harnessRuntime.createRun({
    ...runScope,
    ownerId,
    modelEntryId: input.modelEntryId,
    runKind: input.runKind,
    runSource: input.runSource,
    lane: input.lane,
    metadata: input.metadata,
  });

  appendRunStartedEvent({
    sessionId: input.sessionId,
    runId,
    ownerId,
    runKind: input.runKind,
    modelEntryId: input.modelEntryId,
    thinkingLevel: input.thinkingLevel,
    metadata: input.metadata,
  });

  try {
    const result = await input.execute({
      runScope,
      lane: input.lane,
      runKind: input.runKind,
      runSource: input.runSource,
      ownerId,
    });
    appendRunFinishedEvent({
      sessionId: input.sessionId,
      runId,
      ownerId,
      finalState: "completed",
    });
    harnessRuntime.finishRun(runScope, "completed");
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : `${input.runKind} 失败`;
    appendRunFinishedEvent({
      sessionId: input.sessionId,
      runId,
      ownerId,
      finalState: "failed",
      reason,
    });
    harnessRuntime.finishRun(runScope, "failed", {
      reason,
    });
    throw error;
  }
}

export async function executeBackgroundRun<T>(
  input: ExecuteBackgroundRunInput<T>,
): Promise<T> {
  return executeScheduledRun({
    ...input,
    lane: "background",
    runSource: "system",
    execute: async ({ runScope }) => input.execute(runScope),
  });
}
