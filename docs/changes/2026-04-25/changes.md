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
