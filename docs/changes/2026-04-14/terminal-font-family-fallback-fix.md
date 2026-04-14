# 2026-04-14 终端字体无法 fallback，且空格字体名解析失败的修复

**新增时间**：2026-04-14

## 改了什么
为终端渲染组件 (`TerminalTab.tsx`) 增加了一个字体解析与格式化帮助函数 `parseFontFamily`：
1. 自动对包含空格且没有加引号的字体名（如用户输入的 `Ioskeley Mono` 或 `Maple Mono NF CN`）添加双引号。
2. 自动在给定的字体序列最后加一个 `monospace` fallback 兜底。
3. 应用到 xterm.js 的初始化和字体换绑逻辑上。

## 为什么改
通过截图和对话反馈发现：
- 用户给终端配置了带有特殊符号 / Nerd Font 的多字体序列 `"Ioskeley Mono, Maple Mono NF CN, PingFang SC"`。
- 与 VS Code 处理 `editor.fontFamily` 配置不同，如果没有被显式用引号包起，带有空格的多个字体名在传入 xterm.js 的 `options.fontFamily` 时会导致底层的 Canvas 渲染器报错或无法正常走 fallback。这会让第一候选字体（即使打错了或者没有图标）变成唯一生效渲染，导致 Nerd Font 的专属符号变成方块问号 (`[?]`)。
- 在对用户输入的未经处理的字体字符串进行自动加引号与补充兜底处理后，xterm 就能和在 VS Code 中一样正确应用字体栈中的 Nerd Font 字体，解决图标乱码问题。

## 影响的文件
- `src/renderer/src/components/TerminalTab.tsx`
