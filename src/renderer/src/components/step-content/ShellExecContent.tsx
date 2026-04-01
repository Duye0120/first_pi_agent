import type { AgentStep } from "@shared/contracts";

type Props = { step: AgentStep };

export function ShellExecContent({ step }: Props) {
  const args = step.toolArgs ?? {};
  const details = step.toolResult as Record<string, any> | undefined;
  const command = (args.command as string) ?? "";
  const exitCode = details?.exitCode;
  const durationMs = details?.durationMs;

  // Prefer streaming output if available, otherwise use details
  const stdout = step.streamOutput ?? details?.stdout ?? "";
  const stderr = details?.stderr ?? "";

  return (
    <div className="flex flex-col gap-2 px-4 py-3 text-xs">
      {/* Command line */}
      <div className="flex items-center gap-2 font-mono">
        <span className="select-none text-text-muted">$</span>
        <code className="flex-1 text-text-secondary">{command}</code>
        {typeof exitCode === "number" && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            exitCode === 0
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}>
            exit {exitCode}
          </span>
        )}
        {typeof durationMs === "number" && (
          <span className="text-[11px] text-text-muted">
            {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
      </div>

      {/* stdout */}
      {stdout && (
        <pre className="max-h-64 overflow-auto rounded-md border border-[var(--color-code-border)] bg-code-bg p-2 font-mono text-code-text leading-5">
          {stdout}
        </pre>
      )}

      {/* stderr */}
      {stderr && (
        <div>
          <span className="text-status-err">stderr：</span>
          <pre className="mt-1 max-h-32 overflow-auto rounded-md border border-red-200 bg-red-50 p-2 font-mono text-red-800 leading-5">
            {stderr}
          </pre>
        </div>
      )}

      {step.toolError && !stderr && (
        <pre className="overflow-x-auto rounded-md border border-red-200 bg-red-50 p-2 text-red-800">
          {step.toolError}
        </pre>
      )}
    </div>
  );
}
