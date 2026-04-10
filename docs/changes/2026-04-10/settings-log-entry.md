# 2026-04-10 设置页日志入口

> 更新时间：2026-04-10 16:23:20

## 本次做了什么

- 在设置页新增 `日志` 分区，能直接看 `app.log / audit.log`
- 新增日志快照 IPC，renderer 可以读取日志路径、大小、更新时间和最近 120 行
- 设置页支持切换日志文件和手动刷新

## 为什么改

- 之前日志虽然开始落盘了，但 UI 里没有入口
- 真报错时只能去磁盘手翻，很不顺手
- 现在先把“在设置里直接看日志”这件事补上，排障效率会高很多

## 涉及文件

- `src/main/logger.ts`
- `src/main/index.ts`
- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/settings/constants.ts`
- `src/renderer/src/components/assistant-ui/settings/types.ts`
- `src/renderer/src/components/assistant-ui/settings/logs-section.tsx`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`
- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `docs/changes/2026-04-10/settings-log-entry.md`

## 验证

- `2026-04-10 16:23:20` 运行 `pnpm exec tsc --noEmit -p tsconfig.json`
- `2026-04-10 16:23:20` 运行 `pnpm exec tsc --noEmit -p tsconfig.renderer.json`

## 说明

- 这轮先做最小可用日志入口，不做复杂筛选和搜索
- 当前主看 `app.log`，`audit.log` 作为辅助排查

## 第 2 轮：日志页瘦身

### 时间

- `2026-04-10 16:39:43`

### 本次做了什么

- 把日志页从多段 `row` 收成一张更紧的卡片
- 删掉大段解释文案，只保留必要说明
- 把路径、大小、更新时间、尾部行数并成一块紧凑信息区
- 刷新按钮缩短成 `刷新`，顶部操作也更干净

### 为什么改

- 第一版信息太碎，视觉噪音偏多
- 真排错时，用户更关心“切日志 + 看最近内容”，不需要一堆说明块

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/logs-section.tsx`
- `docs/changes/2026-04-10/settings-log-entry.md`

### 验证

- `2026-04-10 16:42:13` 运行 `pnpm exec tsc --noEmit -p tsconfig.renderer.json`

### 说明

- 这轮只做瘦身，不改日志读取能力

## 第 3 轮：JSON 可读性

### 时间

- `2026-04-10 16:42:34`

### 本次做了什么

- 日志尾部改成按行尝试解析 JSON
- 能解析的日志行会自动做缩进排版，再按条目空一行
- 非 JSON 行保持原样，避免把异常文本搞坏

### 为什么改

- 原始 JSON Lines 太挤，肉眼扫字段很痛苦
- 现在先做自动排版，先把“能看清”解决

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/logs-section.tsx`
- `docs/changes/2026-04-10/settings-log-entry.md`

### 验证

- `2026-04-10 16:44:33` 运行 `pnpm exec tsc --noEmit -p tsconfig.renderer.json`

### 说明

- 这轮不做语法高亮，只做可读性提升

## 第 4 轮：打开文件夹入口

### 时间

- `2026-04-10 16:46:00`

### 本次做了什么

- 在日志页把“打开文件夹”按钮加到“刷新”旁边
- 新增设置侧 IPC，renderer 可以让主进程打开当前日志所在目录
- 日志文件存在时直接定位文件，不存在时打开日志目录

### 为什么改

- 用户已经能在设置里看日志了，下一步最顺手的就是快速跳到目录
- 这样复制日志、发日志、手动深挖都会更快

### 涉及文件

- `src/main/logger.ts`
- `src/main/index.ts`
- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/renderer/src/components/assistant-ui/settings/logs-section.tsx`
- `docs/changes/2026-04-10/settings-log-entry.md`

### 验证

- `2026-04-10 16:48:44` 运行 `pnpm exec tsc --noEmit -p tsconfig.json`
- `2026-04-10 16:48:44` 运行 `pnpm exec tsc --noEmit -p tsconfig.renderer.json`

### 说明

- 这轮只加快捷入口，不改日志内容展示

## 第 5 轮：去重标题

### 时间

- `2026-04-10 16:50:15`

### 本次做了什么

- 去掉设置内容区顶部那个小号 `设置`
- 去掉和页面标题重复的卡片内部标题，至少覆盖 `日志 / 外观 / 终端 / 关于`
- `SettingsCard` 改成支持无标题头，方便后续少写重复 UI

### 为什么改

- 现在页面标题已经足够清楚，再来一层重复标题只会吵
- 设置页应该更像单页编辑，不该像“标题套标题”

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/shared.tsx`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`
- `src/renderer/src/components/assistant-ui/settings/logs-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/appearance-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/terminal-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/about-section.tsx`
- `docs/changes/2026-04-10/settings-log-entry.md`

### 验证

- `2026-04-10 16:54:04` 运行 `pnpm exec tsc --noEmit -p tsconfig.renderer.json`

### 说明

- 这轮只做去重，不改设置结构
