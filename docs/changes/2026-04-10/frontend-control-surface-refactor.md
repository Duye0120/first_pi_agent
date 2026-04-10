# 前端控件表面语言统一重构

> 更新时间：2026-04-10 11:52:20

## 这次改了什么

- 按 `Chela` 现有主体 token，把 renderer 里高频控件统一成一套 **贝壳泡泡表面**：
  - 输入框
  - 下拉
  - tabs
  - checkbox / switch
  - popover / hover-card / dialog
  - badge / outline button / ghost button
- 批量把业务组件里的旧冷灰表面和分裂的 hover / selected 态，换成同一套暖橙层级。
- 让选中态、悬浮态、弹层面板、轻按钮、胶囊信息块都走同一组 control token。
- 第二轮继续精修：
  - 设置页卡片和行间距更松一点
  - 设置页页头层级更清楚
  - 侧栏列表项、菜单弹层、分组面板统一成同一套 list / panel 语言
  - Diff 面板的卡片圆角、留白、索引 chip 密度继续收顺
  - 危险确认按钮改成更轻的 soft danger，不再突兀炸红
- 修复一个回归：`sidebar.tsx` 已经用了 `chela-list-item-active`，但 `styles.css` 里缺少对应类定义，导致选中色直接丢失；现已补齐基础类。
- 修正设置页右侧布局串味：去掉设置态下沿用线程 toolbar 留出的顶部空带，并让设置内容区直接使用设置页背景，不再像两套 layout 叠在一起。
- 修正设置页切换卡顿与乱跳：
  - 去掉 `startTransition`，切页不再故意延后
  - 设置页改为首次打开后常驻，后续只做可见性切换，不再反复 remount
  - `SettingsView` 去掉目录双加载与重复工作区加载
  - thread / settings 两个视图共用同一个稳定内容容器，背景层和宽度不再来回跳
- 修复本轮引入的启动报错：`App.tsx` 里还残留了一处 `startTransition(...)` 调用，导致 renderer 直接报 `startTransition is not defined`；现已清理。
- 按用户要求正式接入 router：
  - 新增 `react-router-dom`
  - renderer 入口改为 `HashRouter`
  - `App.tsx` 改成路由驱动 settings/thread 视图
  - 设置入口、返回按钮、侧栏设置导航都改成走路由，不再靠 `mainView` 本地状态硬切
  - 后续继续把“隐藏 overlay 双视图”收口成“当前路由只渲染当前内容”，避免 thread/settings 同时挂在右侧导致卡顿
- 为减轻首次打开设置页的卡顿，前端 provider directory 增加了一层内存缓存；thread / settings 共用这份结果，不再各拉一遍。
- 设置页右侧内容恢复跟主页一致的白色 content 背景，不再自己额外铺灰底。
- 为解决“设置 → 返回 → 再点设置”第二次明显卡顿，右侧内容区改成 **router + keep-alive**：
  - 路由仍然是真路由
  - 线程 view 和设置 view 挂在同一个 content shell
  - 设置页第一次打开后不再卸载，后续只切换可见性
  - 这样第二次进入设置不会再因为整页 remount 明显卡一下
- 进一步减掉 route 切换时的重算：
  - `ThreadPanel` 的 `visible` 不再绑定 `mainView`
  - route 切换不再让整棵线程树跟着改 props
  - `threadRuntimeLayer` / `threadPanels` / `settingsContent` 改成 `useMemo`
  - 目标是把“点设置”变成切壳层可见性，而不是重算整页内容
- 修复一个本轮引入的 renderer 报错：`App.tsx` 的 `useMemo` 依赖数组误写了不存在的 `onRemoveAttachment`，运行时直接炸；现已改回 `removeAttachment`。
- 修复另一个本轮引入的 renderer 报错：把 `useMemo` 放到了 `booting / bootError` 的 early return 后面，触发了 `Rendered more hooks than during the previous render`；现已把所有 hooks 挪回 early return 之前。

## 为什么要改

前面只修局部，结果会出现：

- 某些地方是冷灰 hover
- 某些地方是橙色 selected
- 某些地方还是旧的 panel contrast

最后就是同一页里像三套产品。  
这次直接从 renderer 高使用频率组件下手，先把“控件表面语言”收成一套，再继续精修局部排版和节奏。

## 核心设计方向

- 温和贝壳面
- 轻阴影
- 弱描边
- 橙色品牌选中态
- hover / selected 同一色系，不再冷暖打架

## 主要改动文件

### Token / 基础样式

- `src/renderer/src/styles/theme.css`
- `src/renderer/src/styles.css`
- `src/renderer/src/main.tsx`
- `src/renderer/src/App.tsx`

### 基础 UI 原件

- `src/renderer/src/components/ui/button.tsx`
- `src/renderer/src/components/ui/badge.tsx`
- `src/renderer/src/components/ui/checkbox.tsx`
- `src/renderer/src/components/ui/switch.tsx`
- `src/renderer/src/components/ui/tabs.tsx`
- `src/renderer/src/components/ui/popover.tsx`
- `src/renderer/src/components/ui/hover-card.tsx`
- `src/renderer/src/components/ui/dialog.tsx`
- `src/renderer/src/components/ui/tool-fallback.tsx`

### 业务组件

- `src/renderer/src/components/assistant-ui/select.tsx`
- `src/renderer/src/components/assistant-ui/model-selector.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `src/renderer/src/components/assistant-ui/branch-switcher.tsx`
- `src/renderer/src/components/assistant-ui/context-summary-trigger.tsx`
- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `src/renderer/src/components/assistant-ui/attachment.tsx`
- `src/renderer/src/components/assistant-ui/title-bar.tsx`
- `src/renderer/src/components/assistant-ui/terminal-drawer.tsx`
- `src/renderer/src/components/assistant-ui/agent-activity-bar.tsx`
- `src/renderer/src/components/assistant-ui/reasoning.tsx`
- `src/renderer/src/components/assistant-ui/settings/about-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/archived-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/general-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/keys-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/shared.tsx`
- `src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`

## 当前结果

- renderer 里原来那批高频旧表面样式已做一轮统一
- 设置页 / 侧栏 / Diff 面板又做了一轮密度与层级精修
- 设置态已从线程态容器里进一步解耦，右侧背景和顶部留白更干净
- 设置态切换更稳，后续再次进入不会再因为 remount 和重复加载明显卡一下
- 现在设置页 / 主页切换已有真正路由承接，且右侧内容区改为单路由单内容渲染，后续继续修布局时不会再被原来的状态机切页拖后腿
- 相关 TS 诊断通过
- 没跑整仓 build，只做了轻量检查

## 下一步

- 继续精修密度、留白、字号层级
- 继续检查长列表、空状态、危险操作按钮的细节统一
