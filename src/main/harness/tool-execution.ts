import { createHash } from "node:crypto";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { ElectronAdapter } from "../adapter.js";
import { evaluateToolPolicy } from "./policy.js";
import { HarnessRunCancelledError, type HarnessRuntime } from "./runtime.js";
import type {
  HarnessApprovalKind,
  HarnessPolicyEvaluation,
  HarnessRunScope,
} from "./types.js";

type HarnessToolExecutionContext = {
  sessionId: string;
  workspacePath: string;
  adapter: ElectronAdapter;
  runtime: HarnessRuntime;
};

function buildPayloadHash(toolName: string, args: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify({ toolName, args }))
    .digest("hex");
}

function inferApprovalKind(toolName: string): HarnessApprovalKind {
  if (toolName === "shell_exec") {
    return "shell";
  }

  if (toolName === "file_write") {
    return "file_write";
  }

  return "mcp";
}

function buildDecisionText(
  toolName: string,
  evaluation: HarnessPolicyEvaluation,
  mode: "deny" | "reject-confirm",
): string {
  if (mode === "deny") {
    return `操作被拒绝：${toolName} 未通过 Harness 策略校验。原因：${evaluation.decision.reason}`;
  }

  return `操作未执行：${toolName} 需要用户确认，但本次确认被拒绝。原因：${evaluation.decision.reason}`;
}

function buildConfirmDescription(
  toolName: string,
  args: Record<string, unknown>,
): { title: string; description: string; detail: string } {
  if (toolName === "shell_exec") {
    return {
      title: "确认执行命令",
      description: "Agent 想执行一条未进入自动通过白名单的命令。",
      detail: String(args.command ?? ""),
    };
  }

  if (toolName === "file_write") {
    return {
      title: "确认覆盖文件",
      description: "Agent 想覆盖一个已有文件。",
      detail: String(args.path ?? ""),
    };
  }

  return {
    title: "确认调用外部工具",
    description: `Agent 想调用 MCP 工具：${toolName}`,
    detail: JSON.stringify(args, null, 2),
  };
}

function ensureRunScope(
  runtime: HarnessRuntime,
  sessionId: string,
): HarnessRunScope {
  const activeRun = runtime.getActiveRunBySession(sessionId);
  if (!activeRun) {
    throw new Error("当前工具调用没有关联到有效 run。");
  }

  return {
    sessionId: activeRun.sessionId,
    runId: activeRun.runId,
  };
}

async function executeWithHarness(
  tool: AgentTool<any, any>,
  context: HarnessToolExecutionContext,
  toolCallId: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
  onUpdate?: (update: any) => void,
) {
  const runScope = ensureRunScope(context.runtime, context.sessionId);
  context.runtime.assertRunActive(runScope);
  const emitRunStateChanged = (state: string, reason?: string) => {
    context.adapter.sendRunStateChanged({
      sessionId: runScope.sessionId,
      runId: runScope.runId,
      state,
      reason,
      currentStepId: toolCallId,
    });
  };

  const evaluation = evaluateToolPolicy({
    workspacePath: context.workspacePath,
    toolName: tool.name,
    args,
  });

  context.runtime.recordToolPolicyEvaluation(runScope, evaluation, {
    toolCallId,
  });

  if (evaluation.decision.type === "deny") {
    const nextRun = context.runtime.transitionState(runScope, "running", {
      currentStepId: toolCallId,
      reason: evaluation.decision.reason,
      metadata: {
        toolName: tool.name,
        decision: evaluation.decision.type,
      },
    });
    if (nextRun) {
      emitRunStateChanged(nextRun.state, evaluation.decision.reason);
    }
    return {
      content: [
        {
          type: "text" as const,
          text: buildDecisionText(tool.name, evaluation, "deny"),
        },
      ],
      details: {
        harness: {
          decision: "deny",
          reason: evaluation.decision.reason,
          toolName: tool.name,
        },
      },
    };
  }

  if (evaluation.decision.type === "confirm") {
    const normalizedArgs = evaluation.normalizedArgs ?? args;
    const pendingRun = context.runtime.transitionState(runScope, "awaiting_confirmation", {
      currentStepId: toolCallId,
      pendingApproval: {
        kind: inferApprovalKind(tool.name),
        payloadHash: buildPayloadHash(tool.name, normalizedArgs),
        reason: evaluation.decision.reason,
        createdAt: Date.now(),
      },
      reason: evaluation.decision.reason,
      metadata: {
        toolName: tool.name,
        decision: evaluation.decision.type,
      },
    });
    if (pendingRun) {
      emitRunStateChanged(pendingRun.state, evaluation.decision.reason);
    }

    const confirmCopy = buildConfirmDescription(tool.name, normalizedArgs);
    const allowed = await context.adapter.requestConfirmation({
      title: confirmCopy.title,
      description: confirmCopy.description,
      detail: confirmCopy.detail,
    });

    if (!allowed) {
      const resumedRun = context.runtime.transitionState(runScope, "running", {
        currentStepId: toolCallId,
        pendingApproval: null,
        reason: "用户拒绝了当前操作。",
        metadata: {
          toolName: tool.name,
          decision: "reject-confirm",
        },
      });
      if (resumedRun) {
        emitRunStateChanged(resumedRun.state, "用户拒绝了当前操作。");
      }
      return {
        content: [
          {
            type: "text" as const,
            text: buildDecisionText(tool.name, evaluation, "reject-confirm"),
          },
        ],
        details: {
          harness: {
            decision: "reject-confirm",
            reason: evaluation.decision.reason,
            toolName: tool.name,
          },
        },
      };
    }
  }

  const normalizedArgs = evaluation.normalizedArgs ?? args;
  if (signal?.aborted || context.runtime.isCancelRequested(runScope)) {
    throw new HarnessRunCancelledError();
  }

  const executingRun = context.runtime.transitionState(runScope, "executing_tool", {
    currentStepId: toolCallId,
    pendingApproval: null,
    reason: "Harness 已批准工具执行。",
    metadata: {
      toolName: tool.name,
      decision: evaluation.decision.type,
    },
  });
  if (executingRun) {
    emitRunStateChanged(executingRun.state, "Harness 已批准工具执行。");
  }

  try {
    const result = await tool.execute(
      toolCallId,
      normalizedArgs,
      signal,
      onUpdate,
    );

    const resumedRun = context.runtime.transitionState(runScope, "running", {
      currentStepId: toolCallId,
      pendingApproval: null,
      reason: "工具执行完成，继续回到 agent loop。",
      metadata: {
        toolName: tool.name,
      },
    });
    if (resumedRun) {
      emitRunStateChanged(resumedRun.state, "工具执行完成，继续回到 agent loop。");
    }

    return result;
  } catch (error) {
    const resumedRun = context.runtime.transitionState(runScope, "running", {
      currentStepId: toolCallId,
      pendingApproval: null,
      reason: error instanceof Error ? error.message : "工具执行失败",
      metadata: {
        toolName: tool.name,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    if (resumedRun) {
      emitRunStateChanged(
        resumedRun.state,
        error instanceof Error ? error.message : "工具执行失败",
      );
    }
    throw error;
  }
}

function wrapToolWithHarness(
  tool: AgentTool<any, any>,
  context: HarnessToolExecutionContext,
): AgentTool<any, any> {
  return {
    ...tool,
    async execute(toolCallId, params, signal, onUpdate) {
      return executeWithHarness(
        tool,
        context,
        toolCallId,
        (params ?? {}) as Record<string, unknown>,
        signal,
        onUpdate,
      );
    },
  };
}

export function wrapToolsWithHarness(
  tools: AgentTool<any, any>[],
  context: HarnessToolExecutionContext,
): AgentTool<any, any>[] {
  return tools.map((tool) => wrapToolWithHarness(tool, context));
}
