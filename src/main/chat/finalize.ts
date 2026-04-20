import { completeRun, destroyAgent } from "../agent.js";
import { PRIMARY_AGENT_OWNER } from "../agent-owners.js";
import { getGitDiffSnapshot } from "../git.js";
import { HarnessRunCancelledError } from "../harness/runtime.js";
import { harnessRuntime } from "../harness/singleton.js";
import { appLogger } from "../logger.js";
import {
  appendAssistantMessageEvent,
  appendRunFinishedEvent,
  getSessionMeta,
  loadTranscriptEvents,
  renamePersistedSession,
} from "../session/service.js";
import { indexSessionSearchDocument } from "../session/search.js";
import { bus } from "../event-bus.js";
import { WorkerService } from "../worker-service.js";
import { buildRunChangeSummary } from "./run-change-summary.js";
import type { ChatRunContext } from "./types.js";

async function maybeAutoRenameSessionTitle(
  sessionId: string,
  assistantText: string,
): Promise<void> {
  const meta = getSessionMeta(sessionId);
  if (!meta || meta.titleManuallySet) {
    return;
  }

  const events = loadTranscriptEvents(sessionId);
  const assistantMessages = events.filter(
    (event) => event.type === "assistant_message",
  );
  if (assistantMessages.length !== 1) {
    return;
  }

  const firstUserMessage = events.find((event) => event.type === "user_message");
  const userText =
    firstUserMessage?.type === "user_message"
      ? firstUserMessage.message.content.trim()
      : "";
  const normalizedAssistantText = assistantText.trim();
  if (!userText || !normalizedAssistantText) {
    return;
  }

  try {
    const title = await WorkerService.generateSessionTitle({
      userText,
      assistantText: normalizedAssistantText,
    });
    if (!title || title === meta.title) {
      return;
    }

    renamePersistedSession(sessionId, title, { manual: false });
  } catch (error) {
    appLogger.warn({
      scope: "chat.send",
      message: "自动标题生成失败",
      data: {
        sessionId,
      },
      error,
    });
  }
}

async function resolveRunChangeSummary(context: ChatRunContext) {
  try {
    const afterDiffOverview = await getGitDiffSnapshot(context.settings.workspace);
    return buildRunChangeSummary(context.beforeDiffOverview, afterDiffOverview);
  } catch (error) {
    appLogger.warn({
      scope: "chat.send",
      message: "生成本轮 diff 摘要失败",
      data: {
        sessionId: context.input.sessionId,
        runId: context.input.runId,
      },
      error,
    });
    return null;
  }
}

export async function finalizeCompletedChatRun(
  context: ChatRunContext,
): Promise<void> {
  const runChangeSummary = await resolveRunChangeSummary(context);
  const assistantMessage = context.adapter.buildAssistantMessage(
    "completed",
    undefined,
    runChangeSummary,
  );
  if (assistantMessage) {
    appendAssistantMessageEvent({
      sessionId: context.input.sessionId,
      runId: context.input.runId,
      message: assistantMessage,
    });
    bus.emit("message:assistant", {
      sessionId: context.input.sessionId,
      runId: context.input.runId,
    });
  }
  appendRunFinishedEvent({
    sessionId: context.input.sessionId,
    runId: context.input.runId,
    ownerId: PRIMARY_AGENT_OWNER,
    finalState: "completed",
    metadata: {
      requestedModelEntryId: context.requestedModelEntryId,
        resolvedModelEntryId: context.handle?.modelEntryId ?? context.resolvedModel.entry.id,
        prepareFailedEntries: context.failover.prepare.failedEntries,
        executeAttemptedEntryIds: context.failover.execute.attemptedEntryIds,
        ...(runChangeSummary ? { runChangeSummary } : {}),
      },
    });
  harnessRuntime.finishRun(context.runScope, "completed");
  indexSessionSearchDocument(context.input.sessionId);
  if (assistantMessage?.content) {
    await maybeAutoRenameSessionTitle(
      context.input.sessionId,
      assistantMessage.content,
    );
    indexSessionSearchDocument(context.input.sessionId);
  }
  appLogger.info({
    scope: "chat.send",
    message: "消息发送完成",
    data: {
      sessionId: context.input.sessionId,
      runId: context.input.runId,
    },
  });
  context.adapter.queueTerminalEnd(runChangeSummary);
  context.adapter.flushTerminalEvent({
    type: "agent_end",
    runChangeSummary,
  });
}

export async function finalizeFailedChatRun(
  context: ChatRunContext,
  err: unknown,
): Promise<void> {
  const runChangeSummary = await resolveRunChangeSummary(context);

  if (
    err instanceof HarnessRunCancelledError ||
    harnessRuntime.isCancelRequested(context.runScope)
  ) {
    const cancelledMessage = context.adapter.buildAssistantMessage(
      "cancelled",
      undefined,
      runChangeSummary,
    );
    if (cancelledMessage && context.transcriptStarted) {
      appendAssistantMessageEvent({
        sessionId: context.input.sessionId,
        runId: context.input.runId,
        message: cancelledMessage,
      });
    }
    if (context.transcriptStarted) {
      appendRunFinishedEvent({
        sessionId: context.input.sessionId,
        runId: context.input.runId,
        ownerId: PRIMARY_AGENT_OWNER,
        finalState: "aborted",
        reason: "用户取消了当前 run。",
        metadata: {
          requestedModelEntryId: context.requestedModelEntryId,
          resolvedModelEntryId:
            context.handle?.modelEntryId ?? context.resolvedModel.entry.id,
          executeAttemptedEntryIds: context.failover.execute.attemptedEntryIds,
          ...(runChangeSummary ? { runChangeSummary } : {}),
        },
      });
    }
    if (context.createdHandle && context.handle) {
      await destroyAgent(context.handle);
    }
    if (context.runCreated) {
      harnessRuntime.finishRun(context.runScope, "aborted", {
        reason: "用户取消了当前 run。",
      });
    }
    appLogger.warn({
      scope: "chat.send",
      message: "消息发送被取消",
      data: {
        sessionId: context.input.sessionId,
        runId: context.input.runId,
      },
    });
    context.adapter.queueTerminalEnd(runChangeSummary);
    context.adapter.flushTerminalEvent({
      type: "agent_end",
      runChangeSummary,
    });
    return;
  }

  const errorMessage =
    err instanceof Error ? err.message : "Agent 执行失败";
  const failedMessage = context.adapter.buildAssistantMessage(
    "error",
    errorMessage,
    runChangeSummary,
  );
  if (failedMessage && context.transcriptStarted) {
    appendAssistantMessageEvent({
      sessionId: context.input.sessionId,
      runId: context.input.runId,
      message: failedMessage,
    });
  }
  if (context.transcriptStarted) {
    appendRunFinishedEvent({
      sessionId: context.input.sessionId,
      runId: context.input.runId,
      ownerId: PRIMARY_AGENT_OWNER,
      finalState: "failed",
      reason: errorMessage,
      metadata: {
        requestedModelEntryId: context.requestedModelEntryId,
        resolvedModelEntryId:
          context.handle?.modelEntryId ?? context.resolvedModel.entry.id,
        prepareFailedEntries: context.failover.prepare.failedEntries,
        executeAttemptedEntryIds: context.failover.execute.attemptedEntryIds,
        lastExecuteFailoverError: context.failover.execute.lastError,
        ...(runChangeSummary ? { runChangeSummary } : {}),
      },
    });
  }
  if (context.runCreated) {
    harnessRuntime.finishRun(context.runScope, "failed", {
      reason: errorMessage,
    });
  }
  appLogger.error({
    scope: "chat.send",
    message: "消息发送失败",
    data: {
      sessionId: context.input.sessionId,
      runId: context.input.runId,
      createdHandle: context.createdHandle,
      runCreated: context.runCreated,
      transcriptStarted: context.transcriptStarted,
    },
    error: err,
  });
  context.adapter.queueTerminalError(errorMessage);
  context.adapter.flushTerminalEvent({
    type: "agent_error",
    message: errorMessage,
  });
}

export function completeChatRun(context: ChatRunContext): void {
  if (context.handle) {
    completeRun(context.handle, context.input.runId);
  }
}
