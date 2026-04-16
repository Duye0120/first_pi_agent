# Diff Panel 提交占位文案中文化

**时间**: 2026-04-16 12:21

## 改了什么

1. 把提交标题输入框的 placeholder 从 `Update files...` 改成 `输入提交标题...`。
2. 把提交说明编辑器的 placeholder 从 `Description (Supports Markdown)...` 改成 `输入提交说明（支持 Markdown）...`。

## 为什么改

- diff-panel 提交区主体已经走中文文案，占位文案继续保留英文会割裂。
- 标题、说明、按钮三处词汇统一成中文后，界面理解成本更低。

## 涉及文件

- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `src/renderer/src/components/ui/commit-description-editor.tsx`

## 结果

- 提交标题和提交说明输入区现在都是中文占位提示。
