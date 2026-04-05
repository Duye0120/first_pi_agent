import * as pty from "node-pty";
import type { BrowserWindow } from "electron";
import { IPC_CHANNELS } from "../shared/ipc.js";
import { resolveShell } from "./shell.js";
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
