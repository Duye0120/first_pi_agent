import { useState } from "react";
import {
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  Cog6ToothIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import type { ChatSessionSummary } from "@shared/contracts";
import { formatRelativeTime } from "@renderer/lib/session";

type SidebarProps = {
  summaries: ChatSessionSummary[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
  onArchiveSession: (sessionId: string) => void;
  onUnarchiveSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  archivedSummaries: ChatSessionSummary[];
};

export function Sidebar({
  summaries,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onOpenSettings,
  onArchiveSession,
  onUnarchiveSession,
  onDeleteSession,
  archivedSummaries,
}: SidebarProps) {
  const [showArchived, setShowArchived] = useState(false);

  return (
    <aside className="flex h-full flex-col bg-transparent text-[13px]">
      {/* Top: New thread */}
      <div className="px-2 pb-1 pt-2">
        <button
          type="button"
          onClick={onNewSession}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-gray-600 transition hover:bg-white/50"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          <span>新线程</span>
        </button>
      </div>

      {/* Threads header */}
      <div className="px-3 pb-1 pt-2">
        {showArchived ? (
          <button
            type="button"
            onClick={() => setShowArchived(false)}
            className="flex items-center gap-1.5 text-[11px] text-gray-400 transition hover:text-gray-600"
          >
            <ArrowUturnLeftIcon className="h-3 w-3" />
            <span>返回</span>
          </button>
        ) : (
          <span className="text-[11px] font-medium text-gray-400">线程</span>
        )}
      </div>

      {/* Thread list */}
      <div className="flex-1 space-y-px overflow-y-auto px-2 pb-2">
        {showArchived ? (
          archivedSummaries.length === 0 ? (
            <p className="px-2 py-4 text-center text-[11px] text-gray-300">没有已归档的线程</p>
          ) : (
            archivedSummaries.map((summary) => (
              <div
                key={summary.id}
                className="group flex items-center justify-between rounded-md px-2.5 py-1.5 hover:bg-white/50"
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectSession(summary.id);
                    setShowArchived(false);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-[12px] text-gray-500">{summary.title}</span>
                </button>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => onUnarchiveSession(summary.id)}
                    className="rounded p-0.5 text-gray-400 hover:bg-black/5 hover:text-gray-600"
                    title="恢复"
                  >
                    <ArrowUturnLeftIcon className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSession(summary.id)}
                    className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    title="永久删除"
                  >
                    <TrashIcon className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))
          )
        ) : (
          summaries.map((summary) => {
            const active = summary.id === activeSessionId;
            return (
              <div
                key={summary.id}
                className={`group flex items-center rounded-md px-2.5 py-1.5 transition ${
                  active ? "bg-white/60" : "hover:bg-white/40"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectSession(summary.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-[12px] ${active ? "text-gray-800" : "text-gray-500"}`}>
                      {summary.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-gray-300">
                      {formatRelativeTime(summary.updatedAt)}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onArchiveSession(summary.id);
                  }}
                  className="ml-1 shrink-0 rounded p-0.5 text-gray-300 opacity-0 transition hover:bg-black/5 hover:text-gray-500 group-hover:opacity-100"
                  title="归档"
                >
                  <ArchiveBoxIcon className="h-3 w-3" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom: Archive entry + Settings */}
      <div className="border-t border-black/4 px-2 py-1.5">
        {!showArchived ? (
          <button
            type="button"
            onClick={() => setShowArchived(true)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-gray-400 transition hover:bg-white/50 hover:text-gray-600"
          >
            <ArchiveBoxIcon className="h-3.5 w-3.5" />
            已归档
            {archivedSummaries.length > 0 ? (
              <span className="ml-auto text-[10px] text-gray-300">{archivedSummaries.length}</span>
            ) : null}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-gray-400 transition hover:bg-white/50 hover:text-gray-600"
        >
          <Cog6ToothIcon className="h-3.5 w-3.5" />
          设置
        </button>
      </div>
    </aside>
  );
}
