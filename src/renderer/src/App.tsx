import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  CommandLineIcon,
  RectangleGroupIcon,
} from "@heroicons/react/24/outline";
import type {
  ChatSession,
  ChatSessionSummary,
  ModelSelection,
  SelectedFile,
  Settings,
  SessionGroup,
  ThinkingLevel,
  WindowFrameState,
} from "@shared/contracts";
import { AssistantThreadPanel } from "@renderer/components/assistant-ui/assistant-thread-panel";
import { Button } from "@renderer/components/assistant-ui/button";
import { ContextPanel } from "@renderer/components/assistant-ui/context-panel";
import {
  SettingsView,
  type SettingsSection,
} from "@renderer/components/assistant-ui/settings-view";
import { Sidebar } from "@renderer/components/assistant-ui/sidebar";
import { TerminalDrawer } from "@renderer/components/assistant-ui/terminal-drawer";
import { TitleBar } from "@renderer/components/assistant-ui/title-bar";
import { mergeAttachments, upsertSummary } from "@renderer/lib/session";

const ACTIVE_SESSION_STORAGE_KEY = "first-pi-agent.active-session-id";
const SIDEBAR_WIDTH_STORAGE_KEY = "first-pi-agent.sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 292;
const MIN_SIDEBAR_WIDTH = 244;
const MAX_SIDEBAR_WIDTH = 420;
const ROOT_UI_THEME_DATASET = "theme";

function applyCustomThemeVariables(
  root: HTMLElement,
  previousKeys: string[],
  nextTheme: Record<string, string> | null,
) {
  previousKeys.forEach((key) => root.style.removeProperty(key));

  const appliedKeys: string[] = [];
  if (!nextTheme) {
    return appliedKeys;
  }

  Object.entries(nextTheme).forEach(([rawKey, value]) => {
    const key = rawKey.startsWith("--") ? rawKey : `--${rawKey}`;
    root.style.setProperty(key, value);
    appliedKeys.push(key);
  });

  return appliedKeys;
}

export default function App() {
  const desktopApi = window.desktopApi;
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [isPickingFiles, setIsPickingFiles] = useState(false);
  const [summaries, setSummaries] = useState<ChatSessionSummary[]>([]);
  const [archivedSummaries, setArchivedSummaries] = useState<
    ChatSessionSummary[]
  >([]);
  const [groups, setGroups] = useState<SessionGroup[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [frameState, setFrameState] = useState<WindowFrameState>({
    isMaximized: false,
  });
  const [mainView, setMainView] = useState<"thread" | "settings">("thread");
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("general");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_SIDEBAR_WIDTH;
    }

    const storedWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    if (!Number.isFinite(storedWidth)) {
      return DEFAULT_SIDEBAR_WIDTH;
    }

    return Math.min(
      MAX_SIDEBAR_WIDTH,
      Math.max(MIN_SIDEBAR_WIDTH, storedWidth),
    );
  });
  const [currentModel, setCurrentModel] = useState<ModelSelection>({
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
  });
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>("off");

  const activeSessionId = activeSession?.id ?? null;
  const threadGridColumns =
    mainView === "settings"
      ? "minmax(0,1fr)"
      : rightPanelOpen
        ? "minmax(0,1fr) 360px"
        : "minmax(0,1fr) 0px";
  const summariesRef = useRef<ChatSessionSummary[]>([]);
  const activeSessionIdRef = useRef<string | null>(null);
  const sidebarWidthRef = useRef(sidebarWidth);
  const appliedCustomThemeKeysRef = useRef<string[]>([]);

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

  useEffect(() => {
    if (!settings) {
      return;
    }

    const root = document.documentElement;
    root.dataset[ROOT_UI_THEME_DATASET] = settings.theme;
    root.style.setProperty("--app-ui-font-family", settings.ui.fontFamily);
    root.style.setProperty("--app-ui-font-size", `${settings.ui.fontSize}px`);
    root.style.setProperty(
      "--app-code-font-family",
      settings.ui.codeFontFamily,
    );
    root.style.setProperty(
      "--app-code-font-size",
      `${settings.ui.codeFontSize}px`,
    );

    appliedCustomThemeKeysRef.current = applyCustomThemeVariables(
      root,
      appliedCustomThemeKeysRef.current,
      settings.theme === "custom" ? settings.customTheme : null,
    );
  }, [settings]);

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
        setSummaries((current) =>
          current.filter((summary) => summary.id !== session.id),
        );
      } else {
        setSummaries((current) => upsertSummary(current, session));
        setArchivedSummaries((current) =>
          current.filter((summary) => summary.id !== session.id),
        );
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
      setBootError(
        "桌面桥接没有注入成功，renderer 无法访问 Electron API。现在不会再整窗黑掉，而是直接把问题暴露出来。",
      );
      setBooting(false);
      return;
    }

    try {
      const [
        uiState,
        frame,
        sessionSummaries,
        archivedList,
        groupList,
        settings,
      ] = await Promise.all([
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
        setSettings(settings);
        setCurrentModel(settings.defaultModel);
        setThinkingLevel(settings.thinkingLevel);
      }

      const storedSessionId = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      let nextSession = storedSessionId
        ? await desktopApi.sessions.load(storedSessionId)
        : null;

      if (!nextSession && sessionSummaries[0]) {
        nextSession = await desktopApi.sessions.load(sessionSummaries[0].id);
      }

      if (!nextSession) {
        nextSession = await desktopApi.sessions.create();
        setSummaries([upsertSummary([], nextSession)[0]]);
      }

      hydrateSession(nextSession);
    } catch (error) {
      setBootError(
        error instanceof Error ? error.message : "桌面壳初始化失败。",
      );
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
        if (!terminalOpen) {
          e.preventDefault();
          setTerminalOpen(true);
        }
      } else if (mod && e.key === "n") {
        e.preventDefault();
        void createNewSession();
      } else if (mod && e.key === ",") {
        e.preventDefault();
        if (mainView === "settings") {
          closeSettingsView();
        } else {
          openSettingsView();
        }
      } else if (e.key === "Escape") {
        if (mainView === "settings") {
          closeSettingsView();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      cleanup();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [bootApp, desktopApi, mainView, terminalOpen]);

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

  const archiveSession = useCallback(
    async (sessionId: string) => {
      if (!desktopApi) {
        return;
      }

      const remaining = summariesRef.current.filter(
        (summary) => summary.id !== sessionId,
      );

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
    },
    [createNewSession, desktopApi, refreshSessionLists, selectSession],
  );

  const unarchiveSession = useCallback(
    async (sessionId: string) => {
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
    },
    [desktopApi, hydrateSession, refreshSessionLists],
  );

  const deleteSessionPermanently = useCallback(
    async (sessionId: string) => {
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
    },
    [createNewSession, desktopApi, refreshSessionLists, selectSession],
  );

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
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
            ? {
                ...summary,
                title: nextTitle,
                updatedAt: new Date().toISOString(),
              }
            : summary,
        ),
      );

      setArchivedSummaries((prev) =>
        prev.map((summary) =>
          summary.id === sessionId
            ? {
                ...summary,
                title: nextTitle,
                updatedAt: new Date().toISOString(),
              }
            : summary,
        ),
      );

      setActiveSession((current) =>
        current && current.id === sessionId
          ? {
              ...current,
              title: nextTitle,
              updatedAt: new Date().toISOString(),
            }
          : current,
      );
    },
    [desktopApi],
  );

  const createGroup = useCallback(
    async (name: string) => {
      if (!desktopApi) return;
      const group = await desktopApi.groups.create(name);
      setGroups((prev) => [...prev, group]);
    },
    [desktopApi],
  );

  const renameGroup = useCallback(
    async (groupId: string, name: string) => {
      if (!desktopApi) return;
      await desktopApi.groups.rename(groupId, name);
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, name } : g)),
      );
    },
    [desktopApi],
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      if (!desktopApi) return;
      await desktopApi.groups.delete(groupId);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      // Refresh summaries so groupId is cleared on all affected sessions
      await refreshSessionLists();
    },
    [desktopApi, refreshSessionLists],
  );

  const setSessionGroup = useCallback(
    async (sessionId: string, groupId: string | null) => {
      if (!desktopApi) return;
      await desktopApi.sessions.setGroup(sessionId, groupId);
      // Update summary in state optimistically
      setSummaries((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, groupId: groupId ?? undefined } : s,
        ),
      );
    },
    [desktopApi],
  );

  const enrichSelectedFiles = useCallback(
    async (files: SelectedFile[]) => {
      if (!desktopApi) {
        return files;
      }

      return Promise.all(
        files.map(async (file) => {
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
    },
    [desktopApi],
  );

  const appendAttachmentsToSession = useCallback(
    async (
      files: SelectedFile[],
      options?: {
        openRightPanel?: boolean;
      },
    ) => {
      if (!activeSession || !desktopApi || files.length === 0) {
        return;
      }

      const enrichedFiles = await enrichSelectedFiles(files);
      const nextSession: ChatSession = {
        ...activeSession,
        attachments: mergeAttachments(activeSession.attachments, enrichedFiles),
        updatedAt: new Date().toISOString(),
      };

      persistSession(nextSession);

      if (options?.openRightPanel !== false && !rightPanelOpen) {
        setRightPanelOpen(true);
        void desktopApi.ui.setRightPanelOpen(true);
      }
    },
    [
      activeSession,
      desktopApi,
      enrichSelectedFiles,
      persistSession,
      rightPanelOpen,
    ],
  );

  const attachFiles = useCallback(async () => {
    if (!activeSession || !desktopApi) {
      return;
    }

    setIsPickingFiles(true);

    try {
      const pickedFiles = await desktopApi.files.pick();
      await appendAttachmentsToSession(pickedFiles, { openRightPanel: true });
    } finally {
      setIsPickingFiles(false);
    }
  }, [activeSession, appendAttachmentsToSession, desktopApi]);

  const pasteFiles = useCallback(
    async (files: File[]) => {
      if (!activeSession || !desktopApi || files.length === 0) {
        return;
      }

      setIsPickingFiles(true);

      try {
        const pastedFiles = await Promise.all(
          files.map(async (file) =>
            desktopApi.files.saveFromClipboard({
              name: file.name,
              mimeType: file.type,
              buffer: await file.arrayBuffer(),
            }),
          ),
        );

        await appendAttachmentsToSession(pastedFiles, {
          openRightPanel: false,
        });
      } finally {
        setIsPickingFiles(false);
      }
    },
    [activeSession, appendAttachmentsToSession, desktopApi],
  );

  const removeAttachment = useCallback(
    (attachmentId: string) => {
      if (!activeSession) {
        return;
      }

      const nextSession: ChatSession = {
        ...activeSession,
        attachments: activeSession.attachments.filter(
          (attachment) => attachment.id !== attachmentId,
        ),
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

  const handleToggleMaximize = useCallback(() => {
    if (!desktopApi) {
      return;
    }

    void desktopApi.window.toggleMaximize().then((nextState) => {
      setFrameState(nextState);
    });
  }, [desktopApi]);

  const openSettingsView = useCallback((section: SettingsSection = "general") => {
    startTransition(() => {
      setSettingsSection(section);
      setMainView("settings");
    });
  }, []);

  const closeSettingsView = useCallback(() => {
    startTransition(() => {
      setMainView("thread");
    });
  }, []);

  const openArchivedSessionFromSettings = useCallback(
    async (sessionId: string) => {
      await selectSession(sessionId);
      closeSettingsView();
    },
    [closeSettingsView, selectSession],
  );

  const handleSettingsChange = useCallback(
    (partial: Partial<Settings>) => {
      setSettings((current) => (current ? { ...current, ...partial } : current));
      void desktopApi?.settings.update(partial);
    },
    [desktopApi],
  );

  const handleModelChange = useCallback(
    (model: ModelSelection) => {
      setCurrentModel(model);
      setSettings((current) =>
        current ? { ...current, defaultModel: model } : current,
      );
      void desktopApi?.settings.update({ defaultModel: model });
    },
    [desktopApi],
  );

  const handleThinkingLevelChange = useCallback(
    (level: ThinkingLevel) => {
      setThinkingLevel(level);
      setSettings((current) =>
        current ? { ...current, thinkingLevel: level } : current,
      );
      void desktopApi?.settings.update({ thinkingLevel: level });
    },
    [desktopApi],
  );

  const startSidebarResize = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();

      const startX = event.clientX;
      const startWidth = sidebarWidthRef.current;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const proposedWidth = startWidth + moveEvent.clientX - startX;
        const nextWidth = Math.min(
          MAX_SIDEBAR_WIDTH,
          Math.max(MIN_SIDEBAR_WIDTH, proposedWidth),
        );
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
    },
    [],
  );

  if (booting) {
    return (
      <main className="grid h-screen place-items-center bg-[#f0f0f0] text-gray-400">
        <div className="rounded-xl border border-black/6 bg-white/80 px-6 py-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400">
            Booting
          </p>
          <h1 className="mt-2 text-lg font-medium text-gray-800">
            正在拉起桌面聊天壳…
          </h1>
          <p className="mt-1 text-xs text-gray-400">
            会话状态、窗口状态和本地文件能力正在就位。
          </p>
        </div>
      </main>
    );
  }

  if (bootError) {
    return (
      <main className="grid h-screen place-items-center bg-[#f0f0f0] px-6 text-gray-400">
        <div className="max-w-lg rounded-xl border border-rose-400/20 bg-rose-50 px-6 py-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.2em] text-rose-300">
            Renderer Error
          </p>
          <h1 className="mt-2 text-lg font-medium text-gray-800">
            界面初始化失败
          </h1>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-gray-500">
            {bootError}
          </p>
          <p className="mt-2 text-xs text-gray-400">
            现在就算 preload 出问题，也不会再整窗发黑，而是直接显示诊断信息。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden rounded-[var(--radius-shell)] bg-shell-window text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <TitleBar
        isMaximized={frameState.isMaximized}
        onMinimize={() => desktopApi?.window.minimize()}
        onToggleMaximize={handleToggleMaximize}
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
            onOpenSettings={() => openSettingsView("general")}
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
            viewMode={mainView === "settings" ? "settings" : "threads"}
            activeSettingsSection={settingsSection}
            onSelectSettingsSection={setSettingsSection}
            onExitSettings={closeSettingsView}
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
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-l-[var(--radius-shell)] bg-shell-panel shadow-[inset_1px_0_0_rgba(255,255,255,0.03)]">
            <div className="flex min-h-[52px] items-center justify-end gap-2 px-5 pb-3 pt-4">
              {mainView === "thread" ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setTerminalOpen((prev) => !prev)}
                    className={`h-9 w-9 cursor-pointer rounded-[var(--radius-shell)] border-none shadow-none hover:bg-shell-toolbar-hover ${terminalOpen ? "bg-shell-toolbar-hover text-foreground" : "bg-transparent text-muted-foreground"}`}
                    aria-label={terminalOpen ? "收起终端" : "展开终端"}
                  >
                    <CommandLineIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={toggleRightPanel}
                    className={`h-9 w-9 cursor-pointer rounded-[var(--radius-shell)] border-none shadow-none hover:bg-shell-toolbar-hover ${rightPanelOpen ? "bg-shell-toolbar-hover text-foreground" : "bg-transparent text-muted-foreground"}`}
                    aria-label={
                      rightPanelOpen ? "收起右侧上下文" : "展开右侧上下文"
                    }
                  >
                    <RectangleGroupIcon className="h-4 w-4" />
                  </Button>
                </>
              ) : null}
            </div>

            <div
              className="grid min-h-0 flex-1 bg-shell-panel transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ gridTemplateColumns: threadGridColumns }}
            >
              <section className="flex min-h-0 flex-col bg-shell-panel">
                {mainView === "settings" ? (
                  <SettingsView
                    activeSection={settingsSection}
                    settings={settings}
                    currentModel={currentModel}
                    thinkingLevel={thinkingLevel}
                    onModelChange={handleModelChange}
                    onThinkingLevelChange={handleThinkingLevelChange}
                    onSettingsChange={handleSettingsChange}
                    archivedSummaries={archivedSummaries}
                    onOpenArchivedSession={openArchivedSessionFromSettings}
                    onUnarchiveSession={(sessionId) => {
                      void unarchiveSession(sessionId);
                    }}
                    onDeleteSession={(sessionId) => {
                      void deleteSessionPermanently(sessionId);
                    }}
                  />
                ) : activeSession && desktopApi ? (
                  <AssistantThreadPanel
                    session={activeSession}
                    desktopApi={desktopApi}
                    onPersistSession={persistSession}
                    currentModel={currentModel}
                    thinkingLevel={thinkingLevel}
                    terminalOpen={terminalOpen}
                    isPickingFiles={isPickingFiles}
                    onAttachFiles={attachFiles}
                    onPasteFiles={pasteFiles}
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

              {mainView === "thread" ? (
                <div
                  className={`min-h-0 overflow-hidden ${rightPanelOpen ? "" : "pointer-events-none"}`}
                >
                  <ContextPanel open={rightPanelOpen} session={activeSession} />
                </div>
              ) : null}
            </div>

            {mainView === "thread" ? (
              <TerminalDrawer
                open={terminalOpen}
                onToggle={() => setTerminalOpen((prev) => !prev)}
                settings={settings}
              />
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
