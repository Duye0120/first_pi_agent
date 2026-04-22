import { randomUUID } from "node:crypto";
import type {
  EnqueueQueuedMessageInput,
  RemoveQueuedMessageInput,
  SendMessageInput,
  TriggerQueuedMessageInput,
} from "../../shared/contracts.js";
import {
  enqueueSessionQueuedMessage,
  moveSessionQueuedMessageToFront,
  removeSessionQueuedMessage,
} from "../session/facade.js";
import { cancelChatRun } from "./cancel.js";
import { executeChatRun } from "./execute.js";
import {
  completeChatRun,
  finalizeCompletedChatRun,
  finalizeFailedChatRun,
} from "./finalize.js";
import { createChatRunContext, prepareChatRun } from "./prepare.js";

export async function sendChatMessage(input: SendMessageInput): Promise<void> {
  const context = createChatRunContext(input);

  try {
    await prepareChatRun(context);
    await executeChatRun(context);
    await finalizeCompletedChatRun(context);
  } catch (err) {
    await finalizeFailedChatRun(context, err);
  } finally {
    completeChatRun(context);
  }
}

export async function enqueueQueuedMessage(
  input: EnqueueQueuedMessageInput,
): Promise<import("../../shared/contracts.js").QueuedMessage> {
  const nextText = input.text.trim();
  if (!nextText) {
    throw new Error("排队消息不能为空。");
  }

  return enqueueSessionQueuedMessage(input.sessionId, nextText);
}

export async function triggerQueuedMessage(
  input: TriggerQueuedMessageInput,
): Promise<void> {
  moveSessionQueuedMessageToFront(
    input.sessionId,
    input.messageId,
  );
}

export async function removeQueuedMessage(
  input: RemoveQueuedMessageInput,
): Promise<void> {
  removeSessionQueuedMessage(input.sessionId, input.messageId);
}

export { cancelChatRun };
