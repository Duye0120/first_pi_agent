import type { AgentStep } from "@shared/contracts";

type Props = { step: AgentStep };

export function WebFetchContent({ step }: Props) {
  const args = step.toolArgs ?? {};
  const details = step.toolResult as Record<string, any> | undefined;
  const url = (args.url as string) ?? "";
  const statusCode = details?.statusCode;
  const contentLength = details?.contentLength;
  const truncated = details?.truncated;

  const content = step.streamOutput ?? (typeof step.toolResult === "string" ? step.toolResult : undefined);

  return (
    <div className="flex flex-col gap-2 px-4 py-3 text-xs">
      {/* URL + status */}
      <div className="flex items-center gap-2 font-mono text-text-muted">
        <span className="max-w-[400px] truncate font-semibold text-text-secondary">{url}</span>
        {typeof statusCode === "number" && statusCode > 0 && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            statusCode >= 200 && statusCode < 300
              ? "bg-green-100 text-green-700"
              : statusCode >= 400
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-700"
          }`}>
            HTTP {statusCode}
          </span>
        )}
        {typeof contentLength === "number" && contentLength > 0 && (
          <span className="text-[11px]">
            {contentLength > 1024 ? `${(contentLength / 1024).toFixed(1)}KB` : `${contentLength}B`}
          </span>
        )}
        {truncated && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">已截断</span>
        )}
      </div>

      {/* Fetched content */}
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
