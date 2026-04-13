# Chat Domain 进一步分层（prepare / execute / finalize / cancel）

> 时间：2026-04-12 17:55:00
> 触发原因：继续优先打通底层架构，把 chat domain 从单个 service 文件继续拆成稳定职责层，而不是把复杂度重新堆回一个大文件。
> 本次变更：
> - 新增 `src/main/chat/types.ts`，定义 `ChatRunContext` 作为 chat domain 内部运行上下文。
> - 新增 `src/main/chat/prepare.ts`，负责 run 准备、session 校验、agent handle 复用/初始化、transcript 起始写入。
> - 新增 `src/main/chat/execute.ts`，负责真正的 prompt 执行、prompt-too-long 反应式 compact 重试、max_tokens 续写。
> - 新增 `src/main/chat/finalize.ts`，负责 completed / failed / cancelled 三种收口与 terminal event flush。
> - 新增 `src/main/chat/cancel.ts`，负责 run cancel 路径。
> - 更新 `src/main/chat/service.ts`，降为 orchestrator，只负责串联 prepare → execute → finalize。
> - 新增 `src/main/ipc/harness.ts`，把 approval confirm / interrupted approvals 相关 IPC 从 chat IPC 拆回 harness domain。
> - 更新 `src/main/harness/approvals.ts`，补充 `resolveApprovalResponse()`，让 approval 解析也有明确 harness service 落点。
> 为什么这样改：
> - chat domain 的复杂度已经足够高，如果继续堆在一个 service 文件里，很快会再次失控。
> - approval 属于 harness，不属于 chat；把 confirm / interrupted approvals 从 chat IPC 挪出，可以让 chat 只关心 run 执行，而 harness 关心审批恢复。
> 涉及文件：`src/main/chat/types.ts`、`src/main/chat/prepare.ts`、`src/main/chat/execute.ts`、`src/main/chat/finalize.ts`、`src/main/chat/cancel.ts`、`src/main/chat/service.ts`、`src/main/ipc/harness.ts`、`src/main/harness/approvals.ts`、`src/main/index.ts`

## 本轮结果

- chat domain 现在已经有清晰的阶段边界：prepare / execute / finalize / cancel。
- harness approval 相关能力也有了独立 IPC 与 service 边界，不再混在 chat 里。
- `src/main/index.ts` 继续保持 composition root 角色，不再吸收新复杂度。

## 后续建议

- 如果继续做底层，不优先回 UI；下一步更值得做的是：
  1. 把 `session continuity` 与 `context compact` 的刷新策略从 chat domain 再抽出成独立 policy / orchestration；
  2. 给 approval recovery 增加 session 维度的读取/清理策略与更稳定的读模型；
  3. 再考虑为 renderer 暴露一个最薄的恢复面板消费层。
