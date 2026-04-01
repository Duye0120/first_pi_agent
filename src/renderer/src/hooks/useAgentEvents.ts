import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@shared/agent-events";
import type { AgentResponse, AgentStep, ChatMessage } from "@shared/contracts";

function createStep(kind: AgentStep["kind"], id?: string): AgentStep {
  return {
    id: id ?? crypto.randomUUID(),
    kind,
    status: "executing",
    startedAt: Date.now(),
  };
}

function createResponse(id: string): AgentResponse {
  return {
    id,
    status: "running",
    steps: [],
    finalText: "",
    startedAt: Date.now(),
  };
}

/**
 * Hook that subscribes to agent events and maintains the current AgentResponse.
 * Returns the streaming response, running state, and a cancel function.
 */
export function useAgentEvents() {
  const desktopApi = window.desktopApi;

  // Mutable ref for streaming perf — avoid re-renders on every delta
  const responseRef = useRef<AgentResponse | null>(null);
  const textBufferRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const textNodeRef = useRef<HTMLElement | null>(null);

  // React state — updated at key moments (step changes, agent_end)
  const [currentResponse, setCurrentResponse] = useState<AgentResponse | null>(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);

  // Completed responses keyed by message ID
  const [responses, setResponses] = useState<Map<string, AgentResponse>>(new Map());

  // Flush text buffer to DOM via RAF
  const flushText = useCallback(() => {
    rafRef.current = null;
    if (textNodeRef.current && textBufferRef.current) {
      textNodeRef.current.textContent = textBufferRef.current;
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flushText);
    }
  }, [flushText]);

  // Process a single agent event
  const handleEvent = useCallback((event: AgentEvent) => {
    const r = responseRef.current;

    switch (event.type) {
      case "agent_start": {
        const id = crypto.randomUUID();
        const newResponse = createResponse(id);
        responseRef.current = newResponse;
        textBufferRef.current = "";
        setIsAgentRunning(true);
        setCurrentResponse({ ...newResponse });
        break;
      }

      case "thinking_delta": {
        if (!r) break;
        // Find or create thinking step
        let thinkingStep = r.steps.find(
          (s) => s.kind === "thinking" && s.status === "executing",
        );
        if (!thinkingStep) {
          thinkingStep = createStep("thinking");
          r.steps.push(thinkingStep);
          setCurrentResponse({ ...r, steps: [...r.steps] });
        }
        thinkingStep.thinkingText = (thinkingStep.thinkingText ?? "") + event.delta;
        break;
      }

      case "text_delta": {
        if (!r) break;
        r.finalText += event.delta;
        textBufferRef.current = r.finalText;
        scheduleFlush();
        break;
      }

      case "tool_execution_start": {
        if (!r) break;
        // Close any open thinking step
        const openThinking = r.steps.find(
          (s) => s.kind === "thinking" && s.status === "executing",
        );
        if (openThinking) {
          openThinking.status = "success";
          openThinking.endedAt = Date.now();
        }

        const step = createStep("tool_call", event.stepId);
        step.toolName = event.toolName;
        step.toolArgs = event.args;
        r.steps.push(step);
        setCurrentResponse({ ...r, steps: [...r.steps] });
        break;
      }

      case "tool_execution_update": {
        if (!r) break;
        const step = r.steps.find((s) => s.id === event.stepId);
        if (step) {
          step.streamOutput = (step.streamOutput ?? "") + event.output;
          // Don't trigger re-render for every update chunk — batch via RAF
        }
        break;
      }

      case "tool_execution_end": {
        if (!r) break;
        const step = r.steps.find((s) => s.id === event.stepId);
        if (step) {
          step.status = event.error ? "error" : "success";
          step.toolResult = event.result;
          step.toolError = event.error;
          step.endedAt = Date.now();
        }
        setCurrentResponse({ ...r, steps: [...r.steps] });
        break;
      }

      case "agent_error": {
        if (!r) break;
        r.status = "error";
        r.finalText += `\n\n**错误：** ${event.message}`;
        r.endedAt = Date.now();
        setCurrentResponse({ ...r });
        setIsAgentRunning(false);
        responseRef.current = null;
        break;
      }

      case "agent_end": {
        if (!r) break;
        // Close any remaining open steps
        for (const step of r.steps) {
          if (step.status === "executing") {
            step.status = "success";
            step.endedAt = step.endedAt ?? Date.now();
          }
        }
        r.status = "completed";
        r.endedAt = Date.now();
        r.totalTokens = event.totalTokens;
        r.cost = event.cost;

        // Final text sync
        textBufferRef.current = r.finalText;
        scheduleFlush();

        const finalResponse = { ...r, steps: [...r.steps] };
        setCurrentResponse(finalResponse);
        setResponses((prev) => new Map(prev).set(r.id, finalResponse));
        setIsAgentRunning(false);
        responseRef.current = null;
        break;
      }
    }
  }, [scheduleFlush]);

  // Subscribe to agent events
  useEffect(() => {
    if (!desktopApi?.agent) return;
    const cleanup = desktopApi.agent.onEvent(handleEvent);
    return cleanup;
  }, [desktopApi, handleEvent]);

  // Cancel handler
  const cancel = useCallback(() => {
    if (!desktopApi?.agent) return;
    void desktopApi.agent.cancel();
    if (responseRef.current) {
      responseRef.current.status = "cancelled";
      responseRef.current.endedAt = Date.now();
      for (const step of responseRef.current.steps) {
        if (step.status === "executing") {
          step.status = "cancelled";
          step.endedAt = Date.now();
        }
      }
      setCurrentResponse({ ...responseRef.current });
      setIsAgentRunning(false);
      responseRef.current = null;
    }
  }, [desktopApi]);

  /**
   * Build a ChatMessage from the completed response.
   * Called by App.tsx after agent_end to persist the message.
   */
  const buildAssistantMessage = useCallback((response: AgentResponse): ChatMessage => {
    return {
      id: response.id,
      role: "assistant",
      content: response.finalText,
      timestamp: new Date(response.endedAt ?? response.startedAt).toISOString(),
      status: response.status === "completed" ? "done" : "error",
      steps: response.steps,
    };
  }, []);

  return {
    currentResponse,
    isAgentRunning,
    responses,
    cancel,
    buildAssistantMessage,
    /** Ref for direct DOM text updates during streaming */
    textNodeRef,
  };
}
