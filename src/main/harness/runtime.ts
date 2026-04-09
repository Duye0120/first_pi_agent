import type { AgentHandle } from "../agent.js";
import type { ConfirmationResponse } from "../../shared/agent-events.js";
import type { RunKind } from "../../shared/contracts.js";
import { appendHarnessAuditEvent } from "./audit.js";
import { loadPersistedHarnessRuns, savePersistedHarnessRuns } from "./store.js";
import { bus } from "../event-bus.js";
import type {
  HarnessApprovalResolution,
  HarnessApprovalSource,
  HarnessAuditEvent,
  HarnessPendingApproval,
  HarnessRunScope,
  HarnessRunSnapshot,
  HarnessRunState,
} from "./types.js";

type ActiveHarnessRun = HarnessRunSnapshot & {
  handle: AgentHandle | null;
};

type CreateRunInput = HarnessRunScope & {
  modelEntryId: string;
  runKind: RunKind;
};

type PendingApprovalWaiter = {
  scope: HarnessRunScope;
  promise: Promise<HarnessApprovalResolution>;
  resolve: (resolution: HarnessApprovalResolution) => void;
  settled: boolean;
};

type FinishRunOptions = {
  reason?: string;
  metadata?: Record<string, unknown>;
};

export class HarnessRunCancelledError extends Error {
  constructor() {
    super("Harness run cancelled.");
    this.name = "HarnessRunCancelledError";
  }
}

export type InterruptedApprovalRecord = {
  sessionId: string;
  runId: string;
  approval: HarnessPendingApproval;
  interruptedAt: number;
};

export class HarnessRuntime {
  private readonly activeRunsBySession = new Map<string, ActiveHarnessRun>();
  private readonly activeRunsById = new Map<string, ActiveHarnessRun>();
  private readonly approvalWaitersByRequestId = new Map<string, PendingApprovalWaiter>();
  private readonly interruptedApprovals: InterruptedApprovalRecord[] = [];
  private hydrated = false;

  /** 返回因应用重启而中断的待确认记录。 */
  getInterruptedApprovals(sessionId?: string): InterruptedApprovalRecord[] {
    if (sessionId) {
      return this.interruptedApprovals.filter((r) => r.sessionId === sessionId);
    }
    return [...this.interruptedApprovals];
  }

  /** 确认已知晓某条中断记录（从列表中移除）。 */
  dismissInterruptedApproval(runId: string): boolean {
    const idx = this.interruptedApprovals.findIndex((r) => r.runId === runId);
    if (idx >= 0) {
      this.interruptedApprovals.splice(idx, 1);
      return true;
    }
    return false;
  }

  hydrateFromDisk(): HarnessRunSnapshot[] {
    if (this.hydrated) {
      return [];
    }

    this.hydrated = true;
    const persistedRuns = loadPersistedHarnessRuns();
    if (persistedRuns.length === 0) {
      return [];
    }

    const now = Date.now();

    for (const run of persistedRuns) {
      const wasAwaitingConfirmation = run.state === "awaiting_confirmation";
      const finalState = wasAwaitingConfirmation ? "aborted" : "failed";
      const action: HarnessAuditEvent["action"] = wasAwaitingConfirmation
        ? "run_aborted"
        : "run_failed";
      const reason = wasAwaitingConfirmation
        ? "应用重启中断了待确认操作。"
        : "应用启动时发现未完成 run，已标记为失败。";

      if (wasAwaitingConfirmation && run.pendingApproval) {
        this.interruptedApprovals.push({
          sessionId: run.sessionId,
          runId: run.runId,
          approval: run.pendingApproval,
          interruptedAt: now,
        });
      }

      this.audit({
        runId: run.runId,
        sessionId: run.sessionId,
        action,
        timestamp: now,
        state: finalState,
        reason,
        metadata: {
          recoveredFromDisk: true,
          previousState: run.state,
          startedAt: run.startedAt,
          endedAt: run.endedAt,
          pendingApproval: run.pendingApproval,
        },
      });
    }

    savePersistedHarnessRuns([]);
    return persistedRuns;
  }

  getActiveRunBySession(sessionId: string): HarnessRunSnapshot | null {
    const run = this.activeRunsBySession.get(sessionId);
    return run ? this.toSnapshot(run) : null;
  }

  createRun(input: CreateRunInput): HarnessRunSnapshot {
    const existing = this.activeRunsBySession.get(input.sessionId);
    if (existing && !existing.cancelled) {
      throw new Error("当前线程仍在生成中，请先停止当前回复。");
    }
    if (existing?.cancelled) {
      this.activeRunsById.delete(existing.runId);
    }

    const run: ActiveHarnessRun = {
      requestId: crypto.randomUUID(),
      runId: input.runId,
      sessionId: input.sessionId,
      modelEntryId: input.modelEntryId,
      runKind: input.runKind,
      state: "running",
      startedAt: Date.now(),
      cancelled: false,
      handle: null,
    };

    this.activeRunsBySession.set(run.sessionId, run);
    this.activeRunsById.set(run.runId, run);
    this.persistActiveRuns();
    this.audit({
      runId: run.runId,
      sessionId: run.sessionId,
      action: "run_created",
      timestamp: run.startedAt,
      state: run.state,
      metadata: {
        modelEntryId: run.modelEntryId,
        requestId: run.requestId,
        runKind: run.runKind,
      },
    });

    bus.emit("run:started", {
      sessionId: run.sessionId,
      runId: run.runId,
      modelEntryId: run.modelEntryId,
    });

    return this.toSnapshot(run);
  }

  attachHandle(scope: HarnessRunScope, handle: AgentHandle): void {
    const run = this.getActiveRun(scope);
    if (!run) {
      return;
    }

    run.handle = handle;
  }

  getHandle(scope: HarnessRunScope): AgentHandle | null {
    return this.getActiveRun(scope)?.handle ?? null;
  }

  assertRunActive(scope: HarnessRunScope): HarnessRunSnapshot {
    const run = this.getActiveRun(scope);
    if (!run || run.cancelled) {
      throw new HarnessRunCancelledError();
    }

    return this.toSnapshot(run);
  }

  isCancelRequested(scope: HarnessRunScope): boolean {
    const run = this.getActiveRun(scope);
    return !!run?.cancelled;
  }

  requestCancel(scope: HarnessRunScope): HarnessRunSnapshot | null {
    const run = this.getActiveRun(scope);
    if (!run) {
      return null;
    }

    if (!run.cancelled) {
      run.cancelled = true;
      this.persistActiveRuns();
      this.audit({
        runId: run.runId,
        sessionId: run.sessionId,
        action: "run_cancel_requested",
        timestamp: Date.now(),
        state: run.state,
      });
      if (run.pendingApproval?.requestId) {
        this.resolvePendingApproval(
          {
            requestId: run.pendingApproval.requestId,
            allowed: false,
          },
          "system",
        );
      }
    }

    return this.toSnapshot(run);
  }

  waitForApprovalResponse(
    scope: HarnessRunScope,
    approval: HarnessPendingApproval,
  ): Promise<HarnessApprovalResolution> {
    const existing = this.approvalWaitersByRequestId.get(approval.requestId);
    if (existing) {
      return existing.promise;
    }

    let resolveWaiter!: (resolution: HarnessApprovalResolution) => void;
    const promise = new Promise<HarnessApprovalResolution>((resolve) => {
      resolveWaiter = resolve;
    });

    this.approvalWaitersByRequestId.set(approval.requestId, {
      scope,
      promise,
      resolve: resolveWaiter,
      settled: false,
    });

    return promise;
  }

  resolvePendingApproval(
    response: ConfirmationResponse,
    source: HarnessApprovalSource = "renderer",
  ): boolean {
    const waiter = this.approvalWaitersByRequestId.get(response.requestId);
    if (!waiter || waiter.settled) {
      return false;
    }

    waiter.settled = true;
    this.approvalWaitersByRequestId.delete(response.requestId);
    waiter.resolve({
      requestId: response.requestId,
      allowed: response.allowed,
      respondedAt: Date.now(),
      source,
      remember: response.remember,
    });
    return true;
  }

  transitionState(
    scope: HarnessRunScope,
    nextState: Exclude<HarnessRunState, "completed" | "aborted" | "failed">,
    options?: {
      currentStepId?: string;
      pendingApproval?: HarnessPendingApproval | null;
      reason?: string;
      metadata?: Record<string, unknown>;
    },
  ): HarnessRunSnapshot | null {
    const run = this.getActiveRun(scope);
    if (!run) {
      return null;
    }

    run.state = nextState;
    run.currentStepId = options?.currentStepId ?? run.currentStepId;
    if (options?.pendingApproval === null) {
      delete run.pendingApproval;
    } else if (options?.pendingApproval) {
      run.pendingApproval = options.pendingApproval;
    }

    this.audit({
      runId: run.runId,
      sessionId: run.sessionId,
      action: "run_state_changed",
      timestamp: Date.now(),
      state: run.state,
      reason: options?.reason,
      metadata: options?.metadata,
    });
    this.persistActiveRuns();

    return this.toSnapshot(run);
  }

  finishRun(
    scope: HarnessRunScope,
    finalState: Extract<HarnessRunState, "completed" | "aborted" | "failed">,
    options?: FinishRunOptions,
  ): HarnessRunSnapshot | null {
    const run = this.getActiveRun(scope);
    if (!run) {
      return null;
    }

    run.state = finalState;
    run.endedAt = Date.now();
    if (finalState === "aborted") {
      run.cancelled = true;
    }

    const action: HarnessAuditEvent["action"] =
      finalState === "completed"
        ? "run_completed"
        : finalState === "aborted"
          ? "run_aborted"
          : "run_failed";

    this.audit({
      runId: run.runId,
      sessionId: run.sessionId,
      action,
      timestamp: run.endedAt,
      state: run.state,
      reason: options?.reason,
      metadata: options?.metadata,
    });

    if (run.pendingApproval?.requestId) {
      this.approvalWaitersByRequestId.delete(run.pendingApproval.requestId);
    }

    this.activeRunsById.delete(run.runId);
    if (this.activeRunsBySession.get(run.sessionId)?.requestId === run.requestId) {
      this.activeRunsBySession.delete(run.sessionId);
    }
    this.persistActiveRuns();

    bus.emit("run:completed", {
      sessionId: run.sessionId,
      runId: run.runId,
      finalState,
      reason: options?.reason,
    });

    return this.toSnapshot(run);
  }

  recordToolPolicyEvaluation(
    scope: HarnessRunScope,
    evaluation: {
      toolName: string;
      riskLevel: string;
      decision: { type: string; reason?: string };
      metadata?: Record<string, unknown>;
    },
    metadata?: Record<string, unknown>,
  ): void {
    const run = this.getActiveRun(scope);
    if (!run) {
      return;
    }

    this.audit({
      runId: run.runId,
      sessionId: run.sessionId,
      action: "tool_policy_evaluated",
      timestamp: Date.now(),
      state: run.state,
      toolName: evaluation.toolName,
      decision: evaluation.decision.type as any,
      reason: evaluation.decision.reason,
      metadata: {
        riskLevel: evaluation.riskLevel,
        ...(evaluation.metadata ?? {}),
        ...(metadata ?? {}),
      },
    });
  }

  private getActiveRun(scope: HarnessRunScope): ActiveHarnessRun | null {
    const run = this.activeRunsById.get(scope.runId);
    if (!run || run.sessionId !== scope.sessionId) {
      return null;
    }

    if (this.activeRunsBySession.get(scope.sessionId)?.requestId !== run.requestId) {
      return null;
    }

    return run;
  }

  private toSnapshot(run: ActiveHarnessRun): HarnessRunSnapshot {
    return {
      requestId: run.requestId,
      runId: run.runId,
      sessionId: run.sessionId,
      modelEntryId: run.modelEntryId,
      runKind: run.runKind,
      state: run.state,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      currentStepId: run.currentStepId,
      pendingApproval: run.pendingApproval,
      cancelled: run.cancelled,
    };
  }

  private audit(event: HarnessAuditEvent): void {
    appendHarnessAuditEvent(event);
  }

  private persistActiveRuns(): void {
    const snapshots = [...this.activeRunsBySession.values()].map((run) =>
      this.toSnapshot(run),
    );
    savePersistedHarnessRuns(snapshots);
  }
}
