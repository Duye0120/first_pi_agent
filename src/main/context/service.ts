import { randomUUID } from "node:crypto";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type {
  ChatMessage,
  ContextSummary,
  SelectedFile,
  SessionMemorySnapshot,
  SessionTranscriptEvent,
} from "../../shared/contracts.js";
import { getGitDiffSnapshot } from "../git.js";
import { harnessRuntime } from "../harness/singleton.js";
import { getEntry } from "../providers.js";
import {
  appendCompactAppliedEvent,
  appendRunFinishedEvent,
  appendRunStartedEvent,
  getPersistedSnapshot,
  getSessionMeta,
  loadTranscriptEvents,
  writePersistedSnapshot,
} from "../session/service.js";
import { getSettings } from "../settings.js";

const CONTEXT_BUDGET_RATIO = 0.7;
const PROTECTED_USER_TURNS = 6;
const PROTECTED_MESSAGE_COUNT = PROTECTED_USER_TURNS * 2;
const SUMMARY_LINE_LIMIT = 6;
const MAX_IMPORTANT_ITEMS = 8;
const compactingSessionIds = new Set<string>();

type MessageTranscriptEvent = Extract<
  SessionTranscriptEvent,
  { type: "user_message" | "assistant_message" }
>;

type PersistedAttachment = Pick<
  SelectedFile,
  "id" | "name" | "path" | "kind"
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

function collectHighlights(
  messages: ChatMessage[],
  keywords: RegExp,
  limit: number,
): string[] {
  const matches = messages.flatMap((message) => {
    const snippets = message.content
      .split(/\r?\n+/)
      .map((line) => truncateText(line, 100))
      .filter(Boolean);

    return snippets.filter((line) => keywords.test(line));
  });

  if (matches.length > 0) {
    return dedupeTake(matches.reverse(), limit);
  }

  return dedupeTake(
    messages
      .slice(-limit)
      .map((message) => truncateText(message.content, 100))
      .filter(Boolean)
      .reverse(),
    limit,
  );
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
  const meta = getSessionMeta(events[0]?.sessionId ?? "");
  if (meta?.lastRunState) {
    return meta.lastRunState;
  }

  const latestFinished = getLatestRunFinished(events);
  return latestFinished?.finalState ?? null;
}

function collectOpenLoops(events: SessionTranscriptEvent[]): string[] {
  const loops: string[] = [];
  const latestFinished = getLatestRunFinished(events);
  if (latestFinished?.finalState === "failed") {
    loops.push(
      latestFinished.reason
        ? `上次运行失败：${truncateText(latestFinished.reason, 80)}`
        : "上次运行失败，原因待排查。",
    );
  }

  const latestRequested = [...events].reverse().find(
    (
      event,
    ): event is Extract<SessionTranscriptEvent, { type: "confirmation_requested" }> =>
      event.type === "confirmation_requested",
  );
  if (latestRequested) {
    const resolved = [...events].reverse().find(
      (
        event,
      ): event is Extract<SessionTranscriptEvent, { type: "confirmation_resolved" }> =>
        event.type === "confirmation_resolved" &&
        event.requestId === latestRequested.requestId,
    );

    if (!resolved) {
      loops.push(`仍有待确认操作：${truncateText(latestRequested.description, 80)}`);
    }
  }

  const latestUser = [...events].reverse().find(
    (
      event,
    ): event is Extract<SessionTranscriptEvent, { type: "user_message" }> =>
      event.type === "user_message",
  );
  const latestAssistant = [...events].reverse().find(
    (
      event,
    ): event is Extract<SessionTranscriptEvent, { type: "assistant_message" }> =>
      event.type === "assistant_message",
  );
  if (
    latestUser &&
    (!latestAssistant ||
      Date.parse(latestUser.timestamp) > Date.parse(latestAssistant.timestamp))
  ) {
    loops.push(`最近一条用户请求仍待收口：${truncateText(latestUser.message.content, 80)}`);
  }

  return dedupeTake(loops, 4);
}

function collectNextActions(events: SessionTranscriptEvent[]): string[] {
  const latestUser = [...events].reverse().find(
    (
      event,
    ): event is Extract<SessionTranscriptEvent, { type: "user_message" }> =>
      event.type === "user_message",
  );
  const latestAssistant = [...events].reverse().find(
    (
      event,
    ): event is Extract<SessionTranscriptEvent, { type: "assistant_message" }> =>
      event.type === "assistant_message",
  );
  const actions: string[] = [];

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

function buildSummaryText(input: {
  olderMessages: ChatMessage[];
  decisions: string[];
  importantFiles: string[];
  openLoops: string[];
  nextActions: string[];
  risks: string[];
}): string {
  const userHighlights = dedupeTake(
    input.olderMessages
      .filter((message) => message.role === "user")
      .slice(-3)
      .map((message) => truncateText(message.content, 88))
      .reverse(),
    3,
  );
  const assistantHighlights = dedupeTake(
    input.olderMessages
      .filter((message) => message.role === "assistant")
      .slice(-3)
      .map((message) => truncateText(message.content, 88))
      .reverse(),
    3,
  );

  const lines = [
    userHighlights.length > 0 ? `历史诉求：${userHighlights.join("；")}` : "",
    assistantHighlights.length > 0 ? `已完成进展：${assistantHighlights.join("；")}` : "",
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

function getLatestUsage(events: SessionTranscriptEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (
      event?.type === "assistant_message" &&
      typeof event.message.usage?.inputTokens === "number" &&
      typeof event.message.usage?.outputTokens === "number"
    ) {
      return event.message.usage;
    }
  }

  return null;
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
  const usage = getLatestUsage(loadTranscriptEvents(sessionId));
  const contextWindow = resolveContextWindow(sessionId);
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
    canCompact: requiredCompactedUntilSeq > snapshot.compactedUntilSeq,
    isCompacting: compactingSessionIds.has(sessionId),
  };
}

function getRequiredCompactedUntilSeq(sessionId: string): number {
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
  const decisionKeywords = /(决定|改成|采用|切到|保留|不做|默认|约束|方案|compact|snapshot)/i;
  const decisions = collectHighlights(
    olderMessages.filter((message) => message.role !== "system"),
    decisionKeywords,
    4,
  );
  const importantFiles = collectImportantFiles(events, compactedUntilSeq);
  const importantAttachments = collectImportantAttachments(olderEvents).map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    path: attachment.path,
    kind: attachment.kind,
  }));
  const openLoops = collectOpenLoops(events);
  const nextActions = collectNextActions(events);
  const risks = collectRisks(events);
  const latestRunStarted = getLatestRunStarted(events);
  const latestUser = [...messageEvents].reverse().find((event) => event.type === "user_message");
  const summary = buildSummaryText({
    olderMessages,
    decisions,
    importantFiles,
    openLoops,
    nextActions,
    risks,
  });

  return {
    version: 1,
    sessionId,
    revision: currentSnapshot.revision + 1,
    updatedAt: new Date().toISOString(),
    compactedUntilSeq,
    summary,
    currentTask: latestUser ? truncateText(latestUser.message.content, 120) : null,
    currentState: resolveCurrentState(events),
    decisions,
    importantFiles,
    importantAttachments,
    openLoops,
    nextActions,
    risks,
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
  const runId = `${reason}-${randomUUID()}`;
  const thinkingLevel =
    getLatestRunStarted(loadTranscriptEvents(sessionId))?.thinkingLevel ??
    getSettings().thinkingLevel;
  const modelEntryId = getSettings().defaultModelId ?? meta?.lastModelEntryId ?? "";

  appendRunStartedEvent({
    sessionId,
    runId,
    runKind: "compact",
    modelEntryId,
    thinkingLevel,
  });

  try {
    writePersistedSnapshot(snapshot);
    appendCompactAppliedEvent({
      sessionId,
      runId,
      snapshotRevision: snapshot.revision,
      compactedUntilSeq: snapshot.compactedUntilSeq,
      reason,
    });
    appendRunFinishedEvent({
      sessionId,
      runId,
      finalState: "completed",
    });
  } catch (error) {
    appendRunFinishedEvent({
      sessionId,
      runId,
      finalState: "failed",
      reason: error instanceof Error ? error.message : "compact 失败",
    });
    throw error;
  }

  return buildContextSummaryFromUsage(sessionId);
}

function getAgentMessageRole(message: AgentMessage): string | null {
  if (!message || typeof message !== "object" || !("role" in message)) {
    return null;
  }

  const role = (message as { role?: unknown }).role;
  return typeof role === "string" ? role : null;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((part) => {
      if (!part || typeof part !== "object") {
        return [];
      }

      const textPart = part as {
        type?: unknown;
        text?: unknown;
        thinking?: unknown;
      };

      if (textPart.type === "text" && typeof textPart.text === "string") {
        return [textPart.text];
      }

      if (textPart.type === "thinking" && typeof textPart.thinking === "string") {
        return [textPart.thinking];
      }

      return [];
    })
    .join("\n");
}

function estimateMessageTokens(message: AgentMessage): number {
  if (!message || typeof message !== "object") {
    return 0;
  }

  const role = getAgentMessageRole(message);
  const content = extractTextFromContent((message as { content?: unknown }).content);
  const base = role === "user" || role === "assistant" ? 18 : 8;
  return base + Math.ceil(content.length * 0.8);
}

function estimateMessagesTokens(messages: AgentMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
}

function findProtectedTailIndex(messages: AgentMessage[]): number {
  let userTurns = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (getAgentMessageRole(messages[index]) !== "user") {
      continue;
    }

    userTurns += 1;
    if (userTurns >= PROTECTED_USER_TURNS) {
      return index;
    }
  }

  return 0;
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

export async function getSessionMemoryPromptSection(
  sessionId: string,
): Promise<string> {
  return buildSnapshotPrompt(getPersistedSnapshot(sessionId));
}

export function createTransformContext(
  sessionId: string,
  contextWindow: number | null,
): (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]> {
  return async (messages, signal) => {
    if (signal?.aborted || messages.length === 0) {
      return messages;
    }

    const budget =
      typeof contextWindow === "number" && contextWindow > 0
        ? Math.floor(contextWindow * CONTEXT_BUDGET_RATIO)
        : null;
    if (!budget) {
      return messages;
    }

    const estimatedTotal = estimateMessagesTokens(messages);
    if (estimatedTotal <= budget) {
      return messages;
    }

    const protectedTailIndex = findProtectedTailIndex(messages);
    if (protectedTailIndex <= 0) {
      return messages;
    }

    const requiredCompactedUntilSeq = getRequiredCompactedUntilSeq(sessionId);
    const snapshot = getPersistedSnapshot(sessionId);
    if (requiredCompactedUntilSeq > snapshot.compactedUntilSeq) {
      compactingSessionIds.add(sessionId);
      try {
        await applySnapshot(sessionId, "auto");
      } finally {
        compactingSessionIds.delete(sessionId);
      }
    }

    return messages.slice(protectedTailIndex);
  };
}
