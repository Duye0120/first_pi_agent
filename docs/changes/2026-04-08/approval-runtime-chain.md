# approval runtime 收口

> 时间：2026-04-08 22:45:00
> 目的：把 approval 从“临时弹窗行为”收成可恢复、可关联 `runId/requestId` 的后端主链，继续推进 Harness Runtime 收口。

## 本次改了什么

- 给 Harness 的 pending approval 补齐了结构化字段：`requestId`、`title`、`description`、`detail`，不再只有 `kind/payloadHash/reason`。
- 在 `HarnessRuntime` 里新增了 pending approval waiter/resolve 机制，允许按 `requestId` 等待和响应确认结果。
- `requestCancel()` 现在会主动中断待确认 approval，避免 run 卡死在 `awaiting_confirmation`。
- 工具确认链改成：先进入 `awaiting_confirmation` 并持久化 approval，再发出确认请求，最后统一由 runtime resolve。
- Main 侧补上了 `agentConfirmResponse` IPC handler，给后续 renderer 内嵌确认 UI 预留正式入口。
- Adapter 现在会向 renderer 发 `confirmation_request` 事件，同时仍保留原生 dialog 作为当前默认确认入口。
- 兼容旧版 `harness-runs.json` 里的 pending approval 落盘格式，恢复时会补默认字段，避免旧数据读崩。

## 为什么要这样改

- 当前后端收口顺序里，approval 是第一优先级；如果它不是一等对象，`awaiting_confirmation` 就无法稳定恢复，也没法给后面的 UI 接正式协议。
- 之前 preload 已经暴露了 `confirmResponse`，但 main 没有 handler，确认链路处于“接口有了、运行时没接上”的半成品状态。
- 把 approval 绑定到 `runId + requestId` 后，后续才能稳定接入 renderer 确认面板、恢复提示和审计视图。

## 涉及文件

- `D:\a_project\first_pi_agent\src\main\harness\types.ts`
- `D:\a_project\first_pi_agent\src\main\harness\store.ts`
- `D:\a_project\first_pi_agent\src\main\harness\runtime.ts`
- `D:\a_project\first_pi_agent\src\main\harness\tool-execution.ts`
- `D:\a_project\first_pi_agent\src\main\adapter.ts`
- `D:\a_project\first_pi_agent\src\main\index.ts`
