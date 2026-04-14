# 将工作区 Diff 重构为右侧滑出抽屉

**时间**: 2026-04-14 16:38:20

## 变更记录

随着聊天的交互逐渐深入，原来固定占用右边 25% 宽度的 `Diff 面板`（`DiffPanel`）不仅在平时挤占了主聊天内容区的展示空间，而且在没有任何代码改动（或者用户不关注改动的场景）下也会给人“过多信息堆砌”的压迫感。

本次我们把工作区的改动差异展示重构成了一个可以隐藏/弹出的右侧滑出抽屉。

### 修改文件
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/diff-panel.tsx`

### 具体调整
1. **容器重构**：从原来的水平的 `ResizablePanelGroup` 之中移除了 `thread-diff` 的 `ResizablePanel`，恢复聊天区（`thread-main`）完整的屏幕宽度体验和 `flex-1`。
2. **触发按钮徽标**：在应用右上角的控制头部增设了“展现 Diff 面板”的触发 Icon `{gitBranchSummary?.hasChanges}`。如果有未暂存或是未提交的心变更时，右上角的红点小徽标就会提示用户。
3. **动画和覆盖层**：
   - 抽屉采用了 `fixed right-0 w-[24rem]` 为基础进行悬浮展示，增加了 `transition-transform duration-300 ease-in-out` 和平滑遮罩 `backdrop-blur` 体验（基于 `z-50` 的 z-index 显示在顶层）。
   - 点开时会呈现出右侧淡入的动效，并且点击背后的空旷遮罩区或者自身头部的关闭按钮，都能方便地触发收起。
4. **复用逻辑**：
   - 将原有 `overview` 获取逻辑保留并按需传递给抽屉；`DiffPanel` 面板核心组件内容一字未动地提取成了 `DiffPanelInner` 来复用。
