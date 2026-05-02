import { app } from "electron";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { completeSimple, type TextContent } from "@mariozechner/pi-ai";
import type { MemoryStats } from "../../shared/contracts.js";
import { executeBackgroundRun } from "../background-run.js";
import { appLogger } from "../logger.js";
import { resolveModelEntry } from "../providers.js";
import {
  appendMemoryRefreshEvent,
  loadTranscriptEvents,
} from "../session/service.js";
import { getSettings } from "../settings.js";
import { getChelaMemoryService } from "./rag-service.js";
import {
  classifyMemorySaveCandidate,
  type MemorySaveStatus,
} from "./dedupe.js";
import {
  createMemoryPipeline,
  createMemoryRefreshQueue,
  type MemoryCandidate,
  type MemoryRefreshReport,
} from "./pipeline.js";

// ---------------------------------------------------------------------------
// Hard limits — aligned with Claude Code memdir philosophy
// ---------------------------------------------------------------------------

/** MEMORY.md 索引入口最大行数 */
const MAX_INDEX_LINES = 200;
/** MEMORY.md 索引入口最大字节 */
const MAX_INDEX_BYTES = 25_000;
/** 单个 topic 文件最大字节 */
const MAX_TOPIC_FILE_BYTES = 50_000;
/** 搜索最大返回条目数 */
const MAX_SEARCH_RESULTS = 8;
/** 记忆提取输入最大字符数 */
const MAX_MEMORY_EXTRACTION_CHARS = 8_000;
const MEMORY_NON_TOKEN_PATTERN = /[^\p{L}\p{N}\s]/gu;
const MEMORY_TOKEN_SPLIT_PATTERN = /\s+/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemdirEntry = {
  /** 一行摘要 */
  summary: string;
  /** 所属 topic（文件名，不含 .md） */
  topic: string;
  /** 来源：agent / user / system */
  source: string;
  /** 保存结果状态 */
  status: MemorySaveStatus;
  /** 命中的相近记忆 */
  matchedSummary?: string;
  /** 状态判定原因 */
  reason?: string;
};

export type MemdirSaveInput = {
  /** 一句话摘要，要清晰、具体、可独立理解 */
  summary: string;
  /** topic 分类（如 preferences / architecture / conventions） */
  topic: string;
  /** 详细内容（可选，不填则只在索引中记一行） */
  detail?: string;
  /** 来源 */
  source?: string;
};

export type MemdirSearchResult = {
  summary: string;
  topic: string;
  score: number;
  detail?: string;
};

type MemoryToolModelResult = {
  text: string;
  modelEntryId: string;
};

type AutoMemoryExtractionInput = {
  sessionId: string;
  sourceRunId: string;
};

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function getMemoryDir(): string {
  return join(app.getPath("userData"), "data", "memory");
}

function getIndexPath(): string {
  return join(getMemoryDir(), "MEMORY.md");
}

function getTopicsDir(): string {
  return join(getMemoryDir(), "topics");
}

function getTopicFilePath(topic: string): string {
  const safeName = topic.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, "_");
  return join(getTopicsDir(), `${safeName}.md`);
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function atomicWrite(filePath: string, data: string): void {
  ensureDir(dirname(filePath));
  const tempPath = filePath + ".tmp";
  writeFileSync(tempPath, data, "utf-8");
  renameSync(tempPath, filePath);
}

function safeReadFile(filePath: string): string {
  if (!existsSync(filePath)) return "";
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// MEMORY.md index parser / writer
// ---------------------------------------------------------------------------

type IndexEntry = {
  summary: string;
  topic: string;
};

function parseIndex(content: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  for (const line of content.split("\n")) {
    // 格式：- <summary> [→ topics/<topic>.md]
    const match = line.match(
      /^-\s+(.+?)\s+\[→\s*topics\/([^\]]+?)\.md\]\s*$/,
    );
    if (match) {
      entries.push({ summary: match[1].trim(), topic: match[2].trim() });
    }
  }
  return entries;
}

function renderIndex(entries: IndexEntry[]): string {
  const lines = ["# Long-term Memory Index", ""];

  // 按 topic 分组
  const grouped = new Map<string, string[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.topic) ?? [];
    list.push(entry.summary);
    grouped.set(entry.topic, list);
  }

  for (const [topic, summaries] of grouped) {
    lines.push(`## ${topic}`);
    for (const summary of summaries) {
      lines.push(`- ${summary} [→ topics/${topic}.md]`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Topic file helpers
// ---------------------------------------------------------------------------

function readTopicFile(topic: string): string {
  return safeReadFile(getTopicFilePath(topic));
}

function appendToTopicFile(
  topic: string,
  summary: string,
  detail: string | undefined,
  source: string,
): void {
  const filePath = getTopicFilePath(topic);
  const existing = safeReadFile(filePath);

  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const block = [
    `### ${summary}`,
    `_source: ${source} | saved: ${timestamp}_`,
    "",
    detail ? detail : "_（无详细正文）_",
    "",
  ].join("\n");

  let newContent: string;
  if (!existing.trim()) {
    // 新文件
    newContent = `# ${topic}\n\n${block}`;
  } else {
    newContent = existing.trimEnd() + "\n\n" + block;
  }

  // 硬限制
  const bytes = Buffer.byteLength(newContent, "utf-8");
  if (bytes > MAX_TOPIC_FILE_BYTES) {
    appLogger.info({
      scope: "memdir",
      message: `Topic file '${topic}' exceeds ${MAX_TOPIC_FILE_BYTES} bytes, truncating oldest entries`,
    });
    // 截断策略：保留后半部分（较新的记忆）
    const lines = newContent.split("\n");
    const halfStart = Math.floor(lines.length / 2);
    newContent = `# ${topic}\n\n_（早期记忆已被截断）_\n\n` + lines.slice(halfStart).join("\n");
  }

  atomicWrite(filePath, newContent);
}

// ---------------------------------------------------------------------------
// Keyword search scoring
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(MEMORY_NON_TOKEN_PATTERN, " ")
    .split(MEMORY_TOKEN_SPLIT_PATTERN)
    .filter((tok) => tok.length > 1);
}

function computeScore(text: string, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const haystack = text.toLowerCase();
  let matched = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) matched++;
  }
  return matched / queryTokens.length;
}

function extractText(content: Array<{ type: string }>): string {
  return content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function stripCodeFence(value: string): string {
  return value
    .trim()
    .replace(/^```[a-zA-Z0-9_-]*\s*/u, "")
    .replace(/\s*```$/u, "")
    .trim();
}

function extractJsonCandidate(value: string): string {
  const normalized = stripCodeFence(value);
  if (normalized.startsWith("{") || normalized.startsWith("[")) {
    return normalized;
  }

  const objectStart = normalized.indexOf("{");
  const arrayStart = normalized.indexOf("[");
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  if (starts.length === 0) {
    return normalized;
  }

  const start = Math.min(...starts);
  const end = Math.max(normalized.lastIndexOf("}"), normalized.lastIndexOf("]"));
  return end > start ? normalized.slice(start, end + 1) : normalized;
}

function clampText(value: string, maxLength: number): string {
  const normalized = value.trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trimEnd()}\n[...已截断]`
    : normalized;
}

function resolveMemoryToolModelEntryId(): string {
  const settings = getSettings();
  return (
    settings.memory.toolModelId ??
    settings.modelRouting.subagent.modelId ??
    settings.modelRouting.utility.modelId ??
    settings.modelRouting.chat.modelId
  );
}

async function completeWithMemoryToolModel(input: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}): Promise<MemoryToolModelResult | null> {
  const modelEntryId = resolveMemoryToolModelEntryId();
  const resolved = resolveModelEntry(modelEntryId);
  const response = await completeSimple(
    resolved.model,
    {
      systemPrompt: input.systemPrompt,
      messages: [
        {
          role: "user",
          content: input.userPrompt,
          timestamp: Date.now(),
        },
      ],
    },
    {
      apiKey: resolved.getApiKey(),
      maxTokens: input.maxTokens,
    },
  );
  const text = extractText(response.content);
  return text ? { text, modelEntryId } : null;
}

async function rewriteMemoryQuery(query: string): Promise<string> {
  const settings = getSettings();
  const normalizedQuery = query.trim();
  if (!settings.memory.enabled || !settings.memory.queryRewrite || !normalizedQuery) {
    return normalizedQuery;
  }

  try {
    const result = await completeWithMemoryToolModel({
      systemPrompt: [
        "你是 Chela 的记忆检索查询改写器。",
        "把用户当前消息改写成适合语义向量检索的短查询。",
        "只输出一行查询文本。",
        "保留关键实体、项目名、文件名、偏好和任务目标。",
        "控制在 80 个中文字符以内。",
      ].join("\n"),
      userPrompt: normalizedQuery,
      maxTokens: 120,
    });
    const rewritten = result?.text
      .replace(/\s+/g, " ")
      .replace(/^["'`]+|["'`]+$/gu, "")
      .trim();
    return rewritten || normalizedQuery;
  } catch (error) {
    appLogger.warn({
      scope: "memory.query-rewrite",
      message: "记忆查询重写失败，使用原始查询。",
      error,
    });
    return normalizedQuery;
  }
}

function inferCandidateTopic(record: Record<string, unknown>, tags: string[]): string {
  if (typeof record.topic === "string" && record.topic.trim()) {
    return record.topic.trim();
  }
  const loweredTags = tags.map((tag) => tag.toLowerCase());
  if (loweredTags.some((tag) => tag.includes("preference"))) {
    return "preferences";
  }
  if (loweredTags.some((tag) => tag.includes("architecture"))) {
    return "architecture";
  }
  if (loweredTags.some((tag) => tag.includes("convention"))) {
    return "conventions";
  }
  if (loweredTags.some((tag) => tag.includes("workflow"))) {
    return "workflow";
  }
  if (loweredTags.some((tag) => tag.includes("project"))) {
    return "project";
  }
  return "general";
}

function parseExtractedMemories(rawText: string): MemoryCandidate[] {
  try {
    const parsed = JSON.parse(extractJsonCandidate(rawText)) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const memories: MemoryCandidate[] = [];
    const seen = new Set<string>();

    for (const item of parsed) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }

      const record = item as Record<string, unknown>;
      const content = typeof record.content === "string"
        ? record.content.trim()
        : typeof record.summary === "string"
          ? record.summary.trim()
          : "";
      if (!content || content.length > 800) {
        continue;
      }

      const key = content.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      const tags = Array.isArray(record.tags)
        ? record.tags.filter((tag): tag is string => typeof tag === "string")
        : [];
      const detail = typeof record.detail === "string"
        ? record.detail.trim()
        : undefined;
      const confidence = typeof record.confidence === "number" &&
        Number.isFinite(record.confidence)
        ? Math.max(0, Math.min(1, record.confidence))
        : undefined;
      memories.push({
        content,
        topic: inferCandidateTopic(record, tags),
        detail,
        tags,
        confidence,
      });
      seen.add(key);

      if (memories.length >= 5) {
        break;
      }
    }

    return memories;
  } catch {
    return [];
  }
}

function getLatestTurnText(input: AutoMemoryExtractionInput): {
  userText: string;
  assistantText: string;
} | null {
  const events = loadTranscriptEvents(input.sessionId);
  const assistantIndex = events.findIndex(
    (event) =>
      event.type === "assistant_message" && event.runId === input.sourceRunId,
  );
  if (assistantIndex < 0) {
    return null;
  }

  const assistantEvent = events[assistantIndex];
  const assistantText =
    assistantEvent?.type === "assistant_message"
      ? assistantEvent.message.content.trim()
      : "";
  let userText = "";

  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === "user_message") {
      userText = event.message.content.trim();
      break;
    }
  }

  if (!userText && !assistantText) {
    return null;
  }

  return { userText, assistantText };
}

async function extractMemoriesFromLatestTurn(
  input: AutoMemoryExtractionInput,
): Promise<MemoryCandidate[]> {
  const turn = getLatestTurnText(input);
  if (!turn) {
    return [];
  }

  const result = await completeWithMemoryToolModel({
    systemPrompt: [
      "你是 Chela 的长期记忆提取器。",
      "从最新一轮对话中提取跨会话有价值的信息。",
      "只输出 JSON 数组，不要 Markdown。",
      "数组元素格式为 {\"content\":\"\",\"topic\":\"preferences\",\"detail\":\"\",\"tags\":[\"preferences\"],\"confidence\":0.9}。",
      "只保存用户偏好、项目约定、架构决定、稳定事实、反复出现的工作方式。",
      "临时任务、一次性计划、普通回复内容输出空数组。",
      "最多输出 5 条。",
    ].join("\n"),
    userPrompt: clampText(
      [
        "[用户消息]",
        turn.userText || "无",
        "",
        "[助手回复]",
        turn.assistantText || "无",
      ].join("\n"),
      MAX_MEMORY_EXTRACTION_CHARS,
    ),
    maxTokens: 800,
  });

  return result ? parseExtractedMemories(result.text) : [];
}

// ---------------------------------------------------------------------------
// MemdirStore — 核心类
// ---------------------------------------------------------------------------

class MemdirStore {
  private indexCache: IndexEntry[] | null = null;

  private loadIndex(): IndexEntry[] {
    if (this.indexCache) return this.indexCache;
    const content = safeReadFile(getIndexPath());
    this.indexCache = parseIndex(content);
    return this.indexCache;
  }

  private invalidateCache(): void {
    this.indexCache = null;
  }

  isEnabled(): boolean {
    return true;
  }

  /** 保存一条记忆：写 topic 文件 → 更新索引 */
  save(input: MemdirSaveInput): MemdirEntry {
    const topic = input.topic || "general";
    const source = input.source || "agent";
    const summary = input.summary.trim();
    const entries = this.loadIndex();
    const decision = classifyMemorySaveCandidate({ summary, topic }, entries);

    if (decision.status === "duplicate") {
      appLogger.info({
        scope: "memdir",
        message: "Memory save skipped as duplicate",
        data: {
          topic,
          summary: summary.slice(0, 80),
          matchedSummary: decision.matchedSummary?.slice(0, 80),
          reason: decision.reason,
        },
      });

      return {
        summary,
        topic,
        source,
        status: decision.status,
        matchedSummary: decision.matchedSummary,
        reason: decision.reason,
      };
    }

    if (decision.status === "merged" && decision.matchedSummary) {
      const matchedIndex = entries.findIndex(
        (entry) =>
          entry.topic === topic &&
          entry.summary.toLowerCase() === decision.matchedSummary?.toLowerCase(),
      );
      if (matchedIndex >= 0) {
        entries.splice(matchedIndex, 1);
      }
    }

    const detail =
      decision.status === "conflict" && decision.matchedSummary
        ? [
          `_possible_conflict_with: ${decision.matchedSummary}_`,
          "",
          input.detail ?? "_（无详细正文）_",
        ].join("\n")
        : input.detail;

    appendToTopicFile(topic, summary, detail, source);

    const duplicate = entries.find(
      (entry) =>
        entry.topic === topic &&
        entry.summary.toLowerCase() === summary.toLowerCase(),
    );
    if (!duplicate) {
      entries.push({ summary, topic });
    }

    this.enforceIndexLimits(entries);
    atomicWrite(getIndexPath(), renderIndex(entries));
    this.invalidateCache();

    appLogger.info({
      scope: "memdir",
      message: "Memory saved",
      data: {
        topic,
        summary: summary.slice(0, 80),
        status: decision.status,
        matchedSummary: decision.matchedSummary?.slice(0, 80),
        reason: decision.reason,
      },
    });

    return {
      summary,
      topic,
      source,
      status: decision.status,
      matchedSummary: decision.matchedSummary,
      reason: decision.reason,
    };
  }

  /** 删除一条索引记录 */
  remove(summary: string, topic: string): boolean {
    const entries = this.loadIndex();
    const before = entries.length;
    const filtered = entries.filter(
      (e) =>
        !(
          e.topic === topic &&
          e.summary.toLowerCase() === summary.toLowerCase()
        ),
    );
    if (filtered.length === before) return false;
    atomicWrite(getIndexPath(), renderIndex(filtered));
    this.invalidateCache();
    return true;
  }

  /** 搜索：对索引条目 + topic 正文做关键词匹配 */
  search(query: string, limit?: number): MemdirSearchResult[] {
    const entries = this.loadIndex();
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const cap = limit ?? MAX_SEARCH_RESULTS;
    const results: MemdirSearchResult[] = [];

    for (const entry of entries) {
      const indexScore = computeScore(
        entry.summary + " " + entry.topic,
        queryTokens,
      );
      if (indexScore > 0) {
        results.push({
          summary: entry.summary,
          topic: entry.topic,
          score: indexScore,
        });
      }
    }

    // 对高分结果补充 topic 文件正文
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, cap);

    // 加载命中 topic 的正文片段
    const loadedTopics = new Set<string>();
    for (const result of topResults) {
      if (loadedTopics.has(result.topic)) continue;
      loadedTopics.add(result.topic);
      const content = readTopicFile(result.topic);
      if (content) {
        // 从正文中找到与该 summary 对应的段落
        const detailBlock = extractDetailBlock(content, result.summary);
        if (detailBlock) {
          result.detail = detailBlock;
        }
      }
    }

    return topResults;
  }

  /** 列出所有索引条目 */
  listIndex(): IndexEntry[] {
    return [...this.loadIndex()];
  }

  /** 列出所有 topic 文件名 */
  listTopics(): string[] {
    const dir = getTopicsDir();
    if (!existsSync(dir)) return [];
    try {
      return readdirSync(dir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.replace(/\.md$/, ""));
    } catch {
      return [];
    }
  }

  /** 读取完整 topic 文件 */
  readTopic(topic: string): string {
    return readTopicFile(topic);
  }

  /** 获取当前索引的原始 markdown 内容 */
  getIndexContent(): string {
    return safeReadFile(getIndexPath());
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private enforceIndexLimits(entries: IndexEntry[]): void {
    // 行数限制
    while (entries.length > MAX_INDEX_LINES) {
      entries.shift(); // 移除最早的
    }

    // 字节限制
    let rendered = renderIndex(entries);
    while (
      Buffer.byteLength(rendered, "utf-8") > MAX_INDEX_BYTES &&
      entries.length > 0
    ) {
      entries.shift();
      rendered = renderIndex(entries);
    }
  }
}

/** 从 topic 文件正文中提取与 summary 匹配的段落 */
function extractDetailBlock(
  content: string,
  summary: string,
): string | undefined {
  const lines = content.split("\n");
  const normalizedSummary = summary.toLowerCase().trim();
  let startIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("### ")) {
      const heading = lines[i].replace(/^###\s+/, "").toLowerCase().trim();
      if (heading === normalizedSummary) {
        startIndex = i;
        break;
      }
    }
  }

  if (startIndex < 0) return undefined;

  // 收集到下一个 ### 或文件结束
  const blockLines: string[] = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (lines[i].startsWith("### ")) break;
    blockLines.push(lines[i]);
  }

  const block = blockLines.join("\n").trim();
  return block || undefined;
}

// ---------------------------------------------------------------------------
// buildMemoryInstructions — 教模型如何正确保存记忆
// ---------------------------------------------------------------------------

export function buildMemoryInstructions(): string {
  return [
    "## 长期记忆系统",
    "",
    "你有一个文件化的长期记忆系统（memdir），用于保存跨会话有价值的信息。",
    "",
    "### 保存纪律",
    "- **只保存长期有价值的事实**：用户偏好、项目约定、架构决定、反复出现的模式",
    "- **不要保存临时信息**：当前任务进度、计划、待办事项、一次性指令",
    "- **每条记忆需要一个 topic 分类**：如 preferences、architecture、conventions、workflow、project-structure",
    "- **摘要必须一句话、可独立理解**：不依赖上下文就能明白含义",
    "- **有详细内容时补充 detail**：detail 会写入 topic 文件供后续深度检索",
    "",
    "### 使用 memory_save 工具",
    "```",
    'memory_save({ summary: "用户偏好用 pnpm 而非 npm", topic: "preferences" })',
    'memory_save({ summary: "项目使用四层架构拆分", topic: "architecture", detail: "Harness Runtime / Context Engine / Memory System / Transcript Persistence" })',
    "```",
    "",
    "### 不该保存的",
    "- 当前对话的上下文（session memory 会处理）",
    "- 任务计划或待办（用 todo 工具）",
    "- 代码片段（存在文件里更好）",
    "- 显而易见的事实（不需要记忆来提醒）",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Singleton & public API
// ---------------------------------------------------------------------------

const memdirStore = new MemdirStore();
let lastMemoryRefreshReport: MemoryRefreshReport | null = null;

function createDefaultMemoryPipeline() {
  const memoryService = getChelaMemoryService();
  return createMemoryPipeline({
    saveMemdir: (input) => memdirStore.save(input),
    addVector: async (input) => memoryService.add(input),
    searchVector: async (query, limit) => memoryService.search(query, limit),
    searchMemdir: (query, limit) => memdirStore.search(query, limit),
    rewriteQuery: rewriteMemoryQuery,
    deleteVector: async (memoryId) => memoryService.delete(memoryId),
    feedbackVector: async (memoryId, delta) =>
      memoryService.feedback(memoryId, delta),
    extractCandidates: extractMemoriesFromLatestTurn,
  });
}

const memoryPipeline = createDefaultMemoryPipeline();
const memoryRefreshQueue = createMemoryRefreshQueue(async (input) => {
  const modelEntryId = resolveMemoryToolModelEntryId();
  return executeBackgroundRun({
    sessionId: input.sessionId,
    runKind: "memory_refresh",
    modelEntryId,
    thinkingLevel: "off",
    runIdPrefix: "memory-refresh",
    metadata: {
      sourceRunId: input.sourceRunId,
      purpose: "auto-memory-refresh",
    },
    execute: async (runScope) => {
      const report = await memoryPipeline.refreshAfterRun(input);
      lastMemoryRefreshReport = report;
      appendMemoryRefreshEvent({
        sessionId: report.sessionId,
        runId: runScope.runId,
        report,
      });
      appLogger.info({
        scope: "memory.refresh",
        message: "自动记忆刷新完成",
        data: {
          sessionId: input.sessionId,
          sourceRunId: input.sourceRunId,
          runId: runScope.runId,
          status: report.status,
          extractedCount: report.extractedCount,
          acceptedCount: report.acceptedCount,
          savedCount: report.savedCount,
          duplicateCount: report.duplicateCount,
          mergedCount: report.mergedCount,
          conflictCount: report.conflictCount,
          vectorWrittenCount: report.vectorWrittenCount,
          vectorFailedCount: report.vectorFailedCount,
        },
      });
      return report;
    },
  });
});

export async function getSemanticMemoryPromptSection(input: {
  sessionId: string;
  query: string | null;
}): Promise<string> {
  const settings = getSettings();
  if (!settings.memory.enabled) {
    return "";
  }

  const query = input.query?.trim();

  // 冷启动（无 query）也注入记忆使用纪律 + 索引概览
  if (!query) {
    const indexContent = memdirStore.getIndexContent().trim();
    const parts: string[] = [buildMemoryInstructions()];
    if (indexContent) {
      parts.push("");
      parts.push("## 已有记忆索引");
      const indexLines = indexContent.split("\n");
      if (indexLines.length > 20) {
        parts.push(indexLines.slice(0, 20).join("\n"));
        parts.push(`_（共 ${indexLines.length} 行，已截断显示前 20 行）_`);
      } else {
        parts.push(indexContent);
      }
    }
    return parts.join("\n");
  }

  // 有 query 时：加载索引 + 快路径检索命中
  const indexContent = memdirStore.getIndexContent().trim();
  const parts: string[] = [];

  // Part 1: 记忆使用纪律
  parts.push(buildMemoryInstructions());

  // Part 2: 索引概览（如果有记忆）
  if (indexContent) {
    parts.push("");
    parts.push("## 已有记忆索引");
    // 控制注入大小
    const indexLines = indexContent.split("\n");
    if (indexLines.length > 30) {
      parts.push(indexLines.slice(0, 30).join("\n"));
      parts.push(`_（共 ${indexLines.length} 行，已截断显示前 30 行）_`);
    } else {
      parts.push(indexContent);
    }
  }

  if (settings.memory.autoRetrieve) {
    try {
      const result = await memoryPipeline.retrieveForTurn({
        query,
        limit: Math.min(20, Math.max(1, settings.memory.searchCandidateLimit)),
        minScore: Math.max(
          0,
          Math.min(1, settings.memory.similarityThreshold / 100),
        ),
      });
      if (result.promptSection) {
        parts.push("");
        parts.push(result.promptSection);
      }
    } catch (error) {
      appLogger.warn({
        scope: "memory.retrieve",
        message: "记忆快路径检索失败，本轮使用 memdir 索引兜底。",
        data: {
          sessionId: input.sessionId,
        },
        error,
      });
    }
  }

  return parts.join("\n");
}

export function getMemdirStore(): MemdirStore {
  return memdirStore;
}

export function getMemoryPipeline(): typeof memoryPipeline {
  return memoryPipeline;
}

export function getMemorySyncStats(
  baseStats: MemoryStats,
): Pick<
  MemoryStats,
  | "memdirMemoryCount"
  | "vectorMemoryCount"
  | "lastAutoRefreshAt"
  | "lastFailureReason"
  | "vectorSyncStatus"
> {
  const memdirMemoryCount = memdirStore.listIndex().length;
  const vectorMemoryCount = baseStats.totalMemories;
  const refreshReport = lastMemoryRefreshReport;
  let lastFailureReason: string | null = null;
  if (
    refreshReport &&
    (refreshReport.status === "failed" || refreshReport.vectorFailedCount > 0)
  ) {
    lastFailureReason = refreshReport.failureReason ?? "memory_refresh failed";
  }

  return {
    memdirMemoryCount,
    vectorMemoryCount,
    lastAutoRefreshAt: refreshReport?.completedAt ?? null,
    lastFailureReason,
    vectorSyncStatus:
      memdirMemoryCount === vectorMemoryCount
        ? "synced"
        : memdirMemoryCount > vectorMemoryCount
          ? "memdir_ahead"
          : "vector_ahead",
  };
}

// 向后兼容的别名
export { memdirStore as t1MemoryStore };

export function scheduleAutoMemorySummarize(
  input: AutoMemoryExtractionInput,
): void {
  const settings = getSettings();
  if (!settings.memory.enabled || !settings.memory.autoSummarize) {
    return;
  }

  void memoryRefreshQueue.schedule(input).catch((error) => {
    appLogger.warn({
      scope: "memory.refresh",
      message: "自动记忆提取失败，本轮跳过写入。",
      data: {
        sessionId: input.sessionId,
        sourceRunId: input.sourceRunId,
      },
      error,
    });
  });
}
