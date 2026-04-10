# 2026-04-10 默认工作区可配置

> 更新时间：2026-04-10 18:01:03

## 本次做了什么

- 给工作区页加了 `更换目录` 按钮
- 选择的新目录会直接写进设置，作为默认工作区持久化
- 工作区切换后，规则文件状态会跟着刷新
- 默认工作区文案改清楚，不再像“当前这个项目被写死了”
- 首次没配置过时，默认目录从 `process.cwd()` 调整为优先用户文档目录

## 为什么改

- 用户明确提出：默认路径不该每次都卡在当前项目
- 之前虽然有 `workspace` 设置字段，但没有真正可用的目录选择入口
- 直接拿启动目录当默认值，在开发态下很容易变成仓库路径，体验很怪

## 涉及文件

- `src/main/settings.ts`
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`
- `src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/constants.ts`
- `docs/changes/2026-04-10/workspace-default-folder-picker.md`

## 验证

- `2026-04-10 18:02:50` 通过 `pnpm exec tsc --noEmit -p tsconfig.json`
- `2026-04-10 18:02:50` 通过 `pnpm exec tsc --noEmit -p tsconfig.renderer.json`
