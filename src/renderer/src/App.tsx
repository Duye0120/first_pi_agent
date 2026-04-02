import { startTransition, useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { CommandLineIcon, RectangleGroupIcon } from "@heroicons/react/24/outline";
import type { ChatSession, ChatSessionSummary, ModelSelection, SessionGroup, ThinkingLevel, WindowFrameState } from "@shared/contracts";
import { AssistantThreadPanel } from "@renderer/components/AssistantThreadPanel";
import { ContextPanel } from "@renderer/components/ContextPanel";
import { Sidebar } from "@renderer/components/Sidebar";
import { TitleBar } from "@renderer/components/TitleBar";
import { SettingsModal } from "@renderer/components/SettingsModal";
import { TerminalDrawer } from "@renderer/components/TerminalDrawer";
import { Button } from "@renderer/components/ui/button";
import { mergeAttachments, upsertSummary } from "@renderer/lib/session";

const ACTIVE_SESSION_STORAGE_KEY = "first-pi-agent.active-session-id";
const SIDEBAR_WIDTH_STORAGE_KEY = "first-pi-agent.sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 292;
const MIN_SIDEBAR_WIDTH = 244;
const MAX_SIDEBAR_WIDTH = 420;

export default function App() {
  const desktopApi = window.desktopApi;
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [isPickingFiles, setIsPickingFiles] = useState(false);
  const [summaries, setSummaries] = useState<ChatSessionSummary[]>([]);
  const [archivedSummaries, setArchivedSummaries] = useState<ChatSessionSummary[]>([]);
  const [groups, setGroups] = useState<SessionGroup[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [frameState, setFrameState] = useState<WindowFrameState>({ isMaximized: false });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_SIDEBAR_WIDTH;
    }

    const storedWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    if (!Number.isFinite(storedWidth)) {
      return DEFAULT_SIDEBAR_WIDTH;
    }

    return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, storedWidth));
  });
  const [currentModel, setCurrentModel] = useState<ModelSelection>({ provider: "anthropic", model: "claude-sonnet-4-20250514" });
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>("off");

  const activeSessionId = activeSession?.id ?? null;
  const summariesRef = useRef<ChatSessionSummary[]>([]);
  const activeSessionIdRef = useRef<string | null>(null);
  const sidebarWidthRef = useRef(sidebarWidth);

  useEffect(() => {
    summariesRef.current = summaries;
  }, [summaries]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  const hydrateSession = useCallback((session: ChatSession) => {
    startTransition(() => {
      setActiveSession(session);
    });
    localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, session.id);
  }, []);

  const persistSession = useCallback(
    (session: ChatSession) => {
      setActiveSession(session);
      if (session.archived) {
        setArchivedSummaries((current) => upsertSummary(current, session));
        setSummaries((current) => current.filter((summary) => summary.id !== session.id));
      } else {
        setSummaries((current) => upsertSummary(current, session));
        setArchivedSummaries((current) => current.filter((summary) => summary.id !== session.id));
      }
      void desktopApi?.sessions.save(session);
    },
    [desktopApi],
  );

  const refreshSessionLists = useCallback(async () => {
    if (!desktopApi) {
      return { sessionSummaries: [], archivedList: [] };
    }

    const [sessionSummaries, archivedList] = await Promise.all([
      desktopApi.sessions.list(),
      desktopApi.sessions.listArchived(),
    ]);

    setSummaries(sessionSummaries);
    setArchivedSummaries(archivedList);

    return { sessionSummaries, archivedList };
  }, [desktopApi]);

  const bootApp = useCallback(async () => {
    if (!desktopApi) {
      setBootError("桌面桥接没有注入成功，renderer 无法访问 Electron API。现在不会再整窗黑掉，而是直接把问题暴露出来。");
      setBooting(false);
      return;
    }

    try {
      const [uiState, frame, sessionSummaries, archivedList, groupList, settings] = await Promise.all([
        desktopApi.ui.getState(),
        desktopApi.window.getState(),
        desktopApi.sessions.list(),
        desktopApi.sessions.listArchived(),
        desktopApi.groups.list(),
        desktopApi.settings.get(),
      ]);

      setRightPanelOpen(uiState.rightPanelOpen);
      setFrameState(frame);
      setSummaries(sessionSummaries);
      setArchivedSummaries(archivedList);
      setGroups(groupList);
      if (settings) {
        setCurrentModel(settings.defaultModel);
        setThinkingLevel(settings.thinkingLevel);
      }

      const storedSessionId = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      let nextSession = storedSessionId ? await desktopApi.sessions.load(storedSessionId) : null;

      if (!nextSession && sessionSummaries[0]) {
        nextSession = await desktopApi.sessions.load(sessionSummaries[0].id);
      }

      if (!nextSession) {
        nextSession = await desktopApi.sessions.create();
        setSummaries([upsertSummary([], nextSession)[0]]);
      }

      hydrateSession(nextSession);
    } catch (error) {
      setBootError(error instanceof Error ? error.message : "桌面壳初始化失败。");
    } finally {
      setBooting(false);
    }
  }, [desktopApi, hydrateSession]);

  useEffect(() => {
    void bootApp();

    if (!desktopApi) {
      return;
    }

    const cleanup = desktopApi.window.onStateChange((state) => {
      setFrameState(state);
    });

    // Global keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "j") {
        e.preventDefault();
        setTerminalOpen((prev) => !prev);
      } else if (mod && e.key === "n") {
        e.preventDefault();
        void createNewSession();
      } else if (mod && e.key === ",") {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        if (settingsOpen) setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      cleanup();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [bootApp, desktopApi]);

  const createNewSession = useCallback(async () => {
    if (!desktopApi) {
      return;
    }

    const nextSession = await desktopApi.sessions.create();
    setSummaries((current) => upsertSummary(current, nextSession));
    hydrateSession(nextSession);
  }, [desktopApi, hydrateSession]);

  const selectSession = useCallback(
    async (sessionId: string) => {
      if (!desktopApi) {
        return;
      }

      const session = await desktopApi.sessions.load(sessionId);
      if (session) {
        hydrateSession(session);
      }
    },
    [desktopApi, hydrateSession],
  );

  const archiveSession = useCallback(async (sessionId: string) => {
    if (!desktopApi) {
      return;
    }

    const remaining = summariesRef.current.filter((summary) => summary.id !== sessionId);

    await desktopApi.sessions.archive(sessionId);
    await refreshSessionLists();

    if (activeSessionIdRef.current !== sessionId) {
      return;
    }

    if (remaining.length > 0) {
      void selectSession(remaining[0].id);
      return;
    }

    void createNewSession();
  }, [createNewSession, desktopApi, refreshSessionLists, selectSession]);

  const unarchiveSession = useCallback(async (sessionId: string) => {
    if (!desktopApi) {
      return;
    }

    await desktopApi.sessions.unarchive(sessionId);
    await refreshSessionLists();

    if (activeSessionIdRef.current !== sessionId) {
      return;
    }

    const session = await desktopApi.sessions.load(sessionId);
    if (session) {
      hydrateSession(session);
    }
  }, [desktopApi, hydrateSession, refreshSessionLists]);

  const deleteSessionPermanently = useCallback(async (sessionId: string) => {
    if (!desktopApi) {
      return;
    }

    const wasActive = activeSessionIdRef.current === sessionId;
    await desktopApi.sessions.delete(sessionId);
    const { sessionSummaries } = await refreshSessionLists();

    if (!wasActive) {
      return;
    }

    if (sessionSummaries[0]) {
      void selectSession(sessionSummaries[0].id);
      return;
    }

    void createNewSession();
  }, [createNewSession, desktopApi, refreshSessionLists, selectSession]);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    if (!desktopApi) {
      return;
    }

    const nextTitle = title.trim();
    if (!nextTitle) {
      return;
    }

    await desktopApi.sessions.rename(sessionId, nextTitle);

    setSummaries((prev) =>
      prev.map((summary) =>
        summary.id === sessionId
          ? { ...summary, title: nextTitle, updatedAt: new Date().toISOString() }
          : summary,
      ),
    );

    setArchivedSummaries((prev) =>
      prev.map((summary) =>
        summary.id === sessionId
          ? { ...summary, title: nextTitle, updatedAt: new Date().toISOString() }
          : summary,
      ),
    );

    setActiveSession((current) =>
      current && current.id === sessionId
        ? { ...current, title: nextTitle, updatedAt: new Date().toISOString() }
        : current,
    );
  }, [desktopApi]);

  const createGroup = useCallback(async (name: string) => {
    if (!desktopApi) return;
    const group = await desktopApi.groups.create(name);
    setGroups((prev) => [...prev, group]);
  }, [desktopApi]);

  const renameGroup = useCallback(async (groupId: string, name: string) => {
    if (!desktopApi) return;
    await desktopApi.groups.rename(groupId, name);
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name } : g)));
  }, [desktopApi]);

  const deleteGroup = useCallback(async (groupId: string) => {
    if (!desktopApi) return;
    await desktopApi.groups.delete(groupId);
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    // Refresh summaries so groupId is cleared on all affected sessions
    await refreshSessionLists();
  }, [desktopApi, refreshSessionLists]);

  const setSessionGroup = useCallback(async (sessionId: string, groupId: string | null) => {
    if (!desktopApi) return;
    await desktopApi.sessions.setGroup(sessionId, groupId);
    // Update summary in state optimistically
    setSummaries((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, groupId: groupId ?? undefined } : s))
    );
  }, [desktopApi]);

  const attachFiles = useCallback(async () => {
    if (!activeSession || !desktopApi) {
      return;
    }

    setIsPickingFiles(true);

    try {
      const pickedFiles = await desktopApi.files.pick();
      const enrichedFiles = await Promise.all(
        pickedFiles.map(async (file) => {
          if (file.kind !== "text") {
            return file;
          }

          const preview = await desktopApi.files.readPreview(file.path);
          return {
            ...file,
            previewText: preview.previewText,
            truncated: preview.truncated,
            error: preview.error,
          };
        }),
      );

      const nextSession: ChatSession = {
        ...activeSession,
        attachments: mergeAttachments(activeSession.attachments, enrichedFiles),
        updatedAt: new Date().toISOString(),
      };

      persistSession(nextSession);

      if (!rightPanelOpen) {
        setRightPanelOpen(true);
        void desktopApi.ui.setRightPanelOpen(true);
      }
    } finally {
      setIsPickingFiles(false);
    }
  }, [activeSession, desktopApi, persistSession, rightPanelOpen]);

  const removeAttachment = useCallback(
    (attachmentId: string) => {
      if (!activeSession) {
        return;
      }

      const nextSession: ChatSession = {
        ...activeSession,
        attachments: activeSession.attachments.filter((attachment) => attachment.id !== attachmentId),
        updatedAt: new Date().toISOString(),
      };

      persistSession(nextSession);
    },
    [activeSession, persistSession],
  );

  const toggleRightPanel = useCallback(() => {
    const nextOpen = !rightPanelOpen;
    setRightPanelOpen(nextOpen);
    void desktopApi?.ui.setRightPanelOpen(nextOpen);
  }, [desktopApi, rightPanelOpen]);

  const handleModelChange = useCallback((model: ModelSelection) => {
    setCurrentModel(model);
    void desktopApi?.settings.update({ defaultModel: model });
  }, [desktopApi]);

  const handleThinkingLevelChange = useCallback((level: ThinkingLevel) => {
    setThinkingLevel(level);
    void desktopApi?.settings.update({ thinkingLevel: level });
  }, [desktopApi]);

  const startSidebarResize = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = sidebarWidthRef.current;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const proposedWidth = startWidth + moveEvent.clientX - startX;
      const nextWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, proposedWidth));
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, []);

  if (booting) {
    return (
      <main className="grid h-screen place-items-center bg-[#f0f0f0] text-gray-400">
        <div className="rounded-xl border border-black/6 bg-white/80 px-6 py-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400">Booting</p>
          <h1 className="mt-2 text-lg font-medium text-gray-800">正在拉起桌面聊天壳…</h1>
          <p className="mt-1 text-xs text-gray-400">会话状态、窗口状态和本地文件能力正在就位。</p>
        </div>
      </main>
    );
  }

  if (bootError) {
    return (
      <main className="grid h-screen place-items-center bg-[#f0f0f0] px-6 text-gray-400">
        <div className="max-w-lg rounded-xl border border-rose-400/20 bg-rose-50 px-6 py-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.2em] text-rose-300">Renderer Error</p>
          <h1 className="mt-2 text-lg font-medium text-gray-800">界面初始化失败</h1>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-gray-500">{bootError}</p>
          <p className="mt-2 text-xs text-gray-400">现在就算 preload 出问题，也不会再整窗发黑，而是直接显示诊断信息。</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-shell-window text-foreground">
      <TitleBar
        isMaximized={frameState.isMaximized}
        onMinimize={() => desktopApi?.window.minimize()}
        onToggleMaximize={() => desktopApi?.window.toggleMaximize()}
        onClose={() => desktopApi?.window.close()}
      />
      <div
        className="grid min-h-0 flex-1 overflow-hidden bg-shell-window"
        style={{ gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)` }}
      >
        <aside className="relative min-h-0 bg-transparent">
          <Sidebar
            summaries={summaries}
            activeSessionId={activeSessionId}
            onSelectSession={selectSession}
            onNewSession={createNewSession}
            onOpenSettings={() => setSettingsOpen(true)}
            onArchiveSession={archiveSession}
            onUnarchiveSession={unarchiveSession}
            onDeleteSession={deleteSessionPermanently}
            onRenameSession={renameSession}
            archivedSummaries={archivedSummaries}
            groups={groups}
            onCreateGroup={createGroup}
            onRenameGroup={renameGroup}
            onDeleteGroup={deleteGroup}
            onSetSessionGroup={setSessionGroup}
          />
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="调整侧边栏宽度"
            onMouseDown={startSidebarResize}
            className="group absolute inset-y-0 right-0 z-20 flex w-3 translate-x-1/2 cursor-col-resize items-center justify-center"
          >
            <div className="h-14 w-[2px] rounded-full bg-shell-resize transition group-hover:h-24 group-hover:bg-shell-resize-hover" />
          </div>
        </aside>

        <section className="relative flex min-h-0 flex-col overflow-hidden bg-shell-window">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-l-[30px] border border-shell-border border-r-0 border-b-0 bg-shell-panel shadow-none">
            <div className="flex items-center justify-end gap-2 px-5 pb-3 pt-4">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setTerminalOpen((prev) => !prev)}
                className={`h-9 w-9 rounded-xl border-shell-border bg-shell-toolbar text-muted-foreground shadow-none hover:bg-shell-toolbar-hover hover:text-foreground ${terminalOpen ? "border-shell-border bg-shell-panel text-foreground" : ""}`}
                aria-label={terminalOpen ? "收起终端" : "展开终端"}
              >
                <CommandLineIcon className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={toggleRightPanel}
                className={`h-9 w-9 rounded-xl border-shell-border bg-shell-toolbar text-muted-foreground shadow-none hover:bg-shell-toolbar-hover hover:text-foreground ${rightPanelOpen ? "border-shell-border bg-shell-panel text-foreground" : ""}`}
                aria-label={rightPanelOpen ? "收起右侧上下文" : "展开右侧上下文"}
              >
                <RectangleGroupIcon className="h-4 w-4" />
              </Button>
            </div>

            <div className={`grid min-h-0 flex-1 bg-shell-panel ${rightPanelOpen ? "grid-cols-[minmax(0,1fr)_360px]" : "grid-cols-[minmax(0,1fr)]"}`}>
              <section className="flex min-h-0 flex-col bg-shell-panel">
                {activeSession && desktopApi ? (
                  <AssistantThreadPanel
                    session={activeSession}
                    desktopApi={desktopApi}
                    onPersistSession={persistSession}
                    currentModel={currentModel}
                    thinkingLevel={thinkingLevel}
                    isPickingFiles={isPickingFiles}
                    onAttachFiles={attachFiles}
                    onRemoveAttachment={removeAttachment}
                    onModelChange={handleModelChange}
                    onThinkingLevelChange={handleThinkingLevelChange}
                  />
                ) : (
                  <div className="grid min-h-0 flex-1 place-items-center px-6 text-sm text-gray-400">
                    当前没有可用线程。
                  </div>
                )}
              </section>

              {rightPanelOpen ? <ContextPanel open={rightPanelOpen} session={activeSession} /> : null}
            </div>

            <TerminalDrawer
              open={terminalOpen}
              onToggle={() => setTerminalOpen((prev) => !prev)}
            />
          </div>
        </section>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}
