import { spawnSync } from "node:child_process";

const smokeScript = [
  'console.log("electron ABI " + process.versions.modules + " / electron " + process.versions.electron + " / node " + process.versions.node);',
  'const Database = require("better-sqlite3");',
  'const db = new Database(":memory:");',
  "try {",
  '  const row = db.prepare("select 1 as ok").get();',
  "  if (!row || row.ok !== 1) {",
  '    throw new Error("better-sqlite3 smoke query returned an unexpected result.");',
  "  }",
  '  require("node-pty");',
  '  console.log("electron native modules ok");',
  "} finally {",
  "  db.close();",
  "}",
].join(" ");

const pnpmCommand = process.platform === "win32" ? "pnpm.exe" : "pnpm";

const result = spawnSync(pnpmCommand, ["exec", "electron", "-e", smokeScript], {
  encoding: "utf8",
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
  },
  windowsHide: true,
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}

if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
}

if (result.status !== 0) {
  process.stderr.write(
    "Electron native module verification failed. Run `pnpm run native:rebuild:electron` and retry.\n",
  );
  process.exitCode = result.status ?? 1;
}
