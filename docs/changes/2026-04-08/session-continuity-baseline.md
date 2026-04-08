# 2026-04-08 10:17 Session Continuity Baseline

## 本次做了什么

- 把“新开 session 还能继续接上”沉淀成稳定架构约束
- 在 `AGENTS.md` 里固定 `run memory / session memory / semantic memory` 三组术语
- 在 `docs/backend-architecture-blueprint.md` 里新增 `SessionMemorySnapshot`，并明确续会话主链
- 在 `specs/07-memory-architecture.md` 里把 `T2` 从“只有 messages”升级成“messages + session continuity 快照”

## 为什么现在就定

- 当前项目还小，最适合先把边界定死
- 如果现在不分清 `run snapshot` 和 `session memory snapshot`，后面很容易把 `harness-runs.json` 错当成完整记忆系统
- 这轮讨论已经确认要参考《Harness Engineering》思路，但项目只抄分层原则，不抄整套复杂实现

## 这次定下来的结论

- `Harness Runtime` 继续只负责活动 run 现场、准入、确认、审计
- 跨 session 续接默认靠 `transcript persistence + session memory snapshot + T0/T1`
- `compact` 的真正职责仍然在 `Context Engine / Agent Core`，Harness 只负责追踪这次动作

## 涉及文件

- `AGENTS.md`
- `docs/backend-architecture-blueprint.md`
- `specs/07-memory-architecture.md`
