# 可扩展性架构审计 + 设计方案

> 新增：2026-04-09 09:32:00

## 背景

用户希望把项目从"聊天工具"升级为"个人贾维斯 AI 平台"，需要更多的"插槽"来连接外部世界。

## 做了什么

1. 对昨晚的 overnight 改动做了全面审计（approval runtime chain 等 +231/-29）
2. 分析了当前架构的 8 个成型模块 vs 6 个缺失插槽
3. 编写了 `specs/16-extensibility-architecture.md` — 四层插槽设计方案
4. 更新了 `specs/README.md` — 新增第六层 spec 索引

## 核心发现

**已有能力层（✅ 不需要改）**：Harness、Prompt Control Plane、Memory、Provider、Context

**缺失的关键组件**：
- Event Bus（事件总线）— 所有插槽的脊梁骨
- Scheduler（定时任务）— 主动能力
- Webhook Receiver（外部事件入口）— 外部世界连入
- Plugin Loader（插件加载器）— 第三方能力
- Notification（通知出口）— Agent 主动通知

## 改动文件

- `specs/16-extensibility-architecture.md` — 新建
- `specs/README.md` — 更新索引

## 状态

方案状态 `draft`，待用户确认后再实施。
