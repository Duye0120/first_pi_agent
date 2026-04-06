---
description: 管理 /commit 工作流并生成 Conventional Commits 消息。用户提到“/commit”“提交消息”“Conventional Commits”或要求自动提交时使用。
alwaysApply: false
---

---
name: commit
description: 管理 /commit 工作流并生成 Conventional Commits 消息。用户提到“/commit”“提交消息”“Conventional Commits”或要求自动提交时使用。
---

# Commit

## 目标

在本地执行 /commit 风格的提交流程：分析变更、生成规范提交消息、必要时执行预检。

## 触发场景

- 用户输入 `/commit`
- 用户要求“生成提交信息/提交消息/Conventional Commits”
- 用户要求“自动提交/帮我提交代码”

## 工作流

1. 运行预检（默认启用）
   - `pnpm lint`
   - `pnpm build`
   - `pnpm generate:docs`
2. 变更分析
   - `git status`
   - `git diff`（含暂存与未暂存）
   - `git log -1`（确定风格）
3. 需要时自动分拆提交（混合类型/多模块/跨系统）
4. 生成提交消息（Conventional Commits）
5. 依次执行：`git add` → `git commit` → `git status`

## 提交消息格式

默认（simple）：

```text
<emoji> <type>[optional scope]: <description>
```

必要时（full）：

```text
<emoji> <type>[optional scope]: <description>

<body>

<footer>
```

## 类型与 emoji

- feat ✨
- fix 🐛
- docs 📝
- style 🎨
- refactor ♻️
- perf ⚡️
- test ✅
- chore 🔧
- ci 👷
- build 📦
- revert ⏪

## 关键规则

- 提交消息动词使用现在时、祈使句，首行不加句号
- 避免混合多个不相关改动
- 不跳过钩子（除非用户明确要求）
- 不使用 `git commit --amend`（除非用户明确要求且符合安全条件）
- 不提交敏感文件（如 .env/credentials）

## 示例

```text
✨ feat(auth): add JWT token validation
🐛 fix(ui): correct empty state rendering
```
