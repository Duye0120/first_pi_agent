import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CommandLineIcon,
  RectangleGroupIcon,
} from "@heroicons/react/24/outline";
import type {
  ChatSession,
  ChatSessionSummary,
  GitDiffOverview,
  SelectedFile,
  Settings,
  SessionGroup,
  ThinkingLevel,
  WindowFrameState,
} from "@shared/contracts";
import { AssistantThreadPanel } from "@renderer/components/assistant-ui/assistant-thread-panel";
import { Button } from "@renderer/components/assistant-ui/button";
import { DiffPanel } from "@renderer/components/assistant-ui/diff-panel";
import {
  SettingsView,
  type SettingsSection,
} from "@renderer/components/assistant-ui/settings-view";
import { Sidebar } from "@renderer/components/assistant-ui/sidebar";
import { TerminalDrawer } from "@renderer/components/assistant-ui/terminal-drawer";
import { TitleBar } from "@renderer/components/assistant-ui/title-bar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";
import {
  getContextUsageSummary,
  resolveContextWindow,
} from "@renderer/lib/context-usage";
import { mergeAttachments, upsertSummary } from "@renderer/lib/session";

const ACTIVE_SESSION_STORAGE_KEY = "first-pi-agent.active-session-id";
const SIDEBAR_WIDTH_STORAGE_KEY = "first-pi-agent.sidebar-width";
const LEGACY_RIGHT_PANEL_SIZE_STORAGE_KEY = "first-pi-agent.right-panel-size";
const DIFF_PANEL_SIZE_STORAGE_KEY = "first-pi-agent.diff-panel-size";
const DEFAULT_SIDEBAR_SIZE = 18;
const MIN_SIDEBAR_SIZE = 14;
const MAX_SIDEBAR_SIZE = 28;
const DEFAULT_DIFF_PANEL_SIZE = 28;
const MIN_DIFF_PANEL_SIZE = 20;
const MAX_DIFF_PANEL_SIZE = 44;
const ROOT_UI_THEME_DATASET = "theme";

function clampSidebarSize(size: number) {
  return Math.min(MAX_SIDEBAR_SIZE, Math.max(MIN_SIDEBAR_SIZE, size));
}

function clampDiffPanelSize(size: number) {
  return Math.min(MAX_DIFF_PANEL_SIZE, Math.max(MIN_DIFF_PANEL_SIZE, size));
}

function toSidebarPercentageSize(size: number) {
  return `${clampSidebarSize(size)}%`;
}

function toPercentageSize(size: number) {
  return `${size}%`;
}

function migrateLegacySidebarWidth(storedWidth: number) {
  if (storedWidth <= 100) {
    return clampSidebarSize(storedWidth);
  }

  if (typeof window === "undefined" || window.innerWidth <= 0) {
    return DEFAULT_SIDEBAR_SIZE;
  }

  return clampSidebarSize((storedWidth / window.innerWidth) * 100);
}

function readStoredPanelSize(
  primaryKey: string,
  fallbackKey: string | null,
  defaultSize: number,
  clamp: (size: number) => number,
) {
  if (typeof window === "undefined") {
    return defaultSize;
  }

  const primaryValue = Number(localStorage.getItem(primaryKey));
  if (Number.isFinite(primaryValue)) {
    return clamp(primaryValue);
  }

  if (fallbackKey) {
    const fallbackValue = Number(localStorage.getItem(fallbackKey));
    if (Number.isFinite(fallbackValue)) {
      return clamp(fallbackValue);
    }
  }

  return defaultSize;
}

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
  const [diffPanelOpen, setDiffPanelOpen] = useState(false);
  const [frameState, setFrameState] = useState<WindowFrameState>({
    isMaximized: false,
  });
  const [mainView, setMainView] = useState<"thread" | "settings">("thread");
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("general");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [sidebarSize, setSidebarSize] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_SIDEBAR_SIZE;
    }

    const storedWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    if (!Number.isFinite(storedWidth)) {
      return DEFAULT_SIDEBAR_SIZE;
    }

    return migrateLegacySidebarWidth(storedWidth);
  });
  const [diffPanelSize, setDiffPanelSize] = useState(() =>
    readStoredPanelSize(
      DIFF_PANEL_SIZE_STORAGE_KEY,
      LEGACY_RIGHT_PANEL_SIZE_STORAGE_KEY,
      DEFAULT_DIFF_PANEL_SIZE,
      clampDiffPanelSize,
    ),
  );
  const [currentModelId, setCurrentModelId] = useState(
    "builtin:anthropic:claude-sonnet-4-20250514",
  );
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>("off");
  const [currentContextWindow, setCurrentContextWindow] = useState<number | null>(null);
  const [gitOverview, setGitOverview] = useState<GitDiffOverview | null>(null);
  const [gitOverviewLoading, setGitOverviewLoading] = useState(false);

  const activeSessionId = activeSession?.id ?? null;
  const summariesRef = useRef<ChatSessionSummary[]>([]);
  const activeSessionIdRef = useRef<string | null>(null);
  const appliedCustomThemeKeysRef = useRef<string[]>([]);

  useEffect(() => {
    summariesRef.current = summaries;
  }, [summaries]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    localStorage.setItem(
      SIDEBAR_WIDTH_STORAGE_KEY,
      String(clampSidebarSize(sidebarSize)),
    );
  }, [sidebarSize]);

  useEffect(() => {
    localStorage.setItem(
      DIFF_PANEL_SIZE_STORAGE_KEY,
      String(clampDiffPanelSize(diffPanelSize)),
    );
  }, [diffPanelSize]);

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

  useEffect(() => {
    let cancelled = false;

    if (!desktopApi?.models || !currentModelId) {
      setCurrentContextWindow(null);
      return;
    }

    void desktopApi.models.getEntry(currentModelId).then((entry) => {
      if (!cancelled) {
        setCurrentContextWindow(resolveContextWindow(entry));
      }
    }).catch(() => {
      if (!cancelled) {
        setCurrentContextWindow(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentModelId, desktopApi]);

  const refreshGitOverview = useCallback(async () => {
    if (!desktopApi?.git) {
      setGitOverview(null);
      return;
    }

    setGitOverviewLoading(true);

    try {
      const nextOverview = await desktopApi.git.getSnapshot();
      setGitOverview(nextOverview);
    } finally {
      setGitOverviewLoading(false);
    }
  }, [desktopApi]);

  useEffect(() => {
    if (mainView !== "thread") {
      return;
    }

    void refreshGitOverview();
  }, [mainView, refreshGitOverview, settings?.workspace]);

  useEffect(() => {
    if (mainView !== "thread" || !diffPanelOpen) {
      return;
    }

    void refreshGitOverview();
  }, [diffPanelOpen, mainView, refreshGitOverview]);

  const contextSummary = useMemo(
    () => getContextUsageSummary(activeSession, currentContextWindow),
    [activeSession, currentContextWindow],
  );

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

      setDiffPanelOpen(uiState.diffPanelOpen);
      setFrameState(frame);
      setSummaries(sessionSummaries);
      setArchivedSummaries(archivedList);
      setGroups(groupList);
      if (settings) {
        setSettings(settings);
        setCurrentModelId(settings.defaultModelId);
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
    async (files: SelectedFile[]) => {
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
    },
    [activeSession, desktopApi, enrichSelectedFiles, persistSession],
  );

  const attachFiles = useCallback(async () => {
    if (!activeSession || !desktopApi) {
      return;
    }

    setIsPickingFiles(true);

    try {
      const pickedFiles = await desktopApi.files.pick();
      await appendAttachmentsToSession(pickedFiles);
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

        await appendAttachmentsToSession(pastedFiles);
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

  const toggleDiffPanel = useCallback(() => {
    const nextOpen = !diffPanelOpen;
    setDiffPanelOpen(nextOpen);
    void desktopApi?.ui.setDiffPanelOpen(nextOpen);
  }, [desktopApi, diffPanelOpen]);

  const handleShellLayoutChanged = useCallback((layout: Record<string, number>) => {
    const nextSidebarSize = layout["shell-sidebar"];
    if (typeof nextSidebarSize === "number" && Number.isFinite(nextSidebarSize)) {
      setSidebarSize(clampSidebarSize(nextSidebarSize));
    }
  }, []);

  const handleDiffOnlyLayoutChanged = useCallback((layout: Record<string, number>) => {
    const nextDiffPanelSize = layout["thread-diff"];
    if (typeof nextDiffPanelSize === "number" && Number.isFinite(nextDiffPanelSize)) {
      setDiffPanelSize(clampDiffPanelSize(nextDiffPanelSize));
    }
  }, []);

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
    (modelEntryId: string) => {
      setCurrentModelId(modelEntryId);
      setSettings((current) =>
        current ? { ...current, defaultModelId: modelEntryId } : current,
      );
      void desktopApi?.settings.update({ defaultModelId: modelEntryId });
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

  const normalizedDiffPanelSize = clampDiffPanelSize(diffPanelSize);

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

  const threadContent =
    mainView === "settings" ? (
      <SettingsView
        activeSection={settingsSection}
        settings={settings}
        currentModelId={currentModelId}
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
        currentModelId={currentModelId}
        thinkingLevel={thinkingLevel}
        terminalOpen={terminalOpen}
        isPickingFiles={isPickingFiles}
        onAttachFiles={attachFiles}
        onPasteFiles={pasteFiles}
        onRemoveAttachment={removeAttachment}
        onModelChange={handleModelChange}
        onThinkingLevelChange={handleThinkingLevelChange}
        branchSummary={gitOverview?.branch ?? null}
        contextSummary={contextSummary}
      />
    ) : (
      <div className="grid min-h-0 flex-1 place-items-center px-6 text-sm text-gray-400">
        当前没有可用线程。
      </div>
    );

  const threadPanels =
    mainView !== "thread" ? (
      <section className="flex h-full min-h-0 flex-col bg-shell-panel">
        {threadContent}
      </section>
    ) : diffPanelOpen ? (
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 bg-shell-panel"
        onLayoutChanged={handleDiffOnlyLayoutChanged}
        resizeTargetMinimumSize={{ fine: 6, coarse: 24 }}
      >
        <ResizablePanel
          id="thread-main"
          defaultSize={toPercentageSize(100 - normalizedDiffPanelSize)}
          minSize={`${100 - MAX_DIFF_PANEL_SIZE}%`}
        >
          <section className="flex h-full min-h-0 flex-col bg-shell-panel">
            {threadContent}
          </section>
        </ResizablePanel>
        <ResizableHandle className="-mx-px w-px" />
        <ResizablePanel
          id="thread-diff"
          defaultSize={toPercentageSize(normalizedDiffPanelSize)}
          minSize={`${MIN_DIFF_PANEL_SIZE}%`}
          maxSize={`${MAX_DIFF_PANEL_SIZE}%`}
        >
          <DiffPanel
            overview={gitOverview}
            isLoading={gitOverviewLoading}
            onRefresh={refreshGitOverview}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    ) : (
      <section className="flex h-full min-h-0 flex-col bg-shell-panel">
        {threadContent}
      </section>
    );

  return (
    <main className="flex h-screen flex-col overflow-hidden rounded-[var(--radius-shell)] bg-shell-window text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <TitleBar
        isMaximized={frameState.isMaximized}
        onMinimize={() => desktopApi?.window.minimize()}
        onToggleMaximize={handleToggleMaximize}
        onClose={() => desktopApi?.window.close()}
      />
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1 overflow-hidden bg-shell-window"
        onLayoutChanged={handleShellLayoutChanged}
        resizeTargetMinimumSize={{ fine: 6, coarse: 24 }}
      >
        <ResizablePanel
          id="shell-sidebar"
          defaultSize={toSidebarPercentageSize(sidebarSize)}
          minSize={`${MIN_SIDEBAR_SIZE}%`}
          maxSize={`${MAX_SIDEBAR_SIZE}%`}
        >
          <aside className="relative h-full min-h-0 bg-transparent">
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
          </aside>
        </ResizablePanel>
        <ResizableHandle className="-mx-px w-px" />
        <ResizablePanel id="shell-main">
          <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-shell-window">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-l-[var(--radius-shell)] bg-shell-panel">
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
                    onClick={toggleDiffPanel}
                    className={`h-9 w-9 cursor-pointer rounded-[var(--radius-shell)] border-none shadow-none hover:bg-shell-toolbar-hover ${diffPanelOpen ? "bg-shell-toolbar-hover text-foreground" : "bg-transparent text-muted-foreground"}`}
                    aria-label={diffPanelOpen ? "收起 Diff 面板" : "展开 Diff 面板"}
                  >
                    <RectangleGroupIcon className="h-4 w-4" />
                  </Button>
                </>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 bg-shell-panel">
              {threadPanels}
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
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  );
}
