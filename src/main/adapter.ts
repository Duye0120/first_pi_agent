import type { BrowserWindow } from "electron";
import type { AgentEvent as CoreAgentEvent } from "@mariozechner/pi-agent-core";
import type { AgentEvent } from "../shared/agent-events.js";
import { IPC_CHANNELS } from "../shared/ipc.js";

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

      case "agent_end":
        this.send({ type: "agent_end", sessionId: this.sessionId, timestamp: now });
        break;

      case "turn_start":
        this.send({ type: "turn_start", turnIndex: 0, timestamp: now });
        break;

      case "turn_end":
        this.send({ type: "turn_end", turnIndex: 0, timestamp: now });
        break;

      case "message_start":
        this.send({ type: "message_start", role: "assistant", timestamp: now });
        break;

      case "message_end": {
        const msg = event.message;
        const usage = msg.role === "assistant" ? msg.usage : undefined;
        this.send({
          type: "message_end",
          usage: usage ? { inputTokens: usage.input, outputTokens: usage.output } : undefined,
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
