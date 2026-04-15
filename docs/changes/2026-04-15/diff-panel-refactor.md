# diff-panel 组件重构

**时间**: 2026-04-15 10:07 AM

## 概述

重构 Chela 项目的 diff-panel 组件，统一拖拽逻辑、收拢状态管理、引入 Tooltip 组件、预留 commit message 生成接口。

## 改动内容

### 1. useResizable Hook (已有，无需新建)
- `src/renderer/src/hooks/use-resizable.ts` 已存在且实现正确，支持 `axis`、`invert` 等参数。
- 直接复用该 hook 替代 diff-panel 中三套重复的 mouse handler。

### 2. diff-panel.tsx 重构
**文件**: `src/renderer/src/components/assistant-ui/diff-panel.tsx`

#### (a) 状态收拢
所有 `useState` 集中到 `DiffPanelInner` 组件顶部，按逻辑分组：
- layout & sizing (panelWidth, treeWidth, commitPanelHeight, layout)
- diff source & expansion (selectedDiffSource, expandedDiffPaths)
- file selection (selectedPaths, selectedPathsChanged)
- commit (commitMessage, isCommitting, isPushing, isStaging, isGeneratingMessage)

#### (b) 清理重复声明
合并了原本散落在 352/419/447/473/502 行的 commit 相关 useState。

#### (c) Tree 和 Commit Panel 改为兄弟区域
- 原结构：commit panel 嵌套在 tree 侧栏底部作为子区域
- 新结构：tree 和 commit panel 是同侧栏内的两个独立兄弟区域，中间用可拖拽分隔线连接：
  ```
  ┌─────────────┐
  │  tree 树     │ ← flex-1 占满剩余高度
  ├── 拖拽分隔线 ─┤ ← 可上下拖动调整高度比例
  │ commit panel │ ← 固定高度，可调整
  └─────────────┘
  ```

#### (d) Tooltip 替换
所有浏览器原生 `title="xxx"` 替换为 shadcn Tooltip 组件：
- 刷新按钮
- 布局切换按钮
- 暂存/取消暂存按钮
- Sparkles 生成按钮
- Push 按钮
- Commit 按钮

#### (e) Commit Message 生成接口
- 新增 `generateCommitMessage()` mock 函数
- 接收 `selectedFiles: GitDiffFile[]` 和 `diffs: string`
- 返回 `{ title, description }` 格式
- Sparkles 按钮点击后显示 loading 态 (`isGeneratingMessage`)

#### (f) 选中联动
- 当 `selectedPaths` 变化且 `commitMessage` 非空时，Sparkles 按钮显示蓝色小圆点提示

#### (g) 提交后行为
- `handleCommit` 成功后清空 `commitMessage` 并调用 `onRefresh()`
- 提交后清除 `selectedPathsChanged` 标记

#### (h) 按钮精简
- Commit 按钮：`CheckIcon` + 文本 + tooltip
- Push 按钮：`UploadIcon` 图标 + tooltip
- 移除了不再使用的 `SendIcon` import

## 设计约束遵循
- 保持黑白灰配色
- 布局架构不变：右侧抽屉 + 左侧 tree + 右侧 diff 卡片
- 优先使用留白、背景明暗、分组建立结构
- 所有交互元素保留 hover/active 态

## 补充修正

- `2026-04-15 16:13:00` 补齐了分支 `ahead / behind` 的后端解析，`Diff` 面板里的 `拉取 / 推送` 按钮现在能真正显示数量。
- `2026-04-15 16:13:00` `handlePull` 和 `handlePush` 成功后会立即刷新快照，避免数量和按钮状态停留在旧值。
