# 02 — Adapter 层

> 状态：`in-review`
> 依赖：01-overview, 03-agent-core
> 更新时间：2026-04-13 15:29:14

## 2.1 职责

Adapter 层是主进程和外部世界之间的翻译层：

- **接收** — 把外部输入翻译成主进程可处理的统一格式
- **输出** — 把 Agent / Harness / Window / Terminal 事件翻译成前端可消费的格式
- **交互** — 处理确认、文件选择、系统通知等需要用户参与的动作

## 2.2 为什么需要这一层

如果没有 Adapter 层，Agent Core 里会写满这种代码：

```typescript
// ❌ 不好：Agent Core 直接依赖 Electron
if (isElectron) {
  mainWindow.webContents.send('agent:event', event);
} else if (isTelegram) {
  bot.sendMessage(chatId, formatEvent(event));
}
```

每加一个平台就要改 Agent Core。这违反了"关注点分离"——Agent 的职责是思考和调用工具，不应该关心消息怎么送达。

有了 Adapter 层：

```typescript
// ✓ 好：Agent Core 只跟接口对话
adapter.sendAgentEvent(event);  // 不管是 Electron 还是 Telegram，同一行代码
```

## 2.3 接口定义

```typescript
interface AgentAdapter {
  /**
   * 监听用户输入
   * 当用户发送消息时触发回调
   */
  onUserMessage(handler: (input: UserInput) => void): void;

  /**
   * 发送 agent 事件给用户
   * 包括：思考过程、工具调用状态、最终回复等
   */
  sendAgentEvent(event: AgentEvent): void;

  /**
   * 请求用户确认
   * 用于高风险操作（如 shell 命令执行、文件覆盖）
   * 返回 true = 用户同意，false = 用户拒绝
   */
  requestConfirmation(request: ConfirmationRequest): Promise<boolean>;

  /**
   * 发送系统通知
   * 非对话内容：错误提示、配置变更提醒等
   */
  sendNotification(notification: Notification): void;
}
```

### 数据类型

```typescript
// 用户输入
interface UserInput {
  text: string;                    // 消息文本
  attachments?: Attachment[];      // 附件（文件、图片等）
  sessionId: string;               // 会话 ID
}

// Agent 事件（直接透传 pi-agent-core 的事件 + 包装）
type AgentEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end' }
  | { type: 'turn_start' }
  | { type: 'turn_end' }
  | { type: 'thinking_delta'; content: string }
  | { type: 'text_delta'; content: string }
  | { type: 'text_done'; content: string; usage: Usage }
  | { type: 'tool_start'; name: string; params: any }
  | { type: 'tool_update'; name: string; data: any }
  | { type: 'tool_end'; name: string; result: any; error?: string }
  | { type: 'error'; message: string }

// 确认请求
interface ConfirmationRequest {
  title: string;                   // "执行 Shell 命令"
  description: string;             // "即将执行: git push origin main"
  riskLevel: 'low' | 'medium' | 'high';
}

// 系统通知
interface Notification {
  level: 'info' | 'warning' | 'error';
  message: string;
}
```

## 2.4 Electron Adapter（当前实现）

当前唯一正式实现是 Electron Adapter，通过 `preload + IPC` 连接 React 前端和主进程。

```
React 前端                  Preload                   Main Process
(Renderer)                  (Bridge)                  (Agent Core)
    │                          │                          │
    │─ desktopApi.chat.send() ─→│─ ipcRenderer.invoke ──→│
    │                          │       'chat:send'        │
    │                          │                          │─→ Agent Core
    │                          │                          │   处理消息
    │                          │                          │
    │←─ onEvent callback ──────│←─ ipcRenderer.on ───────│
    │                          │     'agent:event'        │←─ agent.subscribe()
    │  更新 UI                  │                          │
```

### 当前实现要点

**接收用户消息：**
```typescript
Renderer -> preload -> IPC -> chat domain service
```

**发送 Agent 事件：**
```typescript
Agent Core -> ElectronAdapter -> webContents.send("agent:event", event)
```

**用户确认：**

当前确认主链分两段：

1. 正在运行的高风险动作：主进程原生确认框 / renderer 响应
2. 应用重启后的中断审批：先以 `interrupted approval notice` 形式恢复给 UI

当前“中断审批恢复”先恢复成可见状态和可追踪 notice，真正恢复原动作执行仍是后续阶段。

### IPC 能力面

当前 Adapter 暴露的能力已经不止聊天：`files / sessions / groups / chat / context / agent / settings / providers / models / workspace / terminal / git / window / quickInvoke`。

### 当前边界

- Renderer 只通过 `window.desktopApi` 进入系统
- Preload 只暴露白名单能力，不把 Electron 原语直接下放到 React
- Main IPC 负责把请求路由到 chat / harness / settings / workspace 等领域服务
- Adapter 只做桥接，不承担 run state machine 和 policy

## 2.5 后续扩展

后续阶段才实现其他入口。接口大概长这样：

```typescript
class TelegramAdapter implements AgentAdapter {
  private bot: TelegramBot;

  onUserMessage(handler) {
    this.bot.on('message', msg => {
      handler({
        text: msg.text,
        sessionId: String(msg.chat.id),  // Telegram chat ID 作为 session
      });
    });
  }

  sendAgentEvent(event) {
    if (event.type === 'text_done') {
      this.bot.sendMessage(this.chatId, event.content);
    }
    // tool 状态可以用 Telegram 的 "typing..." 指示器
  }

  async requestConfirmation(request) {
    // 发送带按钮的消息，等待用户点击
    await this.bot.sendMessage(this.chatId, request.description, {
      reply_markup: { inline_keyboard: [[
        { text: '✅ 执行', callback_data: 'confirm' },
        { text: '❌ 取消', callback_data: 'cancel' },
      ]]}
    });
    return await this.waitForCallback();
  }
}
```

同一个 Adapter 抽象可以支持 Electron、Telegram 或其他入口。当前阶段先把 Electron 主链收稳。

## 2.6 文件结构

```
src/
  adapter/
    types.ts              # AgentAdapter 接口 + 数据类型定义
    electron-adapter.ts   # Electron IPC 实现
    event-mapper.ts       # pi-agent-core 事件 → AgentEvent 转换
```
