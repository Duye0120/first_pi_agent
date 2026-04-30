# Chela 下一阶段产品推进计划

时间：2026-04-28 18:34:29

## 当前状态

- 底层基建路线 Phase 1-6 已收口，详见 `docs/todos/foundation-hardening-roadmap.md`。
- P0 / P1 审计风险已完成第一轮修复，P2 / P3 作为支撑性清理继续排队。
- Memory / RAG baseline 已落地，下一步进入信号驱动候选、偏好观察和检索质量提升。
- Browser Preview / DOM Inspector 仍处于 spec 阶段，当前是最适合启动的产品能力。
- Agent Core 已具备 `recoveryPrompt` 和 `canResume`，真正恢复执行仍需继续推进。
- 当前 UI 收口重点是侧栏折叠/展开、设置默认入口、拖拽线隐藏和聊天主线防回归。

## 推进原则

- 先稳定当前 shell，再扩展右侧产品能力。
- 每个阶段都用可手动验证的交互闭环收口。
- 产品能力优先，P2 / P3 技术债作为同轮支撑项处理。
- UI 改动同步覆盖聊天发送、思考展示、context 圆环、设置导航和侧栏折叠。

## 明日优先级

1. UI 状态收口与回归确认
   - 确认侧栏按钮和 `Ctrl+B` 都能折叠/展开。
   - 确认首页与设置页共用同一套侧栏状态。
   - 确认设置入口默认进入 `通用`。
   - 确认侧栏拖拽热区保留，视觉线条隐藏。

2. Browser Preview Phase 0-1
   - 先确认 Diff Panel / 右侧面板承载方式。
   - 新增 Browser Preview 面板、URL 输入和加载状态。
   - Electron 配置补齐 `webviewTag` 或采用等价安全容器方案。
   - 本地 URL 和普通 web URL 都能打开。

3. DOM Inspector Phase 2-4
   - 注入 inspector 脚本，支持 hover 高亮和 click 选择。
   - 生成稳定 selector、尺寸、文本、样式摘要。
   - 将选中元素插入输入区 tag。
   - 发送消息时把 DOM context 组装进 agent 多模态/文本上下文链路。

4. Agent Core 真恢复
   - 梳理当前 `recoverableRun`、approval 恢复和 transcript 事件链路。
   - 把“恢复提示”推进到可继续执行的 runtime 状态机。
   - 回归中断审批、续写、取消和失败后恢复。

5. Memory 信号驱动增强
   - 抽 `MemoryCandidateBus`。
   - 接入 ExplicitMarker、EmotionalSpike、PredictionMismatch。
   - UI 删除记忆时触发降权或候选抑制。

6. P2 / P3 支撑清理
   - 优先处理影响 Browser Preview、Inspector、Agent Core 恢复的审计项。
   - 每轮只带走与当前产品推进同链路的技术债。

## 验收标准

- 侧栏折叠/展开：左上角 icon 和 `Ctrl+B` 在首页、设置页都生效。
- 设置页入口：从侧栏进入设置默认选中 `通用`。
- 拖拽体验：侧栏仍可拖拽调整宽度，拖拽时无硬竖线。
- TODO：`docs/todos/README.md` 与 roadmap 的 Phase 1-6 状态一致。
- Browser Preview：右侧面板能打开本地 URL 和 web URL，并展示加载/失败状态。
- DOM Inspector：可选择页面元素，并把 selector、尺寸、文本摘要带入输入区。
- 聊天主线：纯文本发送、思考展示、context 圆环 hover/展开、分支切换缓存保持正常。

## 验证方式

- 轻量校验：`git diff --check -- src/renderer/src/App.tsx docs/todos/README.md docs/plans/next-product-push-2026-04-28.md docs/changes/2026-04-28/changes.md`
- 定点回归：`pnpm exec tsx tests/settings-navigation-regression.test.ts`
- 产品 smoke：Electron 内手动确认侧栏、设置入口、聊天发送、thinking、context 圆环。
- Browser Preview 启动后追加：本地 dev URL、外部 URL、Inspector 选择、tag 发送链路。

## 主要风险

- Electron webview 权限和 preload 注入需要明确安全边界。
- Inspector 脚本会遇到 CSP、iframe、Shadow DOM 和高频 hover 性能问题。
- DOM context 可能膨胀，需要对 HTML、文本和样式摘要做长度上限。
- Shell 布局继续承载侧栏、聊天、diff、browser 多面板，需控制状态耦合。

## 执行建议

明天第一轮先做 UI 手动回归和 Browser Preview Phase 0-1，拿到可打开页面的右侧面板后再进入 Inspector。
