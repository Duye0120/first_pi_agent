# 设置页性能优化 + Sidebar 切换动画

**时间**：2026-04-10 12:16 → 12:24 补充修复 → 13:05 第三轮修复 → 14:12 根因修复 → 14:21 第五轮修复 → 14:28 主视图减重 → 14:40 放慢侧栏动画 → 14:46 再次放慢 content 补间 → 14:49 对齐真实 DOM/样式 → 14:55 对齐 sidebar 底部锚点

## 改了什么

### 侧栏收缩时补充 content 过渡反馈（14:37）
- **原因**：Ctrl+B / 标题栏按钮切换侧栏时，虽然 `shell-main` 的宽度已经跟着 flex-basis 变化，但主内容本体缺少一点同步的视觉反馈，体感会偏“硬切”。
- **改法**：
  - 给主内容容器增加 `chela-main-content-surface` 类。
  - 在 `data-sidebar-animating` + `data-sidebar-collapsed` 条件下，用一次性 keyframe 给 content 补一个很轻的 `translateX + opacity` 动画。
  - 保持动画幅度很小，只做“跟手感”，不额外发明重的滑屏效果。

### 侧栏展开/收缩动画放慢（14:40）
- **原因**：上一版 content 反馈已经有了，但整体时长偏短，视觉上接近“刚有一点就结束”，不够容易感知。
- **改法**：
  - `shell-sidebar` / `shell-main` 的 flex 过渡从 `220ms` 提到 `340ms`
  - content keyframe 从 `220ms` 提到 `320ms`
  - sidebar 自身淡出从 `180ms` 提到 `260ms`
  - `sidebarAnimating` 计时从 `280ms` 提到 `380ms`，和 CSS 节奏对齐

### 侧栏 content 宽度动画真正生效（14:43）
- **原因**：之前给面板宽度动画写的是 `[data-panel-id=\"shell-main\"]` / `[data-panel-id=\"shell-sidebar\"]`，但 `react-resizable-panels` 实际输出的是 `data-panel=\"...\"`。结果就是主面板宽度那组 transition 压根没命中，用户看到的就只剩内容轻微位移，没有红框这块真正的宽度补间。
- **改法**：把 CSS 选择器改为 `[data-panel=\"shell-sidebar\"]` / `[data-panel=\"shell-main\"]`，让侧栏和主内容面板的 `flex-grow/flex-basis` 过渡真正挂到实际 DOM 上。

### 侧栏 content 补间再次放慢（14:46）
- **原因**：即便宽度补间已经命中了，上一版整体速度仍偏快，肉眼不容易稳定捕捉。
- **改法**：
  - 面板宽度过渡再提高到 `460ms`
  - content 跟随动画提高到 `420ms`
  - sidebar 淡出提高到 `340ms`
  - `sidebarAnimating` 持续时间提高到 `520ms`

### 侧栏主面板动画对齐真实 DOM（14:49）
- **原因**：用户提供的 DevTools 截图表明，真实面板节点是 `id=\"shell-main\" / id=\"shell-sidebar\"`，`data-panel` 实际是布尔标记；同时内联样式变化的是 `flex: ...` shorthand。也就是说上一版虽然修正了一个方向，但还是没有完全对齐真实 DOM 和真实变更属性。
- **改法**：
  - 面板选择器改为 `#shell-sidebar` / `#shell-main`
  - 过渡属性改为直接 transition `flex`
  - 让侧栏和主内容面板真正跟随 `react-resizable-panels` 的实际内联样式变化做补间

### sidebar 底部“设置 / 返回”锚点对齐（14:55）
- **原因**：线程态底部“设置”和设置态底部“返回”虽然都在左下角，但不是同一套结构：按钮高度、左右内边距、容器上下 padding 都不一致，切换时会产生明显的锚点漂移感。
- **改法**：
  - 抽出统一的 `SidebarFooterAction`
  - 让“设置 / 返回”共用同一套底部容器间距、按钮高度、字号、icon 尺寸和左右 padding
  - 保证切换前后底部锚点的几何位置尽量一致

### ⚠️ 第五轮根因修复（14:21）— 首页分支摘要错误复用完整 diff 快照
- **原因**：线程页顶部只需要显示当前分支名，但 App 在回到首页时调用的是 `git.getSnapshot()`。这条链路在主进程里会：
  - 跑 `git status`
  - 为每个改动文件生成 patch
  - 解析补丁统计增删行
  - 组装 unstaged / staged / all 三套 diff 数据
- **后果**：每次线程↔设置切换都可能触发一轮“完整 diff 生成”。来回几次后，重请求会堆积，主进程持续忙于 git patch 计算，点击设置就明显发卡。
- **改法**：
  - 新增轻量 `git.getSummary()` IPC，只做当前分支读取（`symbolic-ref` / detached fallback），不再顺手跑整套 diff 统计
  - 首页/线程页默认只刷新 `branchSummary`
  - 只有在 Diff 面板打开、手动刷新、分支切换后，才请求完整 `git.getSnapshot()`
  - renderer 侧给 summary / snapshot 都加了 inflight 去重，避免同一时刻并发重复拉取

### ⚠️ 第六轮根因修复（14:28）— 主内容区整屏双层常驻导致切页负担过大
- **原因**：主内容区之前同时常驻 `threadPanels` 和 `settingsContent` 两棵整屏视图，并对整屏做 opacity/transform 过渡。线程页消息一多，点设置时浏览器要同时处理大聊天树和设置页两层内容，切几次后很容易出现明显卡顿。
- **改法**：
  - 去掉主内容区整屏 crossfade，不再让整页参与 opacity/transform 过渡。
  - 主内容区保留挂载，但非当前主视图改用 `display: none`（`hidden`）隐藏，避免隐藏整页继续参与绘制与合成。
  - 这样既保住线程 runtime / 未发送草稿这类连续性状态，也把切页时的整页级重绘压力降下去。

### ⚠️ 根因修复（14:12）— bootApp 被反复执行
- **原因**：全局键盘快捷键 effect（Ctrl+B/N/,/J/Escape）依赖了 `mainView` 和 `terminalOpen`，而同一个 effect 内第一行是 `void bootApp()`。每次 `mainView` 变化（线程↔设置切换），effect 重新执行 → **bootApp 重新跑**（4+ 个 IPC：settings.get / sessions.list / sessions.listArchived / sessions.listGroups / loadProviderDirectory）→ 多次 setState → 连锁重渲染。
- **改法**：
  - 把 `bootApp()` 拆到独立 effect（只依赖 `[bootApp]`），只执行一次。
  - 键盘快捷键 effect 通过 `kbStateRef`（每次渲染同步更新）读取 `mainView`/`terminalOpen` 等值，不再把它们放进 deps。
  - 键盘 effect 只依赖 `[desktopApi]`，生命周期内只注册一次 listener。

### 1. 设置页进入卡顿修复
- **原因**：SettingsView 用 `hasVisitedSettingsRoute` 做懒挂载，首次进入时才 mount 组件 + 触发 `loadProviderDirectory` IPC 加载模型目录，导致明显延迟。
- **改法**：
  - App.tsx `bootApp` 的 Promise.all 里加了 `loadProviderDirectory(desktopApi)` 预热缓存，启动时就把 provider 目录读好。
  - 移除 `hasVisitedSettingsRoute` 状态及相关 effect，SettingsView 在 boot 完成后始终保持挂载（只用 opacity/pointer-events 控制可见性），不再首次进入时重新创建。

### 2. 设置页第二次进入卡顿修复（12:24 补充）
- **原因**：`navigate()` 触发同步重渲染整棵 App 组件树（含复杂 threadRuntimeLayer），在 session 内容较多时阻塞 UI。
- **改法（12:24）**：用 `startTransition` 包裹导航调用。
- **改法（13:05 回退）**：移除 `startTransition` — 它延迟了视觉更新，用户体感反而更卡。同时移除 `content-visibility: hidden`，该属性会阻止 CSS transition 动画且干扰 hover 事件。

### 3. Ctrl+B sidebar 展开/收缩动画修复（12:24 补充）
- **原因**：键盘快捷键 Ctrl+B 直接调 `setSidebarCollapsed()`，跳过了 `toggleSidebarCollapsed()` 里设置 `sidebarAnimating` 的逻辑，导致 CSS transition 不触发。
- **改法**：Ctrl+B handler 改用 `toggleSidebarCollapsed()`。

### 4. Sidebar 内容区宽度动画修复（13:05）
- **原因**：`data-sidebar-animating` 属性放在 `ResizablePanelGroup` 组件的 props 上，但 `react-resizable-panels` 的 `Group` 组件可能不会把未知 data 属性转发到 DOM，导致 CSS 选择器 `[data-sidebar-animating] [data-panel-id="shell-main"]` 失效。
- **改法**：把 `data-sidebar-animating` 移到包裹 ResizablePanelGroup 的普通 `div` 上，确保属性一定出现在 DOM 中。

### 5. Git 刷新触发频率优化（13:05）
- **原因**：git refresh effect 依赖 `settings?.workspace`，当 workspace 值从 undefined 变为实际值（初始加载时）会多触发一次 git IPC 调用，加重渲染负担。
- **改法**：把 `settings?.workspace` 从 effect deps 移到 ref 跟踪，cooldown 从 2s 提高到 5s。

### 6. Sidebar threads↔settings 模式切换动画
- **原因**：Sidebar 原先用 `if (viewMode === "settings") return <settings sidebar>;` 做硬切换，没有任何过渡动画。
- **改法**：
  - 移除 early return，将 settings 和 threads 两个 sidebar 视图分别放入绝对定位层。
  - 用 `transition-[opacity,transform] duration-200` + 微量 `translate-x` 做 crossfade 切换。
  - settings 侧栏淡入时从左滑入，threads 侧栏淡入时从右滑入，视觉上有方向感。

## 改到哪些文件

| 文件 | 改动 |
|------|------|
| `src\main\git.ts` | 新增轻量 `getGitBranchSummary()`，避免首页默认走完整 diff 计算 |
| `src\main\index.ts` | 新增 `git:summary` IPC handler |
| `src\preload\index.ts` | 暴露 `desktopApi.git.getSummary()` |
| `src\shared\contracts.ts` / `src\shared\ipc.ts` | 新增轻量 git summary 契约 |
| `src/renderer/src/App.tsx` | 拆分 git branch summary / full snapshot；首页只拉轻量 summary；完整 diff 请求加 inflight 去重；主内容区去掉整屏 crossfade，改为保留挂载 + `hidden` 隐藏非当前视图 |
| `src/renderer/src/components/assistant-ui/sidebar.tsx` | 移除 content-visibility:hidden |
