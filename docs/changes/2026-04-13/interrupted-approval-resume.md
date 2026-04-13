# Interrupted Approval Resume

> 时间：2026-04-13 18:09:00
> 本次变更：为 `Chela` 的中断审批恢复链路补上真正的“恢复执行”，让用户在应用重启后可以直接从审批 notice 自动拉起新的恢复 run，而不是手动把恢复提示重新发一遍。
> 触发原因：当前中断审批只提供“知道了”和“填入输入框”，恢复上下文虽然保留下来了，但仍需要用户手工再发送一次，恢复成本偏高。

## 本轮改了什么

- 更新 `HarnessRuntime` 的中断审批恢复能力
  - `hydrateFromDisk()` 产出的中断审批记录改为 `canResume: true`
  - 新增 `resumeInterruptedRun()`，为恢复流程分配新的 runId，并把原始 runId / approval requestId / 中断时状态写入新 run 的审计 metadata
  - `createRun()` 会在真正创建新 run 时消费这份恢复 metadata，避免改动现有 chat prepare / execute / finalize 主流程
- 接通恢复执行 IPC
  - `src/main/harness/approvals.ts` 对外暴露 `resumeInterruptedApproval()`
  - `src/main/ipc/harness.ts` 注册 `agent:resume-interrupted-approval`
  - `src/preload/index.ts` 暴露 `desktopApi.agent.resumeInterruptedApproval()`
- 更新前端恢复交互
  - `App.tsx` 增加 resume 回调并继续保留原有 dismiss 刷新链路
  - `AssistantThreadPanel.tsx` 为下一次自动发送预留后端返回的新 runId
  - `thread.tsx` 在中断审批 notice 中新增仅在 `canResume` 为真时显示的“恢复执行”按钮
  - 点击“恢复执行”后会自动写入 recovery prompt、立即走现有 composer 发送通道、发送成功后再 dismiss notice；“填入输入框”保留为手动恢复备选方案
- 完成类型校验
  - 执行 `npx tsc --noEmit --pretty false`

## 为什么这么改

- 恢复执行本质上是“带着恢复上下文创建一个新的聊天 run”，不是复用旧 runId；这样更符合审计和 run 生命周期管理。
- 继续复用前端现有 composer 发送通道，可以保住流式事件订阅、思考展示、run 状态提示这些现成能力。
- 把原始中断 run 的关键信息压进新 run metadata，后续排查恢复链路时能直接看到“这次恢复是从哪条中断审批接上的”。

## 涉及文件

- `src/main/harness/runtime.ts`
- `src/main/harness/approvals.ts`
- `src/main/ipc/harness.ts`
- `src/preload/index.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-04-13/interrupted-approval-resume.md`
