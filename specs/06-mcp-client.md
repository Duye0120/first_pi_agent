# 06 — MCP Client

> 状态：`in-review`
> 依赖：04-tool-system

## 6.1 职责

MCP Client 负责：

1. **读取配置** — 从 workspace 的 mcp.json 加载 server 列表
2. **管理 server 生命周期** — 启动、连接、健康检查、重启、关闭
3. **获取工具列表** — 连接后拉取每个 server 提供的工具
4. **适配工具格式** — 把 MCP 工具包装成 AgentTool 接口
5. **转发调用** — agent 调用 MCP 工具时，转发到对应的 server 执行

## 6.2 MCP 协议基础

先讲一下 MCP 的通信方式，帮你理解后面的设计。

MCP Server 是一个独立进程，通过 **stdio**（标准输入输出）和 Client 通信：

```
我们的应用（Client）                    MCP Server（独立进程）
      │                                      │
      │──── spawn 启动进程 ────────────→      │
      │                                      │
      │──── stdin: initialize 请求 ────→      │
      │←─── stdout: 能力声明 ──────────       │
      │                                      │
      │──── stdin: tools/list 请求 ───→       │
      │←─── stdout: 工具列表 ─────────        │
      │                                      │
      │──── stdin: tools/call 请求 ───→       │
      │←─── stdout: 工具执行结果 ─────        │
      │                                      │
```

就是通过 stdin/stdout 互发 JSON 消息。`@modelcontextprotocol/sdk` 已经封装好了这套通信协议，我们不需要自己处理 JSON 序列化。

**为什么用 stdio 而不是 HTTP？**

因为 MCP Server 是本地进程，stdio 最简单——不需要找端口、不需要处理网络错误、不需要 CORS。启动进程就能用，关闭进程就断开。

## 6.3 配置格式

在 workspace 根目录放一个 `mcp.json`：

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@context7/mcp-server"],
      "env": {}
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp-server"],
      "env": {}
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

**字段说明：**

| 字段 | 说明 |
|------|------|
| `command` | 启动 server 的命令 |
| `args` | 命令参数 |
| `env` | 环境变量。`${VAR}` 语法从系统环境变量或 .env 文件读取 |

**为什么这个格式？**

Chela 的 canonical 字段是 `mcpServers`。为了迁移兼容，运行时也会接受旧的 `servers` 字段；两个字段同时出现时优先使用 `mcpServers`。

## 6.4 启动流程

应用启动时（或用户切换 workspace 时）：

```
1. 读取 workspace/mcp.json
   ├─ 文件不存在 → 跳过，不加载任何 MCP 工具
   └─ 文件存在 → 解析 mcpServers 配置，兼容旧 servers 字段

2. 对每个 server 并行启动：
   a. spawn 进程（command + args + env）
   b. 通过 SDK 的 Client 类建立连接
   c. 发送 initialize 请求，获取 server 能力
   d. 发送 tools/list 请求，获取工具列表
   e. 把每个工具包装成 AgentTool（见 6.5）

3. 合并所有 MCP 工具到内置工具列表
   allTools = [...builtinTools, ...mcpTools]

4. 注册到 Agent
```

**启动失败处理：**
- 某个 server 启动失败 → 跳过它，其他 server 正常工作
- 在前端显示警告："MCP Server 'xxx' 启动失败：原因"
- 不阻塞 agent 启动——MCP 是扩展能力，不是核心功能

## 6.5 MCP 工具 → AgentTool 适配

MCP Server 返回的工具格式和 pi-agent-core 的 AgentTool 不完全一样，需要一个适配器：

**MCP 工具格式：**
```json
{
  "name": "query-docs",
  "description": "Query documentation for a library",
  "inputSchema": {
    "type": "object",
    "properties": {
      "libraryId": { "type": "string", "description": "Library ID" },
      "query": { "type": "string", "description": "Search query" }
    },
    "required": ["libraryId", "query"]
  }
}
```

**适配成 AgentTool：**
```typescript
{
  name: "mcp__context7__query-docs",    // 前缀：mcp__{serverName}__{toolName}
  label: "Context7: query-docs",
  description: "Query documentation for a library",
  parameters: jsonSchemaToTypeBox(inputSchema),  // JSON Schema → TypeBox 转换
  execute: async (toolCallId, params) => {
    const result = await mcpClient.callTool("context7", "query-docs", params);
    return {
      content: [{ type: "text", text: result.content }],
      details: { server: "context7", tool: "query-docs", raw: result }
    };
  }
}
```

**命名规则 `mcp__{server}__{tool}`：**
- 避免和内置工具命名冲突
- LLM 能从名字看出这是 MCP 工具
- 前端能从名字解析出来自哪个 server

## 6.6 运行时管理

当前实现提供 `McpServerStatus` read model：

```typescript
type McpServerStatus = {
  name: string;
  configured: boolean;
  disabled: boolean;
  connected: boolean;
  status: "connected" | "connecting" | "disconnected" | "failed" | "disabled";
  command: string | null;
  args: string[];
  cwd: string | null;
  toolCount: number | null;
  resourceCount: number | null;
  startedAt: number | null;
  updatedAt: number | null;
  lastError: string | null;
};
```

主进程暴露四个管理入口：

- `mcp:list-status`
- `mcp:reload-config`
- `mcp:restart-server`
- `mcp:disconnect-server`

设置页系统分区展示当前 server 状态、失败原因、工具数和资源数，并提供重载与单 server 重启/断开入口。

**健康检查：**
```
每 30 秒 ping 一次已连接的 server
  ├─ 响应正常 → 继续
  └─ 无响应 → 标记为 disconnected
     → 尝试重启（最多 3 次）
     → 3 次都失败 → 标记为 failed，从工具列表移除
     → 前端显示警告
```

**关闭：**
```
应用关闭时 / 切换 workspace 时：
  → 对每个 server 发送 shutdown 信号
  → 等待 5 秒
  → 强制 kill 进程
```

## 6.7 局限性（v1）

v1 的 MCP Client 是最小可用版本：

| 不做 | 原因 |
|------|------|
| Server 发现 UI | 配置文件够用，不需要可视化管理界面 |
| 远程 Server（HTTP/SSE transport） | v1 只支持本地 stdio server |
| MCP Resources / Prompts | 只用 MCP 的 Tools 能力，其他能力暂不支持 |
| 动态工具更新 | 启动时拉一次工具列表，运行中不刷新 |

这些可以在后续版本按需加入。

## 6.8 文件结构

```
src/
  mcp/
    client.ts       # MCP Client 核心：启动 server、管理连接、健康检查
    adapter.ts      # MCP 工具 → AgentTool 适配器
    config.ts       # mcp.json 读取和解析
```
