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

## 工作区边栏提交计划前置

时间：2026-04-25 14:09:50

改了什么：
- 将右侧工作区边栏左栏里的提交计划面板前置到文件树上方。
- 文件树、全选、视图切换和暂存入口继续保留在提交计划下方。
- 调整提交计划高度拖拽方向，当前置面板向下拖动时会增加高度。

为什么改：
- 用户明确表示顶部 `暂存` 操作使用频率低，希望把底部提交计划动作提到更容易点的位置。
- 提交计划的生成、清空、批量提交属于当前工作流主操作，应该比文件树底部更早被看到。

涉及文件：
- [src/renderer/src/components/assistant-ui/diff-panel.tsx](/D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/diff-panel.tsx)
- [docs/changes/2026-04-25/changes.md](/D:/a_github/first_pi_agent/docs/changes/2026-04-25/changes.md)

结果：
- 打开工作区边栏后，提交计划区会显示在左侧文件树上方。
- 本轮为布局微调，按 AGENTS.md 约束做轻量自检，未运行 build。

## 工作区边栏按钮组位置修正

时间：2026-04-25 14:13:12

改了什么：
- 还原工作区边栏左侧的文件树和提交计划面板顺序。
- 将提交计划动作按钮组抽成局部控件，并放到文件树顶部右侧原 `暂存` 位置。
- 将 `暂存 / 取消暂存` 入口下放到提交计划标题右侧。
- 恢复底部提交计划面板的高度拖拽方向。

为什么改：
- 用户要调整的是顶部 `暂存` 和底部提交计划动作按钮组的位置关系。
- 生成提交计划按钮是高频动作，放在文件勾选区域右上角更贴近当前操作。

涉及文件：
- [src/renderer/src/components/assistant-ui/diff-panel.tsx](/D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/diff-panel.tsx)
- [docs/changes/2026-04-25/changes.md](/D:/a_github/first_pi_agent/docs/changes/2026-04-25/changes.md)

结果：
- 文件树仍在上方，提交计划仍在下方。
- 文件树顶部右侧显示生成计划、清空计划和依次提交按钮组。
- 提交计划标题右侧显示 `暂存 / 取消暂存`。
