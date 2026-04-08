# 2026-04-08 15:56 Prompt Control Plane Baseline

## 本次做了什么

- 新增 `docs/prompt-control-plane.md`，把 prompt 分层方案收成单独文档
- 明确了 `Platform Constitution / Workspace Policy / Runtime Capability Manifest / Semantic Memory / Session Continuity Snapshot / Turn Intent Patch` 六层
- 补清了“prompt 负责指导，Harness 负责边界”的职责分工

## 为什么改

- 之前项目已经有 `T0 + session snapshot + future T1 hook` 的主干
- 但 prompt 侧还停留在“几段字符串拼起来”，没有把每层职责说死
- 如果现在不先定文档，后面继续接 memory、compact、sub-agent 时很容易把长期规则、线程续接和本轮临时要求又炖回一锅

## 涉及文件

- `docs/prompt-control-plane.md`

## 验证

- `2026-04-08 15:56:51` 人工核对当前代码与文档映射：
- `src/main/agent.ts`
- `src/main/soul.ts`
- `src/main/context/service.ts`
- `src/main/memory/service.ts`

## 说明

- 这轮只定架构文档，不改代码
- 后续实现优先补 `Prompt Assembler`，再拆 `Turn Intent Patch` 和独立 `Runtime Capability` 层
