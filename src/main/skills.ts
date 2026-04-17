import { shell } from "electron";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type {
  InstalledSkillDetail,
  InstalledSkillInstance,
  InstalledSkillSource,
  SkillCatalogEntry,
  SkillDiscoveryResult,
  SkillInstallRequest,
  SkillInstallResult,
} from "../shared/contracts.js";
import { getSkillUsageTargets } from "../shared/skill-usage.js";
import { getSettings } from "./settings.js";

type ParsedSkillContent = {
  name: string | null;
  description: string | null;
  contentPreview: string | null;
};

type ScannedSkillInstance = InstalledSkillInstance & {
  id: string;
  displayName: string;
  description: string;
  contentPreview: string | null;
};

type CliCommandSpec = {
  command: string;
  args: string[];
};

type CliCommandResult = {
  stdout: string;
  stderr: string;
};

const USER_SKILLS_ROOT = path.join(os.homedir(), ".codex", "skills");
const USER_SKILL_EXCLUDES = new Set([".system", "codex-primary-runtime"]);
const README_CANDIDATES = ["README.md", "README.MD", "readme.md"];

function getProjectSkillsRoot() {
  return path.join(getSettings().workspace, ".agents", "skills");
}

async function pathExists(targetPath: string) {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeSkillId(value: string) {
  return value.trim().toLowerCase();
}

function stripWrappingQuotes(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function extractFirstParagraph(text: string) {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  return paragraphs[0] ?? null;
}

function parseSkillContent(content: string): ParsedSkillContent {
  const normalized = content.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---")) {
    return {
      name: null,
      description: null,
      contentPreview: extractFirstParagraph(normalized),
    };
  }

  const closingIndex = normalized.indexOf("\n---", 3);
  if (closingIndex === -1) {
    return {
      name: null,
      description: null,
      contentPreview: extractFirstParagraph(normalized),
    };
  }

  const frontmatterText = normalized.slice(3, closingIndex).trim();
  const body = normalized.slice(closingIndex + 4).trim();
  let name: string | null = null;
  let description: string | null = null;

  for (const rawLine of frontmatterText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    const value = stripWrappingQuotes(rawValue);

    if (key === "name" && value) {
      name = value;
    }
    if (key === "description" && value) {
      description = value;
    }
  }

  return {
    name,
    description,
    contentPreview: extractFirstParagraph(body),
  };
}

async function findReadmePath(skillPath: string) {
  for (const candidate of README_CANDIDATES) {
    const candidatePath = path.join(skillPath, candidate);
    if (await pathExists(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

function toIsoOrNull(timestampMs: number) {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    return null;
  }

  return new Date(timestampMs).toISOString();
}

async function scanSkillInstance(
  source: InstalledSkillSource,
  rootPath: string,
  directoryName: string,
): Promise<ScannedSkillInstance> {
  const skillPath = path.join(rootPath, directoryName);
  const skillFilePath = path.join(skillPath, "SKILL.md");
  const hasSkillFile = await pathExists(skillFilePath);
  const readmePath = await findReadmePath(skillPath);

  let name = directoryName;
  let description = "当前目录里缺少 SKILL.md。";
  let contentPreview: string | null = null;
  let installedAt: string | null = null;
  let updatedAt: string | null = null;

  if (hasSkillFile) {
    const [content, fileStat] = await Promise.all([
      readFile(skillFilePath, "utf8"),
      stat(skillFilePath),
    ]);
    const parsed = parseSkillContent(content);
    name = parsed.name ?? directoryName;
    description =
      parsed.description ??
      parsed.contentPreview ??
      "这个 skill 暂时没有写 description。";
    contentPreview = parsed.contentPreview;
    installedAt = toIsoOrNull(fileStat.birthtimeMs);
    updatedAt = toIsoOrNull(fileStat.mtimeMs);
  } else {
    const directoryStat = await stat(skillPath);
    installedAt = toIsoOrNull(directoryStat.birthtimeMs);
    updatedAt = toIsoOrNull(directoryStat.mtimeMs);
  }

  return {
    id: normalizeSkillId(name),
    displayName: name,
    description,
    contentPreview,
    source,
    rootPath,
    skillPath,
    skillFilePath: hasSkillFile ? skillFilePath : null,
    readmePath,
    installedAt,
    updatedAt,
    missingSkillFile: !hasSkillFile,
  };
}

async function scanSkillRoot(
  source: InstalledSkillSource,
  rootPath: string,
) {
  if (!(await pathExists(rootPath))) {
    return [] as ScannedSkillInstance[];
  }

  const entries = await readdir(rootPath, { withFileTypes: true });
  const directoryNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) =>
      source === "user"
        ? !name.startsWith(".") && !USER_SKILL_EXCLUDES.has(name)
        : true,
    );

  return Promise.all(
    directoryNames.map((directoryName) =>
      scanSkillInstance(source, rootPath, directoryName),
    ),
  );
}

function buildLearnMoreUrl(packageName: string) {
  const match = packageName.match(/^([^/\s]+)\/([^@\s]+)@([^\s]+)$/);
  if (!match) {
    return null;
  }

  const [, owner, repo, skill] = match;
  return `https://skills.sh/${owner}/${repo}/${skill}`;
}

function deriveDisplayNameFromPackageName(packageName: string) {
  const [repository, skillName] = packageName.split("@");
  if (skillName) {
    return skillName;
  }
  return repository.split("/").at(-1) ?? packageName;
}

function inferSkillIdFromPackageName(packageName: string) {
  return normalizeSkillId(deriveDisplayNameFromPackageName(packageName));
}

function extractPackageNames(output: string) {
  const names = new Set<string>();
  for (const match of output.matchAll(/npx skills add\s+([^\s]+)/g)) {
    const packageName = match[1]?.trim();
    if (packageName) {
      names.add(packageName);
    }
  }

  for (const match of output.matchAll(/\b([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+)\b/g)) {
    const packageName = match[1]?.trim();
    if (packageName) {
      names.add(packageName);
    }
  }

  return [...names];
}

function parseCatalogEntries(output: string) {
  const lines = output.replace(/\r\n/g, "\n").split("\n");
  const packageNames = extractPackageNames(output);
  const entries: SkillCatalogEntry[] = [];

  for (const packageName of packageNames) {
    const packageIndex = lines.findIndex((line) => line.includes(packageName));
    const contextLines =
      packageIndex >= 0
        ? lines
            .slice(Math.max(0, packageIndex - 2), packageIndex + 3)
            .map((line) => line.trim())
            .filter(Boolean)
        : [];
    const description =
      contextLines.find(
        (line) =>
          !line.includes(packageName) &&
          !line.startsWith("npx skills add") &&
          !line.startsWith("https://skills.sh/"),
      ) ?? "发现到可安装 skill。";
    const [sourceLabel] = packageName.split("@");

    entries.push({
      id: inferSkillIdFromPackageName(packageName),
      packageName,
      displayName: deriveDisplayNameFromPackageName(packageName),
      description,
      installCommand: `npx skills add ${packageName} -g -y`,
      sourceLabel: sourceLabel ?? null,
      learnMoreUrl: buildLearnMoreUrl(packageName),
    });
  }

  return entries;
}

async function runCliCommand(command: string, args: string[]) {
  return new Promise<CliCommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        npm_config_yes: "true",
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error((stderr || stdout || `命令退出码 ${code}`).trim()));
    });
  });
}

async function runSkillsCli(candidates: CliCommandSpec[]) {
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      return await runCliCommand(candidate.command, candidate.args);
    } catch (error) {
      errors.push(
        `${candidate.command} ${candidate.args.join(" ")}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  throw new Error(errors.join("\n"));
}

function buildFindCommandCandidates(query: string): CliCommandSpec[] {
  if (process.platform === "win32") {
    return [
      { command: "npx.cmd", args: ["skills", "find", query] },
      { command: "npm.cmd", args: ["exec", "--yes", "skills", "find", query] },
    ];
  }

  return [
    { command: "npx", args: ["skills", "find", query] },
    { command: "npm", args: ["exec", "--yes", "skills", "find", query] },
  ];
}

function buildInstallCommandCandidates(packageName: string): CliCommandSpec[] {
  if (process.platform === "win32") {
    return [
      { command: "npx.cmd", args: ["skills", "add", packageName, "-g", "-y"] },
      {
        command: "npm.cmd",
        args: ["exec", "--yes", "skills", "add", packageName, "-g", "-y"],
      },
    ];
  }

  return [
    { command: "npx", args: ["skills", "add", packageName, "-g", "-y"] },
    {
      command: "npm",
      args: ["exec", "--yes", "skills", "add", packageName, "-g", "-y"],
    },
  ];
}

async function collectInstalledSkillDetails() {
  const [projectInstances, userInstances] = await Promise.all([
    scanSkillRoot("project", getProjectSkillsRoot()),
    scanSkillRoot("user", USER_SKILLS_ROOT),
  ]);

  const byId = new Map<string, InstalledSkillDetail>();

  for (const instance of [...projectInstances, ...userInstances]) {
    const existing = byId.get(instance.id);
    if (!existing) {
      byId.set(instance.id, {
        id: instance.id,
        displayName: instance.displayName,
        description: instance.description,
        usageTargets: getSkillUsageTargets(instance.id),
        sources: [instance.source],
        primarySource: instance.source,
        instances: [instance],
        installable: true,
        installedAt: instance.installedAt,
        updatedAt: instance.updatedAt,
        contentPreview: instance.contentPreview,
      });
      continue;
    }

    existing.instances.push(instance);
    existing.sources = Array.from(
      new Set([...existing.sources, instance.source]),
    );

    if (instance.source === "project") {
      existing.primarySource = "project";
      existing.displayName = instance.displayName;
      existing.description = instance.description;
      existing.contentPreview = instance.contentPreview;
    }

    const candidateInstalledAt = [existing.installedAt, instance.installedAt]
      .filter(Boolean)
      .sort()[0] ?? null;
    const candidateUpdatedAt = [existing.updatedAt, instance.updatedAt]
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
    existing.installedAt = candidateInstalledAt;
    existing.updatedAt = candidateUpdatedAt;
  }

  return [...byId.values()]
    .map((skill) => ({
      ...skill,
      instances: skill.instances.sort((left, right) => {
        if (left.source !== right.source) {
          return left.source === "project" ? -1 : 1;
        }
        return left.skillPath.localeCompare(right.skillPath, "en");
      }),
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "en"));
}

async function findSkillInstance(
  skillId: string,
  source: InstalledSkillSource,
) {
  const skills = await collectInstalledSkillDetails();
  const skill = skills.find((entry) => entry.id === normalizeSkillId(skillId));
  if (!skill) {
    throw new Error("没有找到对应的 skill。");
  }

  const instance = skill.instances.find((entry) => entry.source === source);
  if (!instance) {
    throw new Error("当前来源下没有找到这个 skill。");
  }

  return instance;
}

export async function listInstalledSkills() {
  return collectInstalledSkillDetails();
}

export async function searchSkillCatalog(
  query: string,
): Promise<SkillDiscoveryResult> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) {
    return {
      query: normalizedQuery,
      entries: [],
      error: null,
      rawOutput: "",
    };
  }

  try {
    const result = await runSkillsCli(buildFindCommandCandidates(normalizedQuery));
    return {
      query: normalizedQuery,
      entries: parseCatalogEntries(result.stdout),
      error: null,
      rawOutput: result.stdout.trim(),
    };
  } catch (error) {
    return {
      query: normalizedQuery,
      entries: [],
      error: error instanceof Error ? error.message : "搜索 skills 失败。",
      rawOutput: "",
    };
  }
}

export async function installSkill(
  request: SkillInstallRequest,
): Promise<SkillInstallResult> {
  const packageName = request.packageName.trim();
  if (!packageName) {
    throw new Error("要安装的 skill 包名不能为空。");
  }
  if (request.target && request.target !== "user") {
    throw new Error("当前只支持安装到用户级 skills 目录。");
  }

  await runSkillsCli(buildInstallCommandCandidates(packageName));
  const skills = await collectInstalledSkillDetails();
  const installedSkillId = inferSkillIdFromPackageName(packageName);
  const installedSkill =
    skills.find((skill) => skill.id === installedSkillId) ?? null;

  return {
    ok: true,
    message: "Skill 安装完成。",
    installedSkillId,
    installedSkill,
    skills,
  };
}

export async function openSkillDirectory(
  skillId: string,
  source: InstalledSkillSource,
): Promise<void> {
  const instance = await findSkillInstance(skillId, source);
  if (await pathExists(instance.skillPath)) {
    shell.showItemInFolder(instance.skillPath);
    return;
  }

  const result = await shell.openPath(instance.rootPath);
  if (result) {
    throw new Error(result);
  }
}

export async function openSkillFile(
  skillId: string,
  source: InstalledSkillSource,
): Promise<void> {
  const instance = await findSkillInstance(skillId, source);
  if (!instance.skillFilePath) {
    throw new Error("这个 skill 目录里还没有 SKILL.md。");
  }

  const result = await shell.openPath(instance.skillFilePath);
  if (result) {
    throw new Error(result);
  }
}
