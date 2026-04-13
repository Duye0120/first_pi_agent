# Sidebar 背景改透明

- 日期：2026-04-09
- 时间：15:41:30
- 改了什么：把 shell 的横向 panel 容器背景从 Chela 次背景改成透明，避免左侧 sidebar 整列继续吃到统一底色；右侧 content 仍保持自己的背景层级。
- 为什么改：用户明确指出 sidebar 那整列底色还在，要求先把它去掉，哪怕直接透明都可以。
- 改到哪些文件：
  - `src/renderer/src/App.tsx`
- 检查：
  - 已跑 `tsc --noEmit -p tsconfig.renderer.json`，通过。
