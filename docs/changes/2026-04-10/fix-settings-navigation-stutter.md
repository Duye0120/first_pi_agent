# 修复：设置页 ↔ 首页切换卡顿 + 动画优化

**时间**：2026-04-10 03:54 / 03:59 补充  
**影响文件**：`src/renderer/src/App.tsx`、`src/renderer/src/styles.css`

## 问题

1. 从首页进入设置页、再切回首页时，界面出现明显卡顿。
2. 视图切换过渡生硬，只有简单的 opacity 切换。
3. 左侧 sidebar 折叠/展开没有动画，瞬间跳变。

## 原因

1. 工具栏和 TerminalDrawer 使用条件渲染 (`? ... : null`)，每次切换都 mount/unmount。
2. `refreshGitOverview` 每次切回 thread 视图立即发 IPC，触发多轮重渲染。
3. `react-resizable-panels` 的 `collapse()`/`expand()` 没有内置过渡效果。

## 修复

### 性能
- 工具栏改为 CSS 显隐（`transition-[min-height,padding,opacity]`），不再条件渲染。
- TerminalDrawer 改为 `hidden` class 隐藏，组件始终挂载。
- `refreshGitOverview` 加 2 秒节流：快速切回时跳过重复 IPC。

### 动画
- 视图切换（thread ↔ settings）：`opacity + translateY` 双向微动效，200ms ease-out，进出方向相反。
- 工具栏：`min-height + padding + opacity` 平滑收起/展开，200ms ease-out。
- 侧栏折叠/展开：通过 `data-sidebar-animating` 属性在按钮触发时激活 CSS `flex-grow/flex-basis` 过渡（220ms，expressive easing），手动拖拽不受影响。侧栏内容同步 opacity 淡出/淡入。
