# 12 — 文件 Diff 展示

> 状态：`in-review`
> 依赖：05-builtin-tools、10-steps-visualization

## 12.1 设计目标

Agent 通过 `file_write` 修改文件时，用户需要看到**改了什么**。不是看到一整个新文件——而是一目了然地看到新增、删除、修改了哪些行。

**核心原则：**
- **两个层级** — 步骤卡片里看 diff 预览（快速扫一眼），右侧面板看完整 diff（仔细审查）
- **可操作** — 不是只能看，还能对 diff 做事（stage/revert chunk、inline comment）
- **熟悉感** — diff 的视觉语言对齐 GitHub / VS Code，开发者一看就懂

## 12.2 Diff 出现在两个地方

### 1. 步骤卡片内联（预览级）

spec 10 定义的 file_write 步骤卡片展开后，显示一个轻量 diff 预览：

```
┌─[绿色条]─ ✓ 写入了 src/App.tsx ─────────── [折叠]─┐
│                                                     │
│  ┌─ diff 预览 ───────────────────────────────────┐  │
│  │  @@ -12,6 +12,8 @@                            │  │
│  │    import { Button } from '@heroui/react'      │  │
│  │  + import { Modal } from '@heroui/react'       │  │
│  │    function App() {                            │  │
│  │  -   return <div>Hello</div>                   │  │
│  │  +   return <div>                              │  │
│  │  +     <Button>Click me</Button>               │  │
│  │  +   </div>                                    │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  显示 3 / 12 个变更块  [在右侧面板查看完整 Diff ↗]   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**规格：**
- 最多显示 3 个 hunk（变更块）
- 每个 hunk 最多显示上下文 3 行 + 变更行
- 超出部分折叠，显示 "显示 N / M 个变更块"
- 点击 "在右侧面板查看完整 Diff ↗" 跳转右侧面板

### 2. 右侧面板 Diff Tab（完整审查级）

右侧面板切到 Diff tab 时，展示当前 Agent 响应中所有文件变更的完整 diff。

```
┌─ Diff ─────────────────────────────────────────────┐
│                                                     │
│  ┌─ 文件列表 ────────────────────────────────────┐  │
│  │  M  src/App.tsx             +12  -3            │  │
│  │  A  src/components/Modal.tsx  +45               │  │
│  │  M  package.json             +2  -1            │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ── src/App.tsx ──────────────────────────────────  │
│                                                     │
│  @@ -1,10 +1,12 @@                                 │
│    import React from 'react'                        │
│    import { Button } from '@heroui/react'           │
│  + import { Modal } from '@heroui/react'            │
│    ...                                              │
│  @@ -12,6 +14,8 @@                                 │
│    function App() {                                 │
│  -   return <div>Hello</div>                        │
│  +   return (                                       │
│  +     <div>                                        │
│  +       <Button>Click me</Button>                  │
│  +     </div>                                       │
│  +   )                                              │
│    }                                                │
│                                                     │
│  ── src/components/Modal.tsx（新文件）─────────────  │
│                                                     │
│  + import React from 'react'                        │
│  + export function Modal() { ... }                  │
│  ...                                                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## 12.3 Diff 视图模式

支持两种视图模式，用户在面板顶部切换：

| 模式 | 说明 | 适合场景 |
|------|------|---------|
| **Unified**（默认） | 增删行交错显示，一列。GitHub PR 默认风格 | 面板宽度有限时、快速浏览 |
| **Split** | 左旧右新并排显示 | 面板拉宽后、仔细比对 |

面板宽度 < 500px 时自动切换到 Unified，避免 Split 挤成一团。

## 12.4 文件列表

右侧面板顶部是一个文件变更列表，显示当前 Agent 响应中所有 file_write 涉及的文件：

```
M  src/App.tsx             +12  -3     [stage] [revert]
A  src/components/Modal.tsx  +45        [stage] [revert]
M  package.json             +2  -1     [stage] [revert]
```

| 元素 | 说明 |
|------|------|
| 状态标记 | `A`=新增（绿色）、`M`=修改（橙色）、`D`=删除（红色） |
| 文件路径 | 相对于 workspace 的路径 |
| 增删统计 | `+N` 绿色、`-N` 红色 |
| stage 按钮 | 将该文件的变更 `git add`（如果在 git 仓库中） |
| revert 按钮 | 撤销该文件的变更，恢复到修改前 |

点击文件名 → 滚动到下方对应文件的 diff 区域。

## 12.5 Diff 行级交互

### Inline Comment

在 diff 的任意行上 hover 会出现 `[+]` 按钮，点击后弹出评论输入框：

```
  + import { Modal } from '@heroui/react'
  ┌──────────────────────────────────────────┐
  │ 评论: 这个 import 应该从 @heroui/modal  │
  │ 单独引入，减小 bundle size               │
  │                              [发送给 Agent] │
  └──────────────────────────────────────────┘
    function App() {
```

点击 "发送给 Agent" → 将评论作为用户消息发给 Agent，附带文件路径和行号上下文。Agent 可以据此修正代码。

### Chunk 操作

每个 hunk（变更块）右上角有操作按钮：

| 按钮 | 作用 |
|------|------|
| Stage chunk | 只 `git add` 这个 hunk（`git add -p` 的效果） |
| Revert chunk | 撤销这个 hunk 的变更 |
| Copy | 复制这个 hunk 的内容 |

## 12.6 Diff 的配色

走主题 CSS 变量，浅色系默认值：

```css
:root {
  /* ---- Diff 专用 ---- */
  --color-diff-add-bg:       #dcfce7;   /* 新增行背景 — 浅绿 */
  --color-diff-add-text:     #166534;   /* 新增行文本 — 深绿 */
  --color-diff-add-marker:   #22c55e;   /* 新增行左侧 +/标记 */
  --color-diff-del-bg:       #fee2e2;   /* 删除行背景 — 浅红 */
  --color-diff-del-text:     #991b1b;   /* 删除行文本 — 深红 */
  --color-diff-del-marker:   #ef4444;   /* 删除行左侧 -/标记 */
  --color-diff-hunk-header:  #eff6ff;   /* @@ 行背景 — 浅蓝 */
  --color-diff-context:      var(--color-bg-primary);  /* 上下文行 — 跟主背景一致 */
  --color-diff-gutter:       var(--color-bg-secondary); /* 行号列背景 */
  --color-diff-line-number:  var(--color-text-muted);   /* 行号文本 */
}
```

## 12.7 Diff 计算

### 数据来源

file_write 工具返回的 `details` 包含：
```typescript
{
  path: string;
  isNew: boolean;
  previousContent?: string;   // 修改前的完整内容
  newContent: string;          // 修改后的完整内容
}
```

### 计算方案

使用 `diff` npm 包（轻量，无依赖）在 renderer 进程中计算：

```typescript
import { structuredPatch } from 'diff';

const patch = structuredPatch(
  filePath,         // 旧文件名
  filePath,         // 新文件名
  previousContent,  // 旧内容
  newContent,       // 新内容
  '',               // 旧 header
  '',               // 新 header
  { context: 3 }    // 上下文行数
);
// patch.hunks → 结构化的 hunk 数组，直接用于渲染
```

新文件（`isNew: true`）→ 所有行标记为新增，不走 diff 计算。

### 为什么不用 Main Process 算？

diff 计算是纯 CPU 工作，不需要文件系统访问。在 renderer 算可以：
- 减少 IPC 开销
- 渲染和计算在同一进程，减少数据传输
- 文件内容已经通过事件传到前端了

但如果文件很大（> 10000 行），diff 计算可能阻塞 UI。对策：用 Web Worker 异步计算，完成后回传 hunks。

## 12.8 组件结构

```
<DiffPanel>                        // 右侧面板 Diff tab
  <DiffFileList />                 // 文件变更列表
  <DiffView>                       // 单个文件的 diff
    <DiffModeToggle />             // Unified / Split 切换
    <DiffHunk>                     // 单个变更块
      <HunkHeader />               // @@ -x,y +x,y @@ 行
      <DiffLine />                 // 单行（context / add / del）
        <InlineCommentTrigger />   // hover 出现的 [+] 按钮
      <ChunkActions />             // Stage / Revert / Copy
    </DiffHunk>
  </DiffView>
</DiffPanel>

<InlineDiffPreview>                // 步骤卡片内嵌的 diff 预览
  <DiffHunk />                     // 复用同一个 DiffHunk 组件
</InlineDiffPreview>
```

步骤卡片内的 diff 预览和右侧面板的 diff 复用同一套 `DiffHunk` / `DiffLine` 组件，只是外层容器和显示数量不同。

## 12.9 特殊场景

| 场景 | 处理 |
|------|------|
| 新文件 | 所有行标为新增（绿色），文件列表显示 `A` 标记 |
| 删除文件 | 所有行标为删除（红色），文件列表显示 `D` 标记。注：v1 的 file_write 不支持删除，预留 |
| 二进制文件 | 不展示 diff，显示 "二进制文件已修改" |
| 超大 diff（> 500 行变更） | 默认折叠，显示统计摘要 "该文件有 N 处变更（+X -Y 行）"，点击展开 |
| 同一文件被多次修改 | 以最终状态为准，diff 基于"首次修改前的内容" vs "最后一次修改后的内容" |
| Agent 仍在执行中 | 已完成的 file_write 步骤实时出现在 diff 面板，正在执行的不显示 |

## 12.10 Git 集成

Diff 面板的 stage / revert 功能需要 git 操作支持：

```typescript
// Main Process 新增 IPC handlers
'git:stage-file':    (filePath) => exec(`git add ${filePath}`)
'git:stage-hunk':    (filePath, hunkPatch) => /* git apply --cached */
'git:revert-file':   (filePath) => exec(`git checkout -- ${filePath}`)
'git:revert-hunk':   (filePath, hunkPatch) => /* git apply -R */
'git:status':        () => /* 返回 git status，用于判断哪些文件已 staged */
```

**非 git 仓库时：** stage / revert 按钮隐藏，只保留查看功能。

**revert 确认：** revert 是危险操作（不可逆），点击后弹确认对话框："确定要撤销对 {filePath} 的修改？此操作不可恢复。"

## 12.11 与其他 Spec 的接口

| 对接 Spec | 接口点 |
|-----------|--------|
| 05-builtin-tools | file_write 返回的 `details`（previousContent / newContent） |
| 10-steps-visualization | 步骤卡片内的 diff 预览 + "在右侧面板查看 Diff" 跳转 |
| 13-composer-and-settings | inline comment → 发送给 Agent 的消息格式 |
| 14-data-storage | diff 数据随会话持久化（或按需从文件系统重算） |
