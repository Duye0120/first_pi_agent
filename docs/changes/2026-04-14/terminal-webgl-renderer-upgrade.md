# 2026-04-14 终端字体的 fallback 乱码与图块问题修复（引入 WebGL 渲染）

**新增时间**：2026-04-14

## 改了什么
1. 安装并引入了 `@xterm/addon-webgl` 库。
2. 在 `TerminalTab.tsx` 中的 xterm.js 初始化流程中加载并启用了 WebGL 渲染引擎。
3. 开启了 `customGlyphs: true` 配置。

## 为什么改
用户截图反馈：即使配置了正确的字体序列（包含了 Nerd Font），但在加载类似 oh-my-posh 这类带有很多生僻私有区字符（PUA / Powerline UI 符号）的主题时，分支、文件夹等图标依然显示为带问号的方块符号 `[?]`。

虽然之前已经修复了“解析带空格多字体”的问题，但：
1. **渲染器兼容性**：xterm.js 默认的 Canvas/DOM 渲染器对多重系统后备字体（Font Fallback）尤其是在处理超出标准 ASCII 的 PUA 字符映射时，容易发生测量截断或绘图失败。
2. **VS Code 行为对齐**：用户反馈“在 vsc 里面就不是这样的”，因为 VS Code 默认对其内置的终端启用了高性能的 **WebGL 渲染器**，该渲染器对于现代 Nerd Font 字体图集缓存、符号连字及后备降级寻找字符能力支持更加完备。

因此，为了彻底解决特殊符号无法对齐后备字体的问题，引入了 `@xterm/addon-webgl` 将底层渲染引擎升级到 WebGL，与 VS Code 原生表现靠齐。

## 影响的文件
- `package.json`
- `pnpm-lock.yaml`
- `src/renderer/src/components/TerminalTab.tsx`
