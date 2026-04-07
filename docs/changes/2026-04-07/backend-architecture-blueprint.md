# 2026-04-07 16:03 Backend Architecture Blueprint

## 本次做了什么

- 新增 `docs/backend-architecture-blueprint.md`
- 把当前后端按 `Adapter -> Harness -> Agent -> Ports -> Data` 重新整理
- 明确区分了：
  - 已定
  - 暂定
  - 待定
- 统一列出核心对象：`Session / Run / Step / Approval / AuditEvent`
- 把当前没处理完的问题和推荐顺序写清

## 为什么现在做这件事

- 当前功能已经开始进入 Harness 细节，如果总图不封住，后面很容易继续写偏
- 你更熟 React，所以这份蓝图刻意用了“状态 / 副作用 / 闸门 / 留痕”的视角来讲
- 这一步不是停工，而是防止后面出现大返工

## 这次不做什么

- 不继续加新功能
- 不继续深化 approval 恢复实现
- 不继续扩 memory / RAG

## 下一步建议

- 先定 approval 的完整模型
- 再把 session/run 关联补稳
- 最后再继续推进具体功能实现
