import * as pty from "node-pty";
import type { BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { IPC_CHANNELS } from "../shared/ipc.js";
import { getSettings } from "./settings.js";

type TerminalInstance = {
  id: string;
  ptyProcess: pty.IPty;
  cwd: string;
};

const terminals = new Map<string, TerminalInstance>();
let mainWindow: BrowserWindow | null = null;

export function setTerminalWindow(window: BrowserWindow): void {
  mainWindow = window;
}

type ResolvedShell = {
  command: string;
  args: string[];
  label: string;
};

function findExecutableOnPath(executableNames: string[]): string | null {
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return null;
  }

  const directories = pathValue.split(path.delimiter).filter(Boolean);
  for (const directory of directories) {
    for (const executableName of executableNames) {
      const fullPath = path.join(directory, executableName);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
}

function findGitBash(): string | null {
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe",
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return findExecutableOnPath(["bash.exe", "git-bash.exe"]);
}

function resolveWindowsShell(selection: string): ResolvedShell {
  switch (selection) {
    case "powershell": {
      const command =
        findExecutableOnPath(["powershell.exe", "pwsh.exe"]) ??
        "powershell.exe";
      return { command, args: [], label: "PowerShell" };
    }
    case "cmd": {
      const command = findExecutableOnPath(["cmd.exe"]) ?? "cmd.exe";
      return { command, args: [], label: "Command Prompt" };
    }
    case "git-bash": {
      const command = findGitBash();
      if (command) {
        return { command, args: ["--login", "-i"], label: "Git Bash" };
      }
      break;
    }
    case "wsl": {
      const command = findExecutableOnPath(["wsl.exe"]) ?? "wsl.exe";
      return { command, args: [], label: "WSL" };
    }
    default:
      break;
  }

  const fallback = findExecutableOnPath(["powershell.exe", "pwsh.exe"]);
  return {
    command: fallback ?? "powershell.exe",
    args: [],
    label: "PowerShell",
  };
}

function resolveShell(selection: string): ResolvedShell {
  if (process.platform === "win32") {
    return resolveWindowsShell(selection);
  }

  if (selection !== "default") {
    return {
      command: selection,
      args: [],
      label: selection,
    };
  }

  return {
    command: process.env.SHELL ?? "/bin/zsh",
    args: [],
    label: "System Shell",
  };
}

export function createTerminal(options?: { cwd?: string }): string {
  const id = crypto.randomUUID();
  const settings = getSettings();
  const cwd = options?.cwd ?? settings.workspace;
  const shell = resolveShell(settings.terminal.shell);

  const ptyProcess = pty.spawn(shell.command, shell.args, {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd,
    env: process.env as Record<string, string>,
  });

  ptyProcess.onData((data: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.terminalData, id, data);
    }
  });

  ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.terminalExit, id, exitCode);
    }
    terminals.delete(id);
  });

  terminals.set(id, { id, ptyProcess, cwd });
  return id;
}

export function writeTerminal(id: string, data: string): void {
  const term = terminals.get(id);
  if (term) term.ptyProcess.write(data);
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  const term = terminals.get(id);
  if (term) term.ptyProcess.resize(cols, rows);
}

export function destroyTerminal(id: string): void {
  const term = terminals.get(id);
  if (term) {
    term.ptyProcess.kill();
    terminals.delete(id);
  }
}

export function destroyAllTerminals(): void {
  for (const [id] of terminals) {
    destroyTerminal(id);
  }
}
