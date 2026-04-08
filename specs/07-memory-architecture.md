# 07 — 记忆系统架构

> 状态：`in-review`
> 依赖：03-agent-core, 05-builtin-tools

## 7.1 设计理念

记忆系统让 agent 从"每次都失忆的聊天机器人"变成"越用越懂你的助手"。

核心原则：
- **透明可控** — 所有记忆存储在用户可见的文件里（.md 和 .json），不是黑箱数据库
- **分层管理** — 不同类型的记忆有不同的生命周期和访问方式
- **按需加载** — 不把所有记忆塞进 context，只检索相关的

## 7.2 三层架构

```
┌─ T0: Soul 层 ──────────────────────────────────┐
│                                                 │
│  内容：SOUL.md + USER.md + AGENTS.md            │
│  生命周期：永久（用户手动维护）                    │
│  加载方式：每次会话启动时全量读取，拼入 system prompt│
│  大小：通常 1000-3000 tokens                     │
│                                                 │
│  类比：一个人的性格和对朋友的基本了解              │
│  你不需要每次见朋友都重新认识他，                  │
│  这些信息始终在你脑子里。                         │
├─────────────────────────────────────────────────┤
│  T1: 长期记忆                                    │
│                                                 │
│  内容：从历次对话中提取的关键信息                  │
│  生命周期：持久（自动写入，可手动删除）             │
│  加载方式：按需检索（向量相似度），每轮 top-5 注入  │
│  大小：单条 100-500 tokens，库可以无限增长         │
│                                                 │
│  类比：日记本                                    │
│  你不会每天翻完整本日记，但当有人提到某件事，       │
│  你能快速翻到相关的那几页。                       │
├─────────────────────────────────────────────────┤
│  T2: 会话记忆                                    │
│                                                 │
│  内容：当前对话 messages + session continuity 快照 │
│  生命周期：会话期间持续更新，必要时为续会话保留摘要  │
│  加载方式：活跃会话可全量，重开时先注入快照再补历史 │
│  大小：messages 动态增长，快照保持紧凑               │
│                                                 │
│  类比：当前对话的短期记忆                         │
│  你正在和朋友聊天，聊的内容你当然全记得。          │
└─────────────────────────────────────────────────┘
```

补一条边界：

- `T2` 不只是“当前 messages 列表”，还包括“为同一任务后续 session 续接准备的 session memory snapshot”
- `T2` 仍然是 session 级短中期记忆，不等于 `T1` 长期记忆
- `T2` 也不等于 Harness 的活动 `run snapshot`；后者负责执行现场，不负责语义续接

### 当前实现收口

这轮先只落 `T0 + T2`：

- `T0` 继续来自 `SOUL / USER / AGENTS`
- `T2` 已固定成 `recent transcript tail + session memory snapshot`
- `T1` 现在只保留架构位置，不做 embedding / RAG / memory_search
- `compact` 已改成 Main 侧 context 能力，不在 Renderer 本地做压缩

## 7.3 数据流全景

一次完整的记忆生命周期：

```
═══ 会话开始 ═══

1. 加载 T0（Soul 层）
   读取 SOUL.md + USER.md + AGENTS.md → 拼入 system prompt

2. 如果是重开已有任务
   先加载 transcript + session memory snapshot
   让模型先知道“上次做到哪、还有什么没做”

3. 用户发送第一条消息："帮我看看上次那个项目的进度"

4. transformContext 触发隐式记忆检索
   "上次那个项目" → embedding → 向量检索 T1
   → 找到记忆："用户在做一个 Electron agent 项目，使用 pi-agent-core"
   → 注入到 context 中

5. Agent 带着完整上下文开始工作
   system prompt（T0）+ 检索到的记忆（T1）+ 用户消息（T2）

═══ 会话进行中 ═══

6. 多轮对话，T2 持续增长
   用户消息、agent 回复、工具调用结果不断追加

7. transformContext 持续管理
   如果 T2 太大 → 压缩早期对话为摘要

8. Agent 可以主动调用 memory_search 工具
   "让我查一下用户之前的偏好..." → 检索 T1

═══ 会话结束 ═══

9. 记忆提取（T2 → T1）
   用 LLM 分析本次对话 → 提取关键信息 → 写入 T1 长期记忆

   对话内容："用户说下周二要面试字节，岗位是全栈工程师"
   提取记忆：{
     content: "用户计划于 2026-04-07 面试字节跳动，岗位：全栈工程师",
     tags: ["career", "interview"]
   }

9. 更新 USER.md（可选）
   如果提取到的信息是关于用户本身的重大更新
   → 建议更新 USER.md（通过前端提示用户确认）
```

## 7.4 存储结构

```
workspace/
  SOUL.md                    # T0: agent 人格
  USER.md                    # T0: 用户信息
  AGENTS.md                  # T0: 行为规则
  memory/
    MEMORY.md                # T1: 长期记忆索引（人类可读的摘要列表）
    entries/                 # T1: 记忆条目（每条一个 JSON 文件）
      2026-03-28-001.json
      2026-03-29-001.json
      2026-03-31-001.json
      2026-03-31-002.json
    vectors/                 # T1: 向量索引
      index.json             # 所有记忆的 embedding 向量
```

### MEMORY.md 的作用

MEMORY.md 是长期记忆的 **人类可读索引**。用户打开就能看到 agent 记住了什么：

```markdown
# 长期记忆

## 用户相关
- [2026-03-28] 用户是全栈工程师，主要方向 AI/Agent，正在准备求职
- [2026-03-31] 用户计划 4 月 7 日面试字节跳动

## 项目相关
- [2026-03-29] 项目使用 pi-agent-core 作为 agent 引擎
- [2026-03-31] 已完成 spec 讨论，确认 5 个内置工具和三层记忆架构

## 偏好
- [2026-03-28] 偏好 pnpm + TypeScript，代码风格偏简洁
```

这个文件同时被 agent 读取——作为 T1 的高层摘要，在 transformContext 时可以选择性注入。但详细内容的检索走向量索引，不靠这个文件。

### entries/ 里的 JSON 格式

```json
{
  "id": "2026-03-31-001",
  "content": "用户计划于 2026-04-07 面试字节跳动，岗位：全栈工程师",
  "source": {
    "sessionId": "session-abc123",
    "messageIndex": 15
  },
  "tags": ["career", "interview"],
  "createdAt": "2026-03-31T10:30:00Z"
}
```

### vectors/index.json 格式

```json
{
  "model": "nomic-embed-text",
  "dimension": 768,
  "entries": [
    {
      "id": "2026-03-31-001",
      "vector": [0.012, -0.034, 0.056, ...]
    },
    {
      "id": "2026-03-31-002",
      "vector": [0.078, -0.012, 0.045, ...]
    }
  ]
}
```

**为什么用 JSON 文件存向量而不是向量数据库？**

因为我们的数据量不大。一个用户积累几百条记忆，向量文件也就几 MB。JSON 文件加载到内存里做余弦相似度计算，几百条的检索耗时不到 10ms。引入向量数据库（如 Chroma、Qdrant）会增加安装复杂度，对桌面应用来说得不偿失。

如果后续记忆量到了几万条，再考虑换成轻量级的 SQLite + 向量扩展。

## 7.5 记忆提取策略

会话结束时，从对话中自动提取关键信息：

**触发时机：**
- 用户关闭会话
- 用户切换到另一个会话
- 超过 30 分钟无交互

**提取流程：**
```
1. 把本次对话的全部 messages 发给 LLM（用当前模型，不额外花钱起子模型）
2. Prompt:
   "分析以下对话，提取值得长期记住的关键信息。
    只提取以下类型：
    - 用户的个人信息、偏好、习惯
    - 重要的事实、决策、结论
    - 项目进度、里程碑
    不要提取：
    - 临时的调试过程
    - 一般性的技术问答（可以再次搜索到的）
    - 对话中的寒暄
    返回 JSON 数组，每条包含 content 和 tags。"
3. 解析 LLM 返回的结构化数据
4. 对每条记忆计算 embedding → 存入 entries/ 和 vectors/
5. 更新 MEMORY.md 索引
```

**去重：**
新记忆写入前，先检索 T1 看有没有语义相近的已有记忆（相似度 > 0.9）。如果有，更新已有记忆而不是新建。防止"用户是全栈工程师"被重复记录 10 次。

## 7.6 记忆与 transformContext 的协作

每轮 LLM 调用前，transformContext 做的事：

```
function transformContext(messages) {
  // 1. 从最近的用户消息提取检索 query
  const lastUserMsg = messages.findLast(m => m.role === 'user');

  // 2. 检索 T1 长期记忆
  const memories = await memorySearch(lastUserMsg.content, limit=5);

  // 3. 构建注入消息
  const memoryContext = formatMemories(memories);

  // 4. 如果消息历史太长，压缩早期对话
  const compressed = await compressIfNeeded(messages);

  // 5. 返回最终的 messages
  return [
    { role: "system", content: memoryContext },  // 检索到的记忆
    ...compressed,                                // 压缩/裁剪后的历史
  ];
}
```

注意：T0（Soul 文件）不在 transformContext 里处理，它是在 Agent 初始化时就写入 systemPrompt 的，始终存在。

## 7.7 用户控制

记忆系统对用户完全透明：

| 操作 | 方式 |
|------|------|
| 查看所有记忆 | 打开 workspace/memory/MEMORY.md |
| 查看某条记忆详情 | 打开 workspace/memory/entries/xxx.json |
| 删除某条记忆 | 删除对应的 .json 文件（下次启动时向量索引自动清理） |
| 修改 agent 人格 | 编辑 SOUL.md |
| 更新个人信息 | 编辑 USER.md |
| 修改行为规则 | 编辑 AGENTS.md |
| 清空所有记忆 | 删除 memory/ 目录 |

不需要任何 UI——就是文件操作。当然后续可以在前端加一个记忆管理页面，但 v1 文件就够了。
