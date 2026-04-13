# Pi Toolbox 集成

时间：2026-04-13 16:54:14 +08:00

更新时间：2026-04-13 17:09:29 +08:00

再次更新：2026-04-13 17:09:29 +08:00

## 来源

- GitHub Wiki：`https://github.com/ninehills/blog/wiki/Toolbox`
- 截图重点：Pi Coding Agent 的 Packages 列表与 SubAgent 安装说明。

## 变更摘要

- 参考 `pi-mcp-adapter` 思路，新增 Chela 内置 `mcp` 代理工具：`action=list` 枚举 MCP 工具，`action=call` 调用指定 `server/tool`。
- 参考 `pi-command-history` 思路，新增 `command_history` 工具，读取当前线程最近 `shell_exec` 命令、退出码和耗时，并回读 transcript 留存记录。
- 对齐 `pi-web-access` 场景，在运行时能力清单里明确 `web_search` 与 `web_fetch` 的分工。
- 对齐 `pi-tool-display` 场景，补充 MCP 与命令历史工具在活动条和工具回退卡片里的展示标签。
- SubAgent 相关能力后续接入 Chela 现有 `subagent` runKind 与 background run 生命周期，当前轮先完成工具层基础集成。

## 优化吸收

- MCP 代理增加 `server/tool` 名称格式校验，`call` 要求显式 `server`，让 Harness 审批目标更清晰。
- MCP `list` 支持 `query` 和 `includeSchema`，返回条数限制为 80 条；MCP 调用结果限制为 24000 字符。
- MCP 直连工具注册设置 12 个阈值，超过阈值时保留 `mcp` 代理，减少动态工具挤占上下文。
- `command_history` 增加 `query` 和 `failedOnly` 参数，返回命令默认脱敏 `api_key/token/secret/password/bearer/sk-*` 片段。

## Toolbox 对标落点

- `pi-tool-display`：`ToolFallback` 增加 `mcp` / `command_history` 的摘要卡，让结果先看重点再看原始 JSON。
- `pi-btw`：`/btw` 写入 turn intent patch，Composer 底部状态条显示 `/btw 旁路补充`。
- `pi-sub-bar`：Composer 底部状态条增加运行状态、最近 usage、累计 usage。
- `pi-usage-extension`：`ContextSummary` 新增累计输入/输出 tokens 与 usage 消息数，状态条直接消费。
- `pi-command-history`：命令历史继续保留 transcript 回读、失败过滤、脱敏摘要。

## 文件范围

- `src/mcp/adapter.ts`：新增单工具 MCP 代理。
- `src/main/tools/index.ts`：注册 `mcp` 代理与 `command_history` 工具。
- `src/main/tools/command-history.ts`：新增命令历史记录、transcript 回读与读取工具。
- `src/main/tools/shell-exec.ts`：记录每次 `shell_exec` 的执行结果。
- `src/main/harness/policy.ts`：为 `mcp` 与 `command_history` 补齐 Harness 策略。
- `src/main/parallel-tools.ts`：将 `command_history` 纳入只读工具预执行白名单。
- `src/main/prompt-control-plane.ts`：更新运行时能力清单，让 agent 优先理解 MCP 代理、网页访问和命令历史能力。
- `src/renderer/src/components/assistant-ui/agent-activity-bar.tsx`：补充活动条工具名与图标。
- `src/renderer/src/components/ui/tool-fallback.tsx`：补充工具回退卡片中文标签。
