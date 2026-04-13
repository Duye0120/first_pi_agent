# 14 — 数据存储

> 状态：`in-review`
> 依赖：03-agent-core、07-memory-architecture、13-composer-and-settings
> 更新时间：2026-04-13 15:29:14

## 14.1 设计目标

定义应用所有持久化数据的存储位置、格式和读写策略。原则：

- **本地优先** — 所有数据存在用户本机，不上传任何云端
- **人类可读** — 尽量用 JSON/Markdown，用户可以手动检查和编辑
- **安全分层** — 敏感数据（API Key）独立存储，权限收紧
- **崩溃安全** — 写入操作原子化，断电/崩溃不丢数据
- **可回放** — 至少能从持久化数据还原一次 run 的关键节点和最终结果

## 14.2 存储布局

两个存储根目录：

| 根目录 | 路径 | 存什么 |
|--------|------|--------|
| **App Data** | `${app.getPath('userData')}/` | 应用级数据：设置、凭证、会话、记忆、活动 run |
| **Workspace** | 用户选择的项目目录 | 项目级数据：Soul 文件、MCP 配置 |

### App Data 目录结构

```
~/.config/Chela/                          # Linux
~/Library/Application Support/Chela/     # macOS
%APPDATA%/Chela/                         # Windows
│
├── settings.json                # 用户设置（模型、外观、终端配置）
├── credentials.json             # API Keys（0600 权限）
│
├── data/
│   ├── ui-state.json            # UI 状态（窗口尺寸、面板开关等）
│   ├── groups.json              # 线程分组
│   ├── harness-runs.json        # 活动 run 注册表
│   ├── interrupted-approvals.json # 重启后恢复的审批 notice
│   ├── sessions/
│   │   ├── index.json
│   │   ├── {sessionId}/
│   │   │   ├── session.json
│   │   │   ├── transcript.jsonl
│   │   │   └── context-snapshot.json
│   │   └── …
│   ├── logs/
│   │   └── audit.log            # Harness 审计日志（JSON Lines）
│   └── memory/                  # T1 长期记忆（当前实现）
│       ├── MEMORY.md            # 长期记忆索引
│       └── topics/
│           ├── architecture.md
│           ├── preferences.md
│       └── …
```

### Workspace 目录结构

```
/Users/alice/projects/my-app/    # 用户的项目目录
│
├── .chela/                      # Chela 的项目级配置（目标口径）
│   ├── SOUL.md                  # Agent 人格
│   ├── USER.md                  # 用户信息
│   ├── AGENTS.md                # 行为规则
│   └── mcp.json                 # MCP Server 配置
│
├── src/                         # 用户的项目代码（Agent 可读写）
├── package.json
└── …
```

## 14.3 会话存储

### 当前已定格式

当前实现已经从单个 `sessions/{id}.json` 收口到目录模式：

- `session.json` 只存线程元数据、draft、附件、lastRunState、seq 等轻量字段
- `transcript.jsonl` 是线程内唯一聊天事实流
- `context-snapshot.json` 只存 `T2 session memory snapshot`
- `ChatSession` 只是 Renderer projection，不再是持久化原始格式

### 为什么从单文件改为多文件

当前实现把所有会话存在一个 `desktop-shell-state.json` 里。随着会话增多和消息增长，这个文件会变得很大（一个有 100 条消息的会话约 200KB，10 个会话就 2MB），每次保存都要全量写入。

改为每个会话一个文件后：
- 保存单个会话只写一个小文件
- 加载会话列表只读 index.json（很小）
- 删除会话只删一个文件

### 会话索引

```typescript
// sessions/index.json
{
  "summaries": [
    {
      "id": "abc-123",
      "title": "重构 Auth 模块",
      "updatedAt": "2025-06-15T10:30:00Z",
      "messageCount": 24,
      "archived": false,
      "groupId": null,
      "lastRunState": "completed"
    }
  ]
}
```

### 单线程目录

```typescript
// sessions/{sessionId}/session.json
{
  "id": "abc-123",
  "title": "重构 Auth 模块",
  "createdAt": "2025-06-15T09:00:00Z",
  "updatedAt": "2025-06-15T10:30:00Z",
  "draft": "",
  "attachments": [],
  "lastModelEntryId": "builtin:anthropic:claude-sonnet-4-20250514",
  "lastRunId": "run-123",
  "lastRunState": "completed",
  "transcriptSeq": 42,
  "snapshotRevision": 3
}
```

```typescript
// sessions/{sessionId}/transcript.jsonl
{"seq":1,"sessionId":"abc-123","timestamp":"2025-06-15T09:00:05Z","type":"user_message","message":{...}}
{"seq":2,"sessionId":"abc-123","runId":"run-123","timestamp":"2025-06-15T09:00:05Z","type":"run_started","runKind":"chat","modelEntryId":"builtin:anthropic:claude-sonnet-4-20250514","thinkingLevel":"off"}
{"seq":3,"sessionId":"abc-123","runId":"run-123","timestamp":"2025-06-15T09:00:08Z","type":"assistant_message","message":{...}}
{"seq":4,"sessionId":"abc-123","runId":"run-123","timestamp":"2025-06-15T09:00:08Z","type":"run_finished","finalState":"completed"}
```

```typescript
// sessions/{sessionId}/context-snapshot.json
{
  "version": 1,
  "sessionId": "abc-123",
  "revision": 3,
  "compactedUntilSeq": 24,
  "summary": "…"
}
```

步骤数据仍随 `assistant_message.message.steps` 落在 transcript 里，Renderer 重新 load 时再 materialize 成现有 `ChatSession`。

### Harness 持久化约束

从 Harness 视角，最少要保证下面几件事能落盘：

- 每次 assistant 产物都能关联回一次 `run`
- `steps` 顺序稳定，可按时间回放
- `awaiting_confirmation` 不能只存在内存里，至少要能恢复成 `interrupted approval notice`
- session 内事件流和 `audit.log` 能通过 `runId` 关联

当前阶段不强制单独引入 `runs/{runId}.json` 文件，但必须保证 session 数据已经足以恢复关键执行轨迹；`harness-runs.json` 只保存活动 run 现场，不冒充完整记忆系统。

### 写入策略

```
用户发消息 / Agent 回复完成
  → 防抖 1 秒（1 秒内多次变更合并为一次写入）
  → 写入临时文件 {sessionId}.json.tmp
  → rename 覆盖 {sessionId}.json（原子操作）
  → 更新 index.json（同样 tmp + rename）
```

`rename` 是文件系统层面的原子操作——要么成功替换，要么不变。不会出现写到一半断电导致文件损坏的情况。

### Agent streaming 期间不写入

Agent 正在执行时（`agent_start` → `agent_end` 之间），不触发会话保存。原因：
- streaming 期间数据变化极快（每个 delta 都在改 state）
- 中途保存的是不完整状态
- Agent 完成后统一保存一次

例外：如果用户强制关闭应用（`window.onbeforeunload`），立即保存当前状态作为应急。

## 14.4 凭证存储

```typescript
// credentials.json
{
  "anthropic": {
    "apiKey": "sk-ant-api03-xxxxx"
  },
  "openai": {
    "apiKey": "sk-xxxxx"
  },
  "ollama": {
    "baseUrl": "http://localhost:11434"
  }
}
```

### 安全措施

| 措施 | 说明 |
|------|------|
| 文件权限 | 创建时设置 `0600`（仅文件所有者可读写），Windows 用 ACL 等效设置 |
| 内存中不缓存明文 | Main Process 按需读取，用完丢弃；不存在全局变量里 |
| IPC 不传输明文 | `credentials:get` 返回遮罩版（`sk-ant-•••3kF`），只有 `credentials:set` 接收明文 |
| 不进入 git | workspace 配置目录下不存凭证；App Data 目录本身不在任何仓库内 |

### 为什么不用系统 Keychain？

macOS Keychain / Windows Credential Manager / Linux Secret Service 是更安全的方案，但：
- 跨平台 API 不统一，需要 `keytar` 等 native 依赖
- `keytar` 已停止维护，替代品尚不成熟
- 对于本地运行的开发工具，文件权限保护是可接受的安全级别

v1 用文件存储。后续如果有需求（如企业级安全要求），可以切换到系统 Keychain，只需替换 `credentials:get/set` 的实现。

## 14.5 设置存储

```typescript
// settings.json — 完整结构见 spec 13.7
{
  "defaultModelId": "builtin:anthropic:claude-sonnet-4-20250514",
  "thinkingLevel": "low",
  "theme": "light",
  "customTheme": null,
  "terminal": { "shell": "default", "fontSize": 13, "fontFamily": "JetBrains Mono", "scrollback": 5000 },
  "ui": { "fontSize": 14, "codeFontSize": 12, "codeFontFamily": "JetBrains Mono" },
  "workspace": "/Users/alice/projects/my-app"
}
```

**读取：** 应用启动时一次性读取，缓存在 Main Process 内存中。

**写入：** 用户在 Settings 页面修改后，合并更新（`Object.assign`）→ 写入文件。不用防抖——设置修改频率很低。

**缺失/损坏处理：** 文件不存在或 JSON 解析失败 → 使用默认值，不报错。下次保存时会自动创建正确格式的文件。

## 14.6 UI 状态存储

```typescript
// desktop-shell-state.json
{
  "window": {
    "width": 1400,
    "height": 900,
    "x": 100,
    "y": 50,
    "isMaximized": false
  },
  "ui": {
    "sidebarWidth": 260,
    "rightPanelOpen": true,
    "rightPanelWidth": 400,
    "rightPanelTab": "diff",
    "terminalOpen": false,
    "terminalHeight": 250
  }
}
```

窗口关闭时保存，下次打开时恢复。

## 14.7 记忆存储

详见 07-memory-architecture 和 09-rag-and-embedding。这里只定义文件格式：

### 当前实现：memdir

当前代码已经落地的是 `MEMORY.md + topics/*.md`：

- `MEMORY.md` 负责人类可读索引
- `topics/*.md` 负责按主题存详细正文
- prompt 注入时走关键词检索 + topic 片段提取

这套实现先把 `Memory System` 从概念层收成稳定代码边界，向量数据库仍属于后续阶段。

### topic 文件

```markdown
### 项目使用四层架构拆分
_source: agent | saved: 2026-04-08 15:24:00_

Harness Runtime / Context Engine / Memory System / Transcript Persistence
```

未来若切向量库，当前 memdir 仍保留为透明索引层。

## 14.8 日志

使用 `electron-log` 或简单的文件写入：

```typescript
// 日志级别
type LogLevel = "debug" | "info" | "warn" | "error";

// 日志格式
// [2025-06-15T10:30:00.123Z] [INFO] [agent-core] Agent 执行完成，共 5 步，耗时 12.3s
// [2025-06-15T10:30:01.456Z] [ERROR] [ipc] IPC handler 'chat:send' 抛出异常: ...
```

| 配置 | 值 |
|------|-----|
| 日志文件位置 | `${appData}/logs/` |
| 单文件上限 | 10MB，超过后轮转 |
| 保留天数 | 7 天，自动清理 |
| 默认级别 | `info`（可通过设置切到 `debug`） |
| 写入方式 | 追加写入，不影响性能 |

## 14.9 数据迁移

当前应用已从 `desktop-shell-state.json` 迁到多文件方案。后续迁移重点是：

```
应用启动
  → legacy session json 扁平文件迁移到 sessions/{id}/
  → legacy userData 目录迁移到 Chela 命名
  → interrupted approvals 与 harness-runs 分离持久化
```

迁移过程是幂等的——多次执行结果相同，不会重复创建。

## 14.10 备份与恢复

v1 不做自动备份 UI，但数据格式设计为易于手动备份：

- 所有数据都是 JSON/Markdown/SQLite，可以直接复制整个 App Data 目录
- `sessions/` 目录可以打包分享（不含凭证）
- `memory/raw/` 目录的 Markdown 文件人类可读，可以手动编辑

## 14.11 与其他 Spec 的接口

| 对接 Spec | 接口点 |
|-----------|--------|
| 03-agent-core | 会话 messages 的加载/保存 |
| 07-memory-architecture | 记忆的向量存储和原始文件 |
| 08-soul-files | Workspace 下 Soul / USER / AGENTS 文件 |
| 09-rag-and-embedding | memdir → 向量检索的未来升级接口 |
| 13-composer-and-settings | settings.json 和 credentials.json 的格式 |
| 15-security | credentials.json 的权限保护 |
