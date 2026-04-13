# Sidebar 颜色对齐 Chela Token

- 日期：2026-04-09
- 时间：16:02:20
- 改了什么：把 Sidebar 的字体色、hover、选中态、浮层菜单、分组移动面板、新线程按钮、底部设置入口统一改成 Chela token 颜色。
- 为什么改：用户明确要求先把 Sidebar 的颜色系统全部改成当前主题 token，不要再混旧的灰白语义色。
- 改到哪些文件：
  - `src/renderer/src/components/assistant-ui/sidebar.tsx`
- 颜色策略：
  - 默认文字：`--chela-text-secondary / tertiary`
  - hover：`--chela-bg-muted`
  - 选中态：`--chela-accent-subtle + --chela-accent-text`
  - 浮层：`--chela-bg-surface`
  - 运行点 / 勾选反馈：`--chela-accent`
- 检查：
  - 已跑 `tsc --noEmit -p tsconfig.renderer.json`，通过。
