import { memo, useEffect, useMemo, useState } from "react";
import {
  AdjustmentsHorizontalIcon,
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  BoltIcon,
  Cog6ToothIcon,
  FolderIcon,
  FolderOpenIcon,
  MapPinIcon,
  PuzzlePieceIcon,
  SparklesIcon,
  SwatchIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { SquarePen } from "lucide-react";
import type {
  ChatSessionSummary,
  SessionGroup,
} from "@shared/contracts";

import { formatRelativeTime } from "@renderer/lib/session";
import type { SettingsSection } from "@renderer/components/assistant-ui/settings/types";

type SidebarProps = {
  groups: SessionGroup[];
  summaries: ChatSessionSummary[];
  archivedSummaries: ChatSessionSummary[];
  activeSessionId: string | null;
  runningSessionIds: string[];
  onNewSession: () => void;
  onCreateProject: () => void;
  onCreateProjectSession: (projectId: string) => void;
  onSelectProject: (projectId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onOpenSettings: () => void;
  onRenameSession: (sessionId: string) => void;
  onRenameProject: (projectId: string) => void;
  onArchiveSession: (sessionId: string) => void;
  onUnarchiveSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onToggleSessionPinned: (sessionId: string, pinned: boolean) => void;
  viewMode?: "threads" | "settings";
  activeSettingsSection?: SettingsSection;
  onSelectSettingsSection?: (section: SettingsSection) => void;
  onExitSettings?: () => void;
};

type SidebarContextMenuAction = {
  key: string;
  label: string;
  tone?: "default" | "danger";
  onSelect: () => void;
};

type SidebarContextMenuState = {
  x: number;
  y: number;
  actions: SidebarContextMenuAction[];
};

const settingsItems: {
  id: SettingsSection;
  label: string;
  icon: typeof Cog6ToothIcon;
}[] = [
  { id: "general", label: "通用", icon: AdjustmentsHorizontalIcon },
  { id: "network", label: "网络", icon: BoltIcon },
  { id: "ai_model", label: "模型", icon: SparklesIcon },
  { id: "workspace", label: "工作区", icon: FolderIcon },
  { id: "skills", label: "Skills", icon: PuzzlePieceIcon },
  { id: "interface", label: "界面与终端", icon: SwatchIcon },
  { id: "system", label: "数据与系统", icon: Cog6ToothIcon },
];

function SidebarFooterAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Cog6ToothIcon;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="chela-list-item flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-shell)] px-3 py-2 text-[12px] text-[color:var(--chela-text-secondary)] transition hover:bg-[color:var(--color-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function SidebarImpl({
  groups,
  summaries,
  archivedSummaries,
  activeSessionId,
  runningSessionIds,
  onNewSession,
  onCreateProject,
  onCreateProjectSession,
  onSelectProject,
  onSelectSession,
  onOpenSettings,
  onRenameSession,
  onRenameProject,
  onArchiveSession,
  onUnarchiveSession,
  onDeleteSession,
  onDeleteProject,
  onToggleSessionPinned,
  viewMode = "threads",
  activeSettingsSection = "general",
  onSelectSettingsSection,
  onExitSettings,
}: SidebarProps) {
  const isSettings = viewMode === "settings";
  const [showArchived, setShowArchived] = useState(false);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    new Set(),
  );
  const [archiveConfirmFor, setArchiveConfirmFor] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<SidebarContextMenuState | null>(
    null,
  );
  const contextMenuRef = useState(() => ({ current: null as HTMLDivElement | null }))[0];

  const activeProjectId = useMemo(
    () => summaries.find((summary) => summary.id === activeSessionId)?.groupId ?? null,
    [activeSessionId, summaries],
  );

  useEffect(() => {
    if (!activeProjectId) {
      return;
    }

    setExpandedProjectIds((current) => {
      if (current.has(activeProjectId)) {
        return current;
      }

      const next = new Set(current);
      next.add(activeProjectId);
      return next;
    });
  }, [activeProjectId]);

  const projectSessionsById = useMemo(() => {
    const next = new Map<string, ChatSessionSummary[]>();
    const regularSummaries = summaries.filter((summary) => !summary.archived);

    groups.forEach((group) => {
      next.set(
        group.id,
        regularSummaries.filter((summary) => summary.groupId === group.id),
      );
    });

    return next;
  }, [groups, summaries]);

  const ungroupedSummaries = useMemo(
    () =>
      summaries.filter(
        (summary) => !summary.archived && !summary.groupId,
      ),
    [summaries],
  );

  const toggleProjectExpanded = (projectId: string) => {
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!archiveConfirmFor) {
      return;
    }

    const handleDocumentClick = () => {
      setArchiveConfirmFor(null);
    };

    document.addEventListener("click", handleDocumentClick);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, [archiveConfirmFor]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (contextMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      setContextMenu(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    const handleWindowChange = () => {
      setContextMenu(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("blur", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("blur", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [contextMenu, contextMenuRef]);

  const openContextMenu = (
    event: React.MouseEvent<HTMLElement>,
    actions: SidebarContextMenuAction[],
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setArchiveConfirmFor(null);

    const menuWidth = 188;
    const menuHeight = actions.length * 32 + 12;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const nextX = Math.min(event.clientX, viewportWidth - menuWidth - 12);
    const nextY = Math.min(event.clientY, viewportHeight - menuHeight - 12);

    setContextMenu({
      x: Math.max(12, nextX),
      y: Math.max(12, nextY),
      actions,
    });
  };

  const renderSessionRow = (
    summary: ChatSessionSummary,
    options?: {
      indent?: boolean;
      archived?: boolean;
    },
  ) => {
    const active = summary.id === activeSessionId;
    const isRunning = runningSessionIds.includes(summary.id);
    const archived = options?.archived === true;
    const isArchiveConfirming = archiveConfirmFor === summary.id;

    return (
      <div
        key={summary.id}
        onContextMenu={(event) =>
          openContextMenu(event, [
            {
              key: "open",
              label: "打开聊天",
              onSelect: () => {
                onSelectSession(summary.id);
                if (archived) {
                  setShowArchived(false);
                }
              },
            },
            {
              key: "rename",
              label: "重命名",
              onSelect: () => onRenameSession(summary.id),
            },
            archived
              ? {
                  key: "restore",
                  label: "恢复聊天",
                  onSelect: () => onUnarchiveSession(summary.id),
                }
              : {
                  key: "pin",
                  label: summary.pinned ? "取消置顶" : "置顶聊天",
                  onSelect: () =>
                    onToggleSessionPinned(summary.id, !summary.pinned),
                },
            archived
              ? {
                  key: "delete",
                  label: "删除聊天",
                  tone: "danger",
                  onSelect: () => onDeleteSession(summary.id),
                }
              : {
                  key: "archive",
                  label: "归档聊天",
                  onSelect: () => setArchiveConfirmFor(summary.id),
                },
            !archived
              ? {
                  key: "delete",
                  label: "删除聊天",
                  tone: "danger",
                  onSelect: () => onDeleteSession(summary.id),
                }
              : null,
          ].filter(Boolean) as SidebarContextMenuAction[])
        }
        className={`group relative flex items-center gap-2 rounded-[var(--radius-shell)] px-2 py-1.5 transition ${
          active
            ? "bg-[color:var(--color-control-selected-bg)]"
            : "hover:bg-[color:var(--color-control-bg-hover)]"
        } ${options?.indent ? "ml-5" : ""}`}
      >
        <button
          type="button"
          onClick={() => {
            setArchiveConfirmFor(null);
            onSelectSession(summary.id);
            if (archived) {
              setShowArchived(false);
            }
          }}
          className="min-w-0 flex-1 cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            {isRunning ? (
              <span className="inline-flex size-1.5 shrink-0 rounded-full bg-[color:var(--chela-accent)] animate-pulse" />
            ) : null}
            {summary.pinned ? (
              <MapPinIcon className="h-3.5 w-3.5 shrink-0 text-[color:var(--chela-text-tertiary)]" />
            ) : null}
            <span
              className={`min-w-0 truncate text-[12px] ${
                active
                  ? "font-medium text-[color:var(--color-control-selected-text)]"
                  : "text-[color:var(--chela-text-primary)]"
              }`}
            >
              {summary.title}
            </span>
          </div>
        </button>

        <div className="relative w-[64px] shrink-0">
          <span
            className={`block truncate pr-1 text-right text-[10px] text-[color:var(--chela-text-tertiary)] transition-opacity ${
              isArchiveConfirming
                ? "invisible"
                : "group-hover:opacity-0 group-focus-within:opacity-0"
            }`}
          >
            {formatRelativeTime(summary.updatedAt)}
          </span>
          <div
            className={`absolute inset-y-0 right-0 flex items-center gap-1 transition-opacity ${
              isArchiveConfirming
                ? "pointer-events-none opacity-0"
                : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
            }`}
          >
            {archived ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setArchiveConfirmFor(null);
                    onUnarchiveSession(summary.id);
                  }}
                  className="cursor-pointer rounded-[var(--radius-shell)] p-1 text-[color:var(--chela-text-tertiary)] transition hover:bg-[color:var(--color-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
                  aria-label="恢复聊天"
                >
                  <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setArchiveConfirmFor(null);
                    onDeleteSession(summary.id);
                  }}
                  className="cursor-pointer rounded-[var(--radius-shell)] p-1 text-[color:var(--chela-text-tertiary)] transition hover:bg-destructive/10 hover:text-destructive"
                  aria-label="删除聊天"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setArchiveConfirmFor(null);
                    onToggleSessionPinned(summary.id, !summary.pinned);
                  }}
                  className={`cursor-pointer rounded-[var(--radius-shell)] p-1 transition ${
                    summary.pinned
                      ? "text-[color:var(--chela-text-primary)]"
                      : "text-[color:var(--chela-text-tertiary)] hover:bg-[color:var(--color-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
                  }`}
                  aria-label={summary.pinned ? "取消置顶" : "置顶聊天"}
                >
                  <MapPinIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setArchiveConfirmFor(
                      isArchiveConfirming ? null : summary.id,
                    );
                  }}
                  className="cursor-pointer rounded-[var(--radius-shell)] p-1 text-[color:var(--chela-text-tertiary)] transition hover:bg-[color:var(--color-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
                  aria-label="归档聊天"
                >
                  <ArchiveBoxIcon className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
          {isArchiveConfirming ? (
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onArchiveSession(summary.id);
                  setArchiveConfirmFor(null);
                  setContextMenu(null);
                }}
                className="chela-danger-soft pointer-events-auto h-6 cursor-pointer rounded-full px-2.5 text-[10px] leading-none font-medium transition hover:brightness-[0.98]"
              >
                确认
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

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
                className={`chela-list-item flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-shell)] px-3 py-2 text-left text-[12px] transition ${
                  active
                    ? "chela-list-item-active bg-[color:var(--color-control-bg-hover)] font-medium"
                    : "text-[color:var(--chela-text-secondary)] hover:bg-[color:var(--color-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
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

  const threadsSidebar = (
    <aside className="flex h-full min-h-0 flex-col bg-transparent text-[13px] text-[color:var(--chela-text-primary)]">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3">
        {showArchived ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              className="flex cursor-pointer items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-[color:var(--chela-text-secondary)] transition hover:text-[color:var(--chela-accent-text)]"
            >
              <ArrowUturnLeftIcon className="h-3 w-3" />
              <span>返回</span>
            </button>

            <section className="space-y-2">
              <div className="px-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--chela-text-tertiary)]">
                  已归档聊天
                </p>
              </div>
              {archivedSummaries.length === 0 ? (
                <p className="px-2 py-2 text-[11px] text-[color:var(--chela-text-tertiary)]">
                  没有已归档的聊天。
                </p>
              ) : (
                <div className="space-y-1">
                  {archivedSummaries.map((summary) =>
                    renderSessionRow(summary, { archived: true }),
                  )}
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              onClick={onNewSession}
              className="chela-list-item flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-shell)] px-3 py-2 text-left text-[12px] font-medium text-[color:var(--chela-text-secondary)] transition hover:bg-[color:var(--color-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
            >
              <SquarePen className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              <span>新建聊天</span>
            </button>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--chela-text-tertiary)]">
                  项目
                </span>
                <button
                  type="button"
                  onClick={onCreateProject}
                  className="cursor-pointer text-[11px] font-medium text-[color:var(--chela-text-secondary)] transition hover:text-[color:var(--chela-text-primary)]"
                >
                  新建项目
                </button>
              </div>

              <div className="space-y-1">
                {groups.length === 0 ? (
                  <p className="px-2 py-2 text-[11px] text-[color:var(--chela-text-tertiary)]">
                    还没有项目，先选择一个文件夹。
                  </p>
                ) : (
                  groups.map((group) => {
                    const projectSessions = projectSessionsById.get(group.id) ?? [];
                    const isExpanded =
                      expandedProjectIds.has(group.id) || group.id === activeProjectId;
                    const hasPath = group.path.trim().length > 0;

                    return (
                      <div key={group.id} className="space-y-1">
                        <div
                          onContextMenu={(event) =>
                            openContextMenu(event, [
                              {
                                key: "open-project",
                                label: "打开项目",
                                onSelect: () => onSelectProject(group.id),
                              },
                              {
                                key: "new-chat",
                                label: "新建聊天",
                                onSelect: () => onCreateProjectSession(group.id),
                              },
                              {
                                key: "rename-project",
                                label: "重命名项目",
                                onSelect: () => onRenameProject(group.id),
                              },
                              {
                                key: "delete-project",
                                label: "删除项目",
                                tone: "danger",
                                onSelect: () => onDeleteProject(group.id),
                              },
                            ])
                          }
                          className="flex items-center gap-1 rounded-[var(--radius-shell)] px-2 py-1.5 transition hover:bg-[color:var(--color-control-bg-hover)]"
                        >
                          <button
                            type="button"
                            onClick={() => toggleProjectExpanded(group.id)}
                            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-[var(--radius-shell)] text-[color:var(--chela-text-secondary)] transition hover:text-[color:var(--chela-text-primary)]"
                            aria-label={isExpanded ? "收起项目" : "展开项目"}
                          >
                            {isExpanded ? (
                              <FolderOpenIcon className="h-3.5 w-3.5" />
                            ) : (
                              <FolderIcon className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedProjectIds((current) => {
                                if (current.has(group.id)) {
                                  return current;
                                }

                                const next = new Set(current);
                                next.add(group.id);
                                return next;
                              });
                              onSelectProject(group.id);
                            }}
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                          >
                            <span className="truncate text-[12px] font-medium text-[color:var(--chela-text-primary)]">
                              {group.name}
                            </span>
                            {!hasPath ? (
                              <span className="shrink-0 rounded-full bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-300">
                                待绑定
                              </span>
                            ) : null}
                          </button>
                        </div>

                        {isExpanded ? (
                          <div className="space-y-1">
                            {projectSessions.length === 0 ? (
                              <p className="ml-7 px-2 py-1 text-[11px] text-[color:var(--chela-text-tertiary)]">
                                这个项目下还没有聊天。
                              </p>
                            ) : (
                              projectSessions.map((summary) =>
                                renderSessionRow(summary, { indent: true }),
                              )
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--chela-text-tertiary)]">
                  聊天
                </span>
                <button
                  type="button"
                  onClick={onNewSession}
                  className="cursor-pointer text-[11px] font-medium text-[color:var(--chela-text-secondary)] transition hover:text-[color:var(--chela-text-primary)]"
                >
                  新建聊天
                </button>
              </div>

              <div className="space-y-1">
                {ungroupedSummaries.length === 0 ? (
                  <p className="px-2 py-2 text-[11px] text-[color:var(--chela-text-tertiary)]">
                    暂无未归属项目的聊天。
                  </p>
                ) : (
                  ungroupedSummaries.map((summary) => renderSessionRow(summary))
                )}
              </div>
            </section>

            <section className="space-y-1 pt-1">
              <SidebarFooterAction
                icon={ArchiveBoxIcon}
                label="已归档聊天"
                onClick={() => setShowArchived(true)}
              />
              <SidebarFooterAction
                icon={Cog6ToothIcon}
                label="设置"
                onClick={onOpenSettings}
              />
            </section>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="relative h-full overflow-hidden">
      <div
        className={`absolute inset-0 will-change-[opacity,transform] transition-[opacity,transform] duration-200 ease-out ${
          isSettings
            ? "pointer-events-auto translate-x-0 opacity-100"
            : "pointer-events-none -translate-x-2 opacity-0"
        }`}
      >
        {settingsSidebar}
      </div>
      <div
        className={`absolute inset-0 will-change-[opacity,transform] transition-[opacity,transform] duration-200 ease-out ${
          !isSettings
            ? "pointer-events-auto translate-x-0 opacity-100"
            : "pointer-events-none translate-x-2 opacity-0"
        }`}
      >
        {threadsSidebar}
      </div>
      {contextMenu ? (
        <div
          ref={(node) => {
            contextMenuRef.current = node;
          }}
          className="fixed z-50 min-w-[188px] rounded-[var(--radius-shell)] bg-[color:var(--chela-bg-surface)] p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.12)] ring-1 ring-black/6"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.actions.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={() => {
                setContextMenu(null);
                action.onSelect();
              }}
              className={`flex w-full cursor-pointer items-center rounded-[calc(var(--radius-shell)-4px)] px-2.5 py-1.5 text-left text-[12px] transition ${
                action.tone === "danger"
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-[color:var(--chela-text-primary)] hover:bg-[color:var(--color-control-bg-hover)]"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const Sidebar = memo(SidebarImpl);
