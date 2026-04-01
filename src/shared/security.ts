// ── Security Constants ──────────────────────────────────────────
// Shared between main process (enforcement) and renderer (display).

/** Commands that are always blocked — high risk, irreversible */
export const DANGEROUS_COMMAND_PATTERNS: RegExp[] = [
  /\brm\s+(-rf?|--recursive)\s+[\/~]/,
  /\bmkfs\b/,
  /\bdd\b.*\bof=/,
  /\b(shutdown|reboot|halt|poweroff)\b/,
  /\bchmod\s+777\b/,
  />\s*\/dev\/sd/,
  /\bcurl\b.*\|\s*(bash|sh)\b/,
  /\bwget\b.*\|\s*(bash|sh)\b/,
  /\bnpm\s+publish\b/,
  /\bgit\s+push\s+.*--force\b/,
  /\bgit\s+reset\s+--hard\b/,
];

/** Commands that are auto-approved — read-only or common dev operations */
export const SAFE_COMMAND_PATTERNS: RegExp[] = [
  /^(ls|dir|pwd|echo|cat|head|tail|wc|which|where|type)\b/,
  /^git\s+(status|log|diff|branch|show|rev-parse|remote)\b/,
  /^(node|npx|pnpm|npm|yarn)\s+(--version|-v)\b/,
  /^(pnpm|npm|yarn)\s+(list|ls|why|outdated)\b/,
  /^(pnpm|npm|yarn)\s+(run|exec)\s/,
  /^(pnpm|npm|yarn)\s+(install|add|remove)\b/,
  /^(tsc|eslint|prettier|vitest|jest)\b/,
];

/** Files the agent is never allowed to read, even inside the workspace */
export const FORBIDDEN_FILE_PATTERNS: string[] = [
  "**/.env",
  "**/.env.*",
  "**/credentials.json",
  "**/*.pem",
  "**/*.key",
  "**/id_rsa*",
  "**/.git/config",
];

/** Directories the agent is never allowed to write to */
export const FORBIDDEN_WRITE_DIRS: string[] = [
  "node_modules",
  ".git",
];

/** Network fetch policy */
export const FETCH_POLICY = {
  allowedSchemes: ["http", "https"] as const,
  blockedHostPatterns: [
    /^localhost$/,
    /^127\.0\.0\.1$/,
    /^0\.0\.0\.0$/,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
  ] as readonly RegExp[],
  maxResponseSizeBytes: 5 * 1024 * 1024,
  timeoutMs: 15_000,
} as const;

/** Tool security levels */
export type ToolSecurityLevel = "safe" | "guarded" | "dangerous";
