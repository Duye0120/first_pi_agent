import { memo } from "react";
import {
  PlusIcon,
  ClipboardDocumentIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
} from "@heroicons/react/24/outline";

type ChatHeaderProps = {
  title: string;
  source?: string;
  sessionListCollapsed: boolean;
  onToggleSessionList: () => void;
  onNewSession: () => void;
  onCopySessionId: () => void;
};

const sourceLabel: Record<string, string> = {
  telegram: "Telegram",
  api_server: "API Server",
  cli: "CLI",
  discord: "Discord",
  slack: "Slack",
  matrix: "Matrix",
  whatsapp: "WhatsApp",
  signal: "Signal",
  email: "Email",
  sms: "SMS",
  dingtalk: "DingTalk",
  feishu: "Feishu",
  wecom: "WeCom",
  weixin: "WeChat",
  bluebubbles: "iMessage",
  mattermost: "Mattermost",
  cron: "Cron",
};

function getSourceLabel(source?: string): string {
  if (!source) return "";
  return sourceLabel[source] || source;
}

function ChatHeaderImpl({
  title,
  source,
  sessionListCollapsed,
  onToggleSessionList,
  onNewSession,
  onCopySessionId,
}: ChatHeaderProps) {
  return (
    <header
      className="chela-chat-header flex h-14 shrink-0 items-center justify-between border-b border-[color:var(--chela-border)] px-4"
      style={{ minHeight: "56px" }}
    >
      {/* Left side */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={onToggleSessionList}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[color:var(--chela-text-secondary)] transition-colors hover:bg-[color:var(--chela-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
          title={sessionListCollapsed ? "展开会话列表" : "收起会话列表"}
        >
          {sessionListCollapsed ? (
            <ArrowsPointingOutIcon className="size-4" />
          ) : (
            <ArrowsPointingInIcon className="size-4" />
          )}
        </button>
        <h2 className="truncate text-[14px] font-medium text-[color:var(--chela-text-primary)]">
          {title}
        </h2>
        {source && (
          <span className="shrink-0 rounded-full bg-[color:var(--chela-text-muted)]/12 px-2 py-0.5 text-[10px] leading-4 font-medium text-[color:var(--chela-text-muted)]">
            {getSourceLabel(source)}
          </span>
        )}
      </div>

      {/* Right side */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onCopySessionId}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[color:var(--chela-text-secondary)] transition-colors hover:bg-[color:var(--chela-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
          title="复制 Session ID"
        >
          <ClipboardDocumentIcon className="size-4" />
        </button>
        <button
          type="button"
          onClick={onNewSession}
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-[color:var(--chela-accent)] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[color:var(--chela-accent-hover)]"
        >
          <PlusIcon className="size-3.5" />
          <span>新建</span>
        </button>
      </div>
    </header>
  );
}

export const ChatHeader = memo(ChatHeaderImpl);
export { getSourceLabel };
