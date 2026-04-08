# Prompt Control Plane 蓝图

> 更新时间：2026-04-08 15:56:51
> 目的：把 prompt 从“几段字符串拼起来”收成“分层控制面”，后续实现按同一套边界推进。

## 1. 一句话

prompt 不是一大坨提示词。

prompt 应该分层，每层只管一类事情：

- 什么是永远不变的规则
- 什么是项目级长期规则
- 什么是当前环境真实能力
- 什么是长期记忆
- 什么是这条线程的续接信息
- 什么是这一轮临时补丁

如果这些东西混在一起，后面一定会出现：

- 项目规则和当前任务互相污染
- 历史摘要把长期规则冲掉
- 想接 memory、compact、sub-agent 时边界越做越糊

## 2. 核心原则

### 2.1 一层只做一件事

每一层都要回答一个明确问题，不准多管。

### 2.2 从稳定到动态

越稳定的内容越靠前，越临时的内容越靠后。

### 2.3 prompt 不是安全边界

approval、tool gate、policy、audit 仍然属于 Harness Runtime。

prompt 只能指导模型，不能代替运行时约束。

### 2.4 当前任务不要污染长期规则

“这轮先讨论方案，不要改代码”这种要求，只能是 turn patch，不能写回 workspace policy。

### 2.5 续接信息不是完整记忆系统

讨论记忆架构时，继续沿用既定术语：

- `run memory`：活动 run 现场
- `session memory`：当前线程续接快照
- `semantic memory`：跨线程长期语义记忆

## 3. 推荐分层

## 3.1 Platform Constitution

回答：

“你是谁？”
“你默认怎么说话？”
“你和 Harness 的关系是什么？”

应该放：

- 身份
- 默认语言
- 基本回复风格
- 工具调用总协议
- 不能绕过 Harness 的原则

不该放：

- 项目偏好
- 当前任务
- 线程摘要

## 3.2 Workspace Policy

回答：

“在这个仓库里，长期应该怎么干活？”

应该放：

- `.pi/SOUL.md`
- `.pi/USER.md`
- `.pi/AGENTS.md`
- 用户/项目的长期偏好与禁忌

不该放：

- 本轮临时要求
- 某次聊天的局部结论
- 动态 token 使用情况

## 3.3 Runtime Capability Manifest

回答：

“这次运行时，模型真实能做什么？”

应该放：

- 当前模型能力
- 是否支持图片
- 当前 shell 类型
- 已接入的工具/MCP 能力
- workspace/cwd 等运行事实

不该放：

- 人格描述
- 项目哲学
- 历史摘要

## 3.4 Semantic Memory

回答：

“系统按需检索到哪些长期相关记忆？”

应该放：

- T1 检索命中的短摘要
- 与当前 query 强相关的历史知识

不该放：

- 全量 transcript
- 当前线程全部消息
- 低相关、只会制造噪音的记忆

## 3.5 Session Continuity Snapshot

回答：

“这条线程现在做到哪了？”

应该放：

- 当前任务
- 关键决策
- 关键文件
- 未闭环事项
- 下一步建议
- 当前风险

不该放：

- 完整历史重放
- approval 现场
- 全量 tool logs

## 3.6 Turn Intent Patch

回答：

“这一轮额外要注意什么？”

应该放：

- 这轮是讨论、实现、review，还是排障
- 用户这轮临时强调的执行方式
- 只对本轮有效的约束

不该放：

- 长期偏好
- 持久记忆
- 项目总规则

## 4. 和当前架构的映射

| 层 | 当前落点 | 状态 |
|---|---|---|
| Platform Constitution | `src/main/agent.ts` 里的 `buildBaseSystemPrompt()` | 已有，但和运行事实混在一起 |
| Workspace Policy | `src/main/soul.ts` 读取 `.pi/SOUL.md + USER.md + AGENTS.md` | 已有，但当前仓库未实际提供 `.pi/` |
| Runtime Capability Manifest | 仍然混在 `buildBaseSystemPrompt()` 里 | 有内容，未独立成层 |
| Semantic Memory | `src/main/memory/service.ts` | 只有占位，未启用 |
| Session Continuity Snapshot | `src/main/context/service.ts` 的 snapshot 注入 | 已有，是当前最完整的一层 |
| Turn Intent Patch | 尚无显式层 | 缺失 |

## 5. 当前判断

当前项目不是“完全没分层”。

当前更准确的状态是：

- 已经有 `T0 / session snapshot / future T1 hook` 这条主干
- 但 prompt 仍然主要靠字符串拼接
- 还没有一个显式的 Prompt Assembler
- 还没有声明每层的优先级、来源、缓存范围、覆盖关系

所以现在的状态应定义为：

`有 prompt 分层意识，但还不是完整的 prompt control plane`

## 6. 后续实现目标

后续不再继续手写：

```ts
[base, soul, snapshot, memory].join("\\n\\n")
```

改为统一装配结构：

```ts
type PromptSection = {
  id: string;
  layer:
    | "constitution"
    | "workspace"
    | "runtime"
    | "semantic-memory"
    | "session"
    | "turn";
  priority: number;
  cacheScope: "stable" | "session" | "turn";
  content: string;
};
```

目标不是为了“更工程化而工程化”，而是为了明确：

- 每段 prompt 到底是谁生产的
- 每段 prompt 为什么在这里
- 哪些能缓存
- 哪些每轮都要重算
- 哪些能覆盖哪些

## 7. 推荐收敛顺序

### 7.1 第一步：补 Prompt Assembler

让 `src/main/agent.ts` 不再自己拼大字符串，只负责调用统一装配器。

### 7.2 第二步：拆出 Runtime Capability Layer

把“你是谁”和“当前能做什么”分开，避免人格和运行事实混写。

### 7.3 第三步：补 Turn Intent Patch

把“本轮先讨论/先 review/不要直接改”变成显式层，不再散落在用户消息理解里。

### 7.4 第四步：接实 Semantic Memory

让 T1 真正成为独立层，而不是继续塞回 context/service。

### 7.5 第五步：给装配链补元数据

至少补：

- `source`
- `layer`
- `priority`
- `cacheScope`

方便后续调试、可视化和审计。

## 8. 实施约束

- Harness policy 继续留在运行时，不回退成 prompt 自觉
- `session memory snapshot` 继续只负责续接，不冒充完整记忆系统
- `Turn Intent Patch` 不得写回 `.pi/*`
- `Workspace Policy` 不得塞进动态 usage 或 token 状态
- 没有充分理由，不新增更多“人格段落”

## 9. 最终结论

这份方案的重点不是“把 prompt 写更长”，而是把边界收清：

- 长期规则归长期规则
- 项目规则归项目规则
- 续接归续接
- 本轮补丁归本轮补丁

一句话：

`后续实现 prompt 时，优先做分层和装配，再做内容扩张。`
