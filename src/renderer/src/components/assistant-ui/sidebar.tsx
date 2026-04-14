import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CommandLineIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  EllipsisHorizontalIcon,
  FolderIcon,
  FolderPlusIcon,
  InformationCircleIcon,
  KeyIcon,
  SparklesIcon,
  MapPinIcon,
  SwatchIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { SquarePen } from "lucide-react";
import type { ChatSessionSummary, SessionGroup } from "@shared/contracts";
import { formatRelativeTime } from "@renderer/lib/session";
import type { SettingsSection } from "@renderer/components/assistant-ui/settings/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";

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
  onToggleSessionPinned: (sessionId: string, pinned: boolean) => void;
  onCreateSessionInGroup: (groupId: string) => void;
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

function SidebarImpl({
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
  onToggleSessionPinned,
  onCreateSessionInGroup,
  archivedSummaries,
  groups,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onSetSessionGroup,
  viewMode = "threads",
  activeSettingsSection = "ai_model",
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
  const [archiveConfirmFor, setArchiveConfirmFor] = useState<string | null>(
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
      { id: "ai_model", label: "AI & 模型", icon: SparklesIcon },
      { id: "workspace", label: "工作区", icon: FolderIcon },
      { id: "interface", label: "界面与终端", icon: SwatchIcon },
      { id: "system", label: "数据与系统", icon: Cog6ToothIcon },
    ];

  const SidebarFooterAction = ({
    icon: Icon,
    label,
    onClick,
  }: {
    icon: typeof Cog6ToothIcon;
    label: string;
    onClick?: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className="chela-list-item flex h-11 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-shell)] px-3.5 text-[12px] text-[color:var(--chela-text-secondary)] transition hover:text-[color:var(--chela-text-primary)]"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );

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
    if (
      !groupMenuOpenFor &&
      !movingSessionId &&
      !threadMenuOpenFor &&
      !archiveConfirmFor
    ) {
      return;
    }
    const handler = () => {
      setGroupMenuOpenFor(null);
      setMovingSessionId(null);
      setThreadMenuOpenFor(null);
      setArchiveConfirmFor(null);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [archiveConfirmFor, groupMenuOpenFor, movingSessionId, threadMenuOpenFor]);

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

  const { pinnedSummaries, ungroupedSessions, groupedSessions } = useMemo(() => {
    if (viewMode === "settings") {
      return {
        pinnedSummaries: [] as ChatSessionSummary[],
        ungroupedSessions: [] as ChatSessionSummary[],
        groupedSessions: [] as Array<{
          group: SessionGroup;
          sessions: ChatSessionSummary[];
        }>,
      };
    }

    const pinnedSummaries = summaries.filter((s) => s.pinned);
    const regularSummaries = summaries.filter((s) => !s.pinned);
    const ungroupedSessions = regularSummaries.filter((s) => !s.groupId);
    const groupedSessions = groups.map((group) => ({
      group,
      sessions: regularSummaries.filter((s) => s.groupId === group.id),
    }));

    return {
      pinnedSummaries,
      ungroupedSessions,
      groupedSessions,
    };
  }, [groups, summaries, viewMode]);

  const settingsSidebar = (
    <aside className="flex h-full flex-col bg-transparent text-[13px] text-[color:var(--chela-text-primary)]">
      <div className="px-4 pb-2 pt-4">
        <p className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--chela-text-tertiary)]">
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
                className={`chela-list-item flex w-full cursor-pointer items-center gap-2 px-3.5 py-2.5 text-left text-[12px] transition ${active
                    ? "chela-list-item-active font-medium"
                    : "text-[color:var(--chela-text-secondary)] hover:bg-[color:var(--color-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
                  }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-3 pb-3 pt-2">
        <SidebarFooterAction
          icon={ArrowUturnLeftIcon}
          label="返回"
          onClick={onExitSettings}
        />
      </div>
    </aside>
  );

  const renderThreadItem = (summary: ChatSessionSummary, indented = false) => {
    const active = summary.id === activeSessionId;
    const isRunning = runningSessionIds.includes(summary.id);
    const isMoving = movingSessionId === summary.id;
    const isThreadMenuOpen = threadMenuOpenFor === summary.id;
    const isArchiveConfirming = archiveConfirmFor === summary.id;
    const isRenaming = renamingSessionId === summary.id;
    const showPinAction =
      "pointer-events-none w-0 opacity-0 group-hover:pointer-events-auto group-hover:w-5 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:w-5 group-focus-within:opacity-100";

    return (
      <div key={summary.id} className="relative">
        <div
          draggable
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSelectSession(summary.id);
            setThreadMenuOpenFor(summary.id);
            setGroupMenuOpenFor(null);
            setMovingSessionId(null);
            setArchiveConfirmFor(null);
          }}
          onDragStart={(e) => {
            dragSessionIdRef.current = summary.id;
            e.dataTransfer.effectAllowed = "move";
            // Suppress the popup if open
            setMovingSessionId(null);
            setThreadMenuOpenFor(null);
            setArchiveConfirmFor(null);
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
            setArchiveConfirmFor(null);
          }}
          className={`chela-list-item group flex cursor-pointer items-center gap-1.5 py-2.5 transition ${indented ? "pl-6 pr-2.5" : "px-3.5"
            } ${active ? "chela-list-item-active font-medium" : ""}`}
        >
          <div
            className={`flex h-5 shrink-0 items-center overflow-visible transition-[width,opacity] duration-150 ${showPinAction}`}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSessionPinned(summary.id, !summary.pinned);
                  }}
                  className={`flex h-5 w-5 cursor-pointer items-center justify-center transition-colors hover:text-[color:var(--chela-text-primary)] ${summary.pinned ? "text-[color:var(--chela-text-primary)]" : "text-[color:var(--chela-text-tertiary)]"}`}
                  aria-label={summary.pinned ? "取消置顶" : "置顶到顶部"}
                >
                  <MapPinIcon className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {summary.pinned ? "取消置顶" : "置顶到顶部"}
              </TooltipContent>
            </Tooltip>
          </div>
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
                  className={`truncate text-[12px] ${active ? "font-medium text-[color:var(--color-control-selected-text)]" : "text-[color:var(--chela-text-secondary)]"}`}
                >
                  {summary.title}
                </span>
              )}
              <div className="flex shrink-0 items-center gap-1 text-[10px] text-[color:var(--chela-text-tertiary)]">
                {isRunning ? (
                  <span
                    className="inline-flex size-1.5 rounded-full bg-[color:var(--chela-accent)] animate-pulse"
                    aria-label="线程运行中"
                    title="线程运行中"
                  />
                ) : null}
                <span
                  className={`${isArchiveConfirming ? "invisible" : "group-hover:hidden group-focus-within:hidden"}`}
                >
                  {formatRelativeTime(summary.updatedAt)}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setArchiveConfirmFor(
                          isArchiveConfirming ? null : summary.id,
                        );
                        setThreadMenuOpenFor(null);
                        setGroupMenuOpenFor(null);
                        setMovingSessionId(null);
                      }}
                      className={`${isArchiveConfirming ? "hidden" : "hidden group-hover:flex group-focus-within:flex"} h-5 w-5 cursor-pointer items-center justify-center text-[color:var(--chela-text-tertiary)] transition-colors hover:text-[color:var(--chela-text-primary)]`}
                      aria-label={`归档 ${summary.title}`}
                    >
                      <ArchiveBoxIcon className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">归档线程</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
        {isArchiveConfirming ? (
          <div className="pointer-events-none absolute inset-y-0 right-3 z-10 flex items-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onArchiveSession(summary.id);
                setArchiveConfirmFor(null);
                setThreadMenuOpenFor(null);
              }}
              className="chela-danger-soft pointer-events-auto h-6 cursor-pointer rounded-full px-2.5 text-[10px] leading-none font-medium transition hover:brightness-[0.98]"
            >
              确认
            </button>
          </div>
        ) : null}
        {isThreadMenuOpen ? (
          <div
            onClick={(e) => e.stopPropagation()}
            className="chela-panel-elevated absolute right-2 top-full z-20 mt-1 min-w-[132px] rounded-[calc(var(--radius-shell)+2px)] py-1.5"
          >
            <button
              type="button"
              onClick={() => {
                setRenamingSessionId(summary.id);
                setSessionRenameValue(summary.title);
                setThreadMenuOpenFor(null);
              }}
              className="flex w-full cursor-pointer items-center px-3 py-1.5 text-[11px] text-[color:var(--chela-text-primary)] hover:bg-[color:var(--color-control-bg-hover)]"
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
                className="flex w-full cursor-pointer items-center px-3 py-1.5 text-[11px] text-[color:var(--chela-text-primary)] hover:bg-[color:var(--color-control-bg-hover)]"
              >
                分组
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Inline group picker */}
        {isMoving && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`chela-panel-elevated mx-2 mb-2 rounded-[calc(var(--radius-shell)+2px)] py-1.5 ${indented ? "ml-6" : ""}`}
          >
            {summary.groupId && (
              <button
                type="button"
                onClick={() => {
                  onSetSessionGroup(summary.id, null);
                  setMovingSessionId(null);
                }}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-[11px] text-[color:var(--chela-text-secondary)] hover:bg-[color:var(--color-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
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
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-[color:var(--color-control-bg-hover)] ${summary.groupId === g.id
                    ? "text-[color:var(--color-control-selected-text)]"
                    : "text-[color:var(--chela-text-secondary)] hover:text-[color:var(--chela-text-primary)]"
                  }`}
              >
                <FolderIcon className="h-3 w-3 shrink-0 text-[color:var(--chela-text-secondary)]" />
                <span className="truncate">{g.name}</span>
                {summary.groupId === g.id && (
                  <span className="ml-auto text-[10px] text-[color:var(--chela-accent)]">
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

  const isSettings = viewMode === "settings";

  return (
    <div className="relative h-full overflow-hidden">
      <div
        className={`absolute inset-0 will-change-[opacity,transform] transition-[opacity,transform] duration-200 ease-out ${isSettings
            ? "pointer-events-auto translate-x-0 opacity-100"
            : "pointer-events-none -translate-x-2 opacity-0"
          }`}
      >
        {settingsSidebar}
      </div>
      <div
        className={`absolute inset-0 will-change-[opacity,transform] transition-[opacity,transform] duration-200 ease-out ${!isSettings
            ? "pointer-events-auto translate-x-0 opacity-100"
            : "pointer-events-none translate-x-2 opacity-0"
          }`}
      >
        <aside className="flex h-full bg-transparent flex-col text-[13px] text-[color:var(--chela-text-primary)]">
          {/* Top: New thread */}
          <div className="px-3 pb-2 pt-3">
            <button
              type="button"
              onClick={onNewSession}
              className="chela-list-item flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-[12px] font-medium text-[color:var(--chela-text-secondary)] transition hover:text-[color:var(--chela-text-primary)]"
            >
              <SquarePen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
              <span>新线程</span>
            </button>
          </div>

          {pinnedSummaries.length > 0 ? (
            <div className="px-3 pb-3 pt-1">
              <div className="space-y-1">
                {pinnedSummaries.map((summary) => renderThreadItem(summary, false))}
              </div>
            </div>
          ) : null}

          {/* Threads header */}
          <div className="flex items-center px-4 pb-2 pt-1.5">
            {showArchived ? (
              <button
                type="button"
                onClick={() => setShowArchived(false)}
                className="flex cursor-pointer items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-[color:var(--chela-text-secondary)] transition hover:text-[color:var(--chela-accent-text)]"
              >
                <ArrowUturnLeftIcon className="h-3 w-3" />
                <span>返回</span>
              </button>
            ) : (
              <>
                <span className="flex-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--chela-text-tertiary)]">
                  线程
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCreatingGroup(true);
                        setGroupMenuOpenFor(null);
                        setMovingSessionId(null);
                      }}
                      className="cursor-pointer rounded-md p-1 text-[color:var(--chela-text-tertiary)] transition hover:bg-[color:var(--color-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
                      aria-label="新建分组"
                    >
                      <FolderPlusIcon className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">新建分组</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto pb-2">
            {showArchived ? (
              <div className="space-y-1 px-3">
                {archivedSummaries.length === 0 ? (
                  <p className="px-2 py-4 text-center text-[11px] text-[color:var(--chela-text-tertiary)]">
                    没有已归档的线程
                  </p>
                ) : (
                  archivedSummaries.map((summary) => (
                    <div
                      key={summary.id}
                      className="group flex cursor-pointer items-center justify-between rounded-[var(--radius-shell)] px-3 py-2 transition hover:bg-[color:var(--color-control-bg-hover)]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSession(summary.id);
                          setShowArchived(false);
                        }}
                        className="min-w-0 flex-1 cursor-pointer text-left"
                      >
                        <span className="block truncate text-[12px] text-[color:var(--chela-text-primary)]">
                          {summary.title}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => onUnarchiveSession(summary.id)}
                          className="cursor-pointer rounded-md p-1 text-[color:var(--chela-text-tertiary)] hover:bg-[color:var(--color-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
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
                className={`px-3 transition-colors ${dragOverUngrouped ? "rounded-2xl bg-[color:var(--color-control-selected-bg)]" : ""}`}
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
                  <div className="chela-panel-surface mb-2 flex items-center rounded-[calc(var(--radius-shell)+2px)] px-2.5 py-2">
                    <span className="shrink-0 text-transparent">
                      <ChevronRightIcon className="h-3 w-3" />
                    </span>
                    <FolderIcon className="ml-1.5 h-3.5 w-3.5 shrink-0 text-[color:var(--chela-text-tertiary)]" />
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
                      className="ml-1.5 min-w-0 flex-1 border-none bg-transparent p-0 text-[12px] text-[color:var(--chela-text-primary)] outline-none placeholder:text-[color:var(--chela-text-tertiary)]"
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
                      className={`mb-2 rounded-[var(--radius-shell)] transition-colors ${isDragOver ? "bg-[color:var(--color-control-selected-bg)]" : "bg-transparent"}`}
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
                      <div className="chela-list-item group flex items-center px-2.5 py-2.5 transition">
                        <button
                          type="button"
                          onClick={() => toggleGroupCollapse(group.id)}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5"
                        >
                          <span className="shrink-0 text-[color:var(--chela-text-secondary)]">
                            {collapsed ? (
                              <ChevronRightIcon className="h-3 w-3" />
                            ) : (
                              <ChevronDownIcon className="h-3 w-3" />
                            )}
                          </span>
                          <FolderIcon
                            className={`h-3.5 w-3.5 shrink-0 transition-colors ${isDragOver ? "text-[color:var(--chela-text-primary)]" : "text-[color:var(--chela-text-secondary)]"}`}
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
                            <span className="truncate text-[12px] font-medium text-[color:var(--chela-text-primary)]">
                              {group.name}
                            </span>
                          )}
                        </button>

                        <div className="relative ml-1 flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setGroupMenuOpenFor(
                                    isGroupMenuOpen ? null : group.id,
                                  );
                                  setMovingSessionId(null);
                                }}
                                className="cursor-pointer rounded-md p-1 text-[color:var(--chela-text-tertiary)] transition hover:bg-[color:var(--color-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
                                aria-label="分组操作"
                              >
                                <EllipsisHorizontalIcon className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">分组操作</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCreateSessionInGroup(group.id);
                                }}
                                className="cursor-pointer rounded-md p-1 text-[color:var(--chela-text-tertiary)] transition hover:bg-[color:var(--color-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
                                aria-label={`在 ${group.name} 中开始新线程`}
                              >
                                <SquarePen className="h-3.5 w-3.5" strokeWidth={1.8} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {`在 ${group.name} 中开始新线程`}
                            </TooltipContent>
                          </Tooltip>
                          {isGroupMenuOpen && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="chela-panel-elevated absolute right-0 top-full z-20 mt-1 min-w-[88px] rounded-[calc(var(--radius-shell)+2px)] py-1.5"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setRenamingGroupId(group.id);
                                  setRenameValue(group.name);
                                  setGroupMenuOpenFor(null);
                                }}
                                className="flex w-full cursor-pointer items-center px-3 py-1.5 text-[11px] text-[color:var(--chela-text-primary)] hover:bg-[color:var(--color-control-bg-hover)]"
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
                              className={`py-1 pl-7 text-[11px] ${isDragOver ? "text-[color:var(--chela-text-secondary)]" : "text-[color:var(--chela-text-tertiary)]"}`}
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
          <div className="px-3 pb-3 pt-2">
            <SidebarFooterAction
              icon={Cog6ToothIcon}
              label="设置"
              onClick={onOpenSettings}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

export const Sidebar = memo(SidebarImpl);
