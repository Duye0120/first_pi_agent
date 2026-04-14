# 2026-04-14
## 修复终端在浅色模式下字体过浅导致看不清的问题
- 问题描述：终端面板在浅色模式下，背景为亮色（\--chela-bg-surface\），但内置的终端文字前景色 (\--color-terminal-text\) 错误地被硬编码为了 \#f5f5f5\，导致白底白字无法看清。
- 解决：修改了 \src/renderer/src/styles/theme.css\，将 \--color-terminal-text\ 改为映射到 \ar(--chela-text-primary)\，并且将 \--color-terminal-bg\ 统一修正为 \ar(--color-shell-terminal)\，从而自动适应深色和浅色模式的主题切换。
- 影响文件：\src/renderer/src/styles/theme.css\

