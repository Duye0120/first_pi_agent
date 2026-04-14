# 聊天区顶部工具按钮去描边与 Diff 图标调整

> 更新时间：2026-04-14 10:31:30

## 这次做了什么

- 把聊天区右上角终端按钮和 Diff 按钮从 `outline` 改成 `ghost`，去掉按钮自带描边感。
- 在按钮类名里补上 `ring-0` 和透明底色，保留 hover 与选中底色，按钮层级继续靠背景变化表达。
- 把 Diff 按钮图标从 `RectangleGroupIcon` 换成 `GitCompareArrows`，让语义更接近代码改动视图。

## 为什么要改

- 顶部工具按钮的描边偏重，和当前界面偏向背景分层、弱化 border 的规则不一致。
- Diff 入口原图标更像布局分组，改动语义不够直接。

## 改到哪些文件

- `src/renderer/src/App.tsx`
- `docs/changes/2026-04-14/topbar-toolbar-border-and-diff-icon.md`

## 验证

- 2026-04-14 10:31:30
  本轮按仓库约束未额外执行 build 或 check；改动集中在按钮样式与图标映射。
