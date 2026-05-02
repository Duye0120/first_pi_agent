## 调整工具调用过程聚合展示

时间：2026-04-30 09:24:55 +08:00

改了什么：
- 调整 `process_group` 渲染：运行中直接展示 thinking 与 command 过程条目，完成后再显示“已处理 · N 个命令”的聚合入口。
- 调整 command 过程条目：执行中的 command 组默认展开，便于看到当前正在运行的命令列表。

为什么改：
- 用户希望中间 command 全部完成前保留过程可见性，全部完成后再把过程收缩成已处理聚合，并把最终回复正文放在聚合之后展示。

涉及文件：
- `src/renderer/src/components/ui/tool-fallback.tsx`
- `docs/changes/2026-04-30/changes.md`

结果：
- 运行中界面先展示实际工具调用过程。
- 完成后界面显示折叠后的“已处理”聚合。

## 调整过程条目顺序展开与自动收起

时间：2026-04-30 09:32:12 +08:00

改了什么：
- 调整 thinking 过程条目：执行中自动展开，执行状态结束后自动收起。
- 调整 command 过程条目：执行中自动展开，执行状态结束后自动收起。

为什么改：
- 用户希望过程展示按时间线推进：当前过程展开，结束后收起，再展开下一个 thinking 或 command，所有过程结束后再显示最终“已处理”聚合。

涉及文件：
- `src/renderer/src/components/ui/tool-fallback.tsx`
- `docs/changes/2026-04-30/changes.md`

结果：
- 运行中的过程条目只保持当前项展开。
- 完成态继续显示最终“已处理”聚合入口。

## 增加引导对话 UI 标识

时间：2026-04-30 09:43:30 +08:00

改了什么：
- 为排队消息增加 `source` 来源字段，区分普通排队和引导触发。
- 引导触发的消息发送时写入 `sendOrigin: guided`，用户消息和对应 assistant 消息都会保留这个来源。
- 用户消息气泡上方增加“已引导对话”轻量标识。
- guided run 的工具过程区增加“已引导对话”提示。

为什么改：
- 用户希望参考截图里的引导状态反馈，让被引导的对话在 command 过程区和消息气泡上都有明确但克制的状态提示。

涉及文件：
- `src/shared/contracts.ts`
- `src/main/session/meta.ts`
- `src/main/session/service.ts`
- `src/main/session/facade.ts`
- `src/main/session/transcript-writer.ts`
- `src/main/chat/service.ts`
- `src/main/chat/prepare.ts`
- `src/main/chat/finalize.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/ui/tool-fallback.tsx`
- `docs/changes/2026-04-30/changes.md`

结果：
- 引导消息进入正式队列和正式消息链路。
- UI 能在消息气泡和过程区展示引导来源。

## 限制连续工具调用死循环

时间：2026-04-30 23:16:00 +08:00

改了什么：
- 新增 agent 工具循环守卫，统计最新用户消息之后连续出现的 assistant tool call 轮次。
- 在 agent 的 `transformContext` 链路前置守卫，达到 12 轮后停止本轮执行并返回产品级错误。
- 调整 `memory_save` 保存语义为 `saved / duplicate / merged / conflict` 四态。
- 新增 memory 模糊去重纯模块，先覆盖精确重复、包含式补充、数字/时间冲突。
- 新增 memory 工具返回文案，明确输出状态、结果和下一步，告诉 Agent 本次 `memory_save` 已闭环。
- `memory_save` 在 memdir 写入后同步写入 Chela 向量库；`duplicate` 状态跳过向量写入。
- 工具结果新增向量库状态：写入成功、跳过、写入失败。
- 新增回归测试覆盖连续 memory 工具调用计数、四态判断、向量库写入构造和四态返回文案，并接入 `test:regression`。

为什么改：
- memory 处理时部分模型会反复执行“思考 -> memory_save 工具调用 -> 回到模型”链路，底层 ReAct 循环需要项目侧上限兜底。
- 记忆内容存在模糊边界，存储层需要区分重复、补充升级和事实冲突，工具返回也需要给 Agent 明确的成功 / 跳过 / 合并 / 冲突信号。
- 设置页展示的是 Chela 向量记忆库，旧 `memory_save` 只写 memdir 文件记忆，导致工具显示 saved 但向量库统计仍为 0。

涉及文件：
- `src/main/agent-loop-guard.ts`
- `src/main/agent.ts`
- `src/main/memory/dedupe.ts`
- `src/main/memory/service.ts`
- `src/main/tools/memory.ts`
- `src/main/tools/memory-result.ts`
- `src/main/tools/memory-vector.ts`
- `tests/agent-loop-guard-regression.test.ts`
- `tests/memory-dedupe-regression.test.ts`
- `tests/memory-tool-regression.test.ts`
- `tests/memory-vector-regression.test.ts`
- `package.json`
- `docs/changes/2026-04-30/changes.md`

结果：
- 单轮聊天最多执行 12 轮连续工具调用。
- 超过上限时 Chela 主动终止本轮，避免 memory_save 等工具形成无限循环。
- `memory_save` 对精确重复返回 `duplicate` 并跳过写入。
- 新记忆比旧记忆更具体时返回 `merged` 并用新摘要替换索引。
- 相近记忆存在数字/时间冲突时返回 `conflict`，保留新条目并标记可能冲突。
- `saved / merged / conflict` 会写入向量库，设置页刷新后能看到向量记忆数量变化。
- `duplicate` 会显示向量库跳过原因，避免重复向量记录。

## 完善记忆系统闭环

时间：2026-04-30 23:58:00 +08:00

改了什么：
- 新增 `MemoryPipeline` 编排层，统一当前轮快路径检索、后台慢路径刷新、候选过滤和四态写入。
- `getSemanticMemoryPromptSection` 改为消费 pipeline 检索结果，向量检索和 memdir 检索一起进入当前轮 `semantic-memory`。
- 自动记忆刷新改为 background `memory_refresh` run，按 `sessionId + runId` 去重，写入 transcript event 和日志。
- 自动提取候选走 `saved / duplicate / merged / conflict` 四态判定，`saved / merged / conflict` 写入向量库，`duplicate` 记录跳过。
- `memory_save` 工具改为复用同一条 pipeline，返回 memdir 状态和向量库状态。
- 扩展记忆 metadata、IPC 列表过滤、向量重建失败计数和设置页记忆总览。
- 设置页增加 memdir 条数、向量条数、同步状态、最近自动提取、最近失败原因、状态/source/topic/confidence 过滤、冲突和合并对象展示。
- 新增回归测试覆盖 pipeline 保存、候选过滤、prompt 格式化和后台刷新队列去重。

为什么改：
- 记忆系统需要形成明确闭环：当前轮只使用快速检索，回复结束后后台提取，产物从下一轮开始生效。
- 记忆内容存在模糊边界，统一四态能让模型、设置页和存储层得到一致反馈。
- memdir 和向量库都属于长期记忆存储，显式保存和自动刷新都需要同步表达写入结果。

涉及文件：
- `src/shared/contracts.ts`
- `src/main/memory/pipeline.ts`
- `src/main/memory/service.ts`
- `src/main/memory/store.ts`
- `src/main/memory/embedding-worker.ts`
- `src/main/memory/rag-service.ts`
- `src/main/tools/memory.ts`
- `src/main/tools/memory-vector.ts`
- `src/main/ipc/memory.ts`
- `src/main/ipc/schema.ts`
- `src/main/background-run.ts`
- `src/main/session/service.ts`
- `src/main/session/transcript-writer.ts`
- `src/renderer/src/components/assistant-ui/settings/memory-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/memory-status.ts`
- `tests/memory-pipeline-regression.test.ts`
- `tests/memory-refresh-regression.test.ts`
- `package.json`
- `docs/changes/2026-04-30/changes.md`

结果：
- 每轮开始先做轻量记忆检索，主 Agent 当前轮收到稳定的 `semantic-memory`。
- 每轮结束后后台自动提取长期记忆，结果进入下一轮使用。
- `memory_save` 和自动刷新共享四态保存语义，工具结果会明确显示向量库写入、跳过或失败。
- 设置页能同时看到 memdir 与向量库状态，并能定位 conflict / merged 的命中对象。

补充审查修正：
- 时间：2026-04-30 23:59:30 +08:00
- 快路径检索改成向量库和 memdir 两路互相隔离；向量检索或 query rewrite 失败时，仍使用原始 query 检索并注入 memdir 结果。
- 设置页记忆过滤改为过滤时扫描完整列表，再按 limit 截断，避免大量历史记忆下漏掉旧的匹配记录。
- 新增回归断言覆盖向量检索失败和 query rewrite 失败的 fallback 行为。
