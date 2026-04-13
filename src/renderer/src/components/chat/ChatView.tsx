import { memo, useCallback, useMemo, useState } from "react";
import type { ChatSessionSummary, SessionGroup } from "@shared/contracts";
import { SessionList } from "./SessionList";
import { ChatHeader } from "./ChatHeader";

type ChatViewProps = {
  summaries: ChatSessionSummary[];
  activeSessionId: string | null;
  activeSessionTitle: string;
  activeSessionSource?: string;
  runningSessionIds: string[];
  groups: SessionGroup[];
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onCreateSessionInGroup: (groupId: string) => void;
  onArchiveSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onSetSessionGroup: (sessionId: string, groupId: string | null) => void;
  onCopySessionId: () => void;
  children: React.ReactNode;
};

function ChatViewImpl({
  summaries,
  activeSessionId,
  activeSessionTitle,
  activeSessionSource,
  runningSessionIds,
  groups,
  onSelectSession,
  onNewSession,
  onCreateSessionInGroup,
  onArchiveSession,
  onRenameSession,
  onSetSessionGroup,
  onCopySessionId,
  children,
}: ChatViewProps) {
  const [sessionListCollapsed, setSessionListCollapsed] = useState(false);

  const toggleSessionList = useCallback(() => {
    setSessionListCollapsed((prev) => !prev);
  }, []);

  const sessionList = useMemo(
    () => (
      <SessionList
        summaries={summaries}
        activeSessionId={activeSessionId}
        runningSessionIds={runningSessionIds}
        groups={groups}
        onSelectSession={onSelectSession}
        onNewSession={onNewSession}
        onCreateSessionInGroup={onCreateSessionInGroup}
        onArchiveSession={onArchiveSession}
        onRenameSession={onRenameSession}
        onSetSessionGroup={onSetSessionGroup}
        collapsed={sessionListCollapsed}
      />
    ),
    [
      summaries,
      activeSessionId,
      runningSessionIds,
      groups,
      onSelectSession,
      onNewSession,
      onCreateSessionInGroup,
      onArchiveSession,
      onRenameSession,
      onSetSessionGroup,
      sessionListCollapsed,
    ],
  );

  const chatHeader = useMemo(
    () => (
      <ChatHeader
        title={activeSessionTitle || "新会话"}
        source={activeSessionSource}
        sessionListCollapsed={sessionListCollapsed}
        onToggleSessionList={toggleSessionList}
        onNewSession={onNewSession}
        onCopySessionId={onCopySessionId}
      />
    ),
    [
      activeSessionTitle,
      activeSessionSource,
      sessionListCollapsed,
      toggleSessionList,
      onNewSession,
      onCopySessionId,
    ],
  );

  return (
    <div className="chela-chat-view flex h-full min-h-0 flex-1 overflow-hidden">
      {/* Session List sidebar */}
      <div
        className="chela-session-list-wrapper transition-[width] duration-200"
        style={{
          width: sessionListCollapsed ? "0px" : "220px",
          overflow: "hidden",
        }}
      >
        {sessionList}
      </div>

      {/* Main chat area */}
      <div className="chela-chat-main flex min-w-0 flex-1 flex-col bg-[color:var(--chela-bg-surface)]">
        {chatHeader}
        <div className="relative min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

export const ChatView = memo(ChatViewImpl);
