import { Agent } from "@mariozechner/pi-agent-core";
import type { AgentEvent as CoreAgentEvent } from "@mariozechner/pi-agent-core";
import type { ElectronAdapter } from "./adapter.js";
import { getSettings } from "./settings.js";
import { resolveModelEntry } from "./providers.js";
import { getBuiltinTools } from "./tools/index.js";
import { buildSoulPromptSection } from "./soul.js";
import { loadMcpConfig, getActiveServers } from "../mcp/config.js";
import { McpConnectionManager } from "../mcp/client.js";
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
  mcpManager: McpConnectionManager;
  activeRunId: string | null;
}

const handlesBySession = new Map<string, AgentHandle>();
const initGenerations = new Map<string, number>();

function subscribeToAgent(
  agent: Agent,
  adapter: ElectronAdapter,
): () => void {
  return agent.subscribe((event: CoreAgentEvent) => {
    adapter.handleCoreEvent(event);
  });
}

/**
 * Create and initialize an Agent instance for a session.
 */
export async function initAgent(
  sessionId: string,
  adapter: ElectronAdapter,
  existingMessages?: ChatMessage[],
): Promise<AgentHandle> {
  const generation = (initGenerations.get(sessionId) ?? 0) + 1;
  initGenerations.set(sessionId, generation);

  const existingHandle = handlesBySession.get(sessionId);
  if (existingHandle) {
    await destroyAgent(existingHandle);
  }

  const settings = getSettings();

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
  const mcpManager = new McpConnectionManager();
  let mcpTools: any[] = [];
  try {
    const mcpConfig = loadMcpConfig(adapter.workspacePath);
    const servers = getActiveServers(mcpConfig);
    for (const [name, cfg] of servers) {
      try {
        await mcpManager.connectServer(name, cfg);
      } catch {
        /* skip failing servers */
      }
    }
    mcpTools = await getAllMcpTools(mcpManager.getConnections());
  } catch {
    /* MCP init failure is non-fatal */
  }

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

  const unsubscribe = subscribeToAgent(agent, adapter);

  const handle: AgentHandle = {
    agent,
    unsubscribe,
    sessionId,
    modelEntryId: resolved.entry.id,
    runtimeSignature: resolved.runtimeSignature,
    thinkingLevel: settings.thinkingLevel,
    mcpManager,
    activeRunId: null,
  };

  if (initGenerations.get(sessionId) !== generation) {
    unsubscribe();
    agent.abort();
    await mcpManager.disconnectAll();
    throw new Error("Agent initialization superseded.");
  }

  handlesBySession.set(sessionId, handle);
  return handle;
}

export function bindHandleToRun(
  handle: AgentHandle,
  adapter: ElectronAdapter,
  runId: string,
): void {
  handle.unsubscribe();
  handle.unsubscribe = subscribeToAgent(handle.agent, adapter);
  handle.activeRunId = runId;
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

export function completeRun(handle: AgentHandle, runId: string): void {
  if (handle.activeRunId === runId) {
    handle.activeRunId = null;
  }
}

/**
 * Destroy an agent handle and clean up resources.
 */
export async function destroyAgent(handle: AgentHandle): Promise<void> {
  handle.unsubscribe();
  handle.agent.abort();
  handle.activeRunId = null;
  if (handlesBySession.get(handle.sessionId) === handle) {
    handlesBySession.delete(handle.sessionId);
  }
  await handle.mcpManager.disconnectAll();
}

/**
 * Destroy all active agent handles.
 */
export async function destroyAllAgents(): Promise<void> {
  await Promise.allSettled(
    [...handlesBySession.values()].map((handle) => destroyAgent(handle)),
  );
}

/**
 * Get the current handle for a session (if any).
 */
export function getHandle(sessionId: string): AgentHandle | null {
  return handlesBySession.get(sessionId) ?? null;
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
