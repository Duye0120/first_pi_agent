# Layout 与右侧内容背景对齐 Chela Token

- 日期：2026-04-09
- 时间：15:38:00
- 改了什么：只调整了 App 外层 layout 和右侧 content 区域的背景，让这两层直接使用 Chela token，而不是继续只靠旧的 shell 语义色名。
- 为什么改：用户明确要求先把 layout 背景和右侧 content 背景严格对齐到当前 token 系统。
- 改到哪些文件：
  - `src/renderer/src/App.tsx`
- 具体映射：
  - 外层 layout：`--chela-bg-primary` / `--chela-bg-secondary`
  - 右侧 content：`--chela-bg-surface`
- 检查：
  - 已跑 `tsc --noEmit -p tsconfig.renderer.json`，通过。
