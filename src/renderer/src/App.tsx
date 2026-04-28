import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CommandLineIcon,
} from "@heroicons/react/24/outline";
import { ActivityIcon, PanelRightClose, PanelRightOpen } from "lucide-react";
import type {
  ChatSession,
  ChatSessionSummary,
  ContextSummary,
  InterruptedApprovalGroup,
  ModelRoutingRole,
  RightPanelState,
  Settings,
  SessionGroup,
  ThinkingLevel,
  WindowFrameState,
} from "@shared/contracts";
import { AssistantThreadPanel } from "@renderer/components/assistant-ui/assistant-thread-panel";
import {
  AppBootErrorScreen,
  AppBootingScreen,
  ThreadEmptyState,
  ThreadUnavailableState,
} from "@renderer/components/assistant-ui/app-shell-states";
import { Button } from "@renderer/components/assistant-ui/button";
import {
  DiffWorkbenchContent,
} from "@renderer/components/assistant-ui/diff-panel";
import { TracePanel } from "@renderer/components/assistant-ui/trace-panel";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";
import {
  EMPTY_CONTEXT_USAGE_SUMMARY,
} from "@renderer/lib/context-usage";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  DEFAULT_SIDEBAR_SIZE,
  LEGACY_ACTIVE_SESSION_STORAGE_KEY,
  LEGACY_SIDEBAR_WIDTH_STORAGE_KEY,
  MAX_RIGHT_PANEL_WIDTH,
  MAX_SIDEBAR_SIZE,
  MIN_RIGHT_PANEL_WIDTH,
  MIN_SIDEBAR_WIDTH,
  RIGHT_PANEL_GAP_PX,
  ROOT_UI_THEME_DATASET,
  SETTINGS_ROUTE_PREFIX,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
  applyCustomThemeVariables,
  clampRightPanelWidth,
  clampSidebarSize,
  clearStoredStrings,
  getDefaultRightPanelWidth,
  getProjectNameFromPath,
  mergeSettingsState,
  migrateLegacySidebarWidth,
  readStoredNumber,
  readStoredString,
  resolveSettingsSectionFromPath,
  toSidebarPercentageSize,
  type DeepPartialSettings,
} from "@renderer/lib/app-shell";
import { loadProviderDirectory } from "@renderer/lib/provider-directory";
import { upsertSummary } from "@renderer/lib/session";
import {
  applySessionToArchivedSummaries,
  applySessionToLiveSummaries,
  findGroupByPath,
  removeRecordKey,
  resolveGroupName,
  resolveGroupPath,
  resolveSessionProjectPath,
  updateRunningSessionIds,
} from "@renderer/lib/app-session-state";
import { useAppGitState } from "@renderer/hooks/use-app-git-state";
import { useSessionAttachments } from "@renderer/hooks/use-session-attachments";
import type { PanelImperativeHandle, PanelSize } from "react-resizable-panels";
import { useLocation, useNavigate } from "react-router-dom";

export default function App() {
  const desktopApi = window.desktopApi;
  const navigate = useNavigate();
  const location = useLocation();
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<ChatSessionSummary[]>([]);
  const [archivedSummaries, setArchivedSummaries] = useState<
    ChatSessionSummary[]
  >([]);
  const [groups, setGroups] = useState<SessionGroup[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [sessionCache, setSessionCache] = useState<Record<string, ChatSession>>(
    {},
  );
  const [runningSessionIds, setRunningSessionIds] = useState<string[]>([]);
  const [contextSummaryBySessionId, setContextSummaryBySessionId] = useState<
    Record<string, ContextSummary>
  >({});
  const [interruptedApprovalGroupsBySessionId, setInterruptedApprovalGroupsBySessionId] =
    useState<Record<string, InterruptedApprovalGroup[]>>({});
  const [rightPanelState, setRightPanelState] = useState<RightPanelState>({
    open: false,
    activeView: "diff",
    width: null,
  });
  const [frameState, setFrameState] = useState<WindowFrameState>({
    isMaximized: false,
  });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [threadWorkspaceWidth, setThreadWorkspaceWidth] = useState(0);
  const [sidebarSize, setSidebarSize] = useState(() => {
    const storedWidth = readStoredNumber([
      SIDEBAR_WIDTH_STORAGE_KEY,
      LEGACY_SIDEBAR_WIDTH_STORAGE_KEY,
    ]);
    if (storedWidth === null) {
      return DEFAULT_SIDEBAR_SIZE;
    }

    return migrateLegacySidebarWidth(storedWidth);
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
  });
  const [currentModelId, setCurrentModelId] = useState(
    "builtin:anthropic:claude-sonnet-4-20250514",
  );
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>("off");
  const [sidebarAnimating, setSidebarAnimating] = useState(false);
  const [rightPanelAnimating, setRightPanelAnimating] = useState(false);

  const settingsSection = useMemo(
    () => resolveSettingsSectionFromPath(location.pathname) ?? "general",
    [location.pathname],
  );
  const mainView: "thread" | "settings" =
    resolveSettingsSectionFromPath(location.pathname) === null
      ? "thread"
      : "settings";

  const activeSessionId = activeSession?.id ?? null;
  const diffPanelOpen =
    rightPanelState.open && rightPanelState.activeView === "diff";
  const tracePanelOpen =
    rightPanelState.open && rightPanelState.activeView === "trace";
  const rightPanelVisibleOrAnimating =
    mainView === "thread" && (diffPanelOpen || tracePanelOpen || rightPanelAnimating);
  const threadTerminalOpen = terminalOpen && !rightPanelVisibleOrAnimating;
  const resolvedRightPanelWidth = useMemo(() => {
    const containerWidth =
      threadWorkspaceWidth > 0
        ? threadWorkspaceWidth
        : typeof window !== "undefined"
          ? window.innerWidth
          : MAX_RIGHT_PANEL_WIDTH;
    const preferredWidth =
      typeof rightPanelState.width === "number"
        ? rightPanelState.width
        : getDefaultRightPanelWidth(containerWidth);

    return clampRightPanelWidth(preferredWidth, containerWidth);
  }, [rightPanelState.width, threadWorkspaceWidth]);

  const sidebarPanelRef = useRef<PanelImperativeHandle | null>(null);
  const threadWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const rightPanelStateRef = useRef(rightPanelState);
  const rightPanelToggleInFlightRef = useRef(false);
  const sessionSelectionSerialRef = useRef(0);
  const summariesRef = useRef<ChatSessionSummary[]>([]);
  const archivedSummariesRef = useRef<ChatSessionSummary[]>([]);
  const groupsRef = useRef<SessionGroup[]>([]);
  const settingsRef = useRef<Settings | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const sessionCacheRef = useRef<Record<string, ChatSession>>({});
  const appliedCustomThemeKeysRef = useRef<string[]>([]);
  const rightPanelDragStateRef = useRef<{
    startX: number;
    startWidth: number;
    containerWidth: number;
  } | null>(null);
  const rightPanelAnimatingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const lastExpandedSidebarSizeRef = useRef(sidebarSize);
  const sidebarCollapsedRef = useRef(sidebarCollapsed);
  const sidebarProgrammaticTargetRef = useRef<boolean | null>(null);

  useEffect(() => {
    summariesRef.current = summaries;
  }, [summaries]);

  useEffect(() => {
    sidebarCollapsedRef.current = sidebarCollapsed;
  }, [sidebarCollapsed]);

  useEffect(() => {
    archivedSummariesRef.current = archivedSummaries;
  }, [archivedSummaries]);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    sessionCacheRef.current = sessionCache;
  }, [sessionCache]);

  useEffect(() => {
    rightPanelStateRef.current = rightPanelState;
  }, [rightPanelState]);

  useEffect(() => {
    const element = threadWorkspaceRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      const nextWidth = Math.round(element.getBoundingClientRect().width);
      setThreadWorkspaceWidth((current) =>
        current === nextWidth ? current : nextWidth,
      );
    };

    updateWidth();

    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [mainView, rightPanelVisibleOrAnimating]);

  useEffect(() => {
    if (!sidebarCollapsed) {
      lastExpandedSidebarSizeRef.current = clampSidebarSize(sidebarSize);
    }
  }, [sidebarCollapsed, sidebarSize]);

  useEffect(() => () => clearTimeout(rightPanelAnimatingTimerRef.current), []);

  const armRightPanelAnimation = useCallback(() => {
    setRightPanelAnimating(true);
    clearTimeout(rightPanelAnimatingTimerRef.current);
    rightPanelAnimatingTimerRef.current = setTimeout(() => {
      setRightPanelAnimating(false);
    }, 520);
  }, []);

  useEffect(() => {
    localStorage.setItem(
      SIDEBAR_WIDTH_STORAGE_KEY,
      String(clampSidebarSize(sidebarSize)),
    );
  }, [sidebarSize]);

  useEffect(() => {
    localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      sidebarCollapsed ? "1" : "0",
    );
  }, [sidebarCollapsed]);

  const applySidebarPanelState = useCallback((collapsed: boolean) => {
    const panel = sidebarPanelRef.current;
    if (!panel) {
      return;
    }

    if (collapsed) {
      panel.collapse();
      panel.resize("0%");
      return;
    }

    panel.expand();
    panel.resize(toSidebarPercentageSize(lastExpandedSidebarSizeRef.current));
  }, []);

  useEffect(() => {
    applySidebarPanelState(sidebarCollapsed);
  }, [applySidebarPanelState, sidebarCollapsed]);

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

  const {
    gitBranchSummary,
    gitOverview,
    gitOverviewLoading,
    refreshGitBranchSummary,
    refreshGitOverview,
  } = useAppGitState({
    desktopApi,
    settingsRef,
    mainView,
    diffPanelOpen,
  });

  const cacheSession = useCallback((session: ChatSession) => {
    setSessionCache((current) => {
      const existing = current[session.id];
      if (existing === session) {
        return current;
      }

      return {
        ...current,
        [session.id]: session,
      };
    });
  }, []);

  const refreshContextSummary = useCallback(
    async (sessionId: string) => {
      if (!desktopApi?.context) {
        return EMPTY_CONTEXT_USAGE_SUMMARY;
      }

      try {
        const nextSummary = await desktopApi.context.getSummary(sessionId);
        setContextSummaryBySessionId((current) => ({
          ...current,
          [sessionId]: nextSummary,
        }));
        return nextSummary;
      } catch {
        setContextSummaryBySessionId((current) => ({
          ...current,
          [sessionId]: EMPTY_CONTEXT_USAGE_SUMMARY,
        }));
        return EMPTY_CONTEXT_USAGE_SUMMARY;
      }
    },
    [desktopApi],
  );

  const refreshInterruptedApprovalGroups = useCallback(
    async (sessionId: string) => {
      if (!desktopApi?.agent?.listInterruptedApprovalGroups) {
        setInterruptedApprovalGroupsBySessionId((current) => ({
          ...current,
          [sessionId]: [],
        }));
        return [] as InterruptedApprovalGroup[];
      }

      try {
        const groups = await desktopApi.agent.listInterruptedApprovalGroups(sessionId);
        setInterruptedApprovalGroupsBySessionId((current) => ({
          ...current,
          [sessionId]: groups,
        }));
        return groups;
      } catch {
        setInterruptedApprovalGroupsBySessionId((current) => ({
          ...current,
          [sessionId]: [],
        }));
        return [] as InterruptedApprovalGroup[];
      }
    },
    [desktopApi],
  );

  const removeCachedSession = useCallback((sessionId: string) => {
    setSessionCache((current) => removeRecordKey(current, sessionId));
    setContextSummaryBySessionId((current) => removeRecordKey(current, sessionId));
  }, []);

  const hydrateSession = useCallback((session: ChatSession) => {
    cacheSession(session);
    // R2: 同步更新 ref，避免下面这种 race —
    // hydrateSession(sessB) → 等 useEffect 同步 ref → 期间 persistSession(sessA) 看到 ref 仍是 sessA → 把 active 回退到 sessA。
    activeSessionIdRef.current = session.id;
    setActiveSession(session);
    localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, session.id);
  }, [cacheSession]);

  const clearActiveSession = useCallback(() => {
    activeSessionIdRef.current = null;
    setActiveSession(null);
    clearStoredStrings([
      ACTIVE_SESSION_STORAGE_KEY,
      LEGACY_ACTIVE_SESSION_STORAGE_KEY,
    ]);
  }, []);

  const reloadSession = useCallback(
    async (sessionId: string) => {
      if (!desktopApi) {
        return;
      }

      const session = await desktopApi.sessions.load(sessionId);
      if (!session) {
        return;
      }

      cacheSession(session);
      if (activeSessionIdRef.current === sessionId) {
        setActiveSession(session);
      }
      setSummaries((current) => applySessionToLiveSummaries(current, session));
      setArchivedSummaries((current) =>
        applySessionToArchivedSummaries(current, session),
      );
      await refreshContextSummary(sessionId);
      await refreshInterruptedApprovalGroups(sessionId);
    },
    [cacheSession, desktopApi, refreshContextSummary, refreshInterruptedApprovalGroups],
  );

  const persistSession = useCallback(
    (session: ChatSession) => {
      cacheSession(session);
      if (activeSessionIdRef.current === session.id) {
        setActiveSession(session);
      }
      setSummaries((current) => applySessionToLiveSummaries(current, session));
      setArchivedSummaries((current) =>
        applySessionToArchivedSummaries(current, session),
      );
      void desktopApi?.sessions.save(session);
    },
    [cacheSession, desktopApi],
  );

  const {
    isPickingFiles,
    attachFiles,
    pasteFiles,
    removeAttachment,
  } = useSessionAttachments({
    activeSession,
    desktopApi,
    persistSession,
  });

  const handleSessionRunStateChange = useCallback(
    (sessionId: string, isRunning: boolean) => {
      setRunningSessionIds((current) =>
        updateRunningSessionIds(current, sessionId, isRunning),
      );
    },
    [],
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

  const refreshGroups = useCallback(async () => {
    if (!desktopApi) {
      return [] as SessionGroup[];
    }

    const nextGroups = await desktopApi.groups.list();
    setGroups(nextGroups);
    return nextGroups;
  }, [desktopApi]);

  const switchWorkspacePath = useCallback(
    async (nextWorkspace: string) => {
      const normalizedWorkspace = nextWorkspace.trim();
      if (!desktopApi || !normalizedWorkspace) {
        return;
      }

      if (settingsRef.current?.workspace === normalizedWorkspace) {
        return;
      }

      const nextSettings = settingsRef.current
        ? mergeSettingsState(settingsRef.current, { workspace: normalizedWorkspace })
        : null;

      if (nextSettings) {
        settingsRef.current = nextSettings;
        setSettings(nextSettings);
      }

      await desktopApi.settings.update({ workspace: normalizedWorkspace });
      await refreshGitOverview();
      await refreshGitBranchSummary();
    },
    [desktopApi, refreshGitBranchSummary, refreshGitOverview],
  );

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
        // Warm the provider directory cache so SettingsView renders instantly
        loadProviderDirectory(desktopApi).catch(() => null),
      ]);

      setRightPanelState(uiState.rightPanel);
      setFrameState(frame);
      setSummaries(sessionSummaries);
      setArchivedSummaries(archivedList);
      setGroups(groupList);
      if (settings) {
        settingsRef.current = settings;
        setSettings(settings);
        setCurrentModelId(settings.modelRouting.chat.modelId);
        setThinkingLevel(settings.thinkingLevel);
        void refreshGitBranchSummary();
        void refreshGitOverview();
      }

      const storedSessionId = readStoredString([
        ACTIVE_SESSION_STORAGE_KEY,
        LEGACY_ACTIVE_SESSION_STORAGE_KEY,
      ]);
      let nextSession = storedSessionId
        ? await desktopApi.sessions.load(storedSessionId)
        : null;

      if (!nextSession && sessionSummaries[0]) {
        nextSession = await desktopApi.sessions.load(sessionSummaries[0].id);
      }

      if (!nextSession) {
        clearActiveSession();
        return;
      }

      hydrateSession(nextSession);
      void refreshContextSummary(nextSession.id);
      void refreshInterruptedApprovalGroups(nextSession.id);
    } catch (error) {
      setBootError(
        error instanceof Error ? error.message : "桌面壳初始化失败。",
      );
    } finally {
      setBooting(false);
    }
  }, [
    clearActiveSession,
    desktopApi,
    hydrateSession,
    refreshContextSummary,
    refreshGitBranchSummary,
    refreshGitOverview,
    refreshInterruptedApprovalGroups,
  ]);

  // 用 ref 持有键盘快捷键需要的动态值，避免 effect 因这些值变化而重新执行 bootApp
  const kbStateRef = useRef({
    mainView, terminalOpen,
    createNewSession: (() => { }) as () => unknown,
    closeSettingsView: (() => { }) as () => void,
    openSettingsView: (() => { }) as (section?: SettingsSection) => void,
    toggleSidebarCollapsed: (() => { }) as () => void,
  });

  // Boot 只执行一次
  useEffect(() => {
    void bootApp();
  }, [bootApp]);

  // 窗口状态 + 键盘快捷键（不依赖 mainView / terminalOpen）
  useEffect(() => {
    if (!desktopApi) {
      return;
    }

    const cleanup = desktopApi.window.onStateChange((state) => {
      setFrameState(state);
    });

    // Global keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const kb = kbStateRef.current;
      if (mod && e.key === "j") {
        if (!kb.terminalOpen) {
          e.preventDefault();
          setTerminalOpen(true);
        }
      } else if (mod && e.key === "b") {
        e.preventDefault();
        kb.toggleSidebarCollapsed();
      } else if (mod && e.key === "n") {
        e.preventDefault();
        void kb.createNewSession();
      } else if (mod && e.key === ",") {
        e.preventDefault();
        if (kb.mainView === "settings") {
          kb.closeSettingsView();
        } else {
          kb.openSettingsView();
        }
      } else if (e.key === "Escape") {
        if (kb.mainView === "settings") {
          kb.closeSettingsView();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      cleanup();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [desktopApi]);

  const createNewSession = useCallback(async () => {
    if (!desktopApi) {
      return;
    }

    const nextSession = await desktopApi.sessions.create();
    setSummaries((current) => upsertSummary(current, nextSession));
    hydrateSession(nextSession);
    void refreshContextSummary(nextSession.id);
    void refreshInterruptedApprovalGroups(nextSession.id);
  }, [desktopApi, hydrateSession, refreshContextSummary, refreshInterruptedApprovalGroups]);

  const createSessionInGroup = useCallback(
    async (groupId: string) => {
      if (!desktopApi) {
        return;
      }

      const targetGroupPath = resolveGroupPath(groupsRef.current, groupId);
      if (targetGroupPath) {
        await switchWorkspacePath(targetGroupPath);
      }

      const nextSession = await desktopApi.sessions.create();
      await desktopApi.sessions.setGroup(nextSession.id, groupId);
      const groupedSession =
        (await desktopApi.sessions.load(nextSession.id)) ?? {
          ...nextSession,
          groupId,
        };

      await refreshSessionLists();
      hydrateSession(groupedSession);
      void refreshContextSummary(groupedSession.id);
      void refreshInterruptedApprovalGroups(groupedSession.id);
    },
    [
      desktopApi,
      hydrateSession,
      refreshContextSummary,
      refreshInterruptedApprovalGroups,
      refreshSessionLists,
      switchWorkspacePath,
    ],
  );

  const selectSession = useCallback(
    async (sessionId: string) => {
      if (!desktopApi) {
        return;
      }

      const selectionSerial = ++sessionSelectionSerialRef.current;

      const projectPath = resolveSessionProjectPath(
        sessionId,
        summariesRef.current,
        archivedSummariesRef.current,
        groupsRef.current,
      );
      if (projectPath) {
        await switchWorkspacePath(projectPath);
        if (sessionSelectionSerialRef.current !== selectionSerial) {
          return;
        }
      }

      const cachedSession = sessionCacheRef.current[sessionId];
      if (cachedSession) {
        if (sessionSelectionSerialRef.current !== selectionSerial) {
          return;
        }
        hydrateSession(cachedSession);
        void refreshContextSummary(sessionId);
        return;
      }

      const session = await desktopApi.sessions.load(sessionId);
      if (session && sessionSelectionSerialRef.current === selectionSerial) {
        hydrateSession(session);
        void refreshContextSummary(sessionId);
      }
    },
    [desktopApi, hydrateSession, refreshContextSummary, switchWorkspacePath],
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
      removeCachedSession(sessionId);
      await refreshSessionLists();

      if (activeSessionIdRef.current !== sessionId) {
        return;
      }

      if (remaining.length > 0) {
        void selectSession(remaining[0].id);
        return;
      }

      clearActiveSession();
    },
    [
      clearActiveSession,
      desktopApi,
      refreshSessionLists,
      removeCachedSession,
      selectSession,
    ],
  );

  const unarchiveSession = useCallback(
    async (sessionId: string) => {
      if (!desktopApi) {
        return;
      }

      await desktopApi.sessions.unarchive(sessionId);
      removeCachedSession(sessionId);
      await refreshSessionLists();

      if (activeSessionIdRef.current !== sessionId) {
        return;
      }

      const session = await desktopApi.sessions.load(sessionId);
      if (session) {
        hydrateSession(session);
        void refreshContextSummary(sessionId);
      }
    },
    [
      desktopApi,
      hydrateSession,
      refreshContextSummary,
      refreshSessionLists,
      removeCachedSession,
    ],
  );

  const deleteSessionPermanently = useCallback(
    async (sessionId: string) => {
      if (!desktopApi) {
        return;
      }

      const wasActive = activeSessionIdRef.current === sessionId;
      await desktopApi.sessions.delete(sessionId);
      removeCachedSession(sessionId);
      setRunningSessionIds((current) =>
        updateRunningSessionIds(current, sessionId, false),
      );
      const { sessionSummaries } = await refreshSessionLists();

      if (!wasActive) {
        return;
      }

      clearActiveSession();

      if (sessionSummaries[0]) {
        void selectSession(sessionSummaries[0].id);
        return;
      }
    },
    [clearActiveSession, desktopApi, refreshSessionLists, removeCachedSession, selectSession],
  );

  const setSessionPinned = useCallback(
    async (sessionId: string, pinned: boolean) => {
      if (!desktopApi) {
        return;
      }

      await desktopApi.sessions.setPinned(sessionId, pinned);
      await refreshSessionLists();
    },
    [desktopApi, refreshSessionLists],
  );

  const renameSession = useCallback(
    async (sessionId: string) => {
      if (!desktopApi) {
        return;
      }

      const currentTitle =
        summariesRef.current.find((summary) => summary.id === sessionId)?.title ??
        archivedSummariesRef.current.find((summary) => summary.id === sessionId)?.title ??
        sessionCacheRef.current[sessionId]?.title ??
        "";
      const nextTitle = window.prompt("重命名聊天", currentTitle);
      if (nextTitle === null) {
        return;
      }

      const trimmedTitle = nextTitle.trim();
      if (!trimmedTitle || trimmedTitle === currentTitle.trim()) {
        return;
      }

      await desktopApi.sessions.rename(sessionId, trimmedTitle);
      await refreshSessionLists();

      if (activeSessionIdRef.current === sessionId) {
        await reloadSession(sessionId);
      }
    },
    [desktopApi, refreshSessionLists, reloadSession],
  );

  const renameProject = useCallback(
    async (groupId: string) => {
      if (!desktopApi) {
        return;
      }

      const currentName = resolveGroupName(groupsRef.current, groupId);
      const nextName = window.prompt("重命名项目", currentName);
      if (nextName === null) {
        return;
      }

      const trimmedName = nextName.trim();
      if (!trimmedName || trimmedName === currentName.trim()) {
        return;
      }

      await desktopApi.groups.rename(groupId, trimmedName);
      await refreshGroups();
    },
    [desktopApi, refreshGroups],
  );

  const deleteProject = useCallback(
    async (groupId: string) => {
      if (!desktopApi) {
        return;
      }

      const projectName = resolveGroupName(groupsRef.current, groupId) || "当前项目";
      const confirmed = window.confirm(
        `删除项目“${projectName}”？项目下聊天会保留，并移动到“聊天”区。`,
      );
      if (!confirmed) {
        return;
      }

      await desktopApi.groups.delete(groupId);
      await refreshGroups();
      await refreshSessionLists();

      const activeId = activeSessionIdRef.current;
      if (activeId) {
        await reloadSession(activeId);
      }
    },
    [desktopApi, refreshGroups, refreshSessionLists, reloadSession],
  );

  const dismissInterruptedApproval = useCallback(
    async (sessionId: string, runId: string) => {
      if (!desktopApi?.agent?.dismissInterruptedApproval) {
        return;
      }

      await desktopApi.agent.dismissInterruptedApproval(runId);
      await refreshInterruptedApprovalGroups(sessionId);
    },
    [desktopApi, refreshInterruptedApprovalGroups],
  );

  const resumeInterruptedApproval = useCallback(
    async (runId: string) => {
      if (!desktopApi?.agent?.resumeInterruptedApproval) {
        throw new Error("恢复执行当前不可用。");
      }

      return desktopApi.agent.resumeInterruptedApproval(runId);
    },
    [desktopApi],
  );

  const updateRightPanelState = useCallback(
    (partial: Partial<RightPanelState>) => {
      setRightPanelState((current) => ({
        ...current,
        ...partial,
        activeView: partial.activeView ?? current.activeView ?? "diff",
      }));
      void desktopApi?.ui.setRightPanelState(partial);
    },
    [desktopApi],
  );

  const closeRightPanel = useCallback(() => {
    armRightPanelAnimation();
    updateRightPanelState({ open: false });
  }, [armRightPanelAnimation, updateRightPanelState]);

  const toggleDiffPanel = useCallback(() => {
    if (rightPanelToggleInFlightRef.current) return;
    rightPanelToggleInFlightRef.current = true;

    try {
      const containerWidth = Math.round(
        threadWorkspaceRef.current?.getBoundingClientRect().width ?? threadWorkspaceWidth
      );

      const nextPanelWidth = containerWidth > 0
        ? clampRightPanelWidth(
          typeof rightPanelStateRef.current.width === "number"
            ? rightPanelStateRef.current.width
            : getDefaultRightPanelWidth(containerWidth),
          containerWidth
        )
        : resolvedRightPanelWidth;

      armRightPanelAnimation();

      if (diffPanelOpen) {
        updateRightPanelState({ open: false });
      } else {
        updateRightPanelState({
          open: true,
          activeView: "diff",
          width: nextPanelWidth,
        });
      }
    } finally {
      rightPanelToggleInFlightRef.current = false;
    }
  }, [
    armRightPanelAnimation,
    diffPanelOpen,
    resolvedRightPanelWidth,
    threadWorkspaceWidth,
    updateRightPanelState,
  ]);

  const toggleTracePanel = useCallback(() => {
    if (rightPanelToggleInFlightRef.current) return;
    rightPanelToggleInFlightRef.current = true;

    try {
      const containerWidth = Math.round(
        threadWorkspaceRef.current?.getBoundingClientRect().width ?? threadWorkspaceWidth
      );

      const nextPanelWidth = containerWidth > 0
        ? clampRightPanelWidth(
          typeof rightPanelStateRef.current.width === "number"
            ? rightPanelStateRef.current.width
            : getDefaultRightPanelWidth(containerWidth),
          containerWidth
        )
        : resolvedRightPanelWidth;

      armRightPanelAnimation();

      if (tracePanelOpen) {
        updateRightPanelState({ open: false });
      } else {
        updateRightPanelState({
          open: true,
          activeView: "trace",
          width: nextPanelWidth,
        });
      }
    } finally {
      rightPanelToggleInFlightRef.current = false;
    }
  }, [
    armRightPanelAnimation,
    tracePanelOpen,
    resolvedRightPanelWidth,
    threadWorkspaceWidth,
    updateRightPanelState,
  ]);

  const handleRightPanelResizeMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!diffPanelOpen && !tracePanelOpen) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const element = threadWorkspaceRef.current;
      const containerWidth = Math.round(
        element?.getBoundingClientRect().width ?? threadWorkspaceWidth,
      );
      const startWidth = resolvedRightPanelWidth;

      rightPanelDragStateRef.current = {
        startX: event.clientX,
        startWidth,
        containerWidth,
      };
      document.body.style.cursor = "col-resize";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dragState = rightPanelDragStateRef.current;
        if (!dragState) {
          return;
        }

        const delta = dragState.startX - moveEvent.clientX;
        const nextWidth = clampRightPanelWidth(
          dragState.startWidth + delta,
          dragState.containerWidth,
        );

        setRightPanelState((current) =>
          current.width === nextWidth ? current : { ...current, width: nextWidth },
        );
      };

      const handleMouseUp = () => {
        const dragState = rightPanelDragStateRef.current;
        rightPanelDragStateRef.current = null;
        document.body.style.cursor = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);

        if (!dragState) {
          return;
        }

        const finalWidth = clampRightPanelWidth(
          rightPanelStateRef.current.width ?? dragState.startWidth,
          dragState.containerWidth,
        );
        updateRightPanelState({ width: finalWidth });
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [
      diffPanelOpen,
      resolvedRightPanelWidth,
      threadWorkspaceWidth,
      updateRightPanelState,
    ],
  );

  const handleSidebarResize = useCallback((panelSize: PanelSize) => {
    const isCollapsedByPanel =
      panelSize.inPixels <= 1 || panelSize.asPercentage <= 0.1;

    if (sidebarProgrammaticTargetRef.current !== null) {
      if (
        sidebarProgrammaticTargetRef.current === false &&
        panelSize.inPixels > MIN_SIDEBAR_WIDTH + 1
      ) {
        const resolvedSize = clampSidebarSize(panelSize.asPercentage);
        lastExpandedSidebarSizeRef.current = resolvedSize;
        setSidebarSize(resolvedSize);
      }
      return;
    }

    sidebarCollapsedRef.current = isCollapsedByPanel;
    setSidebarCollapsed((current) =>
      current === isCollapsedByPanel ? current : isCollapsedByPanel,
    );

    if (isCollapsedByPanel || panelSize.inPixels <= MIN_SIDEBAR_WIDTH + 1) {
      return;
    }

    const resolvedSize = clampSidebarSize(panelSize.asPercentage);
    lastExpandedSidebarSizeRef.current = resolvedSize;
    setSidebarSize(resolvedSize);
  }, []);

  const sidebarAnimatingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => () => clearTimeout(sidebarAnimatingTimerRef.current), []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarAnimating(true);
    clearTimeout(sidebarAnimatingTimerRef.current);
    const nextCollapsed = !sidebarCollapsedRef.current;
    sidebarProgrammaticTargetRef.current = nextCollapsed;
    sidebarAnimatingTimerRef.current = setTimeout(() => {
      sidebarProgrammaticTargetRef.current = null;
      setSidebarAnimating(false);
    }, 520);
    if (nextCollapsed) {
      lastExpandedSidebarSizeRef.current = clampSidebarSize(sidebarSize);
    }
    sidebarCollapsedRef.current = nextCollapsed;
    applySidebarPanelState(nextCollapsed);
    setSidebarCollapsed(nextCollapsed);
  }, [applySidebarPanelState, sidebarSize]);

  const handleToggleMaximize = useCallback(() => {
    if (!desktopApi) {
      return;
    }

    void desktopApi.window.toggleMaximize().then((nextState) => {
      setFrameState(nextState);
    });
  }, [desktopApi]);

  const openSettingsView = useCallback((section: SettingsSection = "general") => {
    navigate(`${SETTINGS_ROUTE_PREFIX}/${section}`);
  }, [navigate]);

  const closeSettingsView = useCallback(() => {
    navigate("/");
  }, [navigate]);

  // 每次渲染同步更新键盘快捷键需要的动态值
  kbStateRef.current = {
    mainView, terminalOpen, createNewSession,
    closeSettingsView, openSettingsView, toggleSidebarCollapsed,
  };

  const openArchivedSessionFromSettings = useCallback(
    async (sessionId: string) => {
      await selectSession(sessionId);
      closeSettingsView();
    },
    [closeSettingsView, selectSession],
  );

  const handleSettingsChange = useCallback(
    (partial: Partial<Settings>) => {
      if (partial.workspace && Object.keys(partial).length === 1) {
        void switchWorkspacePath(partial.workspace);
        return;
      }

      setSettings((current) =>
        current ? mergeSettingsState(current, partial) : current,
      );

      void (async () => {
        await desktopApi?.settings.update(partial);

        if (partial.workspace) {
          await switchWorkspacePath(partial.workspace);
        }
      })();
    },
    [desktopApi, switchWorkspacePath],
  );

  const handleModelChange = useCallback(
    (modelEntryId: string) => {
      setCurrentModelId(modelEntryId);
      setSettings((current) =>
        current
          ? mergeSettingsState(current, {
            modelRouting: {
              chat: {
                modelId: modelEntryId,
              },
            },
          })
          : current,
      );
      void desktopApi?.settings.update({
        modelRouting: {
          chat: {
            modelId: modelEntryId,
          },
        },
      } as Partial<Settings>);
    },
    [desktopApi],
  );

  const handleRoleModelChange = useCallback(
    (role: Exclude<ModelRoutingRole, "chat">, modelEntryId: string | null) => {
      const partial: DeepPartialSettings = {
        modelRouting: {
          [role]: {
            modelId: modelEntryId,
          },
        },
      };

      setSettings((current) =>
        current ? mergeSettingsState(current, partial) : current,
      );
      void desktopApi?.settings.update(partial as Partial<Settings>);
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

  const handleGitStateChanged = useCallback(async () => {
    await refreshGitOverview();
    await refreshGitBranchSummary();
  }, [refreshGitBranchSummary, refreshGitOverview]);

  const handleRefreshGitOverview = useCallback(async () => {
    await refreshGitOverview();
  }, [refreshGitOverview]);

  const handleCreateProject = useCallback(async () => {
    if (!desktopApi) {
      return;
    }

    const nextWorkspace = await desktopApi.workspace.pickFolder();
    if (!nextWorkspace) {
      return;
    }

    const existingGroup = findGroupByPath(groupsRef.current, nextWorkspace);
    if (existingGroup) {
      await createSessionInGroup(existingGroup.id);
      return;
    }

    const group = await desktopApi.groups.create({
      name: getProjectNameFromPath(nextWorkspace),
      path: nextWorkspace,
    });
    setGroups((current) => [...current, group]);
    await switchWorkspacePath(nextWorkspace);
    await createSessionInGroup(group.id);
  }, [createSessionInGroup, desktopApi, switchWorkspacePath]);

  const handleSelectProject = useCallback(
    async (groupId: string) => {
      const targetGroupPath = resolveGroupPath(groupsRef.current, groupId);
      if (!targetGroupPath) {
        return;
      }

      await switchWorkspacePath(targetGroupPath);
    },
    [switchWorkspacePath],
  );

  const hasAnyRunningSessions = runningSessionIds.length > 0;
  const mountedSessionIds = useMemo(() => {
    const ids = new Set<string>();
    if (activeSessionId) {
      ids.add(activeSessionId);
    }
    runningSessionIds.forEach((sessionId) => ids.add(sessionId));
    return [...ids].filter((sessionId) => Boolean(sessionCache[sessionId]));
  }, [activeSessionId, runningSessionIds, sessionCache]);

  const threadRuntimeLayer = useMemo(() => {
    if (!desktopApi) {
      return <ThreadUnavailableState />;
    }

    if (mountedSessionIds.length === 0) {
      const hasArchivedSessions = archivedSummaries.length > 0;
      const hasLiveSessions = summaries.length > 0;

      return (
        <ThreadEmptyState
          hasArchivedSessions={hasArchivedSessions}
          hasLiveSessions={hasLiveSessions}
          onCreateNewSession={() => {
            void createNewSession();
          }}
          onOpenArchived={() => openSettingsView("archived")}
        />
      );
    }

    return (
      <div className="flex h-full min-h-0 flex-col bg-[color:var(--chela-bg-surface)]">
        {mountedSessionIds.map((sessionId) => {
          const session = sessionCache[sessionId];
          if (!session) {
            return null;
          }

          const visible = sessionId === activeSessionId;

          return (
            <div
              key={sessionId}
              className={visible ? "flex h-full min-h-0 flex-1 flex-col" : "hidden"}
              aria-hidden={!visible}
            >
              <AssistantThreadPanel
                session={session}
                desktopApi={desktopApi}
                onPersistSession={persistSession}
                onReloadSession={reloadSession}
                currentModelId={currentModelId}
                thinkingLevel={thinkingLevel}
                terminalOpen={threadTerminalOpen}
                isPickingFiles={isPickingFiles}
                onAttachFiles={attachFiles}
                onPasteFiles={pasteFiles}
                onRemoveAttachment={removeAttachment}
                onModelChange={handleModelChange}
                onThinkingLevelChange={handleThinkingLevelChange}
                onBranchChanged={handleGitStateChanged}
                onRunStateChange={handleSessionRunStateChange}
                branchSummary={gitBranchSummary}
                contextSummary={
                  contextSummaryBySessionId[session.id] ??
                  EMPTY_CONTEXT_USAGE_SUMMARY
                }
                interruptedApprovalGroups={
                  interruptedApprovalGroupsBySessionId[session.id] ?? []
                }
                onDismissInterruptedApproval={(runId) => {
                  void dismissInterruptedApproval(session.id, runId);
                }}
                onResumeInterruptedApproval={resumeInterruptedApproval}
                visible={visible}
                disableGlobalSideEffects={hasAnyRunningSessions}
              />
            </div>
          );
        })}
      </div>
    );
  }, [
    activeSessionId,
    attachFiles,
    contextSummaryBySessionId,
    currentModelId,
    createNewSession,
    desktopApi,
    dismissInterruptedApproval,
    resumeInterruptedApproval,
    handleModelChange,
    handleSessionRunStateChange,
    handleThinkingLevelChange,
    hasAnyRunningSessions,
    isPickingFiles,
    interruptedApprovalGroupsBySessionId,
    mountedSessionIds,
    openSettingsView,
    removeAttachment,
    pasteFiles,
    persistSession,
    gitBranchSummary,
    handleGitStateChanged,
    reloadSession,
    sessionCache,
    summaries,
    archivedSummaries,
    threadTerminalOpen,
    thinkingLevel,
  ]);

  const settingsContent = useMemo(
    () => (
      <SettingsView
        activeSection={settingsSection}
        settings={settings}
        currentModelId={currentModelId}
        thinkingLevel={thinkingLevel}
        onModelChange={handleModelChange}
        onRoleModelChange={handleRoleModelChange}
        onThinkingLevelChange={handleThinkingLevelChange}
        onSettingsChange={handleSettingsChange}
        groups={groups}
        liveSummaries={summaries}
        archivedSummaries={archivedSummaries}
        onCreateProject={() => {
          void handleCreateProject();
        }}
        onOpenArchivedSession={openArchivedSessionFromSettings}
        onUnarchiveSession={(sessionId) => {
          void unarchiveSession(sessionId);
        }}
        onDeleteSession={(sessionId) => {
          void deleteSessionPermanently(sessionId);
        }}
      />
    ),
    [
      archivedSummaries,
      currentModelId,
      deleteSessionPermanently,
      groups,
      handleModelChange,
      handleCreateProject,
      handleRoleModelChange,
      handleSettingsChange,
      handleThinkingLevelChange,
      openArchivedSessionFromSettings,
      summaries,
      settings,
      settingsSection,
      thinkingLevel,
      unarchiveSession,
    ],
  );

  const threadPanels = useMemo(
    () => (
      <section className="flex h-full min-h-0 flex-col bg-[color:var(--chela-bg-surface)]">
        {threadRuntimeLayer}
      </section>
    ),
    [threadRuntimeLayer],
  );

  if (booting) {
    return <AppBootingScreen />;
  }

  if (bootError) {
    return <AppBootErrorScreen message={bootError} />;
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden rounded-[var(--radius-shell)] bg-[color:var(--chela-bg-primary)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <TitleBar
        isMaximized={frameState.isMaximized}
        onMinimize={() => desktopApi?.window.minimize()}
        onToggleMaximize={handleToggleMaximize}
        onClose={() => desktopApi?.window.close()}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={toggleSidebarCollapsed}
      />
      <div
        className="relative min-h-0 flex-1"
        data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
        {...(sidebarAnimating ? { "data-sidebar-animating": "" } : {})}
        data-right-panel-open={diffPanelOpen || tracePanelOpen ? "true" : "false"}
        {...(rightPanelAnimating ? { "data-right-panel-animating": "" } : {})}
      >
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 h-full overflow-hidden bg-transparent"
          resizeTargetMinimumSize={{ fine: 6, coarse: 24 }}
        >
          <ResizablePanel
            id="shell-sidebar"
            panelRef={sidebarPanelRef}
            className="min-w-0 overflow-hidden"
            collapsible
            collapsedSize="0%"
            defaultSize={toSidebarPercentageSize(sidebarSize)}
            minSize={`${MIN_SIDEBAR_WIDTH}px`}
            maxSize={`${MAX_SIDEBAR_SIZE}%`}
            onResize={handleSidebarResize}
          >
            <aside className="chela-sidebar-content relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-transparent" data-collapsed={sidebarCollapsed ? "true" : undefined}>
              <Sidebar
                groups={groups}
                summaries={summaries}
                activeSessionId={activeSessionId}
                runningSessionIds={runningSessionIds}
                onCreateProject={() => {
                  void handleCreateProject();
                }}
                onCreateProjectSession={(groupId) => {
                  void createSessionInGroup(groupId);
                }}
                onSelectProject={(groupId) => {
                  void handleSelectProject(groupId);
                }}
                onSelectSession={selectSession}
                onNewSession={createNewSession}
                onOpenSettings={() => openSettingsView("general")}
                onRenameSession={(sessionId) => {
                  void renameSession(sessionId);
                }}
                onRenameProject={(groupId) => {
                  void renameProject(groupId);
                }}
                onArchiveSession={archiveSession}
                onDeleteSession={deleteSessionPermanently}
                onUnarchiveSession={(sessionId) => {
                  void unarchiveSession(sessionId);
                }}
                archivedSummaries={archivedSummaries}
                onDeleteProject={(groupId) => {
                  void deleteProject(groupId);
                }}
                onToggleSessionPinned={setSessionPinned}
                viewMode={mainView === "settings" ? "settings" : "threads"}
                activeSettingsSection={settingsSection}
                onSelectSettingsSection={openSettingsView}
                onExitSettings={closeSettingsView}
              />
            </aside>
          </ResizablePanel>
          <ResizableHandle className="-mx-px w-px" />
          <ResizablePanel id="shell-main">
            <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
              <div
                ref={threadWorkspaceRef}
                className="flex h-full min-h-0 overflow-hidden bg-transparent"
              >
                <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
                  <div
                    className={`chela-main-content-surface flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--chela-bg-surface)] transition-[border-radius] duration-300 ease-out ${rightPanelVisibleOrAnimating
                      ? "rounded-[var(--radius-shell)]"
                      : "rounded-l-[var(--radius-shell)]"
                      }`}
                  >
                    <div
                      className={`flex items-center justify-end gap-2 px-5 transition-[min-height,padding,opacity] duration-200 ease-out ${mainView === "thread"
                        ? "min-h-[52px] pb-3 pt-4 opacity-100"
                        : "pointer-events-none min-h-0 overflow-hidden py-0 opacity-0"
                        }`}
                      aria-hidden={mainView !== "thread"}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setTerminalOpen((prev) => !prev)}
                        className={`h-9 w-9 cursor-pointer rounded-[var(--radius-shell)] border-none bg-transparent shadow-none ring-0 hover:bg-shell-toolbar-hover ${terminalOpen ? "bg-shell-toolbar-hover text-foreground" : "text-muted-foreground"}`}
                        aria-label={terminalOpen ? "收起终端" : "展开终端"}
                      >
                        <CommandLineIcon className="h-4 w-4" />
                      </Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={toggleDiffPanel}
                            className={`relative h-9 w-9 cursor-pointer rounded-[var(--radius-shell)] border-none bg-transparent shadow-none ring-0 transition-[background-color,color,opacity,transform] duration-200 ease-out hover:bg-shell-toolbar-hover ${diffPanelOpen ? "bg-shell-toolbar-hover text-foreground scale-[0.98]" : "text-muted-foreground hover:scale-[1.02]"}`}
                            aria-label={diffPanelOpen ? "收起右侧边栏" : "展开变更面板"}
                          >
                            {diffPanelOpen ? (
                              <PanelRightClose className="h-4 w-4" strokeWidth={1.9} />
                            ) : (
                              <PanelRightOpen className="h-4 w-4" strokeWidth={1.9} />
                            )}
                            {gitBranchSummary?.hasChanges && !diffPanelOpen && (
                              <span className="absolute right-1 top-1 size-1.5 rounded-full bg-red-500" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          {diffPanelOpen ? "收起变更面板" : "展开变更面板"}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={toggleTracePanel}
                            className={`relative h-9 w-9 cursor-pointer rounded-[var(--radius-shell)] border-none bg-transparent shadow-none ring-0 transition-[background-color,color,opacity,transform] duration-200 ease-out hover:bg-shell-toolbar-hover ${tracePanelOpen ? "bg-shell-toolbar-hover text-foreground scale-[0.98]" : "text-muted-foreground hover:scale-[1.02]"}`}
                            aria-label={tracePanelOpen ? "收起运行追踪" : "展开运行追踪"}
                          >
                            <ActivityIcon className="h-4 w-4" strokeWidth={1.9} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          {tracePanelOpen ? "收起运行追踪" : "展开运行追踪"}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <div className="relative min-h-0 flex-1 bg-[color:var(--chela-bg-surface)]">
                      <div
                        className={mainView === "thread" ? "h-full min-h-0" : "hidden"}
                        aria-hidden={mainView !== "thread"}
                      >
                        {threadPanels}
                      </div>
                      <div
                        className={mainView === "settings" ? "h-full min-h-0" : "hidden"}
                        aria-hidden={mainView !== "settings"}
                      >
                        {settingsContent}
                      </div>
                    </div>

                    <div className={mainView === "thread" && !rightPanelVisibleOrAnimating ? "" : "hidden"}>
                      <TerminalDrawer
                        open={threadTerminalOpen}
                        onToggle={() => setTerminalOpen((prev) => !prev)}
                        settings={settings}
                      />
                    </div>
                  </div>
                </div>

                {mainView === "thread" ? (
                  <div
                    className={`chela-right-panel-shell relative flex min-h-0 shrink-0 flex-col overflow-hidden rounded-[var(--radius-shell)] bg-[color:var(--chela-bg-surface)] ${diffPanelOpen || tracePanelOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"} ${diffPanelOpen || tracePanelOpen || rightPanelAnimating ? "border border-black/5 dark:border-white/6" : "border border-transparent"}`}
                    style={{
                      width: diffPanelOpen || tracePanelOpen ? resolvedRightPanelWidth : 0,
                      marginLeft: diffPanelOpen || tracePanelOpen ? RIGHT_PANEL_GAP_PX : 0,
                    }}
                  >
                    <div
                      className={`absolute left-0 top-0 bottom-0 z-20 flex w-3 -translate-x-1/2 cursor-col-resize justify-center group ${(diffPanelOpen || tracePanelOpen) ? "pointer-events-auto" : "pointer-events-none opacity-0"}`}
                      onMouseDown={handleRightPanelResizeMouseDown}
                    >
                      <div className="h-full w-px bg-border/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-active:opacity-100" />
                    </div>

                    {rightPanelVisibleOrAnimating ? (
                      <>
                        {diffPanelOpen && (
                          <div className={`chela-right-panel-content min-h-0 flex-1 overflow-hidden ${diffPanelOpen ? "translate-x-0 opacity-100" : "translate-x-3 opacity-0"}`}>
                            <DiffWorkbenchContent
                              onClose={closeRightPanel}
                              overview={gitOverview}
                              isLoading={gitOverviewLoading}
                              onRefresh={handleRefreshGitOverview}
                              className="h-full"
                            />
                          </div>
                        )}
                        {tracePanelOpen && activeSession && (
                          <div className="chela-right-panel-content min-h-0 flex-1 overflow-hidden translate-x-0 opacity-100">
                            <TracePanel
                              sessionId={activeSession.id}
                              onClose={closeRightPanel}
                              className="h-full"
                            />
                          </div>
                        )}

                        <TerminalDrawer
                          open={terminalOpen}
                          onToggle={() => setTerminalOpen((prev) => !prev)}
                          settings={settings}
                        />
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </main>
  );
}
