# UI Redesign — 1:1 复刻 Codex 设计语言

**Date:** 2026-04-01
**Reference:** Codex desktop app（用户提供的多张截图）
**Goal:** 以 Codex app 为唯一设计参考，1:1 复刻其设计语言、密度、配色、交互细节。底层保持 pi-mono agent 架构不变。

## Design Principles

1. **照抄 Codex** — 不创新，不自由发挥，每个细节对齐 Codex
2. **灰白中性** — 配色先用灰白系（Codex 的薄荷绿色调后期再调）
3. **紧凑密度** — Codex 的字号 13px 正文、11px 辅助、紧凑间距
4. **YAGNI** — 只做当前能用的功能，占位按钮全删

---

## 全局视觉规范（对标 Codex）

### 配色

| Token | 值 | 用途 |
|-------|------|------|
| `--color-bg-shell` | `#f0f0f0` | 窗口底色（后期可调为 Codex 的薄荷灰绿） |
| `--color-bg-primary` | `#ffffff` | 主内容区白底 |
| `--color-bg-sidebar` | `transparent`（继承 shell） | 侧边栏透底 |
| `--color-text-primary` | `#1f2937` (gray-800) | 正文 |
| `--color-text-secondary` | `#6b7280` (gray-500) | 次要文字 |
| `--color-text-muted` | `#9ca3af` (gray-400) | 辅助/时间戳 |
| `--color-text-faint` | `#d1d5db` (gray-300) | placeholder、极弱文字 |
| `--color-border` | `rgba(0,0,0,0.06)` | 通用边框 |
| `--color-border-light` | `rgba(0,0,0,0.04)` | 极淡分隔线 |

### 字号

| 用途 | 大小 | 字重 |
|------|------|------|
| 页面标题（空状态"开始构建"） | 18px | medium (500) |
| 区域标题（"线程"） | 11px | medium (500) |
| 正文 / 消息内容 | 13px | normal (400) |
| 线程标题 | 13px | normal (400) |
| 辅助文字（时间、计数） | 11px | normal (400) |
| 极小标签 | 10px | normal (400) |
| Composer placeholder | 13px | normal (400) |
| 模型选择器 pill | 11px | normal (400) |

### 间距密度

| 元素 | Codex 参考值 |
|------|-------------|
| 侧边栏按钮 padding | `py-1.5 px-2` |
| 线程 item padding | `py-1.5 px-2.5` |
| 线程 item 间距 | `1px`（space-y-px） |
| 区域标题 padding | `px-3 py-1.5` |
| Composer 外层 padding | `px-6 pb-4 pt-1` |
| Composer 内层 padding | `px-4 py-3` |
| 消息 padding | `px-8 py-2` |
| 发送按钮 | 28px 圆形 |
| 图标大小 | 14px (3.5) 通用，12px (3) 极小 |

### 圆角

| 元素 | 圆角 |
|------|------|
| 主内容区左上角 | `rounded-tl-xl` (12px) |
| Composer 卡片 | `rounded-xl` (12px) |
| 消息气泡（用户） | `rounded-2xl` (16px) |
| 按钮/线程 item | `rounded-md` (6px) |
| 系统消息 | `rounded-xl` (12px) |
| 模型选择器 pill | `rounded-[5px]` |

### 滚动条

- 宽度：6px（从 10px 缩小）
- 颜色、圆角保持不变

---

## 逐组件 Spec

### 1. TitleBar（`TitleBar.tsx`）

**Codex 参考：** 顶部菜单栏有 File/Edit/View/Window/Help 原生菜单。

**我们的方案：** 保持 frameless + 自定义标题栏不变。窗口控制按钮（最小化/最大化/关闭）样式不变——已经足够紧凑。

**不改。**

### 2. Sidebar（`Sidebar.tsx`）— 重写

**Codex 参考（从截图精确提取）：**

```
┌─────────────────────┐
│ ✏ 新线程              │  ← 图标+文字，py-1.5 px-2，hover:bg-white/50
│                       │
│ 线程          ⇅ 📁+  │  ← "线程"标签 + 排序按钮 + 新建分组按钮
│                       │
│ 📁 C:                 │  ← 分组/项目（可展开/收缩）
│ 📁 .openclaw          │
│ ▼ 📁 first_pi_agent   │  ← 展开状态，hover 显示 ... 和 ✏ 按钮
│   ⟳ 我刚刚创建了sp... 3天│  ← 线程 item：缩进，标题+时间同行
│     开发 ChatGPT A... 6天│
│     说明如何兼容by... 3周│
│ 📁 bhdcm-html         │
│                       │
│ ⚙ 设置                │  ← 底部，点击直接跳设置页（不弹菜单）
└─────────────────────┘
```

**当前这次实现（不含分组/项目功能，放下一个 spec）：**

```
┌─────────────────────┐
│ ✏ 新线程              │
│                       │
│ 线程                  │
│                       │
│  我刚刚创建了sp... 3天 │  ← 单行紧凑 item
│  开发 ChatGPT A... 6天 │     hover 显示归档图标
│  说明如何兼容by... 3周 │     选中态 bg-white/50
│  update          3周  │
│                       │
│ 📦 已归档         (2) │  ← 归档入口，显示数量
│ ⚙ 设置                │  ← 点击直接跳设置页
└─────────────────────┘
```

**细节规范：**

- **"新线程"按钮：** `PlusIcon` (14px) + 文字 "新线程"，`text-[13px] text-gray-600`，`py-1.5 px-2 rounded-md`，hover `bg-white/50`
- **"线程"标签：** `text-[11px] font-medium text-gray-400`，左侧 `px-3`
- **线程 item：**
  - 单行 flex：标题（truncate，`text-[13px]`，选中 `text-gray-800`，未选中 `text-gray-500`）+ 时间（`text-[11px] text-gray-300`）
  - padding: `py-1.5 px-2.5 rounded-md`
  - 选中态：`bg-white/60`
  - hover：`bg-white/40` + 右侧显示归档图标（`ArchiveBoxIcon` 12px，灰色，hover 变深）
  - 间距：`space-y-px`
- **"已归档"入口：** `ArchiveBoxIcon` (14px) + "已归档" + 数量徽章（`text-[10px] text-gray-300`），`text-[12px] text-gray-400`
- **"设置"按钮：** `Cog6ToothIcon` (14px) + "设置"，`text-[12px] text-gray-400`，点击直接跳设置页（不弹出菜单/popover）
- **归档视图：** 点击"已归档"后，线程列表区域替换为归档列表，顶部有 `← 返回` 按钮。归档 item hover 显示恢复+删除按钮。

### 3. 顶部内容栏（`App.tsx` 中的 header）

**Codex 参考：**
```
线程标题  项目名  ...    [模型图标v] [⇋移至工作树] [⊙提交v] [>_] [📋] [+343 -1] [📋]
```

**当前这次实现（终端按钮+diff 统计放下一个 spec）：**
```
线程标题                                              [📐 右面板切换]
```

- 标题：`text-[13px] font-medium text-gray-500`
- padding：`px-4 py-2`（从 `px-5 py-3` 收紧）
- 右面板切换按钮保持，但缩小为 `h-7 min-w-7`

### 4. Empty State（`MessageList.tsx` — 空状态）

**Codex 参考：** 居中显示对话气泡图标 + "开始构建" + 项目名（带下拉箭头）

**我们的实现：**
- 图标：对话气泡 SVG，40px，`text-gray-400`，浅灰圆形背景 `h-10 w-10 bg-gray-50 border border-black/6`
- 标题：`text-lg font-medium text-gray-700`，内容"开始构建"
- 副标题：`text-[13px] text-gray-400`，内容"first_pi_agent"（纯文本，不带边框/下拉）

### 5. Composer（`Composer.tsx`）— 重写布局

**Codex 参考：**
```
┌──────────────────────────────────────────┐
│ Ask Codex anything, 📎 to add files...    │  ← placeholder
│                                            │
│ + │ GPT-5.4 v │ 高 v │            │ [⬆] │  ← 底部工具栏
└──────────────────────────────────────────┘
  □ 本地 v │ ⚙ 自定义(config.toml) v        ← 外部状态栏（我们暂不做）
```

**我们的实现：**
```
┌──────────────────────────────────────────┐
│ 向 Pi Agent 提问...                        │
│                                            │
│ 📎 │ Claude Sonnet-4 v │ 思考:关闭 v │ [⬆]│  ← 合并为一行
└──────────────────────────────────────────┘
```

- 外层：`px-6 pb-4 pt-1`
- 卡片：`max-w-3xl mx-auto rounded-xl border border-black/8 bg-white px-4 py-3 shadow-[0_2px_8px_rgba(99,117,145,0.04)]`
- 输入区：`text-[13px] leading-7 text-gray-800 placeholder:text-gray-300`，无边框
- 底部工具栏：`border-t border-black/4 pt-2 mt-2`，flex 一行
  - 左侧：附件按钮（图标 only，`PaperClipIcon` 14px）+ 模型选择器 pills（`text-[11px] py-0.5 px-2 border rounded-[5px]`）
  - 右侧：发送按钮 28px 圆形 `bg-gray-800 text-white`，disabled `bg-gray-200 text-gray-400`
- 附件 chips：如有附件，显示在输入区上方，`text-[11px]`
- **去掉**独立的模型选择器分隔行

### 6. MessageList 消息样式（`MessageList.tsx`）

**Codex 参考：**
- 用户消息：右对齐，灰色圆角气泡，无标签
- 助手消息：左对齐，纯文本，无标签/头像

**用户消息：**
- `flex justify-end px-8 py-2`
- 气泡：`max-w-[75%] bg-gray-100 rounded-2xl px-3.5 py-2 text-[13px] leading-7 text-gray-800`
- 无 "YOU" 标签，无时间戳（hover 也不显示——保持干净）

**助手消息（无 agent steps 时）：**
- `px-8 py-2`
- 直接渲染 `<FinalReply>`，`text-[13px] leading-relaxed text-gray-700`
- 无 "ASSISTANT" 标签，无时间戳

**助手消息（有 agent steps 时）：**
- `px-8 py-2`
- 渲染 `<AgentResponseBlock>`，步骤卡片间距随全局收紧

**系统消息：**
- `px-8 py-2`
- `rounded-xl border border-amber-400/20 bg-amber-50 px-3 py-2 text-[12px] text-amber-800`

**Virtuoso 容器：** `max-w-3xl`（从 `max-w-4xl` 缩小）

### 7. Context Panel 默认状态

- `rightPanelOpen` 初始值改为 `false`
- `store.ts` 的 `getUiState()` 默认值也改为 `{ rightPanelOpen: false }`
- 已保存的用户偏好仍会从文件恢复

### 8. Boot/Error 页面（`App.tsx`）

**启动页：**
- `rounded-xl`（从 `rounded-[28px]` 缩小）
- 标题：`text-lg font-medium`（从 `text-2xl font-semibold`）
- padding：`px-6 py-4`（从 `px-8 py-7`）
- 背景色：`bg-[#f0f0f0]`

**错误页：**
- 同样收紧，`max-w-lg`（从 `max-w-2xl`），`rounded-xl`，`px-6 py-4`

### 9. Archive Feature（归档线程）

**数据层（contracts.ts + store.ts）：**

- `ChatSession` 新增 `archived?: boolean`
- `ChatSessionSummary` 新增 `archived?: boolean`
- `summarizeSession()` 包含 `archived`
- `listSessions()` 过滤 `archived !== true`
- 新增 `listArchivedSessions()` / `archiveSession()` / `unarchiveSession()`
- `deleteSession()` 已存在，保持不变

**IPC 层：**

- 新增 channels：`sessions:archive` / `sessions:unarchive` / `sessions:list-archived` / `sessions:delete`
- `DesktopApi.sessions` 新增：`archive()` / `unarchive()` / `listArchived()` / `delete()`
- preload 暴露对应方法
- main/index.ts 注册对应 handler

**Sidebar UI：** 见上面 Sidebar 组件 spec。

---

## 下一个 Spec 预留

以下功能不在本次范围，放到下一个 spec：

1. **项目/分组**：侧边栏项目树（项目 → 线程），项目绑定工作目录，分组展开/收缩，`...` 菜单
2. **顶部工具栏**：终端切换按钮、diff 统计徽章（`+343 -1`）
3. **设置页面**：Codex 风格的全页设置（常规/外观/配置/MCP 等分类导航）
4. **Codex 薄荷绿色调**：等功能稳定后统一调色

---

## Files to Modify

1. `src/renderer/src/styles/theme.css` — shell 背景色 + 新增 CSS 变量
2. `src/renderer/src/styles.css` — 滚动条、floating-workspace
3. `src/renderer/src/App.tsx` — rightPanelOpen 默认值、layout padding、boot/error 页面
4. `src/renderer/src/components/Sidebar.tsx` — 完全重写
5. `src/renderer/src/components/Composer.tsx` — 重写布局
6. `src/renderer/src/components/MessageList.tsx` — 消息样式重写
7. `src/renderer/index.html` — body 背景色
8. `src/shared/contracts.ts` — archived 字段、DesktopApi 归档方法
9. `src/shared/ipc.ts` — 归档 IPC channels
10. `src/main/store.ts` — 归档函数、listSessions 过滤、getUiState 默认值
11. `src/main/index.ts` — 归档 IPC handler、backgroundColor
12. `src/preload/index.ts` — 归档 desktopApi 方法
