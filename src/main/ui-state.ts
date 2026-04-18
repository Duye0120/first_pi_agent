import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
import type {
  RightPanelState,
  SessionGroup,
  SessionGroupCreateInput,
  WindowUiState,
} from "../shared/contracts.js";
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

function normalizeRightPanelState(
  parsed: Partial<WindowUiState> & {
    rightPanelOpen?: boolean;
    rightPanelWidth?: number | null;
    rightPanelActiveView?: string | null;
  },
): RightPanelState {
  const parsedRightPanel = parsed.rightPanel;
  const open =
    typeof parsedRightPanel?.open === "boolean"
      ? parsedRightPanel.open
      : typeof parsed.diffPanelOpen === "boolean"
        ? parsed.diffPanelOpen
        : typeof parsed.rightPanelOpen === "boolean"
          ? parsed.rightPanelOpen
          : false;
  const activeView = parsedRightPanel?.activeView === "diff" ? "diff" : "diff";
  const widthCandidate =
    typeof parsedRightPanel?.width === "number" && Number.isFinite(parsedRightPanel.width)
      ? parsedRightPanel.width
      : typeof parsed.rightPanelWidth === "number" && Number.isFinite(parsed.rightPanelWidth)
        ? parsed.rightPanelWidth
        : null;

  return {
    open,
    activeView,
    width: widthCandidate,
  };
}

function normalizeUiState(
  parsed: Partial<WindowUiState> & {
    rightPanelOpen?: boolean;
    rightPanelWidth?: number | null;
    rightPanelActiveView?: string | null;
  },
): WindowUiState {
  const rightPanel = normalizeRightPanelState(parsed);

  return {
    diffPanelOpen: rightPanel.open && rightPanel.activeView === "diff",
    rightPanel,
  };
}

export function getUiState(): WindowUiState {
  const filePath = getUiStatePath();
  const parsed = readJsonFile<
    Partial<WindowUiState> & {
      rightPanelOpen?: boolean;
      rightPanelWidth?: number | null;
      rightPanelActiveView?: string | null;
    }
  >(filePath, {});

  return normalizeUiState(parsed);
}

function writeUiState(ui: WindowUiState): void {
  atomicWrite(getUiStatePath(), JSON.stringify(normalizeUiState(ui), null, 2));
}

export function setDiffPanelOpen(open: boolean): void {
  const ui = getUiState();
  ui.rightPanel.open = open;
  ui.rightPanel.activeView = "diff";
  ui.diffPanelOpen = open;
  writeUiState(ui);
}

export function setRightPanelState(partial: Partial<RightPanelState>): void {
  const ui = getUiState();
  ui.rightPanel = {
    ...ui.rightPanel,
    ...partial,
    activeView: "diff",
  };
  ui.diffPanelOpen = ui.rightPanel.open && ui.rightPanel.activeView === "diff";
  writeUiState(ui);
}

export function listGroups(): SessionGroup[] {
  const groups = readJsonFile(getGroupsPath(), [] as Array<Partial<SessionGroup>>);
  return groups
    .filter((group) => typeof group.id === "string" && typeof group.name === "string")
    .map((group) => ({
      id: group.id as string,
      name: group.name as string,
      path: typeof group.path === "string" ? group.path : "",
    }));
}

function writeGroups(groups: SessionGroup[]): void {
  atomicWrite(getGroupsPath(), JSON.stringify(groups, null, 2));
}

export function createGroup(input: SessionGroupCreateInput): SessionGroup {
  const trimmedName = input.name.trim();
  const trimmedPath = input.path.trim();
  if (!trimmedName) {
    throw new Error("分组名不能为空。");
  }
  if (!trimmedPath) {
    throw new Error("项目目录不能为空。");
  }

  const group: SessionGroup = {
    id: randomUUID(),
    name: trimmedName,
    path: trimmedPath,
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
