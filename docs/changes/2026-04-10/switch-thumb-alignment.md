# 2026-04-10 Switch 滑块对齐

> 更新时间：2026-04-10 17:15:00

## 本次做了什么

- 修正通用 `Switch` 组件里 thumb 的选中位移
- 把选中态从 `translate-x-4` 调到 `translate-x-[18px]`

## 为什么改

- 之前右侧留白比左侧更大，视觉上像“没推到底”
- 这不是页面布局问题，是通用组件本身的位移少了 2px

## 涉及文件

- `src/renderer/src/components/ui/switch.tsx`
- `docs/changes/2026-04-10/switch-thumb-alignment.md`

## 验证

- `2026-04-10 17:14:59` 运行 `pnpm exec tsc --noEmit -p tsconfig.renderer.json`

## 说明

- 这轮会影响全局所有复用这个 `Switch` 的地方
