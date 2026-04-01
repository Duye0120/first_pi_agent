import type { AgentStep } from "@shared/contracts";
import { DiffView } from "../DiffView";

type Props = { step: AgentStep };

export function FileWriteContent({ step }: Props) {
  const args = step.toolArgs ?? {};
  const details = step.toolResult as Record<string, any> | undefined;
  const filePath = (args.path as string) ?? "";
  const mode = (args.mode as string) ?? "overwrite";
  const isNew = details?.isNew;
  const size = details?.size;
  const previousContent = details?.previousContent;
  const newContent = details?.newContent ?? (typeof args.content === "string" ? (args.content as string) : undefined);

  const canShowDiff = typeof previousContent === "string" && typeof newContent === "string";

  return (
    <div className="flex flex-col gap-2 px-4 py-3 text-xs">
      {/* File info */}
      <div className="flex items-center gap-2 font-mono text-text-muted">
        <span className="font-semibold text-text-secondary">{filePath}</span>
        {isNew && (
          <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">新建</span>
        )}
        {mode === "append" && (
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">追加</span>
        )}
        {typeof size === "number" && (
          <span className="text-[11px]">{size} 字节</span>
        )}
      </div>

      {/* Diff preview (when we have both old and new content) */}
      {canShowDiff && (
        <DiffView
          oldContent={previousContent}
          newContent={newContent}
          fileName={filePath}
          maxHunks={3}
        />
      )}

      {/* New file: show content directly */}
      {isNew && typeof newContent === "string" && !canShowDiff && (
        <DiffView
          oldContent=""
          newContent={newContent}
          fileName={filePath}
          maxHunks={3}
        />
      )}

      {/* Fallback: show raw content if no diff available */}
      {!canShowDiff && !isNew && typeof args.content === "string" && (
        <div>
          <span className="text-text-muted">写入内容：</span>
          <pre className="mt-1 max-h-48 overflow-auto rounded-md border border-[var(--color-code-border)] bg-code-bg p-2 font-mono text-code-text leading-5">
            {(args.content as string).length > 2000
              ? (args.content as string).slice(0, 2000) + "\n\n[内容过长，已截断预览]"
              : (args.content as string)}
          </pre>
        </div>
      )}

      {step.toolError && (
        <pre className="overflow-x-auto rounded-md border border-red-200 bg-red-50 p-2 text-red-800">
          {step.toolError}
        </pre>
      )}
    </div>
  );
}
