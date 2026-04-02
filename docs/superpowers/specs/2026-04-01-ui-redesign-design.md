# UI Redesign — Codex-Style Compact & Clean

**Date:** 2026-04-01
**Reference:** Codex desktop app (screenshots provided by user)
**Goal:** 把当前"密度低、元素大、间距松"的 UI 改造成 Codex 风格的紧凑、干净、精致界面。

## Design Principles

1. **紧凑密度** — 字号小、间距紧、信息密度高
2. **灰白中性** — 配色暂用灰白系，后期再调强调色
3. **最小改动骨架** — 保持侧边栏+主区域的布局结构，只改样式和组件内容
4. **YAGNI** — 删掉没用的占位功能（技能、自动化按钮）

## Scope

### 改的

| 区域 | 改动 |
|------|------|
| **theme.css** | 只调 `--color-bg-shell` 为中性灰（`#f0f0f0`），其他变量保持灰白系 |
| **全局字号** | 标题 34px→18px，正文 15px→13px，辅助文字 12px→11px，标签 11px→10px |
| **全局间距** | padding/gap/margin 全面收紧约 40%（如 `px-8`→`px-4`，`py-7`→`py-3`） |
| **Sidebar** | 删除"技能""自动化"按钮；线程 item 改为单行（标题+时间同一行）；去掉"X 条消息"副文本 |
| **空状态** | 图标 64px→40px，标题 34px→18px，去掉 `first_pi_agent` 按钮或改为小号文字 |
| **Composer** | 整体 padding 缩小；模型选择器和工具栏合到一行；发送按钮缩小（40px→28px）；去掉独立的 border-top 分隔线，模型选择器和附件按钮在同一行 |
| **MessageList 用户消息** | 改为右对齐灰色气泡（`bg-gray-100`，`rounded-2xl`，无蓝色背景），Codex 风格 |
| **MessageList 助手消息** | 去掉 uppercase "ASSISTANT" 标签，改为小头像+名称，内容左对齐纯文本 |
| **TitleBar** | 无改动（已经够紧凑） |
| **ContextPanel** | `rightPanelOpen` 默认值从 `true` 改为 `false` |
| **styles.css** | `.floating-workspace` 圆角从 `rounded-tl-2xl` 缩小为 `rounded-tl-xl`；scrollbar thumb 更细 |
| **SettingsModal** | 不在本次范围（后续单独优化） |

### 不改的

- Electron 主进程、preload、IPC 通信
- 状态持久化（store.ts）
- Agent 引擎（agent.ts）
- MCP 集成（src/mcp/）
- 终端抽屉（TerminalDrawer/TerminalTab）功能逻辑
- 组件库选择（继续用 HeroUI）
- StepCard / AgentResponseBlock / DiffView 等 agent 步骤展示组件（样式微调随间距一起收紧即可）

## Component-Level Spec

### 1. Sidebar (`Sidebar.tsx`)

**Before:**
- 顶部 3 个按钮（新线程 / 技能 / 自动化）
- 线程 item 两行：标题行 + "X 条消息"行
- 间距松散（`px-3 pb-4 pt-3`，item `py-2.5`）

**After:**
- 顶部只保留"新线程"按钮，样式改为小号图标+文字（`py-1.5 px-2 text-[13px]`）
- 线程标题区"线程"标签保留，去掉筛选按钮
- 线程 item 单行：`标题...` + `时间`（flex justify-between），`py-1.5 px-2.5 text-[12px]`
- 选中态：`bg-white/50` 轻微高亮，无边框
- 底部"设置"按钮尺寸缩小

### 2. Empty State (`MessageList.tsx` — items.length === 0)

**Before:**
- 64px 圆形图标 + 34px 粗体 "Let's build" + 下拉按钮

**After:**
- 40px 图标（保持云朵或改为对话气泡）
- 18px `font-medium` 标题 "开始构建"
- 下方小号 `text-[13px] text-gray-400` 显示 "first_pi_agent"（纯文本，不带边框按钮）

### 3. Composer (`Composer.tsx`)

**Before:**
- `px-8 pb-6 pt-2` 大 padding
- 三层结构：输入框 / 工具栏 / 模型选择器（各有 border-top 分隔）
- 发送按钮 40px 圆形

**After:**
- `px-6 pb-4 pt-1` 收紧 padding
- 两层结构：输入框 / 底部工具栏（附件按钮 + 模型选择器 + 发送按钮 同一行）
- 去掉模型选择器独立分隔行，合并到底部工具栏
- 发送按钮 28px 圆形
- `max-w-3xl`（从 `max-w-4xl` 缩小）
- 模型选择器改为更小的 pill：`text-[11px] py-0.5 px-2 rounded-[5px]`

### 4. MessageList 消息样式

**用户消息 — Before:**
- 左对齐，uppercase "YOU" 标签 + 时间，蓝色半透明气泡 `bg-accent-500/8`

**用户消息 — After:**
- 右对齐（`flex justify-end`）
- 灰色气泡 `bg-gray-100 rounded-2xl px-3 py-2 text-[13px]`
- 去掉 "YOU" 标签和时间（或改为 hover 时才显示时间）
- `max-w-[75%]` 限制宽度

**助手消息 — Before:**
- 左对齐，uppercase "ASSISTANT" 标签 + 时间

**助手消息 — After:**
- 左对齐，无标签/无头像（直接显示文本内容）
- `text-[13px] leading-relaxed text-gray-700`
- Agent steps 保持 StepCard 组件，间距随全局收紧

### 5. Context Panel 默认状态

- `App.tsx` 中 `rightPanelOpen` 初始值从 `true` 改为 `false`
- `bootApp` 中从 `uiState.rightPanelOpen` 读取仍保留（用户手动开过的会恢复）

### 6. Global Styles

**theme.css:**
- `--color-bg-shell: #f0f0f0`（中性灰，从 `#e8ecf2` 蓝灰调整）
- 其他变量保持不变

**styles.css:**
- 滚动条 thumb 宽度从 10px 缩小到 6px
- `.floating-workspace` 圆角从 `2xl` 缩至 `xl`
- body 背景色跟随 `--color-bg-shell`

**index.html:**
- `body class` 的 `bg-[#e8ecf2]` 改为 `bg-[#f0f0f0]`

### 7. Archive Feature（归档线程）

**概念：** 线程不能直接删除。主列表里只能"归档"，归档后的线程从主列表消失，进入归档列表。只有在归档列表里才能永久删除。

**数据层（contracts.ts + store.ts）：**

- `ChatSession` 新增 `archived?: boolean` 字段（可选，默认 `false`）
- `ChatSessionSummary` 新增 `archived?: boolean` 字段
- `store.ts` 新增：
  - `archiveSession(sessionId: string)` — 将 session 的 `archived` 设为 `true` 并保存
  - `unarchiveSession(sessionId: string)` — 将 session 的 `archived` 设为 `false` 并保存
  - `listSessions()` — 只返回 `archived !== true` 的 sessions
  - `listArchivedSessions()` — 只返回 `archived === true` 的 sessions
  - `deleteSession()` — 已存在，保持不变（归档页面调用）

**IPC 层（ipc.ts + preload + main/index.ts）：**

- 新增 IPC channels：
  - `sessions:archive` — 归档指定 session
  - `sessions:unarchive` — 取消归档
  - `sessions:list-archived` — 列出已归档 sessions
  - `sessions:delete` — 永久删除（仅归档页面使用）
- `DesktopApi.sessions` 新增：
  - `archive(sessionId: string): Promise<void>`
  - `unarchive(sessionId: string): Promise<void>`
  - `listArchived(): Promise<ChatSessionSummary[]>`
  - `delete(sessionId: string): Promise<void>`

**Sidebar UI：**

- 线程列表底部（设置按钮上方）新增"已归档"入口，样式为小号图标+文字（类似 Codex 的 `归档线程` 按钮）
- 点击后侧边栏线程列表区域切换为归档列表视图：
  - 顶部显示 `← 已归档` 返回按钮
  - 列出所有已归档线程（同样的单行紧凑样式）
  - 每个归档线程 hover 时显示两个操作：恢复（取消归档） / 删除（永久）
- 主列表中线程 hover 时显示归档图标按钮（`ArchiveBoxIcon`），点击归档该线程

## Files to Modify

1. `src/renderer/src/styles/theme.css` — 修改 shell 背景色变量
2. `src/renderer/src/styles.css` — 滚动条、floating-workspace 圆角
3. `src/renderer/src/App.tsx` — rightPanelOpen 默认值、grid cols padding、booting/error 页面字号
4. `src/renderer/src/components/Sidebar.tsx` — 删按钮、重写线程 item、新增归档入口和归档列表视图
5. `src/renderer/src/components/Composer.tsx` — 收紧间距、合并工具栏行
6. `src/renderer/src/components/MessageList.tsx` — 用户消息右对齐灰泡、助手消息去标签
7. `src/renderer/index.html` — body 背景色
8. `src/shared/contracts.ts` — ChatSession/ChatSessionSummary 加 `archived` 字段，DesktopApi 加归档方法
9. `src/shared/ipc.ts` — 新增归档相关 IPC channel
10. `src/main/store.ts` — 新增 archiveSession/unarchiveSession/listArchivedSessions
11. `src/main/index.ts` — 注册归档相关 IPC handler
12. `src/preload/index.ts` — 暴露归档相关 desktopApi 方法
