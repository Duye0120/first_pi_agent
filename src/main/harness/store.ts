import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
          runKind: run.runKind ?? "chat",
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
