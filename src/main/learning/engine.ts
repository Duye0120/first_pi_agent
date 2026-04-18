// ---------------------------------------------------------------------------
// Active Learning Engine — 从工具失败和用户纠正中自动学习
// ---------------------------------------------------------------------------
//
// 信号检测 → 阈值判断 → 生成学习条目 → 写入 semantic memory
// 学习结果在下次 prompt 注入时自动携带，改变 Agent 行为。
// ---------------------------------------------------------------------------

import { bus } from "../event-bus.js";
import { getMemdirStore } from "../memory/service.js";
import { appLogger } from "../logger.js";
import { scheduler } from "../scheduler.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LearningSignalType =
  | "tool_repeated_failure"
  | "user_correction"
  | "retry_after_reject"
  | "pattern_inefficiency"
  | "tool_discovery_opportunity"
  | "tool_misuse_pattern";

interface LearningSignal {
  type: LearningSignalType;
  toolName: string;
  message: string;
  sessionId: string;
  timestamp: number;
}

interface SignalAccumulator {
  count: number;
  lastSeen: number;
  samples: string[];
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SIGNAL_THRESHOLD = 3;
const MAX_SAMPLES_PER_SIGNAL = 5;
const MAX_LEARNINGS = 50;
const SIGNAL_DECAY_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// tool_failure 按 toolName 聚合
const failureAccum = new Map<string, SignalAccumulator>();
// rejection 按 toolName 聚合
const rejectionAccum = new Map<string, SignalAccumulator>();
// 已产出的学习记录（避免重复）
const producedLearnings = new Set<string>();

// ---------------------------------------------------------------------------
// Signal Collection — 通过 Event Bus 被动收集
// ---------------------------------------------------------------------------

function onToolFailed(data: { toolName: string; toolCallId: string; error: string; sessionId: string }): void {
  const key = data.toolName;
  const accum = failureAccum.get(key) ?? { count: 0, lastSeen: 0, samples: [] };
  accum.count++;
  accum.lastSeen = Date.now();
  if (accum.samples.length < MAX_SAMPLES_PER_SIGNAL) {
    accum.samples.push(data.error.slice(0, 200));
  }
  failureAccum.set(key, accum);

  // 实时检查是否达到阈值
  if (accum.count >= SIGNAL_THRESHOLD && !producedLearnings.has(`failure:${key}`)) {
    void processSignal({
      type: "tool_repeated_failure",
      toolName: key,
      message: `工具 ${key} 连续失败 ${accum.count} 次。常见错误: ${accum.samples[0]}`,
      sessionId: data.sessionId,
      timestamp: Date.now(),
    });
  }
}

function onApprovalResolved(data: { requestId: string; allowed: boolean; sessionId: string; runId: string }): void {
  if (data.allowed) return;

  // 从 requestId 提取 toolName（格式：toolName-hash）
  const toolName = data.requestId.split("-")[0] || "unknown";
  const key = toolName;
  const accum = rejectionAccum.get(key) ?? { count: 0, lastSeen: 0, samples: [] };
  accum.count++;
  accum.lastSeen = Date.now();
  rejectionAccum.set(key, accum);

  if (accum.count >= SIGNAL_THRESHOLD && !producedLearnings.has(`reject:${key}`)) {
    void processSignal({
      type: "retry_after_reject",
      toolName: key,
      message: `工具 ${key} 被用户拒绝 ${accum.count} 次，Agent 应考虑替代方案或减少使用`,
      sessionId: data.sessionId,
      timestamp: Date.now(),
    });
  }
}

// ---------------------------------------------------------------------------
// Signal Processing — 达到阈值后生成学习条目
// ---------------------------------------------------------------------------

async function processSignal(signal: LearningSignal): Promise<void> {
  const learningKey = `${signal.type}:${signal.toolName}`;
  if (producedLearnings.has(learningKey)) return;

  try {
    const store = getMemdirStore();

    // 生成学习摘要
    let summary: string;
    let detail: string;

    switch (signal.type) {
      case "tool_repeated_failure":
        summary = `工具 ${signal.toolName} 连续失败，执行前先校验参数并准备替代方案`;
        detail = [
          `动作建议：调用 ${signal.toolName} 前先确认参数完整、格式正确、目标资源存在。`,
          `失败信号：${signal.message}`,
          `推荐动作：优先补参数校验；风险高时直接选择替代工具或调整方案。`,
        ].join("\n");
        break;

      case "retry_after_reject":
        summary = `工具 ${signal.toolName} 常被用户拒绝，先说明影响再决定是否调用`;
        detail = [
          `动作建议：调用 ${signal.toolName} 前先说明原因、影响和替代路径。`,
          `拒绝信号：${signal.message}`,
          `推荐动作：优先选择侵入性更低的方案，必要时先征求用户确认。`,
        ].join("\n");
        break;

      case "tool_discovery_opportunity":
        summary = `适合主动提示工具 ${signal.toolName} 的可用性`;
        detail = `动作建议：在相关场景主动说明 ${signal.toolName} 可以解决的问题。\n${signal.message}`;
        break;

      case "tool_misuse_pattern":
        summary = `工具 ${signal.toolName} 存在高频误用模式，调用前先自检`;
        detail = `动作建议：执行 ${signal.toolName} 前先自检关键参数和边界条件。\n${signal.message}`;
        break;

      default:
        summary = signal.message;
        detail = `动作建议：结合 ${signal.toolName} 的历史信号，优先规避已知重复问题。`;
    }

    store.save({
      summary,
      detail,
      topic: "learnings",
      source: "system:active-learning",
    });

    producedLearnings.add(learningKey);

    bus.emit("learning:applied", {
      type: signal.type,
      target: signal.toolName,
      message: summary,
    });

    appLogger.info({
      scope: "active-learning",
      message: `生成学习条目: ${summary.slice(0, 60)}`,
    });
  } catch (err) {
    appLogger.error({
      scope: "active-learning",
      message: "学习条目写入失败",
      error: err instanceof Error ? err : new Error(String(err)),
    });
  }
}

// ---------------------------------------------------------------------------
// Periodic Decay — 清理过期信号
// ---------------------------------------------------------------------------

function decaySignals(): void {
  const now = Date.now();
  for (const [key, accum] of failureAccum) {
    if (now - accum.lastSeen > SIGNAL_DECAY_MS) {
      failureAccum.delete(key);
      producedLearnings.delete(`failure:${key}`);
    }
  }
  for (const [key, accum] of rejectionAccum) {
    if (now - accum.lastSeen > SIGNAL_DECAY_MS) {
      rejectionAccum.delete(key);
      producedLearnings.delete(`reject:${key}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Manual Signal Injection (for external use)
// ---------------------------------------------------------------------------

export function reportLearningSignal(signal: LearningSignal): void {
  void processSignal(signal);
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initActiveLearning(): void {
  // 订阅工具失败事件
  bus.on("tool:failed", onToolFailed);
  // 订阅审批拒绝事件
  bus.on("approval:resolved", onApprovalResolved);

  // 注册定期信号衰减任务
  scheduler.register(
    {
      id: "active-learning-decay",
      name: "主动学习信号衰减",
      type: "interval",
      intervalMs: 60 * 60 * 1000, // 每小时
      enabled: true,
    },
    decaySignals
  );

  appLogger.info({
    scope: "active-learning",
    message: "主动学习引擎已启动",
  });
}
