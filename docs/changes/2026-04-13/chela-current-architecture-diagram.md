# Chela 当前架构图

> 时间：2026-04-13 16:33:48
> 本次变更：基于仓库当前实现和 `code-review-graph` 的 community / flow 结果，为 `Chela` 生成一张当前架构图 SVG。
> 触发原因：用户希望直接用 `fireworks-tech-graph` 为 `Chela` 输出当前架构图，方便后续围绕真实边界做架构优化。

## 本轮改了什么

- 新增 `docs/diagrams/chela-current-architecture.svg`
  - 画出 `Renderer → Preload → Main Process → Providers / MCP / Persistence` 主分层
  - 标出 `Agent Core`、`Context Engine`、`Harness Runtime`、`Tool Pool`、`Session Store`、`Memory System`
  - 右侧补充外部依赖和持久化存储
  - 底部补充当前由 `code-review-graph` 提示的主要耦合热点
- 执行 SVG 结构校验
  - 使用 XML 解析确认文件语法可读

## 为什么这么改

- 当前 `Chela` 已经有明显的多层结构，直接画出当前边界更方便做后续架构收敛。
- 这张图优先表达运行时分层和关键链路，适合讨论重构方向。
- 把图落到 `docs/diagrams` 后，后面每次做架构收敛都可以增量更新。

## 涉及文件

- `docs/diagrams/chela-current-architecture.svg`
- `docs/changes/2026-04-13/chela-current-architecture-diagram.md`
