# Phase 2 剩余 + Phase 3 后端能力实现

> 时间：2026-04-09 约 16:00 – 18:30

## 概述

完成了 Phase 2 剩余的 Webhook Receiver 和并行工具调用，以及 Phase 3 全部三个自进化子系统：主动学习引擎、情感状态机、反思与性格演化。

## Phase 2 剩余

### Webhook Receiver (`src/main/webhook.ts`) — 新增

- 本地 HTTP 服务器，监听 `127.0.0.1:17433`
- 仅接受 POST 请求，HMAC-SHA256 签名验证（`x-webhook-signature` header）
- 从 `x-webhook-source` / `x-webhook-event` header 提取来源信息
- 所有 payload 路由到 Event Bus `webhook:received` 事件
- 默认关闭（`enabled: false`），可配置
- 在 `index.ts` `whenReady` 启动，`window-all-closed` 停止

### 并行工具调用 (`src/main/parallel-tools.ts`) — 新增

- 无副作用工具的投机并行预执行
- pi-agent-core 内部是串行 `for + await`，本模块在 harness 层实现缓存加速
- 白名单：`file_read`、`glob_search`、`grep_search`、`get_time`、`todo_read` 等 8 个只读工具
- 流程：检测多工具批次 → 第一个工具执行时预热其余 → 后续命中缓存
- 修改 `agent.ts` 注册执行器 + 检测多工具 assistant 消息
- 修改 `tool-execution.ts` 在 harness 审批通过后查缓存

## Phase 3 — 自进化层

### 主动学习引擎 (`src/main/learning/engine.ts`) — 新增

- 信号类型：`tool_repeated_failure`、`user_correction`、`retry_after_reject`、`tool_discovery_opportunity`、`tool_misuse_pattern`
- 通过 Event Bus 被动收集工具失败和审批拒绝信号
- 阈值判断：同一工具失败/拒绝 ≥3 次触发学习
- 学习结果写入 semantic memory `topics/learnings.md`
- 7 天信号衰减，每小时清理（通过 scheduler 注册定时任务）
- 发出 `learning:applied` 事件

### 情感状态机 (`src/main/emotional/state-machine.ts`) — 新增

- 5 种模式：`focused`（专注）、`companion`（陪伴）、`quiet`（安静）、`encouraging`（鼓励）、`creative`（创意）
- 信号类型：时间段、回复频率、消息长度、连续错误、关键词检测
- 加权信号 → 状态转移，5 分钟冷却期
- 状态持久化到 `userData/data/emotional-state.json`
- 用户可锁定/解锁模式
- 提供 `buildEmotionalPromptText()` 供 prompt-control-plane 注入 soft section
- 每次 run 结束时自动评估

### 反思服务 (`src/main/reflection/service.ts`) — 新增

- 每日凌晨 2 点自动反思（通过 scheduler 注册 daily job）
- 收集当天所有 session 的对话摘要
- 本地生成反思报告（情绪关键词统计 + 高频词分析）
- 可执行洞察写入 semantic memory `topics/reflections.md`
- 报告存储到 `userData/data/reflections/{date}.json`
- 发出 `reflection:completed` 事件

### 性格漂移 (`src/main/reflection/personality-drift.ts`) — 新增

- 独立于 SOUL.md 的性格演化层
- trait 需 3 次独立提及才固化
- 30 天未 reinforce 自动衰减
- 最多 20 个活跃 trait，弱者淘汰
- 持久化到 `userData/data/personality-drift.json`
- 提供 `buildPersonalityDriftPromptText()` 生成 `[性格成长笔记]` prompt section
- 用户可查看/删除/锁定 trait

## Event Bus 扩展

`src/main/event-bus.ts` 新增事件类型：

| 事件 | 场景 |
|------|------|
| `webhook:received` | 外部 webhook 到达 |
| `learning:insight` | 学习引擎发现新信号 |
| `learning:applied` | 学习条目已写入 memory |
| `emotion:changed` | 情感模式切换 |
| `reflection:completed` | 每日反思完成 |

## 入口集成 (`src/main/index.ts`)

初始化顺序：
```
initBusAuditLog → initMetrics → initSelfDiagnosis
→ initActiveLearning → initPersonalityDrift
→ initEmotionalStateMachine → initReflectionService
→ scheduler.start → startWebhookServer
```

退出时：`stopWebhookServer → scheduler.stop`

## 类型检查

- `pnpm check`（main tsconfig）：✅ 零错误
- 修复了 parallel-tools 与 pi-agent-core 之间的类型兼容问题

## 影响文件汇总

| 文件 | 操作 |
|------|------|
| `src/main/webhook.ts` | 新增 |
| `src/main/parallel-tools.ts` | 新增 |
| `src/main/learning/engine.ts` | 新增 |
| `src/main/emotional/state-machine.ts` | 新增 |
| `src/main/reflection/service.ts` | 新增 |
| `src/main/reflection/personality-drift.ts` | 新增 |
| `src/main/event-bus.ts` | 修改 — 新增 5 个事件类型 |
| `src/main/harness/tool-execution.ts` | 修改 — 并行缓存集成 |
| `src/main/agent.ts` | 修改 — 并行批次检测 + 执行器注册 |
| `src/main/index.ts` | 修改 — Phase 3 模块初始化 + webhook 生命周期 |
