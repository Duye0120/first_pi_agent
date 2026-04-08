import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { McpConnectionManager } from "../../mcp/client.js";
import { getAllMcpTools, getMcpResourceTools } from "../../mcp/adapter.js";
import { getTimeTool } from "../../tools/getTime.js";
import { createFileEditTool } from "./file-edit.js";
import { createFileReadTool } from "./file-read.js";
import { createFileWriteTool } from "./file-write.js";
import { createGlobSearchTool } from "./glob-search.js";
import { createGrepSearchTool } from "./grep-search.js";
import { createShellExecTool } from "./shell-exec.js";
import { createTodoReadTool, createTodoWriteTool } from "./todo.js";
import { createWebFetchTool } from "./web-fetch.js";
import { createWebSearchTool } from "./web-search.js";

type ToolAssemblyOptions = {
  workspacePath: string;
  sessionId: string;
  mcpManager: McpConnectionManager;
};

type BuiltinToolOptions = Pick<ToolAssemblyOptions, "workspacePath" | "sessionId">;

function dedupeTools(tools: AgentTool<any, any>[]): AgentTool<any, any>[] {
  const seen = new Set<string>();
  const deduped: AgentTool<any, any>[] = [];

  for (const tool of tools) {
    if (seen.has(tool.name)) {
      continue;
    }

    seen.add(tool.name);
    deduped.push(tool);
  }

  return deduped;
}

function aliasTool(
  tool: AgentTool<any, any>,
  aliasName: string,
  aliasLabel?: string,
): AgentTool<any, any> {
  return {
    ...tool,
    name: aliasName,
    label: aliasLabel ?? tool.label,
    async execute(toolCallId, params, signal, onUpdate) {
      return tool.execute(toolCallId, params, signal, onUpdate);
    },
  };
}

export function getBuiltinTools(options: BuiltinToolOptions): AgentTool<any, any>[] {
  const fileEdit = createFileEditTool(options.workspacePath);
  const globSearch = createGlobSearchTool(options.workspacePath);
  const grepSearch = createGrepSearchTool(options.workspacePath);
  const webSearch = createWebSearchTool();
  const todoRead = createTodoReadTool(options.sessionId);
  const todoWrite = createTodoWriteTool(options.sessionId);

  return [
    getTimeTool,
    createFileReadTool(options.workspacePath),
    fileEdit,
    aliasTool(fileEdit, "edit_file", "编辑文件"),
    createFileWriteTool(options.workspacePath),
    globSearch,
    grepSearch,
    createShellExecTool(options.workspacePath),
    createWebFetchTool(),
    webSearch,
    aliasTool(webSearch, "WebSearch", "网页搜索"),
    todoRead,
    todoWrite,
    aliasTool(todoWrite, "TodoWrite", "写入待办"),
  ];
}

export async function buildToolPool(
  options: ToolAssemblyOptions,
): Promise<AgentTool<any, any>[]> {
  const builtinTools = getBuiltinTools(options);
  const mcpResourceTools = getMcpResourceTools(options.mcpManager);
  const mcpTools = await getAllMcpTools(options.mcpManager.getConnections());

  return dedupeTools([
    ...builtinTools,
    ...mcpResourceTools,
    ...mcpTools,
  ]);
}
