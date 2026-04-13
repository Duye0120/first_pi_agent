# Chela

`Chela` 是这个项目的正式名称。

仓库目录目前可能还是 `first_pi_agent`，但从现在开始，**产品名 / 对外名称统一使用 `Chela`**。

现在这个仓库已经从“最小 MCP demo”切到了 **桌面壳优先**：

- `Electron`
- `React`
- `TypeScript`
- `Vite`
- `Tailwind CSS`
- `Headless UI`

目标不是先把 agent 做完，而是先把未来 agent 的宿主壳子搭起来。

## 现在有什么

当前默认产品是一个偏 `Codex` 风格的桌面聊天工作台：

- 自定义标题栏
- 左侧会话列表
- 中间消息流
- 底部输入区
- 右侧上下文面板
- 本地文件选择
- 文本文件预览
- 本地会话持久化
- 本地 mock assistant 回复

这版还没接真实模型，但已经把将来接 agent 的接口位留好了。

## 项目结构

```text
Chela/
├─ src/
│  ├─ main/              # Electron main process
│  ├─ preload/           # 安全桥接 API
│  ├─ renderer/          # React UI
│  ├─ shared/            # 主进程 / 渲染进程共享类型
│  ├─ chatgpt/           # 旧 MCP ChatGPT App 入口（保留）
│  ├─ agent/             # 旧 agent 逻辑（保留）
│  ├─ tools/
│  ├─ config.ts
│  └─ main.ts            # 旧 CLI demo
├─ electron.vite.config.ts
├─ tailwind.config.ts
└─ package.json
```

## 开发

安装依赖：

```bash
pnpm install
```

启动桌面应用：

```bash
pnpm dev
```

类型检查：

```bash
pnpm check
```

构建：

```bash
pnpm build
```

预览构建产物：

```bash
pnpm start
```

## 兼容入口

旧入口还保留着，方便你后面继续迁：

- `pnpm demo:cli`
  运行原来的命令行 pi-agent demo
- `pnpm mcp:dev`
  运行原来的 MCP ChatGPT App 开发服务
- `pnpm mcp:start`
  直接启动原来的 MCP 服务

## v1 已打通的能力

### 1. 桌面 UI

- 深色工作台布局
- 类 Codex 的桌面壳体验
- 自定义窗口控制按钮

### 2. 本地文件

- 选择一个或多个本地文件
- 读取基础元信息
- 文本类文件预览
- 会话里挂载附件

### 3. 状态持久化

- 会话列表持久化
- 消息历史持久化
- 草稿持久化
- 附件元信息持久化
- 右侧面板开关持久化

### 4. agent 接口位

当前 `chat.send(...)` 先返回本地 mock 回复。

后续你只要把这条链路替换成：

- 本地 agent
- 远程模型
- MCP tool orchestration
- 自己的 Electron 本地能力编排

整个桌面壳就能继续长功能。

## preload 暴露给 React 的能力

当前统一挂在：

```ts
window.desktopApi
```

包含这些能力：

- `files.pick()`
- `files.readPreview(path)`
- `sessions.list()`
- `sessions.load(sessionId)`
- `sessions.save(session)`
- `sessions.create()`
- `chat.send(input)`
- `ui.getState()`
- `ui.setRightPanelOpen(open)`
- `window.getState()`
- `window.minimize()`
- `window.toggleMaximize()`
- `window.close()`
- `window.onStateChange(listener)`

## 后续最适合做什么

1. 把 `chat.send()` 从 mock 改成真实 agent 调用
2. 给右侧面板接入 tool 调用流 / agent 步骤流
3. 把“选择文件”升级成“工作区浏览”
4. 把旧的 `pi-agent-core` 逻辑迁入 Electron 主进程或本地服务层

## 常见问题

### Electron uninstall

如果你执行 `pnpm dev` 时看到：

```text
Error: Electron uninstall
```

说明 `pnpm` 把 Electron 的安装脚本拦掉了。

执行下面任一方案：

```bash
node node_modules/electron/install.js
```

或者：

```bash
pnpm approve-builds
```

然后再重新启动。
