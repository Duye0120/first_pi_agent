# 2026-04-10 工作区项目卡重做

> 更新时间：2026-04-10 17:55:53

## 本次做了什么

- 把工作区页重做成「当前项目」主卡，不再像路径说明页
- 顶部主信息改成：项目名、当前项目标记、Git 分支
- 路径区改成更清楚的项目信息块
- 增加「打开目录」「复制路径」两个直接操作
- `SOUL.md / USER.md / AGENTS.md` 收进同一张项目卡底部

## 为什么改

- 用户更想要“项目管理页”的感觉，不想再看到松散说明块
- 现在后端只有一个真实工作区，所以这轮围绕“当前项目”做强表达最合适
- 顺手补上打开目录，减少来回找路径

## 涉及文件

- `src/renderer/src/components/assistant-ui/settings/workspace-section.tsx`
- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/index.ts`
- `docs/changes/2026-04-10/workspace-project-card-redesign.md`

## 验证

- `2026-04-10 17:56:26` 通过 `pnpm exec tsc --noEmit -p tsconfig.json`
- `2026-04-10 17:56:26` 通过 `pnpm exec tsc --noEmit -p tsconfig.renderer.json`
