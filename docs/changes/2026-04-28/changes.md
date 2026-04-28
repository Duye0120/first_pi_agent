## 修复 Trace 面板图标导入导致的白屏

时间：2026-04-28 11:39:33

改了什么：
- 将 `src/renderer/src/App.tsx` 中不存在的 `ScopeIcon` 替换为 `lucide-react` 当前可用的 `ActivityIcon`。
- 新增本轮变更记录。

为什么改：
- renderer TypeScript 检查报错：`lucide-react` 没有导出 `ScopeIcon`。
- 该导入会阻断渲染层编译，导致页面白屏卡住。

涉及文件：
- `src/renderer/src/App.tsx`
- `docs/changes/2026-04-28/changes.md`

结果：
- Trace 面板入口继续使用同一套 `lucide-react` 图标体系，渲染层导入恢复可解析。

## 设置页拆出 MCP 与插件

时间：2026-04-28 12:17:06

改了什么：
- 新增共享设置分区定义，设置侧栏独立展示 `MCP` 与 `插件`，`系统` 只保留日志和关于信息。
- 将 `McpSection` 从系统页移到独立 MCP 页。
- 新增插件状态服务、插件 IPC、preload API 和插件设置页，插件页读取当前 workspace 的 `.agents/plugins` 清单并支持启停状态切换。
- 新增设置导航、插件状态和插件 IPC 契约回归覆盖。

为什么改：
- MCP、插件、数据系统需要在设置中分开管理，避免把扩展连接、插件清单和系统信息混放。
- 插件设置页需要接真实插件扫描和状态持久化，避免只做页面占位。

涉及文件：
- `src/shared/settings-sections.ts`
- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/main/plugins/service.ts`
- `src/main/ipc/plugins.ts`
- `src/main/ipc/schema.ts`
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`
- `src/renderer/src/components/assistant-ui/settings/constants.ts`
- `src/renderer/src/components/assistant-ui/settings/types.ts`
- `src/renderer/src/components/assistant-ui/settings/system-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/plugins-section.tsx`
- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `tests/settings-navigation-regression.test.ts`
- `tests/plugin-status-regression.test.ts`
- `tests/ipc-contract-regression.test.ts`
- `docs/changes/2026-04-28/changes.md`

结果：
- 设置导航中 `MCP`、`插件`、`系统` 成为三个独立入口。
- 插件页展示插件名称、版本、权限数量、workflow 数量、解析错误和启停开关。
- `pnpm exec tsx tests/settings-navigation-regression.test.ts` 通过。
- `pnpm exec tsx tests/plugin-status-regression.test.ts` 通过。
- `pnpm exec tsx tests/ipc-contract-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p tsconfig.renderer.json` 通过。

## Memory worker code 1 诊断修复

时间：2026-04-28 12:27:08

改了什么：
- 新增 `createMemoryWorkerExitError`，统一处理 memory worker 退出错误。
- `MemoryWorkerClient` 在 ready 阶段识别 worker 发回的 `bootstrap` fatal 消息，优先把真实错误传给 UI。
- 设置页 memory 错误文案增加 `code 1` 兜底提示，引导用户重启并查看 `memory.worker` 日志详情。
- 新增 memory worker 错误回归测试。

为什么改：
- 截图中 memory 设置页只显示 `Chela memory worker exited with code 1.`，真实 bootstrap 错误没有进入用户可见链路。
- worker 退出码只能说明进程异常结束，无法定位是 native 依赖、模型加载还是远端嵌入接口问题。

涉及文件：
- `src/main/memory/embedding.ts`
- `src/main/memory/worker-errors.ts`
- `src/renderer/src/components/assistant-ui/settings/memory-status.ts`
- `tests/memory-worker-error-regression.test.ts`
- `docs/changes/2026-04-28/changes.md`

结果：
- worker bootstrap 失败时，UI 会优先显示真实错误；拿不到真实错误时显示可操作的 code 1 诊断文案。
- `pnpm exec tsx tests/memory-worker-error-regression.test.ts` 通过。
- `pnpm exec tsx tests/memory-ui-regression.test.ts` 通过。
- `pnpm exec tsx tests/memory-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p tsconfig.renderer.json` 通过。

## Memory native 依赖 Electron ABI 重建

时间：2026-04-28 12:36:23

改了什么：
- 将 Memory 设置页的 native 依赖错误引导改为 Electron 41.1.0 专用重建命令。
- 同步更新 Memory UI 回归测试中的错误文案断言。
- 在本机执行 Electron ABI 重建：`pnpm dlx @electron/rebuild -f -o better-sqlite3 -v 41.1.0`。

为什么改：
- 截图中的 `better-sqlite3.node` 编译目标是 `NODE_MODULE_VERSION 127`，当前 Electron 41.1.0 运行时需要 `NODE_MODULE_VERSION 145`。
- 普通 `pnpm rebuild better-sqlite3` 会按当前 Node 环境重建，Chela 的 Electron 主进程加载 native 包时仍会遇到 ABI 不匹配。

涉及文件：
- `src/renderer/src/components/assistant-ui/settings/memory-status.ts`
- `tests/memory-ui-regression.test.ts`
- `docs/changes/2026-04-28/changes.md`

结果：
- Electron 运行时自检通过，输出 `145 / electron 41.1.0 / node 24.14.0`，`better-sqlite3` 内存库查询返回 `1`。
- `pnpm exec tsx tests/memory-ui-regression.test.ts` 通过。
- `pnpm exec tsx tests/memory-worker-error-regression.test.ts` 通过。
- `pnpm exec tsc --noEmit -p tsconfig.renderer.json` 通过。

## 发布构建纳入 Electron native 依赖自检

时间：2026-04-28 13:05:55

改了什么：
- `pnpm build` 现在先执行 `native:rebuild:electron`，再执行 `native:verify:electron`，最后运行 `electron-vite build`。
- 新增 `build:raw`，用于只运行原始 `electron-vite build` 的内部场景。
- 新增 `scripts/verify-electron-native.ts`，在 Electron 运行时加载 `better-sqlite3` 和 `node-pty` 并执行 SQLite 内存库 smoke。
- 新增 package scripts 回归测试，并纳入 `test:regression`。
- 更新 doctor 文档中的 `better-sqlite3` 修复路径。

为什么改：
- 发布给别人使用时，native `.node` 文件必须提前按 Electron 41.1.0 ABI 重建并验证，避免用户启动 Chela 时遇到 `NODE_MODULE_VERSION` 不匹配。
- 全量 `@electron/rebuild` 会尝试源码编译 `node-pty`，当前 Windows 开发机缺少 Visual Studio Build Tools 时会失败；当前发布脚本只重建已确认需要 Electron ABI 修复的 `better-sqlite3`，再通过 Electron smoke 验证所有关键 native 模块。

涉及文件：
- `package.json`
- `scripts/verify-electron-native.ts`
- `tests/package-scripts-regression.test.ts`
- `docs/doctor.md`
- `docs/changes/2026-04-28/changes.md`

结果：
- `pnpm run native:rebuild:electron` 通过，输出 `Building modules: better-sqlite3` 和 `Rebuild Complete`。
- `pnpm run native:verify:electron` 通过，输出 `electron ABI 145 / electron 41.1.0 / node 24.14.0` 和 `electron native modules ok`。
- `pnpm exec tsx tests/package-scripts-regression.test.ts` 通过。
