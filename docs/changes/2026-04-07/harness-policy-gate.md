# 2026-04-07 16:05 Harness Policy Gate

## 本次做了什么

- 把工具执行真正接进 Harness，而不只是有一个 run 容器
- 新增 `src/main/harness/tool-execution.ts`
- 给所有内置工具和 MCP 工具统一套了一层 Harness 包装
- `shell_exec`、覆盖型 `file_write`、`mcp_*` 现在会先过 policy，再决定 `allow / confirm / deny`
- Electron 侧补了原生确认弹窗入口
- policy 决策会写进 `audit.log`

## 为什么这么做

- 上一步只是把 run 生命周期抽出来，还没有真正卡住副作用入口
- 如果工具还是自己直接跑，Harness 就只是“记账本”，不是“闸门”
- 现在这层包装，相当于把 `tool.execute()` 变成：

```text
tool proposal
  -> Harness policy
  -> 需要时确认
  -> 真正执行 tool
  -> 回到 agent loop
```

## 这次涉及文件

- `src/main/agent.ts`
- `src/main/adapter.ts`
- `src/main/index.ts`
- `src/main/harness/runtime.ts`
- `src/main/harness/singleton.ts`
- `src/main/harness/tool-execution.ts`

## 当前行为

- `web_fetch` / `get_time` 默认直过
- `file_read` 会继续受路径与敏感文件规则保护
- `file_write` 新建文件可过，覆盖已有文件会弹确认
- `shell_exec` 黑名单直接拒绝，白名单直接过，其余弹确认
- `mcp_*` 默认弹确认

## 还没做

- 还没做 Renderer 内嵌确认 UI；当前先走 Electron 原生确认弹窗
- 还没做确认状态持久化恢复
- 还没把 approval 单独存到 store
