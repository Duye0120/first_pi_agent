import { Agent } from "@mariozechner/pi-agent-core";
import type { AgentEvent as CoreAgentEvent, AgentTool } from "@mariozechner/pi-agent-core";
import type { ElectronAdapter } from "./adapter.js";
import { PRIMARY_AGENT_OWNER } from "./agent-owners.js";
import {
  buildContextSystemPrompt,
  createTransformContext,
} from "./context/service.js";
import { getSettings } from "./settings.js";
import { buildToolPool } from "./tools/index.js";
import { loadMcpConfig, getActiveServers } from "../mcp/config.js";
import { McpConnectionManager } from "../mcp/client.js";
import { wrapToolsWithHarness } from "./harness/tool-execution.js";
import { harnessRuntime } from "./harness/singleton.js";
import { parallelManager, SIDE_EFFECT_FREE_TOOLS } from "./parallel-tools.js";
import {
  buildUserPromptMessage,
  normalizePersistedSessionMessages,
} from "./chat-message-adapter.js";
import type { ChatMessage, SelectedFile } from "../shared/contracts.js";
import type { McpServerStatus } from "../shared/contracts.js";
import type { ResolvedRuntimeModel } from "./model-resolution.js";

export interface AgentHandle {
  agent: Agent;
  unsubscribe: () => void;
  adapter: ElectronAdapter;
  sessionId: string;
  ownerId: string;
  modelEntryId: string;
  runtimeSignature: string;
  thinkingLevel: string;
  mcpManager: McpConnectionManager;
  workspacePath: string;
  activeRunId: string | null;
  promptRuntime: {
    sourceName: string;
    providerType: "anthropic" | "openai" | "google" | "openai-compatible";
    modelName: string;
    modelId: string;
    contextWindow: number | null;
    supportsVision: boolean;
    supportsToolCalling: boolean;
  };
}

const handlesByOwner = new Map<string, AgentHandle>();
const initGenerations = new Map<string, number>();

function getHandleOwnerKey(sessionId: string, ownerId = PRIMARY_AGENT_OWNER): string {
  return `${sessionId}:${ownerId}`;
}

function subscribeToAgent(
  agent: Agent,
  adapter: ElectronAdapter,
  runId?: string | null,
): () => void {
  return agent.subscribe((event: CoreAgentEvent) => {
    // 检测 assistant 消息中的多工具调用，注册并行批次
    if (
      event.type === "message_end" &&
      "message" in event &&
      event.message &&
      typeof event.message === "object" &&
      "role" in event.message &&
      event.message.role === "assistant" &&
      "content" in event.message &&
      Array.isArray(event.message.content)
    ) {
      const toolCalls = event.message.content.filter(
        (c: any) => c.type === "toolCall",
      );
      if (toolCalls.length > 1 && runId) {
        const entries = toolCalls.map((tc: any) => ({
          toolCallId: tc.id as string,
          toolName: tc.name as string,
          args: (tc.arguments ?? {}) as Record<string, unknown>,
        }));
        // 使用 agent 的内部 abort signal（通过一个长期 controller）
        const controller = new AbortController();
        parallelManager.registerBatch(runId, entries, controller.signal);
      }
    }

    adapter.handleCoreEvent(event);
  });
}

function registerParallelExecutors(tools: AgentTool<any, any>[]): void {
  for (const tool of tools) {
    if (SIDE_EFFECT_FREE_TOOLS.has(tool.name)) {
      parallelManager.registerExecutor(tool.name, (toolCallId, args, signal) =>
        tool.execute(toolCallId, args, signal, () => {}),
      );
    }
  }
}

async function buildHarnessedTools(
  input: {
    workspacePath: string;
    sessionId: string;
    mcpManager: McpConnectionManager;
    adapter: ElectronAdapter;
    getHandle: () => AgentHandle | null;
  },
) {
  const rawTools = await buildToolPool({
    workspacePath: input.workspacePath,
    sessionId: input.sessionId,
    mcpManager: input.mcpManager,
  });

  registerParallelExecutors(rawTools);

  return wrapToolsWithHarness(rawTools, {
    workspacePath: input.workspacePath,
    runtime: harnessRuntime,
    getAdapter: () => input.getHandle()?.adapter ?? input.adapter,
    getRunScope: () => {
      const activeRunId = input.getHandle()?.activeRunId;
      return activeRunId
        ? {
            sessionId: input.sessionId,
            runId: activeRunId,
          }
        : null;
    },
  });
}

async function reconnectMcpServers(
  mcpManager: McpConnectionManager,
  workspacePath: string,
  serverName?: string,
): Promise<void> {
  const mcpConfig = loadMcpConfig(workspacePath);
  const servers = getActiveServers(mcpConfig);
  const filteredServers = serverName
    ? servers.filter(([name]) => name === serverName)
    : servers;

  if (!serverName) {
    await mcpManager.disconnectAll();
  } else {
    await mcpManager.disconnectServer(serverName);
  }

  for (const [name, cfg] of filteredServers) {
    try {
      await mcpManager.connectServer(name, cfg);
    } catch {
      /* skip failing servers */
    }
  }
}

/**
 * Create and initialize an Agent instance for a session.
 */
export async function initAgent(
  sessionId: string,
  adapter: ElectronAdapter,
  resolved: ResolvedRuntimeModel,
  ownerId = PRIMARY_AGENT_OWNER,
  existingMessages?: ChatMessage[],
): Promise<AgentHandle> {
  const ownerKey = getHandleOwnerKey(sessionId, ownerId);
  const generation = (initGenerations.get(ownerKey) ?? 0) + 1;
  initGenerations.set(ownerKey, generation);

  const existingHandle = handlesByOwner.get(ownerKey);
  if (existingHandle) {
    await destroyAgent(existingHandle);
  }

  const settings = getSettings();

  const normalizedMessages = await normalizePersistedSessionMessages(
    existingMessages ?? [],
    resolved.model,
  );
  const handleRef: { current: AgentHandle | null } = { current: null };

  // Load MCP tools
  const mcpManager = new McpConnectionManager();
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
  } catch {
    /* MCP init failure is non-fatal */
  }

  const tools = await buildHarnessedTools({
    workspacePath: adapter.workspacePath,
    sessionId,
    mcpManager,
    adapter,
    getHandle: () => handleRef.current,
  });

  const promptRuntime = {
    sourceName: resolved.source.name,
    providerType: resolved.source.providerType,
    modelName: resolved.entry.name,
    modelId: resolved.entry.modelId,
    contextWindow: resolved.model.contextWindow ?? null,
    supportsVision: resolved.model.input.includes("image"),
    supportsToolCalling: resolved.entry.capabilities.toolCalling ??
      resolved.entry.detectedCapabilities.toolCalling ??
      false,
  } satisfies AgentHandle["promptRuntime"];

  const agent = new Agent({
    initialState: {
      systemPrompt: await buildSystemPrompt({
        workspacePath: adapter.workspacePath,
        sessionId,
        latestUserText: null,
        toolNames: tools.map((tool) => tool.name),
        thinkingLevel: settings.thinkingLevel,
        promptRuntime,
      }),
      model: resolved.model,
      thinkingLevel: settings.thinkingLevel,
      tools,
      messages: normalizedMessages,
    },
    getApiKey: () => resolved.getApiKey(),
    transformContext: createTransformContext(
      sessionId,
      resolved.model.contextWindow ?? null,
    ),
    sessionId,
  });

  const unsubscribe = subscribeToAgent(agent, adapter);

  const handle: AgentHandle = {
    agent,
    unsubscribe,
    adapter,
    sessionId,
    ownerId,
    modelEntryId: resolved.entry.id,
    runtimeSignature: resolved.runtimeSignature,
    thinkingLevel: settings.thinkingLevel,
    mcpManager,
    workspacePath: adapter.workspacePath,
    activeRunId: null,
    promptRuntime,
  };
  handleRef.current = handle;

  if (initGenerations.get(ownerKey) !== generation) {
    unsubscribe();
    agent.abort();
    await mcpManager.disconnectAll();
    throw new Error("Agent initialization superseded.");
  }

  handlesByOwner.set(ownerKey, handle);
  return handle;
}

export function bindHandleToRun(
  handle: AgentHandle,
  adapter: ElectronAdapter,
  runId: string,
): void {
  handle.unsubscribe();
  handle.unsubscribe = subscribeToAgent(handle.agent, adapter, runId);
  handle.adapter = adapter;
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
  handle.agent.setSystemPrompt(
    await buildSystemPrompt({
      workspacePath: handle.workspacePath,
      sessionId: handle.sessionId,
      latestUserText: text,
      toolNames: handle.agent.state.tools.map((tool) => tool.name),
      thinkingLevel: handle.thinkingLevel,
      promptRuntime: handle.promptRuntime,
    }),
  );
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
  parallelManager.clearRun(runId);
}

/**
 * Destroy an agent handle and clean up resources.
 */
export async function destroyAgent(handle: AgentHandle): Promise<void> {
  handle.unsubscribe();
  handle.agent.abort();
  handle.activeRunId = null;
  const ownerKey = getHandleOwnerKey(handle.sessionId, handle.ownerId);
  if (handlesByOwner.get(ownerKey) === handle) {
    handlesByOwner.delete(ownerKey);
  }
  await handle.mcpManager.disconnectAll();
}

/**
 * Destroy all active agent handles.
 */
export async function destroyAllAgents(): Promise<void> {
  await Promise.allSettled(
    [...handlesByOwner.values()].map((handle) => destroyAgent(handle)),
  );
}

/**
 * Get the current handle for a session (if any).
 */
export function getHandle(
  sessionId: string,
  ownerId = PRIMARY_AGENT_OWNER,
): AgentHandle | null {
  return handlesByOwner.get(getHandleOwnerKey(sessionId, ownerId)) ?? null;
}

export function listMcpServerStatuses(): McpServerStatus[] {
  const handles = [...handlesByOwner.values()];
  const settings = getSettings();
  const config = loadMcpConfig(settings.workspace);

  if (handles.length === 0) {
    return new McpConnectionManager().getStatuses(config);
  }

  const byName = new Map<string, McpServerStatus>();
  for (const handle of handles) {
    for (const status of handle.mcpManager.getStatuses(config)) {
      const existing = byName.get(status.name);
      if (!existing || (status.connected && !existing.connected)) {
        byName.set(status.name, status);
      }
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function refreshHandleTools(handle: AgentHandle): Promise<void> {
  const handleRef = { current: handle };
  const tools = await buildHarnessedTools({
    workspacePath: handle.workspacePath,
    sessionId: handle.sessionId,
    mcpManager: handle.mcpManager,
    adapter: handle.adapter,
    getHandle: () => handleRef.current,
  });
  handle.agent.setTools(tools);
  handle.agent.setSystemPrompt(
    await buildSystemPrompt({
      workspacePath: handle.workspacePath,
      sessionId: handle.sessionId,
      latestUserText: null,
      toolNames: tools.map((tool) => tool.name),
      thinkingLevel: handle.thinkingLevel,
      promptRuntime: handle.promptRuntime,
    }),
  );
}

export async function reloadMcpConfigForActiveHandles(): Promise<McpServerStatus[]> {
  const handles = [...handlesByOwner.values()];
  await Promise.allSettled(
    handles.map(async (handle) => {
      await reconnectMcpServers(handle.mcpManager, handle.workspacePath);
      await refreshHandleTools(handle);
    }),
  );
  return listMcpServerStatuses();
}

export async function restartMcpServerForActiveHandles(
  serverName: string,
): Promise<McpServerStatus[]> {
  const handles = [...handlesByOwner.values()];
  await Promise.allSettled(
    handles.map(async (handle) => {
      await reconnectMcpServers(handle.mcpManager, handle.workspacePath, serverName);
      await refreshHandleTools(handle);
    }),
  );
  return listMcpServerStatuses();
}

export async function disconnectMcpServerForActiveHandles(
  serverName: string,
): Promise<McpServerStatus[]> {
  const handles = [...handlesByOwner.values()];
  await Promise.allSettled(
    handles.map(async (handle) => {
      await handle.mcpManager.disconnectServer(serverName);
      await refreshHandleTools(handle);
    }),
  );
  return listMcpServerStatuses();
}

async function buildSystemPrompt(input: {
  workspacePath: string;
  sessionId: string;
  latestUserText?: string | null;
  toolNames: string[];
  thinkingLevel: string;
  promptRuntime: AgentHandle["promptRuntime"];
}): Promise<string> {
  return buildContextSystemPrompt(input);
}
