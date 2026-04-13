import { bindHandleToRun, getHandle, initAgent } from "../agent.js";
import { ElectronAdapter } from "../adapter.js";
import { PRIMARY_AGENT_OWNER } from "../agent-owners.js";
import { harnessRuntime } from "../harness/singleton.js";
import { appLogger } from "../logger.js";
import { resolveRuntimeModel } from "../model-resolution.js";
import { getSettings } from "../settings.js";
import {
  appendRunStartedEvent,
  appendUserMessageEvent,
} from "../session/service.js";
import { loadSession } from "../session/facade.js";
import { requireMainWindow } from "../window.js";
import { bus } from "../event-bus.js";
import type { ChatRunContext } from "./types.js";
import type { SendMessageInput } from "../../shared/contracts.js";

export function createChatRunContext(input: SendMessageInput): ChatRunContext {
  const settings = getSettings();
  const existingSession = loadSession(input.sessionId);
  if (!existingSession) {
    throw new Error("会话不存在，无法继续发送。");
  }

  const resolvedModel = resolveRuntimeModel(settings.defaultModelId);
  const runScope = {
    sessionId: input.sessionId,
    runId: input.runId,
  };
  const adapter = new ElectronAdapter(requireMainWindow(), {
    sessionId: input.sessionId,
    runId: input.runId,
  });

  return {
    input,
    runScope,
    settings,
    existingSession,
    resolvedModel,
    adapter,
    createdHandle: false,
    handle: null,
    runCreated: false,
    transcriptStarted: false,
  };
}

export async function prepareChatRun(context: ChatRunContext): Promise<void> {
  const { input, runScope, resolvedModel, settings } = context;

  appLogger.info({
    scope: "chat.send",
    message: "开始发送消息",
    data: {
      sessionId: input.sessionId,
      runId: input.runId,
      textLength: input.text.length,
      attachmentCount: input.attachments.length,
      modelEntryId: resolvedModel.entry.id,
    },
  });

  harnessRuntime.createRun({
    ...runScope,
    ownerId: PRIMARY_AGENT_OWNER,
    modelEntryId: resolvedModel.entry.id,
    runKind: "chat",
    runSource: "user",
    lane: "foreground",
  });
  context.runCreated = true;

  appendUserMessageEvent({
    sessionId: input.sessionId,
    text: input.text,
    attachments: input.attachments,
    modelEntryId: resolvedModel.entry.id,
    thinkingLevel: settings.thinkingLevel,
  });
  bus.emit("message:user", {
    sessionId: input.sessionId,
    text: input.text,
  });
  appendRunStartedEvent({
    sessionId: input.sessionId,
    runId: input.runId,
    ownerId: PRIMARY_AGENT_OWNER,
    runKind: "chat",
    modelEntryId: resolvedModel.entry.id,
    thinkingLevel: settings.thinkingLevel,
  });
  context.transcriptStarted = true;

  harnessRuntime.assertRunActive(runScope);

  let handle = getHandle(input.sessionId);
  if (
    !handle ||
    handle.modelEntryId !== resolvedModel.entry.id ||
    handle.runtimeSignature !== resolvedModel.runtimeSignature ||
    handle.thinkingLevel !== settings.thinkingLevel
  ) {
    harnessRuntime.assertRunActive(runScope);
    handle = await initAgent(
      input.sessionId,
      context.adapter,
      resolvedModel,
      PRIMARY_AGENT_OWNER,
      context.existingSession.messages,
    );
    context.createdHandle = true;
  }

  context.handle = handle;
  bindHandleToRun(handle, context.adapter, input.runId);
  harnessRuntime.attachHandle(runScope, handle);
  harnessRuntime.assertRunActive(runScope);
}
