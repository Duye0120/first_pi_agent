# 安装前端设计技能

> 时间：2026-04-10 09:49:44
> 目的：按用户要求补齐前端设计相关技能，优先使用官方来源。

## 本次改了什么

- 检查本地技能目录，确认 `vercel-react-best-practices` 已存在。
- 通过 `npx skills add https://github.com/anthropics/claude-code --skill frontend-design -g -y` 安装 `frontend-design`。
- 没有重复安装 `vercel-react-best-practices`，避免多余覆盖。

## 为什么这样改

- 用户点名要装 `frontend-design` 和 `vercel-react-best-practices`。
- 其中一个已装好，继续重装收益低，还容易制造重复来源。
- `frontend-design` 直接走官方仓库安装，最省事也最稳。

## 当前结果

- `frontend-design` 已安装，可供 Codex 使用。
- `vercel-react-best-practices` 原本已存在，本次保留现状。

## 涉及位置

- `D:\\a_github\\first_pi_agent\\docs\\changes\\2026-04-10\\install-frontend-skills.md`
- `C:\\Users\\Administrator\\.agents\\skills\\frontend-design`
- `C:\\Users\\Administrator\\.codex\\skills\\vercel-react-best-practices`
