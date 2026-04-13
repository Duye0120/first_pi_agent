import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PRIMARY_AGENT_OWNER, buildSystemOwnerId } from "../agent-owners.js";
import type { RunKind, RunSource } from "../../shared/contracts.js";
import type { HarnessRunSnapshot } from "./types.js";

type PersistedHarnessRuns = {
  runs: HarnessRunSnapshot[];
};

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function getHarnessRunsPath(): string {
  return join(app.getPath("userData"), "data", "harness-runs.json");
}

function atomicWrite(filePath: string, data: string): void {
  ensureDir(dirname(filePath));
  const tempPath = filePath + ".tmp";
  writeFileSync(tempPath, data, "utf-8");
  renameSync(tempPath, filePath);
}

export function loadPersistedHarnessRuns(): HarnessRunSnapshot[] {
  const filePath = getHarnessRunsPath();
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<PersistedHarnessRuns>;
    return Array.isArray(parsed.runs)
      ? parsed.runs.map((run) => ({
          ...run,
          ownerId: typeof run.ownerId === "string" && run.ownerId.trim()
            ? run.ownerId
            : run.runKind === "chat"
              ? PRIMARY_AGENT_OWNER
              : buildSystemOwnerId(run.runKind ?? "system"),
          runKind: (run.runKind ?? "chat") as RunKind,
          runSource:
            (run.runSource as RunSource | undefined) ??
            ((run.lane ?? "foreground") === "foreground" ? "user" : "system"),
          lane: run.lane ?? "foreground",
          pendingApproval: run.pendingApproval
            ? {
                requestId:
                  typeof run.pendingApproval.requestId === "string" &&
                  run.pendingApproval.requestId.trim()
                    ? run.pendingApproval.requestId
                    : `recovered-${run.runId}`,
                kind: run.pendingApproval.kind,
                payloadHash: run.pendingApproval.payloadHash,
                reason: run.pendingApproval.reason,
                createdAt: run.pendingApproval.createdAt,
                title:
                  typeof run.pendingApproval.title === "string" &&
                  run.pendingApproval.title.trim()
                    ? run.pendingApproval.title
                    : "恢复待确认操作",
                description:
                  typeof run.pendingApproval.description === "string" &&
                  run.pendingApproval.description.trim()
                    ? run.pendingApproval.description
                    : run.pendingApproval.reason,
                detail:
                  typeof run.pendingApproval.detail === "string"
                    ? run.pendingApproval.detail
                    : undefined,
              }
            : undefined,
        }))
      : [];
  } catch {
    return [];
  }
}

export function savePersistedHarnessRuns(runs: HarnessRunSnapshot[]): void {
  const filePath = getHarnessRunsPath();
  atomicWrite(
    filePath,
    JSON.stringify({ runs } satisfies PersistedHarnessRuns, null, 2),
  );
}
