import type { BrowserWindow } from "electron";
import type { AgentEvent as CoreAgentEvent } from "@mariozechner/pi-agent-core";
import type { AgentEvent } from "../shared/agent-events.js";
import { IPC_CHANNELS } from "../shared/ipc.js";
import { getSettings } from "./settings.js";

function getAssistantFinalText(event: Extract<CoreAgentEvent, { type: "message_end" }>) {
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

function getAssistantFinalThinking(event: Extract<CoreAgentEvent, { type: "message_end" }>) {
  if (event.message.role !== "assistant") {
    return undefined;
  }

  const thinking = event.message.content
    .flatMap((part) =>
      part.type === "thinking" && part.thinking.trim().length > 0 ? [part.thinking] : [],
    )
    .join("\n\n");

  return thinking || undefined;
}

/**
 * ElectronAdapter: bridges pi-agent-core events to the renderer via IPC.
 * Translates the core's event shapes into our AgentEvent union.
 */
export class ElectronAdapter {
  private window: BrowserWindow;
  private sessionId: string = "";

  constructor(window: BrowserWindow) {
    this.window = window;
  }

  /** Current workspace path from settings */
  get workspacePath(): string {
    return getSettings().workspace;
  }

  setSessionId(id: string): void {
    this.sessionId = id;
  }

  /** Send a typed AgentEvent to the renderer */
  send(event: AgentEvent): void {
    if (!this.window.isDestroyed()) {
      this.window.webContents.send(IPC_CHANNELS.agentEvent, event);
    }
  }

  /**
   * Map a pi-agent-core event to our AgentEvent(s) and send to renderer.
   * Some core events map to multiple of our events.
   */
  handleCoreEvent(event: CoreAgentEvent): void {
    const now = Date.now();

    switch (event.type) {
      case "agent_start":
        this.send({ type: "agent_start", sessionId: this.sessionId, timestamp: now });
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
          this.send({ type: "agent_error", message: errorMessage, timestamp: now });
          break;
        }

        this.send({ type: "agent_end", sessionId: this.sessionId, timestamp: now });
        break;
      }

      case "turn_start":
        this.send({ type: "turn_start", turnIndex: 0, timestamp: now });
        break;

      case "turn_end":
        this.send({ type: "turn_end", turnIndex: 0, timestamp: now });
        break;

      case "message_start":
        if (event.message.role !== "assistant") {
          break;
        }
        this.send({ type: "message_start", role: "assistant", timestamp: now });
        break;

      case "message_end": {
        const msg = event.message;
        if (msg.role !== "assistant") {
          break;
        }
        const usage = msg.role === "assistant" ? msg.usage : undefined;
        this.send({
          type: "message_end",
          usage: usage ? { inputTokens: usage.input, outputTokens: usage.output } : undefined,
          finalText: getAssistantFinalText(event),
          finalThinking: getAssistantFinalThinking(event),
          timestamp: now,
        });
        break;
      }

      case "message_update": {
        const sub = event.assistantMessageEvent;
        if (sub.type === "thinking_delta") {
          this.send({ type: "thinking_delta", delta: sub.delta, timestamp: now });
        } else if (sub.type === "text_delta") {
          this.send({ type: "text_delta", delta: sub.delta, timestamp: now });
        }
        // toolcall_start/delta/end are handled via tool_execution_* events
        break;
      }

      case "tool_execution_start":
        this.send({
          type: "tool_execution_start",
          stepId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          timestamp: now,
        });
        break;

      case "tool_execution_update":
        this.send({
          type: "tool_execution_update",
          stepId: event.toolCallId,
          output: typeof event.partialResult === "string"
            ? event.partialResult
            : JSON.stringify(event.partialResult),
          timestamp: now,
        });
        break;

      case "tool_execution_end":
        this.send({
          type: "tool_execution_end",
          stepId: event.toolCallId,
          result: event.result,
          error: event.isError ? String(event.result) : undefined,
          durationMs: 0, // pi-agent-core doesn't track this; we'll calculate in renderer
          timestamp: now,
        });
        break;
    }
  }
}
