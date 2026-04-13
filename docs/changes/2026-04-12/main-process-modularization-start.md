# Main Process 编排层拆分起步

> 时间：2026-04-12 16:52:00
> 触发原因：按本轮架构审视开始落地 P1，先收 `src/main/index.ts` 的装配边界。
> 本次变更：
> - 新增 `src/main/window.ts`，把窗口创建、窗口状态计算、legacy userData 迁移集中到窗口模块。
> - 新增 `src/main/ipc/handle.ts`，把 `ipcMain.handle` 的统一错误包裹抽成通用 helper。
> - 新增 `src/main/bootstrap/services.ts`，把后台服务启动/停止从 `index.ts` 抽离。
> - 更新 `src/main/index.ts`，改为只负责主流程装配与领域 IPC 注册，不再内嵌窗口实现和通用 IPC helper。
> 为什么这样改：当前 `index.ts` 过厚，既负责 app composition，又承载窗口实现和基础 helper；先把稳定、低风险、与聊天主流程解耦的部分拆出去，降低后续继续拆 chat/session/workspace IPC 的阻力。
> 涉及文件：`src/main/index.ts`、`src/main/window.ts`、`src/main/ipc/handle.ts`、`src/main/bootstrap/services.ts`

## 本轮结果

- `src/main/index.ts` 从“窗口实现 + helper + 启动编排 + IPC 注册”的混合文件，收成“启动编排 + IPC 装配”为主。
- 窗口逻辑已经有独立模块承载，后续如果继续拆 `window IPC` 或多窗口策略，不需要再挤回 `index.ts`。
- 后台服务启动顺序已有单独落点，后续可继续扩展为更完整的 bootstrap 层。

## 后续建议

- 下一步优先继续拆 `chat / session / workspace / settings` 这几组 IPC 注册。
- 再往后拆 renderer 的 `App.tsx` 和 `AssistantThreadPanel.tsx`，保持前后端都朝 composition root 收口。
