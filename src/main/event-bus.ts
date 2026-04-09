// ---------------------------------------------------------------------------
// Event Bus — 全局类型安全事件总线
// ---------------------------------------------------------------------------
//
// 所有模块间的事件通信都通过此总线。
// Harness 负责"能不能做"，Bus 负责"发生了什么"。
// ---------------------------------------------------------------------------

import { appLogger } from "./logger.js";

// ---------------------------------------------------------------------------
// Event Map — 所有已知事件及其 payload 类型
// ---------------------------------------------------------------------------

export type EventMap = {
  // ── Agent 生命周期 ──
  "run:started": { sessionId: string; runId: string; modelEntryId: string };
  "run:completed": { sessionId: string; runId: string; finalState: string; reason?: string };

  // ── 消息 ──
  "message:user": { sessionId: string; text: string };
  "message:assistant": { sessionId: string; runId: string };

  // ── 工具执行 ──
  "tool:executing": { sessionId: string; runId: string; toolName: string; toolCallId: string };
  "tool:completed": { sessionId: string; runId: string; toolName: string; toolCallId: string };
  "tool:failed": { sessionId: string; runId: string; toolName: string; toolCallId: string; error: string };

  // ── Harness 审批 ──
  "approval:requested": { sessionId: string; runId: string; requestId: string; toolName: string };
  "approval:resolved": { sessionId: string; runId: string; requestId: string; allowed: boolean };

  // ── 通知 ──
  "notification:sent": { title: string; body: string };
  "notification:external": { channel: string; message: string };

  // ── 诊断（Phase 2 预留） ──
  "diagnosis:healthy": { checkId: string };
  "diagnosis:alert": { checkId: string; message: string; severity: string };
  "diagnosis:repaired": { checkId: string; message: string };

  // ── 插件（Phase 4 预留） ──
  "plugin:loaded": { pluginId: string; tools: string[] };
  "plugin:unloaded": { pluginId: string };

  // ── 调度（Phase 2 预留） ──
  "schedule:triggered": { jobId: string; cronExpr: string };
};

// ---------------------------------------------------------------------------
// EventBus 实现
// ---------------------------------------------------------------------------

type Handler<T = unknown> = (data: T) => void;
type WildcardHandler = (event: string, data: unknown) => void;

class EventBus {
  private readonly listeners = new Map<string, Set<Handler>>();
  private readonly wildcardListeners = new Set<WildcardHandler>();

  /**
   * 订阅事件。返回取消订阅函数。
   */
  on<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Handler);
    return () => {
      set!.delete(handler as Handler);
      if (set!.size === 0) this.listeners.delete(event);
    };
  }

  /**
   * 一次性订阅。触发后自动取消。
   */
  once<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): () => void {
    const off = this.on(event, (data) => {
      off();
      handler(data);
    });
    return off;
  }

  /**
   * 通配符订阅 — 收到所有事件。用于审计/日志。
   */
  onAny(handler: WildcardHandler): () => void {
    this.wildcardListeners.add(handler);
    return () => {
      this.wildcardListeners.delete(handler);
    };
  }

  /**
   * 发射事件。同步调用所有 handler（handler 内部可以 async）。
   */
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    // 具名监听器
    const set = this.listeners.get(event);
    if (set) {
      for (const handler of set) {
        try {
          handler(data);
        } catch (err) {
          appLogger.warn({
            scope: "event-bus",
            message: `handler error on "${event}"`,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      }
    }

    // 通配符监听器
    for (const handler of this.wildcardListeners) {
      try {
        handler(event, data);
      } catch {
        // 通配符 handler 出错不阻塞
      }
    }
  }

  /**
   * 返回某个事件的当前监听器数量。
   */
  listenerCount(event: keyof EventMap): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /**
   * 移除所有监听器（测试/清理用）。
   */
  removeAllListeners(): void {
    this.listeners.clear();
    this.wildcardListeners.clear();
  }
}

// ---------------------------------------------------------------------------
// 单例导出
// ---------------------------------------------------------------------------

export const bus = new EventBus();
