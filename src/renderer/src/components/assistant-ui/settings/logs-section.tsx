import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DiagnosticLogBundle,
  DiagnosticLogId,
  DiagnosticLogSnapshot,
} from "@shared/contracts";
import { formatDateTimeInTimeZone } from "@shared/timezone";
import { Button } from "@renderer/components/assistant-ui/button";
import { cn } from "@renderer/lib/utils";

const LOG_DATE_KEYS = new Set([
  "timestamp",
  "generatedAt",
  "createdAt",
  "updatedAt",
  "startedAt",
  "endedAt",
  "respondedAt",
  "interruptedAt",
]);

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(value: string | null, timeZone: string): string {
  if (!value) {
    return "—";
  }

  try {
    return formatDateTimeInTimeZone(value, timeZone);
  } catch {
    return value;
  }
}

function normalizeLogTimestamp(
  value: string | number,
  timeZone: string,
): string | number {
  const parsed = typeof value === "number" ? new Date(value) : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return formatDateTimeInTimeZone(parsed, timeZone);
}

function normalizeLogValue(value: unknown, timeZone: string, key?: string): unknown {
  if (key && LOG_DATE_KEYS.has(key)) {
    if (typeof value === "string" || typeof value === "number") {
      return normalizeLogTimestamp(value, timeZone);
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeLogValue(item, timeZone));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      normalizeLogValue(entryValue, timeZone, entryKey),
    ]),
  );
}

function formatLogTail(tail: string, timeZone: string): string {
  const lines = tail
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return "";
  }

  return lines
    .map((line) => {
      try {
        const parsed = JSON.parse(line);
        return JSON.stringify(normalizeLogValue(parsed, timeZone), null, 2);
      } catch {
        return line;
      }
    })
    .join("\n\n");
}

function MetaItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-[12px] text-foreground">{value}</p>
    </div>
  );
}

export function LogsSection({ timeZone }: { timeZone: string }) {
  const desktopApi = window.desktopApi;
  const [bundle, setBundle] = useState<DiagnosticLogBundle | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<DiagnosticLogId>("app");
  const [loading, setLoading] = useState(false);
  const [openingFolder, setOpeningFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    if (!desktopApi) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextBundle = await desktopApi.settings.getLogSnapshot();
      setBundle(nextBundle);
      if (!nextBundle.files.some((file) => file.id === selectedLogId)) {
        setSelectedLogId(nextBundle.files[0]?.id ?? "app");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取日志失败");
    } finally {
      setLoading(false);
    }
  }, [desktopApi, selectedLogId]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const currentFile = useMemo<DiagnosticLogSnapshot | null>(() => {
    if (!bundle) {
      return null;
    }

    return (
      bundle.files.find((file) => file.id === selectedLogId) ??
      bundle.files[0] ??
      null
    );
  }, [bundle, selectedLogId]);

  const formattedTail = useMemo(
    () => formatLogTail(currentFile?.tail ?? "", timeZone),
    [currentFile?.tail, timeZone],
  );

  const handleOpenFolder = useCallback(async () => {
    if (!desktopApi) {
      return;
    }

    setOpeningFolder(true);
    setError(null);
    try {
      await desktopApi.settings.openLogFolder(selectedLogId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "打开文件夹失败");
    } finally {
      setOpeningFolder(false);
    }
  }, [desktopApi, selectedLogId]);

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground mr-4">日志</h2>
        {(bundle?.files ?? []).map((file) => {
          const active = currentFile?.id === file.id;
          return (
            <button
              key={file.id}
              type="button"
              onClick={() => setSelectedLogId(file.id)}
              className={cn(
                "rounded-[var(--radius-shell)] px-3 py-1.5 text-[13px] font-medium transition",
                active
                  ? "bg-[color:var(--color-control-bg-active)] text-foreground shadow-sm ring-1 ring-[color:var(--color-control-border)]"
                  : "bg-transparent text-muted-foreground hover:bg-[color:var(--color-control-bg-hover)] hover:text-foreground",
              )}
            >
              {file.label}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleOpenFolder()}
            disabled={openingFolder}
          >
            {openingFolder ? "打开中…" : "打开文件夹"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadLogs()}
            disabled={loading}
          >
            {loading ? "刷新中…" : "刷新"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4 px-2">
        <MetaItem label="路径" value={currentFile?.path ?? "—"} />
        <MetaItem
          label="大小"
          value={currentFile ? formatBytes(currentFile.sizeBytes) : "—"}
        />
        <MetaItem
          label="更新时间"
          value={formatTimestamp(currentFile?.updatedAt ?? null, timeZone)}
        />
        <MetaItem
          label="尾部行数"
          value={String(currentFile?.lineCount ?? 0)}
        />
      </div>

      {error ? (
        <div className="rounded-[var(--radius-shell)] bg-[color:rgba(239,68,68,0.08)] px-4 py-3 text-[12px] leading-6 text-[color:rgb(185,28,28)]">
          {error}
        </div>
      ) : null}

      <pre className="max-h-[36rem] overflow-auto rounded-[var(--radius-shell)] bg-[color:var(--color-control-panel-bg)] border border-[color:var(--color-control-border)] px-4 py-4 font-mono text-[11px] leading-5 text-foreground whitespace-pre-wrap break-words shadow-xs">
        {formattedTail.trim()
          ? formattedTail
          : currentFile?.exists
            ? "当前日志为空。"
            : "日志文件还没生成。"}
      </pre>
    </div>
  );
}
