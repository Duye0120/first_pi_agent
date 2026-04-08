# 2026-04-08 14:39 Claude-Code Style Tools

## 本次做了什么

- 新增 Claude Code 风格的可用工具面，但没有直接搬源码：
  - `file_edit`
  - `glob_search`
  - `grep_search`
  - `web_search`
  - `todo_read`
  - `todo_write`
- 新增 `src/main/tools/index.ts` 的 tool pool assembly，统一拼 builtin tools、MCP resource tools、动态 `mcp_*` tools
- 在 `src/mcp/adapter.ts` 补了 `list_mcp_resources`、`read_mcp_resource`、`list_mcp_resource_templates`
- 在 `src/main/harness/policy.ts` 补齐这些工具的 Harness 准入规则
- 在 `src/main/agent.ts` 更新 system prompt，明确告诉模型这些能力存在且怎么用
- 把 session todo 持久化到 `session.json`，并补了脏数据兜底，避免旧数据把 todo 读炸
- 修了 `web_search` 的结果 URL，直接返回最终链接，不再给 DuckDuckGo 跳转壳
- 把 `glob_search` / `grep_search` 明确收口到“原生 `rg` 优先，失败再 fallback”
- 引入 `@vscode/ripgrep`，让 `glob_search` / `grep_search` 默认使用随应用携带的原生 `rg.exe`
- 在 `package.json` 的 `pnpm.onlyBuiltDependencies` 里放行 `@vscode/ripgrep`，避免新机器安装时漏下二进制
- 修了 `grep_search` 在 `content` 模式下对带连字符文件名的误判，`web-search.ts` 不会再被截成 `web`
- 补了外部别名提示，保证 agent 知道 `edit_file / WebSearch / TodoWrite / ListMcpResources / ReadMcpResource` 也能直接用

## 为什么改

- 用户明确要 Claude Code 那类高频工具能力，但要求是“功能存在且可用”，不是照搬外部实现
- 用户额外强调检索体验和速度必须优先；如果有原生方案，就不要为了语言统一牺牲响应速度
- 之前工具注册是散的，MCP resource 和 builtin 不在一个装配点，不利于继续扩展
- 之前没有线程级 task/todo 能力，也没有可直接用的网页搜索入口

## 涉及文件

- `src/main/agent.ts`
- `src/main/harness/policy.ts`
- `src/main/session/service.ts`
- `src/main/tools/index.ts`
- `src/main/tools/file-edit.ts`
- `src/main/tools/fs-utils.ts`
- `src/main/tools/glob-search.ts`
- `src/main/tools/grep-search.ts`
- `src/main/tools/todo.ts`
- `src/main/tools/web-search.ts`
- `src/main/tools/ripgrep.ts`
- `src/mcp/adapter.ts`
- `package.json`
- `AGENTS.md`

## 验证

- `2026-04-08 14:08:38` 运行 `pnpm exec tsc --noEmit -p tsconfig.json`
- `2026-04-08 14:40:36` 再次运行 `pnpm exec tsc --noEmit -p tsconfig.json`
- `2026-04-08 14:47:14` 在接入 `@vscode/ripgrep` 后再次运行 `pnpm exec tsc --noEmit -p tsconfig.json`
- 运行临时 smoke 脚本验证：
  - `glob_search` 在当前仓库匹配 `src/main/tools/*.ts`，耗时约 `126ms`
  - 切到随包 `rg.exe` 后，同样的 `glob_search` 烟测进一步到约 `72ms`
  - `grep_search` 的 `files_with_matches / content / count` 三种模式都能返回结果
  - `grep_search` 已确认带 `-` 的文件名不会再被截断
  - `file_edit` 能做首个替换和 `replace_all` 替换，并返回结构化 patch
  - `web_search` 能真实返回 GitHub 搜索结果，`allowed_domains / blocked_domains` 可用
  - `list_mcp_resources` / `read_mcp_resource` / `list_mcp_resource_templates` 在无连接时返回可理解文本

## 说明

- `todo_*` 和完整 tool pool 装配依赖 Electron main 运行时；这轮先完成类型检查、接线和非 Electron 侧 smoke
- 这轮方向不是“坚持 TS 复刻”，而是“UI 留在现有栈，重活优先走原生高性能实现”
- 现在检索链路已经不是“本机装了 `rg` 才快”，而是默认跟着应用走原生 `ripgrep`
- 后续如果要继续对齐 Claude Code，可优先补：
  - 更强的 `file_edit` patch 语义
  - `todo` 的 UI 可视化
  - MCP resource/template 的前端入口
