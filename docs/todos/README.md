# Chela TODO 索引

最后更新：2026-04-25

本目录用于沉淀「想做但没做」的事项；正在执行的计划仍放在 `docs/plans/`，已落定的设计放在 `specs/`。
本索引按优先级聚合各来源（plan、spec、AGENTS 约束、讨论稿），同一条事项不重复落地点，只指向源文档。

---

## 🔥 P0 — 致命/数据安全/崩溃风险（来自 full-project-audit）

源：[../plans/full-project-audit-2026-04-22.md](../plans/full-project-audit-2026-04-22.md) （6 条）

- terminalEventFlushed 缺陷
- session 并发写入
- 窗口销毁后 send
- 路径白名单绕过
- PowerShell 注入
- API Key 泄露

> 行动：按 audit 文件的 P0 章节逐条修。

---

## ⚠️ P1 — 严重（资源/契约/竞态，13 条）

源：[../plans/full-project-audit-2026-04-22.md](../plans/full-project-audit-2026-04-22.md)

主要类型：EventBus 监听泄漏、取消语义重复、Failover 重复初始化、IPC 序列化失败、gitPull 死链、DevTools 生产可开、render 订阅泄漏、session 竞态、闭包风险。

---

## 💬 聊天主线修复

源：[../critical-chat-fixes-plan.md](../critical-chat-fixes-plan.md)

- **P0-1 代理**：`network.proxy` 配置 + settings 深合并 + 全局 dispatcher
- **P0-2 Failover**：prepare 阶段 `resolveWithFailover` 收口，execute 阶段 provider/network failover
- **P0-3 学习注入**：`prompt-control-plane` 新增 learnings layer
- **P1 会话搜索**：新建 `src/main/session/search.ts`，索引 session.json / transcript.jsonl / context-snapshot.json
- **P2-1 模型切换**：下一条消息按新模型重建 handle（非 mid-turn 热切）
- **P2-2 引导**：`pendingRedirectDraft` 队列化，run 结束自动补发 follow-up

---

## 🧠 记忆 / RAG 系统

### 工程实施（待执行）
源：[../plans/memory-rag-implementation.md](../plans/memory-rag-implementation.md)

- Phase 1 基础设施（依赖 + electron-builder 原生模块配置） ← 部分已做（better-sqlite3 已重建）
- Phase 2 EmbeddingService 单例 + worker_threads 隔离 ← 已做
- Phase 3 SQLite 表结构、批量写入优化 ← 已做
- Phase 4 search 实现、余弦相似度、Query 缓存 ← 已做
- Phase 5 ipcMain.handle 注册 ← 已做
- **剩余**：embedding 对接 Ollama 已上线，需回归 + 写入率监控

### 信号驱动记忆（设计中）
源：[memory-system-signal-driven.md](memory-system-signal-driven.md)

把"我得记下来"收敛到 4 类信号通道（情绪冲击 / 预测违背 / 重复出现 / 显式标记），统一走候选事件总线 + 可学习评分器。落地优先级：
1. 抽 `MemoryCandidateBus`
2. 改造 `active-learning` 为订阅者
3. 加 ExplicitMarker（ROI 最高）
4. 加 EmotionalSpike → candidate
5. 加 PredictionMismatch
6. UI 删除即降权

### 偏好观察 + 向量检索（评审中）
源：[../memory-rag-upgrade-spec.md](../memory-rag-upgrade-spec.md)

- Phase 1 用户偏好观察器（明确否定 / 明确偏好 / 重复纠正 / 工作流约定 / 情感信号）
- Phase 2 Nowledge Mem 向量检索集成（混合检索）
- Phase 3 动态 RAG 检索链路（意图识别器）

---

## 📐 Spec 未完成（部分落地）

源：[../../specs/README.md](../../specs/README.md)

| Spec | 状态 | 主要未落地点 |
|---|---|---|
| [07 memory-architecture](../../specs/07-memory-architecture.md) | in-review | T1 向量检索完整集成、T1-T2 在 context 层的混合注入 |
| [09 rag-and-embedding](../../specs/09-rag-and-embedding.md) | in-review | Ollama/OpenAI fallback 完整兼容、降级运行模式、向量存储查询优化 |
| [16 extensibility-architecture](../../specs/16-extensibility-architecture.md) | draft | Plugin Loader、OAuth、External API Adapters、Workflow 编排 |

其余 13 个 spec：`in-review` + baseline 已落地。

---

## 🌐 浏览器预览 / DOM Inspector

源：[../browser-preview-dom-inspector-spec.md](../browser-preview-dom-inspector-spec.md)

- Phase 2 Inspector Content Script
- Phase 3 Tiptap Tag/Mention 集成

---

## 🎨 UI 改造

源：`docs/superpowers/plans/2026-04-01-ui-redesign.md`（如存在）

- Task 1-14 分阶段实施（archive 层、组件、样式统一）
- 依赖 design spec 中的精确数值（字号、间距、圆角）

### AGENTS.md 约束的违反项（需回归）
- branch-switcher 未走缓存
- context 圆环缺失「0% 灰环」状态
- approval 卡片错误文案泄露内部 ID（sessionId / runId / payloadHash）

---

## 🏗 架构细节待定

源：[../backend-architecture-blueprint.md](../backend-architecture-blueprint.md)（L2.3）

- approval 单独怎么存
- awaiting_confirmation 恢复到 UI 的协议
- transformContext 最终接口设计
- 手动 compact 的触发协议与回放语义
- session memory snapshot 字段结构与刷新时机
- memory_search / RAG / embedding 接进 Agent Core 的方案
- run 级别数据存储位置（session 内 vs 单独拆 `runs/`）

---

## 🔁 Agent Core

源：[../../specs/03-agent-core.md](../../specs/03-agent-core.md) L382

- 中断审批：当前能恢复状态，**真正恢复执行**仍未完成

---

## 索引说明

- **本索引**：只列条目 + 指源文件，不重复细节
- **新增 todo**：直接在本目录新建 `<topic>.md`，并在本索引追加链接
- **完成项**：从源文档勾掉的同时，删除本索引对应行
- **优先级**：跟随源文档，不在此处重新评定（避免双重事实）
