import type { ChatSessionSummary } from "@shared/contracts";
import { Button } from "@renderer/components/assistant-ui/button";
import { formatArchivedTime } from "./constants";
import { SettingsCard } from "./shared";

export function ArchivedSection({
  archivedSummaries,
  timeZone,
  onOpenArchivedSession,
  onUnarchiveSession,
  onDeleteSession,
}: {
  archivedSummaries: ChatSessionSummary[];
  timeZone: string;
  onOpenArchivedSession: (sessionId: string) => void;
  onUnarchiveSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
}) {
  return (
    <SettingsCard
      title="已归档线程"
      description="这里统一管理已经归档的会话，需要时可以直接恢复或者永久删除。"
    >
      <div className="space-y-3 px-6 py-5">
        {archivedSummaries.length === 0 ? (
          <div className="rounded-[var(--radius-shell)] border border-[color:var(--color-control-border)] bg-[color:var(--color-control-panel-bg)] px-4 py-8 text-center text-[12px] text-muted-foreground shadow-[var(--color-control-shadow)]">
            暂时没有已归档线程。
          </div>
        ) : (
          archivedSummaries.map((summary) => (
            <div
              key={summary.id}
              className="flex flex-col gap-3 rounded-[var(--radius-shell)] border border-[color:var(--color-control-border)] bg-[color:var(--color-control-panel-bg)] px-4 py-4 shadow-[var(--color-control-shadow)] md:flex-row md:items-center md:justify-between"
            >
              <button
                type="button"
                onClick={() => onOpenArchivedSession(summary.id)}
                className="min-w-0 flex-1 cursor-pointer text-left"
              >
                <p className="truncate text-[13px] font-medium text-foreground">
                  {summary.title}
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  最后更新于 {formatArchivedTime(summary.updatedAt, timeZone)}
                </p>
              </button>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onUnarchiveSession(summary.id)}
                  className="h-8 rounded-[var(--radius-shell)] px-3 text-[12px]"
                >
                  恢复
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onDeleteSession(summary.id)}
                  className="h-8 rounded-[var(--radius-shell)] px-3 text-[12px] text-red-500 hover:bg-red-50"
                >
                  删除
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </SettingsCard>
  );
}
