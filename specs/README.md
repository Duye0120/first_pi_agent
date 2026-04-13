# Chela — Specs Index

> 本地运行的桌面端 AI Agent 工作台，提供原生桌面体验。

## 文档状态

| 状态 | 含义 |
|------|------|
| `draft` | 待讨论，尚未开始写 |
| `in-review` | 已写完初稿，等待确认 |
| `approved` | 已确认，可以实施 |

## 当前基线：Harness First

从这轮开始，所有 spec 默认按 **Harness 思想** 收口。这里的 Harness 不是新功能，而是整个项目的总约束层：

- 模型不能直接产生副作用；副作用只能通过 Harness 调用能力端口
- 每次请求都必须落成一个可追踪的 `run`，并受状态机约束
- 高风险动作必须能暂停、确认、拒绝、恢复
- 关键事件必须结构化记录，支持回放、审计、定位 bug
- “能不能做”由 Harness policy 决定，不由 prompt 里一句话决定

这也意味着：`approved` 不再只代表“方向对”，还至少要满足 4 个条件：

- 状态机清楚
- 能力门控清楚
- 确认断点清楚
- 事件持久化清楚

## Spec 目录

### 第一层：核心架构

| # | 文档 | 主题 | 状态 |
|---|------|------|------|
| 01 | [overview.md](./01-overview.md) | 项目定位、差异化、整体架构分层图 | `in-review` |
| 02 | [adapter-layer.md](./02-adapter-layer.md) | Adapter 接口定义、Electron Adapter 实现、Telegram 预留 | `in-review` |
| 03 | [agent-core.md](./03-agent-core.md) | Agent 初始化、pi-agent-core 集成、上下文管理策略、流式事件 | `in-review` |

### 第二层：能力系统

| # | 文档 | 主题 | 状态 |
|---|------|------|------|
| 04 | [tool-system.md](./04-tool-system.md) | 工具注册机制、AgentTool 接口、安全沙箱（白名单/拦截/确认） | `in-review` |
| 05 | [builtin-tools.md](./05-builtin-tools.md) | 5 个内置工具的详细设计：file_read、file_write、shell_exec、web_fetch、memory_search | `in-review` |
| 06 | [mcp-client.md](./06-mcp-client.md) | MCP Client 集成、配置格式、工具自动注册 | `in-review` |

### 第三层：记忆系统

| # | 文档 | 主题 | 状态 |
|---|------|------|------|
| 07 | [memory-architecture.md](./07-memory-architecture.md) | 三层记忆架构（T0/T1/T2）、数据流、读写时机 | `in-review` |
| 08 | [soul-files.md](./08-soul-files.md) | SOUL.md / USER.md / AGENTS.md 的格式规范、加载逻辑、拼接顺序 | `in-review` |
| 09 | [rag-and-embedding.md](./09-rag-and-embedding.md) | 向量存储方案、embedding 模型选择、检索流程、记忆提取策略 | `in-review` |

### 第四层：前端体验

| # | 文档 | 主题 | 状态 |
|---|------|------|------|
| 10 | [steps-visualization.md](./10-steps-visualization.md) | 推理过程可视化：事件映射、卡片结构、状态指示器、流式更新 | `in-review` |
| 11 | [terminal-integration.md](./11-terminal-integration.md) | 内嵌终端：xterm.js 集成、多 Tab、底部抽屉 | `in-review` |
| 12 | [file-diff-display.md](./12-file-diff-display.md) | 文件 Diff 展示：Unified/Split 视图、chunk 操作、inline comment | `in-review` |
| 13 | [composer-and-settings.md](./13-composer-and-settings.md) | Composer 增强、BYOK 配置 UI、workspace 管理、主题自定义 | `in-review` |

### 第五层：数据与安全

| # | 文档 | 主题 | 状态 |
|---|------|------|------|
| 14 | [data-storage.md](./14-data-storage.md) | 存储布局、多文件会话、凭证安全、记忆向量数据库 | `in-review` |
| 15 | [security.md](./15-security.md) | 沙箱策略、命令黑白名单、prompt injection 防护、审计日志 | `in-review` |

### 第六层：可扩展性 & 平台化

| # | 文档 | 主题 | 状态 |
|---|------|------|------|
| 16 | [extensibility-architecture.md](./16-extensibility-architecture.md) | Event Bus · Scheduler · Webhook · Plugin · Notification — 从聊天工具到个人 AI 平台 | `draft` |

### 后续规划（v1 不实现，预留接口）

| # | 文档 | 主题 | 状态 |
|---|------|------|------|
| F1 | — | Telegram Bot Adapter | `future` |
| F2 | — | Sub-agent / Multi-agent | `future` |
| F3 | — | Plan mode（先规划再执行） | `future` |
| F4 | — | MCP Server 管理 UI | `future` |
| F5 | — | ~~Cron / 定时任务~~ → 已纳入 spec-16 Scheduler | `→ spec-16` |
| F6 | — | ~~心跳 / 后台常驻~~ → 已纳入 spec-16 Event Bus | `→ spec-16` |
| F7 | — | Workspace 文件浏览器 | `future` |
| F8 | — | Sub-agent 预处理（轻量模型做工具结果过滤/摘要，减少主 context 占用） | `future` |

## 工作流程

```
1. 逐个讨论每个 spec → 写成文档 → 标记 in-review
2. 你确认后 → 标记 approved
3. 所有核心 spec approved → 写实施计划 → 开始编码
```

## 讨论顺序建议

按 Harness 依赖关系从底向上：
1. 01-overview（先对齐 Harness 基线）
2. 03-agent-core → 04-tool-system → 15-security（先定运行时约束）
3. 14-data-storage（把 run / approval / audit 的持久化边界定清）
4. 05-builtin-tools（逐个能力套进 Harness）
5. 07-memory → 08-soul-files → 09-rag（记忆系统）
6. 02-adapter-layer（连接层，重点是确认/恢复）
7. 10~13（前端体验，最后再收 UI）
