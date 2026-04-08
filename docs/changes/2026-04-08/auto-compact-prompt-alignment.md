# 2026-04-08 15:40 Auto Compact Prompt Alignment

## 本次做了什么

- 新增 `ensureContextSnapshotCoverage(sessionId)`，把“snapshot 是否需要自动补齐”收成显式 context service 能力
- `src/main/agent.ts` 的 `buildSystemPrompt()` 现在会先确保 snapshot 覆盖到位，再读取 snapshot 注入 system prompt
- `transformContext()` 里的自动 compact 改成复用这条能力，而不是自己单独生成一次

## 为什么改

- 之前 `transformContext()` 里虽然会自动生成 snapshot，但同一轮发送的 system prompt 早就组好了
- 结果就是“auto compact 成功了”，不等于“这轮 prompt 已经吃到新 snapshot”
- 这会让 context engine 的行为和用户直觉脱节，也不符合 Harness-First 下“生成和注入要对齐”的要求

## 涉及文件

- `src/main/context/service.ts`
- `src/main/agent.ts`

## 验证

- `2026-04-08 15:40:50` 运行 `pnpm exec tsc --noEmit -p tsconfig.json`
- `2026-04-08 15:40:50` 运行 `pnpm exec tsc --noEmit -p tsconfig.renderer.json`

## 说明

- 这轮没有改 compact 摘要内容本身，改的是“何时生成、何时注入”的节拍
- 现在聊天发送前会先把 auto compact 补齐，再组 system prompt，所以同一轮发送就能吃到最新 snapshot
