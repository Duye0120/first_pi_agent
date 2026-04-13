// ---------------------------------------------------------------------------
// Parallel Tool Execution — 无副作用工具的投机并行执行
// ---------------------------------------------------------------------------
//
// pi-agent-core 的 agent-loop 按顺序执行工具（for + await）。
// 本模块在不修改上游的前提下，对无副作用（只读）工具实现投机预执行：
//
// 流程：
// 1. 监听 agent 事件，当 assistant 消息包含多个 toolCall 时注册批次
// 2. 当第一个工具开始执行时，对其余只读工具启动并行预执行
// 3. 预执行只做 I/O（跳过 harness 状态转换），结果缓存
// 4. 当 pi-agent-core 的串行循环到达后续工具时，从缓存取结果
// 5. harness 审批 + 状态转换仍在串行流程中完成，保证事件顺序
// ---------------------------------------------------------------------------

import { appLogger } from "./logger.js";

// ---------------------------------------------------------------------------
// 无副作用工具白名单
// ---------------------------------------------------------------------------

export const SIDE_EFFECT_FREE_TOOLS = new Set([
  "file_read",
  "glob_search",
  "grep_search",
  "command_history",
  "get_time",
  "todo_read",
  "list_mcp_resources",
  "list_mcp_resource_templates",
  "read_mcp_resource",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BatchEntry {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  details?: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolExecutor = (
  toolCallId: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<any>;

// ---------------------------------------------------------------------------
// ParallelExecutionManager
// ---------------------------------------------------------------------------

class ParallelExecutionManager {
  private batches = new Map<string, BatchEntry[]>();
  private cache = new Map<string, Promise<any>>();
  private executors = new Map<string, ToolExecutor>();
  private activeSignals = new Map<string, AbortSignal>();

  /**
   * 注册工具执行器（在 agent 初始化时调用）
   */
  registerExecutor(toolName: string, executor: ToolExecutor): void {
    this.executors.set(toolName, executor);
  }

  /**
   * 注册一批待执行的工具调用（从 assistant 消息的 toolCall 块提取）
   */
  registerBatch(runId: string, toolCalls: BatchEntry[], signal: AbortSignal): void {
    // 只在有多个无副作用工具时才注册批次
    const parallelCandidates = toolCalls.filter((tc) =>
      SIDE_EFFECT_FREE_TOOLS.has(tc.toolName),
    );
    if (parallelCandidates.length <= 1) return;

    this.batches.set(runId, parallelCandidates);
    this.activeSignals.set(runId, signal);
  }

  /**
   * 当第一个工具开始执行时调用，启动其余工具的预执行
   */
  startPreExecution(runId: string, currentToolCallId: string): void {
    const batch = this.batches.get(runId);
    const signal = this.activeSignals.get(runId);
    if (!batch || !signal || signal.aborted) return;

    for (const entry of batch) {
      if (entry.toolCallId === currentToolCallId) continue;
      if (this.cache.has(entry.toolCallId)) continue;

      const executor = this.executors.get(entry.toolName);
      if (!executor) continue;

      // 启动预执行（只做 I/O，不做状态转换）
      const promise = executor(entry.toolCallId, entry.args, signal).catch((err) => {
        appLogger.debug({
          scope: "parallel-tools",
          message: `预执行失败 ${entry.toolName}:${entry.toolCallId}`,
          data: { error: err instanceof Error ? err.message : String(err) },
        });
        // 返回 null 让串行流程重新执行
        return null as any;
      });

      this.cache.set(entry.toolCallId, promise);
    }

    appLogger.debug({
      scope: "parallel-tools",
      message: `启动并行预执行: ${batch.length - 1} 个工具`,
      data: { runId, excludeToolCallId: currentToolCallId },
    });
  }

  /**
   * 获取缓存的预执行结果
   */
  async getCachedResult(toolCallId: string): Promise<any | null> {
    const cached = this.cache.get(toolCallId);
    if (!cached) return null;

    try {
      const result = await cached;
      if (!result) return null; // 预执行失败，回退到正常执行
      return result;
    } catch {
      this.cache.delete(toolCallId);
      return null;
    }
  }

  /**
   * 清理某次 run 的批次数据
   */
  clearRun(runId: string): void {
    const batch = this.batches.get(runId);
    if (batch) {
      for (const entry of batch) {
        this.cache.delete(entry.toolCallId);
      }
    }
    this.batches.delete(runId);
    this.activeSignals.delete(runId);
  }

  /**
   * 检查某个工具调用是否有缓存
   */
  hasCached(toolCallId: string): boolean {
    return this.cache.has(toolCallId);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const parallelManager = new ParallelExecutionManager();
