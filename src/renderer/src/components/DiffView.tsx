import { FileImageIcon, FileWarningIcon, ImageOffIcon } from "lucide-react";
import { useEffect, useMemo, useState, useRef } from "react";
import { createTwoFilesPatch, parsePatch } from "diff";
import type { StructuredPatch } from "diff";
import type { GitDiffFile } from "@shared/contracts";
import { cn } from "@renderer/lib/utils";

type SharedProps = {
  fileName?: string;
  maxHunks?: number;
  maxLines?: number;
  kind?: GitDiffFile["kind"];
  previewPath?: string;
  status?: GitDiffFile["status"];
  layout?: "vertical" | "horizontal";
};

type Props =
  | (SharedProps & {
      oldContent: string;
      newContent: string;
      patch?: never;
    })
  | (SharedProps & {
      patch: string;
      oldContent?: never;
      newContent?: never;
    });

type DiffLineType = "add" | "del" | "context" | "meta";

type DiffLine = {
  type: DiffLineType;
  oldNum?: number;
  newNum?: number;
  content: string;
};

type DiffState = {
  lines: DiffLine[];
  totalHunks: number;
  shownHunks: number;
  totalLines: number;
  shownLines: number;
  rawPatch?: string;
};

function parseDiffLines(patch: StructuredPatch): DiffLine[] {
  const lines: DiffLine[] = [];

  for (const hunk of patch.hunks) {
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;

    lines.push({
      type: "meta",
      content: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    });

    for (const line of hunk.lines) {
      if (line.startsWith("\\")) {
        lines.push({ type: "meta", content: line });
        continue;
      }

      const content = line.slice(1);

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

const LINE_COLORS: Record<Exclude<DiffLineType, "meta">, string> = {
  add: "bg-diff-add-bg text-diff-add-text",
  del: "bg-diff-del-bg text-diff-del-text",
  context: "bg-transparent text-code-text",
};

const GUTTER_COLORS: Record<DiffLineType, string> = {
  add: "text-diff-add-text/60",
  del: "text-diff-del-text/60",
  context: "text-text-muted",
  meta: "text-[var(--color-accent)]",
};

function DiffImagePreview({
  fileName,
  previewPath,
  status,
}: {
  fileName?: string;
  previewPath?: string;
  status?: GitDiffFile["status"];
}) {
  const [imageUrl, setImageUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!previewPath) {
      setImageUrl(null);
      return;
    }

    let cancelled = false;
    setImageUrl(undefined);

    void window.desktopApi?.files.readImageDataUrl(previewPath).then((dataUrl) => {
      if (!cancelled) {
        setImageUrl(dataUrl);
      }
    }).catch(() => {
      if (!cancelled) {
        setImageUrl(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [previewPath]);

  return (
    <div className="bg-shell-panel px-4 py-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileImageIcon className="size-4" />
        <span>{status === "deleted" ? "图片已删除，无法按当前工作区预览。" : "图片文件预览"}</span>
      </div>

      <div className="mt-3 grid min-h-[180px] place-items-center overflow-hidden rounded-[14px] bg-black/20 px-4 py-4">
        {imageUrl === undefined ? (
          <p className="text-sm text-muted-foreground">正在读取图片预览…</p>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={fileName ?? "Diff image preview"}
            className="block h-auto max-h-[320px] w-auto max-w-full rounded-[12px] object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
            <ImageOffIcon className="size-5" />
            <p>当前图片没有可展示的工作区预览。</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DiffBinaryPreview({ status }: { status?: GitDiffFile["status"] }) {
  return (
    <div className="bg-shell-panel px-4 py-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileWarningIcon className="size-4" />
        <span>{status === "deleted" ? "二进制文件已删除" : "二进制文件"}</span>
      </div>
      <div className="mt-3 grid min-h-[160px] place-items-center rounded-[14px] bg-code-bg px-4 py-4 text-center">
        <div className="max-w-[260px]">
          <p className="text-sm font-medium text-foreground">暂不支持文本差异预览</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            当前文件没有可读的文本 patch，保留文件状态与基础信息展示。
          </p>
        </div>
      </div>
    </div>
  );
}

type DiffSplitRow = {
  isMeta?: boolean;
  meta?: DiffLine;
  left?: DiffLine | null;
  right?: DiffLine | null;
};

function buildSplitRows(lines: DiffLine[]): DiffSplitRow[] {
  const rows: DiffSplitRow[] = [];
  let delBuffer: DiffLine[] = [];
  let addBuffer: DiffLine[] = [];

  function flush() {
    const max = Math.max(delBuffer.length, addBuffer.length);
    for (let i = 0; i < max; i++) {
      rows.push({
        left: delBuffer[i] || null,
        right: addBuffer[i] || null,
      });
    }
    delBuffer = [];
    addBuffer = [];
  }

  for (const line of lines) {
    if (line.type === "del") {
      delBuffer.push(line);
    } else if (line.type === "add") {
      addBuffer.push(line);
    } else {
      flush();
      if (line.type === "meta") {
        rows.push({ isMeta: true, meta: line });
      } else if (line.type === "context") {
        rows.push({ left: line, right: line });
      }
    }
  }
  flush();
  return rows;
}

function TextDiffView({ diffState, maxHunks, maxLines, layout = "vertical" }: {
  diffState: DiffState;
  maxHunks?: number;
  maxLines?: number;
  layout?: "vertical" | "horizontal";
}) {
  const { lines, totalHunks, shownHunks, totalLines, shownLines } = diffState;

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = (source: 'left' | 'right') => (e: React.UIEvent<HTMLDivElement>) => {
    if (source === 'left' && rightScrollRef.current && rightScrollRef.current.scrollLeft !== e.currentTarget.scrollLeft) {
      rightScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    } else if (source === 'right' && leftScrollRef.current && leftScrollRef.current.scrollLeft !== e.currentTarget.scrollLeft) {
      leftScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  if (lines.length === 0) {
    if (diffState.rawPatch) {
      return (
        <div className="overflow-hidden bg-code-bg">
          <pre className="diff-view-code max-h-[420px] overflow-auto px-4 py-3 text-xs leading-6 text-code-text">
            {diffState.rawPatch}
          </pre>
        </div>
      );
    }

    return (
      <div className="bg-shell-panel px-4 py-3 text-xs text-text-muted">
        内容无变化
      </div>
    );
  }

  const renderHorizontal = () => {
    const splitRows = buildSplitRows(lines);
    return (
      <div className="flex w-full divide-x divide-border">
        {/* Left Pane */}
        <div 
          ref={leftScrollRef} 
          className="flex-1 overflow-x-auto pb-4" 
          onScroll={handleScroll('left')}
        >
          <div className="diff-view-code w-max min-w-full font-mono text-[11px] leading-5">
            {splitRows.map((row, index) => {
              if (row.isMeta && row.meta) {
                const isHunkHeader = row.meta.content.startsWith("@@");
                return (
                  <div
                    key={index}
                    className={cn(
                      "sticky left-0 w-full min-w-full px-3 py-1",
                      isHunkHeader ? "bg-[var(--color-diff-hunk-header)] text-[var(--color-accent)]" : "text-text-muted bg-transparent"
                    )}
                  >
                    {row.meta.content}
                  </div>
                );
              }
              const line = row.left;
              if (!line) {
                return (
                  <div key={index} className="flex h-5 min-w-full items-center bg-transparent">
                    <span className="w-10 shrink-0 bg-transparent" />
                    <span className="w-6 shrink-0 bg-transparent" />
                    <span className="bg-transparent" />
                  </div>
                );
              }
              return (
                <div key={index} className={`flex h-5 min-w-full items-center ${LINE_COLORS[line.type as Exclude<DiffLineType, "meta">]}`}>
                  <span className={`w-10 shrink-0 select-none px-1.5 text-right text-[9px] ${GUTTER_COLORS[line.type]}`}>
                    {line.oldNum ?? ""}
                  </span>
                  <span className="w-6 shrink-0 select-none text-center text-[10px]">
                    {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                  </span>
                  <span className="whitespace-pre pr-4 pt-[1px]">
                    {line.content}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Pane */}
        <div 
          ref={rightScrollRef} 
          className="flex-1 overflow-x-auto pb-4" 
          onScroll={handleScroll('right')}
        >
          <div className="diff-view-code w-max min-w-full font-mono text-[11px] leading-5">
            {splitRows.map((row, index) => {
              if (row.isMeta && row.meta) {
                const isHunkHeader = row.meta.content.startsWith("@@");
                return (
                  <div
                    key={index}
                    className={cn(
                      "pointer-events-none w-full min-w-full select-none py-1 text-transparent",
                      isHunkHeader ? "bg-[var(--color-diff-hunk-header)]" : "bg-transparent"
                    )}
                  >
                    {row.meta.content}
                  </div>
                );
              }
              const line = row.right;
              if (!line) {
                return (
                  <div key={index} className="flex h-5 min-w-full items-center bg-transparent">
                    <span className="w-10 shrink-0 bg-transparent" />
                    <span className="w-6 shrink-0 bg-transparent" />
                    <span className="bg-transparent" />
                  </div>
                );
              }
              return (
                <div key={index} className={`flex h-5 min-w-full items-center ${LINE_COLORS[line.type as Exclude<DiffLineType, "meta">]}`}>
                  <span className={`w-10 shrink-0 select-none px-1.5 text-right text-[9px] ${GUTTER_COLORS[line.type]}`}>
                    {line.newNum ?? ""}
                  </span>
                  <span className="w-6 shrink-0 select-none text-center text-[10px]">
                    {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                  </span>
                  <span className="whitespace-pre pr-4 pt-[1px]">
                    {line.content}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderVertical = () => {
    return (
      <div className="diff-view-code min-w-full w-max font-mono text-xs leading-5">
        {lines.map((line, index) => {
          if (line.type === "meta" && line.content.startsWith("@@")) {
            return (
              <div
                key={index}
                className="bg-[var(--color-diff-hunk-header)] px-3 py-1 text-[11px] text-[var(--color-accent)]"
              >
                {line.content}
              </div>
            );
          }

          if (line.type === "meta") {
            return (
              <div key={index} className="px-3 py-0.5 text-[11px] text-text-muted">
                {line.content}
              </div>
            );
          }

          return (
            <div key={index} className={`grid min-w-full grid-cols-[3.5rem_3.5rem_1.5rem_auto] ${LINE_COLORS[line.type]}`}>
              <span className={`select-none px-2 py-0.5 text-right text-[10px] ${GUTTER_COLORS[line.type]}`}>
                {line.oldNum ?? ""}
              </span>
              <span className={`select-none px-2 py-0.5 text-right text-[10px] ${GUTTER_COLORS[line.type]}`}>
                {line.newNum ?? ""}
              </span>
              <span className="select-none py-0.5 text-center">
                {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
              </span>
              <span className="whitespace-pre py-0.5 pr-4">
                {line.content}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="overflow-hidden bg-code-bg">
      <div className="max-h-[420px] overflow-auto">
        {layout === "horizontal" ? renderHorizontal() : renderVertical()}
      </div>

      {(maxHunks && totalHunks > shownHunks) || (maxLines && totalLines > shownLines) ? (
        <div className="bg-code-bg px-3 py-2 text-center text-[11px] text-text-muted">
          {[
            maxHunks && totalHunks > shownHunks ? `变更块 ${shownHunks}/${totalHunks}` : null,
            maxLines && totalLines > shownLines ? `行数 ${shownLines}/${totalLines}` : null,
          ].filter(Boolean).join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

export function DiffView(props: Props) {
  const diffState = useMemo<DiffState>(() => {
    const patchStr: string =
      "patch" in props && typeof props.patch === "string"
        ? props.patch
        : createTwoFilesPatch(
            props.fileName ?? "a",
            props.fileName ?? "b",
            props.oldContent,
            props.newContent,
            undefined,
            undefined,
            { context: 3 },
          );
    const patches = parsePatch(patchStr);
    const patch = patches[0];

    if (!patch || patch.hunks.length === 0) {
      return {
        lines: [],
        totalHunks: 0,
        shownHunks: 0,
        totalLines: 0,
        shownLines: 0,
        rawPatch: patchStr.trim() ? patchStr : undefined,
      };
    }

    const totalHunks = patch.hunks.length;
    const limitedHunks =
      props.maxHunks && totalHunks > props.maxHunks
        ? patch.hunks.slice(0, props.maxHunks)
        : patch.hunks;
    const parsedLines = parseDiffLines({ ...patch, hunks: limitedHunks });
    const totalLines = parseDiffLines(patch).length;
    const shownLines =
      props.maxLines && parsedLines.length > props.maxLines
        ? props.maxLines
        : parsedLines.length;

    return {
      lines: props.maxLines ? parsedLines.slice(0, props.maxLines) : parsedLines,
      totalHunks,
      shownHunks: limitedHunks.length,
      totalLines,
      shownLines,
      rawPatch: patchStr.trim() ? patchStr : undefined,
    };
  }, [props]);

  if (props.kind === "image") {
    return (
      <DiffImagePreview
        fileName={props.fileName}
        previewPath={props.previewPath}
        status={props.status}
      />
    );
  }

  if (props.kind === "binary") {
    return <DiffBinaryPreview status={props.status} />;
  }

  return (
    <TextDiffView
      diffState={diffState}
      maxHunks={props.maxHunks}
      maxLines={props.maxLines}
      layout={props.layout}
    />
  );
}
