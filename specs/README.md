# Pi Desktop Agent — Specs Index

> 本地运行的桌面端 AI Agent 工作台，类似 OpenClaw 但提供原生桌面体验。

## 文档状态

| 状态 | 含义 |
|------|------|
| `draft` | 待讨论，尚未开始写 |
| `in-review` | 已写完初稿，等待确认 |
| `approved` | 已确认，可以实施 |

## Spec 目录

### 第一层：核心架构

| # | 文档 | 主题 | 状态 |
|---|------|------|------|
| 01 | [overview.md](./01-overview.md) | 项目定位、差异化、整体架构分层图 | `approved` |
| 02 | [adapter-layer.md](./02-adapter-layer.md) | Adapter 接口定义、Electron Adapter 实现、Telegram 预留 | `in-review` |
| 03 | [agent-core.md](./03-agent-core.md) | Agent 初始化、pi-agent-core 集成、上下文管理策略、流式事件 | `approved` |

### 第二层：能力系统

| # | 文档 | 主题 | 状态 |
|---|------|------|------|
| 04 | [tool-system.md](./04-tool-system.md) | 工具注册机制、AgentTool 接口、安全沙箱（白名单/拦截/确认） | `approved` |
| 05 | [builtin-tools.md](./05-builtin-tools.md) | 5 个内置工具的详细设计：file_read、file_write、shell_exec、web_fetch、memory_search | `approved` |
| 06 | [mcp-client.md](./06-mcp-client.md) | MCP Client 集成、配置格式、工具自动注册 | `approved` |

### 第三层：记忆系统

| # | 文档 | 主题 | 状态 |
|---|------|------|------|
| 07 | [memory-architecture.md](./07-memory-architecture.md) | 三层记忆架构（T0/T1/T2）、数据流、读写时机 | `approved` |
| 08 | [soul-files.md](./08-soul-files.md) | SOUL.md / USER.md / AGENTS.md 的格式规范、加载逻辑、拼接顺序 | `approved` |
| 09 | [rag-and-embedding.md](./09-rag-and-embedding.md) | 向量存储方案、embedding 模型选择、检索流程、记忆提取策略 | `approved` |

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

### 后续规划（v1 不实现，预留接口）

| # | 文档 | 主题 | 状态 |
|---|------|------|------|
| F1 | — | Telegram Bot Adapter | `future` |
| F2 | — | Sub-agent / Multi-agent | `future` |
| F3 | — | Plan mode（先规划再执行） | `future` |
| F4 | — | MCP Server 管理 UI | `future` |
| F5 | — | Cron / 定时任务 | `future` |
| F6 | — | 心跳 / 后台常驻 | `future` |
| F7 | — | Workspace 文件浏览器 | `future` |
| F8 | — | Sub-agent 预处理（轻量模型做工具结果过滤/摘要，减少主 context 占用） | `future` |

## 工作流程

```
1. 逐个讨论每个 spec → 写成文档 → 标记 in-review
2. 你确认后 → 标记 approved
3. 所有核心 spec approved → 写实施计划 → 开始编码
```

## 讨论顺序建议

按依赖关系从底向上：
1. 01-overview（先对齐全貌）
2. 03-agent-core → 04-tool-system → 05-builtin-tools（核心引擎）
3. 07-memory → 08-soul-files → 09-rag（记忆系统）
4. 02-adapter-layer（连接层）
5. 10~13（前端，可以并行讨论）
6. 14-data-storage → 15-security（收尾）
