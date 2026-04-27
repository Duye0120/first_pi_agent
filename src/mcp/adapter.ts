import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import type { McpConnection, McpConnectionManager } from "./client.js";
import { normalizeMcpIdentifier } from "./config.js";

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
    conn.toolCount = result.tools.length;
    conn.updatedAt = Date.now();
    return result.tools.map((tool) => mcpToolToAgentTool(conn, tool));
  } catch {
    return [];
  }
}

function mcpToolToAgentTool(
  conn: McpConnection,
  tool: { name: string; description?: string; inputSchema?: any },
): AgentTool<any, any> {
  const safeServerName = normalizeMcpIdentifier(conn.name, "server");
  const safeToolName = normalizeMcpIdentifier(tool.name, "tool");
  const prefixedName = `mcp_${safeServerName}_${safeToolName}`;

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
          connection.resourceCount = result.resources.length;
          connection.updatedAt = Date.now();
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
          connection.updatedAt = Date.now();
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

const MAX_MCP_RESULT_CHARS = 24_000;
const MAX_MCP_LIST_ITEMS = 80;
const MCP_NAME_PATTERN = /^[A-Za-z0-9_.:-]{1,96}$/;

const mcpBrokerParameters = Type.Object({
  action: Type.Union([
    Type.Literal("list"),
    Type.Literal("call"),
  ], { description: "list 枚举 MCP 工具；call 调用 MCP 工具" }),
  server: Type.Optional(Type.String({ description: "MCP server 名" })),
  tool: Type.Optional(Type.String({ description: "MCP 工具名" })),
  query: Type.Optional(Type.String({ description: "list 时按工具名或描述过滤" })),
  includeSchema: Type.Optional(Type.Boolean({ description: "list 时是否包含压缩后的 inputSchema，默认 true" })),
  args: Type.Optional(Type.Any({ description: "调用 MCP 工具时传入的 JSON 参数" })),
});

type McpBrokerDetails = {
  action: "list" | "call";
  server?: string;
  tool?: string;
  count?: number;
  isError?: boolean;
  error?: string;
  truncated?: boolean;
};

function compactDescription(value: string | undefined, maxLength = 240): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.length <= maxLength
    ? normalized
    : normalized.slice(0, maxLength - 1).trimEnd() + "…";
}

function normalizeMcpName(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized || !MCP_NAME_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

function truncateText(text: string, maxLength = MAX_MCP_RESULT_CHARS): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= maxLength) {
    return { text, truncated: false };
  }

  return {
    text: `${text.slice(0, maxLength).trimEnd()}\n\n[内容已截断，原始长度 ${text.length} 字符]`,
    truncated: true,
  };
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function compactSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const source = schema as {
    type?: unknown;
    required?: unknown;
    properties?: Record<string, { type?: unknown; description?: string }>;
  };

  if (!source.properties || typeof source.properties !== "object") {
    return {
      type: source.type,
      required: Array.isArray(source.required) ? source.required : undefined,
    };
  }

  const properties = Object.fromEntries(
    Object.entries(source.properties).map(([name, property]) => [
      name,
      {
        type: property.type,
        description: compactDescription(property.description, 120),
      },
    ]),
  );

  return {
    type: source.type,
    required: Array.isArray(source.required) ? source.required : undefined,
    properties,
  };
}

async function listMcpTools(
  manager: McpConnectionManager,
  options: {
    server?: string;
    query?: string;
    includeSchema: boolean;
  },
) {
  const query = options.query?.replace(/\s+/g, " ").trim().toLowerCase();
  const connections = getConnectionsForServer(manager, options.server);
  const tools: Array<{
    server: string;
    name: string;
    description?: string;
    inputSchema?: unknown;
  }> = [];

  for (const connection of connections) {
    try {
      const result = await connection.client.listTools();
      connection.toolCount = result.tools.length;
      connection.updatedAt = Date.now();
      tools.push(
        ...result.tools.map((tool) => ({
          server: connection.name,
          name: tool.name,
          description: compactDescription(tool.description),
          inputSchema: options.includeSchema ? compactSchema(tool.inputSchema) : undefined,
        })).filter((tool) => {
          if (!query) {
            return true;
          }

          return [
            tool.server,
            tool.name,
            tool.description ?? "",
          ].join(" ").toLowerCase().includes(query);
        }),
      );
    } catch {
      tools.push({
        server: connection.name,
        name: "__list_failed__",
        description: "该 MCP server 的 tools/list 调用失败。",
      });
    }
  }

  return {
    tools: tools.slice(0, MAX_MCP_LIST_ITEMS),
    total: tools.length,
    truncated: tools.length > MAX_MCP_LIST_ITEMS,
  };
}

function stringifyMcpResult(result: unknown): string {
  if (
    result &&
    typeof result === "object" &&
    "content" in result &&
    Array.isArray((result as { content?: unknown }).content)
  ) {
    const textParts: string[] = [];
    for (const block of (result as { content: Array<{ type?: string; text?: string }> }).content) {
      if (block.type === "text" && block.text) {
        textParts.push(block.text);
      }
    }

    if (textParts.length > 0) {
      return textParts.join("\n");
    }
  }

  return safeJsonStringify(result);
}

export function getMcpBrokerTool(
  manager: McpConnectionManager,
): AgentTool<typeof mcpBrokerParameters, McpBrokerDetails> {
  return {
    name: "mcp",
    label: "MCP",
    description:
      "单工具 MCP 代理。先用 action=list 查看已连接 server 的工具，再用 action=call 调用指定 server/tool，适合 MCP 工具很多时减少上下文占用。",
    parameters: mcpBrokerParameters,
    async execute(_toolCallId, params) {
      const action = params.action;
      const server = normalizeMcpName(params.server);

      if (params.server?.trim() && !server) {
        return {
          content: [{ type: "text", text: "MCP server 名格式无效。" }],
          details: { action, server: params.server, error: "invalid_server" },
        };
      }

      if (action === "list") {
        const result = await listMcpTools(manager, {
          server: server ?? undefined,
          query: params.query,
          includeSchema: params.includeSchema ?? true,
        });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              tools: result.tools,
              count: result.tools.length,
              total: result.total,
              truncated: result.truncated,
            }, null, 2),
          }],
          details: {
            action,
            server: server ?? undefined,
            count: result.tools.length,
            truncated: result.truncated,
          },
        };
      }

      const requestedTool = normalizeMcpName(params.tool);
      if (!requestedTool) {
        return {
          content: [{ type: "text", text: "调用 MCP 工具需要提供格式有效的 tool。" }],
          details: { action, server: server ?? undefined, error: "missing_or_invalid_tool" },
        };
      }

      if (!server) {
        return {
          content: [{ type: "text", text: "调用 MCP 工具需要显式提供 server。" }],
          details: { action, tool: requestedTool, error: "missing_server" },
        };
      }

      const connections = getConnectionsForServer(manager, server);
      const matches: McpConnection[] = [];

      for (const connection of connections) {
        try {
          const result = await connection.client.listTools();
          if (result.tools.some((tool) => tool.name === requestedTool)) {
            matches.push(connection);
          }
        } catch {
          continue;
        }
      }

      if (matches.length === 0) {
        return {
          content: [{ type: "text", text: `未找到 MCP 工具：${requestedTool}` }],
          details: {
            action,
            server: params.server,
            tool: requestedTool,
            error: "tool_not_found",
          },
        };
      }

      const connection = matches[0];
      try {
        const result = await connection.client.callTool({
          name: requestedTool,
          arguments: params.args ?? {},
        });
        const isError = "isError" in result ? Boolean(result.isError) : false;
        const output = truncateText(stringifyMcpResult(result));

        return {
          content: [{ type: "text", text: output.text }],
          details: {
            action,
            server: connection.name,
            tool: requestedTool,
            isError,
            truncated: output.truncated,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "MCP 调用失败";
        return {
          content: [{ type: "text", text: `MCP 工具调用失败: ${message}` }],
          details: {
            action,
            server: connection.name,
            tool: requestedTool,
            error: message,
          },
        };
      }
    },
  };
}
