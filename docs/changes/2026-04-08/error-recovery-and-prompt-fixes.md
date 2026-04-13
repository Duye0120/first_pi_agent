# 错误恢复 + Prompt/Memory 修复

> 新增：2026-04-08 16:45:00

## 背景

基于 Claude Code 源码分析书（harness-engineering）对标审计，发现 14 个缺口。
本轮完成 TIER 1（错误恢复）3 项 + TIER 3（Prompt/Memory）3 项修复。

## 改动清单

### E1: API 错误分层恢复

- **文件**: `src/main/index.ts`
- **内容**: chatSend handler 增加 prompt-too-long 检测，触发 reactive compact 后重试一次
- **辅助函数**: `isPromptTooLongError()` — 检测 8 种常见 PTL 错误模式

### E2: max_output_tokens 续写

- **文件**: `src/main/index.ts`, `src/main/adapter.ts`
- **内容**:
  - adapter 层捕获 message_end 的 stopReason 写入 RunBuffer
  - 新增 `getLastStopReason()` 方法
  - chatSend handler 在成功 prompt 后检测截断，自动注入续写指令
  - 续写指令: "直接继续，不要道歉，不要回顾，从中断处接着写。"
  - 辅助函数: `isMaxTokensTruncation()` — 兼容 Anthropic/OpenAI 两种 stop reason

### E3: 取消时 synthetic tool_result（已搁置）

- **决策**: 当前架构已缓解此问题
  - cancel 时 destroy+recreate agent
  - `normalizePersistedSessionMessages()` 剥离 tool_use/tool_result
  - 模型不会看到悬空 tool_use blocks

### P1: SessionMemorySnapshot 增加 errors/learnings

- **文件**: `src/shared/contracts.ts`, `src/main/session/service.ts`, `src/main/context/service.ts`
- **内容**:
  - 类型增加 `errors: string[]` 和 `learnings: string[]`
  - `createEmptySnapshot()` 提供默认空数组
  - `collectErrors()` 从 transcript 事件中提取工具/运行失败
  - `buildSnapshot()` 和 `buildSnapshotPrompt()` 填充和渲染 errors
  - `normalizeSnapshotDraft()` 支持 errors/learnings
  - `buildSnapshotDraftWithModel()` prompt 新增 errors/learnings 字段说明

### P2: Memory instructions 始终注入

- **文件**: `src/main/memory/service.ts`
- **内容**: `getSemanticMemoryPromptSection()` 在 query 为空（冷启动）时也返回 buildMemoryInstructions() + 索引概览

### P3: RuntimeCapability cacheScope 检查

- **决策**: 保持 `session` 不变——session 级缓存是正确的，因为 RuntimeCapability 中的工具列表确实可能因 session 配置不同而变化

### reactiveCompact() 新增

- **文件**: `src/main/context/service.ts`
- **内容**: 新增 `reactiveCompact()` 导出函数，可在活跃 run 期间触发 compact（供 PTL 恢复使用），委托 `applySnapshot("auto")` 并遵守电路断路器

## 类型检查

- `tsc --noEmit -p tsconfig.json` ✅
- `tsc --noEmit -p tsconfig.renderer.json` ✅

## 剩余 TIER 2 工作（未开始）

- T1: Shell 治理增强（分级命令分类）
- T2: per-tool interruptBehavior 元数据
- T3: shell_exec in-app 确认（Phase 4 TODO）
