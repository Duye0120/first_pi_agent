# Chela 聊天关键修复计划优化版

> 2026-04-17 19:20 | 作者：Codex | 状态：执行中

## Summary

- 本轮按真实链路收成三段：`P0 稳定性`、`P1 可发现性`、`P2 交互增强`。
- `P0` 先处理代理、prepare/execute 双层 failover、learnings 注入。
- `P1` 只交 session search 后端、shared contracts、IPC、preload 和前端调用位。
- `P2` 收口模型切换文档，并把“中途引导”做成 queued redirect，不在 active turn 里并发 prompt。

## 先纠正文档落点

1. `resolveWithFailover()` 当前只处理模型配置解析。真实聊天执行链路是 [`src/main/chat/prepare.ts`](D:/a_github/first_pi_agent/src/main/chat/prepare.ts) -> [`src/main/chat/execute.ts`](D:/a_github/first_pi_agent/src/main/chat/execute.ts) -> [`src/main/chat/finalize.ts`](D:/a_github/first_pi_agent/src/main/chat/finalize.ts)。
2. 学习记录已经直接写入 memdir `topic: "learnings"`，入口在 [`src/main/learning/engine.ts`](D:/a_github/first_pi_agent/src/main/learning/engine.ts)。
3. session 持久化文件是 [`src/main/session/paths.ts`](D:/a_github/first_pi_agent/src/main/session/paths.ts) 里的 `session.json / transcript.jsonl / context-snapshot.json`。
4. “运行时模型切换”当前语义是“下一条消息按最新 `modelRouting.chat.modelId` 重建 handle”。当前轮不做 mid-turn 热切模型。

## Implementation Changes

### P0-1 代理

- 扩展 `Settings`，新增 `network.proxy.enabled / url / noProxy` 和 `network.timeoutMs`。
- main 与 renderer 的 settings 深合并都补齐 `network.proxy`，避免 `updateSettings` 覆盖嵌套字段。
- 新增 [`src/main/network/proxy.ts`](D:/a_github/first_pi_agent/src/main/network/proxy.ts)，在 `app.whenReady()` 后立即应用全局 dispatcher。
- `settings.update` 后热切换全局网络配置。
- `web_search / web_fetch` 改为读取 `network.timeoutMs`。
- 代理配置位并入现有 `General` settings，不单开新页。

### P0-2 Failover

- `prepare` 阶段把 `resolveRuntimeModel()` 收口到 `resolveWithFailover()`，兜住错误 entryId、禁用模型、缺失 provider / key。
- `execute` 阶段在 `promptAgent()` 外层增加真正的 provider/network failover。
- `withRetry()` 负责同候选模型的瞬时错误重试。
- 切到后备模型时重新 `initAgent()`，继续走既有 `send -> prepare -> execute -> finalize` 链路。
- 失败轨迹写入日志，并挂到 transcript `run_started / run_finished` metadata。
- 不做 `HEAD` 探活，优先真实调用失败后的重试和切换。

### P0-3 学习注入

- `prompt-control-plane` 新增 `learnings` layer，顺序放在 `semantic-memory` 之后。
- learnings section 直接读取 memdir `learnings` topic，稳定注入最新几条，不再依赖 `search("学习")` 关键词碰运气。
- `context/engine` 每轮 system prompt 都会带上 learnings section。
- `learning/engine.ts` 的 summary / detail 改成面向 agent 的动作建议。

### P1 会话搜索

- 新增 [`src/main/session/search.ts`](D:/a_github/first_pi_agent/src/main/session/search.ts)。
- 索引源直接读取 `session.json`、`transcript.jsonl`、`context-snapshot.json`，不依赖轻量 `index.json`。
- shared contracts、IPC、preload 已补 `sessions.search(query, limit?)` 与 `sessions.reindexSearch()`。
- `finalizeCompletedChatRun` 成功后增量索引。
- 删除和归档会同步清理索引，反归档会重建该 session 的索引。
- 当前轮不加侧边栏可见搜索入口。

### P2-1 模型切换收口

- 本文件把“必须关闭 session 才能换模型”的旧描述收口成“下一条消息会按新模型重建 handle”。
- 当前不新增 `model:switched` 事件。
- 当前不做 active turn 中途热切模型。

### P2-2 实时反馈 / 引导

- 引导语义定义为 queued redirect。
- 用户在 run 进行中输入补充内容时，先把内容存成 session 级 `pendingRedirectDraft`。
- 当前 run 正常结束后，系统自动发起 follow-up chat run，把引导文本作为普通 user message 进入 transcript。
- 若当前没有 active run，点击 `引导` 立即发送 follow-up run。
- UI 形态收成 composer 上方悬浮卡片，右侧主按钮为 `引导`，旁边单独保留删除 icon。

## Public Interfaces

### Settings

- `settings.network.proxy.enabled`
- `settings.network.proxy.url`
- `settings.network.proxy.noProxy`
- `settings.network.timeoutMs`

### desktopApi.sessions

- `search(query, limit?)`
- `reindexSearch()`

### desktopApi.chat

- `queueRedirect({ sessionId, runId?, text })`
- `clearRedirectDraft(sessionId)`

### Session

- `ChatSession.pendingRedirectDraft`
- `ChatSession.pendingRedirectUpdatedAt`

## Test Plan

### 代理

- 打开代理后触发 `web_search` 和 `web_fetch`，确认请求可用。
- 关闭代理后恢复直连。
- `noProxy` 命中本地地址时保持直连。

### Failover

- 把聊天模型配成不可解析 entry，发送消息，确认 prepare 阶段切到可用 entry。
- 把主模型配成可解析但 provider 瞬时失败，发送消息，确认 execute 阶段会切后备模型。
- 全部候选失败时，返回明确错误，同时保留 run/transcript 收尾。

### 学习注入

- 连续触发同一工具失败到阈值，确认 memdir `learnings` 写入。
- 新开 session 且用户问题与“学习”无关，system prompt 仍带最新 learnings section。

### 会话搜索

- 新消息完成后可搜到标题、消息正文和 snapshot 摘要。
- 归档、删除、手动重建索引后，结果与 session 实际状态一致。

### 模型切换

- 在 settings 改聊天模型后直接发送下一条消息，确认 run 使用新的 `modelEntryId`。

### 引导

- run 进行中输入补充内容，点击引导后，生成 `pendingRedirectDraft` 卡片。
- 点击删除后草稿消失。
- 当前 run 结束后自动补发 follow-up run，引导内容作为普通 user message 写入 transcript。

## Assumptions

- 执行顺序固定为 `代理 -> Failover -> 学习注入 -> 会话搜索后端 -> 文档收口 -> 引导 UI`。
- 会话搜索当前轮只交后端与调用位。
- 引导语义固定为“当前 run 完成后继续”，当前轮不做 mid-tool interruption。
- 验证优先走最小必要静态诊断与链路烟测，不习惯性跑 build。

## 留痕

### 本轮文档收口

**时间**: 19:20

**改了什么**

- 重写了关键修复计划，把执行顺序收成 `P0 / P1 / P2`。
- 修正文档里对 failover、生效链路、learnings 写入位置、session 文件名和模型切换语义的错误描述。

**为什么改**

- 旧文档把配置层兜底、执行层 failover 和运行时模型切换混在一起，和真实代码链路不一致。
- 当前轮已经明确“先稳再扩，再补交互”，文档需要直接服务实现，不再保留误导性表述。

**涉及文件**

- `docs/critical-chat-fixes-plan.md`

**结果**

- 当前计划已经和代码实现链路对齐，后续改动可以直接按本文分层推进。
