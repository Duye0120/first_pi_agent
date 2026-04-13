# Codex 接入 code-review-graph

> 时间：2026-04-13 15:47:08
> 本次变更：给本机 Codex 增加 `code-review-graph` MCP 配置，并为 `Chela` 仓库补上 `.code-review-graphignore`。
> 触发原因：用户希望让 Codex 在维护 `Chela` 时直接使用 `code-review-graph` 做代码图谱和 review 上下文增强。

> 更新时间：2026-04-13 15:55:00
> 本次补充：把 `.agents`、`.claude`、`.superpowers`、`.omx` 加入 `.code-review-graphignore`，减少面向工具链和技能脚本的索引噪音。

> 更新时间：2026-04-13 16:03:19
> 本次验证：重建后图谱降到 `170` 个文件、`1130` 个节点、`7241` 条边，语言范围收敛到 `typescript` / `tsx`，`.agents` 查询结果清零。

## 本轮改了什么

- 更新 `C:\Users\Administrator\.codex\config.toml`
  - 新增 `[mcp_servers."code-review-graph"]`
  - 使用 `uvx` 以 `stdio` 方式启动 `code-review-graph serve`
- 新增仓库根目录 `.code-review-graphignore`
  - 排除 `node_modules`、`dist`、`out`、lockfile 等低价值索引内容
- 收紧 `.code-review-graphignore`
  - 排除 `.agents`、`.claude`、`.superpowers`、`.omx`
  - 让 `Chela` 图谱更聚焦产品代码本身
- 验证当前 MCP 可用性
  - `list_graph_stats` 正常返回图谱统计
  - `list_communities` 正常返回主要代码社区
  - `get_impact_radius` 对 ignore 文件返回低风险结果
- 执行安装探测
  - 尝试过 `py -m pip install --user code-review-graph`
  - 尝试过 `uvx --from code-review-graph code-review-graph --help`
  - 当前 shell 网络解析失败，安装阶段停在 PyPI DNS

## 为什么这么改

- Codex 当前已经支持 MCP server 配置，`code-review-graph` 适合作为维护 `Chela` 的外置代码图谱工具。
- 先把配置和仓库忽略规则落地，Codex 侧接入路径就稳定了。
- `.code-review-graphignore` 可以减少无效索引，提升后续建图效率。

## 涉及文件

- `C:\Users\Administrator\.codex\config.toml`
- `.code-review-graphignore`
- `docs/changes/2026-04-13/codex-code-review-graph-setup.md`
