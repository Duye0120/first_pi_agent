# Chela Doctor

更新时间：2026-04-28 13:05:55

`doctor` 用于诊断 Chela 本地开发环境，重点覆盖 Node 版本、命令行工具、搜索工具、原生模块 ABI 和 Electron 主进程关键依赖。

## 使用方式

```bash
pnpm run doctor
```

输出为结构化 JSON：
- `ok`：所有失败项数量为 0 时为 `true`。
- `counts`：`pass` / `warn` / `fail` 数量。
- `checks`：每个检查项的 `id`、`status`、`code`、`message`、`details`、`fixCommands`。

## 常见修复路径

Node 版本不匹配：

```bash
nvm use 22.19.0
pnpm install
```

`better-sqlite3` ABI 不匹配：

```bash
set SystemRoot=C:\Windows
pnpm run native:rebuild:electron
pnpm run native:verify:electron
```

发布构建会自动执行 Electron native 重建和自检：

```bash
pnpm build
```

`node-pty` ABI 或加载失败：

```bash
pnpm rebuild node-pty
pnpm install
```

`@vscode/ripgrep` 可执行文件缺失或无法运行：

```bash
pnpm rebuild @vscode/ripgrep
pnpm install
```

`pnpm` 不可用：

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

## 回归入口

```bash
pnpm run test:doctor
```

`test:regression` 已纳入 doctor 回归测试。

## 本次变更摘要

时间：2026-04-27 15:20:19

新增 doctor 诊断说明，记录结构化输出字段、常用命令和 native 依赖 ABI 修复路径。

时间：2026-04-27 16:00:27

补充 `better-sqlite3` rebuild 经验：pnpm 需要允许 `better-sqlite3` 执行 build 脚本；Windows shell 里 `SystemRoot` 缺失时，node-gyp 会在 Visual Studio 探测阶段失败。

时间：2026-04-28 13:05:55

将 `better-sqlite3` 修复路径改为 Electron 41.1.0 ABI 重建脚本，并记录 `pnpm build` 会自动执行 Electron native 重建和自检。
