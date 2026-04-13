# 项目架构全面审计报告

> **时间**：2026-04-08 16:47  
> **触发原因**：用户请求梳理当前项目结构和完成度  
> **审计范围**：全仓库代码、文档、依赖、遗留模块

---

## 一、项目定位

**first-pi-agent** 是一个 **Electron 桌面 AI Agent 工作台**（Codex 风格），目标是承载一个本地化的、带工具调用能力的 AI 编程助手。

项目的演化路径：
1. 最初基于 **pi-mono / pi-agent-core** 做 CLI agent
2. 中途参考 **Claude Code** 架构（harness / policy / prompt control plane）
3. 又参考 **harness-first** 理念（run state machine / audit / approval）
4. 最终形成 **Electron 三进程 + Harness Runtime** 的混合架构

---

## 二、当前架构全景图

```
┌──────────────────────────────────────────────────────────────────┐
│                        Electron App                              │
├──────────────────┬──────────────────┬────────────────────────────┤
│   Main Process   │     Preload      │        Renderer            │
│   (src/main/)    │  (src/preload/)  │     (src/renderer/)        │
│                  │                  │                            │
│  ┌────────────┐  │  contextBridge   │  ┌──────────────────────┐  │
│  │ IPC Hub    │◄─┼──────────────────┼──│ React 19 UI          │  │
│  │ index.ts   │  │  desktopApi      │  │ Tailwind CSS 4       │  │
│  │ 622 lines  │  │  100 lines       │  │ HeroUI + Radix       │  │
│  └─────┬──────┘  │                  │  │ Framer Motion        │  │
│        │         │                  │  │ ~6,000 lines         │  │
│  ┌─────▼──────────────────────────┐ │  └──────────────────────┘  │
│  │       Agent Core               │ │                            │
│  │  agent.ts (275L)               │ │  Features:                 │
│  │  adapter.ts (449L)             │ │  ✅ 多会话管理              │
│  │  chat-message-adapter.ts(222L) │ │  ✅ 流式聊天 + 思考展示     │
│  │  prompt-control-plane.ts(265L) │ │  ✅ 模型选择器              │
│  │  providers.ts (802L)           │ │  ✅ 工具调用步骤展示         │
│  └─────┬──────────────────────────┘ │  ✅ Git 分支切换 + Diff     │
│        │                            │  ✅ 终端                    │
│  ┌─────▼──────────────────────────┐ │  ✅ 文件附件                │
│  │    Harness Runtime             │ │  ✅ Context 用量圆环        │
│  │  runtime.ts (277L)             │ │  ✅ 设置面板                │
│  │  policy.ts (294L)              │ │  ✅ 亮/暗主题               │
│  │  tool-execution.ts (265L)      │ │                            │
│  │  audit.ts / store.ts / types   │ │                            │
│  └─────┬──────────────────────────┘ │                            │
│        │                            │                            │
│  ┌─────▼──────────────────────────┐ │                            │
│  │      Tool Suite (12 tools)     │ │                            │
│  │  shell-exec, file-read/write   │ │                            │
│  │  file-edit, grep, glob         │ │                            │
│  │  web-fetch, web-search         │ │                            │
│  │  todo, ripgrep, fs-utils       │ │                            │
│  └────────────────────────────────┘ │                            │
│                                     │                            │
│  ┌────────────────────────────────┐ │                            │
│  │     Support Services           │ │                            │
│  │  session/service.ts (860L)     │ │                            │
│  │  context/service.ts (985L)     │ │                            │
│  │  memory/service.ts (60L) ⚠️    │ │                            │
│  │  security.ts, logger.ts        │ │                            │
│  │  git.ts, files.ts, shell.ts    │ │                            │
│  │  soul.ts, settings.ts          │ │                            │
│  └────────────────────────────────┘ │                            │
└──────────────────┴──────────────────┴────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│              Legacy Code (src/ 根目录)                  │
│  agent/createAgent.ts   — CLI agent 工厂 (已废弃)       │
│  tools/getTime.ts       — 示例工具 (半活跃)             │
│  chatgpt/server.ts      — MCP ChatGPT 服务器 (已废弃)   │
│  mcp/adapter+client+cfg — MCP 客户端 (活跃，核心设施)    │
│  main.ts / config.ts    — CLI 入口 (已废弃)             │
└────────────────────────────────────────────────────────┘
```

---

## 三、文件级完成度清单

### Main Process（src/main/）

| 文件 | 行数 | 状态 | 活跃 | 完成度 | 说明 |
|------|------|------|------|--------|------|
| index.ts | 622 | ✅ 实码 | ✅ | 100% | IPC 总线，50+ 频道 |
| agent.ts | 275 | ✅ 实码 | ✅ | 100% | Agent 生命周期 |
| adapter.ts | 449 | ✅ 实码 | ✅ | 100% | 事件流 → UI 桥接 |
| chat-message-adapter.ts | 222 | ✅ 实码 | ✅ | 100% | 消息格式转换 |
| prompt-control-plane.ts | 265 | ✅ 实码 | ✅ | 100% | 7 层提示词组装 |
| providers.ts | 802 | ✅ 实码 | ✅ | 100% | 模型/源管理 |
| store.ts | 155 | ✅ 实码 | ✅ | 100% | 会话持久化 |
| settings.ts | 123 | ✅ 实码 | ✅ | 100% | 配置管理 |
| security.ts | 78 | ✅ 实码 | ✅ | 100% | 安全策略执行 |
| shell.ts | 218 | ✅ 实码 | ✅ | 100% | Shell 解析 |
| terminal.ts | 61 | ✅ 实码 | ✅ | 90% | PTY 管理 |
| files.ts | 266 | ✅ 实码 | ✅ | 95% | 文件操作 |
| git.ts | 476 | ✅ 实码 | ✅ | 100% | Git 集成 |
| soul.ts | 60 | ✅ 实码 | ✅ | 100% | 工作区策略文件 |
| logger.ts | 250 | ✅ 实码 | ✅ | 100% | 结构化日志 |
| mockChat.ts | 28 | ❌ 残留 | ❌ | <5% | 死代码，可删 |

### Harness Runtime（src/main/harness/）

| 文件 | 行数 | 状态 | 完成度 | 说明 |
|------|------|------|--------|------|
| runtime.ts | 277 | ✅ 实码 | 95% | Run 生命周期 + 取消 |
| types.ts | 70 | ✅ 实码 | 100% | 类型定义 |
| policy.ts | 294 | ✅ 实码 | 100% | 风险评估引擎 |
| tool-execution.ts | 265 | ✅ 实码 | 100% | 工具安全包装 |
| audit.ts | 20 | ✅ 实码 | 100% | 审计日志 |
| store.ts | 54 | ✅ 实码 | 100% | Run 持久化 |
| singleton.ts | 3 | ✅ 实码 | 100% | 单例导出 |

### Services（src/main/）

| 文件 | 行数 | 状态 | 完成度 | 说明 |
|------|------|------|--------|------|
| session/service.ts | 860 | ✅ 实码 | 100% | 会话持久化引擎 |
| context/service.ts | 985 | ✅ 实码 | 95% | 上下文压缩引擎 |
| memory/service.ts | 60 | ⚠️ 桩 | 5% | T1 语义记忆占位 |

### Tool Suite（src/main/tools/）

| 文件 | 状态 | 完成度 |
|------|------|--------|
| shell-exec.ts | ✅ | 100% |
| file-read.ts | ✅ | 100% |
| file-write.ts | ✅ | 100% |
| file-edit.ts | ✅ | 95% |
| glob-search.ts | ✅ | 95% |
| grep-search.ts | ✅ | 95% |
| todo.ts | ✅ | 100% |
| web-fetch.ts | ✅ | 100% |
| web-search.ts | ✅ | 90% |
| ripgrep.ts | ✅ | 100% |
| fs-utils.ts | ✅ | 100% |

### Renderer（src/renderer/）

| 模块 | 行数 | 状态 | 说明 |
|------|------|------|------|
| App.tsx | 1,227 | ✅ 完整 | 状态中枢 |
| thread.tsx | 861 | ✅ 完整 | 聊天主界面 |
| sidebar.tsx | 671 | ✅ 完整 | 会话列表 |
| useAgentEvents.ts | 240 | ✅ 完整 | 事件流消费，RAF 优化 |
| 其余组件 (15+) | 各 100-500 | ✅ 完整 | 全部真实实现 |

### Shared Contracts（src/shared/）

| 文件 | 行数 | 状态 |
|------|------|------|
| contracts.ts | 570 | ✅ 完整类型定义 |
| ipc.ts | 89 | ✅ 全频道覆盖 |
| agent-events.ts | 141 | ✅ 完整事件规格 |
| provider-directory.ts | 765 | ✅ 模型元数据库 |
| security.ts | 63 | ✅ 安全策略定义 |

### Legacy Code（可清理）

| 文件 | 状态 | 建议 |
|------|------|------|
| src/agent/createAgent.ts | 废弃 | CLI 废弃后可删 |
| src/tools/getTime.ts | 半活跃 | 非核心，可删 |
| src/chatgpt/server.ts | 废弃 | 被 MCP 客户端取代 |
| src/main.ts | 废弃 | CLI 入口，可删 |
| src/config.ts | 半废弃 | 已被 providers.ts 取代 |
| src/main/mockChat.ts | 废弃 | 死代码，可删 |

---

## 四、分层架构评估

按 AGENTS.md 约定的四层来对照：

### Layer 1: Harness Runtime ✅ 已完成（95%）
- Run 状态机 ✅（created → running → completed/aborted/failed）
- 取消传播 ✅
- 磁盘持久化 ✅
- 审计日志 ✅
- **缺口**：approval 持久化只在内存，重启后丢失（文档已知问题）

### Layer 2: Context Engine ✅ 已完成（95%）
- 上下文压缩 ✅（auto-compact + 手动 compact）
- Token 预算管理 ✅
- 保护最近轮次 ✅
- Session memory snapshot ✅
- Git diff 注入 ✅
- **缺口**：semantic memory 接口留空

### Layer 3: Memory System ⚠️ 未实现（5%）
- T0 (Soul rules) ✅ 已实现
- T1 (Semantic long-term) ❌ 仅占位
- T2 (Session context) ✅ 已实现
- **这是当前最大的空白**

### Layer 4: Transcript Persistence ✅ 已完成（100%）
- JSONL 格式会话记录 ✅
- 用户消息、助手消息、工具执行、确认请求 ✅
- 上下文快照 ✅
- Run 状态变更记录 ✅

---

## 五、总体判断

### 好消息：项目比你想象的要完整

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码完成度 | **92%** | 绝大多数文件是真实可用代码，不是骨架 |
| 架构健壮性 | **8.5/10** | 分层清晰，安全策略到位，事件流设计成熟 |
| UI 完成度 | **95%** | 全功能桌面 UI，生产级别 |
| Agent 核心 | **95%** | 完整的工具链、Harness、提示词引擎 |
| 文档覆盖 | **85%** | 15 份 spec + 3 份架构文档 + 变更日志 |

### 真正的缺口只有 3 个

1. **T1 语义记忆**（memory/service.ts）— 占位状态，无实现
2. **Approval 持久化** — 重启后丢失确认记录
3. **遗留代码清理** — 6 个废弃文件占据 src/ 根目录

### 项目不是"乱"，是"演化痕迹重"

你说的"东参考西参考"其实留下了合理的分层：
- pi-agent-core → 提供了 agent 工厂和工具框架基础
- Claude Code → 贡献了 Harness / Policy / Prompt Control Plane 设计
- Harness 架构 → 贡献了 Run state machine / Audit / Approval 思路

这三条线已经 **收束** 到了一个统一的架构里，不是还在打架。

---

## 六、下一步建议

### 优先级 1：清理遗留
- 删除 `src/main/mockChat.ts`（死代码）
- 将 `src/agent/`、`src/tools/`、`src/chatgpt/`、`src/main.ts`、`src/config.ts` 移入 `src/_legacy/` 或直接删除

### 优先级 2：补 T1 语义记忆
- `memory/service.ts` 从 disabled 变成至少能做 key-value 持久化
- 为 prompt-control-plane 的 semantic memory 层提供真实数据

### 优先级 3：Approval 持久化
- 让 harness runtime 的 pending approval 写盘
- 重启后能恢复待确认状态

---

*本报告由 Opus 4.6 基于全仓库代码审计生成。*
