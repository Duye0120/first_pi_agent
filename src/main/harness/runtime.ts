import type { AgentHandle } from "../agent.js";
import type { RunKind } from "../../shared/contracts.js";
import { appendHarnessAuditEvent } from "./audit.js";
import { loadPersistedHarnessRuns, savePersistedHarnessRuns } from "./store.js";
import type {
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

export class HarnessRuntime {
  private readonly activeRunsBySession = new Map<string, ActiveHarnessRun>();
  private readonly activeRunsById = new Map<string, ActiveHarnessRun>();
  private hydrated = false;

  hydrateFromDisk(): HarnessRunSnapshot[] {
    if (this.hydrated) {
      return [];
    }

    this.hydrated = true;
    const persistedRuns = loadPersistedHarnessRuns();
    if (persistedRuns.length === 0) {
      return [];
    }

    // Current implementation does not support true continuation of an interrupted
    // agent loop after app restart. We keep the trace, write an audit event, and
    // clear the active run registry so the session can continue.
    for (const run of persistedRuns) {
      this.audit({
        runId: run.runId,
        sessionId: run.sessionId,
        action: "run_failed",
        timestamp: Date.now(),
        state: "failed",
        reason: "应用启动时发现未完成 run，当前版本尚不支持自动续跑，已标记为失败。",
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
    }

    return this.toSnapshot(run);
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

    this.activeRunsById.delete(run.runId);
    if (this.activeRunsBySession.get(run.sessionId)?.requestId === run.requestId) {
      this.activeRunsBySession.delete(run.sessionId);
    }
    this.persistActiveRuns();

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
