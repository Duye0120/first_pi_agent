import type { AgentStep } from "@shared/contracts";

type Props = { step: AgentStep };

export function FileReadContent({ step }: Props) {
  const args = step.toolArgs ?? {};
  const details = step.toolResult as Record<string, any> | undefined;
  const filePath = (args.path as string) ?? "";
  const range = details?.readRange;

  // The text content is in step.toolResult or the content array
  const resultText = details && typeof details === "object"
    ? undefined // details is structured
    : typeof step.toolResult === "string"
      ? step.toolResult
      : undefined;

  // Try to get content from the step's content (text output from tool)
  const content = step.streamOutput ?? resultText;

  return (
    <div className="flex flex-col gap-2 px-4 py-3 text-xs">
      {/* File info header */}
      <div className="flex items-center gap-2 text-text-muted font-mono">
        <span className="font-semibold text-text-secondary">{filePath}</span>
        {range && (
          <span className="text-[11px]">
            第 {range.from}–{range.to} 行
            {details?.totalLines ? ` / 共 ${details.totalLines} 行` : ""}
          </span>
        )}
        {details?.truncated && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">已截断</span>
        )}
      </div>

      {/* File content */}
      {content && (
        <pre className="max-h-64 overflow-auto rounded-md border border-[var(--color-code-border)] bg-code-bg p-2 font-mono text-code-text leading-5">
          {content}
        </pre>
      )}

      {step.toolError && (
        <pre className="overflow-x-auto rounded-md border border-red-200 bg-red-50 p-2 text-red-800">
          {step.toolError}
        </pre>
      )}
    </div>
  );
}
