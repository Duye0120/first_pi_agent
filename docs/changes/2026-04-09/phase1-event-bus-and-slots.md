# Phase 1: Event Bus + 桥接 + 通知工具 + 全局快捷键

> 时间：2026-04-09 10:36

## 改了什么

### 1. Event Bus 核心 — `src/main/event-bus.ts`（新建）
- 类型安全的 EventMap，覆盖 7 大类 ~15 种事件
- EventBus 类：on / emit / once / onAny / removeAllListeners
- 错误隔离：handler 异常只记录，不影响 emitter
- 单例 `bus` 导出

### 2. 桥接现有代码
- **`src/main/harness/tool-execution.ts`** — 在 5 个关键节点 emit 事件：
  - `approval:requested` / `approval:resolved`
  - `tool:executing` / `tool:completed` / `tool:failed`
- **`src/main/harness/runtime.ts`** — createRun → `run:started`，finishRun → `run:completed`
- **`src/main/index.ts`** — chatSend handler 添加 `message:user` / `message:assistant`

### 3. 桌面通知工具 — `src/main/tools/notify.ts`（新建）
- `notify_user` 工具，Agent 可主动发桌面通知
- 注册为 safe 级别（harness policy 不需确认）
- 在 `src/main/tools/index.ts` 注册
- 在 `src/main/harness/policy.ts` 标记 safe

### 4. 全局快捷键 — `src/main/quick-invoke.ts`（新建）
- Alt+Space 激活窗口 + 聚焦 Composer
- 在 app ready 时注册，window-all-closed 时取消
- preload 暴露 `quickInvoke.onFocusComposer()` 给 renderer
- `src/shared/contracts.ts` DesktopApi 新增 `quickInvoke` 类型

### 5. Spec-16 扩展 — 采纳 Alma 6 条补充
- S1: 并行工具调用（Phase 2）
- S2: 性能指标采集（Phase 2）
- S3: 离线/降级模式（Phase 2）
- S4: 上下文预算智能分配（Phase 2）
- S5: 对话分支（Phase 4）
- S6: 工具使用教学（Phase 3，合并到 Active Learning）
- 更新路线图和能力清单

## 为什么改
Spec-16 Phase 1 实施——为贾维斯平台搭建事件驱动骨架，让后续 Phase 2-5 的调度、诊断、插件、反思等能力有统一的消息总线可用。

## 改到哪些文件
- `src/main/event-bus.ts` — 新建
- `src/main/tools/notify.ts` — 新建
- `src/main/quick-invoke.ts` — 新建
- `src/main/harness/tool-execution.ts` — 修改（5 处 bus.emit）
- `src/main/harness/runtime.ts` — 修改（2 处 bus.emit）
- `src/main/harness/policy.ts` — 修改（notify_user → safe）
- `src/main/index.ts` — 修改（import bus + quick-invoke，2 处 bus.emit）
- `src/main/tools/index.ts` — 修改（注册 notifyUserTool）
- `src/preload/index.ts` — 修改（暴露 quickInvoke.onFocusComposer）
- `src/shared/contracts.ts` — 修改（DesktopApi 增加 quickInvoke 类型）
- `specs/16-extensibility-architecture.md` — 修改（Alma 6 项补充 + 路线图更新）

## 类型检查
`pnpm check` — 通过 ✅
