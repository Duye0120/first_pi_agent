# 2026-04-11 分支列表去外层底板

> 更新时间：2026-04-11 11:10:09

## 本次做了什么

- 去掉分支下拉里分支列表外层那块底板背景
- 分支列表改成直接平铺的行结构
- 当前分支保留单行选中底色，未选中项保持普通行
- 顺手去掉当前分支行的 inset 阴影，整体更接近纯列表感

## 为什么改

- 用户明确不要“div 包一层 select 面板”的感觉
- 这块更适合做成普通列表：选中一行、未选中一行，而不是列表外再套一层底板

## 涉及文件

- `src/renderer/src/components/assistant-ui/branch-switcher.tsx`
- `docs/changes/2026-04-11/branch-switcher-list-surface.md`

## 验证

- `2026-04-11 11:10:51` 通过 `pnpm exec tsc --noEmit -p tsconfig.renderer.json`
