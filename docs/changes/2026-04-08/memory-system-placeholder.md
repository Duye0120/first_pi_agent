# 2026-04-08 15:24 Memory System Placeholder

## 本次做了什么

- 新增 `src/main/memory/service.ts`，把 `Memory System` 从文档概念落成显式代码入口
- 落了 `T1MemoryStore / T1MemoryQuery / T1MemoryHit` 接口和禁用态空实现
- `src/main/agent.ts` 的 system prompt 装配现在变成 `T0 + session snapshot + future T1 hook`，后续接 embedding / RAG 时不用再改 prompt 主干

## 为什么改

- 之前虽然架构上已经说要拆 `Harness Runtime / Context Engine / Memory System / Transcript Persistence`
- 但代码里还只有前三条，`Memory System` 仍然停留在文档层，没有一个稳定落点
- 这会让后续接 T1 时继续把逻辑塞回 `agent.ts` 或 `context/`，边界又会糊掉

## 涉及文件

- `src/main/memory/service.ts`
- `src/main/agent.ts`

## 验证

- `2026-04-08 15:24:19` 运行 `pnpm exec tsc --noEmit -p tsconfig.json`
- `2026-04-08 15:24:19` 运行 `pnpm exec tsc --noEmit -p tsconfig.renderer.json`

## 说明

- 这轮没有启用 `memory_search`，也没有接 embedding / RAG
- `Memory System` 现在是明确的禁用态占位，实现目标就是先把边界钉死，避免后续再串层
