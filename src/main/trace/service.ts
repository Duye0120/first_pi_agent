// ---------------------------------------------------------------------------
// TraceService — 构建每个 run 的 TraceNode 树 + 管道事件到 Renderer
// ---------------------------------------------------------------------------
//
// 订阅 harness 事件和 bus 事件，为每个 runId 构建一棵 TraceNode 树。
// 暴露 subscribe / getRunTree / listRunSummaries API。
// 同时将 harness 生命周期事件映射为 AgentEvent 并通过 IPC 发送给 renderer。
// ---------------------------------------------------------------------------

import { BUS_EVENTS, bus, type EventMap } from "../event-bus.js";
import { IPC_CHANNELS } from "../../shared/ipc.js";
import { getMainWindow } from "../window.js";
import type { AgentEvent } from "../../shared/agent-events.js";
import type {
  TraceNode,
  TraceTree,
  TraceRunSummary,
  TraceEventType,
  TraceNodeStatus,
} from "../../shared/contracts.js";
import { appLogger } from "../logger.js";

// ---------------------------------------------------------------------------
// Internal: pending node tracker — pairs start/end events to compute duration
// ---------------------------------------------------------------------------

type PendingNode = {
  nodeId: string;
  runId: string;
  type: TraceEventType;
  timestamp: number;
};

// ---------------------------------------------------------------------------
// Subscriber callback type
// ---------------------------------------------------------------------------

export type TraceChangeCallback = (
  runId: string,
  node: TraceNode | null,
  reason: "node_added" | "node_updated" | "run_ended" | "run_started",
) => void;

// ---------------------------------------------------------------------------
// Type-safe bus subscription helpers — each method uses a concrete EventMap key
// ---------------------------------------------------------------------------

type BusHandler<K extends keyof EventMap> = (data: EventMap[K]) => void;

function onBusEvent<K extends keyof EventMap>(
  event: K,
  handler: BusHandler<K>,
): () => void {
  return bus.on(event, handler as (data: EventMap[keyof EventMap]) => void);
}

// ---------------------------------------------------------------------------
// TraceService
// ---------------------------------------------------------------------------

export class TraceService {
  private readonly treesById = new Map<string, TraceTree>();
  private readonly pendingNodes = new Map<string, PendingNode>();
  private readonly subscribers = new Set<TraceChangeCallback>();
  private readonly nodeIndex = new Map<string, TraceNode>();
  private readonly flushedRunIds = new Set<string>();
  private initialized = false;
  private unsubscribers: (() => void)[] = [];

  // ── Lifecycle ──────────────────────────────────────────────────

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.subscribeBusEvents();
  }

  stop(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.subscribers.clear();
  }

  // ── IPC emission to renderer ─────────────────────────────────

  /**
   * 向 renderer 发送 AgentEvent。
   * 使用 flushedRunIds 做去重，避免与 adapter 的 agent_end 重复发送。
   */
  private emitAgentEvent(event: AgentEvent): void {
    const window = getMainWindow();
    if (!window || window.isDestroyed()) {
      return;
    }

    // 对于 agent_end / agent_error，如果该 runId 已经 flushed 过，跳过
    if (
      (event.type === "agent_end" || event.type === "agent_error") &&
      this.flushedRunIds.has(event.runId)
    ) {
      return;
    }

    try {
      window.webContents.send(IPC_CHANNELS.agentEvent, event);
      // 标记该 run 的 terminal 事件已发送
      if (event.type === "agent_end" || event.type === "agent_error") {
        this.flushedRunIds.add(event.runId);
      }
    } catch (error) {
      appLogger.warn({
        scope: "trace-service",
        message: "向 renderer 发送 trace 事件失败",
        data: {
          sessionId: event.sessionId,
          runId: event.runId,
          eventType: event.type,
        },
        error,
      });
    }
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * 订阅 trace 变更。返回取消订阅函数。
   */
  subscribe(callback: TraceChangeCallback): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * 获取某个 run 的完整 trace 树。
   */
  getRunTree(runId: string): TraceTree | null {
    return this.treesById.get(runId) ?? null;
  }

  /**
   * 获取所有 run 的摘要列表（按 startedAt 降序）。
   */
  listRunSummaries(): TraceRunSummary[] {
    const summaries: TraceRunSummary[] = [];
    for (const tree of this.treesById.values()) {
      summaries.push(this.buildRunSummary(tree));
    }
    summaries.sort((a, b) => b.startedAt - a.startedAt);
    return summaries;
  }

  /**
   * 获取某个 session 的 run 摘要。
   */
  getSessionSummaries(sessionId: string): TraceRunSummary[] {
    return this.listRunSummaries().filter((s) => s.sessionId === sessionId);
  }

  /**
   * 手动注入一条 trace 节点（用于 adapter 等外部源）。
   */
  addNode(node: Omit<TraceNode, "children">): void {
    const tree = this.getOrCreateTree(node.runId, node.sessionId, node.timestamp);
    const fullNode: TraceNode = { ...node, children: [] };

    if (node.parentId) {
      const parent = this.nodeIndex.get(node.parentId);
      if (parent) {
        parent.children.push(fullNode);
      } else {
        tree.rootNodes.push(fullNode);
      }
    } else {
      tree.rootNodes.push(fullNode);
    }

    this.nodeIndex.set(fullNode.id, fullNode);
    this.emitChange(node.runId, fullNode, "node_added");
  }

  /**
   * 更新已有节点。
   */
  updateNode(runId: string, nodeId: string, updates: Partial<TraceNode>): void {
    const node = this.nodeIndex.get(nodeId);
    if (!node) return;
    Object.assign(node, updates);
    this.emitChange(runId, node, "node_updated");
  }

  // ── Internal: Bus event subscriptions ─────────────────────────

  private subscribeBusEvents(): void {
    // ── Run lifecycle ──────────────────────────────────────────

    this.unsubscribers.push(
      onBusEvent(BUS_EVENTS.RUN_CREATED, (data) => {
        const tree = this.getOrCreateTree(data.runId, data.sessionId, Date.now());
        tree.metadata = { modelEntryId: data.modelEntryId, runKind: data.runKind, lane: data.lane };

        this.addNode({
          id: `run-created:${data.runId}`,
          runId: data.runId,
          sessionId: data.sessionId,
          type: "run_created",
          timestamp: Date.now(),
          parentId: null,
          data: { modelEntryId: data.modelEntryId, runKind: data.runKind, lane: data.lane },
          status: "pending",
          label: `run:${data.runKind}`,
        });
      }),
    );

    this.unsubscribers.push(
      onBusEvent(BUS_EVENTS.RUN_STARTED, (data) => {
        const tree = this.getOrCreateTree(data.runId, data.sessionId, Date.now());
        if (tree.metadata) {
          tree.metadata = { ...tree.metadata, modelEntryId: data.modelEntryId };
        } else {
          tree.metadata = { modelEntryId: data.modelEntryId };
        }
        this.emitChange(data.runId, null, "run_started");

        // 向 renderer 发送 agent_start
        this.emitAgentEvent({
          type: "agent_start",
          sessionId: data.sessionId,
          runId: data.runId,
          timestamp: Date.now(),
        });
      }),
    );

    this.unsubscribers.push(
      onBusEvent(BUS_EVENTS.RUN_STATE_CHANGED, (data) => {
        this.addNode({
          id: `state-change:${data.runId}:${Date.now()}`,
          runId: data.runId,
          sessionId: data.sessionId,
          type: "run_state_changed",
          timestamp: Date.now(),
          parentId: null,
          data: { state: data.state, reason: data.reason, currentStepId: data.currentStepId },
          label: data.state,
        });
      }),
    );

    this.unsubscribers.push(
      onBusEvent(BUS_EVENTS.RUN_CANCEL_REQUESTED, (data) => {
        this.addNode({
          id: `cancel-req:${data.runId}`,
          runId: data.runId,
          sessionId: data.sessionId,
          type: "run_cancel_requested",
          timestamp: Date.now(),
          parentId: null,
          data: {},
          status: "cancelled",
          label: "cancel",
        });
      }),
    );

    this.unsubscribers.push(
      onBusEvent(BUS_EVENTS.RUN_COMPLETED, (data) => {
        const tree = this.treesById.get(data.runId);
        if (tree) {
          tree.endedAt = Date.now();
          tree.metadata = { ...tree.metadata, finalState: data.finalState, reason: data.reason };
          this.addNode({
            id: `run-end:${data.runId}`,
            runId: data.runId,
            sessionId: data.sessionId,
            type: "run_completed",
            timestamp: Date.now(),
            parentId: null,
            data: { finalState: data.finalState, reason: data.reason },
            status: data.finalState === "completed" ? "success" : "error",
            label: data.finalState,
          });
          this.resolvePendingForRun(data.runId);
          this.emitChange(data.runId, null, "run_ended");
        }

        // 向 renderer 发送 agent_end
        this.emitAgentEvent({
          type: "agent_end",
          sessionId: data.sessionId,
          runId: data.runId,
          timestamp: Date.now(),
        });
      }),
    );

    this.unsubscribers.push(
      onBusEvent(BUS_EVENTS.RUN_ABORTED, (data) => {
        const tree = this.treesById.get(data.runId);
        if (tree) {
          tree.endedAt = Date.now();
          this.addNode({
            id: `run-abort:${data.runId}`,
            runId: data.runId,
            sessionId: data.sessionId,
            type: "run_aborted",
            timestamp: Date.now(),
            parentId: null,
            data: { reason: data.reason },
            status: "cancelled",
            label: "aborted",
          });
          this.resolvePendingForRun(data.runId);
          this.emitChange(data.runId, null, "run_ended");
        }

        // 向 renderer 发送 agent_end (aborted run)
        this.emitAgentEvent({
          type: "agent_end",
          sessionId: data.sessionId,
          runId: data.runId,
          timestamp: Date.now(),
        });
      }),
    );

    this.unsubscribers.push(
      onBusEvent(BUS_EVENTS.RUN_FAILED, (data) => {
        const tree = this.treesById.get(data.runId);
        if (tree) {
          tree.endedAt = Date.now();
          this.addNode({
            id: `run-failed:${data.runId}`,
            runId: data.runId,
            sessionId: data.sessionId,
            type: "run_failed",
            timestamp: Date.now(),
            parentId: null,
            data: { reason: data.reason },
            status: "error",
            label: "failed",
          });
          this.resolvePendingForRun(data.runId);
          this.emitChange(data.runId, null, "run_ended");
        }

        // 向 renderer 发送 agent_error
        this.emitAgentEvent({
          type: "agent_error",
          sessionId: data.sessionId,
          runId: data.runId,
          message: data.reason ?? "run failed",
          timestamp: Date.now(),
        });
      }),
    );

    // ── Tool execution ─────────────────────────────────────────

    this.unsubscribers.push(
      onBusEvent(BUS_EVENTS.TOOL_EXECUTING, (data) => {
        const toolStartId = `tool-start:${data.toolCallId}`;
        this.pendingNodes.set(toolStartId, {
          nodeId: toolStartId,
          runId: data.runId,
          type: "tool_executing",
          timestamp: Date.now(),
        });

        this.addNode({
          id: `tool-exec-start:${data.toolCallId}`,
          runId: data.runId,
          sessionId: data.sessionId,
          type: "tool_executing",
          timestamp: Date.now(),
          parentId: null,
          data: { toolName: data.toolName, toolCallId: data.toolCallId },
          status: "pending",
          label: data.toolName,
        });
      }),
    );

    this.unsubscribers.push(
      onBusEvent(BUS_EVENTS.TOOL_COMPLETED, (data) => {
        const pending = this.pendingNodes.get(`tool-start:${data.toolCallId}`);
        const duration = pending ? Date.now() - pending.timestamp : undefined;
        this.pendingNodes.delete(`tool-start:${data.toolCallId}`);

        this.addNode({
          id: `tool-completed:${data.toolCallId}`,
          runId: data.runId,
          sessionId: data.sessionId,
          type: "tool_completed",
          timestamp: Date.now(),
          parentId: null,
          data: { toolName: data.toolName, toolCallId: data.toolCallId },
          durationMs: duration,
          status: "success",
          label: data.toolName,
        });
      }),
    );

    this.unsubscribers.push(
      onBusEvent(BUS_EVENTS.TOOL_FAILED, (data) => {
        const pending = this.pendingNodes.get(`tool-start:${data.toolCallId}`);
        const duration = pending ? Date.now() - pending.timestamp : undefined;
        this.pendingNodes.delete(`tool-start:${data.toolCallId}`);

        this.addNode({
          id: `tool-failed:${data.toolCallId}`,
          runId: data.runId,
          sessionId: data.sessionId,
          type: "tool_failed",
          timestamp: Date.now(),
          parentId: null,
          data: { toolName: data.toolName, toolCallId: data.toolCallId, error: data.error },
          durationMs: duration,
          status: "error",
          label: data.toolName,
        });
      }),
    );

    this.unsubscribers.push(
      onBusEvent(BUS_EVENTS.TOOL_POLICY_EVALUATED, (data) => {
        this.addNode({
          id: `tool-policy:${data.runId}:${data.toolName}:${Date.now()}`,
          runId: data.runId,
          sessionId: data.sessionId,
          type: "tool_policy_evaluated",
          timestamp: Date.now(),
          parentId: null,
          data: { toolName: data.toolName, decision: data.decision, riskLevel: data.riskLevel },
          label: `policy: ${data.toolName} → ${data.decision}`,
        });
      }),
    );

    // ── Approvals ──────────────────────────────────────────────

    this.unsubscribers.push(
      onBusEvent(BUS_EVENTS.APPROVAL_REQUESTED, (data) => {
        this.addNode({
          id: `approval-req:${data.requestId}`,
          runId: data.runId,
          sessionId: data.sessionId,
          type: "approval_requested",
          timestamp: Date.now(),
          parentId: null,
          data: { requestId: data.requestId, toolName: data.toolName },
          status: "pending",
          label: `approval: ${data.toolName}`,
        });
      }),
    );

    this.unsubscribers.push(
      onBusEvent(BUS_EVENTS.APPROVAL_RESOLVED, (data) => {
        const approvalNode = this.nodeIndex.get(`approval-req:${data.requestId}`);
        if (approvalNode) {
          this.updateNode(data.runId, approvalNode.id, {
            status: data.allowed ? "success" : "cancelled",
            data: { ...approvalNode.data, allowed: data.allowed },
          });
        }
      }),
    );
  }

  // ── Internal helpers ───────────────────────────────────────────

  private getOrCreateTree(runId: string, sessionId: string, timestamp: number): TraceTree {
    let tree = this.treesById.get(runId);
    if (!tree) {
      tree = {
        runId,
        sessionId,
        rootNodes: [],
        startedAt: timestamp,
      };
      this.treesById.set(runId, tree);
    }
    return tree;
  }

  private buildRunSummary(tree: TraceTree): TraceRunSummary {
    let toolCallCount = 0;
    let errorCount = 0;
    let nodeCount = 0;

    const countNodes = (nodes: TraceNode[]) => {
      for (const node of nodes) {
        nodeCount++;
        if (node.type.startsWith("tool_")) toolCallCount++;
        if (node.status === "error") errorCount++;
        countNodes(node.children);
      }
    };
    countNodes(tree.rootNodes);

    return {
      runId: tree.runId,
      sessionId: tree.sessionId,
      nodeCount,
      startedAt: tree.startedAt,
      endedAt: tree.endedAt,
      durationMs: tree.endedAt ? tree.endedAt - tree.startedAt : undefined,
      toolCallCount,
      errorCount,
    };
  }

  private resolvePendingForRun(runId: string): void {
    for (const [key, pending] of this.pendingNodes) {
      if (pending.runId === runId) {
        this.pendingNodes.delete(key);
      }
    }
  }

  private emitChange(
    runId: string,
    node: TraceNode | null,
    reason: "node_added" | "node_updated" | "run_ended" | "run_started",
  ): void {
    for (const callback of this.subscribers) {
      try {
        callback(runId, node, reason);
      } catch {
        // subscriber errors must not break other subscribers
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export + init/stop wrappers for bootstrap
// ---------------------------------------------------------------------------

export const traceService = new TraceService();

export function initTraceService(): void {
  traceService.init();
}

export function stopTraceService(): void {
  traceService.stop();
}
