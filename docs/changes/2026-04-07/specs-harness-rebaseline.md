# 2026-04-07 16:17 Specs Harness Rebaseline

## 本次做了什么

- 更新 `specs/README.md`
- 更新 `specs/01-overview.md`
- 更新 `specs/03-agent-core.md`
- 更新 `specs/04-tool-system.md`
- 更新 `specs/14-data-storage.md`
- 更新 `specs/15-security.md`

## 核心变化

- 把整个 specs 基线切到 `Harness First`
- 把 `01 / 03 / 04 / 14 / 15` 这些关键文档补上 run、policy、confirmation、audit 的约束
- 把之前过早标成 `approved` 的部分退回 `in-review`
- 重新整理 spec 讨论顺序，先收运行时约束，再收工具、存储、记忆和 UI

## 为什么要这么改

- 之前 spec 里虽然分别提到了 Agent、工具、安全、存储，但总约束层还不够明确
- 如果不先把 Harness 基线写进 spec，后面实现时很容易继续把副作用、确认、审计分散到各处
- 这次改动的目的就是把“模型只能提议、副作用必须过闸门”写成全局默认规则

## 下一步影响

- 后续整理后端时，默认按 Harness 基线解释架构
- 未完成确认前，不再把相关 spec 轻易标成 `approved`
