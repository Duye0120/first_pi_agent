# 2026-04-07 15:45 Harness Runtime Baseline

## 本次做了什么

- 新增 `src/main/harness/` 目录，开始把 Harness 从概念收口成独立模块
- 新增运行时类型：`run state / policy decision / audit event`
- 新增 `HarnessRuntime`，把主进程里分散的 run 生命周期管理抽离出来
- 新增 `audit.log` 追加写入模块，开始为后续审计留入口
- 新增工具策略评估骨架，为后面接 `allow / confirm / deny` 做准备
- 把 `src/main/index.ts` 里的 `pendingChatRequests` 迁到 `HarnessRuntime`
- 补了取消中的旧 run 被新 run 顶掉时的索引清理，避免残留脏 run

## 为什么这么做

- 之前 `run` 管理散在 `src/main/index.ts` 里，容易继续把状态机、取消、策略、执行混写
- 先把 Harness 抽成独立层，后面接确认流、审计、工具准入时才不会继续串层
- 对 React 视角来说，这一步相当于先把“执行状态容器”和“副作用闸门”拆出来，再往里接业务

## 这次涉及文件

- `src/main/index.ts`
- `src/main/harness/types.ts`
- `src/main/harness/runtime.ts`
- `src/main/harness/audit.ts`
- `src/main/harness/policy.ts`

## 当前还没做

- 还没把工具真正接到 `policy -> confirm -> allow / deny`
- 还没做 `awaiting_confirmation` 持久化
- 还没做 UI 侧确认弹层
- 还没做 `audit.log` 查询和展示

## 下一步

- 让 `shell_exec / file_write / mcp_*` 真正经过 Harness Policy
- 把 `confirmResponse` 链路接通
- 给 run 加可恢复的 approval 状态
