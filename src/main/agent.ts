import { Agent } from "@mariozechner/pi-agent-core";
import type { AgentEvent as CoreAgentEvent } from "@mariozechner/pi-agent-core";
import type { ElectronAdapter } from "./adapter.js";
import { getSettings } from "./settings.js";
import { resolveModelEntry } from "./providers.js";
import { getBuiltinTools } from "./tools/index.js";
import { buildSoulPromptSection } from "./soul.js";
import { loadMcpConfig, getActiveServers } from "../mcp/config.js";
import { connectMcpServer, getConnections, disconnectAllMcpServers } from "../mcp/client.js";
import { getAllMcpTools } from "../mcp/adapter.js";
import {
  buildUserPromptMessage,
  normalizePersistedSessionMessages,
} from "./chat-message-adapter.js";
import type { ChatMessage, SelectedFile } from "../shared/contracts.js";

export interface AgentHandle {
  agent: Agent;
  unsubscribe: () => void;
  sessionId: string;
  modelEntryId: string;
  runtimeSignature: string;
  thinkingLevel: string;
}

let currentHandle: AgentHandle | null = null;
let initGeneration = 0;

/**
 * Create and initialize an Agent instance for a session.
 */
export async function initAgent(
  sessionId: string,
  adapter: ElectronAdapter,
  existingMessages?: ChatMessage[],
): Promise<AgentHandle> {
  const generation = ++initGeneration;

  // Destroy previous agent if exists
  if (currentHandle) {
    await destroyAgent(currentHandle);
  }

  const settings = getSettings();
  adapter.setSessionId(sessionId);

  let resolved;
  try {
    resolved = resolveModelEntry(settings.defaultModelId);
  } catch {
    resolved = resolveModelEntry("builtin:anthropic:claude-sonnet-4-20250514");
  }

  const normalizedMessages = await normalizePersistedSessionMessages(
    existingMessages ?? [],
    resolved.model,
  );

  // Load MCP tools
  const builtinTools = getBuiltinTools(adapter.workspacePath);
  let mcpTools: any[] = [];
  try {
    const mcpConfig = loadMcpConfig(adapter.workspacePath);
    const servers = getActiveServers(mcpConfig);
    for (const [name, cfg] of servers) {
      try {
        await connectMcpServer(name, cfg);
      } catch { /* skip failing servers */ }
    }
    mcpTools = await getAllMcpTools(getConnections());
  } catch { /* MCP init failure is non-fatal */ }

  const agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt(adapter.workspacePath),
      model: resolved.model,
      thinkingLevel: settings.thinkingLevel,
      tools: [...builtinTools, ...mcpTools],
      messages: normalizedMessages,
    },
    getApiKey: () => resolved.apiKey,
    sessionId,
  });

  const unsubscribe = agent.subscribe((event: CoreAgentEvent) => {
    adapter.handleCoreEvent(event);
  });

  const handle: AgentHandle = {
    agent,
    unsubscribe,
    sessionId,
    modelEntryId: resolved.entry.id,
    runtimeSignature: resolved.runtimeSignature,
    thinkingLevel: settings.thinkingLevel,
  };

  if (generation !== initGeneration) {
    unsubscribe();
    agent.abort();
    await disconnectAllMcpServers();
    throw new Error("Agent initialization superseded.");
  }

  currentHandle = handle;
  return handle;
}

/**
 * Send a user message to the agent and start the ReAct loop.
 */
export async function promptAgent(
  handle: AgentHandle,
  text: string,
  attachments: SelectedFile[],
): Promise<void> {
  await handle.agent.prompt(
    await buildUserPromptMessage(
      text,
      attachments,
      handle.agent.state.model.input.includes("image"),
    ),
  );
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
export async function destroyAgent(handle: AgentHandle): Promise<void> {
  handle.unsubscribe();
  handle.agent.abort();
  if (currentHandle === handle) {
    currentHandle = null;
  }
  await disconnectAllMcpServers();
}

/**
 * Get the current agent handle (if any).
 */
export function getCurrentHandle(): AgentHandle | null {
  return currentHandle;
}

function buildSystemPrompt(workspacePath: string): string {
  const base = [
    "你是 Pi，一个运行在用户桌面上的 AI 助手。",
    "你可以帮助用户完成各种软件开发和日常任务。",
    "请用中文回复。",
    "",
    "你拥有以下工具能力：",
    "- get_time: 获取当前时间",
    "- file_read: 读取本地文件内容（指定行范围）",
    "- file_write: 创建或写入本地文件（覆盖/追加）",
    "- shell_exec: 执行 shell 命令（有安全限制）",
    "- web_fetch: 获取网页内容并转换为纯文本",
    "",
    "使用工具时，路径相对于用户的 workspace 目录。",
    "shell_exec 会使用当前配置的 shell；Windows 下通常是 PowerShell。请按对应 shell 的语法写命令，不要默认使用 bash 专属语法。",
    "执行命令前请确认命令的安全性。",
  ].join("\n");

  const soul = buildSoulPromptSection(workspacePath);
  return soul ? base + soul : base;
}
