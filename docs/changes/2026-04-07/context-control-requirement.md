# 2026-04-07 17:09 Context Control Requirement

## 本次做了什么

- 把“context 必须可控、后续支持手动 compact”写入 `AGENTS.md`
- 把这个要求同步写入 `docs/backend-architecture-blueprint.md`

## 这条要求的真实含义

- context 不能只做自动黑盒压缩
- 用户后续必须能主动触发一次手动 `compact`
- UI 只负责触发和展示
- 真正的 compact 逻辑必须放在 Agent Core / context 管理链路

## 为什么要现在记

- 这是后端梳理里的关键边界
- 如果不先写清，后面很容易把 compact 错写成纯前端按钮，或者错塞进 Harness 里

## 架构结论

- `compact` 不是单纯 UI 功能
- `compact` 也不是 Harness 的核心职责
- 它本质上是 Agent Core 的 context 管理能力，对外暴露一个可触发入口
