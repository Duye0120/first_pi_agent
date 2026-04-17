# 2026-04-17 变更记录

## Diff Panel 收缩交互与动效对齐

**时间**: 14:42

### 改了什么

1. 把线程区右侧 Diff panel 从条件渲染改成线程视图下始终挂载的收缩容器，关闭时通过宽度归零、透明度和位移过渡收起。
2. 给右侧 panel 新增独立的开合动画状态与定时器，开关按钮和面板内关闭动作都会触发同一套时序。
3. 主内容区新增右侧开合位移动画，和左侧 sidebar 的收缩节奏保持一致。
4. 右上角 Diff 按钮图标从 `GitCompareArrows` 调整为 `FileDiff`，并补上 tooltip、缩放和透明度反馈。
5. 右侧 resize handle 改成只在打开态可交互，关闭态移除点击命中。

### 为什么改

- 用户希望右侧 Diff 的收缩体验对齐左上角 sidebar，而不是现在这种直接出现和消失的切换。
- 现有实现只在打开时挂载 panel，本体缺少可逆的收起动画，视觉上偏硬。
- 右上角入口继续保留在原位置，图标和反馈需要更明确地表达“Diff 面板”的角色。

### 涉及文件

- `src/renderer/src/App.tsx`
- `src/renderer/src/styles.css`
- `docs/changes/2026-04-17/changes.md`

### 结果

- 右侧 Diff panel 现在会按宽度收缩与展开，主内容区和 panel 内容都有更连贯的开合动效。
- 右上角按钮保持原位置，Diff 语义更直接，打开和关闭状态反馈更清楚。

## Diff Panel 入口图标对齐左上角

**时间**: 14:56

### 改了什么

1. 把右上角 Diff 按钮的图标从 `FileDiff` 改成 `PanelRightOpen / PanelRightClose`。
2. 打开和关闭两种状态分别对应右侧面板的展开与收起图标，线条粗细对齐左上角 sidebar 按钮。

### 为什么改

- 用户希望右上角入口的 icon 视觉语言直接贴近左上角，而不是继续保留 diff 文件图标。
- 左右两侧都使用 panel 开合图标后，界面的控制语义会更统一。

### 涉及文件

- `src/renderer/src/App.tsx`
- `docs/changes/2026-04-17/changes.md`

### 结果

- 右上角 Diff 按钮现在和左上角侧栏按钮属于同一套 icon 语言。

## Diff Panel 首屏挂载性能修复

**时间**: 15:04

### 改了什么

1. 保留右侧 panel 的收缩壳层常驻。
2. 把 `DiffWorkbenchContent` 和右侧那份 `TerminalDrawer` 改成只在“打开中 / 已打开”时挂载。
3. 关闭态继续保留动画容器本身，动画结束后再卸载右侧重内容。

### 为什么改

- 上一版把右侧 panel 改成常驻后，关闭态首屏也会提前挂载 Diff 工作区和右侧终端区域。
- `DiffWorkbenchContent` 的状态、树视图和提交计划区本身较重，提前挂载会直接拖慢首屏。

### 涉及文件

- `src/renderer/src/App.tsx`
- `docs/changes/2026-04-17/changes.md`

### 结果

- 首屏关闭态下不会再提前挂载右侧重组件。
- 右侧开合动画保持不变，关闭动画结束后才释放内容。
