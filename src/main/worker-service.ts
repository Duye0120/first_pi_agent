import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { completeSimple, type TextContent, type ThinkingContent } from "@mariozechner/pi-ai";
import type {
  CommitPlanGroup,
  GenerateCommitPlanRequest,
  GenerateCommitPlanResult,
  GenerateCommitMessageRequest,
  GenerateCommitMessageResult,
} from "../shared/contracts.js";
import { getRuntimeSkillUsage } from "../shared/skill-usage.js";
import { resolveModelEntry } from "./providers.js";
import { getSettings } from "./settings.js";
import { appLogger } from "./logger.js";

type GenerateSessionTitleInput = {
  userText: string;
  assistantText: string;
};

type WorkerModelRole = "utility" | "chat";

type TextGenerationResult = {
  text: string;
  usedModelRole: WorkerModelRole;
  fallbackUsed: boolean;
};

type CompletionResult = {
  text: string;
  fallbackText: string;
  thinking: string;
  stopReason: string;
  errorMessage?: string;
  content: Array<{ type: string }>;
  usage?: unknown;
};

function getCommitRuntimeSkillUsage() {
  const usage = getRuntimeSkillUsage("commit", "right-panel.commit-plan");
  if (!usage) {
    throw new Error("commit skill usage registry 缺少 right-panel.commit-plan 配置。");
  }

  return usage;
}

const COMMIT_TYPE_META = {
  feat: { emoji: "✨", label: "feat" },
  fix: { emoji: "🐛", label: "fix" },
  docs: { emoji: "📝", label: "docs" },
  refactor: { emoji: "♻️", label: "refactor" },
  test: { emoji: "✅", label: "test" },
  chore: { emoji: "🔧", label: "chore" },
  ci: { emoji: "👷", label: "ci" },
  build: { emoji: "📦", label: "build" },
} as const;

type CommitTypeKey = keyof typeof COMMIT_TYPE_META;

const COMMIT_SKILL_FALLBACK = [
  "## 提交消息格式",
  "- 标题使用 Conventional Commit 风格。",
  "- 第一行只写标题，后续内容写描述。",
  "",
  "## 类型与 emoji",
  "- feat ✨",
  "- fix 🐛",
  "- docs 📝",
  "- style 🎨",
  "- refactor ♻️",
  "- perf ⚡️",
  "- test ✅",
  "- chore 🔧",
  "- ci 👷",
  "- build 📦",
  "- revert ⏪",
  "",
  "## 关键规则",
  "- 动词使用现在时、祈使句。",
  "- 标题保持单行，不加句号。",
  "- 避免把无关改动混在同一个标题里。",
  "- 正文简短，只写对 reviewer 有帮助的信息。",
].join("\n");

function extractText(content: Array<{ type: string }>): string {
  return content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function extractToolCallText(content: Array<{ type: string }>): string {
  return content
    .filter(
      (
        block,
      ): block is { type: "toolCall"; arguments: Record<string, unknown> } =>
        block.type === "toolCall" && "arguments" in block,
    )
    .map((block) => JSON.stringify(block.arguments))
    .join("\n")
    .trim();
}

function extractThinking(content: Array<{ type: string }>): string {
  return content
    .filter((block): block is ThinkingContent => block.type === "thinking")
    .map((block) => block.thinking)
    .join("\n\n")
    .trim();
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

function normalizeTitleLine(value: string): string {
  return value
    .split(/\r?\n/, 1)[0]
    ?.replace(/[。！？!?,，;；:：\s]+$/g, "")
    .trim()
    .slice(0, 24) ?? "";
}

function resolveWorkerModel(role: WorkerModelRole) {
  const settings = getSettings();
  const entryId =
    role === "utility"
      ? settings.modelRouting.utility.modelId
      : settings.modelRouting.chat.modelId;

  if (!entryId) {
    throw new Error(role === "utility" ? "当前未配置工具模型。" : "当前未配置聊天模型。");
  }

  return resolveModelEntry(entryId);
}

async function completeTextWithRole(
  role: WorkerModelRole,
  systemPrompt: string,
  userPrompt: string,
  options?: {
    repairPromptBuilder?: (analysis: string) => {
      systemPrompt: string;
      userPrompt: string;
    };
  },
): Promise<string> {
  const resolved = resolveWorkerModel(role);

  const runCompletion = async (
    nextSystemPrompt: string,
    nextUserPrompt: string,
  ): Promise<CompletionResult> => {
    const response = await completeSimple(
      resolved.model,
      {
        systemPrompt: nextSystemPrompt,
        messages: [{ role: "user", content: nextUserPrompt, timestamp: Date.now() }],
      },
      { apiKey: resolved.apiKey },
    );

    const text = extractText(response.content);
    const toolText = extractToolCallText(response.content);
    const thinking = extractThinking(response.content);

    return {
      text,
      fallbackText: text || toolText || thinking,
      thinking,
      stopReason: response.stopReason,
      errorMessage: response.errorMessage,
      content: response.content,
      usage: response.usage,
    };
  };

  const primary = await runCompletion(systemPrompt, userPrompt);

  if (primary.text) {
    return primary.text;
  }

  if (primary.thinking && options?.repairPromptBuilder) {
    appLogger.info({
      scope: "worker.commit",
      message: "提交信息生成收到 thinking-only 响应，开始二次收束",
      data: {
        role,
        modelEntryId: resolved.entry.id,
        modelId: resolved.entry.modelId,
        sourceId: resolved.source.id,
        stopReason: primary.stopReason,
      },
    });

    const repairPrompt = options.repairPromptBuilder(primary.thinking);
    const repaired = await runCompletion(repairPrompt.systemPrompt, repairPrompt.userPrompt);

    if (repaired.text) {
      return repaired.text;
    }

    if (repaired.fallbackText) {
      appLogger.warn({
        scope: "worker.commit",
        message: "提交信息二次收束未返回 text，改用备用内容",
        data: {
          role,
          modelEntryId: resolved.entry.id,
          modelId: resolved.entry.modelId,
          sourceId: resolved.source.id,
          stopReason: repaired.stopReason,
          content: repaired.content,
          usage: repaired.usage,
          errorMessage: repaired.errorMessage,
        },
      });
      return repaired.fallbackText;
    }
  }

  if (!primary.fallbackText) {
    appLogger.warn({
      scope: "worker.commit",
      message: "提交信息生成未返回可解析文本",
      data: {
        role,
        modelEntryId: resolved.entry.id,
        modelId: resolved.entry.modelId,
        sourceId: resolved.source.id,
        stopReason: primary.stopReason,
        content: primary.content,
        usage: primary.usage,
        errorMessage: primary.errorMessage,
      },
    });
  }

  return primary.fallbackText;
}

async function generateTextWithFallback(input: {
  systemPrompt: string;
  userPrompt: string;
  repairPromptBuilder?: (analysis: string) => {
    systemPrompt: string;
    userPrompt: string;
  };
}): Promise<TextGenerationResult> {
  let utilityError: unknown = null;

  try {
    return {
      text: await completeTextWithRole("utility", input.systemPrompt, input.userPrompt, {
        repairPromptBuilder: input.repairPromptBuilder,
      }),
      usedModelRole: "utility",
      fallbackUsed: false,
    };
  } catch (error) {
    utilityError = error;
  }

  try {
    return {
      text: await completeTextWithRole("chat", input.systemPrompt, input.userPrompt, {
        repairPromptBuilder: input.repairPromptBuilder,
      }),
      usedModelRole: "chat",
      fallbackUsed: true,
    };
  } catch (fallbackError) {
    const utilityMessage = getErrorMessage(utilityError, "工具模型生成失败。");
    const chatMessage = getErrorMessage(fallbackError, "聊天模型回退失败。");
    throw new Error(`${utilityMessage} 聊天模型回退也失败：${chatMessage}`);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMarkdownSection(markdown: string, heading: string): string | null {
  const pattern = new RegExp(
    `^##\\s+${escapeRegExp(heading)}\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`,
    "m",
  );
  const match = markdown.match(pattern);

  if (!match?.[1]?.trim()) {
    return null;
  }

  return `## ${heading}\n${match[1].trim()}`;
}

function readCommitSkillGuidance(workspacePath: string): string {
  const skillPath = path.resolve(workspacePath, ".agents", "skills", "commit", "SKILL.md");

  if (!fs.existsSync(skillPath)) {
    return COMMIT_SKILL_FALLBACK;
  }

  try {
    const skillMarkdown = fs.readFileSync(skillPath, "utf8");
    const sections = [
      extractMarkdownSection(skillMarkdown, "目标"),
      extractMarkdownSection(skillMarkdown, "提交消息格式"),
      extractMarkdownSection(skillMarkdown, "类型与 emoji"),
      extractMarkdownSection(skillMarkdown, "关键规则"),
      extractMarkdownSection(skillMarkdown, "示例"),
    ].filter((section): section is string => !!section);

    return sections.length > 0 ? sections.join("\n\n") : COMMIT_SKILL_FALLBACK;
  } catch {
    return COMMIT_SKILL_FALLBACK;
  }
}

function buildCommitMessageSystemPrompt(workspacePath: string): string {
  return [
    "你是 Chela 的提交信息生成器。",
    "当前任务由工具模型优先执行，职责只有分析变更并生成提交标题与描述。",
    "必须遵循下面的 commit skill 规则。",
    "",
    readCommitSkillGuidance(workspacePath),
    "",
    "输出约束：",
    "- 只输出纯文本，不要代码块，不要解释。",
    "- 第一行输出标题。",
    "- 第二行起输出描述，可为空。",
    "- 不要执行 git add、git commit、lint、build 或其它命令。",
    "- 标题必须可直接放进 commit title 输入框。",
    "- 描述必须可直接放进 description 输入框。",
  ].join("\n");
}

function buildCommitMessagePrompt(
  request: GenerateCommitMessageRequest,
): string {
  const fileList = request.selectedFiles
    .map((file) => `[${file.status}] ${file.path} (+${file.additions}/-${file.deletions})`)
    .join("\n");

  return [
    "请基于下面的改动生成提交标题和描述。",
    "",
    "[当前分支]",
    request.branchName ?? "未知分支",
    "",
    "[最近一次提交标题]",
    request.latestCommitSubject ?? "无可用参考",
    "",
    "[文件列表]",
    fileList || "无文件",
    "",
    "[Diff]",
    request.diffContent?.trim() || "无 diff 内容",
  ].join("\n");
}

function buildCommitPlanSystemPrompt(workspacePath: string): string {
  return [
    "你是 Chela 的提交计划生成器。",
    "当前任务由工具模型优先执行，职责只有分析选中文件并拆成合理的多次提交计划。",
    "必须遵循下面的 commit skill 规则。",
    "",
    readCommitSkillGuidance(workspacePath),
    "",
    "输出约束：",
    "- 只输出 JSON，不要代码块，不要解释。",
    "- JSON 结构固定为 {\"groups\":[{\"title\":\"\",\"description\":\"\",\"filePaths\":[\"path\"],\"reason\":\"\"}]}。",
    "- 每个 group 只放强相关改动。",
    "- 每个 filePath 都必须来自用户给出的文件列表。",
    "- 所有文件都要被覆盖，且每个文件只能出现一次。",
    "- title 必须是可直接用于 git commit 的 Conventional Commit 标题。",
    "- description 写简短正文，可为空字符串。",
    "- reason 用一句话解释为什么这样分组。",
    "- groups 数量控制在 1 到 6 之间。",
    "- 不要执行 git add、git commit、lint、build 或其它命令。",
  ].join("\n");
}

function buildCommitPlanPrompt(
  request: GenerateCommitPlanRequest,
): string {
  const fileList = request.selectedFiles
    .map((file) => `[${file.status}] ${file.path} (+${file.additions}/-${file.deletions})`)
    .join("\n");

  return [
    "请基于下面的改动生成分组提交计划。",
    "",
    "[当前分支]",
    request.branchName ?? "未知分支",
    "",
    "[最近一次提交标题]",
    request.latestCommitSubject ?? "无可用参考",
    "",
    "[文件列表]",
    fileList || "无文件",
    "",
    "[Diff]",
    request.diffContent?.trim() || "无 diff 内容",
  ].join("\n");
}

function buildCommitMessageRepairPrompt(analysis: string): {
  systemPrompt: string;
  userPrompt: string;
} {
  const compactAnalysis = analysis.trim().slice(0, 6000);

  return {
    systemPrompt: [
      "你是 Chela 的提交信息整理器。",
      "你已经完成改动分析，现在只负责输出最终提交标题和描述。",
      "只输出纯文本。",
      "第一行输出标题。",
      "第二行起输出描述，可为空。",
      "不要解释，不要复述分析过程。",
    ].join("\n"),
    userPrompt: [
      "请把下面这段分析整理成最终 commit 标题和描述。",
      "",
      "[分析结果]",
      compactAnalysis || "无可用分析",
    ].join("\n"),
  };
}

function buildCommitPlanRepairPrompt(analysis: string): {
  systemPrompt: string;
  userPrompt: string;
} {
  const compactAnalysis = analysis.trim().slice(0, 6000);

  return {
    systemPrompt: [
      "你是 Chela 的提交计划整理器。",
      "你已经完成改动分析，现在只负责输出最终 JSON。",
      "只输出 JSON。",
      "JSON 结构固定为 {\"groups\":[{\"title\":\"\",\"description\":\"\",\"filePaths\":[\"path\"],\"reason\":\"\"}]}。",
      "不要解释，不要复述分析过程。",
    ].join("\n"),
    userPrompt: [
      "请把下面这段分析整理成最终提交计划 JSON。",
      "",
      "[分析结果]",
      compactAnalysis || "无可用分析",
    ].join("\n"),
  };
}

function stripCodeFence(value: string): string {
  return value
    .trim()
    .replace(/^```[a-zA-Z0-9_-]*\s*/u, "")
    .replace(/\s*```$/u, "")
    .trim();
}

function stripLeadingLabel(value: string): string {
  return value.replace(/^(title|subject|description|body|标题|描述|正文)\s*[:：-]\s*/iu, "").trim();
}

function stripFieldPrefix(value: string): string {
  return value.replace(/^(?:[-*+]\s+|\d+\.\s+)?(?:#{1,6}\s+)?/u, "").trim();
}

function stripWrappingQuotes(value: string): string {
  return value.replace(/^["'`]+|["'`]+$/gu, "").trim();
}

function cleanTitleCandidate(value: string): string {
  return stripWrappingQuotes(stripLeadingLabel(stripFieldPrefix(value)));
}

function cleanDescriptionLine(value: string): string {
  return stripLeadingLabel(value.trim());
}

function matchTitleField(value: string): RegExpMatchArray | null {
  return stripFieldPrefix(value).match(/^(?:title|subject|标题|提交标题)\s*[:：-]?\s*(.*)$/iu);
}

function matchDescriptionField(value: string): RegExpMatchArray | null {
  return stripFieldPrefix(value).match(
    /^(?:description|body|描述|正文|提交描述)\s*[:：-]?\s*(.*)$/iu,
  );
}

function previewCommitResponse(rawText: string): string {
  const preview = stripCodeFence(rawText).replace(/\s+/g, " ").trim();
  return preview.length > 120 ? `${preview.slice(0, 120)}…` : preview;
}

function extractJsonCandidate(rawText: string): string {
  const normalized = stripCodeFence(rawText);

  if (normalized.startsWith("{") || normalized.startsWith("[")) {
    return normalized;
  }

  const objectStart = normalized.indexOf("{");
  const arrayStart = normalized.indexOf("[");
  const candidates = [objectStart, arrayStart].filter((index) => index >= 0);

  if (candidates.length === 0) {
    return normalized;
  }

  const start = Math.min(...candidates);
  const objectEnd = normalized.lastIndexOf("}");
  const arrayEnd = normalized.lastIndexOf("]");
  const end = Math.max(objectEnd, arrayEnd);

  if (end > start) {
    return normalized.slice(start, end + 1);
  }

  return normalized;
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function detectCommitTopics(
  selectedFiles: GenerateCommitMessageRequest["selectedFiles"],
): Array<{ key: string; scope: string; label: string }> {
  const normalizedPaths = selectedFiles.map((file) => toPosixPath(file.path));
  const topics = [
    {
      key: "commit",
      scope: "commit",
      label: "commit generation",
      matches: normalizedPaths.some(
        (filePath) =>
          filePath.includes("diff-panel") ||
          filePath.includes("worker-service") ||
          filePath.includes("ipc/worker"),
      ),
    },
    {
      key: "models",
      scope: "models",
      label: "model directory refresh",
      matches: normalizedPaths.some(
        (filePath) =>
          filePath.includes("provider-directory") ||
          filePath.includes("settings-view") ||
          filePath.includes("keys-section") ||
          filePath.includes("thread"),
      ),
    },
    {
      key: "contracts",
      scope: "shared",
      label: "shared contract updates",
      matches: normalizedPaths.some((filePath) => filePath.includes("contracts")),
    },
    {
      key: "docs",
      scope: "docs",
      label: "documentation updates",
      matches: normalizedPaths.some((filePath) => filePath.startsWith("docs/")),
    },
  ];

  return topics
    .filter((topic) => topic.matches)
    .map(({ key, scope, label }) => ({ key, scope, label }));
}

function inferCommitType(
  request: GenerateCommitMessageRequest,
  topics: Array<{ key: string; scope: string; label: string }>,
): CommitTypeKey {
  const normalizedPaths = request.selectedFiles.map((file) => toPosixPath(file.path));

  if (normalizedPaths.every((filePath) => filePath.startsWith("docs/"))) {
    return "docs";
  }

  if (
    normalizedPaths.every(
      (filePath) =>
        filePath.includes(".github/") ||
        filePath.includes("/workflows/") ||
        filePath.includes("ci"),
    )
  ) {
    return "ci";
  }

  if (
    normalizedPaths.some(
      (filePath) =>
        filePath.includes("package.json") ||
        filePath.includes("pnpm-lock") ||
        filePath.includes("vite.config") ||
        filePath.includes("tsconfig"),
    )
  ) {
    return "build";
  }

  if (normalizedPaths.every((filePath) => /(^|\/)(test|tests|__tests__)\//.test(filePath))) {
    return "test";
  }

  if (topics.some((topic) => topic.key === "commit" || topic.key === "models")) {
    return "refactor";
  }

  return "chore";
}

function buildHeuristicCommitTitle(
  request: GenerateCommitMessageRequest,
  topics: Array<{ key: string; scope: string; label: string }>,
): string {
  const commitType = inferCommitType(request, topics);
  const { emoji, label } = COMMIT_TYPE_META[commitType];
  const scope =
    topics.length === 1
      ? topics[0]?.scope ?? "app"
      : topics.length > 1
        ? "app"
        : "workspace";
  const labels = topics.map((topic) => topic.label);

  let subject = "";
  if (labels.length >= 2) {
    subject = `improve ${labels[0]} and ${labels[1]}`;
  } else if (labels.length === 1) {
    subject = `improve ${labels[0]}`;
  } else if (request.selectedFiles.length === 1) {
    subject = `update ${path.basename(request.selectedFiles[0]?.path ?? "changes")}`;
  } else {
    subject = `update workspace changes`;
  }

  return `${emoji} ${label}(${scope}): ${subject}`;
}

function buildHeuristicCommitDescription(
  request: GenerateCommitMessageRequest,
  topics: Array<{ key: string; scope: string; label: string }>,
): string {
  const descriptionLines = [
    topics.length > 0
      ? `- focus: ${topics.map((topic) => topic.label).join(", ")}`
      : null,
    request.branchName ? `- branch: ${request.branchName}` : null,
    `- files: ${request.selectedFiles.length}`,
  ].filter((line): line is string => !!line);

  return descriptionLines.join("\n");
}

function buildHeuristicCommitMessageResult(
  request: GenerateCommitMessageRequest,
  rawText: string,
  meta: Omit<
    GenerateCommitMessageResult,
    "title" | "description" | "skillName" | "skillUsage"
  >,
): GenerateCommitMessageResult {
  const topics = detectCommitTopics(request.selectedFiles);
  const title = buildHeuristicCommitTitle(request, topics);
  const description = buildHeuristicCommitDescription(request, topics);

  appLogger.warn({
    scope: "worker.commit",
    message: "提交信息生成进入本地兜底",
    data: {
      usedModelRole: meta.usedModelRole,
      fallbackUsed: meta.fallbackUsed,
      selectedFiles: request.selectedFiles.map((file) => file.path),
      rawResponsePreview: previewCommitResponse(rawText),
      title,
      description,
    },
  });

  return {
    title,
    description,
    skillName: "commit",
    skillUsage: getCommitRuntimeSkillUsage(),
    ...meta,
  };
}

function pickFirstString(values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function pickFirstStringArray(values: unknown[]): string[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      const strings = value
        .map((item) => {
          if (typeof item === "string") {
            return item.trim();
          }

          if (
            item &&
            typeof item === "object" &&
            "path" in item &&
            typeof (item as Record<string, unknown>).path === "string"
          ) {
            return ((item as Record<string, unknown>).path as string).trim();
          }

          return "";
        })
        .filter(Boolean);

      if (strings.length > 0) {
        return strings;
      }
    }
  }

  return [];
}

function tryParseCommitMessageJson(
  rawText: string,
): Pick<GenerateCommitMessageResult, "title" | "description"> | null {
  const normalized = stripCodeFence(rawText);

  if (!normalized.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalized);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const title = cleanTitleCandidate(
      pickFirstString([record.title, record.subject, record["标题"], record["提交标题"]]),
    );

    if (!title) {
      return null;
    }

    return {
      title,
      description: pickFirstString([
        record.description,
        record.body,
        record["描述"],
        record["正文"],
        record["提交描述"],
      ]),
    };
  } catch {
    return null;
  }
}

function buildSelectedFilePathMap(
  selectedFiles: GenerateCommitPlanRequest["selectedFiles"],
): Map<string, string> {
  const map = new Map<string, string>();

  for (const file of selectedFiles) {
    const posixPath = toPosixPath(file.path);
    map.set(posixPath, file.path);
    map.set(posixPath.replace(/^\.\//u, ""), file.path);
  }

  return map;
}

function normalizeRequestedFilePath(pathMap: Map<string, string>, value: string): string | null {
  const normalized = toPosixPath(value.trim()).replace(/^\.\//u, "");
  return pathMap.get(normalized) ?? pathMap.get(`./${normalized}`) ?? null;
}

function buildPlanGroupId(): string {
  return randomUUID();
}

function groupFilesForHeuristicPlan(
  selectedFiles: GenerateCommitPlanRequest["selectedFiles"],
): Array<{ key: string; reason: string; files: GenerateCommitPlanRequest["selectedFiles"] }> {
  const groups = new Map<
    string,
    { key: string; reason: string; files: GenerateCommitPlanRequest["selectedFiles"] }
  >();

  for (const file of selectedFiles) {
    const normalizedPath = toPosixPath(file.path);
    const segments = normalizedPath.split("/").filter(Boolean);
    const [first = "workspace", second = ""] = segments;

    let key = first;
    let reason = "按目录边界拆分这组改动。";

    if (first === "docs") {
      key = "docs";
      reason = "文档改动单独提交，review 更清晰。";
    } else if (first === "src" && second) {
      key = `src/${second}`;
      reason = `把 ${second} 相关改动放进同一组。`;
    } else if (first === ".agents") {
      key = ".agents";
      reason = "skill 和 agent 规则改动单独提交。";
    } else if (segments.length === 1) {
      key = "root";
      reason = "根目录文件单独整理成一组。";
    }

    const existing = groups.get(key);
    if (existing) {
      existing.files.push(file);
      continue;
    }

    groups.set(key, {
      key,
      reason,
      files: [file],
    });
  }

  return Array.from(groups.values());
}

function buildHeuristicCommitPlanGroups(
  request: GenerateCommitPlanRequest,
): CommitPlanGroup[] {
  return groupFilesForHeuristicPlan(request.selectedFiles).map((group) => {
    const scopedRequest: GenerateCommitPlanRequest = {
      ...request,
      selectedFiles: group.files,
    };
    const topics = detectCommitTopics(group.files);

    return {
      id: buildPlanGroupId(),
      title: buildHeuristicCommitTitle(scopedRequest, topics),
      description: buildHeuristicCommitDescription(scopedRequest, topics),
      filePaths: group.files.map((file) => file.path),
      reason: group.reason,
    };
  });
}

function normalizeCommitPlanGroups(
  groups: CommitPlanGroup[],
  request: GenerateCommitPlanRequest,
): CommitPlanGroup[] {
  const pathMap = buildSelectedFilePathMap(request.selectedFiles);
  const assigned = new Set<string>();
  const normalizedGroups: CommitPlanGroup[] = [];

  for (const group of groups) {
    const title = cleanTitleCandidate(group.title);
    if (!title) {
      continue;
    }

    const filePaths = group.filePaths
      .map((filePath) => normalizeRequestedFilePath(pathMap, filePath))
      .filter((filePath): filePath is string => !!filePath)
      .filter((filePath) => {
        if (assigned.has(filePath)) {
          return false;
        }

        assigned.add(filePath);
        return true;
      });

    if (filePaths.length === 0) {
      continue;
    }

    normalizedGroups.push({
      id: buildPlanGroupId(),
      title,
      description: group.description.trim(),
      filePaths,
      reason: group.reason?.trim() || undefined,
    });
  }

  if (assigned.size === request.selectedFiles.length) {
    return normalizedGroups;
  }

  const uncoveredFiles = request.selectedFiles.filter((file) => !assigned.has(file.path));
  if (uncoveredFiles.length === 0) {
    return normalizedGroups;
  }

  const fallbackGroups = buildHeuristicCommitPlanGroups({
    ...request,
    selectedFiles: uncoveredFiles,
  });

  return [...normalizedGroups, ...fallbackGroups];
}

function tryParseCommitPlanJson(
  rawText: string,
  request: GenerateCommitPlanRequest,
): CommitPlanGroup[] | null {
  const candidate = extractJsonCandidate(rawText);

  try {
    const parsed = JSON.parse(candidate) as unknown;
    const rawGroups = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? ((parsed as Record<string, unknown>).groups ??
          (parsed as Record<string, unknown>).commits ??
          (parsed as Record<string, unknown>).items)
        : null;

    if (!Array.isArray(rawGroups)) {
      return null;
    }

    const groups = rawGroups
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return null;
        }

        const record = item as Record<string, unknown>;
        const title = cleanTitleCandidate(
          pickFirstString([record.title, record.subject, record["标题"], record["提交标题"]]),
        );

        if (!title) {
          return null;
        }

        return {
          id: buildPlanGroupId(),
          title,
          description: pickFirstString([
            record.description,
            record.body,
            record["描述"],
            record["正文"],
            record["提交描述"],
          ]),
          filePaths: pickFirstStringArray([record.filePaths, record.paths, record.files]),
          reason: pickFirstString([record.reason, record.summary, record["原因"]]) || undefined,
        } satisfies CommitPlanGroup;
      })
      .filter((group): group is CommitPlanGroup => !!group);

    if (groups.length === 0) {
      return null;
    }

    return normalizeCommitPlanGroups(groups, request);
  } catch {
    return null;
  }
}

function buildHeuristicCommitPlanResult(
  request: GenerateCommitPlanRequest,
  rawText: string,
  meta: Omit<GenerateCommitPlanResult, "groups" | "skillName" | "skillUsage">,
): GenerateCommitPlanResult {
  const groups = buildHeuristicCommitPlanGroups(request);

  appLogger.warn({
    scope: "worker.commit-plan",
    message: "提交计划生成进入本地兜底",
    data: {
      usedModelRole: meta.usedModelRole,
      fallbackUsed: meta.fallbackUsed,
      selectedFiles: request.selectedFiles.map((file) => file.path),
      rawResponsePreview: previewCommitResponse(rawText),
      groupCount: groups.length,
    },
  });

  return {
    groups,
    skillName: "commit",
    skillUsage: getCommitRuntimeSkillUsage(),
    ...meta,
  };
}

function parseCommitMessageResult(
  rawText: string,
  meta: Omit<
    GenerateCommitMessageResult,
    "title" | "description" | "skillName" | "skillUsage"
  >,
): GenerateCommitMessageResult {
  const jsonResult = tryParseCommitMessageJson(rawText);

  if (jsonResult) {
    return {
      ...jsonResult,
      skillName: "commit",
      skillUsage: getCommitRuntimeSkillUsage(),
      ...meta,
    };
  }

  const normalized = stripCodeFence(rawText);
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let title = "";
  const descriptionLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (!title) {
      const titleMatch = matchTitleField(line);

      if (titleMatch) {
        const inlineTitle = cleanTitleCandidate(titleMatch[1] ?? "");

        if (inlineTitle) {
          title = inlineTitle;
          continue;
        }

        for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
          const nextLine = lines[nextIndex] ?? "";
          if (!nextLine) {
            continue;
          }
          if (matchDescriptionField(nextLine)) {
            break;
          }

          title = cleanTitleCandidate(nextLine);
          index = nextIndex;
          break;
        }

        continue;
      }

      if (matchDescriptionField(line)) {
        continue;
      }

      title = cleanTitleCandidate(line);
      continue;
    }

    const descriptionMatch = matchDescriptionField(line);
    if (descriptionMatch) {
      const inlineDescription = cleanDescriptionLine(descriptionMatch[1] ?? "");
      if (inlineDescription) {
        descriptionLines.push(inlineDescription);
      }
      continue;
    }

    descriptionLines.push(cleanDescriptionLine(line));
  }

  if (!title) {
    const responsePreview = previewCommitResponse(rawText);
    throw new Error(
      responsePreview
        ? `模型没有返回可用的提交标题。原始返回：${responsePreview}`
        : "模型没有返回可用的提交标题。",
    );
  }

  return {
    title,
    description: descriptionLines.join("\n").trim(),
    skillName: "commit",
    skillUsage: getCommitRuntimeSkillUsage(),
    ...meta,
  };
}

function buildSessionTitlePrompt(input: GenerateSessionTitleInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: [
      "你是聊天标题生成器。",
      "只输出标题本身，不要解释。",
    ].join("\n"),
    userPrompt: [
      "请基于下面这一轮对话生成一个简洁中文标题。",
      "要求：",
      "- 12 个字以内，最长 24 个字符。",
      "- 体现任务意图，不要写成口语句子。",
      "- 不要带书名号、引号、句号、冒号等结尾标点。",
      "",
      "[用户首条消息]",
      input.userText,
      "",
      "[助手首条回复]",
      input.assistantText,
    ].join("\n"),
  };
}

export class WorkerService {
  static async generateCommitMessage(
    request: GenerateCommitMessageRequest,
  ): Promise<GenerateCommitMessageResult> {
    const workspacePath = getSettings().workspace;
    const generation = await generateTextWithFallback({
      systemPrompt: buildCommitMessageSystemPrompt(workspacePath),
      userPrompt: buildCommitMessagePrompt(request),
      repairPromptBuilder: buildCommitMessageRepairPrompt,
    });

    const meta = {
      usedModelRole: generation.usedModelRole,
      fallbackUsed: generation.fallbackUsed,
    } as const;

    try {
      return parseCommitMessageResult(generation.text, meta);
    } catch (error) {
      appLogger.warn({
        scope: "worker.commit",
        message: "提交信息解析失败，切换本地兜底",
        data: {
          usedModelRole: generation.usedModelRole,
          fallbackUsed: generation.fallbackUsed,
          rawResponsePreview: previewCommitResponse(generation.text),
        },
        error,
      });

      return buildHeuristicCommitMessageResult(request, generation.text, meta);
    }
  }

  static async generateCommitPlan(
    request: GenerateCommitPlanRequest,
  ): Promise<GenerateCommitPlanResult> {
    const workspacePath = getSettings().workspace;
    const generation = await generateTextWithFallback({
      systemPrompt: buildCommitPlanSystemPrompt(workspacePath),
      userPrompt: buildCommitPlanPrompt(request),
      repairPromptBuilder: buildCommitPlanRepairPrompt,
    });

    const meta = {
      usedModelRole: generation.usedModelRole,
      fallbackUsed: generation.fallbackUsed,
    } as const;

    const parsed = tryParseCommitPlanJson(generation.text, request);
    if (parsed && parsed.length > 0) {
      return {
        groups: parsed,
        skillName: "commit",
        skillUsage: getCommitRuntimeSkillUsage(),
        ...meta,
      };
    }

    appLogger.warn({
      scope: "worker.commit-plan",
      message: "提交计划解析失败，切换本地兜底",
      data: {
        usedModelRole: generation.usedModelRole,
        fallbackUsed: generation.fallbackUsed,
        rawResponsePreview: previewCommitResponse(generation.text),
      },
    });

    return buildHeuristicCommitPlanResult(request, generation.text, meta);
  }

  static async generateSessionTitle(
    input: GenerateSessionTitleInput,
  ): Promise<string | null> {
    const prompt = buildSessionTitlePrompt(input);
    const result = await generateTextWithFallback(prompt);
    const title = normalizeTitleLine(result.text);
    return title || null;
  }
}
