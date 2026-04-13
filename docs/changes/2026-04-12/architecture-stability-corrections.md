# 架构稳定性修正（Harness / Context Engine / Agent Runtime）

> 时间：2026-04-12 20:05:00
> 触发原因：用户明确要求优先保证主流程的稳健性与可扩展性，避免后续继续接 `memory`、`context compact`、`sub-agent`、审批恢复等能力时再次推翻主干。
> 本次变更：
> - 新增 `src/main/context/engine.ts`，把 system prompt 组装从 `agent.ts` 抽到真正的 Context Engine，开始实际消费 `PromptSection` 的 `trimPriority / authority / cacheScope` 元数据，而不再只是字符串拼接。
> - 更新 `src/main/agent.ts`，system prompt 改为统一走 `buildContextSystemPrompt()`；同时把 agent handle 注册从 session 单键改成 owner key，为后续 primary / sub-agent 多实例预留落点。
> - 新增 `src/main/model-resolution.ts`，统一 chat run 与 agent init 的模型解析和 fallback 策略，避免同一条主流程前后使用不同的模型解析逻辑。
> - 更新 `src/main/chat/prepare.ts`，chat run 改为复用统一模型解析入口，并显式标注前台 `foreground` run lane。
> - 更新 `src/main/harness/tool-execution.ts`，工具执行上下文不再捕获静态 adapter / run，而是改成动态读取当前 handle 绑定的 adapter 与 runScope，修正 handle 复用时工具事件、审批事件仍写向旧 run 的风险。
> - 更新 `src/main/harness/runtime.ts`、`src/main/harness/types.ts`、`src/main/harness/store.ts`，补上 run lane 基础模型，并为 interrupted approvals 增加持久化恢复能力。
> - 新增 `src/main/harness/approvals-store.ts`，把 interrupted approvals 从“仅内存提醒”升级成可跨重启保留的恢复读模型。
> - 新增 `src/main/background-run.ts`，把 background run 的 Harness 注册、transcript 起止事件、失败收口统一到一条 helper，避免后续 `compact / system worker / memory refresh` 各写一套 lifecycle。
> - 更新 `src/main/context/snapshot.ts`，让 compact 正式走 background run helper，而不是继续旁路 Harness Runtime。
> - 继续更新 `src/main/harness/runtime.ts`、`src/main/harness/types.ts`、`src/main/harness/approvals.ts`、`src/main/harness/approvals-store.ts`、`src/shared/contracts.ts`、`src/main/session/service.ts`，把 `ownerId` 一并写入 run snapshot、approval notice、transcript persistence，为后续 primary / sub-agent / system worker 区分来源预留结构。
> - 更新 `src/main/session/service.ts`，恢复待确认 run 时按 `aborted` 记录，而不是继续误记成 `failed`。
> 为什么这样改：
> - 当前聊天链路虽然能跑，但真正影响后续扩展的风险不在 UI，而在 runtime 骨架：run 绑定、prompt 组装、审批恢复、模型解析入口都还不够稳。
> - 如果继续在这些基础层之上叠 `memory / compact / sub-agent`，后面会出现 prompt 膨胀、run 绑定漂移、审批恢复丢失、模型选择前后不一致等系统性问题。
> 涉及文件：`src/main/context/engine.ts`、`src/main/context/service.ts`、`src/main/context/snapshot.ts`、`src/main/agent.ts`、`src/main/model-resolution.ts`、`src/main/background-run.ts`、`src/main/chat/prepare.ts`、`src/main/chat/finalize.ts`、`src/main/harness/tool-execution.ts`、`src/main/harness/runtime.ts`、`src/main/harness/types.ts`、`src/main/harness/store.ts`、`src/main/harness/approvals-store.ts`、`src/main/harness/approvals.ts`、`src/shared/contracts.ts`、`src/main/session/service.ts`

## 本轮结果

- Harness Runtime 不再只适合“一条普通聊天 run”，而是开始有前台 lane 与后续后台扩展的结构基础。
- background task 现在已有统一 lifecycle helper，`compact` 不再绕开主 runtime。
- Context Engine 不再只是概念层；prompt section 元数据已经进入真正的组装与预算裁剪链路。
- handle 复用时工具执行与审批链路会跟随当前 run 走，不再隐式绑死第一次创建 handle 时的 adapter。
- interrupted approvals 现在具备跨重启保留能力，恢复链路比之前稳定。
- transcript / approval notice 也开始带 `ownerId`，为未来多 agent 来源区分打底。

## 后续建议

- 下一轮如果继续补底层，优先把 `sub-agent / background run` 的真正调度模型补上，而不是先回 UI。
- 等主流程完全跑顺后，再做一次全项目级 review，重点看 renderer 是否还存在对旧状态语义的假设。

## 备注

- 本轮按仓库约束只做架构修正与代码分层，没有额外执行 `build` / `check`。
