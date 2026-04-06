import { useEffect, useRef, useState } from "react";
import {
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CommandLineIcon,
  Cog6ToothIcon,
  EllipsisHorizontalIcon,
  FolderIcon,
  FolderPlusIcon,
  InformationCircleIcon,
  KeyIcon,
  PlusIcon,
  SwatchIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import type { ChatSessionSummary, SessionGroup } from "@shared/contracts";
import { formatRelativeTime } from "@renderer/lib/session";
import type { SettingsSection } from "@renderer/components/assistant-ui/settings/types";

type SidebarProps = {
  summaries: ChatSessionSummary[];
  activeSessionId: string | null;
  runningSessionIds: string[];
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
  onArchiveSession: (sessionId: string) => void;
  onUnarchiveSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  archivedSummaries: ChatSessionSummary[];
  groups: SessionGroup[];
  onCreateGroup: (name: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onSetSessionGroup: (sessionId: string, groupId: string | null) => void;
  viewMode?: "threads" | "settings";
  activeSettingsSection?: SettingsSection;
  onSelectSettingsSection?: (section: SettingsSection) => void;
  onExitSettings?: () => void;
};

export function Sidebar({
  summaries,
  activeSessionId,
  runningSessionIds,
  onSelectSession,
  onNewSession,
  onOpenSettings,
  onArchiveSession,
  onUnarchiveSession,
  onDeleteSession,
  onRenameSession,
  archivedSummaries,
  groups,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onSetSessionGroup,
  viewMode = "threads",
  activeSettingsSection = "general",
  onSelectSettingsSection,
  onExitSettings,
}: SidebarProps) {
  const [showArchived, setShowArchived] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [threadMenuOpenFor, setThreadMenuOpenFor] = useState<string | null>(
    null,
  );
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(
    null,
  );
  const [sessionRenameValue, setSessionRenameValue] = useState("");
  const [movingSessionId, setMovingSessionId] = useState<string | null>(null);
  const [groupMenuOpenFor, setGroupMenuOpenFor] = useState<string | null>(null);
  // Drag & drop state
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [dragOverUngrouped, setDragOverUngrouped] = useState(false);
  const dragSessionIdRef = useRef<string | null>(null);

  const newGroupInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameSessionInputRef = useRef<HTMLInputElement>(null);

  const settingsItems: {
    id: SettingsSection;
    label: string;
    icon: typeof Cog6ToothIcon;
  }[] = [
    { id: "general", label: "常规", icon: Cog6ToothIcon },
    { id: "keys", label: "提供商与模型", icon: KeyIcon },
    { id: "appearance", label: "外观", icon: SwatchIcon },
    { id: "terminal", label: "终端", icon: CommandLineIcon },
    { id: "workspace", label: "工作区", icon: FolderIcon },
    { id: "archived", label: "已归档", icon: ArchiveBoxIcon },
    { id: "about", label: "关于", icon: InformationCircleIcon },
  ];

  useEffect(() => {
    if (creatingGroup) newGroupInputRef.current?.focus();
  }, [creatingGroup]);

  useEffect(() => {
    if (renamingGroupId) renameInputRef.current?.focus();
  }, [renamingGroupId]);

  useEffect(() => {
    if (renamingSessionId) renameSessionInputRef.current?.focus();
  }, [renamingSessionId]);

  useEffect(() => {
    if (!groupMenuOpenFor && !movingSessionId && !threadMenuOpenFor) return;
    const handler = () => {
      setGroupMenuOpenFor(null);
      setMovingSessionId(null);
      setThreadMenuOpenFor(null);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [groupMenuOpenFor, movingSessionId, threadMenuOpenFor]);

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const submitCreateGroup = () => {
    const name = newGroupName.trim();
    if (name) onCreateGroup(name);
    setCreatingGroup(false);
    setNewGroupName("");
  };

  const submitRenameGroup = () => {
    if (renamingGroupId && renameValue.trim()) {
      onRenameGroup(renamingGroupId, renameValue.trim());
    }
    setRenamingGroupId(null);
    setRenameValue("");
  };

  const submitRenameSession = () => {
    if (renamingSessionId && sessionRenameValue.trim()) {
      onRenameSession(renamingSessionId, sessionRenameValue.trim());
    }
    setRenamingSessionId(null);
    setSessionRenameValue("");
  };

  const ungroupedSessions = summaries.filter((s) => !s.groupId);
  const groupedSessions = groups.map((group) => ({
    group,
    sessions: summaries.filter((s) => s.groupId === group.id),
  }));

  if (viewMode === "settings") {
    return (
      <aside className="flex h-full flex-col bg-transparent text-[13px] text-foreground">
        <div className="px-4 pb-2 pt-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-text-secondary)]">
            设置
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-2">
          <div className="space-y-1">
            {settingsItems.map(({ id, label, icon: Icon }) => {
              const active = activeSettingsSection === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectSettingsSection?.(id)}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-shell)] px-3 py-2 text-left text-[12px] transition ${
                    active
                      ? "bg-shell-panel-elevated text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                      : "text-[color:var(--color-text-secondary)] hover:bg-shell-hover hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-3 py-3">
          <button
            type="button"
            onClick={onExitSettings}
            className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-shell)] px-3 py-2 text-[12px] text-[color:var(--color-text-secondary)] transition hover:bg-accent hover:text-foreground"
          >
            <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
            返回
          </button>
        </div>
      </aside>
    );
  }

  const renderThreadItem = (summary: ChatSessionSummary, indented = false) => {
    const active = summary.id === activeSessionId;
    const isRunning = runningSessionIds.includes(summary.id);
    const isMoving = movingSessionId === summary.id;
    const isThreadMenuOpen = threadMenuOpenFor === summary.id;
    const isRenaming = renamingSessionId === summary.id;

    return (
      <div key={summary.id} className="relative">
        <div
          draggable
          onDragStart={(e) => {
            dragSessionIdRef.current = summary.id;
            e.dataTransfer.effectAllowed = "move";
            // Suppress the popup if open
            setMovingSessionId(null);
          }}
          onDragEnd={() => {
            dragSessionIdRef.current = null;
            setDragOverGroupId(null);
            setDragOverUngrouped(false);
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelectSession(summary.id);
            setMovingSessionId(null);
            setGroupMenuOpenFor(null);
            setThreadMenuOpenFor(null);
          }}
          className={`group flex cursor-pointer items-center rounded-[var(--radius-shell)] py-2 transition ${
            indented ? "pl-6 pr-2.5" : "px-3"
          } ${active ? "bg-shell-panel-elevated shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]" : "hover:bg-shell-hover"}`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              {isRenaming ? (
                <input
                  ref={renameSessionInputRef}
                  type="text"
                  value={sessionRenameValue}
                  onChange={(e) => setSessionRenameValue(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitRenameSession();
                    else if (e.key === "Escape") {
                      setRenamingSessionId(null);
                      setSessionRenameValue("");
                    }
                  }}
                  onBlur={submitRenameSession}
                  className="min-w-0 flex-1 border-none bg-transparent p-0 text-[12px] font-medium text-foreground outline-none"
                />
              ) : (
                <span
                  className={`truncate text-[12px] ${active ? "font-medium text-foreground" : "text-[color:var(--color-text-secondary)]"}`}
                >
                  {summary.title}
                </span>
              )}
              <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-[color:var(--color-text-muted)]">
                {isRunning ? (
                  <span
                    className="inline-flex size-1.5 rounded-full bg-[color:var(--color-text-muted)] animate-pulse"
                    aria-label="线程运行中"
                    title="线程运行中"
                  />
                ) : null}
                <span>{formatRelativeTime(summary.updatedAt)}</span>
              </div>
            </div>
          </div>
          <div className="relative ml-1 flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setThreadMenuOpenFor(isThreadMenuOpen ? null : summary.id);
                setGroupMenuOpenFor(null);
                setMovingSessionId(null);
              }}
              className="cursor-pointer rounded-md p-1 text-[color:var(--color-text-muted)] hover:bg-shell-panel hover:text-foreground"
              title="更多"
            >
              <EllipsisHorizontalIcon className="h-3.5 w-3.5" />
            </button>
            {isThreadMenuOpen ? (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full z-20 mt-1 min-w-[132px] rounded-[var(--radius-shell)] bg-shell-panel-elevated py-1 shadow-[0_18px_40px_rgba(0,0,0,0.32)]"
              >
                <button
                  type="button"
                  onClick={() => {
                    setRenamingSessionId(summary.id);
                    setSessionRenameValue(summary.title);
                    setThreadMenuOpenFor(null);
                  }}
                  className="flex w-full cursor-pointer items-center px-3 py-1.5 text-[11px] text-foreground hover:bg-accent"
                >
                  重命名
                </button>
                {groups.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMovingSessionId(isMoving ? null : summary.id);
                      setThreadMenuOpenFor(null);
                    }}
                    className="flex w-full cursor-pointer items-center px-3 py-1.5 text-[11px] text-foreground hover:bg-accent"
                  >
                    分组
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    onArchiveSession(summary.id);
                    setThreadMenuOpenFor(null);
                  }}
                  className="flex w-full cursor-pointer items-center px-3 py-1.5 text-[11px] text-foreground hover:bg-accent"
                >
                  归档
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Inline group picker */}
        {isMoving && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`mx-2 mb-2 rounded-[var(--radius-shell)] bg-shell-panel-elevated py-1 shadow-[0_18px_40px_rgba(0,0,0,0.32)] ${indented ? "ml-6" : ""}`}
          >
            {summary.groupId && (
              <button
                type="button"
                onClick={() => {
                  onSetSessionGroup(summary.id, null);
                  setMovingSessionId(null);
                }}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-[11px] text-[color:var(--color-text-secondary)] hover:bg-accent hover:text-foreground"
              >
                移出分组
              </button>
            )}
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  onSetSessionGroup(summary.id, g.id);
                  setMovingSessionId(null);
                }}
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-accent ${
                  summary.groupId === g.id
                    ? "text-foreground"
                    : "text-[color:var(--color-text-secondary)] hover:text-foreground"
                }`}
              >
                <FolderIcon className="h-3 w-3 shrink-0 text-[color:var(--color-text-secondary)]" />
                <span className="truncate">{g.name}</span>
                {summary.groupId === g.id && (
                  <span className="ml-auto text-[10px] text-[color:var(--color-text-muted)]">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="flex h-full bg-transparent flex-col text-[13px] text-foreground">
      {/* Top: New thread */}
      <div className="px-3 pb-3 pt-3">
        <button
          type="button"
          onClick={onNewSession}
          className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-shell)] bg-shell-panel-elevated px-3 py-2.5 font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition hover:bg-shell-panel-contrast"
        >
          <PlusIcon className="h-4 w-4" />
          <span className="text-[12px]">新线程</span>
        </button>
      </div>

      {/* Threads header */}
      <div className="flex items-center px-4 pb-2 pt-1">
        {showArchived ? (
          <button
            type="button"
            onClick={() => setShowArchived(false)}
            className="flex cursor-pointer items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-text-secondary)] transition hover:text-foreground"
          >
            <ArrowUturnLeftIcon className="h-3 w-3" />
            <span>返回</span>
          </button>
        ) : (
          <>
            <span className="flex-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-text-secondary)]">
              线程
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCreatingGroup(true);
                setGroupMenuOpenFor(null);
                setMovingSessionId(null);
              }}
              className="cursor-pointer rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              title="新建分组"
            >
              <FolderPlusIcon className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto pb-2">
        {showArchived ? (
          <div className="space-y-1 px-3">
            {archivedSummaries.length === 0 ? (
              <p className="px-2 py-4 text-center text-[11px] text-[color:var(--color-text-muted)]">
                没有已归档的线程
              </p>
            ) : (
              archivedSummaries.map((summary) => (
                <div
                  key={summary.id}
                  className="group flex cursor-pointer items-center justify-between rounded-[var(--radius-shell)] px-3 py-2 transition hover:bg-shell-hover"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSession(summary.id);
                      setShowArchived(false);
                    }}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                  >
                    <span className="block truncate text-[12px] text-foreground">
                      {summary.title}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => onUnarchiveSession(summary.id)}
                      className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                      title="恢复"
                    >
                      <ArrowUturnLeftIcon className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSession(summary.id)}
                      className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="永久删除"
                    >
                      <TrashIcon className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div
            className={`px-3 transition-colors ${dragOverUngrouped ? "rounded-2xl bg-shell-hover" : ""}`}
            onDragOver={(e) => {
              if (dragSessionIdRef.current) {
                const sid = dragSessionIdRef.current;
                const s = summaries.find((x) => x.id === sid);
                if (s?.groupId) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverUngrouped(true);
                  setDragOverGroupId(null);
                }
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverUngrouped(false);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const sid = dragSessionIdRef.current;
              if (sid) onSetSessionGroup(sid, null);
              setDragOverUngrouped(false);
              setDragOverGroupId(null);
              dragSessionIdRef.current = null;
            }}
          >
            {/* Create group input */}
            {creatingGroup && (
              <div className="mb-2 flex items-center rounded-[var(--radius-shell)] bg-shell-panel-elevated px-2 py-2">
                <span className="shrink-0 text-transparent">
                  <ChevronRightIcon className="h-3 w-3" />
                </span>
                <FolderIcon className="ml-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  ref={newGroupInputRef}
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitCreateGroup();
                    else if (e.key === "Escape") {
                      setCreatingGroup(false);
                      setNewGroupName("");
                    }
                  }}
                  onBlur={submitCreateGroup}
                  placeholder="分组名称..."
                  className="ml-1.5 min-w-0 flex-1 border-none bg-transparent p-0 text-[12px] text-foreground outline-none placeholder:text-[color:var(--color-text-muted)]"
                />
              </div>
            )}

            {/* Groups — each is a drop target */}
            {groupedSessions.map(({ group, sessions }) => {
              const collapsed = collapsedGroups.has(group.id);
              const isGroupMenuOpen = groupMenuOpenFor === group.id;
              const isRenaming = renamingGroupId === group.id;
              const isDragOver = dragOverGroupId === group.id;

              return (
                <div
                  key={group.id}
                  className={`mb-2 rounded-[var(--radius-shell)] transition-colors ${isDragOver ? "bg-shell-panel-muted" : "bg-transparent"}`}
                  onDragOver={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverGroupId(group.id);
                    setDragOverUngrouped(false);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDragOverGroupId(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const sid = dragSessionIdRef.current;
                    if (sid) onSetSessionGroup(sid, group.id);
                    setDragOverGroupId(null);
                    dragSessionIdRef.current = null;
                  }}
                >
                  {/* Group header */}
                  <div className="group flex items-center rounded-[var(--radius-shell)] px-2 py-2 transition hover:bg-shell-hover">
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapse(group.id)}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5"
                    >
                      <span className="shrink-0 text-[color:var(--color-text-secondary)]">
                        {collapsed ? (
                          <ChevronRightIcon className="h-3 w-3" />
                        ) : (
                          <ChevronDownIcon className="h-3 w-3" />
                        )}
                      </span>
                      <FolderIcon
                        className={`h-3.5 w-3.5 shrink-0 transition-colors ${isDragOver ? "text-foreground" : "text-[color:var(--color-text-secondary)]"}`}
                      />
                      {isRenaming ? (
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitRenameGroup();
                            else if (e.key === "Escape")
                              setRenamingGroupId(null);
                          }}
                          onBlur={submitRenameGroup}
                          className="min-w-0 flex-1 border-none bg-transparent p-0 text-[12px] font-medium text-foreground outline-none"
                        />
                      ) : (
                        <span className="truncate text-[12px] font-medium text-foreground">
                          {group.name}
                        </span>
                      )}
                    </button>

                    {/* Group "..." menu */}
                    <div className="relative ml-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setGroupMenuOpenFor(
                            isGroupMenuOpen ? null : group.id,
                          );
                          setMovingSessionId(null);
                        }}
                        className="cursor-pointer rounded-md p-1 text-[color:var(--color-text-muted)] opacity-0 transition hover:bg-shell-panel hover:text-foreground group-hover:opacity-100"
                        title="分组操作"
                      >
                        <EllipsisHorizontalIcon className="h-3.5 w-3.5" />
                      </button>
                      {isGroupMenuOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-full z-20 mt-1 min-w-[88px] rounded-[var(--radius-shell)] bg-shell-panel-elevated py-1 shadow-[0_18px_40px_rgba(0,0,0,0.32)]"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingGroupId(group.id);
                              setRenameValue(group.name);
                              setGroupMenuOpenFor(null);
                            }}
                            className="flex w-full cursor-pointer items-center px-3 py-1.5 text-[11px] text-foreground hover:bg-accent"
                          >
                            重命名
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteGroup(group.id);
                              setGroupMenuOpenFor(null);
                            }}
                            className="flex w-full cursor-pointer items-center px-3 py-1.5 text-[11px] text-destructive hover:bg-destructive/10"
                          >
                            删除分组
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sessions in group */}
                  {!collapsed && (
                    <div className="space-y-px">
                      {sessions.length === 0 ? (
                        <p
                          className={`py-1 pl-7 text-[11px] ${isDragOver ? "text-[color:var(--color-text-secondary)]" : "text-[color:var(--color-text-muted)]"}`}
                        >
                          {isDragOver ? "松开鼠标放入分组" : "暂无线程"}
                        </p>
                      ) : (
                        sessions.map((s) => renderThreadItem(s, true))
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {ungroupedSessions.length > 0 ? (
              <div
                className={`space-y-1 ${groupedSessions.length > 0 ? "mt-3 pt-2" : ""}`}
              >
                {ungroupedSessions.map((s) => renderThreadItem(s, false))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Bottom: Archive entry + Settings */}
      <div className="px-3 py-3">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-shell)] px-3 py-2 text-[12px] text-[color:var(--color-text-secondary)] transition hover:bg-accent hover:text-foreground"
        >
          <Cog6ToothIcon className="h-3.5 w-3.5" />
          设置
        </button>
      </div>
    </aside>
  );
}
