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

## 全项目代码质量与性能小步审查

时间：2026-04-28 14:05:32

改了什么：
- 按 100 个检查点执行质量与性能审查，落地 15 组可验证的小步修订。
- 将 context 快照、assistant step、Trace 面板中的最新项查找改为尾部扫描，减少复制数组再反转的分配。
- 将 context、会话时间、diff 数量、snapshot 时间格式化器提升为模块级复用对象。
- 优化 sidebar 项目会话分组、Trace 统计、diff tree 选中统计、workspace soul 计数等渲染计数路径。
- diff tree 在构建阶段缓存排序后的子节点列表，渲染阶段直接复用。
- 附件消息组装改为并行读取附件内容并保持原有顺序。
- 记忆检索和会话搜索改为有界排名列表，规避全量排序后再截断；同时补齐 `limit` 归一化。
- 记忆向量解析、provider 模型去重、启用 source 集合、技能用量提取、反思消息提取改为一次循环处理。
- 安全策略预编译禁读 glob 正则，fetch 协议检查使用窄化函数。
- 收紧并行工具、agent toolCall 解析、harness 审计、shell 异常、Tiptap markdown storage、memory 设置回调等类型边界。
- 为记忆检索 top-k 行为和安全策略协议/禁读规则补充 regression 断言。

为什么改：
- 高频聊天、context、diff、trace、sidebar 和搜索路径存在可消除的中间数组、重复 formatter、全量排序和宽泛类型边界。
- 本轮目标是低风险提升运行稳定性、渲染性能和维护质量，保持现有交互和业务行为。

涉及文件：
- `src/main/adapter.ts`
- `src/main/agent.ts`
- `src/main/chat-message-adapter.ts`
- `src/main/context/snapshot.ts`
- `src/main/harness/runtime.ts`
- `src/main/memory/retrieval.ts`
- `src/main/memory/service.ts`
- `src/main/parallel-tools.ts`
- `src/main/prompt-control-plane.ts`
- `src/main/providers.ts`
- `src/main/reflection/service.ts`
- `src/main/security.ts`
- `src/main/session/search.ts`
- `src/main/shell.ts`
- `src/main/tools/code-analysis.ts`
- `src/mcp/adapter.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/context-summary-trigger.tsx`
- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `src/renderer/src/components/assistant-ui/diff-tree.tsx`
- `src/renderer/src/components/assistant-ui/settings/memory-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`
- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `src/renderer/src/components/assistant-ui/trace-panel.tsx`
- `src/renderer/src/components/ui/commit-description-editor.tsx`
- `src/renderer/src/lib/context-usage.ts`
- `src/renderer/src/lib/session.ts`
- `src/shared/skill-usage.ts`
- `tests/memory-regression.test.ts`
- `tests/security-regression.test.ts`
- `docs/changes/2026-04-28/changes.md`

结果：
- `pnpm exec tsx tests/memory-regression.test.ts` 通过；better-sqlite3 存储段按既有逻辑提示 native module 需要匹配当前 Node/Electron ABI 后跳过。
- `pnpm exec tsx tests/security-regression.test.ts` 通过。
- `pnpm exec tsx tests/provider-regression.test.ts` 通过。
- `git diff --check` 通过，仅输出当前 Windows 换行提示。
- 定点 TypeScript 诊断覆盖 `src/main/agent.ts`、`src/main/session/search.ts`、`src/renderer/src/components/assistant-ui/diff-tree.tsx`、`src/renderer/src/components/ui/commit-description-editor.tsx`，均为 0 error。
- 任务开始前已有 `docs/doctor.md` 未提交改动，本轮审查未把它作为修订目标。

## 大文件拆分与兼容优化

时间：2026-04-28 15:06:14

改了什么：
- 按 100 轮小步兼容检查思路，继续拆分 `App.tsx`、`thread.tsx`、`keys-section.tsx`、`diff-panel.tsx` 的低耦合模块。
- 将 App 壳层常量、路由解析、宽度计算、主题变量应用、设置合并逻辑移入 `app-shell.ts`。
- 将 App 启动/错误/空线程状态 UI 移入 `app-shell-states.tsx`。
- 将聊天区模型选项构建、剪贴板文件收集、状态 token 格式化、`/btw` 判定移入 `thread-helpers.tsx`。
- 将 assistant run 变更摘要卡片移入 `thread-run-change-summary.tsx`。
- 将 provider/model 数据整理、序列化、能力开关、workspace 创建逻辑移入 `keys-section-model.ts`。
- 将模型高级项弹窗移入 `keys-section-entry-dialog.tsx`。
- 将 diff 面板的来源选择、摘要卡、文件卡、空状态、计数与 DOM id helper 移入 `diff-panel-parts.tsx`。
- 将提交计划卡片、提交消息生成、提交计划生成包装移入 `diff-panel-commit-plan.tsx`。

为什么改：
- 这些文件承担了状态编排、展示组件、数据模型 helper、格式化 helper 等多类职责，拆分后更便于继续做兼容审查和局部优化。
- 拆分优先选择低耦合展示块和纯 helper，保持现有 UI 行为、调用入口和运行时数据结构稳定。

涉及文件：
- `src/renderer/src/App.tsx`
- `src/renderer/src/lib/app-shell.ts`
- `src/renderer/src/components/assistant-ui/app-shell-states.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/assistant-ui/thread-helpers.tsx`
- `src/renderer/src/components/assistant-ui/thread-run-change-summary.tsx`
- `src/renderer/src/components/assistant-ui/settings/keys-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/keys-section-model.ts`
- `src/renderer/src/components/assistant-ui/settings/keys-section-entry-dialog.tsx`
- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `src/renderer/src/components/assistant-ui/diff-panel-parts.tsx`
- `src/renderer/src/components/assistant-ui/diff-panel-commit-plan.tsx`
- `docs/changes/2026-04-28/changes.md`

结果：
- 当前行数：`diff-panel.tsx` 925 行、`keys-section.tsx` 1176 行、`thread.tsx` 1630 行、`App.tsx` 1958 行。
- 定点 TypeScript 诊断覆盖本节所有新增/改动的 renderer 拆分文件，均为 0 error。
- `pnpm exec tsx tests/settings-navigation-regression.test.ts` 通过。
- `pnpm exec tsx tests/provider-regression.test.ts` 通过。
- `git diff --check` 通过，仅输出当前 Windows 换行提示。
- 按项目约束跳过全量 `pnpm build` 和全量 `pnpm check`。

## App 拆分常量遗漏修复

时间：2026-04-28 15:11:05

改了什么：
- 将 `MAX_SIDEBAR_SIZE` 从 `app-shell.ts` 显式导出。
- 在 `App.tsx` 显式导入 `MAX_SIDEBAR_SIZE` 和 `MAX_RIGHT_PANEL_WIDTH`。

为什么改：
- 大文件拆分后，`App.tsx` 仍使用右侧面板默认宽度和侧栏最大百分比常量；遗漏导入会在 renderer 启动时触发 `ReferenceError: MAX_SIDEBAR_SIZE is not defined`。

涉及文件：
- `src/renderer/src/App.tsx`
- `src/renderer/src/lib/app-shell.ts`
- `docs/changes/2026-04-28/changes.md`

结果：
- `App.tsx` 与 `app-shell.ts` 定点 TypeScript 诊断均为 0 error。
- `pnpm exec tsx tests/settings-navigation-regression.test.ts` 通过。
- `git diff --check` 通过，仅输出当前 Windows 换行提示。
- Playwright 打开 `http://127.0.0.1:5173/` 后未再出现 `ReferenceError` 渲染崩溃；普通浏览器环境显示预期的 Electron preload 注入诊断，控制台仅有 `favicon.ico` 404。

## App session/git/workspace 编排拆分

时间：2026-04-28 15:22:39

改了什么：
- 将 App 的 Git 分支摘要、diff 快照、请求去重、diff 面板自动刷新逻辑拆到 `use-app-git-state.ts`。
- 将会话 summary 归档/恢复迁移、session cache 删除、运行中会话 id 更新、session 到项目路径解析拆到 `app-session-state.ts`。
- 将项目按路径/ID 查找、项目名称/路径解析 helper 收敛到 `app-session-state.ts`。
- 将文件选择、剪贴板文件保存、文本附件预览补全、附件删除逻辑拆到 `use-session-attachments.ts`。
- `App.tsx` 继续保留应用级事件顺序、路由、面板布局和渲染组合。

为什么改：
- `App.tsx` 的 session/git/workspace 状态编排继续增长，影响后续定位和兼容审查。
- 本轮优先抽离无视觉变化的状态 hook 和纯 helper，保持现有行为和组件传参稳定。

涉及文件：
- `src/renderer/src/App.tsx`
- `src/renderer/src/hooks/use-app-git-state.ts`
- `src/renderer/src/hooks/use-session-attachments.ts`
- `src/renderer/src/lib/app-session-state.ts`
- `docs/changes/2026-04-28/changes.md`

结果：
- `App.tsx` 从 1960 行降到 1728 行。
- `App.tsx`、`use-app-git-state.ts`、`use-session-attachments.ts`、`app-session-state.ts` 定点 TypeScript 诊断均为 0 error。
- `pnpm exec tsx tests/settings-navigation-regression.test.ts` 通过。
- `git diff --check` 通过，仅输出当前 Windows 换行提示。
- Chrome DevTools 打开 `http://127.0.0.1:5173/` 未出现新的 `ReferenceError` 渲染崩溃；普通浏览器环境显示预期的 Electron preload 注入诊断，控制台仅有 `favicon.ico` 404。

## Diff Panel 手动提交表单

时间：2026-04-28 15:41:28

改了什么：
- 在 diff panel 的提交区域新增手动提交表单，支持填写 title 和 description。
- 新增 `ManualCommitPanel` 独立组件，负责手动提交输入框、提交按钮、错误展示和提交中状态。
- `DiffWorkbenchContent` 增加手动提交草稿、错误、提交中状态；用户选中文件后可直接提交所选文件。
- 手动提交开始时会让正在返回的提交计划生成结果失效，避免旧生成结果覆盖手动流程。

为什么改：
- diff panel 原先依赖生成提交计划后才能编辑 title 和 description；API 断开或异常时缺少手动兜底。
- 手动提交表单让提交内容输入和 AI 生成能力并列可用，保留现有计划生成入口。

涉及文件：
- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `src/renderer/src/components/assistant-ui/diff-panel-manual-commit.tsx`
- `docs/changes/2026-04-28/changes.md`

结果：
- 选中文件后，提交区域显示手动提交表单。
- title 为空或未选文件时提交按钮禁用。
- 手动提交成功后清空表单、清空生成计划并刷新 diff 快照。

## 侧栏折叠与设置默认入口修复

时间：2026-04-28 16:55:28

改了什么：
- 将侧栏折叠/展开按钮改为在点击事件中同步更新 React 状态和 `react-resizable-panels` 的 panel imperative API。
- 将侧边栏底部设置入口默认分区从 `workspace` 改为 `general`。

为什么改：
- 侧栏切换只更新状态再等待 effect 调 panel API，UI 交互链路容易出现状态与面板尺寸脱节。
- 设置入口默认打开工作区分区，当前产品行为要求默认进入通用设置。

涉及文件：
- `src/renderer/src/App.tsx`
- `docs/changes/2026-04-28/changes.md`

结果：
- 首页和设置页共用的标题栏侧栏按钮现在直接驱动同一个折叠/展开链路。
- 从侧边栏进入设置时默认打开 `通用`。

根因修复（2026-04-28 17:15:30）：
- 给 `shell-sidebar` 的 `ResizablePanel` 增加 `min-w-0 overflow-hidden`，让 panel 收到 0 宽度时裁剪内部内容。
- 将 sidebar 内容容器从 `min-w-[220px]` 改为 `w-full min-w-0`，侧栏最小宽度继续由 panel 的 `minSize` 约束负责。
- 原因：panel 折叠状态已经触发，但内部 `aside` 的 220px 最小宽度持续向外溢出，视觉上表现为侧栏闪一下后仍然留在原处。
- 涉及文件：`src/renderer/src/App.tsx`、`docs/changes/2026-04-28/changes.md`。

回弹修复（2026-04-28 17:23:20）：
- 增加 `sidebarProgrammaticTargetRef`，程序化折叠/展开期间屏蔽 `onResize` 对 `sidebarCollapsed` 的反写。
- 折叠时在 `collapse()` 后补一次 `resize("0%")`，确保 panel 目标宽度明确为 0。
- 原因：折叠动画中间帧的 `onResize` 会读到非 0 宽度，把 `sidebarCollapsed` 写回 `false`，导致侧栏来回弹并重新展开。
- 涉及文件：`src/renderer/src/App.tsx`、`docs/changes/2026-04-28/changes.md`。
