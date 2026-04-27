# Chela 底层基建完善路线图

更新时间：2026-04-27 16:58:54

目标：把 Chela 从“执行主干已具备”推进到“适合长期持续加功能”的底层状态。路线按 6 个阶段推进，预计 12-18 轮有效改动。优先做前 3 阶段：环境 Doctor、IPC 契约校验、Memory 管理闭环。

## 当前基线

已完成：
- 行动型 Agent 工具链：`code_inspect`、`code_diagnostics`、`file_edit` 诊断建议。
- MCP 管理闭环：状态、reload、restart、disconnect、设置页展示。
- 任务恢复：todos、last tool failure、recoverable run、context 恢复入口。
- IPC 错误协议：renderer 侧能拿到稳定 `{ code, message }`。
- 回归入口：`test:regression` 覆盖 security / action-agent / foundation / memory。
- Node 版本基线：固定 Node 22.19.0。
- P1 历史风险：branch cache、sandbox、IPC 错误等已收口。
- Memory/RAG 文档与实现：spec 07/09 已对齐 SQLite + embedding worker。

当前已知缺口：
- `better-sqlite3` 原生模块存在 Node ABI 不匹配风险。
- IPC 入参校验还不系统。
- Memory 语义记忆缺少完整管理闭环。
- Provider / 模型目录还需要更稳定的错误分类和真实回归。
- Harness 长任务恢复还停留在“可读现场 + 恢复提示”阶段。
- 插件 / 扩展底座仍处于 spec 阶段。

## Phase 1：环境 Doctor

目标：让本地环境问题可以一键诊断，减少后续功能开发时的环境噪音。

预计：2 轮有效改动。

任务：
- [x] 新增 `doctor` 脚本或内置诊断入口，检查 Node 版本是否匹配 `.nvmrc` / `.node-version`。
- [x] 检查 `pnpm` 是否可用，输出版本和路径。
- [x] 检查 `tsx` 是否可执行。
- [x] 检查 `@vscode/ripgrep` 是否可执行。
- [x] 检查 `better-sqlite3` 是否能加载，输出当前 Node ABI 和模块 ABI 不匹配提示。
- [x] 检查 `node-pty` 是否能加载。
- [x] 检查 Electron 主进程关键依赖是否存在。
- [x] 给 native 依赖 ABI 不匹配提供明确修复命令。
- [x] 把 doctor 纳入 `test:regression` 或单独 `test:doctor`。

完成标准：
- [x] Node 24 ABI / Node 22 ABI 不匹配能被明确识别。
- [x] 诊断失败时返回结构化结果，不只打印散乱日志。
- [x] 文档记录常见修复路径。

结果记录：2026-04-27 15:20:19 完成第一轮环境 Doctor。新增 `src/main/doctor.ts`、`tests/doctor-regression.test.ts`、`docs/doctor.md`，并将 `doctor` / `test:doctor` 接入 `package.json`。当前本地 `better-sqlite3` 会被识别为 ABI mismatch，修复命令已随结构化结果返回。

结果记录：2026-04-27 16:00:27 补齐 `better-sqlite3` build 许可，将其加入 `pnpm.onlyBuiltDependencies`；在 Node 22.19.0 + `SystemRoot=C:\Windows` 下重建成功，`doctor` 结果为 11 项通过。

## Phase 2：IPC 契约校验

目标：让 renderer 到 main 的数据边界稳定，避免新功能把脏数据直接传入主进程。

预计：3-4 轮有效改动。

任务：
- [x] 建立 IPC schema 校验工具，统一返回 `{ code, message }`。
- [x] 优先覆盖 `settings:update`。
- [x] 覆盖 `providers:*`，特别是保存 provider、测试 provider、拉取模型、凭据写入。
- [x] 覆盖 `memory:*`，特别是 `memory:add`、`memory:list`、`memory:search`。
- [x] 覆盖 `git:*` 的 branch / paths / commit input。
- [x] 覆盖 `workspace:*` 的路径输入。
- [x] 覆盖 `mcp:*` 的 server name 输入。
- [x] 增加 IPC 契约回归测试。

完成标准：
- [x] 关键 IPC 对错误输入有稳定错误码。
- [x] renderer 侧拿到的错误都带 `code` 和用户可读 `message`。
- [x] 回归测试覆盖至少 5 类非法输入。

结果记录：2026-04-27 16:00:27 完成 Phase 2 第一轮。新增 `src/main/ipc/schema.ts` 和 `tests/ipc-contract-regression.test.ts`，`settings:update` 已覆盖非法 payload、未知字段、空 workspace、嵌套类型错误、嵌套布尔字段错误，并纳入 `test:regression`。

结果记录：2026-04-27 16:14:01 完成 Phase 2 provider 输入校验。`providers:save-source`、`providers:test-source`、`providers:fetch-models` 共享 provider draft schema；`providers:get-source`、`providers:delete-source`、`providers:get-credentials`、`providers:set-credentials` 校验 sourceId，凭据写入校验 apiKey 类型。

结果记录：2026-04-27 16:33:30 完成 Phase 2 memory 输入校验。`memory:add` 校验 content 和 metadata，`memory:search` 校验 query / limit，`memory:list` 校验 sort / limit；相关非法输入和合法输入已进入 IPC 契约回归测试。

结果记录：2026-04-27 16:37:25 完成 Phase 2 git 输入校验。`git:switch-branch`、`git:create-branch` 校验 branchName；`git:stage-files`、`git:unstage-files` 校验 paths；`git:commit` 校验 message 和 paths。

结果记录：2026-04-27 16:41:16 完成 Phase 2 workspace / MCP 输入校验。`workspace:change` 校验绝对 workspace 路径；`mcp:restart-server`、`mcp:disconnect-server` 校验 serverName。至此 Phase 2 任务和完成标准已收口。

## Phase 3：Memory 管理闭环

目标：让长期记忆从“能写能搜”升级为“可管理、可恢复、可诊断”。

预计：3-4 轮有效改动。

任务：
- [x] 新增 memory 删除能力。
- [x] 新增 memory 降权 / 反馈能力，对接 `feedback_score`。
- [x] 新增 memory rebuild 状态展示。
- [x] 增加 native 依赖不可用时的降级状态和 UI 提示。
- [x] 增加 embedding model/provider 缺失时的可读错误。
- [x] Settings Memory 区展示总数、indexed model、last indexed/rebuilt、worker state、db path。
- [x] Memory 列表支持排序：created、last matched、match count、feedback、confidence。
- [x] 补 SQLite store 真正运行的回归测试，前提是 doctor 确认 native ABI 可用。

完成标准：
- [x] 用户能查看、删除、降权记忆。
- [x] embedding / native 依赖失败时 UI 有明确提示。
- [x] rebuild 可触发、可观察、可失败恢复。

结果记录：2026-04-27 16:52:13 完成 Phase 3 第一轮 memory 管理动作。Memory store、worker、IPC、preload、renderer 设置页已串通删除和反馈；设置页每条记忆支持提升、降权和删除，动作完成后刷新统计与列表；新增 memory UI 动作回归测试并纳入 `test:regression`。

结果记录：2026-04-27 16:58:54 完成 Phase 3 第二轮 memory 诊断展示。Settings Memory 区补齐当前模型、索引模型、候选上限、模型加载状态、数据库路径；rebuild 显示进行中和上次结果；native ABI、远端嵌入请求、Provider 缺失会显示可读提示。Phase 3 任务和完成标准已收口。

## Phase 4：Provider / 模型目录稳定性

目标：让 provider 和模型目录成为可靠底座，支持后续多模型、多 provider、embedding provider 扩展。

预计：2-3 轮有效改动。

任务：
- [ ] Provider 测试结果结构化，区分认证失败、网络失败、协议失败、模型为空。
- [ ] `fetchModels` 支持取消和统一 timeout。
- [ ] provider directory cache 增加错误态和 stale fallback。
- [ ] 设置页展示最近一次 provider directory 同步状态。
- [ ] 增加真实 provider fetch 的 mockable integration test。
- [ ] 对 OpenAI-compatible / DashScope 兼容层保留真实聊天发送 smoke 流程。

完成标准：
- [ ] Provider 错误能被 UI 精确展示。
- [ ] 模型目录加载失败时可保留旧缓存。
- [ ] provider directory 的 timeout/cache/abort 有回归测试。

## Phase 5：Harness / 长任务恢复

目标：让复杂任务失败后更容易恢复，让 run 生命周期更清晰。

预计：2-3 轮有效改动。

任务：
- [ ] 标准化 run failed / aborted 的恢复提示生成。
- [ ] 把 latest tool failure、todos、transcript tail 组合成可审计 recovery prompt。
- [ ] approval interrupted 恢复结果写入 transcript。
- [ ] run lifecycle 增加失败原因分类。
- [ ] Context 卡片展示恢复入口的状态：可恢复、已恢复、恢复失败。
- [ ] 增加 Harness run lifecycle 回归测试。

完成标准：
- [ ] 失败 run 可以稳定生成恢复提示。
- [ ] 恢复动作进入正式队列模型。
- [ ] transcript 能追踪恢复来源。

## Phase 6：插件 / 扩展底座

目标：为后续 Workflow、External API Adapter、Plugin Loader 做最小可用底座。

预计：3-4 轮有效改动。

任务：
- [ ] 定义 Chela plugin manifest schema。
- [ ] 实现插件目录扫描和 manifest 校验。
- [ ] 实现插件启用 / 禁用状态存储。
- [ ] 定义插件权限边界：tools、MCP servers、UI panels、workflows。
- [ ] External API Adapter 最小接口。
- [ ] Workflow 编排最小版本：串行步骤、工具调用、失败停止、状态持久化。
- [ ] 插件加载失败不影响主应用启动。
- [ ] 增加插件 manifest 回归测试。

完成标准：
- [ ] 插件可以被扫描、校验、启停。
- [ ] 无效插件有明确错误。
- [ ] Workflow 能跑最小串行任务。

## 推荐执行顺序

1. Phase 1：环境 Doctor
2. Phase 2：IPC 契约校验
3. Phase 3：Memory 管理闭环
4. Phase 4：Provider / 模型目录稳定性
5. Phase 5：Harness / 长任务恢复
6. Phase 6：插件 / 扩展底座

阶段 1-3 完成后，Chela 的底层会从“能继续堆功能”提升到“适合长期加功能”。阶段 4-6 完成后，Chela 会更接近稳定的行动型 Agent 平台。
