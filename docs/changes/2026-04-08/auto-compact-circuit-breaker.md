# 2026-04-08 15:46 Auto Compact Circuit Breaker

## 本次做了什么

- 给 session meta 增加了 auto compact 连续失败计数和 blocked 时间
- `ensureContextSnapshotCoverage(sessionId)` 现在遇到 auto compact 连续失败会暂停自动重试，不再每轮发送都继续硬撞
- manual `compact` 成功后会清空失败计数并解除 blocked 状态
- `ContextSummary` 和底部 `context` 卡片新增了 auto compact blocked 状态展示

## 为什么改

- 之前 auto compact 一旦因为数据异常、生成失败或运行期问题出错，后续每次发消息都可能继续重试
- 这既浪费运行时间，也会让 context 行为变成“后台一直失败，但用户完全看不见”
- 按 Harness / Context 的边界，自动策略应该有熔断，手动入口应该保底可救

## 涉及文件

- `src/main/session/service.ts`
- `src/main/context/service.ts`
- `src/shared/contracts.ts`
- `src/renderer/src/lib/context-usage.ts`
- `src/renderer/src/components/assistant-ui/context-summary-trigger.tsx`

## 验证

- `2026-04-08 15:46:42` 运行 `pnpm exec tsc --noEmit -p tsconfig.json`
- `2026-04-08 15:46:42` 运行 `pnpm exec tsc --noEmit -p tsconfig.renderer.json`

## 说明

- 这轮熔断的是 auto compact，不是 manual compact
- 现在策略是连续失败 `3` 次后暂停自动 compact，等用户手动 compact 一次成功再恢复
