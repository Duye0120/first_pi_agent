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

## Diff Panel 用户命名收口为右侧边栏

**时间**: 15:16

### 改了什么

1. 把右上角入口的 tooltip 和无障碍文案从“Diff 面板”改成“右侧边栏”。
2. 把右侧内容区 header 的主标题和关闭按钮文案从 “Diff / 工作区 Diff / 关闭 Diff 面板” 改成 “边栏 / 工作区边栏 / 关闭右侧边栏”。
3. 把空态里的 `Git diff 快照` 等措辞收成更通用的 `Git 变更快照 / 工作区改动`。

### 为什么改

- 用户明确要求外层容器不要继续叫 `Diff 面板`。
- 这块区域后续会承载更多内容，入口和容器名称需要保持通用。

### 涉及文件

- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `docs/changes/2026-04-17/changes.md`

### 结果

- 右上角入口和右侧容器现在都按“右侧边栏”语义呈现。

## 工作区双分隔线收口

**时间**: 15:27

### 改了什么

1. 去掉了右侧 diff 内容容器左边那条额外的 `border-l`。
2. 保留中间真正可拖拽的分隔线，继续承担“树区和内容区边界”的视觉与交互职责。

### 为什么改

- 用户看到树区和内容区之间同时出现两条竖线，会误以为这里有两层边界或两个不同的拖拽区域。
- 这块区域保留一条清晰的拖拽线就足够表达结构。

### 涉及文件

- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `docs/changes/2026-04-17/changes.md`

### 结果

- 现在树区和内容区之间只剩一条明确的分隔线。

## 工作区树区与内容区间距收窄

**时间**: 15:33

### 改了什么

1. 把左侧树区容器右侧 padding 从 `pr-3` 收到 `pr-2`。
2. 把中间拖拽线右侧外边距从 `mr-2` 收到 `mr-1`，同时去掉负 margin。
3. 把右侧内容区左侧 padding 从 `pl-3` 收到 `pl-2`。

### 为什么改

- 去掉第二条线以后，树区和内容区之间的白缝仍然偏宽，视觉上还是像隔了两层。
- 这块区域需要更紧一点，让唯一的拖拽线成为明确边界。

### 涉及文件

- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `docs/changes/2026-04-17/changes.md`

### 结果

- 树区和内容区之间的空白明显收窄，只保留必要的拖拽安全区。

## Settings 新增 Skills 管理页

**时间**: 11:46:42

### 改了什么

1. 在设置路由、侧栏导航和 section 常量里新增 `Skills` 分区，入口直接并入现有 settings 架构。
2. 新增 main/preload/shared 的 skills 数据契约与 IPC，支持列出本地 skills、搜索 catalog、安装 skill、打开目录和打开 `SKILL.md`。
3. 新建主进程 `skills` 服务，扫描当前工作区 `.agents/skills` 与用户级 `~/.codex/skills`，按 canonical name 去重聚合，默认隐藏 `.system` 和 runtime skills。
4. 新增 renderer 端 `SkillsSection`，提供本地即时过滤、详情面板、来源标记、目录与 `SKILL.md` 打开入口，以及独立的“发现更多 skills”安装区。

### 为什么改

- 现在项目里已经有一批常用 skills，设置页需要一个正式入口来管理它们，而不是继续靠目录和文档手翻。
- 项目内与用户级 skills 会同时存在，页面需要把来源和去重规则显式做出来，减少“为什么重复显示”的困惑。
- 搜索发现和本地管理拆成两段以后，CLI 或网络链路不稳时，本地管理仍然可以保持可用。

### 涉及文件

- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/index.ts`
- `src/main/ipc/skills.ts`
- `src/main/skills.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `src/renderer/src/components/assistant-ui/settings/constants.ts`
- `src/renderer/src/components/assistant-ui/settings/types.ts`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`
- `src/renderer/src/components/assistant-ui/settings/skills-section.tsx`
- `docs/changes/2026-04-17/changes.md`

### 结果

- 设置页现在有独立的 Skills 管理入口，能同时看到项目内和用户级 skills。
- 本地 skills 支持即时搜索、查看来源、打开目录和打开 `SKILL.md`。
- 发现新 skill 与安装动作已经接到主进程 skills 服务，失败时会单独降级，不会拖垮本地列表。

## Skills 页改成管理台式列表布局

**时间**: 14:06:55

### 改了什么

1. 把 `SkillsSection` 从原来的双栏概览卡 + 详情面板，改成更接近参考图的“顶部筛选 + 右侧搜索 + 单列列表”布局。
2. 顶部收成轻量 filter tab、搜索框和刷新按钮，去掉大块统计 dashboard 视觉。
3. 已安装 skills 改成扁平单列条目，每行左侧名称描述、中间来源信息、右侧展开开关；详情改成行内展开，不再单独占右侧一列。
4. 发现区也同步改成列表式条目，和已安装列表保持同一套阅读节奏。

### 为什么改

- 用户提供了明确的 UX 参考，希望页面整体节奏更像“管理台列表”，而不是偏 dashboard 的设置卡片页。
- 当前 Skills 页信息结构已经够复杂，单列列表会比双栏详情更顺手，更适合快速扫视和逐项管理。
- 这轮保持 Chela 原有的暖底色、弱边界和选中态语言，只借参考图的布局和交互节奏。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/skills-section.tsx`
- `docs/changes/2026-04-17/changes.md`

### 结果

- Skills 页现在更接近管理台式 UX，浏览和逐项展开的节奏更清楚。
- 视觉风格仍然保持 Chela 现有的控制面板语言，没有切成参考图那种纯白后台和强蓝色系统。

## Skills 行内开关改回展开控件

**时间**: 14:14:00

### 改了什么

1. 去掉了 `Skills` 列表行右侧那个 `Switch`。
2. 整行继续保持可点击展开，右侧改成 `详情 / 收起 + chevron` 的纯展开提示。

### 为什么改

- 参考图里的 switch 语义是“启用 / 停用 skill”。
- 当前 Chela 这版并没有真正的技能启用态，那个 switch 只负责展开详情，语义会误导用户。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/skills-section.tsx`
- `docs/changes/2026-04-17/changes.md`

### 结果

- 现在 `Skills` 列表右侧控件和真实交互语义一致，只表达“展开详情”。

## Skills 页继续瘦身并修复收起失效

**时间**: 14:58:42

### 改了什么

1. 把顶部第一块继续收成单行工具条，只保留筛选 tab、搜索框和刷新按钮。
2. 删掉顶部那段解释文案，减少首屏高度占用。
3. 把来源信息统一收成一套 badge，去掉 `个人 / 用户级 / 当前工作区` 这类重复表达。
4. 修正展开状态逻辑，允许列表项真正收起到空，不会再自动反弹回第一项。

### 为什么改

- 用户反馈顶部区域占位过大，页面首屏有效内容太少。
- 当前来源信息重复表达太多，读起来会显得乱。
- `收起` 没生效的根因是列表 effect 在 `expandedSkillId` 为空时自动重新选中了第一项。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/skills-section.tsx`
- `docs/changes/2026-04-17/changes.md`

### 结果

- `Skills` 页首屏现在更紧，列表更早进入可读区。
- 来源信息只保留一套必要表达。
- `收起` 现在是正常可用的。

## Skills 实例详情继续减信息

**时间**: 15:02:09

### 改了什么

1. 把实例详情里的 `SKILL.md` 路径整行删掉，只保留目录路径。
2. 把标题行里的 `2 个实例` 徽标删掉。

### 为什么改

- 目录已经能说明实例位置，`SKILL.md` 路径在默认场景下属于可推断信息。
- 标题行已经有 `项目内 / 用户级` 两个来源 badge，`2 个实例` 再重复一遍没有增量信息。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/skills-section.tsx`
- `docs/changes/2026-04-17/changes.md`

### 结果

- 详情区更干净，信息密度更集中在真正需要看的目录和动作上。

## Skills 展开区去掉重复预览块

**时间**: 15:04:20

### 改了什么

1. 把展开区最上面那块 `# ChatGPT Apps` / frontmatter 文本预览删掉。

### 为什么改

- 标题行本身已经提供了 skill 名称和描述。
- 展开区再放一层同义预览会重复信息，尤其在 `name:` / `description:` 直接被串出来时会显得很吵。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/skills-section.tsx`
- `docs/changes/2026-04-17/changes.md`

### 结果

- 展开区现在只保留真正需要操作的实例列表。

## Skills 页补上位置迁移 UI 预览

**时间**: 15:12:55

### 改了什么

1. 把 `用户级` 这层来源表达统一改成 `Codex`，让 `~/.codex/skills` 的语义更直接。
2. 在每个 skill 的展开区顶部新增一块轻量 `位置迁移` 预览层，支持选择当前来源、`复制 / 移动` 动作，以及目标根目录。
3. 目标根目录先放出四类位置：`项目内`、`Codex`、`Claude`、`其他 agent`，其中项目内与 Codex 继续根据真实安装情况标记。
4. 当前来源位置不再作为可选目标，卡片只保留一层状态标签，避免“自己迁移到自己”和重复说明。
5. 发现区安装按钮文案同步改成 `安装到 Codex`，和页面新的位置语义对齐。

### 为什么改

- 用户希望后续能把 skill 在项目内、本地全局，以及 Claude 等其他 agent 目录之间做复制或移动。
- 这轮先看 UI 结构，页面需要先把“从哪来、到哪去、用什么动作”这三件事摆清楚。
- 现有 `用户级` 说法偏抽象，`Codex` 会比泛化来源标签更接近真实目录和用户心智。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/skills-section.tsx`
- `docs/changes/2026-04-17/changes.md`

### 结果

- `Skills` 展开区现在已经能预览位置迁移的交互结构。
- Claude 和其他 agent 根目录已经进入同一套 UI 版式，后续接真实文件操作时不需要再重做页面骨架。

## Skills 迁移区改成双区块工作台

**时间**: 15:17:03

### 改了什么

1. 把展开区从“迁移卡片压在实例列表上方”的纵向堆叠，改成左侧 `已安装位置`、右侧 `迁移草稿` 的双区块布局。
2. 把右侧迁移目标从四张大卡片收成轻量 pill 选择，减少首屏噪声和视觉重量。
3. 去掉那个禁用按钮式的假 CTA，改成更明确的草稿摘要与目标目录说明。
4. 目标目录区域继续保留 `已存在同名 skill / 可承接新副本` 这类状态提示，让用户能直接判断后续动作语义。

### 为什么改

- 用户明确反馈上一版迁移 UI 看起来别扭。
- 原先那组大卡片和禁用按钮会把注意力从真正的实例位置上抢走，读起来像一块还没接完的半成品。
- 当前这个页面更适合做成“左边看现状，右边配动作”的工作台式结构。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/skills-section.tsx`
- `docs/changes/2026-04-17/changes.md`

### 结果

- 展开区的信息层级更稳定，实例查看和迁移动作分工更清楚。
- 迁移区的交互感受更轻，和当前 `Chela` 设置页的控制面板语言更贴近。

## Skills 迁移区 UX 精修

**时间**: 07:30

### 改了什么

1. 移除 `TransferPreview` 右上角遗留的 `UI 预览` 占位 badge。
2. 把 `迁移草稿` 标题改成简洁的 `迁移`，去掉"草稿"暗示。
3. 删除标题行下方的冗余摘要行（Codex → 项目内 复制 badge 组合），状态已由下方控件选中态体现。
4. `来源` 区块改成仅当 skill 来源超过一个时才显示，单一来源无需显示多余选择。
5. `动作` 标签改为 `操作`，语义更直接。
6. `目标根目录` 改为 `目标位置`。
7. 当前来源按钮的 disabled 样式从 `opacity-80` 改为 `opacity-40 cursor-not-allowed`，明确区分可选和不可选。
8. 目标位置按钮标签 `已存在` 改为 `已有`，更紧凑。
9. 底部目标路径信息块重新布局：路径和说明并排显示，移除"目标目录"冗余标签，覆盖警告改成带颜色的 amber 提示。
10. `InlineInstance` 修正空 badge 容器问题（无 badge 时不渲染外层 div），`目录` 标签改用 uppercase tracking 样式与迁移区保持一致。
11. `InstalledSkillRow` 展开区去掉冗余的背景色嵌套，`已安装位置` 标签改用 uppercase tracking 样式。
12. `SettingsCard` 标题 `已安装` 去掉无意义描述 `"单列管理列表。"`。
13. 移除不再使用的 `ArrowRightIcon` import。

### 为什么改

- 用户反馈此区域使用感和体验感非常差。
- `UI 预览` badge 应该是开发阶段占位，没有清掉就被带进了正式界面。
- `迁移草稿` 措辞让人觉得功能未完成。
- 过多冗余信息（摘要行、标签、描述）使区域信息密度过高、层次混乱。
- disabled 状态不够明显导致用户无法快速区分可选与不可选目标。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/skills-section.tsx`
- `docs/changes/2026-04-17/changes.md`

### 结果

- 迁移区视觉更干净，"来源不够多不显示"减少不必要操作。
- disabled 目标位置视觉区分更明确。
- 底部路径信息更紧凑，覆盖警告有颜色语义。
- 整体区域信息层次更清晰。

## Skills 使用位置映射与运行时提示

**时间**: 16:17:22

### 改了什么

1. 新增共享 `skill usage registry`，把 `commit` skill 和 `右侧边栏 / 提交计划生成` 的固定入口映射收成一处统一配置。
2. 扩展 shared contracts，新增 `SkillUsageTarget`、`RuntimeSkillUsage`、`ChatMessageMeta.skillUsages`，并把 `usageTargets` 挂到 `InstalledSkillDetail`，把 `skillUsage` 挂到 `GenerateCommitMessageResult / GenerateCommitPlanResult`。
3. `skills` 主进程服务接入 registry，`listInstalled()` 返回的每个 skill 会自带固定入口映射。
4. `worker-service` 在 commit 相关结果里补齐结构化 `skillUsage`，不再只回 `skillName`。
5. 右侧边栏的提交计划区接上 `skillUsage`，加载态和生成完成后都会显示 `由 commit skill` 的轻量提示。
6. 新增 renderer 端 `SkillUsageStrip`，聊天区 assistant message 支持消费 `meta.skillUsages` 并显示轻量技能条。
7. `ElectronAdapter` 和聊天运行时链路补上 `skillUsages` 透传，后续结构化技能结果可以直接进入消息持久化和运行时 UI。
8. `Skills` 设置页列表行新增固定入口 pill，`commit` 现在能直接看到它会被右侧边栏的提交计划生成用到。

### 为什么改

- 用户希望能明确知道一个 skill 会在哪些功能入口生效，而不是只在目录里看到它存在。
- 当前 `commit` skill 已经被右侧边栏提交计划链路调用，但这层关系只散落在 worker 实现和零散文案里。
- 运行时也需要一层轻提示，让用户知道这次动作背后实际使用了哪个 skill。

### 涉及文件

- `src/shared/contracts.ts`
- `src/shared/skill-usage.ts`
- `src/main/skills.ts`
- `src/main/worker-service.ts`
- `src/main/adapter.ts`
- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/assistant-ui/skill-usage-strip.tsx`
- `src/renderer/src/components/assistant-ui/settings/skills-section.tsx`
- `docs/changes/2026-04-17/changes.md`

### 结果

- `Skills` 设置页现在能展示技能的固定使用位置。
- 右侧边栏生成提交计划时会稳定显示 `commit skill` 来源提示。
- 聊天区已经具备消费结构化 `skillUsages` 的能力，后续新链路只要补元数据就能直接显示。

## 修复聊天区 skill usage 渲染循环

**时间**: 16:27:54

### 改了什么

1. 调整聊天区 `AssistantMessageSkillUsages` 的读取方式，`useAuiState` selector 只返回原始 `skillUsages` 引用。
2. 把 `extractRuntimeSkillUsages()` 的归一化逻辑移到组件内 `useMemo`，避免 selector 每次都创建新数组。

### 为什么改

- 新增聊天区 skill strip 之后，assistant-ui store selector 在每次读取时都会拿到一个新数组。
- React 会把这种不稳定 snapshot 视为持续变化，最终触发 `Maximum update depth exceeded`。

### 涉及文件

- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-04-17/changes.md`

### 结果

- 聊天区 skill usage strip 改成稳定渲染。
- 当前修复范围集中在崩溃点，右侧边栏和 settings 的 usage 提示链路保持原样。

## 补充 UI 与性能并重约束

**时间**: 16:34:18

### 改了什么

1. 在项目约束里补充 `UI 交付默认同时满足表现和性能` 规则。
2. 明确 React 高频界面默认优先稳定 selector、减少无意义重渲染、控制派生对象创建。

### 为什么改

- 用户明确要求后续界面工作同时满足 UI 质量和性能表现。
- 这条约束直接影响设置页、聊天区、diff panel 这类高频区域的实现方式，需要进入长期规则。

### 涉及文件

- `AGENTS.md`
- `docs/changes/2026-04-17/changes.md`

### 结果

- 后续相关改动会同时按视觉质量和性能稳定性验收。

## 提交计划区去掉重复 skill 提示

**时间**: 16:39:46

### 改了什么

1. 删除 `diff panel` 提交计划区里那块独立的生成中提示条。
2. 保留标题下方的 `由 commit skill` 轻提示作为唯一 skill 来源表达。

### 为什么改

- 用户明确指出提交计划区出现了两层重复提示。
- 顶部 skill strip 已经完整表达来源信息，底部再放一块生成中文案会造成冲突和视觉噪声。

### 涉及文件

- `src/renderer/src/components/assistant-ui/diff-panel.tsx`
- `docs/changes/2026-04-17/changes.md`

### 结果

- 提交计划区现在只保留一处 skill 来源提示。
- 生成中的状态反馈回到按钮脉冲和面板内容本身，信息层级更干净。

## Skills 列表默认保持收起

**时间**: 16:45:12

### 改了什么

1. 去掉 `Skills` 页面首次加载时自动展开第一条 skill 的逻辑。
2. 调整过滤后的展开态修正逻辑，当前展开项失效时直接收起，不再自动跳到第一条。

### 为什么改

- 用户希望进入页面时列表默认保持收起，由用户自己决定展开哪一项。
- 自动展开首项会制造页面噪声，也会让过滤切换时出现不必要的状态跳转。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/skills-section.tsx`
- `docs/changes/2026-04-17/changes.md`

### 结果

- `Skills` 页首次进入时默认全收起。
- 过滤或刷新后，展开态只在原条目仍然存在时保留。

## 聊天关键修复第一轮落地

**时间**: 19:28

### 改了什么

1. 扩展 settings 合同与深合并逻辑，新增 `network.proxy` 和 `network.timeoutMs`，并把代理配置接到 main 启动与 settings 热更新。
2. 新增全局网络代理模块，`web_search / web_fetch` 已改为读取统一网络超时。
3. 把聊天 prepare 阶段切到 `resolveWithFailover()`，并在 execute 阶段补上真正的 provider/network failover 与 transcript metadata 留痕。
4. 给 prompt control plane 新增 `learnings` layer，直接读取 memdir `learnings` topic 注入 prompt，同时把 learning summary/detail 改成动作建议。
5. 新增 session search 后端、IPC、preload 和前端 API 面，索引源直接读取 `session.json / transcript.jsonl / context-snapshot.json`。
6. 新增 session 级 `pendingRedirectDraft` 持久化、queued redirect 主链路，以及聊天输入区上方的引导卡片 UI。
7. 重写 `docs/critical-chat-fixes-plan.md`，把计划文档收成 `P0 / P1 / P2` 并纠正文档落点。

### 为什么改

- 当前聊天链路最缺的是网络可用性、故障转移、跨会话 learnings 和记忆外可发现性。
- 引导能力需要避开 active turn 并发 prompt，queued redirect 更稳，也更符合现有 run 生命周期。
- 这些改动横跨 shared/main/renderer，必须先把合同、持久化和 IPC 一起收口，后续才能继续扩前端入口。

### 涉及文件

- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/main/settings.ts`
- `src/main/index.ts`
- `src/main/network/proxy.ts`
- `src/main/network/undici.ts`
- `src/main/tools/web-fetch.ts`
- `src/main/tools/web-search.ts`
- `src/main/failover.ts`
- `src/main/chat/prepare.ts`
- `src/main/chat/execute.ts`
- `src/main/chat/finalize.ts`
- `src/main/chat/service.ts`
- `src/main/prompt-control-plane.ts`
- `src/main/context/engine.ts`
- `src/main/learning/engine.ts`
- `src/main/session/meta.ts`
- `src/main/session/service.ts`
- `src/main/session/facade.ts`
- `src/main/session/search.ts`
- `src/main/ipc/sessions.ts`
- `src/main/ipc/chat.ts`
- `src/preload/index.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/assistant-ui/settings/general-section.tsx`
- `docs/critical-chat-fixes-plan.md`
- `docs/changes/2026-04-17/changes.md`

### 结果

- Chela 的聊天主链路现在已经具备网络代理、双层 failover、固定 learnings 注入、session search 后端和 queued redirect 基础能力。
- 当前轮没有新增可见搜索入口，也没有做 mid-turn 模型热切，模型切换语义已经在文档里收口到“下一条消息生效”。

## critical-chat-fixes 审查整改与优化

**时间**: 18:40

### 改了什么

1. **P0 阻断修复 · undici 路径**: 把 src/main/network/undici.ts 里写死的 .pnpm/undici@7.22.0 绝对路径换成标准 `import { ... } from "undici"`；并把 undici 升级成 package.json 直接依赖（^7.22.0）避免未来 hoist 版本漂移。
2. **P0 阻断修复 · web-search timeout 作用域**: 在 src/main/tools/web-search.ts 里把 controller 和 timeout 声明移出 try 外层，保证 finally 里的 clearTimeout 能拿到引用，不再触发 TS2304。
3. **P0 阻断修复 · worker-service 类型**: 重写 tryParseCommitPlanJson 的解析循环，用 for...of 显式构造 CommitPlanGroup，按 reason 是否为空决定是否赋值，彻底去掉 satisfies + filter + type predicate 组合带来的 TS2677 / TS2345。
4. **P2-2 引导 UI 复核**: 确认 RedirectDraftCard 和 composer 「引导」按钮已经在 thread.tsx / AssistantThreadPanel.tsx 接好，pendingRedirectDraft 可点可删，正跑时输入文字会出现「引导」入口；desktopApi.chat.queueRedirect / clearRedirectDraft 链路全通。
5. **优化 · 设置写入失败有日志**: src/main/settings.ts 里 updateSettings 动态 import network/proxy.js 的 catch 改成 appLogger.warn，不再静默吞掉代理失败。
6. **优化 · 重命名同步 session 索引**: src/main/session/service.ts 的 renamePersistedSession 结束前调一次 indexSessionSearchDocument(sessionId)，重命名后搜索立刻命中新标题。
7. **优化 · failover 错误分类更精准**: src/main/failover.ts 的 RETRIABLE_PATTERNS 里去掉裸 500/502/503 字符串，改为 /\b5\d{2}\b/ 正则，避免命中「上下文 500 token」这类误报，同时覆盖 501/504 等真 5xx。
8. **优化 · failover 候选去重**: src/main/chat/execute.ts 构造 candidateEntryIds 时把 context.failover.prepare.failedEntries 过滤掉，执行链不会再回踩已经在 prepare 阶段失败的 entry。
9. **优化 · session search 支持中文**: src/main/session/search.ts 的 tokenize 针对汉字段落改用 bigram 分词，「旁路」「鉴权」这类短语现在能被正确索引和检索。

### 为什么改

- 上一轮交付评审发现 3 个严重级阻断（undici 路径、web-search 超时作用域、worker-service 类型）让整条链路实际没法 pnpm check，必须先拔掉。
- P2-2 引导草稿的 main/preload 全套都已经接好，需要复核 renderer 是否把 UI 也打通，避免只剩后端能力没人用。
- 其余优化都是上一轮审查里标出的可提升点，统一随手收掉，避免后面再回来补丁。

### 涉及文件

- package.json（新增 undici 直接依赖）
- src/main/network/undici.ts
- src/main/tools/web-search.ts
- src/main/worker-service.ts
- src/main/settings.ts
- src/main/session/service.ts
- src/main/session/search.ts
- src/main/failover.ts
- src/main/chat/execute.ts
- src/shared/contracts.ts（SkillInstallResult 调整）
- src/renderer/src/App.tsx（DeepPartialSettings 补形）
- src/renderer/src/components/assistant-ui/settings/general-section.tsx（网络设置 partial cast）
- docs/changes/2026-04-17/changes.md

### 结果

- pnpm check 全绿（main + renderer 两套 tsconfig 都 pass）。
- 代理 / fail-over / learnings / session search / redirect 草稿这几条 critical 路径都具备可发布条件。
- 中文检索、错误分类、候选去重同步上线，长期准确度更稳。

## 网络与 failover 二轮优化

**时间**: 19:20

### 改了什么

1. **failover.ts**：把 429 从纯字符串匹配收成 `\b(?:5\d{2}|429)\b` 正则，配合上一轮的 5xx 边界，彻底排除 "1429" 之类的子串误判。
2. **failover.ts withRetry**：改成指数退避 + 满抖动（waitMs = baseDelay * 2^attempt + Math.random()*baseDelay，上限 15s），多个会话同时撞到 rate limit 时不会再卡在同一个重试时刻。
3. **settings.ts updateSettings**：`applyGlobalNetworkSettings()` 现在只在 `network.timeoutMs` 或 `proxy.{enabled,url,noProxy}` 真实变化时触发，调字体、改主题等无关设置不再重建 dispatcher、不再丢连接池。

### 为什么改

- `429` 字符串裸匹配在错误信息里偶尔会被无关数字命中。
- 固定 1s 重试在多会话场景下容易同步爆量。
- 用户每动一次设置就重建一次全局 undici 连接池纯属浪费，也容易在密集调整时把正在飞的请求打断。

### 涉及文件

- src/main/failover.ts
- src/main/settings.ts
- docs/changes/2026-04-17/changes.md

### 结果

- pnpm check 全绿。
- failover 重试更稳，错误分类更准。
- 改无关设置不会再触发底层网络层抖动。
