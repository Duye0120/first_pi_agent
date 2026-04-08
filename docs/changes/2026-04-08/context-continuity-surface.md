# 2026-04-08 15:22 Context Continuity Surface

## 本次做了什么

- 扩了 `ContextSummary`，不再只传 token 使用量，也把 `snapshotSummary / currentTask / currentState / openLoops / nextActions / risks / importantFiles / branchName` 带给 Renderer
- `src/main/context/service.ts` 现在会把 `context-snapshot.json` 里的续会话信息一起塞进 `desktopApi.context.getSummary(sessionId)` 的返回值
- 底部 `context` 圆环的 hover / 展开卡片增加了续接信息展示，不再只有百分比和 revision 编号

## 为什么改

- 之前虽然 session snapshot 已经落盘并注入 prompt，但 UI 侧看到的还是“用了多少 token”
- 这不满足这轮 continuity 的硬目标：重开线程后，用户应该能直接看懂上次做到哪、卡在哪、下一步是什么
- context 卡片既然已经是用户可控入口，就应该承载一部分 session continuity，而不只是 usage 仪表盘

## 涉及文件

- `src/shared/contracts.ts`
- `src/main/context/service.ts`
- `src/renderer/src/lib/context-usage.ts`
- `src/renderer/src/components/assistant-ui/context-summary-trigger.tsx`

## 验证

- `2026-04-08 15:22:46` 运行 `pnpm exec tsc --noEmit -p tsconfig.json`
- `2026-04-08 15:22:46` 运行 `pnpm exec tsc --noEmit -p tsconfig.renderer.json`

## 说明

- 这轮还是沿着 `渐进收口 + T0/T2` 走，没有引入 `memory_search` 或 T1 向量记忆
- 现在的 `ContextSummary` 已经开始承担“把 session snapshot 显给用户看”的职责，后续如果要继续增强，可以再把 compact 后的摘要生成质量往上提
