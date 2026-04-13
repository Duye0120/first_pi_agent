# Content 圆角外背景修正

- 日期：2026-04-09
- 时间：15:46:10
- 改了什么：把右侧 content 外层包裹 section 的背景去掉，避免 content 内层圆角外继续露出一层底色。
- 为什么改：用户指出 content 左上圆角外仍然有背景色，这是因为圆角挂在内层，而外层 section 仍然有背景。
- 改到哪些文件：
  - `src/renderer/src/App.tsx`
- 检查：
  - 已跑 `tsc --noEmit -p tsconfig.renderer.json`，通过。
