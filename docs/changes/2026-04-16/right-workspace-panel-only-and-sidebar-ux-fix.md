# 右侧工作区改为 panel-only 并修正 sidebar 交互

**时间**: 2026-04-16 17:03

## 改了什么

1. 右侧工作区去掉了 `drawer` 展示路径，刷新后继续按 `rightPanel.open` 恢复为右侧 panel。
2. 右侧工作区从外层 sibling 挪进 `shell-main` 内部，只侵占 content 区，不再影响 `session_list`。
3. 删除了打开和关闭 Diff 时对 sidebar 百分比的自动补偿逻辑。
4. sidebar 拖拽结束后只记录宽度，不再因为拖到极小值自动折叠。
5. sidebar 折叠继续只走左上角按钮和 `Ctrl+B`，展开时恢复上次非折叠宽度。

## 为什么改

- 用户已经确认右侧区域就是后续扩展功能的统一 panel，不再需要抽屉。
- 当前实现里刷新会退回 drawer，Diff 显隐会联动 sidebar 宽度，拖拽 sidebar 还会自动折叠，体验不符合预期。

## 涉及文件

- `src/renderer/src/App.tsx`

## 结果

- 刷新后右侧工作区继续以 panel 形式恢复。
- Diff 的显示和隐藏只影响 content 区。
- sidebar 宽度拖拽更跟手，松手后不会回弹，也不会因为拖拽自动关闭。
