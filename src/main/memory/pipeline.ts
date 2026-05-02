import type {
  MemoryAddInput,
  MemoryMetadata,
  MemoryRecord,
  MemorySearchResult,
} from "../../shared/contracts.js";
import type { MemorySaveStatus } from "./dedupe.js";
import type { MemdirEntry, MemdirSaveInput, MemdirSearchResult } from "./service.js";

export type MemoryPipelineSource = "memory_save" | "auto_refresh" | "manual";

export type MemoryCandidate = {
  content: string;
  topic?: string;
  detail?: string;
  tags?: string[];
  confidence?: number;
  source?: string;
  sessionId?: string;
  sourceRunId?: string;
};

export type MemoryVectorWriteResult =
  | { status: "written"; record?: MemoryRecord }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

export type MemorySaveDecision = {
  entry: MemdirEntry;
  vector: MemoryVectorWriteResult;
};

export type MemoryPipelineResult = {
  query: string;
  rewrittenQuery: string;
  vectorResults: MemorySearchResult[];
  memdirResults: MemdirSearchResult[];
  promptSection: string;
};

export type MemoryRefreshInput = {
  sessionId: string;
  sourceRunId: string;
};

export type MemoryRefreshReport = {
  sessionId: string;
  sourceRunId: string;
  status: "completed" | "skipped" | "failed";
  extractedCount: number;
  acceptedCount: number;
  savedCount: number;
  duplicateCount: number;
  mergedCount: number;
  conflictCount: number;
  vectorWrittenCount: number;
  vectorFailedCount: number;
  completedAt: string;
  failureReason?: string;
};

type MemoryPipelineDeps = {
  saveMemdir: (input: MemdirSaveInput) => MemdirEntry;
  addVector: (input: MemoryAddInput) => Promise<MemoryVectorWriteResult | MemoryRecord>;
  searchVector: (query: string, limit?: number) => Promise<MemorySearchResult[]>;
  searchMemdir: (query: string, limit?: number) => MemdirSearchResult[];
  rewriteQuery: (query: string) => Promise<string>;
  deleteVector?: (memoryId: number) => Promise<boolean>;
  feedbackVector?: (memoryId: number, delta: number) => Promise<boolean>;
  extractCandidates?: (input: MemoryRefreshInput) => Promise<MemoryCandidate[]>;
  appendRefreshEvent?: (report: MemoryRefreshReport) => void;
  now?: () => string;
};

const DEFAULT_TOPIC = "general";
const DEFAULT_MIN_CONFIDENCE = 0.72;
const DEFAULT_PROMPT_MIN_SCORE = 0.65;
const MAX_PROMPT_MEMORY_CHARS = 6_000;
const VALUABLE_TOPICS = new Set([
  "architecture",
  "conventions",
  "errors",
  "preferences",
  "project",
  "project-structure",
  "workflow",
]);
const VALUABLE_TAGS = new Set([
  "architecture",
  "convention",
  "conventions",
  "correction",
  "decision",
  "preference",
  "preferences",
  "project",
  "stable",
  "user-preference",
  "workflow",
]);
const LOW_VALUE_TAGS = new Set([
  "chat",
  "current-task",
  "ephemeral",
  "general",
  "session",
  "smalltalk",
  "temporary",
  "todo",
  "transient",
]);
const VALUABLE_CONTENT_PATTERN =
  /(偏好|习惯|称呼|以后|默认|长期|约定|规则|架构|决定|稳定事实|反复|纠正|必须|统一|项目使用|产品名|工作方式)/u;

function normalizeTopic(topic: string | undefined): string {
  const normalized = topic?.trim();
  return normalized || DEFAULT_TOPIC;
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags) {
    const value = tag.trim();
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(value);
  }
  return normalized;
}

function hasLowValueTag(tags: string[]): boolean {
  return tags.some((tag) => LOW_VALUE_TAGS.has(tag.toLowerCase()));
}

function hasLongTermSignal(candidate: MemoryCandidate): boolean {
  const topic = normalizeTopic(candidate.topic).toLowerCase();
  const tags = normalizeTags(candidate.tags);
  return (
    VALUABLE_TOPICS.has(topic) ||
    tags.some((tag) => VALUABLE_TAGS.has(tag.toLowerCase())) ||
    VALUABLE_CONTENT_PATTERN.test(candidate.content)
  );
}

function createVectorContent(candidate: MemoryCandidate): string {
  return [candidate.content.trim(), candidate.detail?.trim()]
    .filter(Boolean)
    .join("\n\n");
}

function toMemoryVectorWriteResult(
  result: MemoryVectorWriteResult | MemoryRecord,
): MemoryVectorWriteResult {
  if ("status" in result && typeof result.status === "string") {
    return result as MemoryVectorWriteResult;
  }
  return { status: "written", record: result as MemoryRecord };
}

function shouldWriteVector(status: MemorySaveStatus): boolean {
  return status === "saved" || status === "merged" || status === "conflict";
}

function buildTags(
  candidate: MemoryCandidate,
  pipelineSource: MemoryPipelineSource,
  status: MemorySaveStatus,
): string[] {
  return [
    normalizeTopic(candidate.topic),
    pipelineSource,
    status,
    ...normalizeTags(candidate.tags),
  ];
}

function buildVectorMetadata(
  candidate: MemoryCandidate,
  entry: MemdirEntry,
  pipelineSource: MemoryPipelineSource,
): MemoryMetadata {
  const metadata: MemoryMetadata = {
    source: pipelineSource,
    topic: entry.topic,
    memdirStatus: entry.status,
    pipelineSource,
    originalSource: entry.source,
    reason: entry.reason,
    matchedSummary: entry.matchedSummary,
    tags: buildTags(candidate, pipelineSource, entry.status),
  };

  if (candidate.sessionId) {
    metadata.sessionId = candidate.sessionId;
  }
  if (candidate.sourceRunId) {
    metadata.sourceRunId = candidate.sourceRunId;
  }
  if (typeof candidate.confidence === "number") {
    metadata.confidence = candidate.confidence;
  }
  if (entry.status === "conflict" && entry.matchedSummary) {
    metadata.conflictWith = entry.matchedSummary;
  }
  if (entry.status === "merged" && entry.matchedSummary) {
    metadata.supersedes = entry.matchedSummary;
  }

  return metadata;
}

async function resolveMergedVector(
  deps: MemoryPipelineDeps,
  entry: MemdirEntry,
): Promise<void> {
  if (entry.status !== "merged" || !entry.matchedSummary) {
    return;
  }

  try {
    const matches = await deps.searchVector(entry.matchedSummary, 5);
    const exact = matches.find(
      (memory) =>
        memory.content.trim().startsWith(entry.matchedSummary ?? "") ||
        memory.metadata?.matchedSummary === entry.matchedSummary,
    );
    if (exact && deps.deleteVector) {
      await deps.deleteVector(exact.id);
      return;
    }
    if (exact && deps.feedbackVector) {
      await deps.feedbackVector(exact.id, -2);
    }
  } catch {
    // 保存新记忆是主路径，旧向量降权失败只影响后续排序。
  }
}

function pushBoundedLine(lines: string[], line: string, budget: { used: number }): boolean {
  if (budget.used + line.length > MAX_PROMPT_MEMORY_CHARS) {
    return false;
  }
  lines.push(line);
  budget.used += line.length;
  return true;
}

export function filterMemoryCandidates(
  candidates: MemoryCandidate[],
  minConfidence = DEFAULT_MIN_CONFIDENCE,
): MemoryCandidate[] {
  const accepted: MemoryCandidate[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const content = candidate.content.trim();
    if (!content || content.length > 800) {
      continue;
    }
    if (
      typeof candidate.confidence === "number" &&
      candidate.confidence < minConfidence
    ) {
      continue;
    }

    const tags = normalizeTags(candidate.tags);
    if (hasLowValueTag(tags)) {
      continue;
    }
    if (!hasLongTermSignal(candidate)) {
      continue;
    }

    const topic = normalizeTopic(candidate.topic);
    const key = `${topic}:${content.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    accepted.push({
      ...candidate,
      content,
      topic,
      tags,
    });
  }

  return accepted;
}

export function formatMemoryPromptSection(input: {
  query: string;
  vectorResults: MemorySearchResult[];
  memdirResults: MemdirSearchResult[];
  minScore?: number;
}): string {
  const minScore = input.minScore ?? DEFAULT_PROMPT_MIN_SCORE;
  const vectorResults = input.vectorResults.filter(
    (result) => result.score >= minScore,
  );
  const parts: string[] = [];
  const budget = { used: 0 };

  if (vectorResults.length > 0) {
    parts.push("## 向量记忆检索结果");
    for (const result of vectorResults) {
      const topic = typeof result.metadata?.topic === "string"
        ? result.metadata.topic
        : "memory";
      const status = typeof result.metadata?.memdirStatus === "string"
        ? ` status=${result.metadata.memdirStatus}`
        : "";
      const line = `- **[${topic}]** ${result.content} (score=${result.score.toFixed(3)}${status})`;
      if (!pushBoundedLine(parts, line, budget)) {
        break;
      }
    }
  }

  if (input.memdirResults.length > 0) {
    if (parts.length > 0) {
      parts.push("");
    }
    parts.push("## 与当前话题相关的文件记忆");
    for (const result of input.memdirResults) {
      const line = `- **[${result.topic}]** ${result.summary}`;
      if (!pushBoundedLine(parts, line, budget)) {
        break;
      }
      if (result.detail) {
        const detailPreview =
          result.detail.length > 300
            ? `${result.detail.slice(0, 300)}...`
            : result.detail;
        pushBoundedLine(
          parts,
          `  > ${detailPreview.replace(/\n/g, "\n  > ")}`,
          budget,
        );
      }
    }
  }

  return parts.join("\n");
}

export function createMemoryPipeline(deps: MemoryPipelineDeps) {
  async function retrieveForTurn(input: {
    query: string;
    limit?: number;
    minScore?: number;
  }): Promise<MemoryPipelineResult> {
    const query = input.query.trim();
    if (!query) {
      return {
        query,
        rewrittenQuery: query,
        vectorResults: [],
        memdirResults: [],
        promptSection: "",
      };
    }

    let rewrittenQuery = query;
    try {
      rewrittenQuery = (await deps.rewriteQuery(query)).trim() || query;
    } catch {
      rewrittenQuery = query;
    }
    const limit = input.limit ?? 8;
    const [vectorResult, memdirResult] = await Promise.allSettled([
      deps.searchVector(rewrittenQuery, limit),
      Promise.resolve(deps.searchMemdir(rewrittenQuery, limit)),
    ]);
    const vectorResults =
      vectorResult.status === "fulfilled" ? vectorResult.value : [];
    const memdirResults =
      memdirResult.status === "fulfilled" ? memdirResult.value : [];
    const promptSection = formatMemoryPromptSection({
      query: rewrittenQuery,
      vectorResults,
      memdirResults,
      minScore: input.minScore,
    });

    return {
      query,
      rewrittenQuery,
      vectorResults,
      memdirResults,
      promptSection,
    };
  }

  async function saveCandidate(
    candidate: MemoryCandidate,
    pipelineSource: MemoryPipelineSource,
  ): Promise<MemorySaveDecision> {
    const topic = normalizeTopic(candidate.topic);
    const entry = deps.saveMemdir({
      summary: candidate.content,
      topic,
      detail: candidate.detail,
      source: candidate.source ??
        (pipelineSource === "memory_save" ? "agent" : pipelineSource),
    });

    if (!shouldWriteVector(entry.status)) {
      return {
        entry,
        vector: {
          status: "skipped",
          reason: `${entry.status} 不重复写入向量库`,
        },
      };
    }

    await resolveMergedVector(deps, entry);

    try {
      const vector = await deps.addVector({
        content: createVectorContent(candidate),
        metadata: buildVectorMetadata(candidate, entry, pipelineSource),
      });
      return {
        entry,
        vector: toMemoryVectorWriteResult(vector),
      };
    } catch (error) {
      return {
        entry,
        vector: {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async function refreshAfterRun(
    input: MemoryRefreshInput,
  ): Promise<MemoryRefreshReport> {
    const now = deps.now ?? (() => new Date().toISOString());
    if (!deps.extractCandidates) {
      const report: MemoryRefreshReport = {
        ...input,
        status: "skipped",
        extractedCount: 0,
        acceptedCount: 0,
        savedCount: 0,
        duplicateCount: 0,
        mergedCount: 0,
        conflictCount: 0,
        vectorWrittenCount: 0,
        vectorFailedCount: 0,
        completedAt: now(),
        failureReason: "extractor-missing",
      };
      deps.appendRefreshEvent?.(report);
      return report;
    }

    try {
      const extracted = await deps.extractCandidates(input);
      const accepted = filterMemoryCandidates(extracted);
      const report: MemoryRefreshReport = {
        ...input,
        status: "completed",
        extractedCount: extracted.length,
        acceptedCount: accepted.length,
        savedCount: 0,
        duplicateCount: 0,
        mergedCount: 0,
        conflictCount: 0,
        vectorWrittenCount: 0,
        vectorFailedCount: 0,
        completedAt: now(),
      };

      for (const candidate of accepted) {
        const result = await saveCandidate(
          {
            ...candidate,
            sessionId: candidate.sessionId ?? input.sessionId,
            sourceRunId: candidate.sourceRunId ?? input.sourceRunId,
          },
          "auto_refresh",
        );

        switch (result.entry.status) {
          case "saved":
            report.savedCount += 1;
            break;
          case "duplicate":
            report.duplicateCount += 1;
            break;
          case "merged":
            report.mergedCount += 1;
            break;
          case "conflict":
            report.conflictCount += 1;
            break;
        }
        if (result.vector.status === "written") {
          report.vectorWrittenCount += 1;
        } else if (result.vector.status === "failed") {
          report.vectorFailedCount += 1;
          report.failureReason = result.vector.error;
        }
      }

      deps.appendRefreshEvent?.(report);
      return report;
    } catch (error) {
      const report: MemoryRefreshReport = {
        ...input,
        status: "failed",
        extractedCount: 0,
        acceptedCount: 0,
        savedCount: 0,
        duplicateCount: 0,
        mergedCount: 0,
        conflictCount: 0,
        vectorWrittenCount: 0,
        vectorFailedCount: 0,
        completedAt: now(),
        failureReason: error instanceof Error ? error.message : String(error),
      };
      deps.appendRefreshEvent?.(report);
      return report;
    }
  }

  return {
    retrieveForTurn,
    refreshAfterRun,
    saveCandidate,
  };
}

export function createMemoryRefreshQueue(
  runner: (input: MemoryRefreshInput) => Promise<MemoryRefreshReport>,
) {
  const inflight = new Map<string, Promise<MemoryRefreshReport>>();

  return {
    schedule(input: MemoryRefreshInput): Promise<MemoryRefreshReport> {
      const key = `${input.sessionId}:${input.sourceRunId}`;
      const current = inflight.get(key);
      if (current) {
        return current;
      }

      const next = runner(input).finally(() => {
        inflight.delete(key);
      });
      inflight.set(key, next);
      return next;
    },
  };
}
