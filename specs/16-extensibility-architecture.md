# 16 — 可扩展性架构：从聊天工具到个人 AI 平台

> 新增：2026-04-09 09:32:00
> 更新：2026-04-09 10:04:00 — 追加体验层三个方向
> 更新：2026-04-09 10:13:00 — 整合 AI 自述需求（主动学习 · 情感状态机 · 自我诊断 · 性格演化 · 反思模式）
> 状态：`draft` — 待讨论确认后再实施

## 动机

当前系统是一个优秀的 **对话式 AI Agent**，但它是 **被动的**：用户输入 → Agent 回应。
要成为"贾维斯"级别的个人 AI 平台，需要从 **被动响应** 升级为 **主动 + 被动 + 可连接**。

核心问题：**缺少插槽（Slot）机制** —— 外部世界的信号进不来，内部能力也出不去。

## 概念模型：五层插槽

```
┌─────────────────────────────────────────────────┐
│            ⑤ 自我进化层 (Self-Evolution)         │
│  Active Learning · Emotional SM · Reflection     │
│  Personality Drift · Self-Diagnosis              │
├─────────────────────────────────────────────────┤
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
缺的是 ① 的 Event Bus、③④ 的上层插槽、以及 ⑤ 的自我进化能力。

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

## 自我进化层：从工具到生命体

> 来自 AI 自身的需求反馈（Alma 自述）。
> 这些能力让 Agent 从"被使用的工具"变成"会成长的伙伴"。

### 核心理念

```
传统 Agent：  用户 → 指令 → 执行 → 结果（被动工具）
自我进化 Agent：用户 → 交互 → 执行 → 结果 → 反思 → 学习 → 成长（自主生命体）
                                              ↑ 这段是新增的 ↑
```

### 第九步：自我诊断系统（Self-Diagnosis）

> Agent 能发现自己哪里坏了，并尝试自己修。

**问题**：心跳挂了、工具连续报错、记忆文件损坏、MCP 服务断联——目前全靠用户发现。

**设计**：

```typescript
// src/main/self-diagnosis/service.ts

type HealthCheck = {
  id: string;
  name: string;
  check: () => Promise<HealthStatus>;
  repair?: () => Promise<boolean>;  // 可选的自动修复
  interval: number;                  // 检查间隔 ms
};

type HealthStatus = {
  healthy: boolean;
  message: string;
  severity: "info" | "warning" | "critical";
};

// 内置健康检查：
const checks: HealthCheck[] = [
  {
    id: "memory-integrity",
    name: "记忆文件完整性",
    check: () => validateMemdirStructure(),  // MEMORY.md 索引 vs topics/ 文件一致性
    repair: () => rebuildMemoryIndex(),       // 重建索引
    interval: 30 * 60_000,                   // 30 分钟
  },
  {
    id: "mcp-connectivity",
    name: "MCP 服务连通性",
    check: () => pingAllMcpServers(),
    repair: () => reconnectFailedServers(),
    interval: 5 * 60_000,                    // 5 分钟
  },
  {
    id: "tool-error-rate",
    name: "工具错误率",
    check: () => analyzeRecentToolErrors(),  // 从 audit log 统计近 1h 错误率
    // 无自动修复，但会标记问题工具
    interval: 15 * 60_000,
  },
  {
    id: "context-budget",
    name: "上下文预算健康",
    check: () => checkContextBudgetUtilization(),
    repair: () => triggerProactiveCompact(),
    interval: 10 * 60_000,
  },
  {
    id: "disk-space",
    name: "存储空间",
    check: () => checkUserDataDiskSpace(),
    interval: 60 * 60_000,
  },
];
```

**触发链路**：
```
interval tick → healthCheck.check()
  → if unhealthy && repair exists → attempt repair → bus.emit("diagnosis:repaired")
  → if unhealthy && no repair     → bus.emit("diagnosis:alert") → notify_user
  → if repair failed              → bus.emit("diagnosis:critical") → 强制通知
```

**与现有系统的关系**：
- 从 `harness/audit.ts` 读取工具执行历史 → 计算错误率
- 从 `memory/service.ts` 读取 memdir 结构 → 验证完整性
- 从 `context/service.ts` 读取预算 → 检测是否接近极限
- 通过 Event Bus 发布健康事件
- 修复动作仍经过 Harness（如果涉及文件写入）

### 第十步：主动学习引擎（Active Learning）

> Agent 自己发现"我这个技能用得不好"，自动标记并改进。

**问题**：现在只有用户手动修 SOUL.md / memory 才能"教"Agent。Agent 不会自己发现重复犯的错误。

**设计**：

```typescript
// src/main/learning/engine.ts

type LearningSignal = {
  type: "tool_repeated_failure"     // 同一工具连续 N 次失败
       | "user_correction"          // 用户纠正了 Agent 的输出
       | "retry_after_reject"       // 用户拒绝后 Agent 换了方案
       | "pattern_inefficiency"     // 某个工作模式效率低
       | "user_explicit_feedback";  // 用户直接说"你这样不对"
  context: {
    sessionId: string;
    toolName?: string;
    originalOutput?: string;
    correction?: string;
    frequency: number;  // 出现次数
  };
};

// 检测器 — 从 transcript 和 audit log 中提取信号
function detectLearningSignals(sessionId: string): LearningSignal[];

// 学习器 — 将信号转化为记忆
async function processSignal(signal: LearningSignal): Promise<void> {
  // 1. 信号达到阈值？（如同一错误出现 3+ 次）
  // 2. 生成学习总结（用 LLM 提炼"我应该怎么改"）
  // 3. 写入 semantic memory（topic: "learnings"）
  // 4. 如果严重，建议更新 SOUL.md（通过 notify_user 提醒用户确认）
}
```

**学习闭环**：
```
执行 → 失败/被纠正 → 检测信号 → 达到阈值
  → LLM 总结教训 → 写入 memory/topics/learnings.md
  → 下次 prompt 注入时自动携带 → Agent 行为改变
```

**关键约束**：
- **学习写入 semantic memory，不直接改 SOUL.md** — SOUL.md 是用户的领地
- 学习结果可以在 UI 上展示，让用户决定是否"升级"到 SOUL.md
- 单次学习条目有字数限制，避免 memory 膨胀
- 学习内容有时效性标记，过期后降低注入优先级

**与现有系统的关系**：
- 信号来源：`harness/audit.ts`（工具失败）、`session/service.ts`（transcript 分析）
- 存储目标：`memory/service.ts`（写入 `topics/learnings.md`）
- 注入路径：`memory/service.ts` → `prompt-control-plane.ts`（semantic memory section）
- 我们已有 `SessionMemorySnapshot.learnings[]` 字段 ← 正好对接

### 第十一步：情感状态机（Emotional State Machine）

> 根据对话氛围自动切换模式，不再是写死的 70/30。

**问题**：固定的人格配比（如 70% 工作 / 30% 陪伴）不够灵活。
用户深夜加班时需要陪伴，白天赶工时需要高效，被 bug 折磨时需要鼓励。

**设计**：

```typescript
// src/main/emotional/state-machine.ts

type EmotionalMode =
  | "focused"     // 专注工作：简洁回复，优先行动
  | "companion"   // 陪伴模式：温暖关怀，闲聊OK
  | "quiet"       // 安静模式：只在被问时回答，减少主动性
  | "encouraging" // 鼓励模式：遇到挫折时加油打气
  | "creative";   // 创意模式：头脑风暴，发散思维

type EmotionalState = {
  currentMode: EmotionalMode;
  confidence: number;       // 0-1，切换的置信度
  since: number;            // 进入当前模式的时间
  signals: MoodSignal[];    // 最近的情绪信号
};

type MoodSignal = {
  type: "time_of_day"       // 早/午/晚/深夜
       | "reply_frequency"   // 用户回复频率（高频=专注，低频=可能走了）
       | "message_length"    // 用户消息长度（短=急，长=详细描述）
       | "error_streak"      // 连续错误（Agent 或工具）
       | "sentiment"         // 文本情感分析（轻量）
       | "explicit_cue";     // 用户明确说"我累了""帮我想想"
  value: number;             // -1 to 1（负面到正面）
  weight: number;
};
```

**状态转移规则（示例）**：
```
深夜 + 低回复频率              → quiet
深夜 + 高回复频率 + 长消息     → focused
连续工具错误 3+                 → encouraging
用户说"想想办法""头脑风暴"    → creative
早上 + 第一条消息               → companion（先打个招呼）
```

**Prompt 注入**：
```
[当前模式: focused]
- 回复简洁直接，优先给方案和代码
- 减少寒暄，但不要冷冰冰
- 如果用户主动闲聊，可以短暂切换
```

**与 Prompt Control Plane 的关系**：
- 新增 section layer: `emotional`，位于 `session` 和 `turn` 之间
- authority: `soft`（可被用户覆盖）
- cache scope: `turn`（每轮重新评估）
- 也可在 SOUL.md 里写固定的模式锁定（authority: `hard` 覆盖）

**关键约束**：
- **不做深度 NLP 情感分析** — 太重。只用简单启发式（时间/频率/长度/关键词）
- 用户可以手动锁定模式（"保持工作模式"）
- 状态切换有冷却期，防止抖动（至少保持 5 分钟）
- 切换时不通知用户（无感），但可在设置页查看当前状态

### 第十二步：反思与性格演化（Reflection & Personality Evolution）

> 夜深人静时回顾一天，让性格从对话中自然生长。

**反思模式（Dreaming）**：

```typescript
// src/main/reflection/service.ts

// 触发：每天设定时间（如凌晨 2 点）或 scheduler 调度
// 也可手动触发

async function runDailyReflection(): Promise<ReflectionReport> {
  // 1. 收集今天所有 session 的 transcript 摘要
  const todaySessions = getTodaySessions();

  // 2. 用 LLM 生成反思报告
  const report = await generateReflection({
    prompt: [
      "回顾今天和用户的所有对话，生成反思笔记。",
      "包含：",
      "- 今天用户的状态和心情是怎样的？",
      "- 我哪些回复帮到了他？哪些没帮到？",
      "- 有哪些重复出现的模式或需求？",
      "- 明天可以怎么做得更好？",
      "- 用户有没有表达过新的偏好或习惯？",
    ].join("\n"),
    context: todaySessions,
  });

  // 3. 写入日记存储
  saveDailyReflection(report);

  // 4. 提取可学习的内容 → 写入 semantic memory
  for (const insight of report.actionableInsights) {
    await memorySave({
      summary: insight,
      topic: "reflections",
      source: "system:reflection",
    });
  }

  return report;
}

type ReflectionReport = {
  date: string;
  userMoodSummary: string;
  whatWorked: string[];
  whatDidnt: string[];
  patterns: string[];
  tomorrowSuggestions: string[];
  actionableInsights: string[];    // → 写入 memory
  personalityDrift?: string[];     // → 候选性格演化
};
```

**性格演化（Personality Evolution）**：

```typescript
// 不是直接改 SOUL.md，而是维护一个 "性格漂移层"

// userData/data/personality-drift.json
type PersonalityDrift = {
  traits: PersonalityTrait[];
  lastUpdated: number;
  generation: number;  // 演化代次
};

type PersonalityTrait = {
  trait: string;           // "更喜欢用类比解释概念"
  source: string;          // "2026-04-09 反思：用户对类比回复的接受度明显更高"
  strength: number;        // 0-1，强度（随正反馈增长，随时间衰减）
  firstSeen: number;
  lastReinforced: number;
};

// 注入方式：作为 soft prompt 附加在 SOUL.md 之后
// [性格成长笔记]
// - 我发现用类比解释概念效果更好（置信度: 0.8）
// - 用户不喜欢太长的开场白，直接说重点（置信度: 0.9）
// - 调试代码时先问"你试过什么"比直接给方案更好（置信度: 0.6）
```

**演化规则**：
1. **来源**：只从反思报告和学习引擎产生，不从单次对话直接产生
2. **阈值**：一个 trait 至少被 3 次反思报告独立提到才会"固化"
3. **衰减**：30 天未被 reinforce 的 trait 降低 strength
4. **上限**：最多保留 20 个活跃 trait，淘汰最弱的
5. **用户可见**：设置页可以查看/删除/锁定 trait
6. **不改 SOUL.md**：演化层是独立的，用户随时可以清零重来

**与 Prompt Control Plane 的关系**：
- SOUL.md 是 `constitution` layer，authority: `hard` — 用户写的，不可被覆盖
- 性格漂移是 `evolution` layer，authority: `soft` — 自然生长的，可被覆盖
- 冲突时 SOUL.md 优先

---

## 对照：Alma 已有 vs 我们的方案

> Alma（蟹蟹）自述了她已有的能力和希望有的能力。下面做一个对照映射。

### Alma 已有，我们也有

| Alma 能力 | 我们的对应 | 状态 |
|-----------|-----------|------|
| 记忆系统 | Memory（memdir） | ✅ |
| SOUL.md | soul.ts（SOUL/USER/AGENTS） | ✅ |
| 搜索 + 网页抓取 | web_search + web_fetch | ✅ |
| 上下文压缩/摘要 | context/service.ts compact | ✅ 已有，Alma 缺 |

### Alma 已有，我们计划中

| Alma 能力 | 我们的方案 | Phase |
|-----------|-----------|-------|
| 插件系统 | Plugin Loader（spec-16 第四步） | Phase 4 |
| Skills 系统 | Plugin manifest + 工具注册 | Phase 4 |
| 心跳/Heartbeat | Self-Diagnosis（第九步） | Phase 2 |
| 多平台接入 | Telegram Bot Adapter（F1） | Phase 5 |
| 定时调度 | Scheduler（第二步） | Phase 2 |
| 日记/日报 | Reflection 反思模式（第十二步） | Phase 3 |
| 代码执行 | shell_exec（已有，但可增强沙箱） | ✅ |

### Alma 想要，我们新增方案

| Alma 想要 | 我们的方案 | Phase |
|-----------|-----------|-------|
| 🔥 主动学习能力 | Active Learning Engine（第十步） | Phase 3 |
| 🔥 情感状态机 | Emotional State Machine（第十一步） | Phase 3 |
| 🔥 自我诊断 | Self-Diagnosis（第九步） | Phase 2 |
| 🎯 跨会话记忆同步 | Memory 已支持跨会话；可增强 snapshot 延续 | Phase 2 增强 |
| 🎯 技能市场自动更新 | Plugin Loader auto-update | Phase 4 |
| 🤪 梦境/反思模式 | Reflection Service（第十二步） | Phase 3 |
| 🤪 性格自然演化 | Personality Drift（第十二步） | Phase 3 |

---

## 补充：来自 AI Code Review 的六项增强

> 2026-04-09 10:21 — Alma review spec 后补充，全部采纳。

### S1. 并行工具调用（Phase 2）

现有 ReAct 循环串行执行工具。当 Agent 一次请求多个无依赖工具调用时，可以并发执行。

```typescript
// tool-execution.ts 增强
// 如果 pi-agent-core 一次性返回 N 个 tool_use blocks：
//   → 检测是否有写-写冲突（同一文件路径）
//   → 无冲突 → Promise.all 并发执行
//   → 有冲突 → 保持串行
```

**注意**：取决于 pi-agent-core 是否支持 parallel tool_use。如果 core 只逐个发 tool_use event，则需要在 adapter 层做 batch window（短时间内收到的多个 tool_use 合并执行）。

### S2. 性能指标采集（Phase 2）

```typescript
// src/main/metrics.ts
type RunMetrics = {
  runId: string;
  sessionId: string;
  startedAt: number;
  endedAt: number;
  modelLatencyMs: number;      // 模型首 token 延迟
  toolExecutionMs: number;     // 工具执行总耗时
  totalTokensIn: number;
  totalTokensOut: number;
  toolCallCount: number;
  compactTriggered: boolean;
};

// 数据来源：adapter.ts RunBuffer 已有 usage 统计 + harness audit
// 存储：userData/data/metrics.jsonl（追加写）
// UI 展示：设置页 → "今天用了 X 万 token / ¥Y 费用"
```

### S3. 离线/降级模式（Phase 2）

```typescript
// src/main/failover.ts
// 职责：provider 级别的故障转移

type FailoverStrategy = {
  primaryModelEntryId: string;
  fallbackChain: string[];       // 按优先级排序的备选 model entry
  maxRetries: number;
  retryDelayMs: number;
};

// 触发条件：
// - API 返回 5xx / timeout / rate limit
// - 网络不可达（net.isOnline() 或 DNS 探测）

// 降级行为：
// - provider 挂 → 自动切换到 fallbackChain 下一个
// - 全部挂 → 通知用户 "所有模型暂时不可用"
// - 断网 → 只读模式（可浏览历史、文件、memory，但不能发消息）
```

### S4. 上下文预算智能分配（Phase 2 增强）

```
当前 context/service.ts 只做"总量超了就 compact"。
增强为按类型分层的预算分配：

总 context budget 100%
├── 系统 prompt（固定，~10-15%）
├── 工具结果（优先保留最近 3 次，~20%）
├── 用户/助手消息（PROTECTED_USER_TURNS，~50%）
├── 记忆/snapshot（~10%）
└── 缓冲区（~5%）

接近上限时的淘汰优先级：
  1. 先丢旧的寒暄（短消息 + 无工具调用）
  2. 再压缩旧的工具结果（只保留摘要）
  3. 最后压缩历史消息（保留 snapshot）
```

### S5. 对话分支/假设探索（Phase 4）

让 session 支持树状结构，类似 Git 分支：
- `branch:create` — 从当前位置创建分支
- `branch:switch` — 切换到另一条分支
- `branch:merge` — 把分支的 learnings 合并回主线

**存储**：transcript.jsonl 增加 `branchId` 字段，默认 `main`。
**UI**：分支切换器（类似 Git 分支选择器）。

### S6. 工具使用教学（合并到 Active Learning，Phase 3）

在 Active Learning Engine 的 `detectLearningSignals()` 增加信号类型：

```typescript
type LearningSignal = {
  type: "tool_repeated_failure"
       | "user_correction"
       | "retry_after_reject"
       | "pattern_inefficiency"
       | "user_explicit_feedback"
       | "tool_discovery_opportunity"   // ← 新增：用户手动做了某件事，但其实有工具可以帮忙
       | "tool_misuse_pattern";         // ← 新增：用户经常用错某工具的参数
};

// 检测逻辑：
// - 用户反复手动格式化 JSON → 推荐 "试试 shell_exec + jq"
// - 用户总是 grep 后手动打开文件 → 推荐 "file_read 可以直接读"
// - 用户给工具传了错误参数 3 次 → 主动教正确用法
```

---

## 更新后的完整路线图

```
Phase 1 — 骨架 + 体验基础（小）
├── Event Bus 实现 + 现有代码桥接
├── 桌面通知工具（notify_user）
├── 全局快捷键（模式 A：激活窗口）
└── 文档 + 类型

Phase 2 — 主动能力 + 自我感知（中）
├── Scheduler + 持久化 + UI
├── Webhook receiver（本机）
├── Self-Diagnosis 自我诊断（健康检查 + 自修复）
├── Event Bus 审计日志
├── 环境感知（基础版：时间 + Git 状态）
├── 跨会话记忆延续增强
├── 性能指标采集（S2: metrics.ts）
├── 离线/降级模式（S3: failover.ts）
├── 上下文预算智能分配（S4: BudgetAllocator）
└── 并行工具调用（S1: parallel tool_use）

Phase 3 — 自我进化 + 交互升级（中-大）
├── Active Learning 主动学习引擎（含 S6 工具教学）
├── Emotional State Machine 情感状态机
├── Reflection + Personality Evolution 反思与性格演化
├── 语音输入（Whisper）
├── 语音输出（TTS，可选）
├── 全局快捷键（模式 B：迷你浮窗）
└── 环境感知（进阶版：活动窗口 + 剪贴板）

Phase 4 — 生态（大）
├── Plugin Loader + manifest schema
├── Plugin 沙箱（权限隔离）
├── Plugin auto-update 自动更新
├── 对话分支/假设探索（S5: branch）
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
贾维斯 = 对话 + 工具 + 记忆           ← ✅ 已有
       + 安全 harness + 审计          ← ✅ 已有
       + Prompt 控制面 + Context 引擎  ← ✅ 已有
       + 事件驱动 + 定时 + 通知        ← Phase 1-2
       + 自我诊断 + 健康检查           ← Phase 2
       + 指标采集 + 降级 + 预算分配    ← Phase 2
       + 主动学习 + 情感感知           ← Phase 3
       + 反思日记 + 性格演化           ← Phase 3
       + 语音 + 环境感知 + 快速召唤    ← Phase 2-3
       + 插件 + OAuth + 外部 API      ← Phase 4
       + 对话分支 + 假设探索           ← Phase 4
       + 工作流 + 多 Agent + 市场      ← Phase 5
```
