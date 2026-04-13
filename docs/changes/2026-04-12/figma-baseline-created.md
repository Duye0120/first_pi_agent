# 2026-04-12 Figma Baseline Created

> 更新时间：2026-04-12 02:40:42

## 本次做了什么

- 在 Figma 新建 `Chela UI Baseline 2026-04-12`
- 按当前桌面端 `Chela` UI handoff 创建了可继续修改的基础设计稿
- 因 Figma Starter 计划最多只支持 `3` 个页面，实际将原计划的多页结构压缩为 `00 Tokens`、`01 Screens`、`02 States`
- 在 `01 Screens` 中放入 Shell、Sidebar、Thread、Settings、Branch Switcher、Context 浮层等基础画面，方便后续直接微调
- 回写 `docs/ui-figma-handoff.md`，补充已落地的 Figma 文件链接和实际页面结构

## 为什么改

- 用户希望先把当前项目 UI 放进 Figma，再在 Figma 上继续调整
- 当前项目是 Electron 桌面端，renderer 在缺少 `window.desktopApi` 时会进入错误态，不适合直接按浏览器页面捕获
- 先用 Figma MCP 程序化建一个结构化底稿，后续再按具体节点回写代码更稳

## 涉及文件

- `docs/ui-figma-handoff.md`
- `docs/changes/2026-04-12/figma-baseline-created.md`

## Figma 文件

- 名称：`Chela UI Baseline 2026-04-12`
- 链接：`https://www.figma.com/design/2JoZ8ZAWsO3Yyt2W9dKzpm`
- 页面：`00 Tokens`、`01 Screens`、`02 States`

## 验证

- `2026-04-12 02:40:42` 使用 Figma MCP 成功创建设计文件并写入基础页面内容
- `2026-04-12 02:40:42` 确认浏览器直捕方案不适用，改为按 handoff 程序化建稿
- 本轮未执行 `build` / `check`
