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

export function isPathAllowed(targetPath: string, workspacePath: string): boolean {
  const resolved = path.resolve(targetPath);
  const wsResolved = path.resolve(workspacePath);
  return resolved.startsWith(wsResolved + path.sep) || resolved === wsResolved;
}

export function isPathForbiddenRead(targetPath: string): boolean {
  const normalized = targetPath.replace(/\\/g, "/");
  return FORBIDDEN_FILE_PATTERNS.some((pattern) => {
    // Simple glob match: **/ prefix matches any directory depth
    const regex = pattern
      .replace(/\*\*\//g, "(.*/)?")
      .replace(/\*/g, "[^/]*")
      .replace(/\./g, "\\.");
    return new RegExp(`(^|/)${regex}$`).test(normalized);
  });
}

export function isWritePathForbidden(targetPath: string): boolean {
  const normalized = targetPath.replace(/\\/g, "/");
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

export function checkShellCommand(command: string): ShellCheckResult {
  // Check blacklist first
  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(command)) {
      return {
        allowed: false,
        reason: `该命令被安全策略拦截（匹配危险命令模式）`,
        needsConfirmation: false,
      };
    }
  }

  // Check whitelist
  for (const pattern of SAFE_COMMAND_PATTERNS) {
    if (pattern.test(command)) {
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
