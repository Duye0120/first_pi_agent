# Main Process IPC 分组拆分（第四步）

> 时间：2026-04-12 17:18:00
> 触发原因：继续压缩 `src/main/index.ts`，把基础域 IPC 全部移出主文件，给 chat domain 留出单独收口空间。
> 本次变更：
> - 新增 `src/main/ipc/files.ts`，承载文件选择、预览、图片数据、剪贴板保存 IPC。
> - 新增 `src/main/ipc/sessions.ts`，承载 session、group、context summary / compact IPC。
> - 更新 `src/main/index.ts`，改为通过 `registerFilesIpc()` 与 `registerSessionsIpc()` 装配这些基础域 handler。
> 为什么这样改：files 与 sessions/groups/context 都属于稳定基础域，继续留在 `index.ts` 只会淹没真正复杂的 chat/agent 主链；先拆掉这些低风险域，下一步单独收 chat 会更清楚。
> 涉及文件：`src/main/index.ts`、`src/main/ipc/files.ts`、`src/main/ipc/sessions.ts`

## 本轮结果

- `src/main/index.ts` 已基本只剩：chat send、agent cancel、approval confirm，以及 app boot / lifecycle 装配。
- 主进程其余常规领域 IPC 已全部有独立模块承载。
- 这为下一步把 chat domain 独立成 `ipc/chat.ts` 或 `domains/chat/*` 打好了边界。

## 下一步建议

- 下一刀直接拆 `chatSend + agentCancel + confirmResponse`，把 chat domain 单独成模块。
- 拆 chat 时顺手把 prompt-too-long 重试、max_tokens 续写、run transcript 收口也一并收进去。
