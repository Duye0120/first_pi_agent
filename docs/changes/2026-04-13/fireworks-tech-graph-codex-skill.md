# Codex 接入 fireworks-tech-graph

> 时间：2026-04-13 16:12:00
> 本次变更：把 `fireworks-tech-graph` 以本地 Codex skill 的方式接入，落到 `C:\Users\Administrator\.codex\skills\fireworks-tech-graph`。
> 触发原因：用户希望把这个仓库也集成到 Codex 里，方便后续直接让 Codex 生成技术架构图和流程图。

## 本轮改了什么

- 新增 `C:\Users\Administrator\.codex\skills\fireworks-tech-graph\SKILL.md`
  - 写入本地可用的技能说明
  - 收入口令触发词、图类型、样式、形状语义、SVG 输出约束
- 新增 `C:\Users\Administrator\.codex\skills\fireworks-tech-graph\README.md`
  - 记录上游仓库地址和本地用途

## 为什么这么改

- 当前 shell 里的 `git` / `npx skills add` 网络链路和 Node 运行链路都不稳定。
- 先把核心技能内容落成本地 skill，Codex 就能识别并使用这项能力。
- 这个能力更像 prompt workflow 和图形输出规范，本地 skill 形态已经能覆盖主要使用场景。

## 涉及文件

- `C:\Users\Administrator\.codex\skills\fireworks-tech-graph\SKILL.md`
- `C:\Users\Administrator\.codex\skills\fireworks-tech-graph\README.md`
- `docs/changes/2026-04-13/fireworks-tech-graph-codex-skill.md`
