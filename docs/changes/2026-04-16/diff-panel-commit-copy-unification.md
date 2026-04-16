# Diff Panel 提交文案统一

**时间**: 2026-04-16 12:14

## 改了什么

1. 把 diff-panel 提交按钮的静态文案从 `Commit` 统一改成 `提交`。
2. 把提交按钮 tooltip 的空闲态和进行态文案统一成中文表述。

## 为什么改

- 同一组交互里同时出现英文 `Commit` 和中文 `提交中…`，界面语气不一致。
- 用户在 diff-panel 里已经处于中文界面，提交动作保持同一套中文词汇更顺。

## 涉及文件

- `src/renderer/src/components/assistant-ui/diff-panel.tsx`

## 结果

- 按钮空闲态显示 `提交 (N)`。
- 按钮进行态显示 `提交中…`。
- tooltip 空闲态显示 `提交选中文件`。
