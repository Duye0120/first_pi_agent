# Chela UI Figma 搬运清单

> 更新时间：2026-04-12 02:40:42

## 目的

- 把当前桌面端 UI 拆成可在 Figma 中继续微调的结构化底稿
- 优先保留 `Chela` 现有层级、选中态、圆角和控件语言，不把代码细节原样硬搬成一堆边框盒子

## 当前 Figma 底稿

- `2026-04-12 02:40:42` 已创建 Figma 文件：`Chela UI Baseline 2026-04-12`
- 文件链接：`https://www.figma.com/design/2JoZ8ZAWsO3Yyt2W9dKzpm`
- 受 Figma Starter 计划限制，当前实际落地为 `00 Tokens`、`01 Screens`、`02 States` 三页
- `01 Screens` 已合并放入 Shell、Sidebar、Thread、Settings、Popovers，后续改稿建议直接从该页目标 frame 开始

## 建议的 Figma 页面结构

1. `00 Tokens`
2. `01 Shell`
3. `02 Sidebar`
4. `03 Thread`
5. `04 Popovers`
6. `05 States`

## 建议先建的基础样式

### 颜色

- `bg / primary`: `#f8f9fa`
- `bg / secondary`: `#e8edf3`
- `bg / surface`: `#ffffff`
- `bg / muted`: `#f8fafc`
- `text / primary`: `#0f172a`
- `text / secondary`: `#475569`
- `text / tertiary`: `#94a3b8`
- `accent / base`: `#f97316`
- `accent / subtle`: `#ffedd5`
- `accent / text`: `#c2410c`
- `control / bg`: `#f8f4ee`
- `control / hover`: `#fdf0e2`
- `selection / bg`: `#ffedd5`
- `selection / text`: `#c2410c`

### 圆角

- `radius / shell`: `8`
- `radius / message`: `12`
- `radius / pill`: `9999`

### 阴影

- `inset-soft`: `0 1px 2px rgba(15,23,42,0.04) + inset 0 1px 0 rgba(255,255,255,0.82)`
- `flyout`: `0 16px 38px rgba(15,23,42,0.08) + 0 4px 12px rgba(15,23,42,0.05)`
- `composer`: `0 12px 32px rgba(15,23,42,0.08) + inset 0 1px 0 rgba(255,255,255,0.05)`

### 字体

- UI 默认按 `13px` 基线处理
- 输入框主文本 `15px`
- 标题大字 `2.2rem` 量级
- 代码字体单独走 `JetBrains Mono`

## 主布局拆分

### App Shell

- 外层是圆角桌面壳，主背景偏 `bg / primary`
- 顶部 `TitleBar` 高度 `40`
- 主体为左右分栏
- 侧栏默认宽度 `18%`
- 侧栏允许在 `14% - 28%` 之间调整
- 主内容区左侧带一个与侧栏咬合的圆角面板

### Title Bar

- 左上只有一个侧栏开关
- 右上是最小化 / 最大化 / 关闭三个窗口控制
- 按钮本身都很轻，hover 才出现背景
- 关闭按钮 hover 才进入 destructive

### Sidebar

- 顶部先是 `新线程`
- 中段是 `置顶线程 + 分组 + 普通线程`
- 底部只有 `设置`
- 设置态不是新页面壳，而是侧栏内容切换成 settings 导航
- 线程项、设置项、分组项共用一套 list item 语言
- 选中态统一使用 `selection / bg + selection / text`
- hover 优先加浅背景，不靠描边

### Main Thread

- 顶部右侧工具条只放两个图标按钮：终端、Diff
- 工具条在 thread 模式下高度约 `52`
- 中部是消息滚动区，最大内容宽度 `56rem`
- 底部是浮起的 composer 卡片和状态条

### Composer

- 外层卡片圆角 `12`
- 卡片内顺序：附件区 -> 输入框 -> 操作行 -> 错误提示
- 输入框 `1~5` 行自适应
- 左下操作是附件、模型、思考强度
- 右下主按钮是圆形发送，运行中切成“停止”

### Status Bar

- 左侧 `BranchSwitcher`
- 右侧 `Context` 圆形进度环
- 这一行高度感很轻，不应再包一层重容器

## Figma 里建议做成组件的对象

1. `Shell / TitleBar`
2. `Sidebar / Item`
3. `Sidebar / Group Header`
4. `Sidebar / Thread Item`
5. `Sidebar / Inline Menu`
6. `Composer / Card`
7. `Composer / Action Button`
8. `Control / Icon Button`
9. `Control / Selection Chip`
10. `Popover / Branch Switcher`
11. `Popover / Context Hover`
12. `Popover / Context Expanded`

## 必做状态页

1. `Thread / Empty`
2. `Thread / With Messages`
3. `Thread / Running`
4. `Thread / Vision Blocked`
5. `Sidebar / Default`
6. `Sidebar / Item Hover`
7. `Sidebar / Active`
8. `Sidebar / Group Expanded`
9. `Sidebar / Group Collapsed`
10. `Sidebar / Archive Confirm`
11. `Sidebar / Thread Menu Open`
12. `Branch Switcher / Closed`
13. `Branch Switcher / Open`
14. `Branch Switcher / Create Mode`
15. `Branch Switcher / Disabled`
16. `Context / 0%`
17. `Context / Hover Summary`
18. `Context / Expanded`
19. `Terminal / Open`
20. `Diff Panel / Open`
21. `Settings / Sidebar Mode`

## 关键交互约束

- 选中态不要新发明颜色，继续复用当前模型选择器和分支选择器的选中色
- 浅色模式下的浮层不要用发黑重阴影，保持轻阴影和暖色控制面板底
- `Context` 入口永远是圆形进度环，没有 usage 也要保留 `0%` 灰环
- `Context` hover 时圆环本体仍要可见，hover 摘要和 click 展开是两层能力
- `BranchSwitcher` 默认走缓存思路，Figma 里不要画成“每次打开都重新加载”的重型管理器
- 页面层级优先靠背景、留白、字体粗细，尽量不要给轻量控件补外框

## 文案和命名提醒

- Figma 对外文案默认统一用 `Chela`
- 当前代码里的输入框 placeholder 仍是 `向 Pi Agent 提问...`
- 这属于 legacy 文案残留，做 Figma 稿时建议直接改成 `向 Chela 提问...`

## 推荐的搬运顺序

1. 先搭 `Shell + TitleBar + Sidebar + Main surface`
2. 再搭 `Composer + Status Bar`
3. 然后补 `BranchSwitcher` 和 `Context` 两个浮层
4. 最后再做 `Diff / Terminal / Settings` 这些次级状态

## 代码来源

- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `src/renderer/src/components/assistant-ui/title-bar.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/assistant-ui/branch-switcher.tsx`
- `src/renderer/src/components/assistant-ui/context-summary-trigger.tsx`
- `src/renderer/src/styles/theme.css`
- `src/renderer/src/styles.css`
