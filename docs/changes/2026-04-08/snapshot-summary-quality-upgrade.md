# 2026-04-08 15:53 Snapshot Summary Quality Upgrade

## 本次做了什么

- 重写了 `src/main/context/service.ts` 里 session snapshot 的摘要提取逻辑
- 不再主要依赖“关键词命中后拼几句”，改成按现场结构组织：
  - `背景目标`
  - `已做进展`
  - `当前停点`
  - `关键决策`
  - `下一步`
  - `风险`
- `currentTask / currentState / openLoops / nextActions` 的生成也一起升级，优先看：
  - 未响应的最新用户请求
  - 未解决的 confirmation
  - 最近一次 tool failure
  - 最近一次 run 的最终状态

## 为什么改

- 之前 compact 生成的 snapshot 更像“从旧消息里抓几句关键词”
- 这对“重开线程后快速理解现场”不够稳，尤其是“为什么停下”“下一步该做什么”容易说不清
- 既然这条链是按 Harness-First 做 continuity，就应该优先还原工作现场，而不是只做模糊摘要

## 涉及文件

- `src/main/context/service.ts`

## 验证

- `2026-04-08 15:53:09` 运行 `pnpm exec tsc --noEmit -p tsconfig.json`
- `2026-04-08 15:53:09` 运行 `pnpm exec tsc --noEmit -p tsconfig.renderer.json`

## 说明

- 这轮还是规则式 summarizer，不依赖额外模型调用
- 好处是稳定、快、可控；后续如果要继续升级，再考虑把 compact 摘要切成专门的 summarizer run
