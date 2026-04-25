import path from "node:path";
import fs from "node:fs";
import {
  DANGEROUS_COMMAND_PATTERNS,
  SAFE_COMMAND_PATTERNS,
  FORBIDDEN_FILE_PATTERNS,
  FORBIDDEN_WRITE_DIRS,
  FETCH_POLICY,
} from "../shared/security.js";

// ── File System ────────────────────────────────────────────────

function resolvePathWithSymlinks(targetPath: string): string {
  const absolutePath = path.resolve(targetPath);
  const pendingSegments: string[] = [];
  let currentPath = absolutePath;

  while (!fs.existsSync(currentPath)) {
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return path.normalize(absolutePath);
    }

    pendingSegments.unshift(path.basename(currentPath));
    currentPath = parentPath;
  }

  try {
    const resolvedExistingPath = path.normalize(fs.realpathSync.native(currentPath));
    return path.normalize(path.join(resolvedExistingPath, ...pendingSegments));
  } catch {
    return path.normalize(absolutePath);
  }
}

function normalizePolicyPath(targetPath: string): string {
  return resolvePathWithSymlinks(targetPath).replace(/\\/g, "/");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegex(pattern: string): RegExp {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];

    if (char === "*" && next === "*") {
      const afterNext = pattern[index + 2];
      if (afterNext === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    source += escapeRegex(char);
  }

  return new RegExp(`(^|/)${source}$`);
}

export function isPathAllowed(targetPath: string, workspacePath: string): boolean {
  const resolved = resolvePathWithSymlinks(targetPath);
  const wsResolved = resolvePathWithSymlinks(workspacePath);
  const relative = path.relative(wsResolved, resolved);

  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function isPathForbiddenRead(targetPath: string): boolean {
  const normalized = normalizePolicyPath(targetPath);
  return FORBIDDEN_FILE_PATTERNS.some((pattern) =>
    globToRegex(pattern).test(normalized),
  );
}

export function isWritePathForbidden(targetPath: string): boolean {
  const normalized = normalizePolicyPath(targetPath);
  return FORBIDDEN_WRITE_DIRS.some((dir) =>
    normalized.includes(`/${dir}/`) || normalized.endsWith(`/${dir}`),
  );
}

// ── Shell Commands ─────────────────────────────────────────────

export type ShellCheckResult = {
  allowed: boolean;
  reason?: string;
  needsConfirmation: boolean;
};

function splitCommandForPolicy(command: string): string[] {
  return command
    .replace(/\0/g, "")
    .replace(/\r\n|\n\r|\r/g, "\n")
    .split(/\n|&&|\|\||;|\||&/g)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function checkShellCommand(command: string): ShellCheckResult {
  const normalizedCommand = command.replace(/\0/g, "").replace(/\r\n|\n\r|\r/g, "\n");
  const commandSegments = splitCommandForPolicy(normalizedCommand);

  if (commandSegments.length === 0) {
    return { allowed: true, needsConfirmation: true };
  }

  // Check blacklist first
  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(normalizedCommand) || commandSegments.some((line) => pattern.test(line))) {
      return {
        allowed: false,
        reason: `该命令被安全策略拦截（匹配危险命令模式）`,
        needsConfirmation: false,
      };
    }
  }

  if (commandSegments.length > 1) {
    const allSegmentsSafe = commandSegments.every((line) =>
      SAFE_COMMAND_PATTERNS.some((pattern) => pattern.test(line)),
    );

    return allSegmentsSafe
      ? { allowed: true, needsConfirmation: false }
      : {
          allowed: false,
          reason: "组合命令包含未进入安全白名单的指令。",
          needsConfirmation: false,
        };
  }

  // Check whitelist
  for (const pattern of SAFE_COMMAND_PATTERNS) {
    if (pattern.test(normalizedCommand)) {
      return { allowed: true, needsConfirmation: false };
    }
  }

  // Everything else needs confirmation
  return { allowed: true, needsConfirmation: true };
}

// ── Network ────────────────────────────────────────────────────

export function checkFetchUrl(url: string): { allowed: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: "无效的 URL" };
  }

  const scheme = parsed.protocol.replace(":", "");
  if (!FETCH_POLICY.allowedSchemes.includes(scheme as any)) {
    return { allowed: false, reason: `不允许的协议: ${scheme}` };
  }

  const hostname = parsed.hostname;
  for (const pattern of FETCH_POLICY.blockedHostPatterns) {
    if (pattern.test(hostname)) {
      return { allowed: false, reason: `不允许访问内网地址: ${hostname}` };
    }
  }

  return { allowed: true };
}
