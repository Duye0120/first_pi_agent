# 16 — 可扩展性架构：从聊天工具到个人 AI 平台

> 新增：2026-04-09 09:32:00
> 更新：2026-04-09 10:04:00 — 追加体验层三个方向
> 状态：`draft` — 待讨论确认后再实施

## 动机

当前系统是一个优秀的 **对话式 AI Agent**，但它是 **被动的**：用户输入 → Agent 回应。
要成为"贾维斯"级别的个人 AI 平台，需要从 **被动响应** 升级为 **主动 + 被动 + 可连接**。

核心问题：**缺少插槽（Slot）机制** —— 外部世界的信号进不来，内部能力也出不去。

## 概念模型：四层插槽

```
┌─────────────────────────────────────────────────┐
│            ④ 应用层 Slots (Application)          │
│  Scheduler · Webhook · Notification · Workflow   │
├─────────────────────────────────────────────────┤
│            ③ 集成层 Slots (Integration)          │
│  Plugin Loader · OAuth · External API Adapters   │
├─────────────────────────────────────────────────┤
│            ② 能力层 Slots (Capability)           │
│  Tool Registry · Provider Registry · MCP         │
│  ✅ 已实现                                       │
├─────────────────────────────────────────────────┤
│            ① 内核层 (Core)                       │
│  Event Bus · Agent Lifecycle · Harness · Context │
│  ⚠️ Event Bus 缺失，其余已实现                    │
└─────────────────────────────────────────────────┘
```

**② 能力层已经做好了**（工具注册、Provider 管理、MCP 连接器）。
缺的是 ① 的 Event Bus 和 ③④ 的上层插槽。

---

## 第一步：Event Bus（事件总线）

> 所有插槽的脊梁骨。没有它，其他都是散装零件。

### 为什么需要

| 场景 | 现在怎么做 | Event Bus 后怎么做 |
|------|-----------|-------------------|
| 用户发消息 | ipcMain.handle → chatSend | `bus.emit("user:message", ...)` → 任何订阅者都能监听 |
| 工具执行完成 | adapter 直接 IPC 推送 | `bus.emit("tool:completed", ...)` → 可触发后续工作流 |
| 定时任务触发 | ❌ 不支持 | `bus.emit("schedule:trigger", ...)` → Agent 自动开始 |
| GitHub webhook | ❌ 不支持 | `bus.emit("webhook:github", ...)` → Agent 自动处理 |
| Agent 主动通知 | ❌ 不支持 | `bus.emit("agent:notify", ...)` → 系统通知/Slack/邮件 |

### 设计

```typescript
// src/main/event-bus.ts

type EventMap = {
  // ── 核心生命周期 ──
  "agent:run:started":    { sessionId: string; runId: string };
  "agent:run:completed":  { sessionId: string; runId: string; status: string };
  "agent:message":        { sessionId: string; role: "user" | "assistant"; text: string };

  // ── 工具事件 ──
  "tool:executing":       { sessionId: string; toolName: string; args: unknown };
  "tool:completed":       { sessionId: string; toolName: string; result: unknown };
  "tool:failed":          { sessionId: string; toolName: string; error: string };

  // ── 外部触发 ──
  "webhook:received":     { source: string; payload: unknown };
  "schedule:triggered":   { jobId: string; cronExpr: string };

  // ── 通知 ──
  "notify:desktop":       { title: string; body: string };
  "notify:external":      { channel: string; message: string };

  // ── 插件 ──
  "plugin:loaded":        { pluginId: string; tools: string[] };
  "plugin:unloaded":      { pluginId: string };
};

class EventBus {
  private listeners = new Map<string, Set<Function>>();

  on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): () => void;
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void;
  once<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): () => void;

  // 通配符 — 用于审计/日志
  onAny(handler: (event: string, data: unknown) => void): () => void;
}

export const bus = new EventBus();
```

### 集成点

```
现有代码改动极小：
1. index.ts chatSend handler → 成功后 bus.emit("agent:message", ...)
2. harness/tool-execution.ts → 工具执行前后 emit
3. harness/runtime.ts → run 生命周期 emit
4. adapter.ts → 已有事件直接桥接
```

### 与 Harness 的关系

Event Bus **不绕过** Harness。工具执行仍走 Harness 策略评估。
Bus 只是事件通知层——"发生了什么"，不是"允许做什么"。

---

## 第二步：Scheduler（定时任务）

> 让 Agent 会主动干活。

### 设计

```typescript
// src/main/scheduler/service.ts

type ScheduledJob = {
  id: string;
  name: string;           // "每日站会摘要"
  cronExpr: string;       // "0 9 * * 1-5" — 工作日早9点
  sessionId: string;      // 在哪个 session 里执行
  prompt: string;         // 要发给 Agent 的指令
  enabled: boolean;
  lastRunAt?: number;
  nextRunAt?: number;
};

// 触发链路：
// cron tick → bus.emit("schedule:triggered") → chatSend(sessionId, prompt)
```

### 用户场景

- 📅 每天早上 9 点："帮我看看 GitHub 有没有新的 PR 要 review"
- 🔍 每周五下午："总结本周做了什么，生成周报草稿"
- 🏥 每 30 分钟："检查服务器健康状态"
- 📧 收到邮件时："帮我分类和摘要今天的邮件"（配合 webhook）

### 持久化

```
userData/data/scheduled-jobs.json
```

### UI

设置页新增"定时任务"标签页，可增删改查 job，显示最近执行状态。

---

## 第三步：Webhook Receiver（外部事件入口）

> 让外部世界能"喊" Agent。

### 设计

```typescript
// src/main/webhook/server.ts

// 内嵌一个轻量 HTTP 服务（仅本机监听或可选公开）
// 默认端口：19840（可配置）

// 路由：
// POST /webhook/:channel  →  bus.emit("webhook:received", { source: channel, payload })

// 配置式映射：
type WebhookRoute = {
  channel: string;       // "github", "email", "custom"
  targetSessionId: string;
  promptTemplate: string; // "收到 GitHub 事件：{{payload.action}} on {{payload.repository.name}}"
  enabled: boolean;
};
```

### 安全

- 默认只监听 `127.0.0.1`
- 支持 Bearer token 校验
- 所有请求记入 audit log
- Harness policy 决定是否允许自动执行

### 典型场景

```
GitHub → ngrok/cloudflare tunnel → localhost:19840/webhook/github
  → bus.emit("webhook:received", {...})
  → promptTemplate 渲染
  → chatSend(sessionId, renderedPrompt)
  → Agent 自动处理
```

---

## 第四步：Plugin Loader（插件加载器）

> 让第三方能力一键接入。

### 插件包格式

```
my-plugin/
├── manifest.json        # 元数据 + 声明
├── tools/               # 工具实现（JS/TS）
│   └── my-tool.js
├── prompts/             # 可选 prompt 片段
│   └── system.md
└── README.md
```

```json
// manifest.json
{
  "id": "jarvis-calendar",
  "name": "Google Calendar 集成",
  "version": "0.1.0",
  "author": "you",
  "tools": [
    { "file": "tools/calendar.js", "name": "calendar_read" },
    { "file": "tools/calendar.js", "name": "calendar_create" }
  ],
  "permissions": ["network", "oauth:google"],
  "promptInjection": "prompts/system.md",
  "events": {
    "subscribe": ["schedule:triggered"],
    "emit": ["notify:desktop"]
  }
}
```

### 加载机制

```typescript
// src/main/plugins/loader.ts

// 扫描 userData/plugins/ 目录
// 验证 manifest.json schema
// 沙箱加载工具（vm2 或 Node worker_threads）
// 注册到 buildToolPool()
// 注入 prompt section 到 prompt-control-plane
// 订阅/发布 event bus 事件
```

### 与现有系统的关系

```
Plugin 工具 → 和 MCP 工具一样进入 buildToolPool()
            → 和内置工具一样经过 Harness 包装
            → 和 MCP 工具一样支持 dedupeTools()

Plugin prompt → 作为新的 PromptSection 进入 prompt-control-plane
             → layer: "integration", authority: "soft"

Plugin events → 通过 Event Bus 收发
             → 受 manifest.permissions 约束
```

---

## 第五步：Notification（通知出口）

> Agent 有话要说时，能通知到你。

### 通道

| 通道 | 实现方式 | 优先级 |
|------|---------|--------|
| 桌面通知 | Electron `Notification` API | P0 — 已有基础设施 |
| 系统托盘 | Electron Tray badge | P0 |
| Webhook 出站 | HTTP POST 到配置的 URL | P1 |
| 邮件 | SMTP / SendGrid | P2 |
| Slack/Teams | Webhook URL | P2 |

### 触发方式

```typescript
// Agent 通过工具触发
const notifyTool = {
  name: "notify_user",
  description: "当你需要主动通知用户时使用",
  params: { title: string, body: string, channel?: string },
  execute: (_, params) => {
    bus.emit("notify:desktop", { title: params.title, body: params.body });
  }
};

// 或者 Event Bus 规则引擎自动触发
// "当 tool:failed 连续 3 次 → notify:desktop"
```

---

## 实施路线（建议）

```
Phase 1 — 骨架（工作量：小）
├── Event Bus 实现 + 现有代码桥接
├── 桌面通知工具（notify_user）
└── 文档 + 类型

Phase 2 — 主动能力（工作量：中）
├── Scheduler + 持久化 + UI
├── Webhook receiver（本机）
└── Event Bus 审计日志

Phase 3 — 生态（工作量：大）
├── Plugin Loader + manifest schema
├── Plugin 沙箱（权限隔离）
├── OAuth 框架（Google/Microsoft）
└── 官方插件：Calendar、Email、GitHub

Phase 4 — 高级（工作量：很大）
├── Workflow DAG 定义 + 执行引擎
├── Multi-agent 协作
├── 插件市场 UI
└── 远程访问（Telegram Bot Adapter）
```

---

## 现有能力层的评估

### ✅ 不需要改的

| 模块 | 原因 |
|------|------|
| Harness 层 | 已经足够，插件工具直接走 Harness 包装 |
| Prompt Control Plane | 已支持分层 section，插件 prompt 直接加一层 |
| Memory 系统 | Memdir 模式已成熟，不需要动 |
| Provider 系统 | 多 provider 支持已完善 |
| Context 引擎 | Compact + snapshot 已稳定 |

### ⚠️ 需要小改的

| 模块 | 改动 |
|------|------|
| `tools/index.ts` | `buildToolPool()` 增加 plugin tools 入口 |
| `agent.ts` | `buildSystemPrompt()` 增加 plugin prompt sections |
| `index.ts` | 关键 IPC 节点加 `bus.emit()` |
| `harness/tool-execution.ts` | 工具执行前后加 `bus.emit()` |

### ❌ 需要新建的

| 模块 | 说明 |
|------|------|
| `src/main/event-bus.ts` | 核心事件总线 |
| `src/main/scheduler/` | 定时任务引擎 |
| `src/main/webhook/` | Webhook HTTP 服务 |
| `src/main/plugins/` | 插件加载器 |
| `src/main/tools/notify.ts` | 通知工具 |

---

## 关键设计原则

1. **Event Bus 是唯一的胶水** —— 模块间不直接调用，通过事件解耦
2. **Harness 是唯一的门卫** —— 插件工具也必须过 Harness 策略
3. **插件不碰内核** —— 插件只能注册工具 + prompt + 事件，不能 patch 内核代码
4. **渐进式** —— Phase 1 只加 Event Bus，现有功能零回归
5. **本地优先** —— Webhook 默认只监听 localhost，不依赖云服务

---

## 体验层扩展：语音 · 环境感知 · 快速召唤

> 以上五步是**技术插槽**（让系统能连接更多东西）。
> 下面三个方向是**体验插槽**（让用户和 Agent 的交互更像贾维斯）。

### 第六步：语音交互（Voice I/O）

> 贾维斯的标志就是说话。

| 方向 | 技术方案 | 说明 |
|------|---------|------|
| 语音输入 | Whisper API / 本地 whisper.cpp | 按住快捷键说话，松开自动转文字发送 |
| 语音输出 | OpenAI TTS / edge-tts（免费） | Agent 回复可选择念出来 |

**实现思路**：
- UI 层：Composer 旁加麦克风按钮，长按录音
- 底层：录音 → PCM/WAV → Whisper 转文字 → 走正常 chatSend 链路
- 输出：Agent 回复文本 → TTS → 播放（可选，默认关闭）
- Electron 可直接用 `navigator.mediaDevices.getUserMedia()` 录音
- 不需要改 Agent 内核，只是在 UI 层加了一个语音前端

**依赖**：
- 输入：`@xenova/transformers`（本地 Whisper）或 OpenAI Whisper API
- 输出：`edge-tts`（免费，微软 Edge 语音）或 OpenAI TTS API

**与 Event Bus 的关系**：
```
mic:start → 录音 → mic:stop → whisper 转写 → bus.emit("user:message")
agent 回复 → bus.on("agent:message") → TTS → 播放
```

### 第七步：环境感知（Ambient Context）

> Agent 自动知道你在干什么，不用你每次都说。

| 信号源 | 获取方式 | 注入层 |
|--------|---------|--------|
| 当前活动窗口标题 | `electron.BrowserWindow.getFocusedWindow()` + OS API | Turn-level prompt |
| 剪贴板变化 | `electron.clipboard` 定时轮询 | 可选附加到下一条消息 |
| 当前 Git 分支/状态 | 已有 `git.ts` | Runtime prompt section |
| 时间段感知 | `Date` + 时区 | Turn-level hint |
| 最近打开的文件 | workspace file watcher | Session context |

**设计原则**：
- **隐私优先**：所有环境信号默认关闭，用户手动开启
- **轻量注入**：不是每个信号都塞进 prompt，只在 turn-level 注入一行摘要
- **可配置**：设置页可勾选哪些信号要采集

**Prompt 注入示例**：
```
[环境上下文]
时间：2026-04-09 周三 上午 10:04
活动窗口：VS Code — src/main/index.ts
Git：main ↑2 (clean)
最近剪贴板：https://github.com/...
```

**与 Prompt Control Plane 的关系**：
- 新增一个 layer：`ambient`，位于 `turn` 之前
- authority: `reference`（仅参考，不是硬规则）
- cache scope: `turn`（每轮刷新）

### 第八步：全局快速召唤（Quick Invoke）

> 任何时候，一个快捷键就能召唤 Agent。

**实现**：
```typescript
// src/main/quick-invoke.ts
import { globalShortcut, BrowserWindow } from "electron";

// 注册全局快捷键（默认 Alt+Space，可配置）
globalShortcut.register("Alt+Space", () => {
  // 方案 A：直接激活主窗口并聚焦 Composer
  mainWindow.show();
  mainWindow.webContents.send("focus-composer");

  // 方案 B：弹出迷你浮窗（类似 Spotlight）
  // showQuickInvokeWindow();
});
```

**两种模式**：
| 模式 | 体验 | 实现难度 |
|------|------|---------|
| A. 激活主窗口 | 切到 app，聚焦输入框 | 极小（几行代码） |
| B. 迷你浮窗 | 任何地方弹出小对话框，打完自动收起 | 中等（新窗口+独立 UI） |

**建议**：Phase 1 先做模式 A（激活主窗口），Phase 3 再做迷你浮窗。

---

## 更新后的完整路线图

```
Phase 1 — 骨架 + 体验基础（小）
├── Event Bus 实现 + 现有代码桥接
├── 桌面通知工具（notify_user）
├── 全局快捷键（模式 A：激活窗口）
└── 文档 + 类型

Phase 2 — 主动能力（中）
├── Scheduler + 持久化 + UI
├── Webhook receiver（本机）
├── Event Bus 审计日志
└── 环境感知（基础版：时间 + Git 状态）

Phase 3 — 交互升级（中）
├── 语音输入（Whisper）
├── 语音输出（TTS，可选）
├── 全局快捷键（模式 B：迷你浮窗）
└── 环境感知（进阶版：活动窗口 + 剪贴板）

Phase 4 — 生态（大）
├── Plugin Loader + manifest schema
├── Plugin 沙箱（权限隔离）
├── OAuth 框架（Google/Microsoft）
└── 官方插件：Calendar、Email、GitHub

Phase 5 — 高级（很大）
├── Workflow DAG 定义 + 执行引擎
├── Multi-agent 协作
├── 插件市场 UI
└── 远程访问（Telegram Bot Adapter）
```

---

## 完整贾维斯能力清单

```
贾维斯 = 对话 + 工具 + 记忆          ← ✅ 已有
       + 安全 harness + 审计         ← ✅ 已有
       + Prompt 控制面 + Context 引擎 ← ✅ 已有
       + 事件驱动 + 定时 + 通知       ← Phase 1-2
       + 语音 + 环境感知 + 快速召唤   ← Phase 2-3
       + 插件 + OAuth + 外部 API     ← Phase 4
       + 工作流 + 多 Agent + 市场     ← Phase 5
```
