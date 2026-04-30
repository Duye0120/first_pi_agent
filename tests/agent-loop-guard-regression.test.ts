import assert from "node:assert/strict";
import {
  DEFAULT_MAX_AGENT_TOOL_CALL_TURNS,
  assertAgentToolLoopWithinLimit,
  countToolCallTurnsSinceLatestUser,
} from "../src/main/agent-loop-guard.ts";

function userMessage(text: string) {
  return {
    role: "user",
    content: [{ type: "text", text }],
    timestamp: Date.now(),
  };
}

function assistantToolCall(id: string) {
  return {
    role: "assistant",
    content: [
      {
        type: "toolCall",
        id,
        name: "memory_save",
        arguments: {
          summary: "用户偏好把长期约束写入 AGENTS.md",
          topic: "preferences",
        },
      },
    ],
    api: "openai",
    provider: "openai",
    model: "test-model",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "tool_calls",
    timestamp: Date.now(),
  };
}

function toolResult(id: string) {
  return {
    role: "toolResult",
    toolCallId: id,
    toolName: "memory_save",
    content: [{ type: "text", text: "已保存记忆。" }],
    details: {},
    isError: false,
    timestamp: Date.now(),
  };
}

{
  const messages = [
    userMessage("记住这个偏好"),
    assistantToolCall("call-1"),
    toolResult("call-1"),
    assistantToolCall("call-2"),
    toolResult("call-2"),
  ];

  assert.equal(countToolCallTurnsSinceLatestUser(messages as any), 2);
}

{
  const messages = [userMessage("处理记忆")];
  for (let index = 0; index < DEFAULT_MAX_AGENT_TOOL_CALL_TURNS; index += 1) {
    const id = `call-${index}`;
    messages.push(assistantToolCall(id) as any);
    messages.push(toolResult(id) as any);
  }

  assert.throws(
    () => assertAgentToolLoopWithinLimit(messages as any),
    /工具调用已达到 12 轮/,
  );
}

console.log("agent loop guard regression tests passed");
