import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { ChatSessionSummary, SessionGroup } from "@shared/contracts";
import { formatRelativeTime } from "@renderer/lib/session";

type SessionListProps = {
  summaries: ChatSessionSummary[];
  activeSessionId: string | null;
  runningSessionIds: string[];
  groups: SessionGroup[];
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onCreateSessionInGroup: (groupId: string) => void;
  onArchiveSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onSetSessionGroup: (sessionId: string, groupId: string | null) => void;
  collapsed: boolean;
};

type SessionGroupItem = {
  id: string;
  label: string;
  sessions: ChatSessionSummary[];
  isGroup: boolean;
};

function SessionListImpl({
  summaries,
  activeSessionId,
  runningSessionIds,
  groups,
  onSelectSession,
  onNewSession,
  onCreateSessionInGroup,
  onArchiveSession,
  onRenameSession,
  onSetSessionGroup,
  collapsed,
}: SessionListProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const groupedSessions = useMemo<SessionGroupItem[]>(() => {
    const pinned = summaries.filter((s) => s.pinned);
    const regular = summaries.filter((s) => !s.pinned);

    const result: SessionGroupItem[] = [];

    // Pinned sessions
    if (pinned.length > 0) {
      result.push({
        id: "__pinned__",
        label: "置顶",
        sessions: pinned,
        isGroup: false,
      });
    }

    // Grouped sessions
    for (const group of groups) {
      const groupSessions = regular.filter((s) => s.groupId === group.id);
      result.push({
        id: `group:${group.id}`,
        label: group.name,
        sessions: groupSessions,
        isGroup: true,
      });
    }

    // Ungrouped
    const ungrouped = regular.filter((s) => !s.groupId);
    if (ungrouped.length > 0) {
      result.push({
        id: "__ungrouped__",
        label: "未分组",
        sessions: ungrouped,
        isGroup: false,
      });
    }

    return result;
  }, [summaries, groups]);

  const toggleGroup = useCallback((id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const startRename = useCallback(
    (sessionId: string, currentTitle: string) => {
      setRenamingSessionId(sessionId);
      setRenameValue(currentTitle);
      setTimeout(() => renameInputRef.current?.focus(), 50);
    },
    [],
  );

  const submitRename = useCallback(() => {
    if (renamingSessionId && renameValue.trim()) {
      onRenameSession(renamingSessionId, renameValue.trim());
    }
    setRenamingSessionId(null);
    setRenameValue("");
  }, [renamingSessionId, renameValue, onRenameSession]);

  if (collapsed) return null;

  return (
    <aside
      className="chela-session-list flex h-full flex-col border-r border-[color:var(--chela-border)] bg-[color:var(--chela-bg-sessionlist)]"
      style={{ width: "220px", flexShrink: 0 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--chela-text-muted)]">
          会话
        </span>
        <button
          type="button"
          onClick={onNewSession}
          className="flex size-6 cursor-pointer items-center justify-center rounded-md text-[color:var(--chela-text-secondary)] transition-colors hover:bg-[color:var(--chela-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
          title="新建会话"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>

      {/* Session items */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {groupedSessions.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] text-[color:var(--chela-text-muted)]">
            暂无会话
          </p>
        ) : (
          groupedSessions.map((group) => {
            const isCollapsed = collapsedGroups.has(group.id);
            const isGroupHeader = group.isGroup;

            return (
              <div key={group.id} className="mb-1">
                {/* Group header */}
                {isGroupHeader && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className="flex w-full cursor-pointer items-center gap-1 px-2 py-1 text-left"
                  >
                    <span className="text-[color:var(--chela-text-tertiary)]">
                      {isCollapsed ? (
                        <ChevronRightIcon className="size-2.5" />
                      ) : (
                        <ChevronDownIcon className="size-2.5" />
                      )}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--chela-text-muted)]">
                      {group.label}
                    </span>
                    <span className="ml-auto text-[10px] text-[color:var(--chela-text-muted)]">
                      {group.sessions.length}
                    </span>
                  </button>
                )}

                {/* Sessions */}
                {!isCollapsed && (
                  <div className="space-y-px">
                    {group.sessions.map((s) => {
                      const isActive = s.id === activeSessionId;
                      const isRunning = runningSessionIds.includes(s.id);
                      const isRenaming = renamingSessionId === s.id;

                      return (
                        <div
                          key={s.id}
                          className={`group flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-2 text-left transition-colors ${
                            isActive
                              ? "bg-[color:var(--chela-control-selected-bg)] text-[color:var(--chela-control-selected-text)]"
                              : "text-[color:var(--chela-text-secondary)] hover:bg-[color:var(--chela-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
                          }`}
                          onClick={() => onSelectSession(s.id)}
                        >
                          {isRunning && (
                            <span
                              className="size-1.5 shrink-0 rounded-full bg-[color:var(--chela-accent)] animate-pulse"
                              title="运行中"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            {isRenaming ? (
                              <input
                                ref={renameInputRef}
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") submitRename();
                                  else if (e.key === "Escape") {
                                    setRenamingSessionId(null);
                                    setRenameValue("");
                                  }
                                }}
                                onBlur={submitRename}
                                className="min-w-0 flex-1 border-none bg-transparent p-0 text-[12px] font-medium text-foreground outline-none"
                              />
                            ) : (
                              <span className="block truncate text-[12px]">
                                {s.title}
                              </span>
                            )}
                            <span className="block text-[10px] text-[color:var(--chela-text-muted)]">
                              {formatRelativeTime(s.updatedAt)}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                startRename(s.id, s.title);
                              }}
                              className="size-4 cursor-pointer rounded p-0.5 text-[color:var(--chela-text-muted)] transition-colors hover:bg-[color:var(--chela-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
                              title="重命名"
                            >
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onArchiveSession(s.id);
                              }}
                              className="size-4 cursor-pointer rounded p-0.5 text-[color:var(--chela-text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500"
                              title="归档"
                            >
                              <XMarkIcon className="size-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

export const SessionList = memo(SessionListImpl);
