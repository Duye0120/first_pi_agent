# T1 语义记忆系统重设计：memdir 架构

**时间**：2026-04-08 16:45:00
**范围**：src/main/memory/service.ts, src/main/tools/memory.ts

## 背景

原 T1 记忆系统是简单的 JSON 扁平存储 + keyword 搜索（`semantic-memory.json`），不符合 Claude Code 的 memdir 设计哲学。参考 harness-books chapter 5 的核心设计：

- MEMORY.md 是索引，不是日记本
- topic 文件承载高密度正文
- 硬限制防膨胀
- buildMemoryLines() 教模型保存纪律

## 改动

### src/main/memory/service.ts — 完全重写

**删除**：
- `FileBasedT1MemoryStore` 类（JSON 扁平存储）
- `T1MemoryEntry` / `T1MemoryQuery` / `T1MemoryHit` / `T1MemoryStore` 类型
- `semantic-memory.json` 持久化逻辑

**新增**：
- `MemdirStore` 类 — 基于文件系统的 memdir 实现
  - `save()` 二步法：写 topic 文件 → 更新 MEMORY.md 索引
  - `search()` 对索引 + topic 正文做关键词匹配
  - `listIndex()` / `listTopics()` / `readTopic()` 查询接口
  - `remove()` 删除索引条目
  - `getIndexContent()` 获取原始索引 markdown
- 硬限制常量：
  - `MAX_INDEX_LINES = 200` / `MAX_INDEX_BYTES = 25,000`
  - `MAX_TOPIC_FILE_BYTES = 50,000`
  - `MAX_PROMPT_SECTION_CHARS = 6,000`
  - `MAX_SEARCH_RESULTS = 8`
- `buildMemoryInstructions()` — 教模型如何正确保存记忆的 prompt section
- MEMORY.md 索引解析器 / 渲染器（`parseIndex` / `renderIndex`）
- topic 文件自动截断策略

**文件结构**：
```
${userData}/data/memory/
  MEMORY.md              ← 索引入口
  topics/
    preferences.md       ← 用户偏好
    architecture.md      ← 架构约定
    conventions.md       ← 项目惯例
    ...
```

**接口兼容**：
- `getSemanticMemoryPromptSection()` 签名不变，内部重写为：
  1. 总是注入记忆使用纪律（buildMemoryInstructions）
  2. 注入索引概览（截断到 30 行）
  3. 注入搜索命中结果（含 topic detail 预览）
- `getMemdirStore()` 替代 `getT1MemoryStore()`

### src/main/tools/memory.ts — 升级

**memory_save**：
- 新增 `topic` 参数（必填）：分类如 preferences / architecture / conventions
- 新增 `detail` 参数（可选）：详细补充内容
- 移除 `tags` 参数（topic 分类替代了标签）
- 调用 `MemdirStore.save()` 实现二步法写入

**memory_list**：
- 新增 `topic` 参数（可选）：指定时显示该 topic 详细内容
- 不指定时返回索引概览 + topic 列表

## 设计原则对齐

| Claude Code 原则 | 我们的实现 |
|---|---|
| MEMORY.md 是索引不是日记本 | ✅ parseIndex/renderIndex，每条记忆一行 |
| 入口有硬限制（200行/25KB） | ✅ enforceIndexLimits() |
| topic 文件承载高密度正文 | ✅ appendToTopicFile() |
| topic 文件有大小限制 | ✅ MAX_TOPIC_FILE_BYTES = 50KB |
| 保存二步法（写正文→更新索引） | ✅ save() 方法 |
| prompt 注入有预算 | ✅ MAX_PROMPT_SECTION_CHARS = 6000 |
| buildMemoryLines() 教模型纪律 | ✅ buildMemoryInstructions() |
| 不该保存临时信息 | ✅ 在纪律 prompt 中明确说明 |

## 类型检查

- `tsc --noEmit -p tsconfig.json` ✅
- `tsc --noEmit -p tsconfig.renderer.json` ✅
