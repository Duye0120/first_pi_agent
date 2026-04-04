import { createTwoFilesPatch, parsePatch } from "diff";
import type { StructuredPatch } from "diff";
import { useMemo } from "react";

type Props = {
  oldContent: string;
  newContent: string;
  fileName?: string;
  maxHunks?: number;
};

type DiffLineType = "add" | "del" | "context";

type DiffLine = {
  type: DiffLineType;
  oldNum?: number;
  newNum?: number;
  content: string;
};

function parseDiffLines(patch: StructuredPatch): DiffLine[] {
  const lines: DiffLine[] = [];

  for (const hunk of patch.hunks) {
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;

    // Hunk separator
    lines.push({
      type: "context",
      content: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    });

    for (const line of hunk.lines) {
      const content = line.slice(1); // remove +/-/space prefix

      if (line.startsWith("+")) {
        lines.push({ type: "add", newNum: newLine++, content });
      } else if (line.startsWith("-")) {
        lines.push({ type: "del", oldNum: oldLine++, content });
      } else {
        lines.push({ type: "context", oldNum: oldLine++, newNum: newLine++, content });
      }
    }
  }

  return lines;
}

const LINE_COLORS: Record<DiffLineType, string> = {
  add: "bg-diff-add-bg text-diff-add-text",
  del: "bg-diff-del-bg text-diff-del-text",
  context: "bg-transparent text-code-text",
};

const GUTTER_COLORS: Record<DiffLineType, string> = {
  add: "text-diff-add-text/60",
  del: "text-diff-del-text/60",
  context: "text-text-muted",
};

export function DiffView({ oldContent, newContent, fileName, maxHunks }: Props) {
  const { lines, totalHunks, shownHunks } = useMemo(() => {
    const patchStr = createTwoFilesPatch(
      fileName ?? "a",
      fileName ?? "b",
      oldContent,
      newContent,
      undefined,
      undefined,
      { context: 3 }
    );
    const patches = parsePatch(patchStr);
    const patch = patches[0];
    if (!patch || patch.hunks.length === 0) {
      return { lines: [] as DiffLine[], totalHunks: 0, shownHunks: 0 };
    }

    const total = patch.hunks.length;
    const limited = maxHunks && total > maxHunks
      ? { ...patch, hunks: patch.hunks.slice(0, maxHunks) }
      : patch;

    return {
      lines: parseDiffLines(limited),
      totalHunks: total,
      shownHunks: limited.hunks.length,
    };
  }, [oldContent, newContent, fileName, maxHunks]);

  if (lines.length === 0) {
    return (
      <div className="rounded-md bg-code-bg p-3 text-xs text-text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        内容无变化
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md bg-code-bg shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="diff-view-code max-h-72 overflow-auto font-mono text-xs leading-5">
        {lines.map((line, i) => {
          // Hunk header
          if (line.type === "context" && line.content.startsWith("@@")) {
            return (
              <div
                key={i}
                className="bg-[var(--color-diff-hunk-header)] px-3 py-0.5 text-[11px] text-[var(--color-accent)]"
              >
                {line.content}
              </div>
            );
          }

          return (
            <div key={i} className={`flex ${LINE_COLORS[line.type]}`}>
              {/* Line numbers */}
              <span className={`w-8 flex-shrink-0 select-none px-1 text-right text-[10px] ${GUTTER_COLORS[line.type]}`}>
                {line.oldNum ?? ""}
              </span>
              <span className={`w-8 flex-shrink-0 select-none px-1 text-right text-[10px] ${GUTTER_COLORS[line.type]}`}>
                {line.newNum ?? ""}
              </span>
              {/* Sign */}
              <span className="w-4 flex-shrink-0 select-none text-center">
                {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
              </span>
              {/* Content */}
              <span className="flex-1 whitespace-pre-wrap break-all pr-2">{line.content}</span>
            </div>
          );
        })}
      </div>

      {maxHunks && totalHunks > shownHunks && (
        <div className="bg-code-bg px-3 py-1.5 text-center text-[11px] text-text-muted">
          显示了 {shownHunks}/{totalHunks} 个变更块
        </div>
      )}
    </div>
  );
}
