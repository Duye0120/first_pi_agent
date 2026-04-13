# 2026-04-08 19:04:10 远端优先同步 main

## 本次做了什么

- 执行 `git fetch origin main`
- 执行 `git reset --hard origin/main`
- 将本地 `main` 直接对齐到远端提交 `056a0bb`
- 覆盖了本地未提交改动，并新增本记录文件留痕

## 为什么这样改

- 用户要求“以远端的为准”合并代码
- 当前本地 `main` 落后远端 4 个提交，且工作区存在未提交改动
- 直接重置到 `origin/main` 可以确保冲突处理结果完全以远端版本为准

## 涉及文件

- 被远端版本覆盖的本地修改：
  - `src/renderer/src/components/assistant-ui/attachment.tsx`
  - `src/renderer/src/components/assistant-ui/branch-switcher.tsx`
  - `src/renderer/src/components/assistant-ui/context-summary-trigger.tsx`
  - `src/renderer/src/components/assistant-ui/reasoning.tsx`
  - `src/renderer/src/components/assistant-ui/select.tsx`
  - `src/renderer/src/components/assistant-ui/thread.tsx`
  - `src/renderer/src/components/ui/tool-fallback.tsx`
  - `src/renderer/src/styles.css`
  - `src/renderer/src/styles/theme.css`
- 新增留痕文档：
  - `docs/changes/2026-04-08/remote-sync-main.md`
