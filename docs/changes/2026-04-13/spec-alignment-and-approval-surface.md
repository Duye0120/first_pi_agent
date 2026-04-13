# Spec 对齐与中断审批入口补齐

> 时间：2026-04-13 15:29:14
> 本次变更：把 `spec-03 / spec-02 / spec-14` 收成当前代码口径，并把已存在的 `interrupted approval` 后端能力真正露到线程 UI。
> 触发原因：当前主架构已经成型，用户希望先对齐实施基线，再沿着这份基线继续补全底层。

## 本轮改了什么

- 更新 `specs/README.md`
  - 把 specs 索引的产品名改到 `Chela`
- 更新 `specs/03-agent-core.md`
  - 明确当前基线已经拆成 `Harness Runtime / Agent Core / Context Engine / Transcript Persistence`
  - 把 `tool_call -> Harness -> capability ports -> Harness -> Agent` 写成正式主链
  - 把 `run memory / session memory / semantic memory` 的边界按当前实现收口
  - 补充当前缺口：中断审批恢复、workload profile、多模型路由
- 更新 `specs/02-adapter-layer.md`
  - 改成 Electron 当前实现口径
  - 明确 Adapter 负责桥接，不负责 run state machine
  - 写清中断审批当前先恢复成 notice，不直接恢复执行
- 更新 `specs/14-data-storage.md`
  - 存储根目录和产品名改到 `Chela`
  - 把 `interrupted-approvals.json` 纳入持久化版图
  - 把长期记忆存储改成当前真实实现 `MEMORY.md + topics/*`
  - 把 `defaultModel` 口径更新为 `defaultModelId`
- 更新线程 UI
  - 把已加载的 `interrupted approval groups` 传入线程组件
  - 在 composer 上方显示“上次待确认操作被重启中断”的 notice
  - 提供“知道了”操作，调用 `dismissInterruptedApproval` 后刷新当前线程 notice
  - 顺手把输入占位文案从旧称改为 `Chela`

## 为什么这么改

- 现有代码已经明显超出早期 spec 的抽象程度，继续沿用旧口径会让后续实现越写越飘。
- `spec-03` 之前更像设计说明，现在需要变成当前底层主链的实施基线。
- `interrupted approval` 后端已经存在，前端还没有清晰入口；这类“后端有、产品面没露”的缺口适合优先补。

## 涉及文件

- `specs/README.md`
- `specs/03-agent-core.md`
- `specs/02-adapter-layer.md`
- `specs/14-data-storage.md`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`

## 追加变更：审批恢复 read model 补全

> 时间：2026-04-13 15:48:32
> 本次变更：把中断审批记录从单纯 notice 扩展为带 run context 的恢复 read model，并在 UI 里展示审批类型、触发原因、detail、run id、模型和中断时间。
> 触发原因：底层需要先把“恢复现场可读”打通，后续再评估是否支持真正 resume。

### 改了什么

- 更新 `src/main/harness/types.ts`
  - 给 `InterruptedApprovalRecord` 增加 `modelEntryId / runKind / runSource / lane / state / startedAt / currentStepId / canResume / recoveryStatus`
- 更新 `src/main/harness/runtime.ts`
  - 从磁盘恢复到中断审批记录时写入 run context
- 更新 `src/main/harness/approvals-store.ts`
  - 读取 legacy 记录时补齐 `canResume=false` 和 `recoveryStatus=interrupted`
- 更新 `src/main/harness/approvals.ts`
  - 对外 read model 增加恢复上下文字段
  - 列表和分组里的审批记录按 `interruptedAt` 倒序排列
- 更新 `src/shared/contracts.ts`
  - 扩展 `InterruptedApprovalNotice` 契约字段
- 更新 `src/renderer/src/components/assistant-ui/thread.tsx`
  - notice 显示审批类型、触发原因、detail 和 run 元信息
  - 展示文案明确当前保留决策上下文

### 为什么这么改

- 当前阶段优先确保用户看得懂“上次卡在哪个审批、为什么要审批、对应哪个 run”。
- `canResume=false` 把当前产品行为固定为“保留现场 + 手动知晓”，为后续 resume 留出契约位置。

## 追加变更：恢复草稿入口

> 时间：2026-04-13 15:53:22
> 本次变更：给中断审批 read model 增加 `recoveryPrompt`，并在 notice 上提供“填入输入框”动作。
> 触发原因：底层当前具备中断现场读取能力，下一步需要给用户一个安全的继续入口，让重新发送继续走 Harness 审批链。

### 改了什么

- 新增 `src/shared/interrupted-approval-recovery.ts`
  - 集中生成中断审批恢复草稿
  - 草稿包含恢复原则、run context、审批原因和 detail
- 更新 `src/shared/contracts.ts`
  - `InterruptedApprovalNotice` 增加 `recoveryPrompt`
- 更新 `src/main/harness/approvals.ts`
  - main 侧生成 `recoveryPrompt` 后再暴露给 renderer
- 更新 `src/renderer/src/components/assistant-ui/thread.tsx`
  - notice 增加“填入输入框”
  - 点击后把恢复草稿写入 composer 并聚焦输入框
- 更新 `specs/03-agent-core.md`
  - 补充中断审批恢复策略
  - 明确当前阶段通过 recoveryPrompt 重新进入新的 chat run

### 为什么这么改

- 直接恢复原暂停点需要可恢复 waiter、Agent handle 暂停点和 transcript 串联能力一起到位。
- 当前先提供安全的人工继续入口，用户重新发送后继续经过 `Harness / Policy / Tool gate`。

## 追加变更：session 存储拆分第一刀

> 时间：2026-04-13 16:26:19
> 本次变更：按 code-review-graph 扫描结果，先拆 `session/service.ts` 的路径、基础 IO 和 transcript materialization helper。
> 触发原因：`session/service.ts` 是当前后端最大 community，且 `context-collect ↔ session-session` 存在 21 条高耦合边。

### 改了什么

- 新增 `src/main/session/paths.ts`
  - 集中管理 session data 目录、index、meta、transcript、snapshot、legacy 路径
- 新增 `src/main/session/io.ts`
  - 集中管理 `ensureDir / atomicWrite / appendLine / readJsonFile`
- 新增 `src/main/session/transcript.ts`
  - 集中管理 transcript 读取、坏行容错和 materialized message 计数/投影
- 更新 `src/main/session/service.ts`
  - 改为引用 `paths / io / transcript`
  - 保留原有对外 API 和业务流程

### 为什么这么改

- 先抽纯 helper，风险低，收益直接体现在 `session/service.ts` 职责收敛。
- 后续可以继续把 `append*Event` 和 `updateSessionMeta` 拆到 transcript writer，进一步降低 `adapter.ts` 对 session 大服务的依赖。

## 追加变更：session 存储拆分第二刀

> 时间：2026-04-13 16:42:22
> 本次变更：继续拆 `session/service.ts`，把 meta/index 存储和 transcript 写入 API 分离到独立模块。
> 触发原因：第一刀完成后，`service.ts` 仍同时承担 meta 读写、index 更新、事件写入和会话服务门面职责，需要继续压低 hub 复杂度。

### 改了什么

- 新增 `src/main/session/meta.ts`
  - 集中管理 `PersistedSessionMeta`、todo 类型、meta 归一化、meta 读写、index 更新和 `updateMeta`
- 新增 `src/main/session/transcript-writer.ts`
  - 集中管理 `appendTranscriptEvent` 和用户消息、run、tool、confirmation、compact 事件写入
- 更新 `src/main/session/service.ts`
  - 改为引用 `meta` 和 `transcript-writer`
  - 保留原有 session service 对外导出形状
  - `appendUserMessageEvent` 继续在 service 门面触发 storage ready，再委托 writer

### 为什么这么改

- `meta.ts` 承担 session 存储 read/write model，后续 context 层读取 session 状态时可以逐步收敛到更小接口。
- `transcript-writer.ts` 承担 append-only transcript 写入，adapter/chat/finalize 后续可以逐步从大 service 迁移到更明确的写入端口。
- `service.ts` 收敛为迁移、门面和会话 CRUD，降低后续拆 context/session 耦合时的碰撞面。
