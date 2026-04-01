import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { RectangleGroupIcon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/react";
import type { ChatMessage, ChatSession, ChatSessionSummary, ModelSelection, SelectedFile, Settings, ThinkingLevel, WindowFrameState } from "@shared/contracts";
import { Composer } from "@renderer/components/Composer";
import { ContextPanel } from "@renderer/components/ContextPanel";
import { MessageList } from "@renderer/components/MessageList";
import { Sidebar } from "@renderer/components/Sidebar";
import { TitleBar } from "@renderer/components/TitleBar";
import { SettingsModal } from "@renderer/components/SettingsModal";
import { TerminalDrawer } from "@renderer/components/TerminalDrawer";
import { deriveSessionTitle, mergeAttachments, upsertSummary } from "@renderer/lib/session";
import { useAgentEvents } from "@renderer/hooks/useAgentEvents";

const ACTIVE_SESSION_STORAGE_KEY = "first-pi-agent.active-session-id";

function buildUserMessage(text: string, attachments: SelectedFile[]): ChatMessage {
  const trimmed = text.trim();
  const fallback = attachments.length > 0 ? `附加了 ${attachments.length} 个本地文件。` : "空消息";

  return {
    id: crypto.randomUUID(),
    role: "user",
    content: trimmed || fallback,
    timestamp: new Date().toISOString(),
    status: "done",
    meta: {
      attachmentIds: attachments.map((attachment) => attachment.id),
    },
  };
}

export default function App() {
  const desktopApi = window.desktopApi;
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isPickingFiles, setIsPickingFiles] = useState(false);
  const [summaries, setSummaries] = useState<ChatSessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [frameState, setFrameState] = useState<WindowFrameState>({ isMaximized: false });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [currentModel, setCurrentModel] = useState<ModelSelection>({ provider: "anthropic", model: "claude-sonnet-4-20250514" });
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>("off");

  const activeSessionId = activeSession?.id ?? null;
  const { currentResponse, isAgentRunning, cancel, buildAssistantMessage } = useAgentEvents();
  const prevResponseRef = useRef(currentResponse);

  const hydrateSession = useCallback((session: ChatSession) => {
    startTransition(() => {
      setActiveSession(session);
    });
    localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, session.id);
  }, []);

  const persistSession = useCallback(
    (session: ChatSession) => {
      setActiveSession(session);
      setSummaries((current) => upsertSummary(current, session));
      void desktopApi?.sessions.save(session);
    },
    [desktopApi],
  );

  const bootApp = useCallback(async () => {
    if (!desktopApi) {
      setBootError("桌面桥接没有注入成功，renderer 无法访问 Electron API。现在不会再整窗黑掉，而是直接把问题暴露出来。");
      setBooting(false);
      return;
    }

    try {
      const [uiState, frame, sessionSummaries, settings] = await Promise.all([
        desktopApi.ui.getState(),
        desktopApi.window.getState(),
        desktopApi.sessions.list(),
        desktopApi.settings.get(),
      ]);

      setRightPanelOpen(uiState.rightPanelOpen);
      setFrameState(frame);
      setSummaries(sessionSummaries);
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

  // When agent finishes, persist the assistant message into the session
  useEffect(() => {
    if (
      currentResponse &&
      currentResponse !== prevResponseRef.current &&
      (currentResponse.status === "completed" || currentResponse.status === "error") &&
      activeSession
    ) {
      prevResponseRef.current = currentResponse;
      const assistantMessage = buildAssistantMessage(currentResponse);
      const nextSession: ChatSession = {
        ...activeSession,
        messages: [...activeSession.messages, assistantMessage],
        updatedAt: assistantMessage.timestamp,
      };
      persistSession(nextSession);
    }
  }, [currentResponse, activeSession, buildAssistantMessage, persistSession]);

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

  const updateDraft = useCallback(
    (draft: string) => {
      setActiveSession((current) => {
        if (!current) {
          return current;
        }

        const nextSession = {
          ...current,
          draft,
        };

        void desktopApi?.sessions.save(nextSession);
        return nextSession;
      });
    },
    [desktopApi],
  );

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

  const sendMessage = useCallback(async () => {
    if (!activeSession || isSending) {
      return;
    }

    const text = activeSession.draft.trim();
    const attachments = activeSession.attachments;

    if (!text && attachments.length === 0) {
      return;
    }

    setIsSending(true);

    try {
      const userMessage = buildUserMessage(text, attachments);
      const nextSessionTitle =
        activeSession.messages.length === 0 ? deriveSessionTitle(text, attachments) : activeSession.title;

      const sessionAfterUserMessage: ChatSession = {
        ...activeSession,
        title: nextSessionTitle,
        messages: [...activeSession.messages, userMessage],
        draft: "",
        attachments: [],
        updatedAt: userMessage.timestamp,
      };

      persistSession(sessionAfterUserMessage);

      if (!desktopApi) {
        throw new Error("桌面桥接不可用，无法发送消息。");
      }

      // Fire and forget — response comes via agent events (useAgentEvents hook)
      await desktopApi.chat.send({
        sessionId: activeSession.id,
        text,
        attachmentIds: attachments.map((attachment) => attachment.id),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "发送失败，请稍后重试。";
      const systemMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "system",
        content: message,
        timestamp: new Date().toISOString(),
        status: "error",
      };

      persistSession({
        ...activeSession,
        messages: [...activeSession.messages, systemMessage],
        updatedAt: systemMessage.timestamp,
      });
    } finally {
      setIsSending(false);
    }
  }, [activeSession, desktopApi, isSending, persistSession]);

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

  if (booting) {
    return (
      <main className="grid h-screen place-items-center bg-[#e8ecf2] text-shell-300">
        <div className="rounded-[28px] border border-black/8 bg-white/82 px-8 py-7 shadow-glow">
          <p className="text-xs uppercase tracking-[0.24em] text-shell-500">Booting</p>
          <h1 className="mt-3 text-2xl font-semibold text-shell-100">正在拉起桌面聊天壳…</h1>
          <p className="mt-2 text-sm text-shell-400">会话状态、窗口状态和本地文件能力正在就位。</p>
        </div>
      </main>
    );
  }

  if (bootError) {
    return (
      <main className="grid h-screen place-items-center bg-[#e8ecf2] px-8 text-shell-300">
        <div className="max-w-2xl rounded-[28px] border border-rose-400/25 bg-rose-50 px-8 py-7 shadow-glow">
          <p className="text-xs uppercase tracking-[0.24em] text-rose-200">Renderer Error</p>
          <h1 className="mt-3 text-2xl font-semibold text-shell-100">界面初始化失败</h1>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-shell-300">{bootError}</p>
          <p className="mt-4 text-sm text-shell-400">现在就算 preload 出问题，也不会再整窗发黑，而是直接显示诊断信息。</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-[#e8ecf2] text-shell-100">
      <TitleBar
        isMaximized={frameState.isMaximized}
        onMinimize={() => desktopApi?.window.minimize()}
        onToggleMaximize={() => desktopApi?.window.toggleMaximize()}
        onClose={() => desktopApi?.window.close()}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
        <Sidebar
          summaries={summaries}
          activeSessionId={activeSessionId}
          onSelectSession={selectSession}
          onNewSession={createNewSession}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <section className="flex min-h-0 flex-col overflow-hidden">
          <div className="floating-workspace flex min-h-0 flex-1 flex-col overflow-hidden rounded-tl-2xl border-l border-black/8 bg-white">
            <div className="flex items-center justify-between border-b border-black/6 px-5 py-3">
              <h1 className="text-sm font-medium text-shell-300">{activeSession?.title ?? "新线程"}</h1>
              <Button
                isIconOnly
                variant="ghost"
                onClick={toggleRightPanel}
                className="heroui-ghost-button h-8 min-w-8 rounded-lg"
                aria-label={rightPanelOpen ? "收起右侧上下文" : "展开右侧上下文"}
              >
                <RectangleGroupIcon className="h-4 w-4" />
              </Button>
            </div>

            <div className={`grid min-h-0 flex-1 ${rightPanelOpen ? "grid-cols-[minmax(0,1fr)_300px]" : "grid-cols-[minmax(0,1fr)]"}`}>
              <section className="flex min-h-0 flex-col bg-transparent">
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <MessageList
                    messages={activeSession?.messages ?? []}
                    streamingResponse={currentResponse}
                    onCancelAgent={cancel}
                  />
                </div>

                <Composer
                  draft={activeSession?.draft ?? ""}
                  attachments={activeSession?.attachments ?? []}
                  isSending={isSending}
                  isAgentRunning={isAgentRunning}
                  isPickingFiles={isPickingFiles}
                  currentModel={currentModel}
                  thinkingLevel={thinkingLevel}
                  onDraftChange={updateDraft}
                  onAttachFiles={attachFiles}
                  onRemoveAttachment={removeAttachment}
                  onSend={() => void sendMessage()}
                  onCancel={cancel}
                  onModelChange={handleModelChange}
                  onThinkingLevelChange={handleThinkingLevelChange}
                />
              </section>

              {rightPanelOpen ? <ContextPanel open={rightPanelOpen} session={activeSession} /> : null}
            </div>
          </div>

          <TerminalDrawer
            open={terminalOpen}
            onToggle={() => setTerminalOpen((prev) => !prev)}
          />
        </section>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}
