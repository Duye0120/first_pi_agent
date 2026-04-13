# Chela Token 补充

- 日期：2026-04-09
- 时间：14:20:28
- 改了什么：给 Chela 主题系统补齐了结构型 token，包括 z-index、全局圆角、glass / blur、scrollbar / selection，并同步更新到实际生效的 `theme.css`。
- 为什么改：用户明确补充了这几类 token；后面做页面细调时，如果没有这套结构 token，弹层、毛玻璃、滚动区、圆角体系都会继续乱。
- 改到哪些文件：
  - `docs/chela-theme-tokens.md`
  - `src/renderer/src/styles/theme.css`
- 说明：
  - 这轮只补 token 层，不主动改页面结构。
  - `--radius-shell` 已改为引用 `--chela-radius-md`，但数值仍然是 `8px`，不会引入额外视觉变化。
