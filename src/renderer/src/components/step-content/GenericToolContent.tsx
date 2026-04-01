import type { AgentStep } from "@shared/contracts";

type Props = { step: AgentStep };

export function GenericToolContent({ step }: Props) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 text-xs font-mono">
      {step.toolArgs && Object.keys(step.toolArgs).length > 0 && (
        <div>
          <span className="text-text-muted">参数：</span>
          <pre className="mt-1 overflow-x-auto rounded-md border border-[var(--color-code-border)] bg-code-bg p-2 text-code-text">
            {JSON.stringify(step.toolArgs, null, 2)}
          </pre>
        </div>
      )}
      {step.toolResult !== undefined && (
        <div>
          <span className="text-text-muted">结果：</span>
          <pre className="mt-1 overflow-x-auto rounded-md border border-[var(--color-code-border)] bg-code-bg p-2 text-code-text">
            {typeof step.toolResult === "string"
              ? step.toolResult
              : JSON.stringify(step.toolResult, null, 2)}
          </pre>
        </div>
      )}
      {step.toolError && (
        <div>
          <span className="text-status-err">错误：</span>
          <pre className="mt-1 overflow-x-auto rounded-md border border-red-200 bg-red-50 p-2 text-red-800">
            {step.toolError}
          </pre>
        </div>
      )}
      {step.streamOutput && (
        <div>
          <span className="text-text-muted">输出：</span>
          <pre className="mt-1 max-h-48 overflow-auto rounded-md border border-[var(--color-code-border)] bg-code-bg p-2 text-code-text">
            {step.streamOutput}
          </pre>
        </div>
      )}
    </div>
  );
}
