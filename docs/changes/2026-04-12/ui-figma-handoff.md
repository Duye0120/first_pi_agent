# 2026-04-12 UI Figma Handoff

> 更新时间：2026-04-12 02:26:06

## 本次做了什么

- 新增 `docs/ui-figma-handoff.md`，把当前桌面端 `Chela` UI 拆成适合搬到 Figma 的结构化清单
- 从现有代码里整理出 Shell、Sidebar、Thread、Composer、BranchSwitcher、Context 浮层的层级和关键尺寸
- 提炼浅色主题下的核心颜色、圆角、阴影和选择态 token，方便在 Figma 中先建基础样式
- 明确 Figma 里应优先继承的长期约束：少 border、统一选择态、`Context` 圆环不可隐藏
- 补充命名提醒，标出当前输入框 placeholder 仍残留 `Pi Agent` 文案，Figma 稿建议统一为 `Chela`

## 为什么改

- 用户希望先把当前 UI 搬到 Figma，再逐步调视觉
- 直接靠截图临摹容易漏掉结构层级、状态页和现有交互约束
- 先整理一份 handoff 文档，后面无论是你在 Figma 里调，还是再回写代码，都会更稳

## 涉及文件

- `docs/ui-figma-handoff.md`
- `docs/changes/2026-04-12/ui-figma-handoff.md`

## 信息来源

- `src/renderer/src/App.tsx`
- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `src/renderer/src/components/assistant-ui/title-bar.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `src/renderer/src/components/assistant-ui/branch-switcher.tsx`
- `src/renderer/src/components/assistant-ui/context-summary-trigger.tsx`
- `src/renderer/src/styles/theme.css`
- `src/renderer/src/styles.css`

## 验证

- `2026-04-12 02:26:06` 人工复核 handoff 文档与当前代码结构、主题 token 和交互约束一致
- 本轮只补文档，不执行 build / check
