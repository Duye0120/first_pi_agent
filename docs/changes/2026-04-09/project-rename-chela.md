# 项目正式改名为 Chela

> 时间：2026-04-09 14:17

> 补记：2026-04-09 14:35
- 补掉遗漏的有效残留：`src/renderer/index.html` 页签标题和 `src/renderer/src/App.tsx` 的 localStorage key 读取/写入逻辑

> 补记：2026-04-09 14:39
- 将当前测试阶段版本统一收口为 `0.1.0`，同步到 `package.json`、MCP client 运行时版本和设置页展示文案

## 改了什么

- 将 `package.json` 的包名从 `first-pi-agent` 改为 `chela`，并新增 `productName: "Chela"`
- 将 Electron 窗口标题改为 `Chela`
- 将 MCP client 运行时标识改为 `chela-desktop-agent`
- 将 renderer 的 localStorage key 命名空间改为 `chela.*`
- 为旧的 `first-pi-agent.*` localStorage key 增加兼容读取
- 在主进程启动时增加旧 `userData` 目录迁移，兼容 `first-pi-agent` / `first_pi_agent`
- 更新 `README.md` 和 `AGENTS.md`，把正式名称统一为 `Chela`
- 将 GitHub 仓库从 `Duye0120/first_pi_agent` 直接改名为 `Duye0120/Chela`，并同步本地 `origin`

## 为什么改

今天正式确认项目名称为 `Chela`，不再继续使用 `first_pi_agent` / `first-pi-agent` 作为对外名称。

这次改名不仅是文案替换，还处理了两个容易造成“改名后像丢数据”的兼容点：

1. `localStorage` 的旧 key 兼容读取
2. `userData` 目录从旧名称迁移到新名称

这样改名后，旧会话和旧界面偏好不会因为命名空间变化直接失联。

## 涉及文件

- `package.json`
- `src/main/index.ts`
- `src/mcp/client.ts`
- `src/renderer/src/App.tsx`
- `README.md`
- `AGENTS.md`
- GitHub 仓库：`Duye0120/Chela`
