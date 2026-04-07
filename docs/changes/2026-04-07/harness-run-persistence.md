# 2026-04-07 16:25 Harness Run Persistence

## 本次做了什么

- 新增 `src/main/harness/store.ts`
- 把活动中的 Harness run 落盘到 `userData/data/harness-runs.json`
- `createRun / requestCancel / transitionState / finishRun` 现在都会同步刷新持久化快照
- 应用启动时会读取上次残留的未完成 run
- 当前版本不支持真正续跑，所以启动后会把这些残留 run 记一条审计并清空活动队列

## 为什么这么做

- 之前 Harness 只活在内存里，应用一关，run 状态就没了
- 这一步先保证“有迹可循”，哪怕还没做到真正恢复执行
- 对架构来说，这是把 Harness 从“进程内状态”推进到“可跨重启观察的运行时状态”

## 当前语义

- `harness-runs.json` 只存未结束的 run 快照
- run 一旦 `completed / aborted / failed`，就会从活动快照里删掉
- 如果应用异常退出，下一次启动仍然能知道上次卡在哪个状态
- 当前先采取保守策略：
  - 发现残留 run
  - 写审计日志
  - 标记为失败
  - 清空活动快照

## 为什么还不做真正续跑

- 真正续跑不只是“把状态读出来”这么简单
- 还涉及：
  - agent loop 恢复点
  - 待确认工具调用恢复
  - 原 toolCallId 对应的执行上下文恢复
  - UI 恢复确认入口

所以现在先做“持久化 + 启动对账”，再做“真正恢复”。

## 这次涉及文件

- `src/main/harness/runtime.ts`
- `src/main/harness/store.ts`
- `src/main/index.ts`
