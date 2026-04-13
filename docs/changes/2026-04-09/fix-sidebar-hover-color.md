# 侧边栏菜单悬停颜色修复

**日期：** 2026-04-09
**时间：** 14:56:25

## 改了什么
将 `src/renderer/src/components/assistant-ui/sidebar.tsx` 文件中所有的 `hover:bg-accent` 替换为了 `hover:bg-shell-hover`。

## 为什么改
`bg-accent` 对应的是项目主色（亮橙色 `#f97316`）。在菜单项的 hover 状态中使用这个颜色会导致整个背景变成明亮的实心橙色块，视觉上非常突兀，且容易遮挡黑色文字。替换为 `bg-shell-hover` 后，可以与其他应用的悬停反馈对齐，提供更加柔和、自然的交互体验。这符合 UI 视觉规范中关于“选中与反馈样式需要克制和统一”的要求。

## 改到哪些文件
- `src/renderer/src/components/assistant-ui/sidebar.tsx`
