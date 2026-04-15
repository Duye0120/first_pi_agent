import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CommandLineIcon,
} from "@heroicons/react/24/outline";
import { GitCompareArrows } from "lucide-react";
import type {
  ChatSession,
  ChatSessionSummary,
  ContextSummary,
  GitBranchSummary,
  GitDiffOverview,
  InterruptedApprovalGroup,
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
  EMPTY_CONTEXT_USAGE_SUMMARY,
} from "@renderer/lib/context-usage";
import { loadProviderDirectory } from "@renderer/lib/provider-directory";
import { mergeAttachments, upsertSummary } from "@renderer/lib/session";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useLocation, useNavigate } from "react-router-dom";

const ACTIVE_SESSION_STORAGE_KEY = "chela.active-session-id";
const LEGACY_ACTIVE_SESSION_STORAGE_KEY = "first-pi-agent.active-session-id";
const SIDEBAR_WIDTH_STORAGE_KEY = "chela.sidebar-width";
const LEGACY_SIDEBAR_WIDTH_STORAGE_KEY = "first-pi-agent.sidebar-width";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "chela.sidebar-collapsed";
const LEGACY_RIGHT_PANEL_SIZE_STORAGE_KEY = "first-pi-agent.right-panel-size";
const DEFAULT_SIDEBAR_SIZE = 18;
const MIN_SIDEBAR_SIZE = 14;
const MAX_SIDEBAR_SIZE = 28;
const ROOT_UI_THEME_DATASET = "theme";
const SETTINGS_ROUTE_PREFIX = "/settings";
const SETTINGS_SECTION_IDS: SettingsSection[] = [
  "general",
  "ai_model",
  "workspace",
  "interface",
  "system",
];

function resolveSettingsSectionFromPath(pathname: string): SettingsSection | null {
  if (!pathname.startsWith(SETTINGS_ROUTE_PREFIX)) {
    return null;
  }

  const section = pathname
    .slice(SETTINGS_ROUTE_PREFIX.length)
    .replace(/^\/+/, "");

  if (!section) {
    return "general";
  }

  return SETTINGS_SECTION_IDS.includes(section as SettingsSection)
    ? (section as SettingsSection)
    : "general";
}

function clampSidebarSize(size: number) {
  return Math.min(MAX_SIDEBAR_SIZE, Math.max(MIN_SIDEBAR_SIZE, size));
}

function toSidebarPercentageSize(size: number) {
  return `${clampSidebarSize(size)}%`;
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

function readStoredNumber(keys: string[]) {
  if (typeof window === "undefined") {
    return null;
  }

  for (const key of keys) {
    const value = Number(localStorage.getItem(key));
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function readStoredString(keys: string[]) {
  if (typeof window === "undefined") {
    return null;
  }

  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (value) {
      return value;
    }
  }

  return null;
}

function clearStoredStrings(keys: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  for (const key of keys) {
    localStorage.removeItem(key);
  }
}

function readStoredPanelSize(
  primaryKey: string,
  fallbackKeys: string[],
  defaultSize: number,
  clamp: (size: number) => number,
) {
  const storedValue = readStoredNumber([primaryKey, ...fallbackKeys]);
  if (storedValue !== null) {
    return clamp(storedValue);
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
  const navigate = useNavigate();
  const location = useLocation();
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [isPickingFiles, setIsPickingFiles] = useState(false);
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
  const [diffPanelOpen, setDiffPanelOpen] = useState(false);
  const [frameState, setFrameState] = useState<WindowFrameState>({
    isMaximized: false,
  });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
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
  const [gitBranchSummary, setGitBranchSummary] = useState<GitBranchSummary | null>(
    null,
  );
  const [gitOverview, setGitOverview] = useState<GitDiffOverview | null>(null);
  const [gitOverviewLoading, setGitOverviewLoading] = useState(false);
  const [sidebarAnimating, setSidebarAnimating] = useState(false);

  const settingsSection = useMemo(
    () => resolveSettingsSectionFromPath(location.pathname) ?? "general",
    [location.pathname],
  );
  const mainView: "thread" | "settings" =
    resolveSettingsSectionFromPath(location.pathname) === null
      ? "thread"
      : "settings";

  const activeSessionId = activeSession?.id ?? null;
  const sidebarPanelRef = useRef<PanelImperativeHandle | null>(null);
  const summariesRef = useRef<ChatSessionSummary[]>([]);
  const activeSessionIdRef = useRef<string | null>(null);
  const sessionCacheRef = useRef<Record<string, ChatSession>>({});
  const appliedCustomThemeKeysRef = useRef<string[]>([]);
  const lastGitBranchRefreshRef = useRef(0);
  const lastGitOverviewRefreshRef = useRef(0);
  const gitBranchRequestRef = useRef<Promise<GitBranchSummary | null> | null>(null);
  const gitOverviewRequestRef = useRef<Promise<GitDiffOverview | null> | null>(null);

  useEffect(() => {
    summariesRef.current = summaries;
  }, [summaries]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    sessionCacheRef.current = sessionCache;
  }, [sessionCache]);

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

  useEffect(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) {
      return;
    }

    if (sidebarCollapsed) {
      panel.collapse();
    } else {
      panel.expand();
    }
  }, [sidebarCollapsed]);

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

  const refreshGitBranchSummary = useCallback(async () => {
    if (!desktopApi?.git) {
      setGitBranchSummary(null);
      return null;
    }

    if (gitBranchRequestRef.current) {
      return gitBranchRequestRef.current;
    }

    lastGitBranchRefreshRef.current = Date.now();
    const request = desktopApi.git
      .getSummary()
      .then((nextSummary) => {
        setGitBranchSummary(nextSummary);
        return nextSummary;
      })
      .finally(() => {
        if (gitBranchRequestRef.current === request) {
          gitBranchRequestRef.current = null;
        }
      });

    gitBranchRequestRef.current = request;
    return request;
  }, [desktopApi]);

  const refreshGitOverview = useCallback(async () => {
    if (!desktopApi?.git) {
      setGitBranchSummary(null);
      setGitOverview(null);
      return null;
    }

    if (gitOverviewRequestRef.current) {
      return gitOverviewRequestRef.current;
    }

    lastGitOverviewRefreshRef.current = Date.now();
    setGitOverviewLoading(true);

    const request = desktopApi.git
      .getSnapshot()
      .then((nextOverview) => {
        setGitOverview(nextOverview);
        setGitBranchSummary(nextOverview.branch);
        return nextOverview;
      })
      .finally(() => {
        if (gitOverviewRequestRef.current === request) {
          gitOverviewRequestRef.current = null;
        }
        setGitOverviewLoading(false);
      });

    gitOverviewRequestRef.current = request;
    return request;
  }, [desktopApi]);

  useEffect(() => {
    if (mainView !== "thread" || diffPanelOpen) {
      return;
    }

    if (Date.now() - lastGitBranchRefreshRef.current < 1_500) {
      return;
    }

    void refreshGitBranchSummary();
  }, [diffPanelOpen, mainView, refreshGitBranchSummary]);

  useEffect(() => {
    if (mainView !== "thread" || !diffPanelOpen) {
      return;
    }

    if (gitOverview && Date.now() - lastGitOverviewRefreshRef.current < 1_500) {
      return;
    }

    void refreshGitOverview();
  }, [diffPanelOpen, gitOverview, mainView, refreshGitOverview]);

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
    setSessionCache((current) => {
      if (!(sessionId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[sessionId];
      return next;
    });
    setContextSummaryBySessionId((current) => {
      if (!(sessionId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[sessionId];
      return next;
    });
  }, []);

  const hydrateSession = useCallback((session: ChatSession) => {
    cacheSession(session);
    setActiveSession(session);
    localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, session.id);
  }, [cacheSession]);

  const clearActiveSession = useCallback(() => {
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
      if (session.archived) {
        setArchivedSummaries((current) => upsertSummary(current, session));
        setSummaries((current) =>
          current.filter((summary) => summary.id !== sessionId),
        );
      } else {
        setSummaries((current) => upsertSummary(current, session));
        setArchivedSummaries((current) =>
          current.filter((summary) => summary.id !== sessionId),
        );
      }
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
    [cacheSession, desktopApi],
  );

  const handleSessionRunStateChange = useCallback(
    (sessionId: string, isRunning: boolean) => {
      setRunningSessionIds((current) => {
        const exists = current.includes(sessionId);
        if (isRunning) {
          return exists ? current : [...current, sessionId];
        }

        return exists ? current.filter((id) => id !== sessionId) : current;
      });
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
  }, [clearActiveSession, desktopApi, hydrateSession, refreshContextSummary, refreshInterruptedApprovalGroups]);

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
    [desktopApi, hydrateSession, refreshContextSummary, refreshInterruptedApprovalGroups, refreshSessionLists],
  );

  const selectSession = useCallback(
    async (sessionId: string) => {
      if (!desktopApi) {
        return;
      }

      const cachedSession = sessionCacheRef.current[sessionId];
      if (cachedSession) {
        hydrateSession(cachedSession);
        void refreshContextSummary(sessionId);
        return;
      }

      const session = await desktopApi.sessions.load(sessionId);
      if (session) {
        hydrateSession(session);
        void refreshContextSummary(sessionId);
      }
    },
    [desktopApi, hydrateSession, refreshContextSummary],
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
      setRunningSessionIds((current) => current.filter((id) => id !== sessionId));
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

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      if (!desktopApi) {
        return;
      }

      const nextTitle = title.trim();
      if (!nextTitle) {
        return;
      }

      const updatedAt = new Date().toISOString();
      await desktopApi.sessions.rename(sessionId, nextTitle);

      setSummaries((prev) =>
        prev.map((summary) =>
          summary.id === sessionId
            ? {
              ...summary,
              title: nextTitle,
              updatedAt,
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
              updatedAt,
            }
            : summary,
        ),
      );

      setSessionCache((current) => {
        const session = current[sessionId];
        if (!session) {
          return current;
        }

        return {
          ...current,
          [sessionId]: {
            ...session,
            title: nextTitle,
            updatedAt,
          },
        };
      });

      setActiveSession((current) =>
        current && current.id === sessionId
          ? {
            ...current,
            title: nextTitle,
            updatedAt,
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
      setSessionCache((current) => {
        const session = current[sessionId];
        if (!session) {
          return current;
        }

        const nextSession = { ...session };
        if (groupId === null) {
          delete nextSession.groupId;
        } else {
          nextSession.groupId = groupId;
        }

        return {
          ...current,
          [sessionId]: nextSession,
        };
      });
      setActiveSession((current) => {
        if (!current || current.id !== sessionId) {
          return current;
        }

        const nextSession = { ...current };
        if (groupId === null) {
          delete nextSession.groupId;
        } else {
          nextSession.groupId = groupId;
        }
        return nextSession;
      });
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

  const toggleDiffPanel = useCallback(() => {
    const nextOpen = !diffPanelOpen;
    setDiffPanelOpen(nextOpen);
    void desktopApi?.ui.setDiffPanelOpen(nextOpen);
  }, [desktopApi, diffPanelOpen]);

  const handleShellLayoutChanged = useCallback((layout: Record<string, number>) => {
    const nextSidebarSize = layout["shell-sidebar"];
    if (typeof nextSidebarSize === "number" && Number.isFinite(nextSidebarSize)) {
      if (nextSidebarSize <= 0.5) {
        setSidebarCollapsed(true);
        return;
      }
      setSidebarCollapsed(false);
      setSidebarSize(clampSidebarSize(nextSidebarSize));
    }
  }, []);

  const sidebarAnimatingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => () => clearTimeout(sidebarAnimatingTimerRef.current), []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarAnimating(true);
    clearTimeout(sidebarAnimatingTimerRef.current);
    sidebarAnimatingTimerRef.current = setTimeout(() => setSidebarAnimating(false), 520);
    setSidebarCollapsed((current) => !current);
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

  const handleGitStateChanged = useCallback(async () => {
    if (diffPanelOpen) {
      await refreshGitOverview();
      return;
    }

    await refreshGitBranchSummary();
  }, [diffPanelOpen, refreshGitBranchSummary, refreshGitOverview]);

  const handleRefreshGitOverview = useCallback(async () => {
    await refreshGitOverview();
  }, [refreshGitOverview]);

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
      return (
        <div className="grid min-h-0 flex-1 place-items-center px-6 text-sm text-gray-400">
          当前没有可用线程。
        </div>
      );
    }

    if (mountedSessionIds.length === 0) {
      const hasArchivedSessions = archivedSummaries.length > 0;
      const hasLiveSessions = summaries.length > 0;

      return (
        <div className="grid min-h-0 flex-1 place-items-center px-6">
          <div className="flex max-w-[440px] flex-col items-center gap-3 text-center">
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-[color:var(--chela-text-primary)]">
                {hasLiveSessions ? "还没有选中的线程" : "当前没有活跃线程"}
              </p>
              <p className="text-[12px] leading-5 text-[color:var(--chela-text-secondary)]">
                {hasArchivedSessions
                  ? "可以新建一个线程继续，也可以去已归档里恢复之前的对话。"
                  : "可以先新建一个线程，空线程列表现在也允许保留。"}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  void createNewSession();
                }}
                className="rounded-[var(--radius-shell)]"
              >
                新建线程
              </Button>
              {hasArchivedSessions ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openSettingsView("system")}
                  className="rounded-[var(--radius-shell)]"
                >
                  查看已归档
                </Button>
              ) : null}
            </div>
          </div>
        </div>
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
                terminalOpen={terminalOpen}
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
    terminalOpen,
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
    ),
    [
      archivedSummaries,
      currentModelId,
      deleteSessionPermanently,
      handleModelChange,
      handleSettingsChange,
      handleThinkingLevelChange,
      openArchivedSessionFromSettings,
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
      >
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 h-full overflow-hidden bg-transparent"
          onLayoutChanged={handleShellLayoutChanged}
          resizeTargetMinimumSize={{ fine: 6, coarse: 24 }}
        >
          <ResizablePanel
            id="shell-sidebar"
            panelRef={sidebarPanelRef}
            collapsible
            collapsedSize="0%"
            defaultSize={toSidebarPercentageSize(sidebarSize)}
            minSize={`${MIN_SIDEBAR_SIZE}%`}
            maxSize={`${MAX_SIDEBAR_SIZE}%`}
          >
            <aside className="chela-sidebar-content relative h-full min-h-0 overflow-hidden bg-transparent" data-collapsed={sidebarCollapsed ? "true" : undefined}>
              <Sidebar
                summaries={summaries}
                activeSessionId={activeSessionId}
                runningSessionIds={runningSessionIds}
                onSelectSession={selectSession}
                onNewSession={createNewSession}
                onOpenSettings={() => openSettingsView("general")}
                onArchiveSession={archiveSession}
                onUnarchiveSession={unarchiveSession}
                onDeleteSession={deleteSessionPermanently}
                onRenameSession={renameSession}
                onToggleSessionPinned={setSessionPinned}
                onCreateSessionInGroup={createSessionInGroup}
                archivedSummaries={archivedSummaries}
                groups={groups}
                onCreateGroup={createGroup}
                onRenameGroup={renameGroup}
                onDeleteGroup={deleteGroup}
                onSetSessionGroup={setSessionGroup}
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
              <div className="chela-main-content-surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-l-[var(--radius-shell)] bg-[color:var(--chela-bg-surface)]">
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={toggleDiffPanel}
                    className={`relative h-9 w-9 cursor-pointer rounded-[var(--radius-shell)] border-none bg-transparent shadow-none ring-0 hover:bg-shell-toolbar-hover ${diffPanelOpen ? "bg-shell-toolbar-hover text-foreground" : "text-muted-foreground"}`}
                    aria-label={diffPanelOpen ? "收起 Diff 面板" : "展开 Diff 面板"}
                  >
                    <GitCompareArrows className="h-4 w-4" />
                    {gitBranchSummary?.hasChanges && !diffPanelOpen && (
                      <span className="absolute right-1 top-1 size-1.5 rounded-full bg-red-500" />
                    )}
                  </Button>
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

                <div className={mainView === "thread" ? "" : "hidden"}>
                  <TerminalDrawer
                    open={terminalOpen}
                    onToggle={() => setTerminalOpen((prev) => !prev)}
                    settings={settings}
                  />
                </div>
              </div>
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Diff slide-out drawer */}
      <DiffPanel
        open={diffPanelOpen}
        onClose={() => {
          setDiffPanelOpen(false);
          void desktopApi?.ui.setDiffPanelOpen(false);
        }}
        overview={gitOverview}
        isLoading={gitOverviewLoading}
        onRefresh={handleRefreshGitOverview}
      />
    </main>
  );
}
