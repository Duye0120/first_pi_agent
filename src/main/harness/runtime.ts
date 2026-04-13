import type { AgentHandle } from "../agent.js";
import type { ConfirmationResponse } from "../../shared/agent-events.js";
import type { RunKind, RunSource } from "../../shared/contracts.js";
import { PRIMARY_AGENT_OWNER, buildSystemOwnerId } from "../agent-owners.js";
import {
  loadInterruptedApprovals,
  saveInterruptedApprovals,
} from "./approvals-store.js";
import { appendHarnessAuditEvent } from "./audit.js";
import { loadPersistedHarnessRuns, savePersistedHarnessRuns } from "./store.js";
import { bus } from "../event-bus.js";
import type {
  HarnessApprovalResolution,
  HarnessApprovalSource,
  HarnessAuditEvent,
  HarnessRunLane,
  HarnessPendingApproval,
  HarnessRunScope,
  HarnessRunSnapshot,
  HarnessRunState,
  InterruptedApprovalRecord,
} from "./types.js";

type ActiveHarnessRun = HarnessRunSnapshot & {
  handle: AgentHandle | null;
};

type CreateRunInput = HarnessRunScope & {
  ownerId?: string;
  modelEntryId: string;
  runKind: RunKind;
  runSource?: RunSource;
  lane?: HarnessRunLane;
  metadata?: Record<string, unknown>;
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

type PendingResumedRun = {
  sessionId: string;
  metadata: Record<string, unknown>;
};

export class HarnessRunCancelledError extends Error {
  constructor() {
    super("Harness run cancelled.");
    this.name = "HarnessRunCancelledError";
  }
}

export class HarnessRuntime {
  private readonly activeForegroundRunsBySession = new Map<string, ActiveHarnessRun>();
  private readonly activeRunsById = new Map<string, ActiveHarnessRun>();
  private readonly approvalWaitersByRequestId = new Map<string, PendingApprovalWaiter>();
  private readonly interruptedApprovals: InterruptedApprovalRecord[] = [];
  private readonly pendingResumedRunsById = new Map<string, PendingResumedRun>();
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
      this.persistInterruptedApprovals();
      return true;
    }
    return false;
  }

  resumeInterruptedRun(interruptedRunId: string): string {
    const interruptedApproval = this.interruptedApprovals.find(
      (record) => record.runId === interruptedRunId,
    );
    if (!interruptedApproval) {
      throw new Error("找不到对应的中断审批记录。");
    }
    if (!interruptedApproval.canResume) {
      throw new Error("当前中断审批不支持恢复执行。");
    }

    const resumedRunId = crypto.randomUUID();
    this.pendingResumedRunsById.set(resumedRunId, {
      sessionId: interruptedApproval.sessionId,
      metadata: {
        resumedFromRunId: interruptedApproval.runId,
        resumedFromOwnerId: interruptedApproval.ownerId,
        resumedFromModelEntryId: interruptedApproval.modelEntryId ?? null,
        resumedFromRunKind: interruptedApproval.runKind ?? null,
        resumedFromRunSource: interruptedApproval.runSource ?? null,
        resumedFromLane: interruptedApproval.lane ?? null,
        resumedFromState: interruptedApproval.state ?? null,
        resumedFromStartedAt: interruptedApproval.startedAt ?? null,
        resumedFromCurrentStepId: interruptedApproval.currentStepId ?? null,
        resumedFromApprovalRequestId: interruptedApproval.approval.requestId,
        resumedFromInterruptedAt: interruptedApproval.interruptedAt,
        resumedFromRecoveryStatus:
          interruptedApproval.recoveryStatus ?? "interrupted",
      },
    });

    return resumedRunId;
  }

  hydrateFromDisk(): HarnessRunSnapshot[] {
    if (this.hydrated) {
      return [];
    }

    this.hydrated = true;
    const persistedRuns = loadPersistedHarnessRuns();
    if (persistedRuns.length === 0) {
      this.restoreInterruptedApprovalsFromStore();
      return [];
    }

    this.restoreInterruptedApprovalsFromStore();
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
        const record = {
          sessionId: run.sessionId,
          runId: run.runId,
          ownerId: run.ownerId,
          modelEntryId: run.modelEntryId,
          runKind: run.runKind,
          runSource: run.runSource,
          lane: run.lane,
          state: run.state,
          startedAt: run.startedAt,
          currentStepId: run.currentStepId,
          canResume: true,
          recoveryStatus: "interrupted",
          approval: run.pendingApproval,
          interruptedAt: now,
        } satisfies InterruptedApprovalRecord;
        this.upsertInterruptedApproval(record);
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
    const run = this.activeForegroundRunsBySession.get(sessionId);
    return run ? this.toSnapshot(run) : null;
  }

  createRun(input: CreateRunInput): HarnessRunSnapshot {
    const pendingResumedRun = this.pendingResumedRunsById.get(input.runId);
    if (
      pendingResumedRun &&
      pendingResumedRun.sessionId !== input.sessionId
    ) {
      this.pendingResumedRunsById.delete(input.runId);
      throw new Error("恢复 run 的 session 不匹配。");
    }

    const lane = input.lane ?? "foreground";
    const ownerId =
      input.ownerId ??
      (lane === "foreground" ? PRIMARY_AGENT_OWNER : buildSystemOwnerId(input.runKind));
    if (lane === "foreground") {
      const existing = this.activeForegroundRunsBySession.get(input.sessionId);
      if (existing && !existing.cancelled) {
        throw new Error("当前线程仍在生成中，请先停止当前回复。");
      }
      if (existing?.cancelled) {
        this.activeRunsById.delete(existing.runId);
      }
    }

    const run: ActiveHarnessRun = {
      requestId: crypto.randomUUID(),
      runId: input.runId,
      sessionId: input.sessionId,
      ownerId,
      modelEntryId: input.modelEntryId,
      runKind: input.runKind,
      runSource: input.runSource ?? (lane === "foreground" ? "user" : "system"),
      lane,
      state: "running",
      startedAt: Date.now(),
      cancelled: false,
      metadata: pendingResumedRun
        ? {
            ...pendingResumedRun.metadata,
            ...(input.metadata ?? {}),
          }
        : input.metadata,
      handle: null,
    };
    if (pendingResumedRun) {
      this.pendingResumedRunsById.delete(input.runId);
    }

    if (run.lane === "foreground") {
      this.activeForegroundRunsBySession.set(run.sessionId, run);
    }
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
        ownerId: run.ownerId,
        runKind: run.runKind,
        runSource: run.runSource,
        lane: run.lane,
        ...run.metadata,
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
    this.dismissInterruptedApproval(waiter.scope.runId);
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
    this.dismissInterruptedApproval(run.runId);

    this.activeRunsById.delete(run.runId);
    if (this.activeForegroundRunsBySession.get(run.sessionId)?.requestId === run.requestId) {
      this.activeForegroundRunsBySession.delete(run.sessionId);
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

  private restoreInterruptedApprovalsFromStore(): void {
    const persisted = loadInterruptedApprovals();
    this.interruptedApprovals.splice(0, this.interruptedApprovals.length, ...persisted);
  }

  private persistInterruptedApprovals(): void {
    saveInterruptedApprovals(this.interruptedApprovals);
  }

  private upsertInterruptedApproval(record: InterruptedApprovalRecord): void {
    const existingIndex = this.interruptedApprovals.findIndex(
      (item) => item.runId === record.runId,
    );
    if (existingIndex >= 0) {
      this.interruptedApprovals[existingIndex] = record;
    } else {
      this.interruptedApprovals.push(record);
    }
    this.persistInterruptedApprovals();
  }

  private getActiveRun(scope: HarnessRunScope): ActiveHarnessRun | null {
    const run = this.activeRunsById.get(scope.runId);
    if (!run || run.sessionId !== scope.sessionId) {
      return null;
    }

    if (
      run.lane === "foreground" &&
      this.activeForegroundRunsBySession.get(scope.sessionId)?.requestId !== run.requestId
    ) {
      return null;
    }

    return run;
  }

  private toSnapshot(run: ActiveHarnessRun): HarnessRunSnapshot {
    return {
      requestId: run.requestId,
      runId: run.runId,
      sessionId: run.sessionId,
      ownerId: run.ownerId,
      modelEntryId: run.modelEntryId,
      runKind: run.runKind,
      runSource: run.runSource,
      lane: run.lane,
      state: run.state,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      currentStepId: run.currentStepId,
      pendingApproval: run.pendingApproval,
      cancelled: run.cancelled,
      metadata: run.metadata,
    };
  }

  private audit(event: HarnessAuditEvent): void {
    appendHarnessAuditEvent(event);
  }

  private persistActiveRuns(): void {
    const snapshots = [...this.activeRunsById.values()].map((run) =>
      this.toSnapshot(run),
    );
    savePersistedHarnessRuns(snapshots);
  }
}
