## 行动型 Agent 三阶段完善

时间：2026-04-27 11:57:58

改了什么：
- 新增 `code_inspect` / `code_diagnostics` 内置工具，支持 TS/TSX/JS/JSX 文件结构检查和目标诊断。
- 扩展 `file_edit` details，增加 changed ranges、行尾保留标记和诊断建议。
- 扩展 MCP 管理链路，支持读取状态、重载配置、重启和断开 server，并在设置页系统分区展示 MCP 状态。
- 扩展 context summary，加入 session todos、最近工具失败和可恢复 run 线索；context 展开卡片增加任务状态和恢复入口。
- 更新工具系统、内置工具和 MCP client 规格文档。
- 新增回归测试覆盖 MCP legacy 配置兼容、代码结构检查、目标诊断和 Harness safe policy。

为什么改：
- Chela 已有执行主干，这轮补强代码修改后的自检能力、MCP 运维可见性，以及长任务中断后的恢复线索。

涉及文件：
- `src/main/tools/code-analysis.ts`
- `src/main/tools/index.ts`
- `src/main/tools/file-edit.ts`
- `src/main/harness/policy.ts`
- `src/main/context/snapshot.ts`
- `src/main/agent.ts`
- `src/mcp/config.ts`
- `src/mcp/client.ts`
- `src/mcp/adapter.ts`
- `src/main/ipc/mcp.ts`
- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/renderer/src/components/assistant-ui/context-summary-trigger.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/assistant-ui/settings/mcp-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/system-section.tsx`
- `tests/action-agent-regression.test.ts`
- `specs/04-tool-system.md`
- `specs/05-builtin-tools.md`
- `specs/06-mcp-client.md`

结果：
- 代码任务可以走“定位、结构检查、编辑、目标诊断”的闭环。
- MCP server 状态进入可见管理链路。
- 任务状态板和失败恢复线索可以进入 context UI 与 prompt。

## code inspect outline 收口

时间：2026-04-27 12:18:34

改了什么：
- 将 `code_inspect` 的 symbols 聚焦到顶层函数、类、类型、变量和类方法，减少函数内部临时变量噪音。
- 补充 `export default` 语句识别。
- 回归测试增加语法错误文件的 `code_diagnostics` 结构化错误断言。

为什么改：
- 代码结构检查用于改代码前快速定位，输出需要稳定、低噪音，并覆盖修改后诊断失败的关键路径。

涉及文件：
- `src/main/tools/code-analysis.ts`
- `tests/action-agent-regression.test.ts`
- `docs/changes/2026-04-27/changes.md`

结果：
- `code_inspect` 的 outline 更接近执行型 Agent 需要的局部结构摘要。
- `code_diagnostics` 对语法错误文件的测试覆盖已补齐。

## MCP config 纯 Node 化

时间：2026-04-27 12:32:08

改了什么：
- 移除 `src/mcp/config.ts` 对主进程 Electron logger 的直接依赖。
- MCP 配置解析 warning 改为轻量 `console.warn`，保持配置解析逻辑可在 Node 测试中直接 import。

为什么改：
- 新增回归测试需要直接验证 `loadMcpConfig`，该模块应保持纯配置解析能力，避免测试运行时加载 Electron-only 入口。

涉及文件：
- `src/mcp/config.ts`
- `docs/changes/2026-04-27/changes.md`

结果：
- MCP 配置兼容测试可以在 Node 22 测试进程中直接运行。

## Node 运行时版本固定

时间：2026-04-27 12:41:22

改了什么：
- 新增 `.nvmrc` 和 `.node-version`，固定项目本地 Node 版本为 `22.19.0`。
- 使用 Node 22.19.0 重新执行 `pnpm exec tsx tests\action-agent-regression.test.ts`，回归测试通过。

为什么改：
- 当前 PATH 下的 Node 24.13.0 在本机执行 `node -p`、`tsx` 等运行时代码时触发 `ncrypto::CSPRNG(nullptr, 0)` 原生断言。
- Node 22.19.0 可以稳定启动项目测试链路，适合作为当前 Chela 开发和验证版本。

涉及文件：
- `.nvmrc`
- `.node-version`
- `docs/changes/2026-04-27/changes.md`

结果：
- 新增行动型 Agent 回归测试已在 Node 22.19.0 下通过。
- 后续本地开发工具可以按版本文件切换到稳定 Node。

## IPC 错误结构化与回归入口

时间：2026-04-27 13:08:46

改了什么：
- 新增共享 IPC 错误 payload 类型和错误消息前缀。
- `handleIpc` 将 handler 异常统一编码为 `{ code, message }`，包含非主 frame 调用拒绝。
- `preload` 新增统一 `invokeIpc`，解码主进程错误并向 renderer 抛出带 `code` 的 Error。
- 抽出 `src/main/log-sanitize.ts` 作为纯 Node 日志脱敏模块，避免安全测试加载 Electron logger。
- 新增 `test:regression` 脚本，串行运行安全回归和行动型 Agent 回归。
- 更新 TODO 索引，将 M7 标记为已修复。

为什么改：
- 后续功能会持续增加 IPC 面，统一错误结构能让 UI、恢复、诊断和日志都依赖稳定协议。
- 回归测试入口需要摆脱 Electron-only import，方便基础设施变更后快速自检。

涉及文件：
- `src/shared/ipc.ts`
- `src/main/ipc/handle.ts`
- `src/preload/index.ts`
- `src/main/log-sanitize.ts`
- `src/main/logger.ts`
- `tests/security-regression.test.ts`
- `package.json`
- `docs/todos/README.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- IPC handler 错误会在 renderer 侧表现为带 `code` 和 `message` 的 Error。
- 安全回归和行动型 Agent 回归可以通过 `pnpm run test:regression` 统一执行。

## P1 基建项收口

时间：2026-04-27 13:24:36

改了什么：
- 确认 `branch-switcher` 分支缓存已从模块级变量改为组件实例级 `useRef`，避免跨实例共享状态。
- 确认主窗口 `webPreferences.sandbox` 已改为 `!isDev`，生产环境启用 renderer sandbox，开发环境保留调试能力。
- 更新 TODO 索引，将 P1 严重项标为已完成。

为什么改：
- 聊天区和主窗口安全配置属于后续扩展反复依赖的基础层，需要先把高优先级历史缺口收口。

涉及文件：
- `src/renderer/src/components/assistant-ui/branch-switcher.tsx`
- `src/main/window.ts`
- `docs/todos/README.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- P1 基建风险项完成状态已和当前代码对齐。
- 分支切换缓存和生产窗口隔离策略进入稳定基线。

## Foundation 回归测试补齐

时间：2026-04-27 13:36:11

改了什么：
- 新增 `tests/foundation-regression.test.ts`，覆盖 provider directory 的请求超时和缓存复用行为。
- `test:regression` 纳入 foundation 回归测试。
- TODO 索引补充 R1-R4 的当前验证结论。

为什么改：
- provider directory、订阅清理、session ref 防竞态这类基础行为后续会被模型选择、设置页、聊天区持续复用，需要有轻量回归测试保护。

涉及文件：
- `tests/foundation-regression.test.ts`
- `package.json`
- `docs/todos/README.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- 基础回归测试覆盖范围从安全和行动型 Agent 扩展到 renderer 侧 provider directory 基础能力。

## Memory/RAG 基线对齐

时间：2026-04-27 13:54:29

改了什么：
- 新增 `tests/memory-regression.test.ts`，覆盖 memory metadata 归一化、余弦相似度、语义排序、query vector cache，以及原生依赖可用时的 SQLite store 写入/统计。
- `MemoryStore` 增加 `close()`，便于测试和后续生命周期管理释放 SQLite 句柄。
- `test:regression` 纳入 memory 回归测试。
- 更新 `specs/07-memory-architecture.md`，对齐当前 T0/T1/T2 baseline、memdir、SQLite 语义记忆和 session todos。
- 更新 `specs/09-rag-and-embedding.md`，对齐当前 `Xenova/bge-small-zh` 本地默认、远程 provider、SQLite 存储、worker、query cache 和原生 ABI 约束。
- 更新 TODO 索引，移除 specs 07/09 过时描述。

为什么改：
- 记忆/RAG 是后续智能化能力的基础层，spec 和测试必须反映真实实现，避免后续新功能基于旧架构假设继续扩展。

涉及文件：
- `src/main/memory/store.ts`
- `tests/memory-regression.test.ts`
- `package.json`
- `specs/07-memory-architecture.md`
- `specs/09-rag-and-embedding.md`
- `docs/todos/README.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- memory 纯逻辑回归已进入统一回归入口。
- 当前本地 `better-sqlite3` 二进制仍按 Node 24 ABI 编译，Node 22 下 store 子测试会明确跳过并提示需要重建原生依赖。

## 底层基建完善路线图

时间：2026-04-27 15:11:47

改了什么：
- 新增 `docs/todos/foundation-hardening-roadmap.md`，把剩余底层基建工作拆成 6 个阶段：环境 Doctor、IPC 契约校验、Memory 管理闭环、Provider / 模型目录稳定性、Harness / 长任务恢复、插件 / 扩展底座。
- 每个阶段补充预计轮次、任务清单和完成标准，方便后续按 TODO 逐项实施。
- 更新 `docs/todos/README.md`，把基建路线图挂到 TODO 索引顶部。

为什么改：
- Chela 后续会持续增加功能，底层基建需要先形成明确的执行队列和验收标准，避免后续改动分散推进。

涉及文件：
- `docs/todos/foundation-hardening-roadmap.md`
- `docs/todos/README.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- 后续基建工作有了可直接执行的阶段化 TODO 文档。
- TODO 索引和变更留痕已同步更新。

## Phase 1 环境 Doctor

时间：2026-04-27 15:20:19

改了什么：
- 新增 `src/main/doctor.ts`，提供纯 Node 环境诊断入口，输出结构化 `ok`、`counts`、`checks`。
- 覆盖 Node 版本文件、`pnpm`、`tsx`、`@vscode/ripgrep`、`better-sqlite3`、`node-pty` 和 Electron 主进程关键依赖检查。
- 原生模块加载失败时解析 `NODE_MODULE_VERSION`，返回当前 Node ABI、模块 ABI 和明确修复命令；`better-sqlite3` 会打开内存库做真实 smoke。
- 新增 `tests/doctor-regression.test.ts`，覆盖 Node 版本匹配、版本不匹配、native ABI 解析和结构化汇总。
- `package.json` 新增 `doctor`、`test:doctor`，并把 doctor 回归测试纳入 `test:regression`。
- 新增 `docs/doctor.md` 记录结构化输出和常见修复路径。
- 更新底层基建路线图和 TODO 索引，将 Phase 1 标为完成。

为什么改：
- Phase 1 目标是把本地环境问题变成可诊断、可复现、可修复的结构化结果，减少后续 IPC、Memory、Provider 等阶段的环境噪音。

涉及文件：
- `src/main/doctor.ts`
- `tests/doctor-regression.test.ts`
- `package.json`
- `docs/doctor.md`
- `docs/todos/foundation-hardening-roadmap.md`
- `docs/todos/README.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- `doctor` 可以识别 Node 22/24 ABI 风险和当前本地 `better-sqlite3` ABI mismatch，并给 native 依赖提供 `pnpm rebuild <package>` 修复命令。
- 诊断结果统一为结构化 JSON，便于后续 UI 或 CI 复用。

## better-sqlite3 ABI 重建收口

时间：2026-04-27 16:00:27

改了什么：
- 将 `better-sqlite3` 加入 `package.json` 的 `pnpm.onlyBuiltDependencies`，允许 pnpm 执行 native build 脚本。
- 使用 Node 22.19.0 并设置 `SystemRoot=C:\Windows` 后重新执行 `pnpm rebuild better-sqlite3`。
- 更新 `docs/doctor.md`，记录 Windows 下 `SystemRoot` 缺失会导致 node-gyp Visual Studio 探测失败。

为什么改：
- 用户已执行 rebuild，但 doctor 仍检测到 `better-sqlite3` ABI 145 与 Node 22 ABI 127 不匹配；根因是 pnpm build 许可和 shell 环境变量问题。

涉及文件：
- `package.json`
- `docs/doctor.md`
- `docs/todos/foundation-hardening-roadmap.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- `pnpm run doctor` 输出 11 项通过。
- SQLite native 模块可在 Node 22.19.0 下打开内存库。

## Phase 2 settings:update IPC 契约校验

时间：2026-04-27 16:00:27

改了什么：
- 新增 `src/main/ipc/schema.ts`，提供 IPC payload schema 校验和统一 `INVALID_IPC_PAYLOAD` 错误。
- `settings:update` 在进入 `updateSettings` 前校验 payload、顶层字段、嵌套对象和基础类型。
- 新增 `tests/ipc-contract-regression.test.ts`，覆盖非法 payload、未知字段、空 workspace、嵌套类型错误、嵌套布尔字段错误和合法 partial。
- `test:regression` 纳入 IPC 契约回归测试。

为什么改：
- Phase 2 目标是把 renderer 到 main 的数据边界稳定下来，先保护最频繁的 `settings:update`，避免脏数据进入主进程设置写入链路。

涉及文件：
- `src/main/ipc/schema.ts`
- `src/main/ipc/settings.ts`
- `tests/ipc-contract-regression.test.ts`
- `package.json`
- `docs/todos/foundation-hardening-roadmap.md`
- `docs/todos/README.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- `settings:update` 错误输入会得到稳定 `{ code: "INVALID_IPC_PAYLOAD", message }`。
- IPC 契约测试进入统一回归入口。

## Phase 2 providers IPC 契约校验

时间：2026-04-27 16:14:01

改了什么：
- 扩展 `src/main/ipc/schema.ts`，新增 provider source draft、sourceId、apiKey 校验。
- `providers:save-source`、`providers:test-source`、`providers:fetch-models` 进入 provider 主逻辑前会校验 draft。
- `providers:get-source`、`providers:delete-source`、`providers:get-credentials`、`providers:set-credentials` 会校验 sourceId。
- `providers:set-credentials` 会校验 apiKey 为字符串，保留空字符串用于清除凭据。
- 扩展 `tests/ipc-contract-regression.test.ts`，覆盖 provider 非法 payload、非法 providerType、enabled 类型错误、sourceId 为空、apiKey 类型错误和合法 draft。

为什么改：
- provider 配置、测试连接、拉取模型和凭据写入都属于主进程边界输入；先在 IPC 层拒绝脏数据，后续 provider 错误分类和 UI 展示可以依赖稳定错误协议。

涉及文件：
- `src/main/ipc/schema.ts`
- `src/main/ipc/providers.ts`
- `tests/ipc-contract-regression.test.ts`
- `docs/todos/foundation-hardening-roadmap.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- providers 关键写入和网络动作入口已有结构化 IPC 契约校验。

## 修复 TypeScript 编译器被打进 main bundle

时间：2026-04-27 16:20:10

改了什么：
- 在 `electron.vite.config.ts` 的 main rollup 配置里将 `typescript` 标记为 external。

为什么改：
- `src/main/tools/code-analysis.ts` 需要 TypeScript compiler API 做代码分析；main 打包时如果把 `typescript` 整包打进 `out/main/index.js`，esbuild 会在转译 TypeScript 编译器源码时触发 `Unterminated string literal`，导致项目无法启动。
- `typescript` 作为 external 后，主进程运行时直接从 `node_modules` 加载，避免把庞大的编译器源码塞进 main bundle。

涉及文件：
- `electron.vite.config.ts`
- `docs/changes/2026-04-27/changes.md`

结果：
- `pnpm exec electron-vite build` 通过。
- `pnpm run test:regression` 通过。

## Phase 2 memory IPC 契约校验

时间：2026-04-27 16:33:30

改了什么：
- 扩展 `src/main/ipc/schema.ts`，新增 `memory:add`、`memory:search`、`memory:list` 输入校验。
- `src/main/ipc/memory.ts` 在调用 memory service 前校验 add input、search query / limit、list sort / limit。
- 扩展 `tests/ipc-contract-regression.test.ts`，覆盖 memory 非法 payload、空 content、非法 metadata key、空 query、非法 limit、非法 sort，以及合法 add/list 输入。
- 更新底层基建路线图，将 `memory:*` IPC 输入校验标为完成。

为什么改：
- Memory 写入、搜索和列表查询都直接进入主进程记忆链路，需要先保证 IPC 层输入稳定，避免脏 metadata、空 query 或非法排序参数进入 store / worker。

涉及文件：
- `src/main/ipc/schema.ts`
- `src/main/ipc/memory.ts`
- `tests/ipc-contract-regression.test.ts`
- `docs/todos/foundation-hardening-roadmap.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- `memory:*` 关键 IPC 已有结构化输入校验，错误统一使用 `INVALID_IPC_PAYLOAD`。

## Phase 2 git IPC 契约校验

时间：2026-04-27 16:37:25

改了什么：
- 扩展 `src/main/ipc/schema.ts`，新增 git branchName、paths、commit input 校验。
- `src/main/ipc/workbench.ts` 在调用 git 操作前校验 `git:switch-branch`、`git:create-branch`、`git:stage-files`、`git:unstage-files`、`git:commit` 入参。
- 扩展 `tests/ipc-contract-regression.test.ts`，覆盖空分支名、含换行分支名、非法 paths item、空 path、空 commit message、非法 commit paths 和合法输入。
- 更新底层基建路线图，将 `git:*` IPC 输入校验标为完成。

为什么改：
- git 分支、路径和提交信息都进入本地命令执行链路；IPC 层先保证基础形状和单行安全字符串，可以让后续 git 层错误更聚焦在仓库状态和 git 自身规则。

涉及文件：
- `src/main/ipc/schema.ts`
- `src/main/ipc/workbench.ts`
- `tests/ipc-contract-regression.test.ts`
- `docs/todos/foundation-hardening-roadmap.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- `git:*` branch / paths / commit input 已有结构化输入校验，错误统一使用 `INVALID_IPC_PAYLOAD`。

## Phase 2 workspace / MCP IPC 契约校验

时间：2026-04-27 16:41:16

改了什么：
- 扩展 `src/main/ipc/schema.ts`，新增 workspace path 和 MCP serverName 校验。
- `src/main/ipc/workspace.ts` 在 `workspace:change` 写入设置前校验绝对路径。
- `src/main/ipc/mcp.ts` 在 restart / disconnect 前校验 serverName。
- 扩展 `tests/ipc-contract-regression.test.ts`，覆盖相对 workspace 路径、含换行 workspace 路径、空 serverName、含换行 serverName 和合法输入。
- 更新底层基建路线图，将 Phase 2 剩余任务和完成标准标为完成。

为什么改：
- workspace 路径和 MCP serverName 都是主进程资源选择输入，IPC 层先拒绝无效形状，后续业务层可以专注处理路径存在性、server 状态和实际操作失败。

涉及文件：
- `src/main/ipc/schema.ts`
- `src/main/ipc/workspace.ts`
- `src/main/ipc/mcp.ts`
- `tests/ipc-contract-regression.test.ts`
- `docs/todos/foundation-hardening-roadmap.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- Phase 2 IPC 契约校验任务已完成。

## Phase 3 memory 删除与反馈闭环

时间：2026-04-27 16:52:13

改了什么：
- 新增 memory delete / feedback 的 store、worker、service、IPC、preload、DesktopApi 契约链路。
- Settings Memory 列表每条记忆增加提升、降权和删除动作，动作完成后刷新 stats 和列表。
- 新增 `memory-actions.ts`，把 renderer 侧动作刷新流程抽成可测试 helper。
- 新增 `tests/memory-ui-regression.test.ts` 并纳入 `test:regression`。
- 更新底层基建路线图，将 Phase 3 的删除、反馈、列表排序、SQLite store 回归测试和“用户能查看、删除、降权记忆”标为完成。

为什么改：
- Phase 3 要把长期记忆补成可管理闭环，用户需要在 UI 中直接处理错误记忆、降低低价值记忆权重，并让反馈进入 `feedback_score`。

涉及文件：
- `src/main/memory/store.ts`
- `src/main/memory/embedding-types.ts`
- `src/main/memory/embedding.ts`
- `src/main/memory/embedding-worker.ts`
- `src/main/memory/rag-service.ts`
- `src/main/ipc/memory.ts`
- `src/main/ipc/schema.ts`
- `src/preload/index.ts`
- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/renderer/src/components/assistant-ui/settings/memory-actions.ts`
- `src/renderer/src/components/assistant-ui/settings/memory-section.tsx`
- `tests/memory-regression.test.ts`
- `tests/memory-ui-regression.test.ts`
- `tests/ipc-contract-regression.test.ts`
- `package.json`
- `docs/todos/foundation-hardening-roadmap.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- `pnpm exec tsx tests/memory-regression.test.ts` 通过。
- `pnpm exec tsx tests/memory-ui-regression.test.ts` 通过。
- `pnpm exec tsx tests/ipc-contract-regression.test.ts` 通过。

## Phase 3 memory 诊断状态展示

时间：2026-04-27 16:58:54

改了什么：
- Settings Memory 区补齐当前模型、索引模型、候选上限、模型加载状态、数据库路径。
- rebuild 动作记录最近一次结果，并在 UI 中展示进行中状态、重建数量、模型和完成时间。
- 新增 `memory-status.ts`，将 native ABI、远端嵌入请求等错误转成用户可读提示。
- 嵌入 Provider 未绑定、未启用或已删除时，在嵌入模型设置区直接提示用户重新选择。
- 扩展 `tests/memory-ui-regression.test.ts`，覆盖 native 错误提示和 rebuild 结果文案。
- 更新底层基建路线图，将 Phase 3 剩余任务和完成标准标为完成。

为什么改：
- Phase 3 的剩余缺口集中在可观察性和失败提示；用户需要看到 Memory 当前使用的模型、索引状态、数据库位置，并在 native 依赖或 embedding provider 出问题时得到明确处理路径。

涉及文件：
- `src/renderer/src/components/assistant-ui/settings/memory-status.ts`
- `src/renderer/src/components/assistant-ui/settings/memory-section.tsx`
- `tests/memory-ui-regression.test.ts`
- `docs/todos/foundation-hardening-roadmap.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- `pnpm exec tsx tests/memory-ui-regression.test.ts` 通过。
- `pnpm exec tsx tests/memory-regression.test.ts` 通过。

## 修复多行 commit message IPC 校验

时间：2026-04-27 17:04:55

改了什么：
- 调整 `git:commit` 的 `message` 校验，允许提交标题加正文的多行 commit message。
- 保留 NUL 字符拦截，分支名、路径、MCP server name 等资源选择输入继续使用单行安全字符串校验。
- 扩展 IPC 契约回归测试，覆盖多行 commit message 可通过、含 NUL message 会拒绝。

为什么改：
- 提交计划 UI 会把 commit title、description 和 plan note 组合成多行 message；上一轮 IPC 加固把 `git:commit.message` 错误限制为单行，导致用户无法提交。

涉及文件：
- `src/main/ipc/schema.ts`
- `tests/ipc-contract-regression.test.ts`
- `docs/changes/2026-04-27/changes.md`

结果：
- `pnpm exec tsx tests/ipc-contract-regression.test.ts` 通过。
- `pnpm exec tsx tests/memory-ui-regression.test.ts` 通过。

## 提交计划生成空态居中

时间：2026-04-27 17:04:18

改了什么：
- 调整右侧 diff panel 提交计划生成中的空态布局，把提示块放入更高的居中容器。
- 将提示内容限制为稳定宽度，避免宽屏右侧栏里视觉重心偏移。

为什么改：
- 生成计划时的提示块在上半区视觉偏上，需要和可用空白区域保持居中。

涉及文件：
- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `docs/changes/2026-04-27/changes.md`

结果：
- 提交计划生成中的提示块在右侧上半区水平、垂直居中更稳定。

## 提交计划视觉噪声收敛

时间：2026-04-27 17:07:51

改了什么：
- 移除提交计划卡片忙碌态的顶部进度条和额外 ring 强调。
- 移除提交计划生成空态居中提示块的内层背景和阴影，只保留居中文字、图标和说明。

为什么改：
- 提交卡顶部已有状态徽标表达进度，额外线条会干扰卡片层级。
- 生成空态需要更轻的表达，直接文字更符合右侧面板的信息密度。

涉及文件：
- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `docs/changes/2026-04-27/changes.md`

结果：
- 提交计划卡片顶部线条更干净，生成中空态保留居中但视觉更轻。

## Composer 底部控件轻量化

时间：2026-04-27 17:12:41

改了什么：
- 将 Composer 附件、模型选择、思考强度控件从盒状按钮改为透明底的轻量图标控件。
- 将底部 Git 分支切换器改为透明底文字控件，仅保留 hover 反馈。

为什么改：
- 底部工具区需要对齐 Codex 的轻量控件风格，减少按钮盒子感和边框噪声。

涉及文件：
- `src/renderer/src/components/assistant-ui/attachment.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/assistant-ui/branch-switcher.tsx`
- `docs/changes/2026-04-27/changes.md`

结果：
- 输入区底部工具控件和分支切换器视觉更轻，主发送按钮保持突出。

## Composer 控件圆角统一

时间：2026-04-27 17:14:07

改了什么：
- 将 Composer 底部附件、模型选择、思考强度、分支切换控件从 `rounded-full` 调整为统一的 `rounded-[var(--radius-shell)]`。
- 在 `AGENTS.md` 增加 UI 圆角长期约束，轻量按钮、下拉触发器、分支切换器默认沿用项目圆角 token。

为什么改：
- 项目 UI 控件需要保持统一圆角语言，底部工具控件和分支切换器应与现有按钮体系一致。

涉及文件：
- `src/renderer/src/components/assistant-ui/attachment.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/assistant-ui/branch-switcher.tsx`
- `AGENTS.md`
- `docs/changes/2026-04-27/changes.md`

结果：
- Composer 底部轻量控件保留透明底风格，同时恢复项目统一圆角。

## Composer token 统计轻量化

时间：2026-04-27 17:17:15

改了什么：
- 将 Composer 底栏的 `in / out` 与 `total` token 统计从胶囊底色改为 inline 弱文本。
- 保留 hover tooltip 详情，并给 `total` 增加轻分隔线。

为什么改：
- token 统计属于底栏辅助信息，使用胶囊底色会和轻量工具区、context 圆环的层级不一致。

涉及文件：
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-04-27/changes.md`

结果：
- Composer 底栏 token 统计更贴合整体轻量状态栏风格。
