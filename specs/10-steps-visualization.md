# 10 — 推理过程可视化

> 状态：`in-review`
> 依赖：03-agent-core、04-tool-system、05-builtin-tools

## 10.1 设计目标

用户发一条消息后，Agent 可能需要 5-20 步才能给出最终回复。这个过程不是黑箱——用户应该能看到 Agent 在**想什么**、**做什么**、**做到哪了**，但又不能被细节淹没。

**核心原则：**
- **默认安静，按需展开** — 每个步骤折叠为一行摘要，点击展开看详情
- **视觉层次清晰** — 一眼能分辨"在思考"、"在执行工具"、"出错了"、"完成了"
- **流式感** — 正在进行的步骤有动画，不是等全部做完再刷出来
- **好看** — 卡片、颜色、间距、动效都要讲究，不能像 debug 日志

## 10.2 整体布局

```
┌──────────────────────────────────────────────────────┐
│  Sidebar  │          Thread 主区          │ 右侧面板  │
│           │                              │（Tab 切换）│
│  会话列表  │  ┌──────────────────────┐   │           │
│           │  │ 用户消息              │   │  · Diff   │
│           │  └──────────────────────┘   │  · 终端    │
│           │                              │  · 文件    │
│           │  ┌──────────────────────┐   │           │
│           │  │ Agent 响应区          │   │           │
│           │  │                      │   │           │
│           │  │  ┌─ 折叠步骤卡片 ──┐ │   │           │
│           │  │  │ 🔍 读取了 3 个…  │ │   │           │
│           │  │  ├─ 折叠步骤卡片 ──┤ │   │           │
│           │  │  │ ⚡ 执行了 npm…   │ │   │           │
│           │  │  ├─ 折叠步骤卡片 ──┤ │   │           │
│           │  │  │ 📝 写入 2 个文件 │ │   │           │
│           │  │  └────────────────┘ │   │           │
│           │  │                      │   │           │
│           │  │  最终回复文本         │   │           │
│           │  │  （Markdown 渲染）    │   │           │
│           │  └──────────────────────┘   │           │
│           │                              │           │
│           │  ┌──────────────────────┐   │           │
│           │  │ Composer 输入框       │   │           │
│           │  └──────────────────────┘   │           │
│           │                              │           │
│           │  ┌──────────────────────┐   │           │
│           │  │ 终端抽屉（Cmd+J）     │   │           │
│           │  └──────────────────────┘   │           │
└──────────────────────────────────────────────────────┘
```

一条 Agent 响应 = **步骤卡片区** + **最终回复区**。步骤卡片区只在 Agent 执行了工具调用时出现；如果 Agent 直接回复文本（没有工具调用），则只显示最终回复区。

## 10.3 事件到 UI 的映射

03-agent-core 定义的事件流是前端渲染的数据源。以下是每种事件对应的 UI 行为：

| Agent 事件 | UI 行为 |
|-----------|---------|
| `agent_start` | 创建新的 Agent 响应区，显示 loading 指示器 |
| `turn_start` | 准备接收新一轮内容 |
| `thinking_delta` | 累积到当前"思考"步骤卡片，折叠摘要显示前 N 个字 + 脉动动画 |
| `text_delta` | 累积到最终回复区，实时渲染 Markdown |
| `tool_execution_start` | 新建一张工具步骤卡片（状态：executing），显示工具名 + 参数摘要 |
| `tool_execution_update` | 更新工具卡片内部内容（如 shell 的 stdout 流） |
| `tool_execution_end` | 更新工具卡片状态（success / error），折叠为摘要行 |
| `turn_end` | 标记本轮完成 |
| `agent_end` | 移除 loading 指示器，整个响应区标记为完成 |

## 10.4 步骤卡片设计

### 卡片状态

每张步骤卡片有三种状态：

| 状态 | 视觉表现 |
|------|---------|
| `executing` | 左侧彩色竖条 + 脉动动画 + spinner，背景微微发光 |
| `success` | 左侧绿色竖条 + 对勾图标，安静的完成态 |
| `error` | 左侧红色竖条 + 错误图标，摘要显示错误信息（自动展开） |

### 折叠态（默认）

一行摘要，高度固定（约 40px），结构：

```
┌─[状态色条]─[图标]─ 摘要文本 ──────────── [耗时] [展开箭头]─┐
└──────────────────────────────────────────────────────────┘
```

摘要文本根据工具类型自动生成：

| 工具 / 步骤类型 | 折叠摘要示例 |
|----------------|-------------|
| thinking | `思考中…` → 完成后变成 `思考了 3.2 秒` |
| file_read | `读取了 src/main/index.ts（第 1-200 行）` |
| file_write | `写入了 src/components/App.tsx（新建，45 行）` |
| shell_exec | `执行了 npm run build` → 成功：`npm run build（退出码 0，2.1 秒）` / 失败：`npm run build 失败（退出码 1）` |
| web_fetch | `获取了 https://api.example.com/…` |
| memory_search | `检索了 3 条相关记忆` |
| MCP 工具 | `调用了 {server}:{tool}（{参数摘要}）` |
| 多工具并发 | `并行执行了 3 个工具` → 子卡片嵌套 |

### 展开态

点击摘要行展开，显示完整的步骤详情。展开区域根据工具类型渲染不同内容：

**thinking（思考）：**
```
┌─[绿色条]─ ✓ 思考了 3.2 秒 ─────────────────── [折叠箭头]─┐
│                                                          │
│  用户想创建一个 React 组件。我需要先看看现有的组件结构，    │
│  然后在合适的目录下创建新文件。让我先读一下 src/components │
│  目录下的现有组件…                                        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**file_read（读文件）：**
```
┌─[绿色条]─ ✓ 读取了 src/main/index.ts（1-200 行） ─ [折叠]─┐
│                                                            │
│  ┌─ src/main/index.ts ──────────────────────────────────┐  │
│  │  1  import { app, BrowserWindow } from 'electron'    │  │
│  │  2  import { registerIpcHandlers } from './ipc'      │  │
│  │  …（最多显示 20 行预览，更多内容截断 + "查看完整文件"）  │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

**file_write（写文件）：**
```
┌─[绿色条]─ ✓ 写入了 src/components/App.tsx ──── [折叠]─┐
│                                                        │
│  ┌─ diff 预览 ──────────────────────────────────────┐  │
│  │  + import React from 'react'                     │  │
│  │  + export function App() {                       │  │
│  │  +   return <div>Hello</div>                     │  │
│  │  + }                                             │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  [在右侧面板中查看完整 Diff ↗]                           │
│                                                        │
└────────────────────────────────────────────────────────┘
```

点击 "在右侧面板中查看完整 Diff" 会切换右侧面板到 Diff tab 并高亮该文件。

**shell_exec（执行命令）：**
```
┌─[绿色条]─ ✓ npm run build（退出码 0，2.1 秒）── [折叠]─┐
│                                                        │
│  $ npm run build                                       │
│  ┌─ terminal output ─────────────────────────────────┐ │
│  │  > first-pi-agent@0.0.0 build                     │ │
│  │  > electron-vite build                             │ │
│  │  ✓ main built in 1.2s                              │ │
│  │  ✓ renderer built in 0.9s                          │ │
│  └───────────────────────────────────────────────────┘ │
│                                                        │
│  [在终端中查看 ↗]                                       │
│                                                        │
└────────────────────────────────────────────────────────┘
```

终端输出区域用等宽字体 + 深色背景渲染，支持 ANSI 颜色。streaming 执行中时，输出实时滚动追加。

**error 状态（任何工具）：**
```
┌─[红色条]─ ✗ npm test 失败（退出码 1）─────── [折叠]─┐
│                                                     │
│  $ npm test                                         │
│  ┌─ terminal output ────────────────────────────┐   │
│  │  FAIL src/App.test.tsx                        │   │
│  │  ● renders correctly                          │   │
│  │    Expected: "Hello"                           │   │
│  │    Received: "World"                           │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

error 卡片**默认展开**，让用户立即看到出了什么问题。

### 并发工具调用

LLM 可能在一次回复中调用多个工具（agent-core 并行执行）。这种情况用嵌套卡片：

```
┌─[蓝色条]─ ⚡ 并行执行了 3 个工具 ──────────── [折叠]─┐
│                                                      │
│  ┌─[绿色条]─ ✓ 读取了 package.json ────────────────┐ │
│  └─────────────────────────────────────────────────┘ │
│  ┌─[绿色条]─ ✓ 读取了 tsconfig.json ───────────────┐ │
│  └─────────────────────────────────────────────────┘ │
│  ┌─[红色条]─ ✗ 读取 .env 失败（文件不存在）──────────┐ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
└──────────────────────────────────────────────────────┘
```

子卡片同样可以单独展开查看详情。

## 10.5 最终回复区

Agent 的最终文本回复渲染在步骤卡片区下方，与步骤卡片视觉上分离。

**渲染规格：**
- Markdown 完整渲染：标题、列表、链接、加粗斜体等
- 代码块语法高亮（与步骤卡片内的代码块用相同的高亮引擎）
- 代码块右上角带 "复制" 按钮
- 行内代码用浅色背景标识
- 流式输出时逐字/逐 token 出现，带微弱的打字机光标效果

**与步骤区的视觉分隔：**
步骤卡片区用较浅的背景或缩进，最终回复区用正常对话气泡样式。这样用户能一眼区分"过程"和"结果"。

## 10.6 状态指示器

### 整体进度

Agent 响应区顶部，当 Agent 正在执行时显示一个状态条：

```
┌────────────────────────────────────────┐
│  ● 正在执行… 第 3 步 / 共执行了 5 步    │
│  [取消执行]                              │
└────────────────────────────────────────┘
```

- "共执行了 N 步"是已完成的步骤计数（因为总步数不可预知）
- "第 N 步"是当前正在执行的步骤序号
- 取消按钮触发 AbortSignal

### 单步状态图标

| 状态 | 图标 | 颜色 |
|------|------|------|
| executing | 旋转 spinner | 主题蓝 |
| success | 对勾 ✓ | 绿色 |
| error | 叉 ✗ | 红色 |
| thinking | 脑/闪电图标 + 脉动 | 紫色 |

## 10.7 流式更新策略

### 事件缓冲

前端通过 IPC 收到的事件是高频的（text_delta 可能每 50ms 一个）。直接逐个渲染会导致 DOM 抖动和性能问题。

**策略：**
1. 用 `requestAnimationFrame` 做批量渲染——在一个 frame 内累积所有 delta，合并后一次性更新 DOM
2. 文本内容用 `ref` 直接操作 DOM 追加，不走 React state 的 re-render 路径（streaming 阶段）
3. streaming 结束后（`message_end`），再把完整内容同步到 React state（确保状态一致）

### 滚动行为

- Agent 正在输出时，自动滚动到底部（跟随最新内容）
- 如果用户手动向上滚动了（查看历史），停止自动滚动
- 出现一个 "⬇ 滚动到底部" 浮动按钮，点击恢复跟随

### 步骤卡片的过渡动画

- 新步骤卡片出现：从底部滑入 + 渐显（`framer-motion` 的 `AnimatePresence`）
- 步骤完成（executing → success）：spinner 变对勾 + 左色条颜色过渡
- 折叠/展开：平滑高度过渡（`layout` 动画）
- 所有动画时长 150-250ms，easing 用 `ease-out`

## 10.8 数据模型

前端维护一个与消息关联的 steps 数组：

```typescript
type StepStatus = "executing" | "success" | "error";

/** 单个步骤 */
type AgentStep = {
  id: string;                          // 唯一 ID（事件中携带或前端生成）
  kind: "thinking" | "tool_call";      // 步骤类型
  status: StepStatus;
  startedAt: number;                   // timestamp
  endedAt?: number;

  // thinking 专用
  thinkingText?: string;               // 累积的思考文本

  // tool_call 专用
  toolName?: string;                   // 工具名
  toolArgs?: Record<string, unknown>;  // 工具参数
  toolResult?: unknown;                // 工具返回值
  toolError?: string;                  // 工具错误信息

  // shell_exec 专用（streaming output）
  streamOutput?: string;               // 累积的 stdout/stderr

  // 并发子步骤
  children?: AgentStep[];              // 并发调用时的子步骤
};

/** Agent 一次完整响应 */
type AgentResponse = {
  id: string;                          // 对应 ChatMessage.id
  status: "running" | "completed" | "error" | "cancelled";
  steps: AgentStep[];                  // 有序的步骤列表
  finalText: string;                   // 最终回复文本（累积）
  startedAt: number;
  endedAt?: number;
  totalTokens?: number;
  cost?: number;
};
```

### 事件处理伪代码

```typescript
function handleAgentEvent(event: AgentEvent, response: AgentResponse) {
  switch (event.type) {
    case "agent_start":
      response.status = "running";
      break;

    case "thinking_delta":
      // 找到或创建当前的 thinking step
      let thinkingStep = findActiveThinkingStep(response);
      if (!thinkingStep) {
        thinkingStep = createStep("thinking");
        response.steps.push(thinkingStep);
      }
      thinkingStep.thinkingText += event.delta;
      break;

    case "tool_execution_start":
      const toolStep = createStep("tool_call");
      toolStep.toolName = event.toolName;
      toolStep.toolArgs = event.args;
      // 如果同时有多个 tool_execution_start 且在同一个 turn
      // → 包装为并发组（children）
      response.steps.push(toolStep);
      break;

    case "tool_execution_update":
      const activeStep = findStepById(response, event.stepId);
      activeStep.streamOutput += event.output;
      break;

    case "tool_execution_end":
      const doneStep = findStepById(response, event.stepId);
      doneStep.status = event.error ? "error" : "success";
      doneStep.toolResult = event.result;
      doneStep.toolError = event.error;
      doneStep.endedAt = Date.now();
      break;

    case "text_delta":
      response.finalText += event.delta;
      break;

    case "agent_end":
      // 关闭所有还在 executing 的 thinking step
      finalizeThinkingSteps(response);
      response.status = "completed";
      response.endedAt = Date.now();
      break;
  }
}
```

## 10.9 组件结构

```
<AgentResponseBlock>              // 一条完整的 Agent 响应
  <ResponseHeader />              // 状态条：正在执行… / 已完成
  <StepsList>                     // 步骤卡片区
    <StepCard />                  // 单个步骤卡片（可折叠）
      <ThinkingContent />         // thinking 类型的展开内容
      <FileReadContent />         // file_read 类型的展开内容
      <FileWriteContent />        // file_write 的 diff 预览
      <ShellExecContent />        // shell_exec 的终端输出
      <WebFetchContent />         // web_fetch 的结果
      <MemorySearchContent />     // memory_search 的结果
      <McpToolContent />          // MCP 工具的通用展示
    <ParallelStepGroup />         // 并发步骤组（嵌套 StepCard）
  </StepsList>
  <FinalReply />                  // 最终回复区（Markdown 渲染）
</AgentResponseBlock>
```

### 关键依赖

| 用途 | 库 | 说明 |
|------|-----|------|
| Markdown 渲染 | `react-markdown` + `remark-gfm` | GFM 表格、任务列表等 |
| 代码高亮 | `shiki`（或 `prism-react-renderer`） | 语法高亮，支持多主题 |
| Diff 渲染 | `diff`（npm 包）+ 自定义组件 | file_write 的 inline diff 预览 |
| 终端渲染 | 内联的 ANSI-to-HTML | 步骤卡片内的命令输出（轻量，不需要完整 xterm） |
| 动画 | `framer-motion` | 卡片进出、折叠展开、状态过渡 |

注：步骤卡片内的终端输出只需要 ANSI 颜色渲染（`ansi-to-html` 或类似轻量库），不需要完整的终端模拟器。完整的 xterm.js 终端集成在 spec 11 中定义，用于底部终端抽屉。

## 10.10 视觉规范

### 主题系统

默认使用**浅色主题**，通过 CSS 变量实现主题化，后期支持用户自定义颜色。

所有颜色引用 CSS 变量而非硬编码 Tailwind class。Tailwind 的 `theme.extend.colors` 指向这些变量，组件代码只写语义化 class（如 `bg-step-card`、`border-step`），不直接写色值。

```css
/* src/renderer/src/styles/theme.css */

:root {
  /* ---- 全局基础 ---- */
  --color-bg-primary:        #ffffff;        /* 主背景 */
  --color-bg-secondary:      #f9fafb;        /* 次要背景（步骤区） */
  --color-bg-tertiary:       #f3f4f6;        /* 三级背景（hover） */
  --color-text-primary:      #111827;        /* 主文本 */
  --color-text-secondary:    #6b7280;        /* 次要文本 */
  --color-text-muted:        #9ca3af;        /* 弱化文本（耗时标签等） */
  --color-border:            #e5e7eb;        /* 边框 */
  --color-border-light:      #f3f4f6;        /* 轻边框 */

  /* ---- 步骤卡片 ---- */
  --color-step-bg:           #f9fafb;        /* 卡片背景 */
  --color-step-bg-hover:     #f3f4f6;        /* 卡片 hover */
  --color-step-border:       #e5e7eb;        /* 卡片边框 */

  /* ---- 状态色条 ---- */
  --color-status-executing:  #3b82f6;        /* 蓝 — 执行中 */
  --color-status-success:    #10b981;        /* 绿 — 成功 */
  --color-status-error:      #ef4444;        /* 红 — 失败 */
  --color-status-thinking:   #8b5cf6;        /* 紫 — 思考 */
  --color-status-cancelled:  #9ca3af;        /* 灰 — 已取消 */

  /* ---- 代码/终端区 ---- */
  --color-code-bg:           #1e293b;        /* 代码块深色背景（浅色主题下代码块仍用深底） */
  --color-code-text:         #e2e8f0;        /* 代码文本 */
  --color-terminal-bg:       #1e293b;        /* 终端输出背景 */

  /* ---- 强调 / 交互 ---- */
  --color-accent:            #3b82f6;        /* 主强调色 */
  --color-accent-hover:      #2563eb;        /* 强调色 hover */
  --color-accent-subtle:     #eff6ff;        /* 强调色浅底（如选中态） */
}
```

**自定义主题的预留方式：**
- 用户在设置中选择 / 导入一套 CSS 变量覆盖
- 后期可扩展为 `[data-theme="dark"]` 切换暗色、`[data-theme="custom"]` 加载用户配色
- v1 只实现浅色主题，但代码中**所有颜色必须走变量**，不能硬编码

### 间距

| 元素 | 值 |
|------|-----|
| 步骤卡片之间 | 4px（紧凑，步骤之间不需要大间距） |
| 步骤区与最终回复区之间 | 16px |
| 卡片内部 padding | 12px 16px |
| 左侧色条宽度 | 3px |
| 圆角 | 8px（与 HeroUI 组件一致） |

### 字体

| 元素 | 字体 |
|------|------|
| 摘要文本 | 系统 UI 字体，13px |
| 代码/终端输出 | `JetBrains Mono` / `Fira Code` / 等宽回退，12px |
| 最终回复正文 | 系统 UI 字体，14px |

## 10.11 交互细节

### 折叠/展开

- 点击摘要行任意位置展开/折叠
- 展开时内容区域高度从 0 过渡到实际高度（framer-motion layout 动画）
- 多个卡片可以同时展开
- 快捷键：选中卡片后按 Space 切换折叠状态（可选，v1 不强制）

### 链接到右侧面板

file_write 卡片展开后有 "在右侧面板中查看完整 Diff ↗" 链接：
- 点击后右侧面板自动切换到 Diff tab
- 对应文件的 diff 高亮显示
- 如果右侧面板是关闭的，自动打开

shell_exec 卡片展开后有 "在终端中查看 ↗" 链接：
- 点击后底部终端抽屉打开
- 定位到对应命令的位置

### 取消执行

- 响应头部的 "取消执行" 按钮，点击后触发 AbortSignal
- 正在 executing 的步骤标记为 cancelled（灰色）
- 最终回复区显示 "（已取消）"

### 重新生成

- 已完成/已取消的响应可以重新生成
- 重新生成时清除当前响应的 steps 和 finalText，重新走 agent.prompt 流程

## 10.12 性能考量

| 场景 | 风险 | 对策 |
|------|------|------|
| 长对话（100+ 消息） | 所有消息同时在 DOM | 虚拟滚动（`react-virtuoso`）——只渲染可见区域 |
| 大量步骤（一条响应 20 步） | 展开所有步骤占大量空间 | 默认全部折叠 + 只渲染可见步骤 |
| 高频 text_delta | 每个 delta 触发 re-render | RAF 批量渲染 + ref 直追 DOM（10.7 节已述） |
| shell_exec 大量 stdout | 输出几千行 | 展开态最多显示 200 行 + "查看完整输出" 按钮跳转终端面板 |
| 代码高亮大文件 | shiki 初始化慢 | 懒加载 shiki + 异步高亮 + streaming 阶段跳过高亮（完成后再上色） |

## 10.13 与其他 Spec 的接口

| 对接 Spec | 接口点 |
|-----------|--------|
| 03-agent-core | 事件流格式（10.3 节的事件到 UI 映射） |
| 04-tool-system | 工具名和参数结构（用于摘要文本生成） |
| 05-builtin-tools | 各工具的 `details` 返回格式（用于展开态渲染） |
| 11-terminal-integration | shell_exec 卡片的 "在终端中查看" 跳转 |
| 12-file-diff-display | file_write 卡片的 "在右侧面板中查看 Diff" 跳转 |
| 13-composer-and-settings | Composer 的取消/重新生成按钮 |
