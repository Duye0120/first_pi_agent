# 2026-04-10 提供商删除确认

> 更新时间：2026-04-10 17:18:30

## 本次做了什么

- 把“删除提供商”从硬拦截改成带确认的小弹层
- 删除提供商时会一并删除它下面的模型条目
- 如果当前默认模型也在这个提供商里，会自动切到其它可用模型
- 前端在删除后会同步默认模型状态，避免 UI 卡旧值

## 为什么改

- 之前必须先一层层删模型，再删提供商，流程很怪
- 用户想要的是一次确认后直接删干净，而不是玩解锁游戏

## 涉及文件

- `src/main/providers.ts`
- `src/renderer/src/components/assistant-ui/settings/keys-section.tsx`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`
- `docs/changes/2026-04-10/provider-delete-confirm.md`

## 验证

- `2026-04-10 17:23:14` 运行 `pnpm exec tsc --noEmit -p tsconfig.json`
- `2026-04-10 17:23:14` 运行 `pnpm exec tsc --noEmit -p tsconfig.renderer.json`

## 说明

- 这轮只改删除体验，不改 provider 编辑结构
