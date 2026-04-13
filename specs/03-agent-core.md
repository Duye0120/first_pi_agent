# 03 — Agent Core

> 状态：`in-review`
> 依赖：01-overview
> 更新时间：2026-04-13 15:29:14

## 3.0 当前基线

这一份 spec 不再把 Agent Core 写成“单文件大脑”，当前实现已经稳定拆成 4 条协作链：

- `Harness Runtime`：run 生命周期、审批、审计、活动 run 持久化
- `Agent Core`：模型装配、工具池装配、事件订阅、prompt 驱动
- `Context Engine`：system prompt 组装、预算裁剪、session snapshot 注入、compact
- `Transcript Persistence`：`session.json + transcript.jsonl + context-snapshot.json`

当前代码入口：

- `src/main/harness/runtime.ts`
- `src/main/agent.ts`
- `src/main/context/engine.ts`
- `src/main/context/snapshot.ts`
- `src/main/session/service.ts`

## 3.1 职责

Agent Core 是智能推理层。它负责：

1. **接收当前轮输入** — 从聊天编排层拿到 `sessionId/runId/text/attachments`
2. **拼装上下文** — 把 Soul 文件、runtime manifest、session snapshot、semantic memory 组合成 system prompt
3. **驱动 ReAct Loop** — 发给 LLM → 产生工具提议或最终文本 → 消费工具结果继续循环
4. **管理上下文预算** — 在 context window 内做 section trim、snapshot 注入和 reactive compact
5. **透传流式事件** — 把 thinking、tool_call、final text 通过 Adapter 发给前端
6. **与 Harness Runtime 协作** — 模型负责提议，Harness 负责准入、暂停、恢复和记账

Agent Core 不关心 UI 长什么样，也不直接碰高风险副作用。它负责“想”和“提议怎么做”。

Harness 负责“这次 run 处于什么状态、能不能继续、要不要审批、怎么落盘”。

## 3.2 技术选型：pi-agent-core

我们不自己实现 agent loop，而是使用已安装的 `@mariozechner/pi-agent-core`。

### 它帮我们做了什么

| 能力 | 说明 |
|------|------|
| ReAct Loop | 自动循环：LLM 回复 → 判断是工具调用还是最终回复 → 执行 → 继续 |
| 工具执行 | 自动解析 LLM 的 tool_call → 校验参数（TypeBox）→ 调用 execute → 结果喂回 |
| 流式输出 | 细粒度事件：thinking delta、text delta、tool 执行状态，实时推送 |
| 错误重试 | 工具参数校验失败自动让 LLM 重试，不需要我们处理 |
| 运行时配置 | 可以随时切换模型、工具列表、system prompt、thinking level |
| 中断控制 | 支持 AbortSignal，用户可以随时取消正在执行的 agent |

### 我们要做的

| 能力 | 说明 |
|------|------|
| System Prompt 拼装 | 从 Soul 文件、runtime capability、session snapshot、semantic memory 动态构建 |
| transformContext 实现 | 上下文压缩、预算治理、必要时 reactive compact |
| 事件桥接 | 把 agent 事件通过 Adapter / IPC 转发给前端 |
| 工具注册 | 收集内置工具 + MCP 工具，并统一包进 Harness |
| 生命周期管理 | Agent 实例的创建、销毁、会话切换、run 绑定 |

## 3.3 Agent 初始化流程

当前实现里的初始化链路：

```
1. 聊天编排层解析当前 session / model / thinkingLevel
2. Harness Runtime 为本次输入创建 run
3. Session Service 先把 user_message / run_started 落到 transcript
4. Agent Core 读取已持久化 messages，必要时复用或重建 handle
5. 创建 Agent 实例
   new Agent({
     initialState: { systemPrompt, model, tools, messages, thinkingLevel },
     transformContext: 我们的上下文管理策略,
     getApiKey: 从配置读取,
   })
6. 工具池先接入内置工具 / MCP，再统一 wrap 到 Harness gate
7. agent.subscribe(event => 通过 Adapter 发到 renderer)
8. handle 绑定当前 runId，开始 prompt
```

### 当前运行边界

每次用户发送一条消息，都先创建一个 run，再进入 Agent：

```typescript
interface AgentRunContext {
  runId: string;
  sessionId: string;
  modelEntryId: string;
  startedAt: number;
  state: "running" | "awaiting_confirmation" | "completed" | "aborted" | "failed";
  currentStepId?: string;
  pendingApproval?: {
    type: "shell" | "file_write" | "mcp";
    payloadHash: string;
  };
}
```

Harness 关心的是“run 当前状态、pending approval、取消请求、审计与恢复”。

### Harness 状态机

```
idle
  ↓
running
  ├─→ awaiting_confirmation
  │      ├─ 用户允许 → executing_tool → running
  │      └─ 用户拒绝 → running / failed
  ├─→ executing_tool → running
  ├─→ completed
  ├─→ aborted
  └─→ failed
```

关键点：

- `run` 是一等公民，消息和步骤只是它的产物
- 高风险动作进入 `awaiting_confirmation` 时必须暂停，而不是偷偷继续
- 恢复执行时沿用同一个 `runId`，不能新建一个假 run 把上下文冲掉
- Renderer 展示的是 Harness 事件流，不是直接把模型原始输出生搬过去

### 中断审批恢复策略

当前阶段把应用重启前的 `awaiting_confirmation` 恢复成可读 read model：

```
harness-runs.json
  → hydrateFromDisk()
  → interrupted-approvals.json
  → InterruptedApprovalNotice
  → recoveryPrompt
  → Renderer 填入 composer
  → 用户重新发送
  → 新 run 重新进入 Harness / Policy / Tool gate
```

当前契约：

- `canResume=false`：原 run 标记为中断，UI 保留现场并生成恢复草稿
- `recoveryStatus=interrupted`：恢复状态稳定表达为中断现场
- `recoveryPrompt`：把审批类型、原因、detail、run id、模型、步骤位置整理成可重新发送的草稿
- 用户重新发送后走新的 `chat run`，工具副作用继续经过 Harness 审批

后续要做真正 resume 时，需要满足三件事：

- `runId` 与 `requestId` 有可恢复 waiter
- Agent handle 能回到暂停点并继续消费审批结果
- Transcript 能把中断前后的事件串成同一条可审计执行链

### Tool Call 只是一种提议

在 Harness 模式下，LLM 产出的 `tool_call` 只是一个 **proposal**：

```
LLM 输出 tool_call
  → Harness 规范化参数
  → Policy Engine 判定 allow / confirm / deny
  → allow 才真正执行工具
  → 工具返回结果先回 Harness
  → Harness 写状态 / 审计 / transcript
  → 再喂回 LLM
```

模型没有直接碰文件系统或命令行的权力。副作用统一经由 Harness。

## 3.4 ReAct Loop 详解

一次用户输入触发的完整循环：

```
用户输入: "帮我创建一个 hello.txt 文件，内容是 Hello World"
                            │
                            ▼
┌─ Turn 1 ─────────────────────────────────────────┐
│                                                   │
│  Agent → LLM:                                     │
│    system: [soul + user + agents + 记忆]           │
│    user: "帮我创建一个 hello.txt..."               │
│                                                   │
│  LLM 回复:                                        │
│    thinking: "用户要创建文件，我用 file_write"      │
│    tool_call: file_write({ path: "hello.txt",     │
│                            content: "Hello World", │
│                            mode: "overwrite" })    │
│                                                   │
│  Harness 判断: 这是工具调用 proposal               │
│  policy allow → 执行 file_write → 成功返回         │
│  { size: 11 }                                     │
│                                                   │
│  事件流:                                           │
│    → turn_start                                   │
│    → message_start                                │
│    → thinking_delta("用户要创建文件...")            │
│    → tool_execution_start(file_write)             │
│    → tool_execution_end(success)                  │
│    → message_end                                  │
│    → turn_end                                     │
│                                                   │
└──────────────────────────────────────────────────┘
                            │
                            ▼ 工具结果喂回 LLM
┌─ Turn 2 ─────────────────────────────────────────┐
│                                                   │
│  Agent → LLM:                                     │
│    [...之前的消息]                                  │
│    tool_result: { file created, size: 11 bytes }  │
│                                                   │
│  LLM 回复:                                        │
│    text: "已创建 hello.txt，内容是 Hello World"    │
│                                                   │
│  Harness 判断: 这是最终回复 → 发给用户              │
│                                                   │
│  事件流:                                           │
│    → turn_start                                   │
│    → message_start                                │
│    → text_delta("已创建 hello.txt...")             │
│    → message_end                                  │
│    → turn_end                                     │
│    → agent_end                                    │
│                                                   │
└──────────────────────────────────────────────────┘
```

### 关键参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 最大轮次 | 20 | 防止 agent 死循环，超过直接终止并告诉用户 |
| thinking level | 用户可选 | off / minimal / low / medium / high / xhigh |
| 并发工具调用 | 支持 | LLM 可以在一次回复中调用多个只读工具，执行仍先经过 Harness |

## 3.5 上下文管理（transformContext）

### 为什么需要

LLM 有 context window 限制（比如 Claude 200K、GPT-4o 128K）。但即使模型支持很长的 context，**塞太多信息反而会降低回复质量**——模型的注意力会分散，容易忽略关键信息或产生幻觉。

所以我们需要在每轮 LLM 调用前，主动管理 context 的内容和大小。

### 当前策略

```
transformContext(messages, signal) → 精简后的 messages
```

执行时机：每轮 LLM 调用前（pi-agent-core 自动调用）。

**Step 1: 计算 token 预算**
```
总预算 = 模型 context window × 0.7（留 30% 给回复）
已用 = system prompt tokens + 工具定义 tokens
可用 = 总预算 - 已用
```

**Step 2: 组装 prompt sections**
```
constitution / workspace policy / runtime capability
→ session snapshot
→ semantic memory
→ turn intent patch
```

**Step 3: budget trim**
```
先裁可丢的 memory / reference section
再裁可截断 section
hard authority section 保持最后兜底
```

**Step 4: transcript compact / snapshot coverage**
```
如果 session transcript 过长
→ 生成或刷新 session memory snapshot
→ 后续 system prompt 优先注入 snapshot，再保留最近 transcript tail
```

当前实现额外支持：

- prompt-too-long 时 reactive compact 后重试
- assistant 因 `max_tokens` 截断时自动续写一次
- `session memory`、`semantic memory`、`run memory` 三种边界分离

## 3.6 BYOK 多 Provider

通过 pi-ai 的统一 API 支持多个 LLM provider：

```
用户配置 (credentials):
  {
    "openai": { "apiKey": "sk-..." },
    "anthropic": { "apiKey": "sk-ant-..." },
    "google": { "apiKey": "AIza..." },
    "ollama": { "baseUrl": "http://localhost:11434" }
  }

模型选择 (UI 或配置文件):
  provider: "anthropic"
  model: "claude-sonnet-4-20250514"

Agent 初始化时:
  const model = getModel("anthropic", "claude-sonnet-4-20250514")
  getApiKey: (provider) => credentials[provider].apiKey
```

pi-ai 支持的 provider 包括：OpenAI、Anthropic、Google、DeepSeek、Mistral、xAI、Groq、Ollama（本地）等。用户只需要配置自己有的 API Key。

## 3.7 流式事件与前端桥接

pi-agent-core 的 Agent 通过 `subscribe` 发出事件，我们需要通过 Electron IPC 转发给前端。

### 事件类型

```
agent_start          → 一次完整执行开始
  turn_start         → 单轮 LLM 调用开始
    message_start    → 消息开始（含 role 信息）
    message_update   → 流式内容：text_delta / thinking_delta / toolcall_delta
    message_end      → 消息完成（含 usage 和 cost）
    tool_execution_start   → 工具开始执行（工具名、参数）
    tool_execution_update  → 工具中间输出（如 shell 的 stdout 流）
    tool_execution_end     → 工具执行完成（结果或错误）
  turn_end           → 单轮结束
agent_end            → 整次执行结束
```

### IPC / Adapter 桥接方式

```
Main Process:
  agent.subscribe(event => {
    mainWindow.webContents.send('agent:event', event)
  })

Preload:
  contextBridge.exposeInMainWorld('desktopApi', {
    agent: {
      onEvent: (callback) => ipcRenderer.on('agent:event', (_, event) => callback(event))
    }
  })

Renderer:
  window.desktopApi.agent.onEvent(event => {
    // 更新 Steps 面板、消息列表等
  })
```

前端拿到的是结构化事件流，消息正文只是 renderer projection，不是事实源。

## 3.8 Agent 生命周期

```
应用启动
  └→ 恢复活动 run 注册表 → 恢复 interrupted approvals → 再创建窗口与 Agent handle

用户切换会话
  └→ 复用或销毁当前 handle → 加载目标 session 的 persisted transcript projection

用户新建会话
  └→ 创建新 Agent（空 messages）

用户发送消息
  └→ createRun → append user event → bind handle → agent.prompt

用户取消执行
  └→ AbortSignal 中断当前 loop

用户关闭应用
  └→ 保存当前会话 messages → 销毁 Agent

context 过长
  └→ compact background run → 生成或刷新 `context-snapshot.json`
```

## 3.9 当前缺口

- 中断审批当前能恢复成 read model 和 recoveryPrompt，真正恢复执行仍未完成
- 背景任务和轻量杂活任务还没有独立 workload profile
- 多模型路由还没有正式进入底层主链

## 3.10 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| LLM API 调用失败（网络/限流） | pi-agent-core 内置重试机制（指数退避） |
| LLM 返回格式异常 | pi-agent-core 自动重试一次 |
| 工具参数校验失败 | 错误信息喂回 LLM，让它修正参数重试 |
| 工具执行失败 | 错误信息喂回 LLM，让它决定重试还是换方案 |
| Token 超限 | transformContext 自动压缩，压缩失败则告知用户"对话太长，建议新建会话" |
| 超过最大轮次（20） | 终止 loop，告知用户"任务过于复杂，已执行 20 步仍未完成" |
| API Key 无效/过期 | 前端弹出配置页面，引导用户更新 Key |
