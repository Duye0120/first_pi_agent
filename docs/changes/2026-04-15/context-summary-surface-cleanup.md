> 时间：2026-04-15 14:09:00

# Context 摘要浮层收敛

## 本次改动

- 收敛聊天区底部 `context` 圆环的 hover 摘要和 click 展开面板，避免直接展示 `snapshotSummary`、`openLoops`、`nextActions`、`risks` 这类内部续接文案。
- 把展开面板改成围绕 `context` 预算、`compact` 状态、续接快照状态的说明卡片，保留手动 `Compact` 入口。
- 新增 `compactedMessageCount` 统计，面板改为直接展示“已整理多少条历史消息”和“还能不能继续 compact”。
- 修正 hover / 展开浮层的外层宽度与内容宽度不一致，恢复右侧 padding，避免文案贴边和裁切。
- 去掉 `续接状态` 区块里的解释性描述，并把标题改成 `Compact 结果`，避免面向 AI 的术语直接暴露给用户。
- 删除 `Compact 结果` 里的状态描述行，只保留硬信息，避免出现“当前已收好”这类拟人化文案。
- 顶部状态改成两行显示 `已用` 和 `剩余`；下半部分把 `Context / Compact / tokens` 等中英文混排统一收成纯中文。
- 收口兜底文案里的 `usage` 英文残留，统一改成中文表述。
- 删除底部状态栏里重复的 `ctx x%` 文本徽标，只保留右侧上下文圆环入口。
- 修正展开终端时消息视口没有跟到底部的问题，改为在终端抽屉高度动画期间跟随视口尺寸变化补滚动。

## 为什么改

- 续接快照的原始内容面向 agent 续会话与 compact，不适合直接作为用户可读浮层文案。
- 当前 hover 和 click 面板把内部候选句子整包露出，视觉上像调试面板，阅读成本高，也和 `context` 浮层的产品定位不一致。
- 用户视角真正关心的是剩余上下文和 compact 收走了多少历史内容，面板信息应该围绕这两个问题组织。

## 涉及文件

- `src/shared/contracts.ts`
- `src/main/context/snapshot.ts`
- `src/renderer/src/components/assistant-ui/context-summary-trigger.tsx`
- `src/renderer/src/lib/context-usage.ts`
- `docs/changes/2026-04-15/context-summary-surface-cleanup.md`

## 恢复记录

- `2026-04-15 15:14:13` 误删后恢复了 `context` 浮动面板相关改动，重新补回 hover / click 两态、纯中文文案、`compactedMessageCount` 统计和浮层右侧 padding，确保用户侧继续只看到上下文用量与整理结果。
