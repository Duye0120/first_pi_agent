# 2026-04-25 变更记录

## 本地模型提供商快捷入口

时间：2026-04-25 10:57:49

改了什么：
- 在模型设置页的提供商列表顶部增加 `Ollama` 和 `LM Studio` 快捷入口。
- `Ollama` preset 默认使用 `http://localhost:11434/v1`，并预置一个可编辑模型条目 `qwen2.5:7b`。
- `LM Studio` preset 默认使用 `http://localhost:1234/v1`，并预置一个可编辑模型条目 `local-model`。
- 两个本地 preset 都走 `openai-compatible` provider，并写入本地兼容参数，关闭 store、developer role 和 reasoning effort，使用 `max_tokens` 输出字段。
- provider runtime 对 localhost / 127.0.0.1 / ::1 的 OpenAI-compatible source 增加本地占位 API Key fallback，方便 Ollama / LM Studio 这类本地服务直接进入统一模型解析链路。

为什么改：
- 后续 RAG、记忆总结、工具模型和聊天模型都需要复用统一模型目录。
- 把 Ollama / LM Studio 做成 provider preset，可以少走手动填写 Base URL、类型、模型条目和本地占位密钥的重复步骤。

涉及文件：
- [src/renderer/src/components/assistant-ui/settings/keys-section.tsx](/D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/keys-section.tsx)
- [src/main/providers.ts](/D:/a_github/first_pi_agent/src/main/providers.ts)

结果：
- 用户可以在 `设置 -> 模型` 里一键创建 Ollama 或 LM Studio provider，再按本机实际模型 ID 调整条目并保存。
- 本地 OpenAI-compatible provider 可以使用占位密钥进入运行时，后续 RAG 相关模型路由能直接复用这些模型条目。
- 文件级 TypeScript 诊断通过；本轮按 AGENTS.md 约束保持轻量验证。

## Memory 工具模型接入 RAG 链路

时间：2026-04-25 11:07:21

改了什么：
- `Memory` 设置里的 `记忆工具模型` 接入查询重写链路，优先使用 `memory.toolModelId`，未配置时回退工具模型，再回退聊天模型。
- `getSemanticMemoryPromptSection` 在构建聊天 context 时读取 Memory 开关、自动检索、查询重写、最大检索数和相似度阈值。
- 聊天 context 现在会把 SQLite 向量库检索结果注入到 `向量记忆检索结果` 段落。
- 聊天 run 正常完成后会触发 `memory_refresh` background run，用记忆工具模型从最新一轮对话中提取长期记忆，并写入向量库。
- 修正 Memory rebuild worker 返回字段，统一为 `rebuiltCount / completedAt`，对齐共享契约。

为什么改：
- Ollama / LM Studio 入口已经进入统一模型目录，Memory 需要真正消费这类本地模型来做查询重写和自动提取。
- 向量库已有 add/search/rebuild baseline，缺少的是聊天主链对向量检索结果和自动写入的实际调用。

涉及文件：
- [src/main/memory/service.ts](/D:/a_github/first_pi_agent/src/main/memory/service.ts)
- [src/main/memory/embedding.ts](/D:/a_github/first_pi_agent/src/main/memory/embedding.ts)
- [src/main/chat/finalize.ts](/D:/a_github/first_pi_agent/src/main/chat/finalize.ts)

结果：
- 开启 Memory 后，每轮聊天会按设置执行向量检索并注入相关记忆。
- 开启自动总结后，完成聊天会异步提取长期记忆并写入本地向量库。
- 文件级 TypeScript 诊断通过；本轮按 AGENTS.md 约束保持轻量验证。

## 向量记忆命中强化

时间：2026-04-25 11:32:16

改了什么：
- 为 SQLite Memory 表增加 `match_count`、`feedback_score`、`last_matched_at` 三个字段，旧库启动时自动补列。
- 每次向量检索结果达到相似度阈值后，会给命中的记忆执行 `match_count + 1`，并刷新 `last_matched_at`。
- 向量检索排序加入轻量强化权重：语义相似度仍然是主分，历史命中和反馈分只提供小幅排序修正。
- `MemorySearchResult` 补充 `matchCount`、`feedbackScore`、`lastMatchedAt`、`rankScore` 字段。
- Memory 设置页统计区增加 `累计命中`，方便确认记忆强化是否生效。
- Store 层预留 `adjustFeedback(memoryId, delta)`，后续用户纠错入口可以直接接正负反馈。

为什么改：
- 记忆多次被高相似度检索命中，说明它对当前用户和项目语境更有复用价值。
- 命中次数和反馈分持久化后，后续可以继续扩展“用户确认正确加分、用户标记错误扣分”的闭环。

涉及文件：
- [src/main/memory/store.ts](/D:/a_github/first_pi_agent/src/main/memory/store.ts)
- [src/main/memory/retrieval.ts](/D:/a_github/first_pi_agent/src/main/memory/retrieval.ts)
- [src/main/memory/embedding.ts](/D:/a_github/first_pi_agent/src/main/memory/embedding.ts)
- [src/main/memory/rag-service.ts](/D:/a_github/first_pi_agent/src/main/memory/rag-service.ts)
- [src/main/memory/service.ts](/D:/a_github/first_pi_agent/src/main/memory/service.ts)
- [src/shared/contracts.ts](/D:/a_github/first_pi_agent/src/shared/contracts.ts)
- [src/renderer/src/components/assistant-ui/settings/memory-section.tsx](/D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/memory-section.tsx)

结果：
- 达到阈值的向量记忆会随检索次数积累可信度信号。
- Memory 统计页可以看到累计命中数增长。
- 文件级 TypeScript 诊断通过；本轮按 AGENTS.md 约束保持轻量验证。

## 聊天文件改动摘要样式

时间：2026-04-25 11:35:07

改了什么：
- 将 assistant 消息底部的本轮文件改动摘要从大统计卡调整为紧凑胶囊样式。
- 摘要首行展示 `已编辑 / 已新增 / 已恢复`、主文件名或文件数量、总新增和总删除行数。
- 展开区展示“已编辑的文件”列表，每个文件显示路径、状态、单文件新增和删除行数。
- 数字格式化器提升为模块级常量，减少聊天列表渲染时的重复对象创建。

为什么改：
- 用户希望聊天里能像 Codex 一样快速看清本轮编辑了哪些文件，以及每个文件的增删规模。
- 紧凑样式更适合聊天流，减少大面积卡片对正文阅读的干扰。

涉及文件：
- [src/renderer/src/components/assistant-ui/thread.tsx](/D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/thread.tsx)
- [docs/changes/2026-04-25/changes.md](/D:/a_github/first_pi_agent/docs/changes/2026-04-25/changes.md)

结果：
- 每条带 `runChangeSummary` 的 assistant 消息会显示可折叠的文件改动摘要。
- 文件级 TypeScript 诊断通过；本轮按 AGENTS.md 约束保持轻量验证，未运行 build。

## 工作区边栏按钮组位置调整

时间：2026-04-25 14:23:48

改了什么：
- 还原工作区边栏左侧的文件树和提交计划面板顺序。
- 将提交计划动作按钮组抽成局部控件，并放到文件树顶部右侧。
- 将 `暂存 / 取消暂存` 入口也放到文件树顶部右侧，位于提交计划动作按钮组之前。
- 提交计划标题下方的 `已选`、`计划`、`由 commit skill` 标签改为可换行排列，避免窄宽度下出现横向滚动条。
- 单个提交计划时也显示一键提交按钮，tooltip 显示 `提交当前计划`。
- 修正单个提交计划按钮的点击 handler 早退条件，让单个计划也能执行提交。
- `暂存 / 取消暂存` 改为纯图标按钮，并保留 tooltip 和 aria-label。
- 恢复底部提交计划面板的高度拖拽方向。

为什么改：
- 用户要调整的是顶部 `暂存` 和底部提交计划动作按钮组的位置关系，不改变文件树和提交计划面板顺序。
- 生成提交计划和暂存都围绕当前勾选文件发生，放在文件列表顶部更贴近当前操作。
- 底部标签信息量低，优先紧凑展示，空间不足时直接换行。
- 单个计划同样需要快速提交入口，图标化暂存能减少顶部操作区宽度压力。
- 单个提交按钮已经显示，点击链路需要同步放开单组计划。

涉及文件：
- [src/renderer/src/components/assistant-ui/diff-panel.tsx](/D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/diff-panel.tsx)
- [docs/changes/2026-04-25/changes.md](/D:/a_github/first_pi_agent/docs/changes/2026-04-25/changes.md)

结果：
- 文件树仍在上方，提交计划仍在下方。
- 文件树顶部右侧显示图标版 `暂存 / 取消暂存`、生成计划、清空计划和提交按钮组。
- 单个提交计划时，顶部提交按钮可以直接提交当前计划。
- 提交计划底部标签优先单行展示，空间不足时自动换行。

## 聊天工具调用分组样式

时间：2026-04-25 15:38:25

改了什么：
- 将 assistant 消息里连续的工具调用步骤合并成 `command_group` 展示项。
- 工具调用分组首行显示 `Ran N commands` 或运行中的 `Running N commands`。
- 分组支持点击展开和收起，展开后逐行显示 `已运行 / 运行中 / 失败 / 已停止` 与对应命令摘要。
- 命令摘要会把 `shell_exec`、`grep_search`、`glob_search`、`file_read`、`file_write`、`file_edit` 等工具转成更接近命令行的文本。
- 保留原始 step 数据，只在 renderer 组装 assistant-ui parts 时合并展示。

为什么改：
- 原先每个工具调用单独占一行，聊天区域会出现大量“思考 / 读取文件 / grep search”的列表。
- Codex 风格的命令分组更适合聊天流阅读，同时保留展开查看执行细节的能力。

涉及文件：
- [src/renderer/src/components/AssistantThreadPanel.tsx](/D:/a_github/first_pi_agent/src/renderer/src/components/AssistantThreadPanel.tsx)
- [src/renderer/src/components/ui/tool-fallback.tsx](/D:/a_github/first_pi_agent/src/renderer/src/components/ui/tool-fallback.tsx)
- [docs/changes/2026-04-25/changes.md](/D:/a_github/first_pi_agent/docs/changes/2026-04-25/changes.md)

结果：
- 聊天里的连续工具调用会显示为可折叠命令列表。
- 文件级 TypeScript 诊断通过；本轮按 AGENTS.md 约束保持轻量验证，未运行 build。

## 聊天思考折叠行样式

时间：2026-04-25 15:43:29

改了什么：
- 将聊天里的 `Reasoning` 思考块改成轻量折叠行。
- 首行展示 `思考`、`进行中 / 已完成` 状态和箭头。
- 运行中状态保留 spinner，完成状态使用中性图标底色。
- 展开内容改为弱背景文本块，限制最大高度并支持内部滚动。

为什么改：
- 用户希望思考区域和 `Ran N commands` 工具分组保持相近的信息密度与折叠交互。
- 思考内容默认收起能减少聊天流里的纵向占用，点击后仍可查看完整内容。

涉及文件：
- [src/renderer/src/components/assistant-ui/reasoning.tsx](/D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/reasoning.tsx)
- [docs/changes/2026-04-25/changes.md](/D:/a_github/first_pi_agent/docs/changes/2026-04-25/changes.md)

结果：
- 聊天里的思考部分会显示为可展开的紧凑行。
- 文件级 TypeScript 诊断通过；本轮按 AGENTS.md 约束保持轻量验证，未运行 build。

## 聊天思考 think 标识

时间：2026-04-25 15:46:49

改了什么：
- 将聊天思考折叠行左侧的 lucide 图标替换为 `think` 文本胶囊。
- 移除 `BrainCircuitIcon` 和 `LoaderCircleIcon` 引用。
- 保留 `进行中 / 已完成` 状态文本和展开箭头。

为什么改：
- 用户希望思考行减少图标感，用更直接的 `think` 文本标识表达这一段内容。

涉及文件：
- [src/renderer/src/components/assistant-ui/reasoning.tsx](/D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/reasoning.tsx)
- [docs/changes/2026-04-25/changes.md](/D:/a_github/first_pi_agent/docs/changes/2026-04-25/changes.md)

结果：
- 思考行左侧显示 `think`，整体仍保持可展开折叠交互。
- 文件级 TypeScript 诊断通过；本轮按 AGENTS.md 约束保持轻量验证，未运行 build。

## 聊天命令分组展开详情框

时间：2026-04-25 16:23:19

改了什么：
- 调整 `Ran N commands` 展开态的详情区域样式。
- 展开后命令列表包裹在弱背景详情框中，增加轻量 ring 和内部留白。
- 每条命令保持 `已运行 / 运行中 / 失败 / 已停止` 与命令摘要两列展示。

为什么改：
- 用户希望命令分组和 Codex 一样，点击展开后能更清楚地查看详情。

涉及文件：
- [src/renderer/src/components/ui/tool-fallback.tsx](/D:/a_github/first_pi_agent/src/renderer/src/components/ui/tool-fallback.tsx)
- [docs/changes/2026-04-25/changes.md](/D:/a_github/first_pi_agent/docs/changes/2026-04-25/changes.md)

结果：
- `Ran N commands` 点击展开后会显示更明确的命令详情框。
- 文件级 TypeScript 诊断通过；本轮按 AGENTS.md 约束保持轻量验证，未运行 build。

## 聊天命令分组展开入口修正

时间：2026-04-25 16:35:16

改了什么：
- 将 `Ran N commands` 的折叠触发行放进命令详情框顶部。
- 详情框顶部始终显示标题和箭头，点击这一行即可展开或收起命令列表。
- 命令明细继续保留在同一个详情框内部。

为什么改：
- 用户反馈展开态只看到命令明细，缺少可点击标题和箭头提示。
- 把触发入口固定在详情框顶部后，收起和展开状态都有明确操作位置。

涉及文件：
- [src/renderer/src/components/ui/tool-fallback.tsx](/D:/a_github/first_pi_agent/src/renderer/src/components/ui/tool-fallback.tsx)
- [docs/changes/2026-04-25/changes.md](/D:/a_github/first_pi_agent/docs/changes/2026-04-25/changes.md)

结果：
- `Ran N commands` 标题和箭头会始终显示在命令详情框顶部。
- 文件级 TypeScript 诊断通过；本轮按 AGENTS.md 约束保持轻量验证，未运行 build。

## 聊天单条命令详情展开

时间：2026-04-25 16:44:42

改了什么：
- 为 `Ran N commands` 展开后的每条命令增加独立折叠交互。
- 命令行有详情时右侧显示箭头，点击后展开 Shell 或工具输出块。
- `AssistantThreadPanel` 在构建 `command_group` 时同步传入每条命令的详情标题、输出内容和错误内容。
- Shell 命令详情优先展示 `$ command`、stdout 和 stderr；其他工具展示工具返回文本。

为什么改：
- 用户希望命令列表中的单条 `已运行 command` 也能像 Codex 一样继续展开查看详情。

涉及文件：
- [src/renderer/src/components/AssistantThreadPanel.tsx](/D:/a_github/first_pi_agent/src/renderer/src/components/AssistantThreadPanel.tsx)
- [src/renderer/src/components/ui/tool-fallback.tsx](/D:/a_github/first_pi_agent/src/renderer/src/components/ui/tool-fallback.tsx)
- [docs/changes/2026-04-25/changes.md](/D:/a_github/first_pi_agent/docs/changes/2026-04-25/changes.md)

结果：
- 命令分组支持两层展开：先展开命令列表，再展开单条命令详情。
- 文件级 TypeScript 诊断通过；本轮按 AGENTS.md 约束保持轻量验证，未运行 build。

## 聊天命令详情 Codex 样式对齐

时间：2026-04-25 16:57:53

改了什么：
- 将 `Ran N commands` 外层恢复为轻量文本触发行。
- 命令列表行恢复为轻量文本行，单条命令展开后才显示灰色详情块。
- Shell 命令展开时，命令行摘要显示为 `命令`，具体命令和输出放入下方详情块。
- 单条命令详情块移除额外描边，使用弱背景、圆角、内部滚动和右下角状态。

为什么改：
- 用户指定以 Codex 参考图为准：分组和命令行保持轻，详情内容用灰色块承载。

涉及文件：
- [src/renderer/src/components/ui/tool-fallback.tsx](/D:/a_github/first_pi_agent/src/renderer/src/components/ui/tool-fallback.tsx)
- [docs/changes/2026-04-25/changes.md](/D:/a_github/first_pi_agent/docs/changes/2026-04-25/changes.md)

结果：
- 命令分组外观更接近参考图，命令详情只在单条命令展开后显示。
- 文件级 TypeScript 诊断通过；本轮按 AGENTS.md 约束保持轻量验证，未运行 build。

## 聊天命令详情状态细节对齐

时间：2026-04-25 17:00:29

改了什么：
- 将单条命令详情块底部状态改成图标加文字的紧凑展示，例如 `成功` 前显示 check 图标。
- 运行中、失败、已停止状态分别复用对应图标和颜色。
- 将命令详情块背景改为更接近参考图的弱灰底，保留轻量圆角和内部滚动。

为什么改：
- 用户指定最新 Codex 参考图作为目标样式，详情块右下角状态需要和图中 `✓ 成功` 的表达一致。
- 命令组外层和命令行保持轻量，灰色块只承载展开后的具体命令输出。

涉及文件：
- [src/renderer/src/components/ui/tool-fallback.tsx](/D:/a_github/first_pi_agent/src/renderer/src/components/ui/tool-fallback.tsx)
- [docs/changes/2026-04-25/changes.md](/D:/a_github/first_pi_agent/docs/changes/2026-04-25/changes.md)

结果：
- 单条命令展开后，详情块的状态反馈更贴近参考图。
- 本轮继续按 AGENTS.md 约束使用文件级诊断，未运行 build。

## 聊天思考行标题精简

时间：2026-04-25 20:29:43

改了什么：
- 将思考折叠行左侧的 `think` 改为普通文本样式。
- 移除同一行里的 `思考` 标题文字。
- 收窄展开内容的左侧缩进，使内容块跟精简后的触发行对齐。

为什么改：
- 用户反馈 `think` 和 `思考` 语义重复，希望思考区域只保留一个 `think` 入口。

涉及文件：
- [src/renderer/src/components/assistant-ui/reasoning.tsx](/D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/reasoning.tsx)
- [docs/changes/2026-04-25/changes.md](/D:/a_github/first_pi_agent/docs/changes/2026-04-25/changes.md)

结果：
- 聊天思考行显示为 `think`、状态和展开箭头，信息更紧凑。
- 本轮继续按 AGENTS.md 约束使用文件级诊断，未运行 build。

## 聊天标题生成链路修正

时间：2026-04-25 20:36:06

改了什么：
- 聊天自动标题生成改为优先使用 `subagent` 模型路由。
- 未配置或调用失败时，标题生成继续按 `utility`、`chat` 顺序回退。
- `saveSessionProjection` 不再把 renderer 的临时 session title 写回持久化 meta。

为什么改：
- 用户反馈新聊天标题看起来直接使用首条消息截断结果。
- 现有代码确实先用首条消息生成临时标题，后台生成标题又可能被 renderer 的异步持久化投影覆盖。
- 标题字段需要由首条用户消息占位、自动标题生成和手动重命名链路集中管理。

涉及文件：
- [src/main/worker-service.ts](/D:/a_github/first_pi_agent/src/main/worker-service.ts)
- [src/main/session/service.ts](/D:/a_github/first_pi_agent/src/main/session/service.ts)
- [docs/changes/2026-04-25/changes.md](/D:/a_github/first_pi_agent/docs/changes/2026-04-25/changes.md)

结果：
- 新聊天完成后会优先走 `subagent` 模型生成标题。
- renderer 的临时首句标题不会在后台自动标题完成后覆盖生成结果。
- 本轮继续按 AGENTS.md 约束使用文件级诊断，未运行 build。

## 模型目录拉取远端模型列表

时间：2026-04-25 16:18:32

改了什么：
- 模型设置页 `模型目录` 卡片右上角新增 `拉取模型列表` 按钮，仅在自定义提供商上可用。
- 主进程 `providers.fetchSourceModels` 按 provider 类型走对应协议拉取远端模型列表：`openai` / `openai-compatible` 走 `GET {baseUrl}/models`，`anthropic` 走 `/v1/models` 配合 `x-api-key` + `anthropic-version`，`google` 走 `v1beta/models?key=...`。
- 拉取请求统一带 15 秒 AbortController 超时，本地 OpenAI-compatible 源沿用占位 `local` API Key 兜底。
- 渲染端把远端模型 ID 与现有条目按大小写不敏感去重后追加为草稿条目，命中已知模型元数据的会自动填入 detected 能力和上下文/输出限制。
- 拉取结果在 `模型目录` 卡片体内以紧凑提示条展示：成功展示新增和合计数量，失败展示远端错误文案。
- `SettingsCard` 增加 `headerAction` 插槽，标题与右侧动作按钮同行对齐。

为什么改：
- Ollama / LM Studio / OpenAI 兼容服务的可用模型经常变化，原先只能手动一条条添加。
- Anthropic 和 Google 也支持 `/models` 列表接口，统一抽象一次后所有 provider 类型都能复用。
- 拉取的模型默认进入草稿态，用户仍需点击 `保存修改` 才会持久化，避免误覆盖现有模型条目。

涉及文件：
- [src/shared/contracts.ts](/D:/a_github/first_pi_agent/src/shared/contracts.ts)
- [src/shared/ipc.ts](/D:/a_github/first_pi_agent/src/shared/ipc.ts)
- [src/preload/index.ts](/D:/a_github/first_pi_agent/src/preload/index.ts)
- [src/main/providers.ts](/D:/a_github/first_pi_agent/src/main/providers.ts)
- [src/main/ipc/providers.ts](/D:/a_github/first_pi_agent/src/main/ipc/providers.ts)
- [src/renderer/src/components/assistant-ui/settings/shared.tsx](/D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/shared.tsx)
- [src/renderer/src/components/assistant-ui/settings/keys-section.tsx](/D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/keys-section.tsx)
- [docs/changes/2026-04-25/changes.md](/D:/a_github/first_pi_agent/docs/changes/2026-04-25/changes.md)

结果：
- 自定义 provider 配好 Base URL 和 API Key 后，可点击 `拉取模型列表` 一键拉满模型目录。
- 重复模型自动跳过，已知模型自动带上 detected 元数据。
- 文件级 TypeScript 诊断通过；本轮按 AGENTS.md 约束保持轻量验证，未运行 build。


## 记忆嵌入接入 Provider 远端模型

- 时间：2026-04-25 16:42:10
- 改了什么：记忆/RAG 的嵌入模型不再局限于本地 `Xenova/bge-small-zh`，可以选用任一已配置 Provider 中具备 embedding 能力（或 ID 含 embed/bge/e5/m3/gte/nomic 关键词）的远端模型；嵌入设置中新增 `embeddingProviderId` 与本地模型解耦。
- 为什么改：用户在 Provider 配置了 Ollama 的 `bge-m3:latest` 等嵌入模型后，希望直接拿来做记忆向量化，避免再下载本地模型，也避免再走一遍冷启动。
- 涉及文件：
  - `src/shared/memory.ts`：`MemoryEmbeddingModelId` 改为 `string`，新增 `isLocalEmbeddingModelId`。
  - `src/shared/contracts.ts`：`Settings.memory` 增加 `embeddingProviderId: string | null`。
  - `src/main/settings.ts`：默认值与 normalize 处理新字段。
  - `src/main/providers.ts`：新增 `resolveEmbeddingProvider`，解析远端 base URL 与 API Key（保留 local 占位 key）。
  - `src/main/memory/embedding.ts`：worker 端新增 `encodeViaProvider`（POST `/embeddings`，兼容 OpenAI 与 Ollama 响应），AddRequest/SearchRequest/RebuildRequest 与 `MemoryWorkerClient` 全链路携带 `provider`。
  - `src/main/memory/rag-service.ts`：根据 settings 解析 provider，再透传给 worker。
  - `src/renderer/src/components/assistant-ui/settings/memory-section.tsx`：嵌入选择器换成分组式 `ModelSelector`，本地模型 + 已配置 Provider 中可用的远端嵌入模型分组展示，并补充 Provider 缺失时的提醒。
- 结果：在“记忆设置”里可以直接选 `Ollama / bge-m3:latest` 这类远端嵌入模型；切换后向量化与检索都会通过 Provider HTTP 接口完成，索引模型变化时仍会触发原有“待重建索引”提示。

## 记忆 worker 拆分独立 entry 修复 BrowserWindow 报错

- 时间：2026-04-25 17:08:30
- 改了什么：把 `src/main/memory/embedding.ts` 中的 worker 线程逻辑拆分到独立入口 `src/main/memory/embedding-worker.ts`，类型集中到 `embedding-types.ts`；`electron.vite.config.ts` 主进程构建增加二号 input 让 worker 单独打包；`MemoryWorkerClient` 改用 `new URL("./embedding-worker.js", import.meta.url)` 加载 worker。
- 为什么改：之前 worker 复用主进程同一个 ESM bundle，bundle 顶部 `import { BrowserWindow } from "electron"` 在 `worker_threads` 内不会被 Electron 的模块加载器接管，触发 `SyntaxError: The requested module 'electron' does not provide an export named 'BrowserWindow'`，导致 `memory:rebuild` 等请求直接失败。
- 涉及文件：
  - `src/main/memory/embedding-types.ts`：新增，集中导出 worker 双方共用的类型。
  - `src/main/memory/embedding-worker.ts`：新增，承载 `encodeViaProvider`、`createEmbeddingRuntime`、`startMemoryWorker` 与 worker bootstrap，仅依赖 `node:worker_threads`、SQLite store、retrieval、`@xenova/transformers`，不再触碰 electron。
  - `src/main/memory/embedding.ts`：精简为 `MemoryWorkerClient`，并通过相邻 entry chunk URL 启动 worker。
  - `electron.vite.config.ts`：主进程 `rollupOptions.input` 增加 `embedding-worker`，`entryFileNames` 固定为 `[name].js`。
- 结果：本地 / 远端嵌入模型在重建、检索、写入路径都能正常落到 worker；切换到 Ollama `bge-m3:latest` 后“重建所有向量”不再抛 BrowserWindow 错误。⚠️ 该改动涉及构建配置，需重新启动 `pnpm dev` 以让 electron-vite 应用新的多入口配置。

## 设置更新动态导入警告处理

时间：2026-04-25 21:10:11

改了什么：
- 将 `settings.ts` 中对 `network/proxy` 和 `logger` 的动态导入改为顶部静态导入。
- 将异步 `.then/.catch` 改为同步 `try/catch`，保留网络配置变更时才重建 dispatcher 的逻辑。

为什么改：
- Vite 构建时提示同一模块同时被动态导入和静态导入，动态导入无法拆出独立 chunk。
- 这两个模块已经在主进程其他入口静态加载，设置更新处继续使用静态导入更符合当前打包结构。

涉及文件：
- [src/main/settings.ts](/D:/a_github/first_pi_agent/src/main/settings.ts)
- [docs/changes/2026-04-25/changes.md](/D:/a_github/first_pi_agent/docs/changes/2026-04-25/changes.md)

结果：
- 构建时不再因为 `settings.ts` 的这两处动态导入触发该类 Vite 分包警告。
- 本轮继续按 AGENTS.md 约束使用文件级诊断，未运行 build。

## Memory worker 启动失败诊断与 better-sqlite3 ABI 重建

时间：2026-04-25 21:25

改了什么：
- `embedding-worker.ts`：fatal 错误改为延迟 50ms 再 `process.exit(1)`，避免 `parentPort.postMessage` 在退出时被丢失。
- `embedding.ts`：`MemoryWorkerClient` 识别 `id:"bootstrap"` 的失败消息并写入 `appLogger` 的 `memory.worker` 作用域。
- 通过 `pnpm dlx @electron/rebuild -f -o better-sqlite3 -v 41.1.0` 为 Electron 41 重装 prebuilt 二进制。

为什么改：
- 升级 Electron 后 `better-sqlite3` 仍是为 Electron 38（NODE_MODULE_VERSION 137）编译，当前 ABI 145 加载失败，但 worker 直接 `process.exit(1)` 退出，主线程只能看到 `exited with code 1`，定位不到根因。

涉及文件：
- `src/main/memory/embedding-worker.ts`
- `src/main/memory/embedding.ts`

结果：
- worker 启动失败现在会在 `app.log` 里打出 `Chela memory worker bootstrap failed` 含完整 stderr。
- `better-sqlite3` 已重新安装为 Electron 41 兼容版本，等待重启 Chela 后回归验证。

## P0 安全策略补强

时间：2026-04-25 21:38:15

改了什么：
- `security.ts`：敏感读路径和写保护路径在匹配前统一解析 symlink，glob 匹配改为专用转换函数；组合 shell 命令逐段校验，含 CR/LF、`;`、`&`、pipe 且混入非白名单指令时直接拒绝。
- `logger.ts`：导出日志消息和值脱敏函数，日志 `message` 字段也走字符串级脱敏，递归对象继续按敏感 key 和 inline key/token 模式打码。
- `providers.ts` 及调用点：`resolveModelEntry` 返回 `getApiKey()`，运行时模型对象避免直接暴露可枚举 `apiKey` 字段。
- `tests/security-regression.test.ts`：新增 symlink 写保护绕过、PowerShell CR/LF 多行注入、递归日志脱敏的回归用例。

为什么改：
- 外部审查口径里 `S1/S2/S3` 仍是最高风险项；现有实现已经覆盖了一部分路径，但 symlink 指向受保护目录、日志 message 字段和模型解析对象明文 key 仍有补强空间。

涉及文件：
- `src/main/security.ts`
- `src/main/logger.ts`
- `src/main/providers.ts`
- `src/main/agent.ts`
- `src/main/context/snapshot.ts`
- `src/main/memory/service.ts`
- `src/main/worker-service.ts`
- `tests/security-regression.test.ts`
- `docs/changes/2026-04-25/changes.md`

结果：
- 文件策略对 symlink 后的真实路径执行敏感读与写保护判断。
- 组合 shell payload 无法借安全首段绕过白名单。
- 主日志消息、嵌套对象和模型解析结果减少 API Key 明文暴露面。
- 当前 Windows Node 24.13/24.14 在本机启动时触发 `ncrypto::CSPRNG(nullptr, 0)` 断言，回归测试文件已落地，待 Node 运行时恢复后执行 `pnpm exec tsx tests/security-regression.test.ts`。

## 主线 P0/P1 稳定性补强

时间：2026-04-25 21:49:49

改了什么：
- `adapter.ts`：终态事件 flush 状态从单布尔位改为按 `runId` 记录，保留“发送成功后才标记已 flush”的语义。
- `session/write-lock.ts`：新增 session 写入临界区工具。
- `session/transcript-writer.ts`：追加 transcript 前读取真实最后 seq，并在 session 写锁内完成 append、meta seq 和 index 更新。
- `session/service.ts`：`updateSessionMeta` 进入同一 session 写锁，减少 meta 与 transcript 写入互相覆盖的窗口。
- `chat/cancel.ts`：同一 `runId` 的取消请求做短期幂等，避免重复触发 `cancelAgent`。
- `chat/cancel.ts`：取消幂等 Set 的 30 秒清理定时器在所有 return 分支前注册，避免命中 active run 时长期残留。
- `window.ts`：继续保留生产环境 DevTools 关闭和快捷键拦截；renderer sandbox 因 preload bridge 兼容性进入后续专项。
- `AssistantThreadPanel.tsx` / `thread.tsx`：composer draft 按 session 持久化，切换会话时恢复对应草稿，快速切换时定时保存绑定原 session。

为什么改：
- 主线 P0/P1 里仍有数据完整性、终态事件、取消幂等和窗口安全隔离缺口；这些项直接影响聊天消息持久化、连续 run 终态送达和长时稳定性。

涉及文件：
- `src/main/adapter.ts`
- `src/main/chat/cancel.ts`
- `src/main/session/write-lock.ts`
- `src/main/session/transcript-writer.ts`
- `src/main/session/service.ts`
- `src/main/window.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-04-25/changes.md`

结果：
- 连续 run 的终态事件按 run 维度去重。
- transcript seq 以文件实际最后一行为准，降低 stale meta 导致的重复 seq 和覆盖风险。
- 重复点击取消只触发一次取消动作。
- 生产环境 DevTools 入口保持关闭，renderer sandbox 迁移单独验收。
- 快速切换 session 时，未发送的输入草稿会留在原会话并在切回时恢复。

## 建立 docs/todos 目录与待办索引

时间：2026-04-25 21:50

改了什么：
- 新建 `docs/todos/` 目录用于沉淀「想做但没做」的事项。
- 新增 `docs/todos/README.md` 作为索引：按来源（plan / spec / AGENTS 约束 / 讨论稿）聚合，不重复细节，只指向源文档。
- 新增 `docs/todos/memory-system-signal-driven.md`：保存与用户讨论的「类人记忆 = 4 类信号通道 + 候选事件总线 + 可学习评分器」设计稿。

为什么改：
- 当前 plan / spec / AGENTS 约束分散在多处，单个 audit 文件 75 条问题，缺一个统一入口看「下一步该做啥」。
- 类人记忆设计是讨论结论，不属于已有 plan/spec 的范围，需要单独留痕，避免后续遗忘。

涉及文件：
- `docs/todos/README.md`（新增）
- `docs/todos/memory-system-signal-driven.md`（新增）

结果：
- 后续新增 todo 直接在 `docs/todos/` 下加文件并在 README 追加链接；完成项从源文档勾掉同时删 README 对应行。

## 回滚 renderer sandbox 启动回归

时间：2026-04-25 22:06

改了什么：
- `window.ts`：将主窗口 `webPreferences.sandbox` 恢复为 `false`，保留 `contextIsolation: true`、`nodeIntegration: false` 和生产环境 DevTools 限制。

为什么改：
- 启用 sandbox 后当前 preload bridge 没有成功暴露 `window.desktopApi`，renderer 启动页直接报 `桌面桥接没有注入成功，renderer 无法访问 Electron API`。
- 当前优先恢复 Chela 主界面可用性；sandbox 迁移需要单独做 preload 兼容改造和启动回归。

涉及文件：
- `src/main/window.ts`
- `docs/changes/2026-04-25/changes.md`

结果：
- renderer 会继续沿用现有 preload 注入路径。
- `M9` 的 sandbox 加固进入后续专项，验收标准包含启动时 `window.desktopApi` 可用。

## 修复左下角分支初始读取卡住

时间：2026-04-25 22:18

改了什么：
- `src/renderer/src/App.tsx` 中 `bootApp` 在写入 `settings` 状态前，同步更新 `settingsRef.current`。
- `switchWorkspacePath` 改为基于 `settingsRef.current` 先算出 `nextSettings`，并同步写入 state 与 ref，再继续执行 workspace 更新后的 Git 刷新。

为什么改：
- 左下角分支按钮依赖 `gitBranchSummary`；初始化和切换 workspace 时，Git 刷新回调会拿 `settingsRef.current.workspace` 做“结果是否过期”的保护判断。
- 之前 `settings` state 已更新但 `settingsRef` 还慢一拍，导致首轮 `getSummary()` / `getSnapshot()` 返回后被误判为旧结果直接丢弃，于是分支一直显示“读取中”；直到用户打开 diff panel 触发下一轮刷新才恢复。

涉及文件：
- `src/renderer/src/App.tsx`
- `docs/changes/2026-04-25/changes.md`

结果：
- 首次进入线程页时，左下角分支摘要可以在首轮 Git 刷新完成后正常落到 UI，不再依赖打开 diff panel 才更新。
- workspace 切换时，Git 刷新链路使用的 ref 与 state 保持同步，减少误丢结果的窗口。
