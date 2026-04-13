# 11 — 内嵌终端

> 状态：`in-review`
> 依赖：05-builtin-tools、10-steps-visualization

## 11.1 设计目标

Agent 执行 `shell_exec` 时，用户需要看到命令的实时输出。同时用户自己也可能想手动跑命令（检查状态、调试等）。

**两个使用场景：**

1. **被动查看** — Agent 调用 shell_exec，输出实时流入终端，用户可以旁观
2. **主动操作** — 用户自己打开终端，手动输入命令（不经过 Agent）

这两个场景共用同一个终端实例，就像 VS Code 的终端一样。

## 11.2 布局：底部抽屉

终端以底部抽屉的形式集成，不占用对话流空间。

```
┌──────────────────────────────────────────────┐
│  Sidebar │       Thread 主区       │ 右侧面板 │
│          │                        │          │
│          │  对话内容               │          │
│          │  ...                   │          │
│          │                        │          │
│          ├────────────────────────┤          │
│          │  ┌─ 终端抽屉 ────────┐ │          │
│          │  │ $ npm run build   │ │          │
│          │  │ > building...     │ │          │
│          │  └──────────────────┘ │          │
│          │  Composer             │          │
└──────────────────────────────────────────────┘
```

### 抽屉行为

| 操作 | 行为 |
|------|------|
| `Cmd+J` / `Ctrl+J` | 切换抽屉开关 |
| 拖拽顶部边缘 | 调节高度（最小 150px，最大 60% 视口高度） |
| Agent 执行 shell_exec | 抽屉自动打开（如果关着），输出实时流入 |
| 步骤卡片 "在终端中查看 ↗" | 打开抽屉 + 滚动到对应命令位置 |
| 点击抽屉标题栏的关闭按钮 | 关闭抽屉（终端进程不中断） |

### 抽屉标题栏

```
┌─ 终端 ─────────────────────────── [＋] [最小化] [×] ─┐
│  Tab1: workspace  │  Tab2: agent-output              │
├──────────────────────────────────────────────────────┤
│  $ _                                                  │
└──────────────────────────────────────────────────────┘
```

- 标题栏可拖拽调节高度
- `[＋]` 新建终端 tab
- `[最小化]` 折叠到只剩标题栏（一行高）
- `[×]` 完全关闭抽屉

## 11.3 终端 Tab 管理

支持多个终端 tab，各自独立的 shell 进程。

| Tab 类型 | 创建时机 | 说明 |
|----------|---------|------|
| **workspace** | 应用启动时自动创建 | 用户手动操作用，cwd = workspace 根目录 |
| **agent-output** | 第一次 Agent 执行 shell_exec 时创建 | Agent 的所有命令输出流入这个 tab |
| **用户新建** | 用户点 `[＋]` | 额外的手动终端 |

### 为什么 Agent 用独立 tab？

Agent 执行的命令和用户手动输入的命令混在一起会很乱。分开后：
- 用户的 workspace tab 始终干净，可以自由操作
- agent-output tab 是 Agent 行为的完整日志，方便回溯
- Agent 的命令在 agent-output 中有视觉标记（见 11.5）

## 11.4 技术方案：xterm.js + node-pty

### 架构

```
Renderer (xterm.js)  ──IPC──  Main Process (node-pty)
   ↕ 显示终端画面              ↕ 管理真实 shell 进程
   ↕ 接收键盘输入              ↕ 收发 stdin/stdout
```

**Main Process 端：**
- 使用 `node-pty` 创建伪终端（pty）进程
- 每个 tab 对应一个 pty 实例
- shell 类型：Windows 用 PowerShell，macOS/Linux 用用户的默认 shell
- 环境变量继承当前进程 + workspace 的 `.env`（如果有）

**Renderer 端：**
- 使用 `@xterm/xterm` 渲染终端界面
- 加载插件：
  - `@xterm/addon-fit` — 自动适配容器尺寸
  - `@xterm/addon-web-links` — URL 可点击
  - `@xterm/addon-search` — 终端内搜索（`Cmd+F`）
  - `@xterm/addon-unicode11` — 中文字符宽度正确显示

### IPC 通道

```typescript
// shared/ipc.ts 新增
const terminalChannels = {
  'terminal:create':   /* → 创建 pty，返回 terminalId */,
  'terminal:write':    /* → 向 pty stdin 写入数据 */,
  'terminal:resize':   /* → 通知 pty 终端尺寸变化 */,
  'terminal:destroy':  /* → 销毁 pty 进程 */,
  'terminal:data':     /* ← pty stdout 数据推送给 renderer */,
  'terminal:exit':     /* ← pty 进程退出通知 */,
};
```

### 数据流

**用户输入：**
```
键盘输入 → xterm.onData → IPC 'terminal:write' → node-pty.write(data)
```

**命令输出：**
```
node-pty stdout → IPC 'terminal:data' → xterm.write(data)
```

**Agent 执行命令：**
```
Agent shell_exec
  → Main Process 向 agent-output 的 pty 写入命令
  → pty stdout 同时推送给：
    1. xterm（终端 tab 渲染）
    2. Agent event stream（步骤卡片内联显示）
```

## 11.5 Agent 命令的终端渲染

当 Agent 执行 shell_exec 时，命令在 agent-output tab 中的显示需要和用户手动输入有所区分：

```
┌─ agent-output ──────────────────────────────────────┐
│                                                      │
│  ┌─ Agent 执行 ──────────────────────── 14:32:05 ─┐ │
│  │ $ npm run build                                 │ │
│  │ > first-pi-agent@0.0.0 build                    │ │
│  │ > electron-vite build                           │ │
│  │ ✓ main built in 1.2s                            │ │
│  │ ✓ renderer built in 0.9s                        │ │
│  │                                                 │ │
│  │ 退出码: 0  耗时: 2.1s                            │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─ Agent 执行 ──────────────────────── 14:32:08 ─┐ │
│  │ $ npm test                                      │ │
│  │ FAIL src/App.test.tsx                           │ │
│  │ ...                                             │ │
│  │                                                 │ │
│  │ 退出码: 1  耗时: 3.4s                            │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
└──────────────────────────────────────────────────────┘
```

实现方式：Agent 执行命令前后，向 pty 写入 ANSI 转义序列画出分隔框和标注。具体：
- 命令执行前：写入分隔线 + "Agent 执行" 标题 + 时间戳
- 命令执行后：写入退出码 + 耗时 + 分隔线

这样在纯终端环境下也能区分哪些是 Agent 跑的。

## 11.6 步骤卡片与终端的联动

spec 10 定义的 shell_exec 步骤卡片和终端抽屉之间的交互：

### 卡片内 → 终端

步骤卡片展开后的 "在终端中查看 ↗" 按钮：
1. 打开终端抽屉（如果关着）
2. 切换到 agent-output tab
3. 滚动到对应命令的位置（通过命令的 terminalOffset 定位）

### 终端 → 卡片内

Agent 命令的 stdout 同时出现在两个地方：
- **步骤卡片内联**（spec 10）：轻量渲染，最多显示尾部 50 行，用 `ansi-to-html` 做简单颜色渲染
- **终端 tab**：完整的 xterm.js 渲染，支持全部 ANSI 特性（颜色、光标移动、进度条等）

两者共享同一个数据源（`tool_execution_update` 事件），但渲染能力不同。卡片内联是"预览"，终端是"完整视图"。

## 11.7 xterm.js 配置

```typescript
const terminalOptions: ITerminalOptions = {
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  fontSize: 13,
  lineHeight: 1.4,
  cursorBlink: true,
  cursorStyle: "bar",
  scrollback: 5000,           // 保留 5000 行历史

  // 浅色主题配色（与 spec 10 的 CSS 变量体系对齐）
  theme: {
    background:  "#1e293b",   // 终端背景（深色，即使整体是浅色主题）
    foreground:  "#e2e8f0",
    cursor:      "#e2e8f0",
    cursorAccent:"#1e293b",
    selectionBackground: "rgba(148, 163, 184, 0.3)",

    // ANSI 16 色（优化可读性）
    black:       "#1e293b",
    red:         "#ef4444",
    green:       "#22c55e",
    yellow:      "#eab308",
    blue:        "#3b82f6",
    magenta:     "#a855f7",
    cyan:        "#06b6d4",
    white:       "#e2e8f0",
    brightBlack: "#64748b",
    brightRed:   "#f87171",
    brightGreen: "#4ade80",
    brightYellow:"#facc15",
    brightBlue:  "#60a5fa",
    brightMagenta:"#c084fc",
    brightCyan:  "#22d3ee",
    brightWhite: "#f8fafc",
  },
};
```

终端区域在浅色主题下依然用深色背景——这是终端的通用惯例，深底浅字的可读性和视觉区分度都更好。与 spec 10 中代码块的处理方式一致。

后期主题自定义时，终端配色也通过 CSS 变量覆盖（xterm 支持通过 JS 动态更新 theme）。

## 11.8 终端生命周期

```
应用启动
  └→ 创建 workspace tab 的 pty（cwd = workspace）

Agent 首次执行 shell_exec
  └→ 创建 agent-output tab 的 pty（cwd = workspace）

用户点 [＋]
  └→ 创建新 pty（cwd = workspace）

用户切换会话
  └→ workspace tab 保持不变
  └→ agent-output tab 销毁，切到新会话时按需重建

用户关闭 tab
  └→ 销毁对应 pty 进程
  └→ 如果是最后一个 tab → 抽屉不关闭，显示空态（可以点 [＋] 新建）

应用退出
  └→ 销毁所有 pty 进程
```

## 11.9 键盘快捷键

| 快捷键 | 作用 | 条件 |
|--------|------|------|
| `Cmd/Ctrl + J` | 切换终端抽屉开关 | 全局 |
| `Cmd/Ctrl + \`` | 聚焦/离开终端（与 Composer 之间切换） | 全局 |
| `Cmd/Ctrl + T` | 在终端内新建 tab | 终端聚焦时 |
| `Cmd/Ctrl + W` | 关闭当前终端 tab | 终端聚焦时 |
| `Cmd/Ctrl + Shift + [` / `]` | 切换终端 tab | 终端聚焦时 |
| `Cmd/Ctrl + F` | 终端内搜索 | 终端聚焦时 |
| `Cmd/Ctrl + C` | 中断当前命令 / 复制选中文本 | 终端聚焦时（有选中=复制，无选中=SIGINT） |

## 11.10 性能考量

| 场景 | 风险 | 对策 |
|------|------|------|
| 命令输出极大（如 `cat` 大文件） | xterm 渲染卡顿 | scrollback 上限 5000 行；超过后自动丢弃最早的行 |
| 多个终端 tab 同时输出 | 内存占用 | 非活跃 tab 的 xterm 实例暂停渲染，只缓存数据；切到前台时回放 |
| 抽屉频繁开关 | xterm 重建开销 | 关闭抽屉不销毁 xterm 实例，只隐藏容器（`display: none`） |
| 终端尺寸变化（拖拽抽屉高度） | 渲染闪烁 | 用 `addon-fit` + `ResizeObserver`，debounce 100ms 后统一 resize |

## 11.11 与其他 Spec 的接口

| 对接 Spec | 接口点 |
|-----------|--------|
| 05-builtin-tools | shell_exec 的 `onUpdate` 数据同时写入 pty 和事件流 |
| 10-steps-visualization | 步骤卡片的 "在终端中查看" 跳转 + 内联输出预览 |
| 13-composer-and-settings | 终端字体/字号可在设置中配置 |
| 14-data-storage | 终端抽屉高度、tab 状态持久化到 UI state |
