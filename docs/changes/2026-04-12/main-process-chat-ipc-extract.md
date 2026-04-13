# Main Process Chat IPC 独立收口

> 时间：2026-04-12 17:27:00
> 触发原因：完成本轮 P1 主进程装配层收口，把最后仍留在 `index.ts` 的 chat/agent 主链独立出来。
> 本次变更：
> - 新增 `src/main/ipc/chat.ts`，承载 `chatSend`、`agentCancel`、`agentConfirmResponse` 以及相关 prompt-too-long / max_tokens 兜底逻辑。
> - 更新 `src/main/index.ts`，改为通过 `registerChatIpc()` 装配 chat domain。
> - `src/main/index.ts` 现在基本只保留应用生命周期、IPC 模块装配、后台服务启动/停止与窗口绑定。
> 为什么这样改：chat 主链是最复杂、最需要后续治理的执行链路；独立成模块后，可以继续拆 run 创建、agent handle、错误恢复、transcript 收口，而不影响 app bootstrap。
> 涉及文件：`src/main/index.ts`、`src/main/ipc/chat.ts`

## 本轮结果

- `src/main/index.ts` 从本轮改造前的 `807` 行收缩到 `89` 行，回到 composition root 角色。
- chat/agent 执行链路集中到了 `src/main/ipc/chat.ts`，下一步可以继续在 chat domain 内部拆服务，而不是继续扩 `index.ts`。
- 本轮仍以搬运和重组为主，不刻意改动业务行为。

## 下一步建议

- 在 `src/main/ipc/chat.ts` 内继续拆 `run lifecycle / prompt execution / finalization` 三段。
- 再开始处理 renderer 的 `App.tsx` 和 `AssistantThreadPanel.tsx`，让前端也完成同样的 composition root 收口。
