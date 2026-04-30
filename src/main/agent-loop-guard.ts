import type { AgentMessage } from "@mariozechner/pi-agent-core";

export const DEFAULT_MAX_AGENT_TOOL_CALL_TURNS = 12;

export class AgentToolLoopLimitError extends Error {
  constructor(maxTurns: number) {
    super(
      `工具调用已达到 ${maxTurns} 轮，Chela 已停止本轮执行。请缩小任务、关闭不必要的自动记忆，或手动说明下一步。`,
    );
    this.name = "AgentToolLoopLimitError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUserMessage(message: AgentMessage): boolean {
  return isRecord(message) && message.role === "user";
}

function isAssistantToolCallTurn(message: AgentMessage): boolean {
  if (!isRecord(message) || message.role !== "assistant") {
    return false;
  }

  const content = message.content;
  if (!Array.isArray(content)) {
    return false;
  }

  return content.some((part) => isRecord(part) && part.type === "toolCall");
}

export function countToolCallTurnsSinceLatestUser(
  messages: ReadonlyArray<AgentMessage>,
): number {
  let latestUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (isUserMessage(messages[index])) {
      latestUserIndex = index;
      break;
    }
  }

  let count = 0;
  for (let index = latestUserIndex + 1; index < messages.length; index += 1) {
    if (isAssistantToolCallTurn(messages[index])) {
      count += 1;
    }
  }
  return count;
}

export function assertAgentToolLoopWithinLimit(
  messages: ReadonlyArray<AgentMessage>,
  maxTurns = DEFAULT_MAX_AGENT_TOOL_CALL_TURNS,
): void {
  if (countToolCallTurnsSinceLatestUser(messages) >= maxTurns) {
    throw new AgentToolLoopLimitError(maxTurns);
  }
}

export function createToolLoopGuardedTransform(
  transformContext: (
    messages: AgentMessage[],
    signal?: AbortSignal,
  ) => Promise<AgentMessage[]>,
  maxTurns = DEFAULT_MAX_AGENT_TOOL_CALL_TURNS,
) {
  return async (messages: AgentMessage[], signal?: AbortSignal) => {
    assertAgentToolLoopWithinLimit(messages, maxTurns);
    return transformContext(messages, signal);
  };
}
