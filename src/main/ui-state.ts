import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
import type { SessionGroup, WindowUiState } from "../shared/contracts.js";
import {
  listPersistedArchivedSessions,
  listPersistedSessions,
  setPersistedSessionGroup,
} from "./session/service.js";

const UI_STATE_FILE = "ui-state.json";
const GROUPS_FILE = "groups.json";

function getDataDir(): string {
  return join(app.getPath("userData"), "data");
}

function getUiStatePath(): string {
  return join(getDataDir(), UI_STATE_FILE);
}

function getGroupsPath(): string {
  return join(getDataDir(), GROUPS_FILE);
}

function ensureParentDir(filePath: string): void {
  const parent = dirname(filePath);
  if (parent && !existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
}

function atomicWrite(filePath: string, data: string): void {
  ensureParentDir(filePath);
  const tmpPath = filePath + ".tmp";
  writeFileSync(tmpPath, data, "utf-8");
  renameSync(tmpPath, filePath);
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export function getUiState(): WindowUiState {
  const filePath = getUiStatePath();
  const parsed = readJsonFile<
    Partial<WindowUiState> & {
      rightPanelOpen?: boolean;
    }
  >(filePath, {});

  return {
    diffPanelOpen:
      typeof parsed.diffPanelOpen === "boolean"
        ? parsed.diffPanelOpen
        : typeof parsed.rightPanelOpen === "boolean"
          ? parsed.rightPanelOpen
          : false,
  };
}

function writeUiState(ui: WindowUiState): void {
  atomicWrite(getUiStatePath(), JSON.stringify(ui, null, 2));
}

export function setDiffPanelOpen(open: boolean): void {
  const ui = getUiState();
  ui.diffPanelOpen = open;
  writeUiState(ui);
}

export function listGroups(): SessionGroup[] {
  return readJsonFile(getGroupsPath(), [] as SessionGroup[]);
}

function writeGroups(groups: SessionGroup[]): void {
  atomicWrite(getGroupsPath(), JSON.stringify(groups, null, 2));
}

export function createGroup(name: string): SessionGroup {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("分组名不能为空。");
  }

  const group: SessionGroup = {
    id: randomUUID(),
    name: trimmedName,
  };
  const groups = listGroups();
  groups.push(group);
  writeGroups(groups);
  return group;
}

export function renameGroup(groupId: string, name: string): void {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return;
  }

  const groups = listGroups();
  const group = groups.find((item) => item.id === groupId);
  if (!group) {
    return;
  }

  group.name = trimmedName;
  writeGroups(groups);
}

export function deleteGroup(groupId: string): void {
  const summaries = [...listPersistedSessions(), ...listPersistedArchivedSessions()];
  for (const summary of summaries) {
    if (summary.groupId === groupId) {
      setPersistedSessionGroup(summary.id, null);
    }
  }

  writeGroups(listGroups().filter((group) => group.id !== groupId));
}
