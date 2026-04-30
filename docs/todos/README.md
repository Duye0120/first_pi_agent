# Chela TODO 索引

最后更新：2026-04-28（底层基建 Phase 1-6 已收口，下一阶段转入产品能力推进）

本目录用于沉淀「想做但没做」的事项；正在执行的计划仍放在 `docs/plans/`，已落定的设计放在 `specs/`。
本索引按优先级聚合各来源（plan、spec、AGENTS 约束、讨论稿），同一条事项不重复落地点，只指向源文档。

---

## 🧱 底层基建完善路线图

源：[foundation-hardening-roadmap.md](foundation-hardening-roadmap.md)

执行顺序：
- [x] Phase 1：环境 Doctor
- [x] Phase 2：IPC 契约校验
- [x] Phase 3：Memory 管理闭环
- [x] Phase 4：Provider / 模型目录稳定性
- [x] Phase 5：Harness / 长任务恢复
- [x] Phase 6：插件 / 扩展底座

目标：底层基建路线已完成第一轮闭环，后续重点转入 Browser Preview / DOM Inspector、Agent Core 真恢复、记忆信号驱动和 UI 回归稳定。

---

## 🔥 P0 — 致命/数据安全/崩溃风险（来自 full-project-audit）✅ 全部已修复

源：[../plans/full-project-audit-2026-04-22.md](../plans/full-project-audit-2026-04-22.md) （6 条，全部修完）

- ~~terminalEventFlushed 缺陷~~ → 已改为 `Set<runId>`
- ~~session 并发写入~~ → 已加 `withSessionWriteLock` 互斥
- ~~窗口销毁后 send~~ → `adapter.ts` + `terminal.ts` 已包 try/catch
- ~~路径白名单绕过~~ → 已用 `fs.realpathSync.native`
- ~~PowerShell 注入~~ → 已用 argv 数组 + 换行归一化
- ~~API Key 泄露~~ → getter 闭包 + logger 递归脱敏

---

## ⚠️ P1 — 严重 ✅ 已完成

源：[../plans/full-project-audit-2026-04-22.md](../plans/full-project-audit-2026-04-22.md)

已修复（13/13）：
- ~~M4 EventBus 监听泄漏~~、~~M5 cancel 幂等~~、~~M6 failover 重复初始化~~、~~M8 gitPull 死链路~~、
  ~~R6 context 0% 灰环~~、~~R7 approval 卡片泄露 ID~~、~~M7 IPC handler 错误结构化~~、
  ~~M9 生产环境开启 renderer sandbox~~、~~R5 branch-switcher 缓存改为组件实例级 useRef~~

补充验证：
- `agent.onEvent` 订阅在 run cleanup、结束后补事件、组件卸载时都会清理。
- `activeSessionIdRef` 在 hydrate 时同步更新，降低切 session 与持久化交错风险。
- provider directory 已有 abort + timeout + cache；`foundation-regression.test.ts` 覆盖超时和缓存复用。

---

## 💬 聊天主线修复 ✅ 基本完成

源：[../critical-chat-fixes-plan.md](../critical-chat-fixes-plan.md)

- ~~P0-1 代理~~ → `src/main/network/proxy.ts` 完整实现
- ~~P0-2 Failover~~ → prepare + execute 双层 failover + 退避重试
- ~~P0-3 学习注入~~ → `buildLearningsSection()` 读 memdir learnings topic
- ~~P1 会话搜索~~ → `src/main/session/search.ts` 307 行，IPC 已接线
- ~~P2-1 模型切换~~ → 文档收口完成
- ♻️ P2-2 引导 → 已被 `queuedMessages` 机制替代，`pendingRedirectDraft` 仅保留做兼容迁移

---

## 🧠 记忆 / RAG 系统

### 工程实施 ✅ 完成，3 条收尾
源：[../plans/memory-rag-implementation.md](../plans/memory-rag-implementation.md)

- ~~Phase 1-5~~ → `embedding.ts`（worker_threads）、`store.ts`（SQLite）、`retrieval.ts`（余弦相似度 + 缓存）、IPC 注册 全部完成
- ~~spec 07 / 09 对齐当前 SQLite + embedding worker 实现~~ ✅
- **剩余**：原生依赖 ABI 重建流程、embedding 真实 provider 回归、写入率监控

### 信号驱动记忆（全部未开始）
源：[memory-system-signal-driven.md](memory-system-signal-driven.md)

- [ ] 抽 `MemoryCandidateBus`（`src/main/memory/candidate-bus.ts`）
- [ ] 改造 `active-learning` 为订阅者
- [ ] 加 ExplicitMarker（ROI 最高）
- [ ] 加 EmotionalSpike → candidate
- [ ] 加 PredictionMismatch
- [ ] UI 删除即降权

### 偏好观察 + 向量检索（评审中）
源：[../memory-rag-upgrade-spec.md](../memory-rag-upgrade-spec.md)

- Phase 1 用户偏好观察器（明确否定 / 明确偏好 / 重复纠正 / 工作流约定 / 情感信号）
- Phase 2 Nowledge Mem 向量检索集成（混合检索）
- Phase 3 动态 RAG 检索链路（意图识别器）

---

## 📐 Spec 未完成

源：[../../specs/README.md](../../specs/README.md)

| Spec | 状态 | 主要未落地点 |
|---|---|---|
| [07 memory-architecture](../../specs/07-memory-architecture.md) | in-review | 已对齐当前 T0/T1/T2 baseline；后续补记忆管理 UI |
| [09 rag-and-embedding](../../specs/09-rag-and-embedding.md) | in-review | 已对齐当前 SQLite + embedding worker；后续补 provider 自动探测、降级 UI、native rebuild 指引 |
| [16 extensibility-architecture](../../specs/16-extensibility-architecture.md) | draft | Plugin Loader、OAuth、External API Adapters、Workflow 编排 **完全未开始** |

其余 13 个 spec：`in-review` + baseline 已落地。

---

## 🌐 浏览器预览 / DOM Inspector ❌ 未开始

源：[../browser-preview-dom-inspector-spec.md](../browser-preview-dom-inspector-spec.md)

- 仅 spec 存在，代码完全未开始

---

## 🎨 UI 改造（待逐项验证）

源：`docs/superpowers/plans/2026-04-01-ui-redesign.md`

- Task 1-14 分阶段实施（archive 层、组件、样式统一）
- 依赖 design spec 中的精确数值（字号、间距、圆角）

### AGENTS.md 约束的违反项（3/3 已修复）
- ~~context 圆环缺失「0% 灰环」状态~~ ✅
- ~~approval 卡片错误文案泄露内部 ID~~ ✅
- ~~branch-switcher 未走缓存~~ ✅ 组件实例级 `useRef` 缓存

---

## 🏗 架构细节待定 ✅ 大部分已落地

源：[../backend-architecture-blueprint.md](../backend-architecture-blueprint.md)（L2.3）

- ~~approval 存储格式~~ → `interrupted-approvals.json`
- ~~awaiting_confirmation 恢复协议~~ → `HarnessRunState` + transcript events
- ~~transformContext 接口~~ → `createTransformContext()` 已定义
- ~~手动 compact 触发协议~~ → `compactSession()` + IPC handler
- ~~session memory snapshot 字段结构~~ → `contracts.ts` 完整定义
- memory_search / RAG / embedding 接进 Agent Core 的方案
- run 级别数据存储位置（session 内 vs 单独拆 `runs/`）

---

## 🔁 Agent Core

源：[../../specs/03-agent-core.md](../../specs/03-agent-core.md) L382

- ⚠️ 中断审批：`recoveryPrompt` + `canResume` 已有，"真正恢复执行"仍未完成

---

## 索引说明

- **本索引**：只列条目 + 指源文件，不重复细节
- **新增 todo**：直接在本目录新建 `<topic>.md`，并在本索引追加链接
- **完成项**：从源文档勾掉的同时，删除本索引对应行
- **优先级**：跟随源文档，不在此处重新评定（避免双重事实）
