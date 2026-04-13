# Chat Domain 下沉与审批恢复 API 补齐

> 时间：2026-04-12 17:36:00
> 触发原因：继续优先完善底层架构，而不是先动 UI；本轮重点是把 chat domain 从 IPC 层继续下沉，并把中断审批恢复做成正式底层接口。
> 本次变更：
> - 新增 `src/main/chat/service.ts`，把 `chatSend`、取消 run、prompt-too-long 重试、max_tokens 续写、run 收口逻辑从 `ipc/chat.ts` 下沉为 service。
> - 更新 `src/main/ipc/chat.ts`，改为薄 IPC 注册层，只负责把 `chatSend / agentCancel / agentConfirmResponse` 转发给底层服务或 runtime。
> - 新增 `src/main/harness/approvals.ts`，把 interrupted approvals 的读取与 dismiss 操作收成独立 harness 服务接口。
> - 更新 `src/shared/contracts.ts`、`src/shared/ipc.ts`、`src/preload/index.ts`，补齐 `InterruptedApprovalNotice` 与 `agent.listInterruptedApprovals()` / `agent.dismissInterruptedApproval()` API。
> 为什么这样改：
> - `ipc/chat.ts` 不应该继续承载完整业务执行链，IPC 层应该只做协议装配。
> - interrupted approval 之前只有 runtime 内存骨架，没有正式对外 API；这轮先把底层协议和 preload 桥补齐，后面 UI 想接恢复面板时不需要再反向改后端。
> 涉及文件：`src/main/chat/service.ts`、`src/main/ipc/chat.ts`、`src/main/harness/approvals.ts`、`src/shared/contracts.ts`、`src/shared/ipc.ts`、`src/preload/index.ts`

## 本轮结果

- `src/main/ipc/chat.ts` 已收成真正的薄层。
- chat 执行主链现在有明确的 service 落点，后续可继续拆 run lifecycle / finalization / retry policy。
- approval recovery 已经从 runtime 私有能力升级成正式底层 API，后续接 UI 只需要消费现成协议。

## 下一步建议

- 继续把 `src/main/chat/service.ts` 按 `prepare / execute / finalize` 再拆细。
- 再往后考虑把 interrupted approvals 接到 settings 或 thread 的恢复入口，但那一步可以晚于 UI 细节优化。
