# 2026-04-10 提供商默认选中

> 更新时间：2026-04-10 17:02:00

## 本次做了什么

- 调整“提供商与模型”页的默认选中逻辑
- 初始化和重载时，不再机械选第一个固定项
- 现在默认选排序后第一个已激活的供应商

## 为什么改

- 之前容易一直落到固定供应商上，看起来像“死盯 Anthropic”
- 实际更合理的是先落到第一个已激活项，减少手动切换

## 涉及文件

- `src/renderer/src/components/assistant-ui/settings/keys-section.tsx`
- `docs/changes/2026-04-10/provider-default-selection.md`

## 验证

- `2026-04-10 17:01:03` 运行 `pnpm exec tsc --noEmit -p tsconfig.renderer.json`

## 说明

- 这轮只改默认选中策略，不改保存逻辑
