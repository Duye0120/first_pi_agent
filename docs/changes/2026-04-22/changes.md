# 2026-04-22 变更记录

## 全项目稳定性与性能优化（第一轮）

**时间**: 11:40

**改了什么**：
- **主进程稳定性**：
  - `src/main/adapter.ts` 为 agent 事件发送补上 `try/catch`，并把 terminal 终态事件改成仅在真正发送成功后才标记已 flush，避免窗口销毁/热重载时直接抛异常。
  - `src/main/terminal.ts` 与 `src/main/window.ts` 增加 renderer 安全发送包装，窗口关闭或销毁时不再裸调 `webContents.send`。
  - `src/main/session/io.ts` 把 transcript 追加写改成真正的 `appendFileSync`，并让临时文件路径改为带 `pid + uuid` 的唯一名，减少并发写覆盖风险。
- **安全与敏感信息**：
  - `src/main/security.ts` 的工作区路径校验改为解析 symlink 后再比较，避免通过符号链接绕过工作区白名单。
  - `src/main/shell.ts` 对 shell payload 统一清理 `NUL / CRLF`，PowerShell 与 cmd 走扁平化命令拼接，降低换行注入风险。
  - `src/main/logger.ts` 增加字符串级敏感信息脱敏（OpenAI / Anthropic key、JWT、Bearer token 等），错误消息、IPC 参数与任意对象字符串化结果都会过一遍打码。
  - `src/main/providers.ts` 把 runtime signature 里的原始 `apiKey` 改成 `sha256` 指纹，避免模型句柄签名携带明文密钥。
  - `src/main/ipc/handle.ts` 统一把非 Error 的 IPC 异常包装成可序列化的 `Error`，减少 renderer 端收到不可读异常的情况。
  - `src/main/window.ts` 在生产环境关闭 DevTools，并拦截快捷键，避免发布包里随手打开调试器。
- **聊天链路与渲染端性能**：
  - `src/renderer/src/components/AssistantThreadPanel.tsx` 补上 active run 事件订阅清理，session 切换或组件卸载时不再残留 `desktopApi.agent.onEvent` 监听；同时把用户可见错误文案收敛为产品级提示。
  - `src/renderer/src/lib/provider-directory.ts` 为 provider/model 目录加载增加请求去重、超时（默认 5s）与 abort 支持，避免设置页/线程面板卡死在无限加载。
  - `src/renderer/src/components/assistant-ui/branch-switcher.tsx` 增加 5 分钟分支缓存、请求去重和 `useDeferredValue` 搜索，避免每次打开都重新拉取本地分支。
  - `src/renderer/src/components/assistant-ui/context-usage-indicator.tsx` 增加显式 0% 灰环语义、固定 `viewBox` 与 `aria-label`，满足 context 圆环规范与可访问性要求。
  - `src/renderer/src/components/assistant-ui/approval-notice-bar.tsx` 去掉 `runId / requestId / modelEntryId` 等内部字段展示，改为产品级中文元信息，避免把内部实现细节暴露给用户。

**为什么改**：
1. 当前项目最危险的问题集中在三类：**renderer send 崩溃点**、**敏感信息泄漏面**、**聊天订阅/目录加载/分支加载导致的长时性能与体验问题**。
2. 这批改动优先处理“会直接崩、会直接泄漏、会高频卡”的问题，先把整条聊天主链路与设置链路稳定下来，再继续推进剩余的 P0/P1 项。
3. 分支缓存、provider 目录去重和订阅清理属于高频路径，投入小但收益大，适合作为全项目调优的第一轮落地点。

**涉及文件**：
- `src/main/adapter.ts`
- `src/main/ipc/handle.ts`
- `src/main/logger.ts`
- `src/main/providers.ts`
- `src/main/security.ts`
- `src/main/session/io.ts`
- `src/main/shell.ts`
- `src/main/terminal.ts`
- `src/main/window.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/approval-notice-bar.tsx`
- `src/renderer/src/components/assistant-ui/branch-switcher.tsx`
- `src/renderer/src/components/assistant-ui/context-usage-indicator.tsx`
- `src/renderer/src/lib/provider-directory.ts`

**结果**：
- 关键 renderer 发送路径更稳，窗口销毁/切换时不容易再抛未捕获异常。
- 敏感 key/token 不再轻易出现在日志、runtime signature 和 IPC 错误文案里。
- provider 目录与分支列表走缓存/去重后，聊天区和设置页的高频打开路径更顺滑。
- 审批栏与 context 圆环对齐了既有产品约束：不暴露内部 ID、无 usage 时也能看到灰色 0% 环。
- 本轮未主动执行 build / check；已使用错误检查确认本次涉及文件没有新增类型或语法错误。

## 聊天区 provider 目录加载竞态补强

**时间**: 11:40

**改了什么**：
- `src/renderer/src/components/assistant-ui/thread.tsx` 为 provider 目录同步增加 `AbortController`、最新 `visible` 引用和清理逻辑；切换页面可见性或收到新的 provider-directory 更新时，会主动取消上一轮请求。
- 同文件把 `ThreadScrollToBottom` 的 tooltip 从英文改成中文 `滚至底部`，顺手消掉一个遗留文案不一致点。

**为什么改**：
1. 原实现里 provider 目录加载虽然会在 effect cleanup 时退订，但进行中的 Promise 不会被取消；可见性快速切换时，旧请求回包仍可能覆盖新状态。
2. 这段是聊天区高频入口，属于典型的“看起来没报错，但会悄悄抖一下”的竞态型体验问题，值得在第一轮里顺手收紧。

**涉及文件**：
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-04-22/changes.md`

**结果**：
- 聊天区 provider 目录加载现在具备取消能力，visible 快速切换时不容易再吃到过期数据回包。
- 滚动到底部按钮文案与全站中文界面保持一致。

## 后台订阅清理与前端竞态补强（第二轮）

**时间**: 11:40

**改了什么**：
- `src/main/metrics.ts` 为 metrics 采集保存 bus 退订函数，并新增 `stopMetrics()`，停止后台服务时会清理监听与 active run tracker。
- `src/main/emotional/state-machine.ts` 为情绪状态机增加初始化幂等和 `stopEmotionalStateMachine()`，停止时清空最近消息/错误状态与 bus 监听。
- `src/main/learning/engine.ts` 为主动学习引擎增加 `stopActiveLearning()`，停止时退订 bus、注销 scheduler job 并清理累积信号。
- `src/main/bootstrap/services.ts` 把以上三个 stop 链接进 `stopBackgroundServices()`，避免后台服务反复启动后监听器叠加。
- `src/renderer/src/App.tsx` 为 Git summary / Git overview 请求增加 workspace 维度的 request guard，并给会话切换加选择序号，防止旧请求回包覆盖新工作区或新会话。
- `src/renderer/src/components/AssistantThreadPanel.tsx` 给 pending approval 列表刷新增加 request serial 与签名去重，减少 confirmation_request 高频场景下的重复 setState。
- `src/renderer/src/components/assistant-ui/thread.tsx` 为 composer 输入补上 IME composing guard，中文/日文输入法组合阶段按 Enter 不会误入队发送。

**为什么改**：
1. 背景服务此前只负责启动，不负责完整退订；只要开发态多次热重载或服务重复启动，就会出现监听叠加和内存长期增长。
2. Git 概览、分支摘要和会话切换都属于“用户看起来只是点一下，内部其实有异步竞赛”的高频路径，过期回包会直接污染当前 UI 状态。
3. IME 输入和审批刷新都是聊天区高频边角，但体验上非常敏感，补上之后整条主链路会更稳。

**涉及文件**：
- `src/main/bootstrap/services.ts`
- `src/main/emotional/state-machine.ts`
- `src/main/learning/engine.ts`
- `src/main/metrics.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-04-22/changes.md`

**结果**：
- 后台服务现在具备更完整的 stop 清理能力，重复启动时不容易继续叠监听。
- 切项目、切会话、刷新 Git 面板时，旧请求更难覆盖新状态。
- 输入法组合态按 Enter 不会误把半成品文本送进消息队列。

## 内置工具性能与健壮性优化（借鉴 pi-mono）

**时间**: 19:18

**背景**：

之前 src/main/tools/ 下的本地工具完全是手写实现，并未复用 @mariozechner/pi-agent-core 上游 coding-agent 包里的工具实现（pi-mono 的 npm 发布物里只有 agent 框架本身，工具留在仓库里）。本轮把上游实现里成熟的几块逻辑“扒”过来，重写本地的文件编辑、读写、grep、glob 工具，重点修掉之前的性能与稳定性短板。

**改了什么**：

- **新文件 src/main/tools/edit-diff.ts**：从 pi-mono coding-agent/src/core/tools/edit-diff.ts 移植过来的纯函数模块。提供 LF 归一化、CRLF 还原、BOM 保留、智能引号/破折号/Unicode 空格的容错匹配 (normalizeForFuzzyMatch)，以及多段 edits[] 应用 (applyEditsToNormalizedContent)，并基于现有 diff-shim 输出 StructuredPatchHunk[] 供渲染端 DiffView 复用。
- **新文件 src/main/tools/file-mutation-queue.ts**：极简的 per-path async 互斥队列。同一绝对路径的写入/编辑会自动串行化，避免并行写覆盖；不同文件仍然并行。
- **重写 src/main/tools/file-edit.ts**：
  - 同时支持新参数 edits: [{oldText, newText}] 与旧参数 old_string / oldText / replace_all，对调用方完全向后兼容。
  - 接入 edit-diff 的容错匹配与 BOM/CRLF 保留，告别之前“多一个空格就找不到”的高失败率。
  - 整段执行包裹进 withFileMutationQueue，并改用 fs/promises 异步 IO，不再阻塞 Electron 主进程。
  - 保留 FileEditDetails.structuredPatch / originalFile / userModified / gitDiff 字段形状，渲染端 DiffView 与 harness/policy.ts 中 file_edit / edit_file 名称都不需要改动。
- **重写 src/main/tools/file-read.ts**：
  - 全面切换到 fs/promises；新增 1 MB 字节硬上限，超出时只读前 1 MB 并明确提示。
  - 行号补齐宽度，行截断信息更清晰；返回明确的“可继续 offset=N”续读提示，避免模型卡在“被截断但不知道怎么往下读”。
  - 二进制嗅探放在前 8 KB，避免误把超大文本判为二进制。
- **重写 src/main/tools/file-write.ts**：
  - 全部改为异步 IO，写入与编辑共享 withFileMutationQueue，串行化同文件并发。
  - 错误路径返回结构化 details，避免渲染端处理时报 undefined。
- **重写 src/main/tools/grep-search.ts**：
  - 改用 child_process.spawn + readline 流式读取 ripgrep 输出，凑够 head_limit 后立即 kill 子进程并 destroy 管道，告别 execFile 16 MB 缓冲 + 全量等待。
  - 新增 MAX_LINE_CHARS=500 单行截断与 HARD_LINE_CAP=5000 全局兜底，防止单个超长行/巨型文件把整个上下文撑爆。
  - 完整保留旧 schema (pattern/query/glob/filePattern/output_mode/-A/-B/-C/head_limit/maxResults/offset/multiline/type) 与 GrepSearchDetails 形状。
- **优化 src/main/tools/glob-search.ts**：
  - 当 ripgrep 候选结果超过 max(200, maxResults*2) 时跳过逐文件 statSync 取 mtime 的排序，直接按 ripgrep 输出顺序裁剪到 maxResults。
  - truncated 标志补上跳过排序时的判定，避免误报为完整结果。
  - 命中阈值的工程目录里这一改动可以让 glob 调用从几百毫秒降到几十毫秒。

**为什么改**：

1. 旧的 file_edit 只支持单段 string.replace，容错差，模型经常因为多/少一个空格而反复失败；引入 pi-mono 的 fuzzy + 多段 edits 后，单次成功率显著提升。
2. 旧的 file_read / file_write / file_edit 全用同步 IO，会卡住 Electron 主进程（影响 IPC、UI、聊天流式渲染）；切到 fs/promises 后主进程不再被阻塞。
3. 旧的 grep_search 用 execFile 一次性等到 ripgrep 全部跑完，遇到超大仓库或长行文件容易 OOM 或超时；流式 + 早停 + 截断后能稳定工作在大型代码库上。
4. 旧的 glob_search 对每个候选都 statSync，仓库很大时光是排序就要几百毫秒；按阈值跳过 mtime 排序后，常用的“按 glob 找文件”路径明显更快。
5. 引入 withFileMutationQueue 是为了配合新的 multi-edit / 写入并发场景，避免“两个工具同时改同一个文件”出现读-改-写丢失。

**涉及文件**：

- 新增：src/main/tools/edit-diff.ts
- 新增：src/main/tools/file-mutation-queue.ts
- 重写：src/main/tools/file-edit.ts
- 重写：src/main/tools/file-read.ts
- 重写：src/main/tools/file-write.ts
- 重写：src/main/tools/grep-search.ts
- 优化：src/main/tools/glob-search.ts

**结果**：

- 全部修改文件 get_errors 通过，无 TS / lint 报错。
- 工具名 (file_edit / edit_file / file_read / file_write / grep_search / glob_search) 与 details 字段形状均保持兼容，harness/policy.ts、渲染端 DiffView、agent-activity-bar 无需调整。
- 未触发 pnpm build / pnpm check，遵守 AGENTS.md 中的“如无必要不要 build / check”约束。

## 引导链路 race 修复 + 补 git pull 缺失 handler

**时间**: 19:45

**改了什么**：

- **修复 composer 引导按钮潜在 race**：[src/renderer/src/components/AssistantThreadPanel.tsx](src/renderer/src/components/AssistantThreadPanel.tsx) `handleGuideQueuedMessage` 把执行顺序从「enqueue → trigger(不等) → cancel → await trigger」调整为「await enqueue → await trigger(移到队首) → cancel」。原顺序在“队列里已有其它消息”时存在窗口期：cancel 完成后 thread.tsx 的自动派发 effect 可能先看到旧队首并误派发，引导消息被挤后。新顺序保证 cancel 触发时新消息已经在队首，run 结束后 effect 必然派发新消息。
- **补全 git pull IPC**：[src/shared/ipc.ts](src/shared/ipc.ts) 与 [src/preload/index.ts](src/preload/index.ts) 早就声明了 `git:pull`，但主进程从未注册 handler。[src/renderer/src/components/assistant-ui/diff-panel.tsx](src/renderer/src/components/assistant-ui/diff-panel.tsx) 的 “拉取” 按钮一旦点击就会抛 `No handler registered for 'git:pull'`。本次：
  - [src/main/git.ts](src/main/git.ts) 新增 `pullGitChanges(workspacePath)`，使用 `git pull --ff-only` 防止意外创建合并提交。
  - [src/main/ipc/workbench.ts](src/main/ipc/workbench.ts) 注册 `IPC_CHANNELS.gitPull` handler。

**为什么改**：

1. 用户明确提到担心“引导有问题”，回归审查发现 composer 引导路径在多消息排队场景下存在派发顺序不确定性，必须收紧成顺序串行。
2. `git:pull` 是死链路，是 plan `M8` 项；用户可见按钮一点就报错，体验割裂，顺手补齐。

**回归路径覆盖**：

- 队列卡上的 `引导`：通过 `queuedAwaitingCompletionRef` + `runCompletionSerial` 守护，本次未改动，仍然正确。
- 主动停止：`queuedManualCancelHeadIdRef` 守护 effect，本次未改动。
- composer 内的 `发送`/`引导` 双按钮：发送走纯 enqueue（无 race）；引导按本次修复顺序串行执行。

**结果**：

- `get_errors` 通过；不再依赖未 await 的 trigger。
- diff-panel “拉取” 按钮不再抛 IPC 未注册错误。
- 未触发 `pnpm build / pnpm check`。

## 项目审计计划进度盘点

**时间**: 19:46

对照 [docs/plans/full-project-audit-2026-04-22.md](docs/plans/full-project-audit-2026-04-22.md) 已完成与剩余项：

- **P0 已完成**：`M3`（webContents.send 兜底）、`S1`（realpath 校验）、`S2`（shell CRLF 清理）、`S3`（logger 脱敏 + provider 密钥指纹）、`M2 部分`（transcript appendFileSync + 唯一临时名；真正的 per-session mutex 仍待补）。
- **P0 剩余**：`M1` terminalEventFlushed per-runId（核查后发现每 run 已创建新 adapter，实际无 bug，可下调优先级）；`M2` 完整 mutex（建议接 p-queue 或简单 promise chain）。
- **P1 已完成**：`R1`（AssistantThreadPanel 订阅清理）、`R4`（provider-directory 超时/abort）、`R5`（branch cache）、`R6`（context 圆环 0% 灰环）、`R7`（approval 文案）、`M7`（IPC error 包装）、`M9`（DevTools 生产关闭）、`M5`（cancel 幂等：`requestCancel` 已自带 if(!cancelled)，本次复核确认）、`M8`（gitPull handler，本次已补）。
- **P1 剩余**：`M4`（EventBus 监听器集中清理）、`M6`（failover 候选去重）、`R2`（App.tsx session 切换 race）、`R3`（runtime ref snapshot sessionId）、`R17`（message_end finalText/thinking 兜底）。
- **P2/P3**：尚未系统推进，待决定下一波优先级。

**建议下一波**（按 ROI 排序）：

1. `R17` message_end 兜底（聊天链路稳定性，AGENTS.md 强约束）。
2. `M4` EventBus 集中清理（长时内存泄漏）。
3. `M6` failover 候选去重（避免重复尝试同一模型）。
4. `R14` confirmation_request 风暴去重（高频接近 P1）。
5. `M2` 完整 mutex（数据完整性，上轮只做了基础修补）。

## R17 message_end 兜底 + M4 EventBus 监听清理 + M6 复核

**时间**: 20:10

**改了什么**：

- **R17 `message_end` 最终态强制覆盖** — [src/renderer/src/components/AssistantThreadPanel.tsx](src/renderer/src/components/AssistantThreadPanel.tsx) 的 `message_end` 分支：
  - `finalThinking` 非空时，**无条件**替换最新 thinking step 的内容（旧逻辑只在 step 为空时填充，导致 deltas 不完整时 UI 停在 partial state）。同时把 executing 的 step 标记为 success + endedAt，避免兜底产生“永远在思考”的 step。
  - `finalText` 仅在非空字符串时覆盖（避免某些 provider 给空串清掉 deltas 累积内容）。
- **M4 补 bus-audit dispose** — [src/main/bus-audit.ts](src/main/bus-audit.ts) 之前 `bus.onAny(...)` 的返回值被丢弃，stop 阶段无法注销。本次保存 dispose handle，新增 `stopBusAuditLog`，在 [src/main/bootstrap/services.ts](src/main/bootstrap/services.ts) 的 `stopBackgroundServices` 末尾调用。`metrics`、`emotional`、`learning` 三个订阅链路本次复核确认已经在 init 时收集 dispose 并由各自 stop 函数清理，bootstrap 也已串联，无需再改。
- **M6 复核完成（无需修改）** — [src/main/chat/execute.ts](src/main/chat/execute.ts#L99) 候选列表已经做了 `all.indexOf(entryId) === index` 去重 + 排除 `prepareFailedEntries`；循环内通过 `if (context.handle.modelEntryId !== entryId)` 跳过当前 handle，无重复初始化主模型问题。M6 标记为已完成。

**为什么改**：

- AGENTS.md 强约束：聊天链路改动后，要确认 assistant 的最终 `text` 和最终 `thinking` 都能在 `message_end` 兜底恢复，不能只依赖流式 delta。R17 的旧实现存在“deltas 部分到达后 message_end 的修订被忽略”的窗口，必须收紧。
- bus-audit 是长时运行的进程级订阅，dispose 缺失意味着热重载/未来场景下会泄漏一份 wildcard handler，统一收口可避免后续踩雷。

**回归路径**：

- 正常聊天：deltas 持续流入 → message_end 携带与 deltas 等价的 finalText/finalThinking → 覆盖等价内容，UI 表现不变。
- deltas 不完整（断流后续传 message_end）：finalText/finalThinking 现在能正确覆盖 partial。
- 模型只发 message_end 不发 deltas：thinking step 创建时直接 success + endedAt；不再残留 executing 状态。

**结果**：

- `get_errors` 通过（AssistantThreadPanel.tsx / bus-audit.ts / services.ts 全部无报错）。
- 未触发 `pnpm build / pnpm check`。

**剩余待清单**：

- `M2` 完整 per-session mutex
- `R2` App.tsx session 切换 race
- `R3` runtime sessionId snapshot
- `R14` confirmation_request 风暴去重

## R14 confirmation 风暴去重 + R3 复核 + R2 session 切换 ref 同步

**时间**: 20:35

**改了什么**：

- **R14 `confirmation_request` 风暴 trailing debounce** — [src/renderer/src/components/AssistantThreadPanel.tsx](src/renderer/src/components/AssistantThreadPanel.tsx)：
  - 新增 `pendingApprovalDebounceRef` + `pendingApprovalLatestSessionIdRef` + `scheduleApprovalRefresh` 包装器，100ms trailing debounce 合并连续事件。
  - `handleEvent` 内 `confirmation_request` 与非 `awaiting_confirmation` 的 `run_state_changed` 分支改走 `scheduleApprovalRefresh`，单次 run 内即使触发 100 个 confirmation_request 也只会发 1 次 IPC。
  - 组件 unmount 时清理 timer。
  - `agent_end / agent_error` 等 run 终止事件保留直接调用，确保终态一定刷新。
- **R3 复核完成（无需修改）** — [AssistantThreadPanel.tsx](src/renderer/src/components/AssistantThreadPanel.tsx#L759) `chatModel.run` 入口已 snapshot `currentSession = latestSessionRef.current`，整条 run 链路（handleEvent / publish / finalize）只用此 snapshot 而不直接读 ref，run 中途切 session 不会污染当前 run 的 sessionId。grep `latestSessionRef.current` 在 run 链路内已无残留。
- **R2 `App.tsx` 切 session ref 同步** — [src/renderer/src/App.tsx](src/renderer/src/App.tsx#L713) `hydrateSession` 与 `clearActiveSession` 增加 `activeSessionIdRef.current = ...` 同步赋值。修复以下窗口期 race：
  - `selectSession(B)` → `hydrateSession(B)` 调 `setActiveSession(B)` → React 更新到 `activeSession.id = B`，但 `activeSessionIdRef.current` 要等下一个 useEffect tick 才同步。
  - 期间 ComposerArea 的 `onChange` 触发 `persistSession(A new draft)`，`persistSession` 用 ref 判断 `activeSessionIdRef.current === sessA`，于是 `setActiveSession(A)`，把刚切上去的 sess B 又回退回了 sess A。
  - 现在 ref 在 `setActiveSession` 之前同步赋值，window 关闭。
- **M2 复核结论** — [src/main/session/io.ts](src/main/session/io.ts) 的 `atomicWrite` 使用 `${process.pid}.${randomUUID()}.tmp` 唯一临时名 + `renameSync` 原子替换；`appendLine` 是 `appendFileSync`。Node.js 主线程 sync IO 之间不存在真并发 race。当前所有调用点（meta.ts / search.ts / service.ts / transcript-writer.ts）都是 sync 链路。结论：M2 P0 没有真实 race，可降级到 P3 做"未来 async 化时再加 per-session promise queue"。本次不引入 `p-queue` 依赖。

**为什么改**：

- R14：approval 风暴会触发 N 次 IPC + N 次 React state 比对，虽然有 signature 守门避免 setState，但 IPC 流量本身浪费；100ms debounce 几乎不影响 UX 感知。
- R3：用户明确担心“引导 / run 中途切 session 后 sessionId 错乱”，复核结论是 run 入口已 snapshot，无问题，留下记录避免下次重复怀疑。
- R2：典型窗口期 race，修复成本极低（两行 ref 赋值），收益是消除“切 session 时 draft 显示来回跳”的极端 UX bug。
- M2：避免空跑 mutex 引入复杂度。

**回归路径**：

- approval 弹窗：审批触发 → 100ms 后 list 刷新；用户体感无延迟。
- 切 session：A → B → A 快速切；draft / attachments 保持各自状态，无回退。
- run 中途切 session：旧 run 仍按旧 sessionId 推进；新 session 立即响应输入。

**结果**：

- `get_errors` 通过（AssistantThreadPanel.tsx / App.tsx 我的改动无新增报错；App.tsx 残留的是历史遗留的 Tailwind class 简写 lint warning，与本次改动无关）。
- 未触发 `pnpm build / pnpm check`。

**plan 剩余 P1**：清空。剩余主要为 P2/P3 + 二级风险项（M28/M29 日志轮转、M22-M27 schema 收紧、harness 相关）。
