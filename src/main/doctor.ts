import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

export type DoctorStatus = "pass" | "warn" | "fail";

export type DoctorCheckResult = {
  id: string;
  label: string;
  status: DoctorStatus;
  code: string;
  message: string;
  details: Record<string, unknown>;
  fixCommands: string[];
};

export type DoctorSummary = {
  ok: boolean;
  counts: Record<DoctorStatus, number>;
  checks: DoctorCheckResult[];
};

type CommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  errorMessage: string | null;
};

const NATIVE_REBUILD_COMMANDS = (packageName: string): string[] => [
  `pnpm rebuild ${packageName}`,
  "pnpm install",
];

export function summarizeDoctorChecks(checks: DoctorCheckResult[]): DoctorSummary {
  const counts: Record<DoctorStatus, number> = { pass: 0, warn: 0, fail: 0 };
  for (const check of checks) {
    counts[check.status] += 1;
  }

  return {
    ok: counts.fail === 0,
    counts,
    checks,
  };
}

export function evaluateNodeVersion(input: {
  projectRoot: string;
  nodeVersion?: string;
  nodeAbi?: string;
}): DoctorCheckResult {
  const nodeVersion = normalizeNodeVersion(input.nodeVersion ?? process.version);
  const nodeAbi = input.nodeAbi ?? process.versions.modules;
  const expectedVersions = [".nvmrc", ".node-version"]
    .map((file) => readVersionFile(path.join(input.projectRoot, file)))
    .filter((value): value is string => Boolean(value));
  const uniqueExpectedVersions = Array.from(new Set(expectedVersions));

  if (uniqueExpectedVersions.length === 0) {
    return {
      id: "node",
      label: "Node.js",
      status: "warn",
      code: "NODE_VERSION_FILE_MISSING",
      message: "Node.js version files are missing.",
      details: { nodeVersion, nodeAbi, expectedVersions: [] },
      fixCommands: [],
    };
  }

  const expected = uniqueExpectedVersions[0];
  if (uniqueExpectedVersions.length > 1) {
    return {
      id: "node",
      label: "Node.js",
      status: "fail",
      code: "NODE_VERSION_FILES_CONFLICT",
      message: `Node.js version files disagree: ${uniqueExpectedVersions.join(", ")}.`,
      details: { nodeVersion, nodeAbi, expectedVersions },
      fixCommands: [`nvm use ${expected}`, "pnpm install"],
    };
  }

  if (nodeVersion !== expected) {
    return {
      id: "node",
      label: "Node.js",
      status: "fail",
      code: "NODE_VERSION_MISMATCH",
      message: `Node.js ${nodeVersion} is active; project expects ${expected}.`,
      details: { nodeVersion, nodeAbi, expectedVersions },
      fixCommands: [`nvm use ${expected}`, "pnpm install"],
    };
  }

  return {
    id: "node",
    label: "Node.js",
    status: "pass",
    code: "NODE_VERSION_MATCH",
    message: `Node.js ${nodeVersion} matches project version files.`,
    details: { nodeVersion, nodeAbi, expectedVersions },
    fixCommands: [],
  };
}

export function parseNativeModuleAbiError(
  error: unknown,
  currentNodeAbi: string,
  packageName: string,
): {
  detected: boolean;
  moduleAbi: string | null;
  nodeAbi: string;
  message: string;
  fixCommands: string[];
} {
  const message = error instanceof Error ? error.message : String(error);
  const moduleVersionMatches = Array.from(message.matchAll(/NODE_MODULE_VERSION\s+(\d+)/g));
  const moduleAbi = moduleVersionMatches[0]?.[1] ?? null;
  const requiredAbi = moduleVersionMatches[1]?.[1] ?? currentNodeAbi;
  const detected = message.includes("NODE_MODULE_VERSION");

  return {
    detected,
    moduleAbi,
    nodeAbi: requiredAbi,
    message,
    fixCommands: detected ? NATIVE_REBUILD_COMMANDS(packageName) : [],
  };
}

export function evaluateNativeModuleLoad(input: {
  id: string;
  label: string;
  packageName: string;
  load: () => void;
  nodeAbi?: string;
}): DoctorCheckResult {
  const nodeAbi = input.nodeAbi ?? process.versions.modules;
  try {
    input.load();
    return {
      id: input.id,
      label: input.label,
      status: "pass",
      code: "NATIVE_MODULE_LOADABLE",
      message: `${input.label} native module loads successfully.`,
      details: { currentNodeAbi: nodeAbi },
      fixCommands: [],
    };
  } catch (error) {
    const abiError = parseNativeModuleAbiError(error, nodeAbi, input.packageName);
    const abiMismatch = abiError.detected;
    return {
      id: input.id,
      label: input.label,
      status: "fail",
      code: abiMismatch ? "NATIVE_MODULE_ABI_MISMATCH" : "NATIVE_MODULE_LOAD_FAILED",
      message: abiMismatch
        ? `${input.label} native module ABI mismatch: module ABI ${abiError.moduleAbi ?? "unknown"}, active Node ABI ${abiError.nodeAbi}.`
        : `${input.label} native module failed to load.`,
      details: {
        currentNodeAbi: abiError.nodeAbi,
        moduleAbi: abiError.moduleAbi,
        error: abiError.message,
      },
      fixCommands: abiMismatch ? abiError.fixCommands : NATIVE_REBUILD_COMMANDS(input.packageName),
    };
  }
}

export async function runDoctor(projectRoot = process.cwd()): Promise<DoctorSummary> {
  const checks: DoctorCheckResult[] = [
    evaluateNodeVersion({ projectRoot }),
    checkCommand("pnpm", "pnpm", ["--version"]),
    checkPackageExecutable("tsx", "tsx"),
    checkRipgrep(),
    checkNativeModule("better-sqlite3", "better-sqlite3"),
    checkNativeModule("node-pty", "node-pty"),
    checkResolvableDependency("electron", "Electron"),
    checkResolvableDependency("electron-vite", "electron-vite"),
    checkResolvableDependency("@mariozechner/pi-agent-core", "pi-agent-core"),
    checkResolvableDependency("@mariozechner/pi-ai", "pi-ai"),
    checkResolvableDependency("@modelcontextprotocol/sdk", "MCP SDK"),
  ];

  return summarizeDoctorChecks(checks);
}

function checkCommand(id: string, label: string, args: string[]): DoctorCheckResult {
  const locatedPath = lookupCommand(id);
  const commandResult = runCommand(id, args);
  if (commandResult.exitCode === 0) {
    return {
      id,
      label,
      status: "pass",
      code: "COMMAND_AVAILABLE",
      message: `${label} is available.`,
      details: {
        path: locatedPath,
        version: firstLine(commandResult.stdout),
      },
      fixCommands: [],
    };
  }

  return {
    id,
    label,
    status: "fail",
    code: "COMMAND_UNAVAILABLE",
    message: `${label} is unavailable or failed to execute.`,
    details: {
      path: locatedPath,
      exitCode: commandResult.exitCode,
      stderr: commandResult.stderr,
      errorMessage: commandResult.errorMessage,
    },
    fixCommands: ["corepack enable", "corepack prepare pnpm@latest --activate"],
  };
}

function checkPackageExecutable(packageName: string, label: string): DoctorCheckResult {
  const packageJsonPath = resolvePackageJson(packageName);
  if (!packageJsonPath) {
    return {
      id: packageName,
      label,
      status: "fail",
      code: "PACKAGE_MISSING",
      message: `${label} package is missing.`,
      details: {},
      fixCommands: ["pnpm install"],
    };
  }

  const executablePath = resolveNodeModuleBin(packageName);
  return {
    id: packageName,
    label,
    status: executablePath ? "pass" : "fail",
    code: executablePath ? "PACKAGE_EXECUTABLE_AVAILABLE" : "PACKAGE_EXECUTABLE_MISSING",
    message: executablePath ? `${label} executable is available.` : `${label} executable is missing.`,
    details: { packageJsonPath, executablePath },
    fixCommands: executablePath ? [] : ["pnpm install"],
  };
}

function checkRipgrep(): DoctorCheckResult {
  try {
    const { rgPath } = require("@vscode/ripgrep") as { rgPath?: string };
    if (rgPath && fs.existsSync(rgPath)) {
      const version = runCommand(rgPath, ["--version"]);
      return {
        id: "@vscode/ripgrep",
        label: "@vscode/ripgrep",
        status: version.exitCode === 0 ? "pass" : "fail",
        code: version.exitCode === 0 ? "RIPGREP_EXECUTABLE_AVAILABLE" : "RIPGREP_EXECUTABLE_FAILED",
        message:
          version.exitCode === 0
            ? "@vscode/ripgrep executable is available."
            : "@vscode/ripgrep executable failed to run.",
        details: { path: rgPath, version: firstLine(version.stdout), stderr: version.stderr },
        fixCommands: version.exitCode === 0 ? [] : ["pnpm rebuild @vscode/ripgrep", "pnpm install"],
      };
    }

    return {
      id: "@vscode/ripgrep",
      label: "@vscode/ripgrep",
      status: "fail",
      code: "RIPGREP_EXECUTABLE_MISSING",
      message: "@vscode/ripgrep executable is missing.",
      details: { path: rgPath ?? null },
      fixCommands: ["pnpm rebuild @vscode/ripgrep", "pnpm install"],
    };
  } catch (error) {
    return {
      id: "@vscode/ripgrep",
      label: "@vscode/ripgrep",
      status: "fail",
      code: "RIPGREP_PACKAGE_MISSING",
      message: "@vscode/ripgrep package failed to load.",
      details: { error: errorMessage(error) },
      fixCommands: ["pnpm install"],
    };
  }
}

function checkNativeModule(packageName: string, label: string): DoctorCheckResult {
  return evaluateNativeModuleLoad({
    id: packageName,
    label,
    packageName,
    load: () => {
      const loaded = require(packageName);
      if (packageName === "better-sqlite3") {
        const Database = loaded.default ?? loaded;
        const database = new Database(":memory:");
        try {
          database.pragma("user_version");
        } finally {
          database.close();
        }
      }
    },
  });
}

function checkResolvableDependency(packageName: string, label: string): DoctorCheckResult {
  const packageJsonPath = resolvePackageJson(packageName);
  if (packageJsonPath) {
    return {
      id: packageName,
      label,
      status: "pass",
      code: "DEPENDENCY_RESOLVABLE",
      message: `${label} dependency is resolvable.`,
      details: { packageJsonPath },
      fixCommands: [],
    };
  }

  return {
    id: packageName,
    label,
    status: "fail",
    code: "DEPENDENCY_MISSING",
    message: `${label} dependency is missing.`,
    details: {},
    fixCommands: ["pnpm install"],
  };
}

function runCommand(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
  });

  return {
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    errorMessage: result.error?.message ?? null,
  };
}

function lookupCommand(command: string): string | null {
  const result =
    process.platform === "win32"
      ? spawnSync("where.exe", [command], { encoding: "utf8", windowsHide: true })
      : spawnSync("command", ["-v", command], { encoding: "utf8", shell: true });

  if (result.status !== 0) {
    return null;
  }

  return firstLine(result.stdout);
}

function resolvePackageJson(packageName: string): string | null {
  try {
    return require.resolve(`${packageName}/package.json`);
  } catch {
    const candidate = path.resolve(process.cwd(), "node_modules", ...packageName.split("/"), "package.json");
    return fs.existsSync(candidate) ? candidate : null;
  }
}

function resolveNodeModuleBin(packageName: string): string | null {
  const suffix = process.platform === "win32" ? ".CMD" : "";
  const candidate = path.resolve(process.cwd(), "node_modules", ".bin", `${packageName}${suffix}`);
  return fs.existsSync(candidate) ? candidate : null;
}

function readVersionFile(filePath: string): string | null {
  try {
    const value = fs.readFileSync(filePath, "utf8").trim();
    return value ? normalizeNodeVersion(value) : null;
  } catch {
    return null;
  }
}

function normalizeNodeVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const projectRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const summary = await runDoctor(projectRoot);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = summary.ok ? 0 : 1;
}

const currentFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? fileURLToPath(pathToFileURL(path.resolve(process.argv[1]))) : "";
if (currentFile === entryFile) {
  void main();
}
