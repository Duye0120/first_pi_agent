import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import type { McpConnection, McpConnectionManager } from "./client.js";

/**
 * Convert MCP server tools into AgentTool instances.
 * Tool names are prefixed with `mcp_{serverName}_` to avoid collisions.
 */
export async function mcpToolsFromConnection(
  conn: McpConnection,
): Promise<AgentTool<any, any>[]> {
  if (!conn.connected) return [];

  try {
    const result = await conn.client.listTools();
    return result.tools.map((tool) => mcpToolToAgentTool(conn, tool));
  } catch {
    return [];
  }
}

function mcpToolToAgentTool(
  conn: McpConnection,
  tool: { name: string; description?: string; inputSchema?: any },
): AgentTool<any, any> {
  const prefixedName = `mcp_${conn.name}_${tool.name}`;

  // Convert MCP JSON Schema to TypeBox-compatible schema
  // For simplicity, we accept any object — the MCP server validates
  const parameters = Type.Object({
    args: Type.Optional(Type.Any({ description: "工具参数（JSON 对象）" })),
  });

  return {
    name: prefixedName,
    label: `${conn.name}/${tool.name}`,
    description: tool.description ?? `MCP 工具: ${tool.name}（来自 ${conn.name}）`,
    parameters,
    async execute(_toolCallId, params) {
      if (!conn.connected) {
        return {
          content: [{ type: "text", text: `MCP 服务 ${conn.name} 已断开连接` }],
          details: { error: "disconnected" },
        };
      }

      try {
        const result = await conn.client.callTool({
          name: tool.name,
          arguments: params.args ?? {},
        });

        // Extract text from content blocks
        const textParts: string[] = [];
        if ("content" in result && Array.isArray(result.content)) {
          for (const block of result.content) {
            if (block.type === "text") {
              textParts.push(block.text);
            }
          }
        }

        const text = textParts.length > 0
          ? textParts.join("\n")
          : JSON.stringify(result, null, 2);

        return {
          content: [{ type: "text", text }],
          details: {
            server: conn.name,
            tool: tool.name,
            isError: "isError" in result ? result.isError : false,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "MCP 调用失败";
        return {
          content: [{ type: "text", text: `MCP 工具调用失败: ${message}` }],
          details: { server: conn.name, tool: tool.name, error: message },
        };
      }
    },
  };
}

/**
 * Get all MCP tools from all active connections.
 */
export async function getAllMcpTools(
  connections: McpConnection[],
): Promise<AgentTool<any, any>[]> {
  const results = await Promise.allSettled(
    connections.map((conn) => mcpToolsFromConnection(conn)),
  );

  const tools: AgentTool<any, any>[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      tools.push(...result.value);
    }
  }

  return tools;
}

const listMcpResourcesParameters = Type.Object({
  server: Type.Optional(Type.String({ description: "可选 server 名；不填则枚举所有已连接服务" })),
});

const readMcpResourceParameters = Type.Object({
  server: Type.String({ description: "MCP server 名" }),
  uri: Type.String({ description: "资源 URI" }),
});

const listMcpResourceTemplatesParameters = Type.Object({
  server: Type.Optional(Type.String({ description: "可选 server 名；不填则枚举所有已连接服务" })),
});

function getConnectionsForServer(
  manager: McpConnectionManager,
  server?: string,
): McpConnection[] {
  if (server?.trim()) {
    const connection = manager.getConnection(server.trim());
    return connection ? [connection] : [];
  }

  return manager.getConnections();
}

export function getMcpResourceTools(
  manager: McpConnectionManager,
): AgentTool<any, any>[] {
  const listMcpResourcesTool: AgentTool<typeof listMcpResourcesParameters, any> = {
    name: "list_mcp_resources",
    label: "列出 MCP 资源",
    description: "列出已连接 MCP server 暴露的资源。",
    parameters: listMcpResourcesParameters,
    async execute(_toolCallId, params) {
      const connections = getConnectionsForServer(manager, params.server);
      if (connections.length === 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ resources: [], error: "当前没有可用的 MCP 资源服务。" }, null, 2) }],
          details: { resources: [] },
        };
      }

      const resources: Array<{
        server: string;
        uri: string;
        name: string;
        description?: string;
        mimeType?: string;
      }> = [];

      for (const connection of connections) {
        try {
          const result = await connection.client.listResources();
          resources.push(
            ...result.resources.map((resource) => ({
              server: connection.name,
              uri: resource.uri,
              name: resource.name,
              description: resource.description,
              mimeType: resource.mimeType,
            })),
          );
        } catch {
          // Skip broken servers so one bad MCP doesn't brick the whole list call.
        }
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            resources,
            count: resources.length,
          }, null, 2),
        }],
        details: { resources },
      };
    },
  };

  const readMcpResourceTool: AgentTool<typeof readMcpResourceParameters, any> = {
    name: "read_mcp_resource",
    label: "读取 MCP 资源",
    description: "读取指定 MCP 资源的内容。",
    parameters: readMcpResourceParameters,
    async execute(_toolCallId, params) {
      const connection = manager.getConnection(params.server);
      if (!connection) {
        return {
          content: [{ type: "text", text: JSON.stringify({ server: params.server, uri: params.uri, error: `MCP 服务不存在或未连接: ${params.server}` }, null, 2) }],
          details: { server: params.server, uri: params.uri, contents: [] },
        };
      }

      try {
        const result = await connection.client.readResource({ uri: params.uri });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              server: params.server,
              uri: params.uri,
              contents: result.contents,
            }, null, 2),
          }],
          details: {
            server: params.server,
            uri: params.uri,
            contents: result.contents,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "读取资源失败";
        return {
          content: [{ type: "text", text: JSON.stringify({ server: params.server, uri: params.uri, error: message }, null, 2) }],
          details: { server: params.server, uri: params.uri, contents: [], error: message },
        };
      }
    },
  };

  const listMcpResourceTemplatesTool: AgentTool<typeof listMcpResourceTemplatesParameters, any> = {
    name: "list_mcp_resource_templates",
    label: "列出 MCP 资源模板",
    description: "列出已连接 MCP server 暴露的资源模板。",
    parameters: listMcpResourceTemplatesParameters,
    async execute(_toolCallId, params) {
      const connections = getConnectionsForServer(manager, params.server);
      if (connections.length === 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ templates: [], error: "当前没有可用的 MCP 资源模板服务。" }, null, 2) }],
          details: { templates: [] },
        };
      }

      const templates: Array<{
        server: string;
        uriTemplate: string;
        name: string;
        description?: string;
        mimeType?: string;
      }> = [];

      for (const connection of connections) {
        try {
          const result = await connection.client.listResourceTemplates();
          templates.push(
            ...result.resourceTemplates.map((template) => ({
              server: connection.name,
              uriTemplate: template.uriTemplate,
              name: template.name,
              description: template.description,
              mimeType: template.mimeType,
            })),
          );
        } catch {
          // Same rule as list resources.
        }
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            templates,
            count: templates.length,
          }, null, 2),
        }],
        details: { templates },
      };
    },
  };

  return [
    listMcpResourcesTool,
    {
      ...listMcpResourcesTool,
      name: "ListMcpResources",
      label: "列出 MCP 资源",
      async execute(toolCallId, params) {
        return listMcpResourcesTool.execute(toolCallId, params);
      },
    },
    readMcpResourceTool,
    {
      ...readMcpResourceTool,
      name: "ReadMcpResource",
      label: "读取 MCP 资源",
      async execute(toolCallId, params) {
        return readMcpResourceTool.execute(toolCallId, params);
      },
    },
    listMcpResourceTemplatesTool,
  ];
}
