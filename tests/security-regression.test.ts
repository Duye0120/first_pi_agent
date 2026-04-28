import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkFetchUrl, checkShellCommand, isPathForbiddenRead } from "../src/main/security.ts";
import { evaluateToolPolicy } from "../src/main/harness/policy.ts";
import { sanitizeLogMessage, sanitizeLogValue } from "../src/main/log-sanitize.ts";

function withTempWorkspace(test: (workspacePath: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chela-security-"));
  try {
    const workspacePath = path.join(root, "workspace");
    fs.mkdirSync(workspacePath, { recursive: true });
    test(workspacePath);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

withTempWorkspace((workspacePath) => {
  const protectedDir = path.join(workspacePath, "node_modules");
  const linkPath = path.join(workspacePath, "deps");
  fs.mkdirSync(protectedDir, { recursive: true });
  fs.symlinkSync(protectedDir, linkPath, process.platform === "win32" ? "junction" : "dir");

  const result = evaluateToolPolicy({
    workspacePath,
    toolName: "file_write",
    args: { path: "deps/new-file.txt", content: "x" },
  });

  assert.equal(result.decision.type, "deny");
  assert.match(result.decision.reason ?? "", /写保护|protected/i);
});

{
  const result = checkShellCommand("echo safe\r\nRemove-Item -Recurse C:\\temp\\chela");
  assert.equal(result.allowed, false);
  assert.equal(result.needsConfirmation, false);
}

{
  const result = checkShellCommand("echo safe; Remove-Item -Recurse C:\\temp\\chela");
  assert.equal(result.allowed, false);
  assert.equal(result.needsConfirmation, false);
}

{
  assert.equal(isPathForbiddenRead(path.join(os.tmpdir(), "project", ".env")), true);
  assert.equal(checkFetchUrl("https://example.com").allowed, true);
  assert.equal(checkFetchUrl("file:///tmp/secret").allowed, false);
}

{
  const sanitized = sanitizeLogValue({
    provider: {
      apiKey: "sk-proj-abcdefghijklmnopqrstuvwxyz123456",
      headers: {
        authorization: "Bearer abcdefghijklmnopqrstuvwxyz123456",
        "x-api-key": "plain-secret-value",
      },
    },
    events: [{ refreshToken: "refresh-token-value" }],
  });

  assert.deepEqual(sanitized, {
    provider: {
      apiKey: "[redacted]",
      headers: {
        authorization: "[redacted]",
        "x-api-key": "[redacted]",
      },
    },
    events: [{ refreshToken: "[redacted]" }],
  });
}

{
  const sanitized = sanitizeLogMessage(
    "request failed with key sk-proj-abcdefghijklmnopqrstuvwxyz123456 and Bearer abcdefghijklmnopqrstuvwxyz123456",
  );

  assert.equal(
    sanitized,
    "request failed with key [redacted-api-key] and Bearer [redacted]",
  );
}

console.log("security regression tests passed");
