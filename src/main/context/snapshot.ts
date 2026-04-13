import { completeSimple, type TextContent } from "@mariozechner/pi-ai";
import type {
  ChatMessage,
  ContextSummary,
  SelectedFile,
  SessionMemorySnapshot,
  SessionTranscriptEvent,
} from "../../shared/contracts.js";
import { executeBackgroundRun } from "../background-run.js";
import { getGitDiffSnapshot } from "../git.js";
import { harnessRuntime } from "../harness/singleton.js";
import { getEntry } from "../providers.js";
import { resolveRuntimeModel } from "../model-resolution.js";
import {
  appendCompactAppliedEvent,
  getPersistedSnapshot,
  getSessionMeta,
  loadTranscriptEvents,
  updateSessionMeta,
  writePersistedSnapshot,
} from "../session/service.js";
import { getSettings } from "../settings.js";

const PROTECTED_USER_TURNS = 6;
const PROTECTED_MESSAGE_COUNT = PROTECTED_USER_TURNS * 2;
const SUMMARY_LINE_LIMIT = 6;
const MAX_IMPORTANT_ITEMS = 8;
const MAX_AUTO_COMPACT_FAILURES = 3;
const compactingSessionIds = new Set<string>();

type MessageTranscriptEvent = Extract<
  SessionTranscriptEvent,
  { type: "user_message" | "assistant_message" }
>;

type PersistedAttachment = Pick<
  SelectedFile,
  "id" | "name" | "path" | "kind"
>;

type SnapshotDraft = Pick<
  SessionMemorySnapshot,
  "summary" | "currentTask" | "currentState" | "decisions" | "openLoops" | "nextActions" | "risks" | "errors" | "learnings"
>;

function getMessageEvents(events: SessionTranscriptEvent[]): MessageTranscriptEvent[] {
  return events.filter(
    (event): event is MessageTranscriptEvent =>
      event.type === "user_message" || event.type === "assistant_message",
  );
}

function truncateText(text: string, maxLength = 120): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  return normalized.length <= maxLength
    ? normalized
    : normalized.slice(0, Math.max(12, maxLength - 1)).trimEnd() + "…";
}

function dedupeTake(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function mergePriorityArray(
  primary: string[],
  fallback: string[],
  limit: number,
): string[] {
  return dedupeTake([...primary, ...fallback], limit);
}

function isPersistedAttachment(value: unknown): value is PersistedAttachment {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PersistedAttachment>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.kind === "string"
  );
}

function extractMessageAttachments(message: ChatMessage): PersistedAttachment[] {
  const attachments = message.meta?.attachments;
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments.filter(isPersistedAttachment);
}

function looksLikePath(value: string, keyHint?: string): boolean {
  if (!value.trim()) {
    return false;
  }

  if (!keyHint || !/(^|_)(path|file|files|cwd|dir|directory|workspace)(_|$)/i.test(keyHint)) {
    return false;
  }

  return (
    /^[a-zA-Z]:\\/.test(value) ||
    value.includes("\\") ||
    value.includes("/")
  );
}

function collectPathsFromValue(
  value: unknown,
  result: Set<string>,
  keyHint?: string,
): void {
  if (typeof value === "string") {
    if (looksLikePath(value, keyHint)) {
      result.add(value.trim());
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectPathsFromValue(item, result, keyHint));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    collectPathsFromValue(nested, result, key);
  }
}

function collectImportantFiles(events: SessionTranscriptEvent[], untilSeq: number): string[] {
  const result = new Set<string>();

  for (const event of events) {
    if (event.seq > untilSeq) {
      break;
    }

    if (event.type === "tool_started") {
      collectPathsFromValue(event.args, result);
    }

    if (event.type === "user_message") {
      extractMessageAttachments(event.message).forEach((attachment) => {
        result.add(attachment.path);
      });
    }
  }

  return [...result].slice(0, MAX_IMPORTANT_ITEMS);
}

function collectImportantAttachments(events: MessageTranscriptEvent[]): PersistedAttachment[] {
  const attachments = events.flatMap((event) => extractMessageAttachments(event.message));
  const unique = new Map<string, PersistedAttachment>();

  for (const attachment of attachments) {
    if (!unique.has(attachment.id)) {
      unique.set(attachment.id, attachment);
    }
  }

  return [...unique.values()].slice(0, MAX_IMPORTANT_ITEMS);
}

function getMessageSnippets(message: ChatMessage, maxLength = 100): string[] {
  return message.content
    .split(/\r?\n+|(?<=[。！？；])/u)
    .map((line) => truncateText(line, maxLength))
    .filter(Boolean);
}

function getLatestPendingConfirmation(events: SessionTranscriptEvent[]) {
  const latestRequested = [...events].reverse().find(
    (
      event,
    ): event is Extract<SessionTranscriptEvent, { type: "confirmation_requested" }> =>
      event.type === "confirmation_requested",
  );
  if (!latestRequested) {
    return null;
  }

  const resolved = [...events].reverse().find(
    (
      event,
    ): event is Extract<SessionTranscriptEvent, { type: "confirmation_resolved" }> =>
      event.type === "confirmation_resolved" &&
      event.requestId === latestRequested.requestId,
  );

  return resolved ? null : latestRequested;
}

function getLatestUserEvent(events: SessionTranscriptEvent[]) {
  return [...events].reverse().find(
    (
      event,
    ): event is Extract<SessionTranscriptEvent, { type: "user_message" }> =>
      event.type === "user_message",
  );
}

function getLatestAssistantEvent(events: SessionTranscriptEvent[]) {
  return [...events].reverse().find(
    (
      event,
    ): event is Extract<SessionTranscriptEvent, { type: "assistant_message" }> =>
      event.type === "assistant_message",
  );
}

function getLatestToolFailure(events: SessionTranscriptEvent[]) {
  return [...events].reverse().find(
    (
      event,
    ): event is Extract<SessionTranscriptEvent, { type: "tool_finished" }> =>
      event.type === "tool_finished" && typeof event.error === "string" && !!event.error.trim(),
  );
}

function getLatestUnansweredUserEvent(events: SessionTranscriptEvent[]) {
  const latestUser = getLatestUserEvent(events);
  const latestAssistant = getLatestAssistantEvent(events);

  if (
    latestUser &&
    (!latestAssistant ||
      Date.parse(latestUser.timestamp) > Date.parse(latestAssistant.timestamp))
  ) {
    return latestUser;
  }

  return null;
}

function collectDecisionHighlights(messages: ChatMessage[]): string[] {
  const decisionKeywords = /(决定|改成|采用|切到|保留|不做|默认|约束|方案|先|暂时|优先)/i;
  const lines = messages.flatMap((message) => getMessageSnippets(message, 92));
  const decisionLines = lines.filter((line) => decisionKeywords.test(line));

  if (decisionLines.length > 0) {
    return dedupeTake(decisionLines.reverse(), 4);
  }

  return dedupeTake(
    messages
      .slice(-2)
      .flatMap((message) => getMessageSnippets(message, 92))
      .reverse(),
    3,
  );
}

function collectProgressHighlights(events: MessageTranscriptEvent[]): string[] {
  const assistantMessages = events
    .filter((event) => event.type === "assistant_message")
    .map((event) => event.message);
  const assistantLines = assistantMessages.flatMap((message) =>
    getMessageSnippets(message, 96),
  );

  return dedupeTake(assistantLines.reverse(), 3);
}

function resolveCurrentTask(events: SessionTranscriptEvent[]): string | null {
  const unansweredUser = getLatestUnansweredUserEvent(events);
  if (unansweredUser) {
    return truncateText(unansweredUser.message.content, 120);
  }

  const latestUser = getLatestUserEvent(events);
  return latestUser ? truncateText(latestUser.message.content, 120) : null;
}

function getLatestRunFinished(events: SessionTranscriptEvent[]) {
  return [...events].reverse().find(
    (
      event,
    ): event is Extract<SessionTranscriptEvent, { type: "run_finished" }> =>
      event.type === "run_finished",
  );
}

function getLatestRunStarted(events: SessionTranscriptEvent[]) {
  return [...events].reverse().find(
    (
      event,
    ): event is Extract<SessionTranscriptEvent, { type: "run_started" }> =>
      event.type === "run_started",
  );
}

function resolveCurrentState(events: SessionTranscriptEvent[]): string | null {
  const pendingConfirmation = getLatestPendingConfirmation(events);
  if (pendingConfirmation) {
    return "等待用户确认";
  }

  const latestToolFailure = getLatestToolFailure(events);
  if (latestToolFailure) {
    return `卡在 ${latestToolFailure.toolName} 错误`;
  }

  const unansweredUser = getLatestUnansweredUserEvent(events);
  if (unansweredUser) {
    return "等待继续处理最新用户请求";
  }

  const latestFinished = getLatestRunFinished(events);
  if (latestFinished?.finalState === "failed") {
    return "上次运行失败，等待恢复";
  }

  if (latestFinished?.finalState === "aborted") {
    return "上次运行已取消，等待下一步";
  }

  if (latestFinished?.finalState === "completed") {
    return "已有阶段性结果，可继续推进";
  }

  const meta = getSessionMeta(events[0]?.sessionId ?? "");
  return meta?.lastRunState ?? null;
}

function collectOpenLoops(events: SessionTranscriptEvent[]): string[] {
  const loops: string[] = [];
  const latestToolFailure = getLatestToolFailure(events);
  const latestFinished = getLatestRunFinished(events);
  if (latestFinished?.finalState === "failed") {
    loops.push(
      latestFinished.reason
        ? `上次运行失败：${truncateText(latestFinished.reason, 80)}`
        : "上次运行失败，原因待排查。",
    );
  }

  if (latestToolFailure?.error) {
    loops.push(
      `${latestToolFailure.toolName} 执行失败：${truncateText(latestToolFailure.error, 80)}`,
    );
  }

  const pendingConfirmation = getLatestPendingConfirmation(events);
  if (pendingConfirmation) {
    loops.push(`仍有待确认操作：${truncateText(pendingConfirmation.description, 80)}`);
  }

  const unansweredUser = getLatestUnansweredUserEvent(events);
  if (unansweredUser) {
    loops.push(`最近一条用户请求仍待收口：${truncateText(unansweredUser.message.content, 80)}`);
  }

  return dedupeTake(loops, 4);
}

function collectNextActions(events: SessionTranscriptEvent[]): string[] {
  const actions: string[] = [];
  const pendingConfirmation = getLatestPendingConfirmation(events);
  const latestToolFailure = getLatestToolFailure(events);
  const latestUser = getLatestUserEvent(events);
  const latestAssistant = getLatestAssistantEvent(events);

  if (pendingConfirmation) {
    actions.push(`先处理确认：${truncateText(pendingConfirmation.title, 72)}`);
  }

  if (latestToolFailure) {
    actions.push(`先排查 ${latestToolFailure.toolName} 的失败原因并决定是否重试。`);
  }

  if (latestAssistant?.message.steps?.length) {
    const lastTool = [...latestAssistant.message.steps]
      .reverse()
      .find((step) => step.kind === "tool_call" && step.toolName);
    if (lastTool?.toolName) {
      actions.push(`继续围绕 ${lastTool.toolName} 对应结果推进收口。`);
    }
  }

  if (latestUser?.message.content.trim()) {
    actions.push(`优先响应最近用户目标：${truncateText(latestUser.message.content, 80)}`);
  }

  return dedupeTake(actions, 3);
}

function collectRisks(events: SessionTranscriptEvent[]): string[] {
  const risks: string[] = [];
  const latestFinished = getLatestRunFinished(events);
  if (latestFinished?.reason === "app_restart_interrupted") {
    risks.push("应用重启打断过一次运行，需要人工确认线程现场是否完整。");
  }

  const latestConfirmation = [...events].reverse().find(
    (
      event,
    ): event is Extract<SessionTranscriptEvent, { type: "confirmation_resolved" }> =>
      event.type === "confirmation_resolved",
  );
  if (latestConfirmation && latestConfirmation.allowed === false) {
    risks.push("最近一次高风险操作被用户拒绝，后续执行路径可能需要改写。");
  }

  return dedupeTake(risks, 3);
}

function collectErrors(events: SessionTranscriptEvent[]): string[] {
  const errors: string[] = [];
  for (const event of events) {
    if (event.type === "tool_finished" && event.error) {
      errors.push(`工具 ${event.toolName} 失败: ${truncateText(event.error, 80)}`);
    }
    if (event.type === "run_finished" && event.finalState === "failed" && event.reason) {
      errors.push(`运行失败: ${truncateText(event.reason, 80)}`);
    }
  }
  return dedupeTake(errors, 5);
}

function buildSummaryText(input: {
  backgroundGoals: string[];
  progress: string[];
  currentState: string | null;
  decisions: string[];
  importantFiles: string[];
  openLoops: string[];
  nextActions: string[];
  risks: string[];
}): string {
  const lines = [
    input.backgroundGoals.length > 0 ? `背景目标：${input.backgroundGoals.join("；")}` : "",
    input.progress.length > 0 ? `已做进展：${input.progress.join("；")}` : "",
    input.currentState ? `当前停点：${input.currentState}` : "",
    input.decisions.length > 0 ? `关键决策：${input.decisions.join("；")}` : "",
    input.importantFiles.length > 0
      ? `关键文件：${input.importantFiles.map((file) => truncateText(file, 72)).join("，")}`
      : "",
    input.openLoops.length > 0 ? `未闭环：${input.openLoops.join("；")}` : "",
    input.nextActions.length > 0 ? `下一步：${input.nextActions.join("；")}` : "",
    input.risks.length > 0 ? `风险：${input.risks.join("；")}` : "",
  ].filter(Boolean);

  return lines.slice(0, SUMMARY_LINE_LIMIT).join("\n");
}

function buildCompactTranscriptExcerpt(events: MessageTranscriptEvent[]): string {
  const head = events.slice(0, 4);
  const tail = events.slice(-16);
  const merged = [...head, ...tail].filter(
    (event, index, list) =>
      list.findIndex((candidate) => candidate.message.id === event.message.id) === index,
  );

  return merged
    .map((event) => {
      const roleLabel =
        event.type === "user_message"
          ? "user"
          : event.message.role === "assistant"
            ? "assistant"
            : event.message.role;
      return `- [${roleLabel}] ${truncateText(event.message.content, 220)}`;
    })
    .join("\n");
}

function extractTextBlocks(contents: Array<{ type: string }>): string {
  return contents
    .flatMap((content) => {
      if (content.type !== "text") {
        return [];
      }

      return [(content as TextContent).text];
    })
    .join("\n")
    .trim();
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const candidates = [normalized];
  const firstBrace = normalized.indexOf("{");
  const lastBrace = normalized.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(normalized.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

function normalizeDraftString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  return truncateText(normalized, maxLength);
}

function normalizeDraftStringArray(value: unknown, limit: number, maxLength: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return dedupeTake(
    value
      .map((item) => normalizeDraftString(item, maxLength))
      .filter((item): item is string => !!item),
    limit,
  );
}

function normalizeSnapshotDraft(value: Record<string, unknown>): SnapshotDraft | null {
  const summary = normalizeDraftString(value.summary, 1200);
  if (!summary) {
    return null;
  }

  return {
    summary,
    currentTask: normalizeDraftString(value.currentTask, 120),
    currentState: normalizeDraftString(value.currentState, 120),
    decisions: normalizeDraftStringArray(value.decisions, 4, 120),
    openLoops: normalizeDraftStringArray(value.openLoops, 4, 120),
    nextActions: normalizeDraftStringArray(value.nextActions, 3, 120),
    risks: normalizeDraftStringArray(value.risks, 3, 120),
    errors: normalizeDraftStringArray(value.errors, 5, 120),
    learnings: normalizeDraftStringArray(value.learnings, 3, 120),
  };
}

async function buildSnapshotDraftWithModel(input: {
  sessionId: string;
  compactedEvents: MessageTranscriptEvent[];
  importantFiles: string[];
  openLoops: string[];
  nextActions: string[];
  risks: string[];
  decisions: string[];
  currentState: string | null;
  currentTask: string | null;
}): Promise<SnapshotDraft | null> {
  const meta = getSessionMeta(input.sessionId);
  const preferredModelId = meta?.lastModelEntryId ?? getSettings().defaultModelId;

  try {
    const resolved = resolveRuntimeModel(preferredModelId);
    const response = await completeSimple(
      resolved.model,
      {
        systemPrompt: [
          "你是 session continuity compact summarizer。",
          "你的任务是把一段历史线程压缩成可续会话摘要。",
          "只输出 JSON，不要解释，不要 Markdown。",
          "禁止编造没有出现在输入里的文件、风险、决策或任务。",
          "summary 要像工作现场记录，覆盖：背景目标、已做进展、当前停点、关键决策、下一步、风险。",
        ].join("\n"),
        messages: [
          {
            role: "user",
            content: [
              "请基于下面材料生成 JSON，字段固定为：",
              "{",
              '  "summary": string,',
              '  "currentTask": string | null,',
              '  "currentState": string | null,',
              '  "decisions": string[],',
              '  "openLoops": string[],',
              '  "nextActions": string[],',
              '  "risks": string[],',
              '  "errors": string[],',
              '  "learnings": string[]',
              "}",
              "",
              "要求：",
              "- summary 用中文，控制在 6 行以内，适合下次打开线程直接接上。",
              "- 数组项简短具体，不超过 4 项。",
              "- errors 只记录本轮遇到的工具/API 失败，不是用户提到的 bug。",
              "- learnings 只记录跨会话有价值的经验教训（如某方案不可行、某 API 有坑）。",
              "- 如果某字段不确定，就给 null 或空数组。",
              "",
              `当前任务候选：${input.currentTask ?? "null"}`,
              `当前状态候选：${input.currentState ?? "null"}`,
              `关键决策候选：${input.decisions.join("；") || "无"}`,
              `未闭环候选：${input.openLoops.join("；") || "无"}`,
              `下一步候选：${input.nextActions.join("；") || "无"}`,
              `风险候选：${input.risks.join("；") || "无"}`,
              `关键文件候选：${input.importantFiles.join("，") || "无"}`,
              "",
              "可被 compact 的历史摘录：",
              buildCompactTranscriptExcerpt(input.compactedEvents),
            ].join("\n"),
            timestamp: Date.now(),
          },
        ],
      },
      {
        apiKey: resolved.apiKey,
        maxTokens: 900,
      },
    );

    const text = extractTextBlocks(response.content);
    const parsed = tryParseJsonObject(text);
    return parsed ? normalizeSnapshotDraft(parsed) : null;
  } catch {
    return null;
  }
}

function getUsageStats(events: SessionTranscriptEvent[]) {
  let latest: { inputTokens: number; outputTokens: number } | null = null;
  let messageCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (
      event?.type === "assistant_message" &&
      typeof event.message.usage?.inputTokens === "number" &&
      typeof event.message.usage?.outputTokens === "number"
    ) {
      if (!latest) {
        latest = event.message.usage;
      }
      messageCount += 1;
      totalInputTokens += event.message.usage.inputTokens;
      totalOutputTokens += event.message.usage.outputTokens;
    }
  }

  return {
    latest,
    messageCount,
    totalInputTokens,
    totalOutputTokens,
  };
}

function resolveContextWindow(sessionId: string): number | null {
  const meta = getSessionMeta(sessionId);
  const preferredModelEntryId = getSettings().defaultModelId;
  const entry =
    getEntry(preferredModelEntryId) ??
    (meta?.lastModelEntryId ? getEntry(meta.lastModelEntryId) : null);
  return entry?.limits.contextWindow ?? entry?.detectedLimits.contextWindow ?? null;
}

function buildContextSummaryFromUsage(sessionId: string): ContextSummary {
  const usageStats = getUsageStats(loadTranscriptEvents(sessionId));
  const usage = usageStats.latest;
  const contextWindow = resolveContextWindow(sessionId);
  const meta = getSessionMeta(sessionId);
  const latestInputTokens = usage?.inputTokens ?? null;
  const latestOutputTokens = usage?.outputTokens ?? null;
  const estimatedUsedTokens =
    typeof latestInputTokens === "number" && typeof latestOutputTokens === "number"
      ? Math.max(latestInputTokens + latestOutputTokens, 0)
      : typeof contextWindow === "number"
        ? 0
        : null;
  const estimatedRemainingTokens =
    typeof estimatedUsedTokens === "number" && typeof contextWindow === "number"
      ? Math.max(contextWindow - estimatedUsedTokens, 0)
      : null;
  const usedRatio =
    typeof estimatedUsedTokens === "number" &&
    typeof contextWindow === "number" &&
    contextWindow > 0
      ? Math.min(1, Math.max(0, estimatedUsedTokens / contextWindow))
      : null;
  const remainingRatio =
    typeof estimatedRemainingTokens === "number" &&
    typeof contextWindow === "number" &&
    contextWindow > 0
      ? Math.min(1, Math.max(0, estimatedRemainingTokens / contextWindow))
      : null;
  const snapshot = getPersistedSnapshot(sessionId);
  const requiredCompactedUntilSeq = getRequiredCompactedUntilSeq(sessionId);
  const hasSnapshot = snapshot.revision > 0;

  return {
    state:
      typeof contextWindow === "number" && usage
        ? "ready"
        : typeof contextWindow === "number"
          ? "window-only"
          : usage
            ? "usage-only"
            : "unknown",
    contextWindow,
    latestInputTokens,
    latestOutputTokens,
    usageMessageCount: usageStats.messageCount,
    usageTotalInputTokens: usageStats.totalInputTokens,
    usageTotalOutputTokens: usageStats.totalOutputTokens,
    estimatedUsedTokens,
    estimatedRemainingTokens,
    usedRatio,
    remainingRatio,
    snapshotRevision: snapshot.revision,
    snapshotUpdatedAt: hasSnapshot ? snapshot.updatedAt : null,
    compactedUntilSeq: snapshot.compactedUntilSeq > 0 ? snapshot.compactedUntilSeq : null,
    snapshotSummary: hasSnapshot && snapshot.summary.trim() ? snapshot.summary : null,
    currentTask: hasSnapshot ? snapshot.currentTask : null,
    currentState: hasSnapshot ? snapshot.currentState : null,
    branchName: hasSnapshot ? snapshot.workspace.branchName : null,
    importantFiles: hasSnapshot ? snapshot.importantFiles.slice(0, 4) : [],
    openLoops: hasSnapshot ? snapshot.openLoops.slice(0, 3) : [],
    nextActions: hasSnapshot ? snapshot.nextActions.slice(0, 3) : [],
    risks: hasSnapshot ? snapshot.risks.slice(0, 3) : [],
    autoCompactFailureCount: meta?.autoCompactFailureCount ?? 0,
    autoCompactBlocked: !!meta?.autoCompactBlockedAt,
    autoCompactBlockedAt: meta?.autoCompactBlockedAt ?? null,
    canCompact: requiredCompactedUntilSeq > snapshot.compactedUntilSeq,
    isCompacting: compactingSessionIds.has(sessionId),
  };
}

export function getRequiredCompactedUntilSeq(sessionId: string): number {
  const messageEvents = getMessageEvents(loadTranscriptEvents(sessionId));
  if (messageEvents.length <= PROTECTED_MESSAGE_COUNT) {
    return 0;
  }

  return messageEvents[messageEvents.length - PROTECTED_MESSAGE_COUNT - 1]?.seq ?? 0;
}

async function resolveBranchName(): Promise<string | null> {
  const workspacePath = getSettings().workspace;
  try {
    const snapshot = await getGitDiffSnapshot(workspacePath);
    return snapshot.branch.branchName;
  } catch {
    return null;
  }
}

async function buildSnapshot(sessionId: string): Promise<SessionMemorySnapshot | null> {
  const currentSnapshot = getPersistedSnapshot(sessionId);
  const events = loadTranscriptEvents(sessionId);
  const messageEvents = getMessageEvents(events);
  if (messageEvents.length <= PROTECTED_MESSAGE_COUNT) {
    return null;
  }

  const cutoffIndex = messageEvents.length - PROTECTED_MESSAGE_COUNT;
  const olderEvents = messageEvents.slice(0, cutoffIndex);
  const compactedUntilSeq = olderEvents.at(-1)?.seq ?? 0;
  if (compactedUntilSeq <= 0) {
    return null;
  }

  const olderMessages = olderEvents.map((event) => event.message);
  const nonSystemOlderMessages = olderMessages.filter((message) => message.role !== "system");
  const backgroundGoals = dedupeTake(
    olderMessages
      .filter((message) => message.role === "user")
      .slice(-3)
      .map((message) => truncateText(message.content, 88))
      .reverse(),
    3,
  );
  const decisions = collectDecisionHighlights(nonSystemOlderMessages);
  const progress = collectProgressHighlights(olderEvents);
  const importantFiles = collectImportantFiles(events, compactedUntilSeq);
  const importantAttachments = collectImportantAttachments(olderEvents).map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    path: attachment.path,
    kind: attachment.kind,
  }));
  const heuristicOpenLoops = collectOpenLoops(events);
  const heuristicNextActions = collectNextActions(events);
  const heuristicRisks = collectRisks(events);
  const heuristicErrors = collectErrors(olderEvents);
  const latestRunStarted = getLatestRunStarted(events);
  const heuristicCurrentTask = resolveCurrentTask(events);
  const heuristicCurrentState = resolveCurrentState(events);
  const heuristicSummary = buildSummaryText({
    backgroundGoals,
    progress,
    currentState: heuristicCurrentState,
    decisions,
    importantFiles,
    openLoops: heuristicOpenLoops,
    nextActions: heuristicNextActions,
    risks: heuristicRisks,
  });
  const modelDraft = await buildSnapshotDraftWithModel({
    sessionId,
    compactedEvents: olderEvents,
    importantFiles,
    openLoops: heuristicOpenLoops,
    nextActions: heuristicNextActions,
    risks: heuristicRisks,
    decisions,
    currentState: heuristicCurrentState,
    currentTask: heuristicCurrentTask,
  });
  const summary = modelDraft?.summary ?? heuristicSummary;
  const currentTask = modelDraft?.currentTask ?? heuristicCurrentTask;
  const currentState = modelDraft?.currentState ?? heuristicCurrentState;
  const openLoops = mergePriorityArray(
    modelDraft?.openLoops ?? [],
    heuristicOpenLoops,
    4,
  );
  const nextActions = mergePriorityArray(
    modelDraft?.nextActions ?? [],
    heuristicNextActions,
    3,
  );
  const risks = mergePriorityArray(
    modelDraft?.risks ?? [],
    heuristicRisks,
    3,
  );
  const mergedDecisions = mergePriorityArray(
    modelDraft?.decisions ?? [],
    decisions,
    4,
  );

  return {
    version: 1,
    sessionId,
    revision: currentSnapshot.revision + 1,
    updatedAt: new Date().toISOString(),
    compactedUntilSeq,
    summary,
    currentTask,
    currentState,
    decisions: mergedDecisions,
    importantFiles,
    importantAttachments,
    openLoops,
    nextActions,
    risks,
    errors: heuristicErrors,
    learnings: modelDraft?.learnings ?? [],
    workspace: {
      branchName: await resolveBranchName(),
      modelEntryId: getSessionMeta(sessionId)?.lastModelEntryId ?? null,
      thinkingLevel: latestRunStarted?.thinkingLevel ?? null,
    },
    sourceRunIds: dedupeTake(
      events
        .flatMap((event) => {
          if (!("runId" in event) || event.seq > compactedUntilSeq) {
            return [];
          }

          return [event.runId];
        }),
      MAX_IMPORTANT_ITEMS,
    ),
    sourceMessageIds: olderMessages
      .map((message) => message.id)
      .filter(Boolean)
      .slice(-MAX_IMPORTANT_ITEMS),
  };
}

async function applySnapshot(
  sessionId: string,
  reason: "manual" | "auto",
): Promise<ContextSummary> {
  const snapshot = await buildSnapshot(sessionId);
  if (!snapshot) {
    return buildContextSummaryFromUsage(sessionId);
  }

  const meta = getSessionMeta(sessionId);
  const thinkingLevel =
    getLatestRunStarted(loadTranscriptEvents(sessionId))?.thinkingLevel ??
    getSettings().thinkingLevel;
  const resolvedModel = resolveRuntimeModel(meta?.lastModelEntryId ?? getSettings().defaultModelId);
  const modelEntryId = resolvedModel.entry.id;

  await executeBackgroundRun({
    sessionId,
    runKind: "compact",
    modelEntryId,
    thinkingLevel,
    runIdPrefix: reason,
    metadata: {
      reason,
      snapshotRevision: snapshot.revision,
      compactedUntilSeq: snapshot.compactedUntilSeq,
    },
    execute: async (runScope) => {
      writePersistedSnapshot(snapshot);
      updateSessionMeta(sessionId, (meta) => {
        meta.autoCompactFailureCount = 0;
        delete meta.autoCompactBlockedAt;
      });
      appendCompactAppliedEvent({
        sessionId,
        runId: runScope.runId,
        snapshotRevision: snapshot.revision,
        compactedUntilSeq: snapshot.compactedUntilSeq,
        reason,
      });
    },
  });

  return buildContextSummaryFromUsage(sessionId);
}

function recordAutoCompactFailure(sessionId: string): void {
  updateSessionMeta(sessionId, (meta) => {
    const nextCount = (meta.autoCompactFailureCount ?? 0) + 1;
    meta.autoCompactFailureCount = nextCount;
    if (nextCount >= MAX_AUTO_COMPACT_FAILURES && !meta.autoCompactBlockedAt) {
      meta.autoCompactBlockedAt = new Date().toISOString();
    }
  });
}

function buildSnapshotPrompt(snapshot: SessionMemorySnapshot): string {
  if (snapshot.revision <= 0 || !snapshot.summary.trim()) {
    return "";
  }

  const sections = [
    "## Session Continuity Snapshot",
    "以下内容是系统为当前线程生成的续接摘要，用于重启续会话与 context compact。",
    snapshot.summary,
    snapshot.currentTask ? `当前任务：${snapshot.currentTask}` : "",
    snapshot.currentState ? `当前状态：${snapshot.currentState}` : "",
    snapshot.decisions.length > 0 ? `关键决策：${snapshot.decisions.join("；")}` : "",
    snapshot.openLoops.length > 0 ? `未闭环：${snapshot.openLoops.join("；")}` : "",
    snapshot.nextActions.length > 0 ? `下一步：${snapshot.nextActions.join("；")}` : "",
    snapshot.risks.length > 0 ? `风险：${snapshot.risks.join("；")}` : "",
    snapshot.errors.length > 0 ? `遇到的错误：${snapshot.errors.join("；")}` : "",
    snapshot.learnings.length > 0 ? `经验教训：${snapshot.learnings.join("；")}` : "",
  ].filter(Boolean);

  return sections.join("\n");
}

export async function getContextSummary(sessionId: string): Promise<ContextSummary> {
  return buildContextSummaryFromUsage(sessionId);
}

export async function compactSession(sessionId: string): Promise<ContextSummary> {
  const activeRun = harnessRuntime.getActiveRunBySession(sessionId);
  if (activeRun && !activeRun.cancelled) {
    throw new Error("当前线程仍在生成中，先停掉再 compact。");
  }

  compactingSessionIds.add(sessionId);
  try {
    return await applySnapshot(sessionId, "manual");
  } finally {
    compactingSessionIds.delete(sessionId);
  }
}

/**
 * 反应式 compact — API 返回 prompt-too-long 时调用。
 * 不阻塞活跃 run，允许在 run 内部触发。
 * 返回 true 表示 compact 成功，可以重试请求。
 */
export async function reactiveCompact(sessionId: string): Promise<boolean> {
  if (compactingSessionIds.has(sessionId)) return false;

  const meta = getSessionMeta(sessionId);
  if (meta?.autoCompactBlockedAt) return false;

  compactingSessionIds.add(sessionId);
  try {
    await applySnapshot(sessionId, "auto");
    return true;
  } catch {
    recordAutoCompactFailure(sessionId);
    return false;
  } finally {
    compactingSessionIds.delete(sessionId);
  }
}

export async function getSessionMemoryPromptSection(
  sessionId: string,
): Promise<string> {
  return buildSnapshotPrompt(getPersistedSnapshot(sessionId));
}

export async function ensureContextSnapshotCoverage(
  sessionId: string,
): Promise<ContextSummary> {
  const requiredCompactedUntilSeq = getRequiredCompactedUntilSeq(sessionId);
  const snapshot = getPersistedSnapshot(sessionId);
  const meta = getSessionMeta(sessionId);

  if (requiredCompactedUntilSeq <= snapshot.compactedUntilSeq) {
    return buildContextSummaryFromUsage(sessionId);
  }

  if (meta?.autoCompactBlockedAt) {
    return buildContextSummaryFromUsage(sessionId);
  }

  compactingSessionIds.add(sessionId);
  try {
    try {
      return await applySnapshot(sessionId, "auto");
    } catch {
      recordAutoCompactFailure(sessionId);
      return buildContextSummaryFromUsage(sessionId);
    }
  } finally {
    compactingSessionIds.delete(sessionId);
  }
}
