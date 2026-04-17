import { randomUUID } from "node:crypto";
import { dialog, type BrowserWindow } from "electron";
import type { AgentEvent as CoreAgentEvent } from "@mariozechner/pi-agent-core";
import type {
  AgentEvent,
  AgentEventScope,
  ConfirmationResponse,
} from "../shared/agent-events.js";
import type { HarnessApprovalResolution } from "./harness/types.js";
import type { AgentStep, ChatMessage, RuntimeSkillUsage } from "../shared/contracts.js";
import { extractRuntimeSkillUsages } from "../shared/skill-usage.js";
import { IPC_CHANNELS } from "../shared/ipc.js";
import { getSettings } from "./settings.js";
import { appLogger } from "./logger.js";
import {
  appendConfirmationRequestedEvent,
  appendConfirmationResolvedEvent,
  appendRunStateChangedEvent,
  appendToolFinishedEvent,
  appendToolStartedEvent,
} from "./session/service.js";

type TerminalEventFallback =
  | { type: "agent_end" }
  | { type: "agent_error"; message: string };

type RunBuffer = {
  startedAt: number;
  finalText: string;
  usage?: { inputTokens: number; outputTokens: number };
  steps: AgentStep[];
  skillUsages: RuntimeSkillUsage[];
  lastStopReason?: string;
};

function stringifyPartialResult(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value ?? "");
  }
}

function createStep(kind: AgentStep["kind"], id?: string): AgentStep {
  return {
    id: id ?? randomUUID(),
    kind,
    status: "executing",
    startedAt: Date.now(),
  };
}

function getAssistantFinalText(
  event: Extract<CoreAgentEvent, { type: "message_end" }>,
) {
  if (event.message.role !== "assistant") {
    return undefined;
  }

  const text = event.message.content
    .flatMap((part) =>
      part.type === "text" && part.text.trim().length > 0 ? [part.text] : [],
    )
    .join("");

  return text || undefined;
}

function getAssistantFinalThinking(
  event: Extract<CoreAgentEvent, { type: "message_end" }>,
) {
  if (event.message.role !== "assistant") {
    return undefined;
  }

  const thinking = event.message.content
    .flatMap((part) =>
      part.type === "thinking" && part.thinking.trim().length > 0
        ? [part.thinking]
        : [],
    )
    .join("\n\n");

  return thinking || undefined;
}

function getLatestThinkingStep(steps: AgentStep[]) {
  return [...steps].reverse().find((step) => step.kind === "thinking");
}

function mergeRuntimeSkillUsages(
  current: RuntimeSkillUsage[],
  next: RuntimeSkillUsage[],
) {
  const byKey = new Map<string, RuntimeSkillUsage>();
  for (const item of current) {
    byKey.set(`${item.skillId}:${item.entryPointId}`, item);
  }
  for (const item of next) {
    byKey.set(`${item.skillId}:${item.entryPointId}`, item);
  }
  return [...byKey.values()];
}

export class ElectronAdapter {
  private readonly window: BrowserWindow;
  private readonly scope: AgentEventScope;
  private readonly buffer: RunBuffer;
  private pendingTerminalEvent: AgentEvent | null = null;
  private terminalEventFlushed = false;

  constructor(window: BrowserWindow, scope: AgentEventScope) {
    this.window = window;
    this.scope = scope;
    this.buffer = {
      startedAt: Date.now(),
      finalText: "",
      steps: [],
      skillUsages: [],
    };
  }

  send(event: AgentEvent): void {
    if (!this.window.isDestroyed()) {
      this.window.webContents.send(IPC_CHANNELS.agentEvent, event);
    }
  }

  sendRunStateChanged(input: {
    sessionId: string;
    runId: string;
    state: string;
    reason?: string;
    currentStepId?: string;
  }): void {
    appendRunStateChangedEvent({
      sessionId: input.sessionId,
      runId: input.runId,
      state: input.state,
      reason: input.reason,
      currentStepId: input.currentStepId,
    });

    this.send({
      type: "run_state_changed",
      sessionId: input.sessionId,
      runId: input.runId,
      state: input.state,
      reason: input.reason,
      currentStepId: input.currentStepId,
      timestamp: Date.now(),
    });
  }

  async presentConfirmationRequest(input: {
    requestId: string;
    title: string;
    description: string;
    detail?: string;
  }): Promise<ConfirmationResponse | null> {
    appendConfirmationRequestedEvent({
      sessionId: this.scope.sessionId,
      runId: this.scope.runId,
      requestId: input.requestId,
      title: input.title,
      description: input.description,
      detail: input.detail,
    });
    this.send({
      type: "confirmation_request",
      sessionId: this.scope.sessionId,
      runId: this.scope.runId,
      requestId: input.requestId,
      title: input.title,
      description: input.description,
      detail: input.detail,
      timestamp: Date.now(),
    });

    if (this.window.isDestroyed()) {
      return {
        requestId: input.requestId,
        allowed: false,
      };
    }

    if (this.prefersInlineConfirmation()) {
      return null;
    }

    const result = await dialog.showMessageBox(this.window, {
      type: "warning",
      buttons: ["拒绝", "允许"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: input.title,
      message: input.description,
      detail: input.detail,
    });

    return {
      requestId: input.requestId,
      allowed: result.response === 1,
    };
  }

  prefersInlineConfirmation(): boolean {
    return !this.window.isDestroyed();
  }

  recordConfirmationResolution(resolution: HarnessApprovalResolution): void {
    appendConfirmationResolvedEvent({
      sessionId: this.scope.sessionId,
      runId: this.scope.runId,
      requestId: resolution.requestId,
      allowed: resolution.allowed,
    });
  }

  handleCoreEvent(event: CoreAgentEvent): void {
    const now = Date.now();
    const { sessionId, runId } = this.scope;

    switch (event.type) {
      case "agent_start":
        this.send({ type: "agent_start", sessionId, runId, timestamp: now });
        break;

      case "agent_end": {
        const errorMessage = [...event.messages]
          .reverse()
          .flatMap((message) =>
            message.role === "assistant" && message.errorMessage
              ? [message.errorMessage]
              : [],
          )[0];

        if (errorMessage) {
          this.queueTerminalError(errorMessage);
          break;
        }

        this.queueTerminalEnd();
        break;
      }

      case "turn_start":
        this.send({
          type: "turn_start",
          sessionId,
          runId,
          turnIndex: 0,
          timestamp: now,
        });
        break;

      case "turn_end":
        this.send({
          type: "turn_end",
          sessionId,
          runId,
          turnIndex: 0,
          timestamp: now,
        });
        break;

      case "message_start":
        if (event.message.role !== "assistant") {
          break;
        }
        this.send({
          type: "message_start",
          sessionId,
          runId,
          role: "assistant",
          timestamp: now,
        });
        break;

      case "message_end": {
        const message = event.message;
        if (message.role !== "assistant") {
          break;
        }

        // 捕获 stop reason 用于 max_output_tokens 续写检测
        const stopReason = (message as unknown as Record<string, unknown>).stopReason;
        if (typeof stopReason === "string") {
          this.buffer.lastStopReason = stopReason;
        }

        const usage = message.usage
          ? { inputTokens: message.usage.input, outputTokens: message.usage.output }
          : undefined;
        this.buffer.usage = usage;

        const finalThinking = getAssistantFinalThinking(event);
        if (finalThinking?.trim()) {
          const thinkingStep = getLatestThinkingStep(this.buffer.steps);
          if (thinkingStep) {
            if (!thinkingStep.thinkingText?.trim()) {
              thinkingStep.thinkingText = finalThinking;
            }
          } else {
            const nextThinking = createStep("thinking");
            nextThinking.thinkingText = finalThinking;
            nextThinking.status = "success";
            nextThinking.endedAt = now;
            this.buffer.steps.push(nextThinking);
          }
        }

        const finalText = getAssistantFinalText(event);
        if (typeof finalText === "string") {
          this.buffer.finalText = finalText;
        }

        this.send({
          type: "message_end",
          sessionId,
          runId,
          usage,
          finalText,
          finalThinking,
          timestamp: now,
        });
        break;
      }

      case "message_update": {
        const sub = event.assistantMessageEvent;
        if (sub.type === "thinking_delta") {
          let step = this.buffer.steps.find(
            (item) => item.kind === "thinking" && item.status === "executing",
          );

          if (!step) {
            step = createStep("thinking");
            this.buffer.steps.push(step);
          }

          step.thinkingText = (step.thinkingText ?? "") + sub.delta;
          this.send({
            type: "thinking_delta",
            sessionId,
            runId,
            delta: sub.delta,
            timestamp: now,
          });
        } else if (sub.type === "text_delta") {
          this.buffer.finalText += sub.delta;
          this.send({
            type: "text_delta",
            sessionId,
            runId,
            delta: sub.delta,
            timestamp: now,
          });
        }
        break;
      }

      case "tool_execution_start": {
        const thinking = this.buffer.steps.find(
          (item) => item.kind === "thinking" && item.status === "executing",
        );
        if (thinking) {
          thinking.status = "success";
          thinking.endedAt = now;
        }

        const step = createStep("tool_call", event.toolCallId);
        step.toolName = event.toolName;
        step.toolArgs = event.args;
        this.buffer.steps.push(step);

        appendToolStartedEvent({
          sessionId,
          runId,
          stepId: event.toolCallId,
          toolName: event.toolName,
          args: event.args as Record<string, unknown>,
        });
        this.send({
          type: "tool_execution_start",
          sessionId,
          runId,
          stepId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          timestamp: now,
        });
        break;
      }

      case "tool_execution_update": {
        const step = this.buffer.steps.find((item) => item.id === event.toolCallId);
        if (step) {
          const chunk = stringifyPartialResult(event.partialResult);
          step.streamOutput = (step.streamOutput ?? "") + chunk;
        }

        this.send({
          type: "tool_execution_update",
          sessionId,
          runId,
          stepId: event.toolCallId,
          output: stringifyPartialResult(event.partialResult),
          timestamp: now,
        });
        break;
      }

      case "tool_execution_end": {
        const step = this.buffer.steps.find((item) => item.id === event.toolCallId);
        if (step) {
          step.status = event.isError ? "error" : "success";
          step.toolResult = event.result;
          step.toolError = event.isError ? String(event.result) : undefined;
          step.endedAt = now;
        }
        const skillUsages = extractRuntimeSkillUsages(event.result);
        if (skillUsages.length > 0) {
          this.buffer.skillUsages = mergeRuntimeSkillUsages(
            this.buffer.skillUsages,
            skillUsages,
          );
        }

        appendToolFinishedEvent({
          sessionId,
          runId,
          stepId: event.toolCallId,
          toolName: event.toolName,
          result: event.isError ? undefined : event.result,
          error: event.isError ? String(event.result) : undefined,
        });
        if (event.isError) {
          appLogger.warn({
            scope: "agent.tool",
            message: "工具执行失败",
            data: {
              sessionId,
              runId,
              stepId: event.toolCallId,
              toolName: event.toolName,
            },
            error: event.result,
          });
        }
        this.send({
          type: "tool_execution_end",
          sessionId,
          runId,
          stepId: event.toolCallId,
          result: event.result,
          error: event.isError ? String(event.result) : undefined,
          durationMs: 0,
          timestamp: now,
        });
        break;
      }
    }
  }

  queueTerminalEnd(): void {
    if (this.terminalEventFlushed) {
      return;
    }

    this.pendingTerminalEvent = {
      type: "agent_end",
      sessionId: this.scope.sessionId,
      runId: this.scope.runId,
      timestamp: Date.now(),
    };
  }

  queueTerminalError(message: string): void {
    if (this.terminalEventFlushed) {
      return;
    }

    appLogger.error({
      scope: "agent.runtime",
      message: "Agent 终止于错误",
      data: {
        sessionId: this.scope.sessionId,
        runId: this.scope.runId,
      },
      error: message,
    });

    this.pendingTerminalEvent = {
      type: "agent_error",
      sessionId: this.scope.sessionId,
      runId: this.scope.runId,
      message,
      timestamp: Date.now(),
    };
  }

  flushTerminalEvent(fallback?: TerminalEventFallback): void {
    if (this.terminalEventFlushed) {
      return;
    }

    if (!this.pendingTerminalEvent) {
      if (fallback?.type === "agent_error") {
        this.queueTerminalError(fallback.message);
      } else {
        this.queueTerminalEnd();
      }
    }

    if (this.pendingTerminalEvent) {
      this.send(this.pendingTerminalEvent);
      this.pendingTerminalEvent = null;
      this.terminalEventFlushed = true;
    }
  }

  buildAssistantMessage(
    status: "completed" | "error" | "cancelled",
    fallbackText?: string,
  ): ChatMessage | null {
    const finalText =
      this.buffer.finalText.trim() || (fallbackText ? fallbackText.trim() : "");
    const steps = this.buffer.steps.map((step) => ({ ...step }));
    const endedAt = Date.now();

    for (const step of steps) {
      if (step.status === "executing") {
        step.status = status === "cancelled" ? "cancelled" : "success";
        step.endedAt = step.endedAt ?? endedAt;
      }
    }

    if (!finalText && steps.length === 0 && !this.buffer.usage) {
      return null;
    }

    return {
      id: `assistant-${this.scope.runId}`,
      role: "assistant",
      content: finalText,
      timestamp: new Date(endedAt).toISOString(),
      status: status === "completed" ? "done" : "error",
      usage: this.buffer.usage,
      meta:
        this.buffer.skillUsages.length > 0
          ? {
              skillUsages: this.buffer.skillUsages,
            }
          : undefined,
      steps,
    };
  }

  /** 获取最后一次 message_end 的 stop reason，用于 max_output_tokens 检测 */
  getLastStopReason(): string | undefined {
    return this.buffer.lastStopReason;
  }

  get workspacePath(): string {
    return getSettings().workspace;
  }
}
