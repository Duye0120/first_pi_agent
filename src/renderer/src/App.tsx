import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CommandLineIcon,
  RectangleGroupIcon,
} from "@heroicons/react/24/outline";
import type {
  ChatSession,
  ChatSessionSummary,
  ContextSummary,
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
  EMPTY_CONTEXT_USAGE_SUMMARY,
} from "@renderer/lib/context-usage";
import { loadProviderDirectory } from "@renderer/lib/provider-directory";
import { mergeAttachments, upsertSummary } from "@renderer/lib/session";
import { useLocation, useNavigate } from "react-router-dom";

const ACTIVE_SESSION_STORAGE_KEY = "chela.active-session-id";
const LEGACY_ACTIVE_SESSION_STORAGE_KEY = "first-pi-agent.active-session-id";
const SIDEBAR_WIDTH_STORAGE_KEY = "chela.sidebar-width";
const LEGACY_SIDEBAR_WIDTH_STORAGE_KEY = "first-pi-agent.sidebar-width";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "chela.sidebar-collapsed";
const LEGACY_RIGHT_PANEL_SIZE_STORAGE_KEY = "first-pi-agent.right-panel-size";
const DIFF_PANEL_SIZE_STORAGE_KEY = "chela.diff-panel-size";
const LEGACY_DIFF_PANEL_SIZE_STORAGE_KEY = "first-pi-agent.diff-panel-size";
const DEFAULT_SIDEBAR_SIZE = 18;
const MIN_SIDEBAR_SIZE = 14;
const MAX_SIDEBAR_SIZE = 28;
const DEFAULT_DIFF_PANEL_SIZE = 28;
const MIN_DIFF_PANEL_SIZE = 20;
const MAX_DIFF_PANEL_SIZE = 44;
const ROOT_UI_THEME_DATASET = "theme";
const SETTINGS_ROUTE_PREFIX = "/settings";
const SETTINGS_SECTION_IDS: SettingsSection[] = [
  "general",
  "keys",
  "appearance",
  "terminal",
  "workspace",
  "archived",
  "about",
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
  const [diffPanelSize, setDiffPanelSize] = useState(() =>
    readStoredPanelSize(
      DIFF_PANEL_SIZE_STORAGE_KEY,
      [LEGACY_DIFF_PANEL_SIZE_STORAGE_KEY, LEGACY_RIGHT_PANEL_SIZE_STORAGE_KEY],
      DEFAULT_DIFF_PANEL_SIZE,
      clampDiffPanelSize,
    ),
  );
  const [currentModelId, setCurrentModelId] = useState(
    "builtin:anthropic:claude-sonnet-4-20250514",
  );
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>("off");
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
  const sidebarPanelRef = useRef<{
    collapse: () => void;
    expand: () => void;
    isCollapsed: () => boolean;
  } | null>(null);
  const summariesRef = useRef<ChatSessionSummary[]>([]);
  const activeSessionIdRef = useRef<string | null>(null);
  const sessionCacheRef = useRef<Record<string, ChatSession>>({});
  const appliedCustomThemeKeysRef = useRef<string[]>([]);
  const lastGitRefreshRef = useRef(0);

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

  const refreshGitOverview = useCallback(async () => {
    if (!desktopApi?.git) {
      setGitOverview(null);
      return;
    }

    lastGitRefreshRef.current = Date.now();
    setGitOverviewLoading(true);

    try {
      const nextOverview = await desktopApi.git.getSnapshot();
      setGitOverview(nextOverview);
    } finally {
      setGitOverviewLoading(false);
    }
  }, [desktopApi]);

  // workspace 变化时需要刷 git 的 ref，避免放进 deps 触发额外 effect
  const workspaceRef = useRef(settings?.workspace);
  useEffect(() => { workspaceRef.current = settings?.workspace; }, [settings?.workspace]);

  useEffect(() => {
    if (mainView !== "thread") {
      return;
    }

    // 从设置页切回时，如果最近 5 秒内刷新过就跳过，避免不必要的 IPC 和重渲染
    if (Date.now() - lastGitRefreshRef.current < 5_000) {
      return;
    }

    void refreshGitOverview();
  }, [mainView, refreshGitOverview]);

  useEffect(() => {
    if (mainView !== "thread" || !diffPanelOpen) {
      return;
    }

    void refreshGitOverview();
  }, [diffPanelOpen, mainView, refreshGitOverview]);

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
    },
    [cacheSession, desktopApi, refreshContextSummary],
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
        nextSession = await desktopApi.sessions.create();
        setSummaries([upsertSummary([], nextSession)[0]]);
      }

      hydrateSession(nextSession);
      void refreshContextSummary(nextSession.id);
    } catch (error) {
      setBootError(
        error instanceof Error ? error.message : "桌面壳初始化失败。",
      );
    } finally {
      setBooting(false);
    }
  }, [desktopApi, hydrateSession, refreshContextSummary]);

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
      } else if (mod && e.key === "b") {
        e.preventDefault();
        toggleSidebarCollapsed();
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
    void refreshContextSummary(nextSession.id);
  }, [desktopApi, hydrateSession, refreshContextSummary]);

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
    },
    [desktopApi, hydrateSession, refreshContextSummary, refreshSessionLists],
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
        void refreshContextSummary(sessionId);
      }
    },
    [desktopApi, hydrateSession, refreshContextSummary, refreshSessionLists],
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

      setActiveSession(null);

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

  const sidebarAnimatingTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(sidebarAnimatingTimerRef.current), []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarAnimating(true);
    clearTimeout(sidebarAnimatingTimerRef.current);
    sidebarAnimatingTimerRef.current = setTimeout(() => setSidebarAnimating(false), 280);
    setSidebarCollapsed((current) => !current);
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
    navigate(`${SETTINGS_ROUTE_PREFIX}/${section}`);
  }, [navigate]);

  const closeSettingsView = useCallback(() => {
    navigate("/");
  }, [navigate]);

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
      return (
        <div className="grid min-h-0 flex-1 place-items-center px-6 text-sm text-gray-400">
          当前没有可用线程。
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
                onBranchChanged={refreshGitOverview}
                onRunStateChange={handleSessionRunStateChange}
                branchSummary={gitOverview?.branch ?? null}
                contextSummary={
                  contextSummaryBySessionId[session.id] ??
                  EMPTY_CONTEXT_USAGE_SUMMARY
                }
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
    desktopApi,
    handleModelChange,
    handleSessionRunStateChange,
    handleThinkingLevelChange,
    hasAnyRunningSessions,
    isPickingFiles,
    mountedSessionIds,
    removeAttachment,
    pasteFiles,
    persistSession,
    refreshGitOverview,
    reloadSession,
    sessionCache,
    terminalOpen,
    thinkingLevel,
    gitOverview?.branch,
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
    () =>
      diffPanelOpen ? (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 bg-[color:var(--chela-bg-surface)]"
          onLayoutChanged={handleDiffOnlyLayoutChanged}
          resizeTargetMinimumSize={{ fine: 6, coarse: 24 }}
        >
          <ResizablePanel
            id="thread-main"
            defaultSize={toPercentageSize(100 - normalizedDiffPanelSize)}
            minSize={`${100 - MAX_DIFF_PANEL_SIZE}%`}
          >
            <section className="flex h-full min-h-0 flex-col bg-[color:var(--chela-bg-surface)]">
              {threadRuntimeLayer}
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
        <section className="flex h-full min-h-0 flex-col bg-[color:var(--chela-bg-surface)]">
          {threadRuntimeLayer}
        </section>
      ),
    [
      diffPanelOpen,
      gitOverview,
      gitOverviewLoading,
      handleDiffOnlyLayoutChanged,
      normalizedDiffPanelSize,
      refreshGitOverview,
      threadRuntimeLayer,
    ],
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
      <div className="relative min-h-0 flex-1" {...(sidebarAnimating ? { "data-sidebar-animating": "" } : {})}>
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
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-l-[var(--radius-shell)] bg-[color:var(--chela-bg-surface)]">
            <div
              className={`flex items-center justify-end gap-2 px-5 transition-[min-height,padding,opacity] duration-200 ease-out ${
                mainView === "thread"
                  ? "min-h-[52px] pb-3 pt-4 opacity-100"
                  : "pointer-events-none min-h-0 overflow-hidden py-0 opacity-0"
              }`}
              aria-hidden={mainView !== "thread"}
            >
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
            </div>

            <div className="relative min-h-0 flex-1 bg-[color:var(--chela-bg-surface)]">
              <div
                className={`absolute inset-0 min-h-0 will-change-[opacity,transform] transition-[opacity,transform] duration-200 ease-out ${
                  mainView === "thread"
                    ? "pointer-events-auto translate-y-0 opacity-100"
                    : "pointer-events-none -translate-y-1 opacity-0"
                }`}
                aria-hidden={mainView !== "thread"}
              >
                {threadPanels}
              </div>

              <div
                className={`absolute inset-0 min-h-0 will-change-[opacity,transform] transition-[opacity,transform] duration-200 ease-out ${
                  mainView === "settings"
                    ? "pointer-events-auto translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-1 opacity-0"
                }`}
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
    </main>
  );
}
