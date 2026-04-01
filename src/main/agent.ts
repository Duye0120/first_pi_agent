import { Agent } from "@mariozechner/pi-agent-core";
import type { AgentEvent as CoreAgentEvent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import type { ElectronAdapter } from "./adapter.js";
import { getSettings } from "./settings.js";
import { getApiKey } from "./credentials.js";
import { getTimeTool } from "../tools/getTime.js";

export interface AgentHandle {
  agent: Agent;
  unsubscribe: () => void;
  sessionId: string;
}

let currentHandle: AgentHandle | null = null;

/**
 * Create and initialize an Agent instance for a session.
 */
export function initAgent(
  sessionId: string,
  adapter: ElectronAdapter,
  existingMessages?: any[],
): AgentHandle {
  // Destroy previous agent if exists
  if (currentHandle) {
    destroyAgent(currentHandle);
  }

  const settings = getSettings();
  adapter.setSessionId(sessionId);

  let model;
  try {
    model = getModel(
      settings.defaultModel.provider as any,
      settings.defaultModel.model as any,
    );
  } catch {
    // Fallback to a known model if configured model is invalid
    model = getModel("anthropic" as any, "claude-sonnet-4-20250514" as any);
  }

  const agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt(),
      model,
      thinkingLevel: settings.thinkingLevel,
      tools: [getTimeTool],
      messages: existingMessages ?? [],
    },
    getApiKey: (provider: string) => {
      return getApiKey(provider);
    },
  });

  const unsubscribe = agent.subscribe((event: CoreAgentEvent) => {
    adapter.handleCoreEvent(event);
  });

  const handle: AgentHandle = { agent, unsubscribe, sessionId };
  currentHandle = handle;
  return handle;
}

/**
 * Send a user message to the agent and start the ReAct loop.
 */
export async function promptAgent(
  handle: AgentHandle,
  text: string,
): Promise<void> {
  await handle.agent.prompt({
    role: "user",
    content: text,
    timestamp: Date.now(),
  });
}

/**
 * Cancel the current agent execution.
 */
export function cancelAgent(handle: AgentHandle): void {
  handle.agent.abort();
}

/**
 * Destroy an agent handle and clean up resources.
 */
export function destroyAgent(handle: AgentHandle): void {
  handle.unsubscribe();
  handle.agent.abort();
  if (currentHandle === handle) {
    currentHandle = null;
  }
}

/**
 * Get the current agent handle (if any).
 */
export function getCurrentHandle(): AgentHandle | null {
  return currentHandle;
}

function buildSystemPrompt(): string {
  // Phase 1: basic system prompt. Phase 5 will integrate Soul files.
  return [
    "你是 Pi，一个运行在用户桌面上的 AI 助手。",
    "你可以帮助用户完成各种软件开发和日常任务。",
    "请用中文回复。",
    "",
    "你拥有以下工具能力：",
    "- get_time: 获取当前时间",
  ].join("\n");
}
