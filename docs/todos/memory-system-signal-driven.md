# 类人记忆系统：信号驱动设计

状态：设计中（草案）
创建：2026-04-25
来源：与用户讨论"如何让 agent 像人类一样自动管理记忆"

## 核心问题

不能靠枚举边界场景（吵架、工具失败、用户偏好…）一条条写规则——现实边界是无限的。
需要把"我得记下来"这个瞬间收敛到**少数几个通用信号通道**。

## 人类记忆触发的 4 类原始信号

| 人类信号 | 神经机制 | Agent 等价物 |
|---|---|---|
| 情绪冲击（吵架、惊喜、羞愧） | 杏仁核标记，海马增强编码 | 用户文本情绪极性 + 强度 |
| 预测违背（以为会成功却失败） | 多巴胺误差信号 | 工具结果 vs 预期 diff |
| 重复出现（这个事第 3 次了） | 长时程增强（LTP） | (意图, 行为) 模式频次 |
| 显式标记（"记住啊！"） | 主动注意编码 | 用户/系统的"注意"指令 |

## Chela 现状对照

| 信号通道 | 现状 | 缺口 |
|---|---|---|
| 情绪冲击 | `src/main/emotional/` 状态机存在，但只改 agent 模式 | 情绪 spike 没接到 memory_save |
| 预测违背 | `src/main/learning/engine.ts` 抓工具失败/拒绝，3 次入库 | 阈值固定，没有"预测置信度"维度 |
| 重复出现 | learning 阈值=3，仅限工具 | 用户偏好/对话模式没用上 |
| 显式标记 | 仅靠 system prompt 教 agent 自觉 | 没有专门的"用户语气检测器" |

## 收敛方案：统一的「记忆候选事件总线」

```
所有信号源 → MemoryCandidateEvent → 评分器 → 阈值过滤 → memory_save
```

### 1. 信号源（每个只发事件，不判断）

- **EmotionalSpikeDetector**：在现有 `src/main/emotional/` 加 hook，强情绪文本产 candidate
- **PredictionMismatchDetector**：让 agent 在 tool_call 前 emit `expected_outcome`，事后比对
- **RepetitionDetector**：基于 `event-bus` 的 audit log，对 (用户意图, 行为) 二元组做滑动窗口计数
- **ExplicitMarker**：正则 + 小模型识别"记住"、"下次别"、"我喜欢"、"以后都"

### 2. 评分器（一个函数，不是一堆 if）

```ts
score = w1*emotionIntensity
      + w2*predictionError
      + w3*log(frequency)
      + w4*explicitness
      - w5*recencyDecay
      - w6*similarToExisting
```

- 高分 → 自动 `memory_save`
- 中分 → 下一轮 system prompt 里给 agent 看"候选记忆 X，要不要保存？"，agent 决定
- 低分 → 丢弃但保留 7 天，等是否再次出现

### 3. 阈值是学出来的，不是写死的

- 用户每次手动删除一条自动保存的记忆 → 全局阈值 +0.05
- 用户从未删除过类型 T 的记忆 → 类型 T 阈值 -0.05
- 真正的"主动学习"：学的不是工具，是**什么值得记**

## 案例验证

### 吵架例子
- 用户消息情绪强度 0.9，含"她"+负面动词
- → EmotionalSpike candidate
- → 评分 0.85 → 自动入库 `relationships.partner_dislikes`
- summary 由小模型从对话上下文抽
- **无需任何"吵架场景"代码**

### grep vs rg 例子
- 每次 grep 调用记录耗时 + "用户后续是否换工具"
- 第 4 次时 RepetitionDetector 看到 (代码搜索, grep, 用户改用rg) 频次=3
- → 评分 0.7 → 入库 `tooling.search_preference: 此项目优先 rg`
- **无需"识别 grep 慢"的硬编码**，只需识别用户的修正动作

## 落地优先级

1. **先抽 `MemoryCandidateBus`**（`src/main/memory/candidate-bus.ts`），统一事件结构：
   ```ts
   { kind, payload, signals: { emotion?, predictionError?, frequency?, explicitness? }, sourceRunId }
   ```
2. **把现有 `active-learning` 改造成订阅者**，不再直接 memory_save，改 emit candidate
3. **加 ExplicitMarker**（ROI 最高，正则 + 小模型分类覆盖一大半场景）
4. **加 EmotionalSpike → candidate**（情绪状态机已有，接线即可）
5. **PredictionMismatch 最难放最后**：tool_call 前 emit expected_outcome，工具回来对比
6. **删除即降权**：UI "删除一条记忆"时记原因（不重要/已过时/隐私），喂评分器

## 涉及现有代码

- `src/main/memory/service.ts` — buildMemoryInstructions、scheduleAutoMemorySummarize
- `src/main/learning/engine.ts` — 改造成 candidate 发射器
- `src/main/emotional/` — 加 spike → candidate 桥
- `src/main/event-bus.ts` — 候选总线挂这上面
- `src/main/tools/memory.ts` — memory_save 仍是最终落地点
- `src/main/chat/finalize.ts` — 自动总结链路保留，但走候选评分

## 关键认知

> "一直写边界情况吗？现实中的边界太多了"

**对，所以不要写边界。** 写**信号检测器**和**评分函数**。
- 边界数量是 O(N)
- 信号通道是 O(1)
- 这正是 ML 系统替代 rule engine 的根本原因
- 本质上是一个"是否值得记忆"的小型分类器，特征工程是显式可解释的
