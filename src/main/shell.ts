import fs from "node:fs";
import path from "node:path";

export type ShellFamily =
  | "powershell"
  | "cmd"
  | "git-bash"
  | "wsl"
  | "posix"
  | "custom";

export type ResolvedShell = {
  command: string;
  args: string[];
  label: string;
  family: ShellFamily;
};

type ShellSpawn = {
  command: string;
  args: string[];
};

function getPathValue(): string {
  return process.env.PATH ?? process.env.Path ?? "";
}

function normalizeExecutablePath(fullPath: string, executableName: string): string {
  return fullPath.toLowerCase().includes("\\windowsapps\\")
    ? executableName
    : fullPath;
}

function findExistingPath(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function findExecutableOnPath(executableNames: string[]): string | null {
  const pathValue = getPathValue();
  if (!pathValue) {
    return null;
  }

  const directories = pathValue.split(path.delimiter).filter(Boolean);
  for (const directory of directories) {
    for (const executableName of executableNames) {
      const fullPath = path.join(directory, executableName);
      if (fs.existsSync(fullPath)) {
        return normalizeExecutablePath(fullPath, executableName);
      }
      try {
        // App Execution Aliases in WindowsApps often throw EACCES and return false in existsSync
        fs.statSync(fullPath);
      } catch (err: any) {
        if ((err.code === "EACCES" || err.code === "EPERM") && fullPath.toLowerCase().includes("\\windowsapps\\")) {
          return normalizeExecutablePath(fullPath, executableName);
        }
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

  return findExistingPath(candidates) ?? findExecutableOnPath(["bash.exe", "git-bash.exe"]);
}

function findPowerShellExecutable(): string | null {
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";

  return (
    findExistingPath([
      path.join(programFiles, "PowerShell", "7", "pwsh.exe"),
      path.join(programFiles, "PowerShell", "7-preview", "pwsh.exe"),
    ]) ??
    findExecutableOnPath(["pwsh.exe"]) ??
    findExistingPath([
      path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ]) ??
    findExecutableOnPath(["powershell.exe"])
  );
}

function inferShellFamily(command: string): ShellFamily {
  const executable = path.basename(command).toLowerCase();

  if (executable === "pwsh" || executable === "pwsh.exe" || executable === "powershell.exe") {
    return "powershell";
  }

  if (executable === "cmd" || executable === "cmd.exe") {
    return "cmd";
  }

  if (executable === "wsl" || executable === "wsl.exe") {
    return "wsl";
  }

  if (
    executable === "bash" ||
    executable === "bash.exe" ||
    executable === "zsh" ||
    executable === "zsh.exe" ||
    executable === "sh" ||
    executable === "sh.exe"
  ) {
    return "posix";
  }

  return process.platform === "win32" ? "custom" : "posix";
}

function resolveWindowsShell(selection: string): ResolvedShell {
  switch (selection) {
    case "powershell":
    case "default": {
      const command = findPowerShellExecutable() ?? "powershell.exe";
      return { command, args: [], label: "PowerShell", family: "powershell" };
    }
    case "cmd": {
      const command = process.env.ComSpec ?? findExecutableOnPath(["cmd.exe"]) ?? "cmd.exe";
      return { command, args: [], label: "Command Prompt", family: "cmd" };
    }
    case "git-bash": {
      const command = findGitBash();
      if (command) {
        return { command, args: ["--login", "-i"], label: "Git Bash", family: "git-bash" };
      }
      break;
    }
    case "wsl": {
      const command = findExecutableOnPath(["wsl.exe"]) ?? "wsl.exe";
      return { command, args: [], label: "WSL", family: "wsl" };
    }
    default:
      if (selection.trim()) {
        return {
          command: selection,
          args: [],
          label: path.basename(selection) || selection,
          family: inferShellFamily(selection),
        };
      }
      break;
  }

  const fallback = findPowerShellExecutable() ?? "powershell.exe";
  return {
    command: fallback,
    args: [],
    label: "PowerShell",
    family: "powershell",
  };
}

export function resolveShell(selection: string): ResolvedShell {
  if (process.platform === "win32") {
    return resolveWindowsShell(selection);
  }

  if (selection !== "default" && selection.trim()) {
    return {
      command: selection,
      args: [],
      label: path.basename(selection) || selection,
      family: inferShellFamily(selection),
    };
  }

  const command = process.env.SHELL ?? "/bin/zsh";
  return {
    command,
    args: [],
    label: "System Shell",
    family: inferShellFamily(command),
  };
}

function sanitizeShellPayload(command: string): string {
  return command.replace(/\0/g, "").replace(/\r\n|\n\r|\r/g, "\n").trim();
}

function flattenInlineShellCommand(command: string, separator: string): string {
  const lines = sanitizeShellPayload(command)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.join(separator);
}

function buildPowerShellCommand(command: string): string {
  return [
    "[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "$OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "if ($null -ne $PSStyle) { $PSStyle.OutputRendering = 'PlainText' }",
    flattenInlineShellCommand(command, "; "),
  ].join("; ");
}

function buildPosixArgs(shellCommand: string, command: string): string[] {
  const executable = path.basename(shellCommand).toLowerCase();

  if (executable === "bash" || executable === "bash.exe" || executable === "zsh" || executable === "zsh.exe") {
    return ["-lc", command];
  }

  return ["-c", command];
}

export function buildShellExecSpawn(shell: ResolvedShell, command: string): ShellSpawn {
  const sanitizedCommand = sanitizeShellPayload(command);

  switch (shell.family) {
    case "powershell":
      return {
        command: shell.command,
        args: [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          buildPowerShellCommand(command),
        ],
      };
    case "cmd":
      return {
        command: shell.command,
        args: [
          "/d",
          "/s",
          "/c",
          `chcp 65001>nul & ${flattenInlineShellCommand(sanitizedCommand, " & ")}`,
        ],
      };
    case "git-bash":
      return {
        command: shell.command,
        args: ["--login", "-c", sanitizedCommand],
      };
    case "wsl":
      return {
        command: shell.command,
        args: ["bash", "-lc", sanitizedCommand],
      };
    case "posix":
      return {
        command: shell.command,
        args: buildPosixArgs(shell.command, sanitizedCommand),
      };
    case "custom":
    default:
      return {
        command: shell.command,
        args: buildPosixArgs(shell.command, sanitizedCommand),
      };
  }
}
