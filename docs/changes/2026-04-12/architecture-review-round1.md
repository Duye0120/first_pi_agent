# Chela 架构审视（第一轮）

> 时间：2026-04-12 16:27:46
> 触发原因：用户要求梳理当前项目架构，并判断是否还有值得升级的地方。
> 本次变更：补充一份基于当前代码与文档的架构审视记录，明确现状、主要风险和建议的升级顺序。
> 涉及文件：`src/main/index.ts`、`src/main/agent.ts`、`src/main/harness/runtime.ts`、`src/main/harness/tool-execution.ts`、`src/main/context/service.ts`、`src/main/session/service.ts`、`src/preload/index.ts`、`src/renderer/src/App.tsx`、`src/renderer/src/components/AssistantThreadPanel.tsx`、`src/main/prompt-control-plane.ts`、`specs/01-overview.md`

---

## 结论摘要

当前主架构已经不是“散装 demo”，而是比较清晰的四段式主链：

`Electron Shell / IPC Adapter -> Harness Runtime -> Agent Core + Context Engine -> Persistence & Capability Ports`

已经成型的部分：

- `Harness Runtime` 已经独立成层，负责 run 生命周期、审批等待、审计和活动 run 恢复。
- `Agent Core` 已经收敛到 `src/main/agent.ts`，负责模型装配、工具池装配、prompt 组装与 context hook。
- `Transcript Persistence` 已经独立成 `session.json + transcript.jsonl + context-snapshot.json`。
- `Context Engine` 已经独立承担 snapshot、manual/auto compact、预算淘汰。

还值得优先升级的点，不在“再发明一层”，而在“继续收边界、减耦合、清理重复入口”。

---

## 这轮观察到的 4 个主要升级点

### 1. Main Process 装配层过厚

`src/main/index.ts` 现在同时承担：

- Electron app 生命周期
- BrowserWindow 创建
- IPC 注册
- chat send 主流程
- settings / providers / workspace / terminal / git / window 等多个子域装配
- 各类后台服务初始化

文件体量已到 `800+` 行，说明它已经不只是 composition root，也承担了过多具体编排责任。

建议：

- 保留 `index.ts` 作为 app composition root
- 把 IPC 注册按领域拆为 `ipc/chat.ts`、`ipc/session.ts`、`ipc/settings.ts`、`ipc/workspace.ts`、`ipc/window.ts`
- 把后台服务启动拆成 `bootstrap/*.ts`

目标不是“拆小而拆小”，而是让 `index.ts` 只回答两件事：**应用怎么启动**、**模块怎么挂起来**。

### 2. Renderer Shell 仍然过于集中

`src/renderer/src/App.tsx` 已经同时处理：

- shell layout
- boot 流程
- session 列表与缓存
- settings 路由
- context summary 刷新
- git 分支 / diff 状态
- sidebar / diff / terminal 多面板联动

文件体量已到 `1400+` 行；`src/renderer/src/components/AssistantThreadPanel.tsx` 也有 `700+` 行，里面还包含 assistant-ui runtime 适配、run feedback、事件消费和聊天发送编排。

建议：

- `App.tsx` 下沉为 `useShellBootstrap`、`useSessionWorkspace`、`useGitDiffPanel` 这类 hooks
- `AssistantThreadPanel.tsx` 再拆为 `useAssistantRunRuntime` + `ThreadPresenter`
- 保持 renderer 继续做“状态投影层”，但减少单文件超级容器

### 3. 前端存在旧路径转发层，结构可读性一般

当前 renderer 同时存在：

- `src/renderer/src/components/assistant-ui/*`
- `src/renderer/src/components/*`
- `src/renderer/src/components/ui/*`

其中一部分文件只是 re-export 转发，例如：

- `src/renderer/src/components/assistant-ui/assistant-thread-panel.tsx`
- `src/renderer/src/components/Sidebar.tsx`
- `src/renderer/src/components/TitleBar.tsx`
- `src/renderer/src/components/TerminalDrawer.tsx`

这不一定是 bug，但会让“真实实现在哪”变得不够直观，也增加后续迁移时的心理负担。

建议：

- 明确一套稳定目录：`app-shell` / `assistant-ui` / `ui primitives`
- 对纯转发文件做一次梳理：要么保留为明确兼容层，要么逐步删掉
- 文档里明确哪些是 legacy import path，避免继续长新代码到旧入口

### 4. 审批恢复链在 Runtime 有骨架，但 Renderer 交互面还没长出来

现在已经有：

- `HarnessRuntime.getInterruptedApprovals()`
- `HarnessRuntime.dismissInterruptedApproval()`
- `awaiting_confirmation` 持久化恢复语义
- `preload` 暴露了 `agent.confirmResponse`

但 renderer 侧目前没有真正消费：

- `interrupted approvals`
- `agent.confirmResponse`
- renderer 内嵌确认 UI

当前确认仍主要走 `dialog.showMessageBox`。

这说明系统的“恢复语义”已经开始有后端骨架，但前端还没把它变成完整产品能力。

建议：

- 把 approval 升成明确的 renderer read model
- Settings 或线程区增加“待确认动作恢复”入口
- 再逐步从原生 dialog 过渡到内嵌确认 UI

---

## 另外两个需要顺手收口的问题

### A. 产品命名与旧 spec 还没完全统一

当前代码已经用 `Chela`，但仍有文档和 prompt 残留：

- `specs/01-overview.md` 仍写 `Pi Desktop Agent`
- `src/main/prompt-control-plane.ts` 里仍写“你是 Pi”

这不影响运行，但会影响对外叙事和长期一致性，后续建议顺手清一轮。

### B. 文档对“已实现 / 未实现”的描述有部分滞后

例如早期蓝图里把 Event Bus 视为缺失，但代码里 `src/main/event-bus.ts` 已经存在并接到 run / tool / approval 链路。

建议把“蓝图文档”和“当前实现状态”再校一次，避免后面讨论时出现“文档说没做，代码其实已经有”的认知错位。

---

## 建议的升级顺序

### P1：先收编排层

1. 拆 `src/main/index.ts`
2. 拆 `src/renderer/src/App.tsx`
3. 拆 `src/renderer/src/components/AssistantThreadPanel.tsx`

### P2：再收确认恢复链

1. 给 approval 补 renderer read model
2. 补 interrupted approval surface
3. 再从 dialog 迁到内嵌确认 UI

### P3：最后清目录与命名

1. 清理纯 re-export 兼容壳
2. 统一 `Chela` 命名
3. 更新旧 spec 的“当前状态”

---

## 一句话判断

Chela 当前**不缺大架构重做**，更像是：

**主骨架已经对了，下一步该做的是“拆超级文件、补前端恢复面、清 legacy 入口”，而不是继续横向加概念层。**
