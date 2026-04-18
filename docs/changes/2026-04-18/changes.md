# 2026-04-18 变更记录

## 网络代理设置拆分为独立分区

**时间**: 00:12

### 改了什么

1. 新增独立的 `网络` 设置分区，把代理开关、代理地址、`noProxy` 和请求超时从 `General` 中移走。
2. 更新 settings section 类型、section 常量、设置页渲染和侧栏导航，让 `network` 成为正式路由分区。
3. 新建 [`src/renderer/src/components/assistant-ui/settings/network-section.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/network-section.tsx)，统一承载网络相关表单。
4. `General` 页只保留默认行为、模型路由和时区，不再混入网络配置。

### 为什么改

- 代理配置属于独立的网络能力，单独成组更清楚。
- `General` 页继续承载默认行为会更聚焦，设置结构也更稳定。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/types.ts`
- `src/renderer/src/components/assistant-ui/settings/constants.ts`
- `src/renderer/src/components/assistant-ui/settings/network-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/general-section.tsx`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`
- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `src/renderer/src/App.tsx`
- `docs/changes/2026-04-18/changes.md`

### 结果

- 网络代理现在是单独一页设置。
- `General` 页的职责更干净，设置导航也能直接表达网络能力的位置。

## 侧边栏 phase 0 起步：项目区与聊天区拆分

**时间**: 09:59

### 改了什么

1. 把原来的单体 `Sidebar` 拆成 `ProjectSection`、`ChatSection`、`SidebarLayout` 三层，正式开始对齐 `docs/browser-preview-dom-inspector-spec.md` 里的 phase 0 结构。
2. 在侧边栏上半区新增项目卡片和活动列表，直接展示当前 workspace、分支摘要、文件变更数量和最近变更文件。
3. 把原来的线程列表、分组、置顶、归档和设置入口下沉到 `ChatSection`，保留现有聊天管理能力。
4. 补上 `App` 里的 workspace / Git 接线，让 workspace 变更后同步刷新侧边栏项目活动和右侧 diff 所依赖的 Git 概览。

### 为什么改

- phase 0 的核心是把“项目上下文”和“聊天会话”合并到同一条侧边栏里，先把结构拆对，后面的 Browser Preview 才有稳定挂载位。
- 项目区需要直接消费当前 workspace 的 Git 状态，切目录后立刻刷新，侧边栏和右侧面板才能共享同一份上下文。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `src/renderer/src/components/assistant-ui/sidebar/project-section.tsx`
- `src/renderer/src/components/assistant-ui/sidebar/chat-section.tsx`
- `src/renderer/src/components/assistant-ui/sidebar/sidebar-layout.tsx`
- `src/renderer/src/App.tsx`
- `docs/changes/2026-04-18/changes.md`

### 结果

- 左侧栏已经具备“上项目、下聊天”的 phase 0 基本骨架。
- 当前 workspace 的 Git 变化开始进入侧边栏项目区，后续可以继续往项目活动摘要、Browser Preview 入口和 Inspector 状态扩展。

## 侧边栏项目区改成目录树样式

**时间**: 10:05

### 改了什么

1. 把 `ProjectSection` 里的 Git 活动卡片改成目录树样式，按当前 workspace 路径逐级展示目录节点。
2. 项目区列表从 Git 文件变更改成项目下的会话条目，展示会话标题和相对更新时间，点击可直接切线程。
3. 侧栏接线同步简化，`Sidebar` 和 `App` 去掉项目区对 Git 概览的直接依赖，保留 workspace 切换和打开目录入口。

### 为什么改

- 这轮目标是贴近你给的参考图，项目区表达“目录上下文 + 项目内对话”比 Git 变更列表更对路。
- phase 0 先把视觉语言和信息结构拉齐，后面再补项目筛选、更多项目入口和 Inspector 入口会更顺。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar/project-section.tsx`
- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `src/renderer/src/App.tsx`
- `docs/changes/2026-04-18/changes.md`

### 结果

- 项目区现在更接近参考图里的“路径树 + 条目列表”形态。
- Git 活动已经退出项目区，侧边栏的主表达改成项目导航和会话入口。

## 侧边栏按“新建聊天 / 项目 / 聊天”单列结构重做

**时间**: 10:24

### 改了什么

1. 把 `SessionGroup` 升级为带 `path` 的项目模型，`groups.create` 改成接收 `{ name, path }`，主进程会为历史缺少 `path` 的项目补空值兼容。
2. 重写 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx)，改成整条侧栏单滚动结构，顺序固定为：`新建聊天`、`项目 + 新建项目`、项目树、`聊天 + 新建聊天`、未归属项目的聊天列表。
3. 项目改成“选择文件夹即创建项目”的流：点击 `新建项目` 后选目录，自动创建项目记录，并立即创建该项目下的新聊天。
4. `App` 补上项目路径驱动的 workspace 切换：点击项目或项目下聊天时，先切到对应目录，再刷新 Git / context 依赖，再加载聊天。
5. 删除旧的 `ProjectSection`、`ChatSection`、`SidebarLayout` 拆分实现，避免继续沿用双区块和局部滚动思路。

### 为什么改

- 这轮目标已经从“项目区视觉微调”变成“信息结构重排”，单列结构比继续修补双面板更直接。
- 项目现在代表真实文件夹，`path` 必须进入持久化和 IPC 链路，右侧工作区能力才能跟项目树一致。

### 涉及文件

- `src/shared/contracts.ts`
- `src/preload/index.ts`
- `src/main/ui-state.ts`
- `src/main/ipc/sessions.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `docs/changes/2026-04-18/changes.md`

### 结果

- 左侧栏现在是单一滚动容器，没有项目区和聊天区各自独立滚动。
- 项目已经从“逻辑分组”变成“带文件夹路径的项目列表”，项目下聊天和未归属聊天分区也按新结构落地了。

## 修复侧边栏重构后的 renderer 初始化报错

**时间**: 10:26

### 改了什么

1. 调整 [`src/renderer/src/App.tsx`](D:/a_github/first_pi_agent/src/renderer/src/App.tsx) 里 `switchWorkspacePath` 的定义位置。
2. 让 `switchWorkspacePath` 出现在 `createSessionInGroup` 和 `selectSession` 首次引用之前，消除 `Cannot access 'switchWorkspacePath' before initialization`。

### 为什么改

- 上一轮重构把 workspace 切换逻辑抽成了独立 callback，引用点在前、定义点在后，触发了 `const` 初始化时序错误，renderer 在启动阶段直接崩掉了。

### 涉及文件

- `src/renderer/src/App.tsx`
- `docs/changes/2026-04-18/changes.md`

### 结果

- renderer 初始化顺序恢复正常。
- `App.tsx` 的定向 TypeScript 诊断保持 `0` error。

## 侧边栏样式回调到原有语气

**时间**: 10:53

### 改了什么

1. 把顶部 `新建聊天` 从卡片式按钮收回到原来的侧栏列表按钮语气。
2. 去掉项目区、聊天区、已归档区外围那层浅色块背景，保留更轻的纯列表结构。
3. 项目展开态改成单个文件夹图标切换开合，移除额外的展开箭头。

### 为什么改

- 这轮重点是把新结构接回项目现有的视觉系统，避免新入口和旧侧栏风格断层。
- 列表层级已经足够表达结构，继续叠卡片和额外箭头会让侧栏变重。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `docs/changes/2026-04-18/changes.md`

### 结果

- 侧边栏整体风格回到原项目的轻量列表感。
- 项目展开态和新建聊天入口都更贴近你原来的界面语气。

## 侧边栏会话 hover 改成固定占位

**时间**: 10:57

### 改了什么

1. 调整 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx) 里的会话行右侧区域，给时间与操作按钮改成固定宽度占位。
2. 把原来 `hidden -> flex` 的 hover 切换，改成绝对定位叠层加 `opacity` 显隐。
3. 同步补上 `focus-within`，键盘聚焦到操作按钮时也能保持操作区可见。

### 为什么改

- 原来的 hover 方案会在鼠标移入时触发行内重排，右侧按钮会挤占同一行其它内容的空间。
- 固定占位配合透明度切换能保持布局稳定，hover 反馈也更轻。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `docs/changes/2026-04-18/changes.md`

### 结果

- 悬浮会话项时，右侧操作区直接覆盖在预留区域里显示。
- 同行其它 DOM 的位置保持稳定，hover 不再侵占周围内容。

## 侧边栏 item 级交互回补

**时间**: 11:03

### 改了什么

1. 给 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx) 的会话项和项目项补回右键菜单。
2. 会话项右键菜单接回 `打开聊天`、`重命名`、`置顶/取消置顶`、`归档/恢复`、`删除聊天`。
3. 项目项右键菜单接回 `打开项目`、`新建聊天`、`重命名项目`、`删除项目`。
4. 在 [`src/renderer/src/App.tsx`](D:/a_github/first_pi_agent/src/renderer/src/App.tsx) 补上 item 级 rename / delete handler，把菜单动作重新接到现有 IPC。
5. 会话项补回固定的置顶状态标记，避免 item 只在 hover 时才暴露关键状态。

### 为什么改

- 侧边栏重构调整的是信息结构，单个 item 的交互能力需要保持连续。
- 上一轮重写保住了新结构，item 级右键和状态展示回迁不完整，这轮把交互链路补回当前实现。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `src/renderer/src/App.tsx`
- `docs/changes/2026-04-18/changes.md`

### 结果

- 当前新侧边栏结构下，项目项和会话项重新具备右键操作能力。
- item 的核心交互集合重新回到侧边栏里，后续只需要继续对齐细节表现。

## 侧边栏归档确认回到旧实现

**时间**: 11:06

### 改了什么

1. 对照历史侧边栏实现，把 [`src/renderer/src/components/assistant-ui/sidebar.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/sidebar.tsx) 里的归档动作改回 item 内联二段确认。
2. 点击会话项右侧归档图标后，当前行右侧显示一个小的 `确认` 按钮；点击别处会自动收起。
3. 会话项右键菜单里的 `归档聊天` 也接到同一条行内确认链路，保持入口一致。

### 为什么改

- 这条交互在旧侧边栏里已经有稳定表现，当前结构重写后需要沿用原能力，不需要另发明弹窗确认。
- 归档确认属于单个 item 的既有行为，回到旧实现能和你原来的使用习惯保持一致。

### 涉及文件

- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `docs/changes/2026-04-18/changes.md`

### 结果

- 归档确认回到会话 item 内联确认的旧交互。
- 右侧 hover 区和归档确认共存，布局保持稳定。
