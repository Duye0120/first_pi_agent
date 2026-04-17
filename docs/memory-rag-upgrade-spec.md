# Chela 记忆系统最终形态：RAG + 用户画像 + 主动感知

> 2026-04-17 16:00 | 作者：蟹蟹 | 状态：方案评审中

---

## 现状分析

Chela 已有记忆基础设施：
- **MemdirStore**（`memory/service.ts`）— 文件化 Markdown 存储，关键词搜索，prompt 注入
- **主动学习引擎**（`learning/engine.ts`）— 工具失败/用户拒绝累积阈值触发
- **每日反思**（`reflection/service.ts`）— 凌晨自动收集对话生成反思报告
- **自我诊断**（`self-diagnosis/service.ts`）— 监控 Agent 行为指标

**核心问题：**
1. 记忆是「被动写入」的 — 需要 Agent 主动调用 `memory_save`
2. 搜索是「关键词匹配」的 — 没有语义向量检索
3. 注入是「全量 dump」的 — 启动时灌前 20-30 行索引，不精准
4. 没有「用户画像」— 不会主动观察用户的语言习惯和偏好
5. 没有「主动感知」— 不会自动识别「这是一条值得记的偏好」

---

## 最终形态架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chela Memory System                       │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────┐  │
│  │  用户偏好    │    │  项目知识    │    │   行为模式库      │  │
│  │  Observer    │    │  Memdir      │    │   (learning)      │  │
│  │              │    │              │    │                   │  │
│  │ 自动识别偏好  │    │ topic 文件   │    │ 工具失败/纠正     │  │
│  │ 语言习惯记录  │    │ 索引+详情    │    │ 模式累积+衰减     │  │
│  │ 风格偏好追踪  │    │ 关键词搜索   │    │ 学习条目生成      │  │
│  └──────┬───────┘    └──────┬───────┘    └────────┬──────────┘  │
│         │                   │                      │             │
│         └───────────────────┼──────────────────────┘             │
│                             ▼                                    │
│                  ┌──────────────────────┐                        │
│                  │   Nowledge Mem 层     │                        │
│                  │   (向量检索 + 图谱)   │                        │
│                  │                      │                        │
│                  │ 语义搜索 / 向量嵌入   │                        │
│                  │ 关系推理 / 标签过滤   │                        │
│                  └──────────┬───────────┘                        │
│                             │                                    │
│         ┌───────────────────┼──────────────────────┐             │
│         ▼                   ▼                      ▼             │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐    │
│  │  动态检索   │    │  对话意图    │    │  反思/自省       │    │
│  │  (RAG)      │    │  识别器      │    │  (reflection)    │    │
│  │             │    │              │    │                  │    │
│  │ 按当前话题  │    │ 识别用户意图 │    │ 每日对话分析     │    │
│  │ 精准召回    │    │ 决定检索策略 │    │ 模式发现         │    │
│  │ 相关记忆    │    │ 控制注入量   │    │ 性格漂移检测     │    │
│  └──────┬──────┘    └──────┬───────┘    └────────┬─────────┘    │
│         │                  │                      │              │
│         └──────────────────┼──────────────────────┘              │
│                             ▼                                    │
│              ┌──────────────────────────────┐                    │
│              │   Prompt 动态组装层          │                    │
│              │   (prompt-control-plane.ts)  │                    │
│              │                              │                    │
│              │ semantic-memory 层精准注入   │                    │
│              │ 只注入与当前话题相关的记忆    │                    │
│              └──────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: 用户偏好观察器（User Preference Observer）

**目标：** 在对话中自动识别并保存用户偏好，不再需要手动调用 `memory_save`。

### 1.1 偏好识别规则

Agent 在每轮对话中扫描以下模式：

| 模式 | 示例 | 提取的偏好 |
|------|------|------------|
| 明确否定 | "不要用 X"、"别再用 Y 了" | `anti: "X", category: "tool"` |
| 明确偏好 | "我更喜欢 X"、"习惯用 Y" | `preference: "X", category: "style"` |
| 重复纠正 | 同一件事被纠正 2+ 次 | `correction_pattern: "..."` |
| 工作流约定 | "如无必要不要 build" | `convention: "no_build_unless_needed"` |
| 情绪信号 | 对某方案强烈不满/满意 | `emotional_response: "negative/positive"` |

### 1.2 实现方式

**文件：** `src/main/memory/preference-observer.ts`

```typescript
export interface PreferenceRule {
  type: "anti" | "preference" | "convention" | "correction" | "style";
  category: string;  // "tool" | "ui" | "style" | "workflow" | "communication"
  pattern: string;    // 触发的关键词/模式
  content: string;    // 存储的具体偏好描述
  source: "explicit" | "inferred" | "correction";
  confidence: number; // 0-1，explicit=1.0, inferred=0.6
  timesObserved: number;
  lastSeen: number;
}

export class PreferenceObserver {
  private rules: Map<string, PreferenceRule> = new Map();
  private correctionCounts: Map<string, number> = new Map();

  /** 扫描用户消息，识别偏好信号 */
  scanMessage(text: string, sessionId: string): PreferenceRule[] {
    const signals: PreferenceRule[] = [];

    // 模式 1: 明确否定
    const antiPatterns = [
      /不?[要别]用\s*(\S+)/,           // "不要用 X"
      /别.*(\S+?)了/,                    // "别再用 X 了"
      /不.*(\S+?)(就行|好了|可以)/,      // "不要 X 就行"
    ];
    for (const pattern of antiPatterns) {
      const match = text.match(pattern);
      if (match) {
        signals.push({
          type: "anti",
          category: this.inferCategory(match[1]),
          pattern: match[1],
          content: `用户明确表示不要使用 "${match[1]}"`,
          source: "explicit",
          confidence: 0.9,
          timesObserved: 1,
          lastSeen: Date.now(),
        });
      }
    }

    // 模式 2: 明确偏好
    const prefPatterns = [
      /(我)?(喜欢|偏好|习惯|习惯用)\s*(\S+)/,
      /默认用\s*(\S+)/,
      /(优先|首选)\s*(\S+)/,
    ];
    for (const pattern of prefPatterns) {
      const match = text.match(pattern);
      if (match) {
        signals.push({
          type: "preference",
          category: this.inferCategory(match[2] || match[3]),
          pattern: match[2] || match[3],
          content: `用户偏好使用 "${match[2] || match[3]}"`,
          source: "explicit",
          confidence: 0.9,
          timesObserved: 1,
          lastSeen: Date.now(),
        });
      }
    }

    // 模式 3: 工作流约定（特殊句式）
    const conventionPatterns = [
      /如无必要.*不?要?\s*(\S+)/,        // "如无必要不要 build"
      /除非.*否则.*不/,                    // "除非 X 否则不 Y"
      /默认.*不/,                          // "默认不要 X"
    ];
    for (const pattern of conventionPatterns) {
      const match = text.match(pattern);
      if (match) {
        signals.push({
          type: "convention",
          category: "workflow",
          pattern: match[0],
          content: `工作流约定: ${match[0]}`,
          source: "explicit",
          confidence: 0.85,
          timesObserved: 1,
          lastSeen: Date.now(),
        });
      }
    }

    return signals;
  }

  /** 将高置信度偏好写入记忆 */
  async commit(signal: PreferenceRule): Promise<void> {
    // 置信度 >= 0.8 的立即写入
    // 0.5-0.8 的累积 2 次再写入
    // < 0.5 的暂存观察
    const key = `${signal.type}:${signal.pattern}`;
    const existing = this.rules.get(key);

    if (existing) {
      existing.timesObserved++;
      existing.lastSeen = Date.now();
    } else {
      this.rules.set(key, signal);
    }

    const current = existing || signal;

    // 写入条件
    const shouldCommit =
      current.confidence >= 0.8 ||
      (current.confidence >= 0.5 && current.timesObserved >= 2);

    if (shouldCommit) {
      const store = getMemdirStore();
      store.save({
        summary: `[用户偏好] ${current.content}`,
        topic: "preferences",
        detail: `类型: ${current.type}\n分类: ${current.category}\n触发模式: ${current.pattern}\n观察次数: ${current.timesObserved}`,
        source: "user",
      });
    }
  }

  /** 推断偏好类别 */
  private inferCategory(text: string): string {
    const toolKeywords = ["build", "check", "npm", "pnpm", "git", "docker"];
    const uiKeywords = ["border", "shadow", "color", "padding", "margin", "按钮", "图标"];
    const styleKeywords = ["语气", "风格", "格式", "表情", "emoji"];

    if (toolKeywords.some(k => text.includes(k))) return "tool";
    if (uiKeywords.some(k => text.includes(k))) return "ui";
    if (styleKeywords.some(k => text.includes(k))) return "communication";
    return "general";
  }
}
```

### 1.3 集成点

在 `context/engine.ts` 的 `buildContextSystemPrompt` 中：

```typescript
// 每轮对话开始前扫描用户消息
const observer = getPreferenceObserver();
const signals = observer.scanMessage(input.latestUserText || "", input.sessionId);
for (const signal of signals) {
  await observer.commit(signal);
}
```

---

## Phase 2: Nowledge Mem 向量检索集成

**目标：** 用 Nowledge Mem 的向量搜索替代纯关键词搜索，实现语义级别的精准召回。

### 2.1 为什么选 Nowledge Mem

- 已经在跑（端口 14242），不需要额外部署
- 自带向量嵌入（BM25 + Vector 混合搜索）
- 有标签系统和关系图谱能力
- 已有 Hermes 插件集成经验

### 2.2 集成方案

**文件：** `src/main/memory/nowledge-bridge.ts`

```typescript
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

// 通过 nmem CLI 调用向量搜索
export class NowledgeBridge {
  private nmemPath: string;

  constructor() {
    // WSL 环境下用系统 Python 调用 nmem
    this.nmemPath = "/usr/bin/python3 -c \"from nmem_cli import main; main()\"";
  }

  /** 语义搜索记忆 */
  async searchSemantic(query: string, limit: number = 5): Promise<MemoryResult[]> {
    try {
      const { stdout } = await execAsync(
        `${this.nmemPath} --json m search "${query}" -n ${limit} --mode deep`
      );
      const result = JSON.parse(stdout);
      return result.memories.map((m: any) => ({
        id: m.id,
        content: m.content,
        title: m.title,
        score: m.score,
        labels: m.labels || [],
        source: m.source,
      }));
    } catch {
      // 回退到关键词搜索
      return [];
    }
  }

  /** 保存记忆到 Nowledge Mem */
  async save(content: string, title: string, labels: string[] = []): Promise<boolean> {
    try {
      const labelsArg = labels.map(l => `-l "${l}"`).join(" ");
      await execAsync(
        `${this.nmemPath} --json m add "${content}" -s hermes -t "${title}" ${labelsArg}`
      );
      return true;
    } catch {
      return false;
    }
  }

  /** 按标签过滤检索 */
  async searchByLabels(labels: string[], limit: number = 5): Promise<MemoryResult[]> {
    try {
      const labelsArg = labels.map(l => `-l "${l}"`).join(" ");
      const { stdout } = await execAsync(
        `${this.nmemPath} --json m search "*" -n ${limit} ${labelsArg}`
      );
      const result = JSON.parse(stdout);
      return result.memories.map((m: any) => ({
        id: m.id,
        content: m.content,
        title: m.title,
        score: m.score,
        labels: m.labels || [],
      }));
    } catch {
      return [];
    }
  }
}
```

### 2.3 混合检索策略

```typescript
// 升级后的 getSemanticMemoryPromptSection
export async function getSemanticMemoryPromptSection(input: {
  sessionId: string;
  query: string | null;
}): Promise<string> {
  const query = input.query?.trim();

  if (!query) {
    // 冷启动：注入记忆使用纪律 + 少量索引概览
    return buildColdStartSection();
  }

  // 1. 向量检索（Nowledge Mem）
  const bridge = new NowledgeBridge();
  const semanticResults = await bridge.searchSemantic(query, 5);

  // 2. 关键词检索（本地 memdir 兜底）
  const keywordResults = memdirStore.search(query);

  // 3. 合并去重
  const merged = mergeResults(semanticResults, keywordResults);

  // 4. 构建 prompt section
  return buildRetrievedSection(merged);
}
```

---

## Phase 3: 动态 RAG 检索链路

**目标：** 根据对话意图自动决定检索策略和注入量，实现精准 RAG。

### 3.1 意图识别器

**文件：** `src/main/memory/intent-detector.ts`

```typescript
export type IntentType =
  | "coding"           // 写代码/改代码
  | "debugging"        // 排查问题
  | "planning"         // 方案讨论
  | "review"           // 代码审查
  | "chat"             // 日常聊天
  | "ui_work"          // 前端/UI 改动
  | "devops"           // 部署/运维
  | "learning";        // 学习/调研

export interface IntentResult {
  type: IntentType;
  confidence: number;
  keywords: string[];
  retrievalStrategy: RetrievalStrategy;
}

export interface RetrievalStrategy {
  // 检索哪些标签的记忆
  labelFilters: string[];
  // 最大注入条数
  maxItems: number;
  // 是否注入用户偏好
  includePreferences: boolean;
  // 是否注入项目约定
  includeConventions: boolean;
}

const INTENT_STRATEGIES: Record<IntentType, RetrievalStrategy> = {
  coding: {
    labelFilters: ["label_conventions", "label_workflow", "label_tool"],
    maxItems: 5,
    includePreferences: true,
    includeConventions: true,
  },
  debugging: {
    labelFilters: ["label_errors", "label_learnings", "label_troubleshooting"],
    maxItems: 8,
    includePreferences: false,
    includeConventions: true,
  },
  ui_work: {
    labelFilters: ["label_ui", "label_design", "label_preferences"],
    maxItems: 6,
    includePreferences: true,
    includeConventions: true,
  },
  planning: {
    labelFilters: ["label_architecture", "label_planning"],
    maxItems: 4,
    includePreferences: true,
    includeConventions: false,
  },
  // ... 其他意图
};
```

### 3.2 检索决策流程

```
用户发消息
    │
    ▼
意图识别器 (关键词 + 简单分类)
    │
    ▼
确定检索策略 (标签过滤 + 最大条数)
    │
    ▼
Nowledge Mem 向量搜索 (带标签过滤)
    │
    ▼
本地 memdir 兜底检索
    │
    ▼
合并去重 → 排序 → 截断
    │
    ▼
注入 semantic-memory 层
```

---

## Phase 4: 用户画像构建

**目标：** 基于长期观察积累用户的完整画像，让 Agent 越来越懂老板。

### 4.1 画像数据结构

**文件：** `src/main/memory/user-profile.ts`

```typescript
export interface UserProfile {
  // 基本信息
  identity: {
    name?: string;
    role?: string;         // 如 "软件工程师"
    timezone?: string;
  };

  // 技术偏好
  tech: {
    preferredLanguages: string[];    // ["TypeScript", "Python"]
    preferredTools: string[];        // ["pnpm", "Copilot", "Codex"]
    avoidedTools: string[];          // ["npm"]
    preferredModels: string[];       // ["qwen3.6-plus"]
    workflowConventions: string[];   // ["如无必要不要 build"]
  };

  // UI/设计偏好
  design: {
    preferredStyles: string[];       // ["不要习惯性加 border", "用颜色分层"]
    avoidedPatterns: string[];       // ["厚重外框", "多余 shadow"]
    componentConventions: string[];  // ["选中态统一底色"]
  };

  // 沟通偏好
  communication: {
    language: string;                // "中文"
    tone: string;                    // "直接，不要太假"
    detailLevel: "brief" | "normal" | "detailed";
    noFluff: boolean;                // 不要废话
  };

  // 行为模式
  patterns: {
    peakHours: string[];            // 活跃时间段
    commonTopics: string[];          // 常讨论的主题
    recurringCorrections: string[];  // 反复纠正的事项
    frustrationTriggers: string[];   // 容易踩坑的点
  };

  // 生活偏好（可选，需要用户授权）
  lifestyle: {
    mealPreferences?: string;
    healthGoals?: string;
    hobbies?: string[];
  };

  // 元数据
  updatedAt: string;
  observationCount: number;
  confidenceScores: Record<string, number>;
}
```

### 4.2 画像更新机制

```typescript
export class UserProfileBuilder {
  private profile: UserProfile;

  // 每日反思时更新画像
  async updateFromReflection(report: ReflectionReport): Promise<void> {
    // 分析当天的对话模式
    for (const pattern of report.patterns) {
      this.detectAndApplyPattern(pattern);
    }

    // 分析性格漂移
    for (const drift of report.personalityDrift) {
      this.updateCommunicationPreference(drift);
    }

    // 保存画像
    await this.persist();
  }

  // 实时从对话中更新
  async updateFromConversation(
    userMessage: string,
    assistantResponse: string,
    outcome: "accepted" | "rejected" | "corrected"
  ): Promise<void> {
    if (outcome === "corrected") {
      this.recordCorrection(userMessage, assistantResponse);
    }

    if (outcome === "rejected") {
      this.recordRejection(userMessage);
    }
  }
}
```

---

## Phase 5: Prompt 动态注入升级

**目标：** semantic-memory 层从「全量 dump」升级为「精准注入」。

### 5.1 当前问题

现在的 `buildSemanticMemorySection` 注入的是：
- 记忆使用纪律（固定）
- 索引概览前 20-30 行（全量）
- 搜索结果（有 query 时才触发）

**问题：** 不管用户在聊什么，都灌一堆不相关的记忆。

### 5.2 升级方案

```typescript
// context/engine.ts 中的改动
export async function buildContextSystemPrompt(input: BuildContextSystemPromptInput) {
  // 1. 识别用户意图
  const intent = detectIntent(input.latestUserText || "");

  // 2. 根据意图选择检索策略
  const strategy = INTENT_STRATEGIES[intent.type];

  // 3. 精准检索
  const memories = await retrieveMemories({
    query: input.latestUserText || "",
    labels: strategy.labelFilters,
    limit: strategy.maxItems,
    includePreferences: strategy.includePreferences,
    includeConventions: strategy.includeConventions,
  });

  // 4. 构建 section
  const semanticSection = buildSemanticMemorySection(memories);

  // ... 组装完整 prompt
}
```

### 5.3 注入格式

```markdown
## 相关记忆（已按当前话题过滤）

### 用户偏好
- 老板偏好用 Codex CLI 写逻辑，Copilot 写 UI
- 如无必要不要 build，不要习惯性 check
- UI 设计偏好：颜色分层 > border，不要厚重外框

### 项目约定
- Chela 使用四层架构拆分
- AGENTS.md 是核心约束文档
- 提交信息用中文

### 近期学习
- 工具 browser_navigate 需要 timeout 调到 120s
- Copilot CLI 在 WSL 下要用 ACP 模式而非 -p 模式
```

---

## 文件结构

```
src/main/
├── memory/
│   ├── service.ts                    # 现有 MemdirStore（保留）
│   ├── preference-observer.ts        # 新增：偏好观察器
│   ├── nowledge-bridge.ts            # 新增：Nowledge Mem 桥接
│   ├── intent-detector.ts            # 新增：意图识别
│   ├── user-profile.ts               # 新增：用户画像
│   └── retrieval-strategies.ts       # 新增：检索策略配置
├── network/
│   └── proxy.ts                      # 新增：全局代理设置
├── learning/
│   ├── engine.ts                     # 现有主动学习（保留）
│   └── profile-updater.ts            # 新增：画像更新器
├── context/
│   ├── engine.ts                     # 修改：加入意图识别和动态检索
│   └── snapshot.ts                   # 微调：配合新记忆系统
└── settings.ts                       # 修改：新增 network 配置

src/shared/
└── contracts.ts                      # 修改：Settings 类型新增 network 字段

src/renderer/src/components/settings/
└── NetworkSettings.tsx               # 新增：网络设置 UI
```

---

## 实施顺序（Codex AI Agent 估算）

> 以下时间为 Codex AI Agent 估算，非人工开发时间。

1. **Phase 1** — 用户偏好观察器（~30-45 分钟）
   - 模式匹配 + 自动保存到 memdir
   - 置信度 + 累积写入逻辑

2. **Phase 2** — Nowledge Mem 桥接（~20-30 分钟）
   - nmem CLI 封装
   - 向量搜索 + 标签过滤

3. **Phase 3** — 意图识别 + 检索策略（~30-45 分钟）
   - 关键词意图分类
   - 检索策略路由

4. **Phase 4** — 用户画像构建（~45-60 分钟）
   - 画像数据结构
   - 从反思报告 + 对话实时更新

5. **Phase 5** — Prompt 动态注入升级（~30-45 分钟）
   - context/engine.ts 改造
   - semantic-memory 层精准注入

6. **Phase 6** — 网络代理支持（~20-30 分钟）
   - undici ProxyAgent 全局代理
   - Settings 扩展 + 热切换
   - 可选：UI 网络设置面板

**预估总工期：** 3-4 小时（Codex 串行执行）

**建议执行策略：**
- **Phase 6（代理）最优先** — 这是基础设施，建议第一个做。没有代理的话 web_search 和 web_fetch 在国内根本用不了，其他 Phase 的效果也会受影响
- **Phase 1→2→3** 做基础记忆能力
- **Phase 4→5** 做上层应用

每 Phase 完成后人工验证一次再继续下一个。

---

## Phase 6: 网络代理支持（Proxy）

**目标：** 让 Chela 的所有 HTTP/HTTPS 请求（搜索、抓取、LLM API 调用）都能走代理，解决国内网络环境问题。

### 6.1 现状分析

Chela 目前**完全没有代理支持**：
- `web_fetch` — 使用 Node.js 原生 `fetch()`，不走代理
- `web_search` — 使用 Node.js 原生 `fetch()`，不走代理
- LLM API 调用（`pi-ai` / `pi-agent-core`）— 同样使用原生 `fetch()`

**关键问题：** Node.js 原生 `fetch`（基于 undici）**不自动读取** `HTTP_PROXY` / `HTTPS_PROXY` 环境变量。这意味着即使系统配了代理，Chela 的请求也全部直连。

### 6.2 技术方案

**核心思路：** 在 Chela 启动时用 `undici` 的 `setGlobalDispatcher` + `ProxyAgent` 设置全局代理，所有 `fetch()` 调用自动生效。

#### 6.2.1 安装 undici

```bash
pnpm add undici
```

#### 6.2.2 Settings 扩展

**文件：** `src/shared/contracts.ts` — Settings 类型

```typescript
export type Settings = {
  // ... 现有字段 ...
  network: {
    proxy: {
      enabled: boolean;
      url: string;           // 如 "http://127.0.0.1:7890"
      noProxy?: string;      // 逗号分隔的不走代理域名，如 "localhost,127.0.0.1"
    };
    timeoutMs: number;       // 全局请求超时，默认 30000
  };
};
```

**文件：** `src/main/settings.ts` — 默认值

```typescript
const DEFAULT_SETTINGS: Settings = {
  // ... 现有字段 ...
  network: {
    proxy: {
      enabled: false,
      url: "",
      noProxy: "localhost,127.0.0.1",
    },
    timeoutMs: 30000,
  },
};
```

#### 6.2.3 代理初始化

**文件：** `src/main/network/proxy.ts`（新建）

```typescript
import { ProxyAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import { getSettings } from "../settings.js";
import { appLogger } from "../logger.js";

export function setupGlobalProxy(): void {
  const settings = getSettings();
  const { proxy } = settings.network;

  if (!proxy.enabled || !proxy.url) {
    appLogger.info({ scope: "proxy", message: "代理未启用，所有请求直连" });
    return;
  }

  try {
    const dispatcher = new ProxyAgent({
      uri: proxy.url,
      // noProxy 支持
      noProxy: proxy.noProxy
        ? proxy.noProxy.split(",").map(s => s.trim()).filter(Boolean)
        : [],
    });

    setGlobalDispatcher(dispatcher);
    appLogger.info({ scope: "proxy", message: `全局代理已启用: ${proxy.url}` });
  } catch (err) {
    appLogger.error({
      scope: "proxy",
      message: "代理设置失败",
      error: err instanceof Error ? err : new Error(String(err)),
    });
  }
}

/** 运行时动态更新代理（Settings 变更后调用） */
export function updateGlobalProxy(): void {
  // 先恢复默认 dispatcher
  // 注意：undici 没有直接的"重置"API，需要新建一个空 dispatcher
  const defaultDispatcher = new (getGlobalDispatcher().constructor as any)();
  setGlobalDispatcher(defaultDispatcher);

  // 然后重新设置
  setupGlobalProxy();
}
```

#### 6.2.4 启动时调用

**文件：** `src/main/index.ts` 或 `src/main/bootstrap/index.ts`

```typescript
import { setupGlobalProxy } from "./network/proxy.js";

// 在 Electron app.whenReady() 之后调用
setupGlobalProxy();
```

#### 6.2.5 Settings 变更监听

**文件：** `src/main/settings.ts`

```typescript
// 在 update() 方法中，当 network.proxy 变更时触发
import { updateGlobalProxy } from "./network/proxy.js";

export async function updateSettings(partial: Partial<Settings>): Promise<void> {
  // ... 现有保存逻辑 ...

  if (partial.network?.proxy) {
    updateGlobalProxy();
  }
}
```

#### 6.2.6 UI 设置入口

**文件：** `src/renderer/src/components/settings/NetworkSettings.tsx`（新建）

```tsx
// Settings 面板新增「网络」tab
// - 代理开关（Toggle）
// - 代理地址（Input，placeholder: "http://127.0.0.1:7890"）
// - 不走代理域名（Input，placeholder: "localhost,127.0.0.1"）
// - 测试按钮（发一个 GET 到 google.com 验证代理是否生效）
```

### 6.3 覆盖范围

| 请求类型 | 是否自动走代理 | 说明 |
|----------|---------------|------|
| `web_fetch` 工具 | ✅ 是 | Node 原生 fetch 走全局 dispatcher |
| `web_search` 工具 | ✅ 是 | 同上 |
| LLM API 调用 | ✅ 是 | pi-ai 内部也用 fetch，走全局 dispatcher |
| MCP Server 连接 | ⚠️ 需确认 | WebSocket 连接可能需要单独处理 |
| 图片/文件下载 | ✅ 是 | 只要用 fetch 的都生效 |
| Electron 内部请求 | ❌ 否 | 不影响 Electron 自身的更新检查等 |

### 6.4 注意事项

1. **SOCKS5 代理** — undici 的 `ProxyAgent` 目前只支持 HTTP/HTTPS 代理，不支持 SOCKS5。如果用户用 clash/v2ray 的 SOCKS5 端口，需要改成 HTTP 端口（大部分工具同时提供两种）

2. **认证代理** — 如果代理需要用户名密码，URL 格式为 `http://user:pass@127.0.0.1:7890`

3. **LLM API 不走代理** — 有些情况是国内模型（DashScope）不需要代理，但搜索需要。`noProxy` 可以配置为 `dashscope.aliyuncs.com,127.0.0.1,localhost`

4. **热切换** — 用户改了代理设置后，`setGlobalDispatcher` 会立刻生效，不需要重启 Chela

---

## 与现有系统的兼容性

| 现有组件 | 状态 | 说明 |
|----------|------|------|
| MemdirStore | 保留 | 作为本地缓存和兜底检索 |
| learning/engine.ts | 保留 | 继续监听工具失败信号 |
| reflection/service.ts | 保留 + 增强 | 新增画像更新调用 |
| self-diagnosis/service.ts | 保留 | 不变 |
| memory/tools | 保留 | memory_save 仍然可用 |

**向后兼容：** 所有改动是增量式的，不破坏现有记忆数据。旧的 MEMORY.md 和 topics/ 文件继续可用。

---

## 参考资源

- Chela 现有记忆系统：`src/main/memory/service.ts`
- Nowledge Mem 服务：`http://127.0.0.1:14242`
- Chela Prompt 组装：`src/main/prompt-control-plane.ts`
- Chela Context Engine：`src/main/context/engine.ts`
