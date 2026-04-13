# Main Process IPC 分组拆分（第三步）

> 时间：2026-04-12 17:10:00
> 触发原因：继续把 `src/main/index.ts` 从领域细节里解耦，尽量只保留 chat/agent 主链和应用装配。
> 本次变更：
> - 新增 `src/main/ipc/providers.ts`，承载 providers 与 models 相关 IPC。
> - 新增 `src/main/ipc/workbench.ts`，承载 terminal、git、ui 状态相关 IPC。
> - 更新 `src/main/index.ts`，改为通过 `registerProvidersIpc()` 与 `registerWorkbenchIpc()` 挂载对应 handler。
> 为什么这样改：providers/models、terminal/git/ui 都是天然成组的领域面；先拆这些低风险域，能让 `index.ts` 更聚焦于 app boot 和 chat 主链。
> 涉及文件：`src/main/index.ts`、`src/main/ipc/providers.ts`、`src/main/ipc/workbench.ts`

## 本轮结果

- `src/main/index.ts` 现在主要剩下：chat send 主流程、agent cancel/confirm、session/group/file 这几组仍在主文件的链路。
- `settings / providers / workspace / terminal / git / ui / window` 已经全部有独立 IPC 模块承载。
- 主进程装配层已经明显收口，后续可以单独对 chat 主链做更细拆分，而不和其它领域搅在一起。

## 下一步建议

- 优先拆 `session + group + files` 这组基础 IPC。
- 最后单独处理 `chatSend`、`agentCancel`、`agentConfirmResponse`，把复杂执行链路单独收编成 chat domain。
