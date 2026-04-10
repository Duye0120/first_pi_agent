# 设置页性能优化 + Sidebar 切换动画

**时间**：2026-04-10 12:16

## 改了什么

### 1. 设置页进入卡顿修复
- **原因**：SettingsView 用 `hasVisitedSettingsRoute` 做懒挂载，首次进入时才 mount 组件 + 触发 `loadProviderDirectory` IPC 加载模型目录，导致明显延迟。
- **改法**：
  - App.tsx `bootApp` 的 Promise.all 里加了 `loadProviderDirectory(desktopApi)` 预热缓存，启动时就把 provider 目录读好。
  - 移除 `hasVisitedSettingsRoute` 状态及相关 effect，SettingsView 在 boot 完成后始终保持挂载（只用 opacity/pointer-events 控制可见性），不再首次进入时重新创建。

### 2. Sidebar threads↔settings 模式切换动画
- **原因**：Sidebar 原先用 `if (viewMode === "settings") return <settings sidebar>;` 做硬切换，没有任何过渡动画。
- **改法**：
  - 移除 early return，将 settings 和 threads 两个 sidebar 视图分别放入绝对定位层。
  - 用 `transition-[opacity,transform] duration-200` + 微量 `translate-x` 做 crossfade 切换。
  - settings 侧栏淡入时从左滑入，threads 侧栏淡入时从右滑入，视觉上有方向感。

## 改到哪些文件

| 文件 | 改动 |
|------|------|
| `src/renderer/src/App.tsx` | 预加载 provider directory；移除懒挂载；始终渲染 SettingsView |
| `src/renderer/src/components/assistant-ui/sidebar.tsx` | 双层渲染 + crossfade 过渡动画 |
