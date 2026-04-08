# 2026-04-08 11:34 Harness-First Runtime Refactor

## 本次做了什么

- 把会话事实源切到 Main：新增 `src/main/session/service.ts` 驱动的 `session.json + transcript.jsonl + context-snapshot.json`
- 把 `src/main/store.ts` 降成 façade，`sessions.save` 只再写 meta/draft/attachments，不再把 `ChatSession.messages` 当磁盘事实
- 新增 `src/main/context/service.ts`，落了 `ContextSummary / manual compact / auto compact / session snapshot prompt 注入 / transformContext`
- 把 `src/main/index.ts` 的 `chat:send` 改成 Main 先写 `user_message + run_started`，run 收尾后统一写 `assistant_message + run_finished`
- 扩了 Harness 边界：`HarnessRunSnapshot.runKind`、`run_state_changed` transcript、tool/confirmation transcript、重启 interrupted run recovery
- Renderer 改成 projection 模式：线程页保留流式临时 UI，但 run 收尾后必须 `sessions.load(sessionId)` reload；context 卡片新增 `Compact` 入口，真正 compact 只走 Main

## 为什么改

- 之前聊天正文由 Renderer 先写盘，Main 只负责跑 agent，事实源和执行源是分裂的
- 之前 context 圆环是前端本地估算，不能反映 session snapshot / compact / recovery 的真实状态
- 之前 Harness 只有活动 run 注册表，没有把 transcript、approval、tool 事件真正串成可续会话事实流

## 涉及文件

- `src/main/index.ts`
- `src/main/agent.ts`
- `src/main/adapter.ts`
- `src/main/store.ts`
- `src/main/context/service.ts`
- `src/main/session/service.ts`
- `src/main/harness/types.ts`
- `src/main/harness/runtime.ts`
- `src/main/harness/store.ts`
- `src/main/harness/tool-execution.ts`
- `src/preload/index.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/assistant-ui/context-summary-trigger.tsx`
- `src/renderer/src/lib/context-usage.ts`
- `docs/backend-architecture-blueprint.md`
- `specs/07-memory-architecture.md`
- `specs/14-data-storage.md`

## 验证

- `pnpm exec tsc --noEmit -p tsconfig.json`
- `pnpm exec tsc --noEmit -p tsconfig.renderer.json`
