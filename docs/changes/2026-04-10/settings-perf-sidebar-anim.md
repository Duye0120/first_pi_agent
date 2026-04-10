# 设置页性能优化 + Sidebar 切换动画

**时间**：2026-04-10 12:16 → 12:24 补充修复

## 改了什么

### 1. 设置页进入卡顿修复
- **原因**：SettingsView 用 `hasVisitedSettingsRoute` 做懒挂载，首次进入时才 mount 组件 + 触发 `loadProviderDirectory` IPC 加载模型目录，导致明显延迟。
- **改法**：
  - App.tsx `bootApp` 的 Promise.all 里加了 `loadProviderDirectory(desktopApi)` 预热缓存，启动时就把 provider 目录读好。
  - 移除 `hasVisitedSettingsRoute` 状态及相关 effect，SettingsView 在 boot 完成后始终保持挂载（只用 opacity/pointer-events 控制可见性），不再首次进入时重新创建。

### 2. 设置页第二次进入卡顿修复（12:24 补充）
- **原因**：`navigate()` 触发同步重渲染整棵 App 组件树（含复杂 threadRuntimeLayer），在 session 内容较多时阻塞 UI。
- **改法**：
  - `openSettingsView` / `closeSettingsView` 里的 `navigate()` 包裹 `startTransition()`，标记为低优先级更新，React 不再阻塞主线程。
  - 不可见视图容器加 `will-change: opacity, transform` + `content-visibility: hidden`，告诉浏览器跳过隐藏面板的布局和绘制。

### 3. Ctrl+B sidebar 展开/收缩动画修复（12:24 补充）
- **原因**：键盘快捷键 Ctrl+B 直接调 `setSidebarCollapsed()`，跳过了 `toggleSidebarCollapsed()` 里设置 `sidebarAnimating` 的逻辑，导致 CSS transition 不触发。
- **改法**：Ctrl+B handler 改用 `toggleSidebarCollapsed()`。

### 4. Sidebar threads↔settings 模式切换动画
- **原因**：Sidebar 原先用 `if (viewMode === "settings") return <settings sidebar>;` 做硬切换，没有任何过渡动画。
- **改法**：
  - 移除 early return，将 settings 和 threads 两个 sidebar 视图分别放入绝对定位层。
  - 用 `transition-[opacity,transform] duration-200` + 微量 `translate-x` 做 crossfade 切换。
  - settings 侧栏淡入时从左滑入，threads 侧栏淡入时从右滑入，视觉上有方向感。

## 改到哪些文件

| 文件 | 改动 |
|------|------|
| `src/renderer/src/App.tsx` | 预加载 provider directory；移除懒挂载；startTransition；will-change/content-visibility；Ctrl+B 修复 |
| `src/renderer/src/components/assistant-ui/sidebar.tsx` | 双层渲染 + crossfade + content-visibility |
