import { FileImageIcon, FileWarningIcon, ImageOffIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createTwoFilesPatch, parsePatch } from "diff";
import type { StructuredPatch } from "diff";
import type { GitDiffFile } from "@shared/contracts";

type SharedProps = {
  fileName?: string;
  maxHunks?: number;
  maxLines?: number;
  kind?: GitDiffFile["kind"];
  previewPath?: string;
  status?: GitDiffFile["status"];
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
    <div className="rounded-[16px] bg-shell-panel px-4 py-4">
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
    <div className="rounded-[16px] bg-shell-panel px-4 py-4">
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

function TextDiffView({ diffState, maxHunks, maxLines }: {
  diffState: DiffState;
  maxHunks?: number;
  maxLines?: number;
}) {
  const { lines, totalHunks, shownHunks, totalLines, shownLines } = diffState;

  if (lines.length === 0) {
    if (diffState.rawPatch) {
      return (
        <div className="overflow-hidden rounded-[16px] bg-code-bg">
          <pre className="diff-view-code max-h-[420px] overflow-auto px-4 py-3 text-xs leading-6 text-code-text">
            {diffState.rawPatch}
          </pre>
        </div>
      );
    }

    return (
      <div className="rounded-[16px] bg-shell-panel px-4 py-3 text-xs text-text-muted">
        内容无变化
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[16px] bg-code-bg">
      <div className="max-h-[420px] overflow-auto">
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
    />
  );
}
