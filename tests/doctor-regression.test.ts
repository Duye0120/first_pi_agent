import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  evaluateNodeVersion,
  evaluateNativeModuleLoad,
  parseNativeModuleAbiError,
  summarizeDoctorChecks,
} from "../src/main/doctor.ts";

function withTempDir(test: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chela-doctor-"));
  try {
    test(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

{
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, ".nvmrc"), "22.19.0\n");
    fs.writeFileSync(path.join(dir, ".node-version"), "22.19.0\n");

    const result = evaluateNodeVersion({
      projectRoot: dir,
      nodeVersion: "v22.19.0",
      nodeAbi: "127",
    });

    assert.equal(result.status, "pass");
    assert.equal(result.code, "NODE_VERSION_MATCH");
    assert.equal(result.details.expectedVersions.join(","), "22.19.0,22.19.0");
  });
}

{
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, ".nvmrc"), "22.19.0\n");
    fs.writeFileSync(path.join(dir, ".node-version"), "22.19.0\n");

    const result = evaluateNodeVersion({
      projectRoot: dir,
      nodeVersion: "v24.13.0",
      nodeAbi: "137",
    });

    assert.equal(result.status, "fail");
    assert.equal(result.code, "NODE_VERSION_MISMATCH");
    assert.match(result.message, /22\.19\.0/);
    assert.deepEqual(result.fixCommands, ["nvm use 22.19.0", "pnpm install"]);
  });
}

{
  const parsed = parseNativeModuleAbiError(
    new Error(
      "The module '\\better_sqlite3.node' was compiled against a different Node.js version using NODE_MODULE_VERSION 137. This version of Node.js requires NODE_MODULE_VERSION 127.",
    ),
    "127",
    "better-sqlite3",
  );

  assert.equal(parsed.detected, true);
  assert.equal(parsed.moduleAbi, "137");
  assert.equal(parsed.nodeAbi, "127");
  assert.deepEqual(parsed.fixCommands, ["pnpm rebuild better-sqlite3", "pnpm install"]);
}

{
  const result = evaluateNativeModuleLoad({
    id: "better-sqlite3",
    label: "better-sqlite3",
    packageName: "better-sqlite3",
    load: () => {
      throw new Error(
        "The module '\\better_sqlite3.node' was compiled against a different Node.js version using NODE_MODULE_VERSION 137. This version of Node.js requires NODE_MODULE_VERSION 127.",
      );
    },
    nodeAbi: "127",
  });

  assert.equal(result.status, "fail");
  assert.equal(result.code, "NATIVE_MODULE_ABI_MISMATCH");
  assert.deepEqual(result.fixCommands, ["pnpm rebuild better-sqlite3", "pnpm install"]);
}

{
  const summary = summarizeDoctorChecks([
    {
      id: "node",
      label: "Node.js",
      status: "pass",
      code: "NODE_VERSION_MATCH",
      message: "Node.js version matches project files.",
      details: {},
      fixCommands: [],
    },
    {
      id: "better-sqlite3",
      label: "better-sqlite3",
      status: "fail",
      code: "NATIVE_MODULE_ABI_MISMATCH",
      message: "better-sqlite3 ABI mismatch.",
      details: { currentNodeAbi: "127", moduleAbi: "137" },
      fixCommands: ["pnpm rebuild better-sqlite3"],
    },
  ]);

  assert.equal(summary.ok, false);
  assert.equal(summary.counts.pass, 1);
  assert.equal(summary.counts.fail, 1);
  assert.equal(summary.checks[1].code, "NATIVE_MODULE_ABI_MISMATCH");
}

console.log("doctor regression tests passed");
