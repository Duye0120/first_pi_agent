# Phase 2 — 主动能力层实现

> 更新时间：2026-04-09 11:25:00

## 概述

实现 spec-16 扩展架构的 Phase 2（主动能力层），共 7 个模块，全部新建或增强。

## 新增文件

| 文件 | 职责 |
|------|------|
| `src/main/bus-audit.ts` | Event Bus 审计日志，onAny → JSONL，10MB 自动轮转 |
| `src/main/scheduler.ts` | 调度引擎，支持 interval/daily 两种模式，作业持久化 |
| `src/main/self-diagnosis/service.ts` | 自我诊断服务，3 项内建检查 + 自动修复 + 调度集成 |
| `src/main/metrics.ts` | 指标采集，监听 bus run/tool 事件，写入 metrics.jsonl |
| `src/main/failover.ts` | Provider 故障转移，自动重试 + 备选模型切换 |
| `src/main/ambient-context.ts` | 环境感知，收集时间/平台/git 上下文注入 system prompt |

## 修改文件

| 文件 | 改动 |
|------|------|
| `src/main/index.ts` | 启动链增加 initBusAuditLog / initMetrics / initSelfDiagnosis / scheduler.start()；退出时 scheduler.stop() |
| `src/main/agent.ts` | buildSystemPrompt() 注入 ambient context section |
| `src/main/context/service.ts` | 新增分层预算淘汰：寒暄 → tool_result 截断 → 整体截断 |
| `specs/16-extensibility-architecture.md` | 补充 S1-S6 Alma 建议项及路线图更新 |

## 模块详情

### 1. Bus Audit Log
- `bus.onAny()` 监听所有事件
- 写入 `userData/data/bus-audit.jsonl`
- 超过 10MB 自动 rotate 为 `.bak`

### 2. Scheduler
- `SchedulerJob` 支持 `interval`（毫秒间隔）和 `daily`（HH:mm 定时）
- 作业持久化到 `userData/data/scheduler-jobs.json`
- 每次触发发布 `schedule:triggered` 事件
- 应用启动时 `start()`，退出时 `stop()`

### 3. Self-Diagnosis
- 3 项内建检查：
  - `memory-integrity`：MEMORY.md 索引 vs topics/ 目录一致性，可自动重建索引
  - `context-budget`：上下文预算使用率
  - `disk-space`：数据目录磁盘占用（>500MB 警告）
- 对外暴露 `registerHealthCheck()` 供插件注册自定义检查
- 默认注册为 Scheduler 的 15 分钟间隔作业

### 4. Metrics
- 监听 `run:started` / `run:completed` / `tool:completed` / `tool:failed`
- 计算每次 run 耗时分布、工具调用统计
- 写入 `userData/data/metrics.jsonl`
- `getTodayMetrics()` 查询当日汇总

### 5. Failover
- `resolveWithFailover(modelId)` — 主模型失败时遍历所有 enabled provider
- `isProviderTransientError()` — 匹配 14 种瞬态错误模式
- `withRetry(fn, opts)` — 通用异步重试，指数退避
- 使用 `net.isOnline()` 检测网络

### 6. Ambient Context
- 收集：当前时间、平台、cwd、git 分支/最近提交
- 构建 `PromptSection`（layer: "runtime", role: "fact", cacheScope: "turn"）
- 已注入 `buildSystemPrompt()`

### 7. Context Budget Allocator（增强）
- 在 `createTransformContext()` 中替换简单截断为分层策略
- Phase 1：丢弃保护区外的短寒暄（<60 字）
- Phase 2：截断保护区外的 tool_result（保留前100字+后50字）
- Phase 3：回退到整体截断

## 类型检查

- `tsconfig.json`（main process）：✅ 通过
- `tsconfig.renderer.json`：3 个预存错误（`@assistant-ui/react` 类型不匹配），与本次改动无关
