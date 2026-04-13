# Main Process IPC 分组拆分（第二步）

> 时间：2026-04-12 17:02:00
> 触发原因：继续按 P1 收缩 `src/main/index.ts`，把低耦合领域 IPC 从主文件拆出。
> 本次变更：
> - 新增 `src/main/ipc/settings.ts`，承载 settings 与日志相关 IPC。
> - 新增 `src/main/ipc/workspace.ts`，承载 workspace 选择、Soul 状态、打开目录等 IPC。
> - 新增 `src/main/ipc/window.ts`，承载窗口状态、最小化、最大化、关闭 IPC。
> - 更新 `src/main/index.ts`，改为通过 `registerSettingsIpc()`、`registerWorkspaceIpc()`、`registerWindowIpc()` 挂载对应 handler。
> 为什么这样改：这三组 IPC 的行为边界清晰、依赖稳定，先拆可以继续把 `index.ts` 压回 composition root，而不提前碰复杂的 chat 主链。
> 涉及文件：`src/main/index.ts`、`src/main/ipc/settings.ts`、`src/main/ipc/workspace.ts`、`src/main/ipc/window.ts`

## 本轮结果

- `settings / workspace / window` 三组 handler 已不再内嵌在 `index.ts`。
- `index.ts` 更接近“领域注册中心”，后续继续拆 `providers / models / terminal / git / chat` 会更顺。
- 这轮仍然保持行为不变，只调整落位和编排层次。

## 下一步建议

- 优先继续拆 `providers + models`，它们天然是一组。
- 再拆 `terminal + git + ui`。
- 最后单独处理 `chatSend / agentCancel / confirmResponse` 这组高耦合主链路。
