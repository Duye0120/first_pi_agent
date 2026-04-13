# 2026-04-10 23:27 Design System Baseline

> 更新时间：2026-04-10 23:27:05

## 第 1 轮：本地 design-system 配置补齐

### 本次做了什么

- 新增 `docs/design-system-baseline.md`，说明本项目的 design-system 落地方式
- 在 `src/renderer/src/styles/theme.css` 补充 `radius / motion / shadow / selection / focus` token
- 在 `tailwind.config.ts` 暴露对应的语义化配置，方便后续组件直接复用
- 在 `src/renderer/src/styles.css` 把全局 focus ring、公共胶囊控件和动效切到 token

### 为什么改

- 用户给出的 `awesome-design-systems` 仓库是案例索引，不是直接可安装依赖
- 当前项目已经有 `CSS variables + Tailwind + shadcn` 基础，补齐 baseline 配置更贴近现状
- 提前把圆角、阴影、焦点态和选择态收敛成 token，后续 UI 继续演进时更容易保持一致

### 涉及文件

- `src/renderer/src/styles/theme.css`
- `src/renderer/src/styles.css`
- `tailwind.config.ts`
- `docs/design-system-baseline.md`
- `docs/changes/2026-04-10/design-system-baseline.md`

### 验证

- `2026-04-10 23:27:05` 人工复核 token source、Tailwind mapping 和全局样式引用链已打通

### 说明

- 本轮不引入新依赖，不执行 build/check
- 本轮只补基础配置，不改大块业务组件

## 第 2 轮：同步远端后对齐 Chela 主题

### 时间

- `2026-04-10 23:38:24`

### 本次做了什么

- 拉取远端 `origin/main` 后，保留本地新增的通用 design token
- 将这些 token 改为优先映射到远端刚落地的 `Chela` 主题体系
- 解决 `src/renderer/src/styles/theme.css` 与 `tailwind.config.ts` 的冲突
- 更新 `docs/design-system-baseline.md`，明确当前 baseline 以 `Chela` 为底座

### 为什么改

- 远端最新提交已经引入更完整的 `Chela` 主题系统
- 如果继续保留一套独立于 `Chela` 的通用值，会让主题来源重新分叉
- 现在更合理的做法是：保留通用 token 入口，但让它们引用 `Chela` 的语义值

### 涉及文件

- `src/renderer/src/styles/theme.css`
- `tailwind.config.ts`
- `docs/design-system-baseline.md`
- `docs/changes/2026-04-10/design-system-baseline.md`

## 第 3 轮：统一选择器选中态

### 时间

- `2026-04-10 23:43:58`

### 本次做了什么

- 将 `Select`、`ModelSelector`、`BranchSwitcher` 的选中态统一改为走 `selection-bg / selection-fg / selection-muted-bg`
- 把 `BranchSwitcher` 弹层、输入框、创建区按钮的剩余硬编码圆角、背景和 focus ring 改成复用 `Chela` token
- 更新设计基线文档，明确选择器不再各自维护一套选中色

### 为什么改

- 用户明确追问：看完 `awesome-design-systems` 之后，最终会对当前项目做什么改变
- 真正有价值的改变不是再装一套外部库，而是把项目内已有的 `Chela` 主题和选择态 token 收敛成统一入口
- 这样后续新增下拉、列表、分支切换、模型选择时，都能直接复用同一套视觉语言

### 涉及文件

- `src/renderer/src/components/assistant-ui/select.tsx`
- `src/renderer/src/components/assistant-ui/model-selector.tsx`
- `src/renderer/src/components/assistant-ui/branch-switcher.tsx`
- `docs/design-system-baseline.md`
- `docs/changes/2026-04-10/design-system-baseline.md`

## 第 4 轮：重做分支切换器与 Context 浮层层级

### 时间

- `2026-04-10 23:43:58`

### 本次做了什么

- 重做 `BranchSwitcher` 弹层的背景层级、搜索框、列表容器和创建区，减少盒中盒与描边感
- 重做 `ContextSummaryTrigger` 的 hover / expanded 浮层结构，把多块信息改成更清晰的卡片分组
- 将两者统一到更轻的浅色阴影和更克制的背景层级表达

### 为什么改

- 当前分支切换器和 Context 浮层在浅色模式下盒子感太重，层级也不够干净
- 用户明确指出分支选择器“非常不好看”，Context 浮层也存在同类问题
- 按项目长期约束，这类面板应该优先依赖背景层级、留白和统一选中态，而不是靠多层边框堆结构

### 涉及文件

- `src/renderer/src/components/assistant-ui/branch-switcher.tsx`
- `src/renderer/src/components/assistant-ui/context-summary-trigger.tsx`
- `docs/design-system-baseline.md`
- `docs/changes/2026-04-10/design-system-baseline.md`

## 第 6 轮：按界面规范重做 Context 信息架构

### 时间

- `2026-04-11 00:05:04`

### 本次做了什么

- 参考 `web-interface-guidelines` 的信息层级和简化原则，重做 `ContextExpandedSummary`
- 将原本多块重复样式卡片，收敛为 `概览 / 窗口明细 / 续接摘要 / 任务推进 / 辅助信息 / 操作区` 六类分组
- 使用 `section / dl / dt / dd` 表达摘要与明细关系，减少纯视觉盒子堆叠
- 保留 `8px` 圆角基线，同时降低视觉噪声，提升主信息和次信息的对比

### 为什么改

- 用户明确反馈当前区域“整体设计太丑”
- 之前版本虽然已经统一 token 和圆角，但信息结构仍然过碎、过重
- 真正的问题不只是样式值，而是信息架构：每块都像卡片，导致视线没有主次

### 涉及文件

- `src/renderer/src/components/assistant-ui/context-summary-trigger.tsx`
- `docs/design-system-baseline.md`
- `docs/changes/2026-04-10/design-system-baseline.md`

## 第 5 轮：统一浮层与内容卡圆角到 8px

### 时间

- `2026-04-10 23:59:54`

### 本次做了什么

- 将 `BranchSwitcher` 触发器、弹层、搜索框、列表容器、分支项、创建输入框与按钮圆角统一到 `8px`
- 将 `ContextSummaryTrigger` 的 expanded 面板、内部内容卡、统计卡和 Compact 按钮圆角统一到 `8px`
- 保留 context usage 圆环本体为圆形，其余内容容器不再混用 `16/18/20/24px`

### 为什么改

- 用户明确指出现在这些浮层的圆角体系不统一
- 当前混用多档大圆角会让浅色模式下的盒子感更重，也让视觉节奏发飘
- 对齐到 `8px` 更符合当前项目已有的 `radius-shell` 基线

### 涉及文件

- `src/renderer/src/components/assistant-ui/branch-switcher.tsx`
- `src/renderer/src/components/assistant-ui/context-summary-trigger.tsx`
- `docs/design-system-baseline.md`
- `docs/changes/2026-04-10/design-system-baseline.md`
