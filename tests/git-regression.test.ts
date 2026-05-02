import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pushGitChanges } from "../src/main/git.ts";

function withTempDir(test: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chela-git-"));
  return Promise.resolve(test(dir)).finally(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

await withTempDir(async (dir) => {
  const repoDir = path.join(dir, "repo");
  const remoteDir = path.join(dir, "remote.git");
  fs.mkdirSync(repoDir, { recursive: true });

  git(["init", "--bare", remoteDir], dir);
  git(["init"], repoDir);
  git(["config", "user.name", "Chela Test"], repoDir);
  git(["config", "user.email", "chela@example.test"], repoDir);
  git(["switch", "-c", "feature/push-upstream"], repoDir);
  fs.writeFileSync(path.join(repoDir, "README.md"), "# Chela\n");
  git(["add", "README.md"], repoDir);
  git(["commit", "-m", "test: seed repo"], repoDir);
  git(["remote", "add", "origin", remoteDir], repoDir);

  await pushGitChanges(repoDir);

  const upstream = git(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    repoDir,
  ).trim();
  const remoteHead = git(
    ["--git-dir", remoteDir, "rev-parse", "refs/heads/feature/push-upstream"],
    dir,
  ).trim();

  assert.equal(upstream, "origin/feature/push-upstream");
  assert.equal(remoteHead.length, 40);

  await pushGitChanges(repoDir);
});

console.log("git regression tests passed");
