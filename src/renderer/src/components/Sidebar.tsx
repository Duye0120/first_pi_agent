import { Button } from "@heroui/react";
import { AdjustmentsHorizontalIcon, BoltIcon, Cog6ToothIcon, PlusIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import type { ChatSessionSummary } from "@shared/contracts";
import { formatRelativeTime } from "@renderer/lib/session";

type SidebarProps = {
  summaries: ChatSessionSummary[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
};

export function Sidebar({ summaries, activeSessionId, onSelectSession, onNewSession, onOpenSettings }: SidebarProps) {
  return (
    <aside className="flex h-full flex-col bg-transparent">
      <div className="px-3 pb-4 pt-3">
        <div className="space-y-1">
          {[
            { label: "新线程", icon: PlusIcon, active: true, onClick: onNewSession },
            { label: "技能", icon: Squares2X2Icon },
            { label: "自动化", icon: BoltIcon },
          ].map(({ label, icon: Icon, active, onClick }) => (
            <Button
              key={label}
              onClick={onClick}
              variant="ghost"
              className={`flex w-full justify-start gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                active
                  ? "bg-white/70 text-shell-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                  : "text-shell-400 hover:bg-white/50 hover:text-shell-200"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Button>
          ))}
        </div>
      </div>

      <div className="border-t border-black/5 px-4 pb-2 pt-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.24em] text-shell-500">线程</p>
          <div className="flex items-center gap-1 text-shell-500">
            <Button isIconOnly variant="ghost" className="h-7 min-w-7 rounded-lg p-0 text-shell-500">
              <AdjustmentsHorizontalIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
        {summaries.map((summary) => {
          const active = summary.id === activeSessionId;

          return (
            <Button
              key={summary.id}
              onClick={() => onSelectSession(summary.id)}
              variant="ghost"
              className={`h-auto w-full justify-start rounded-xl border px-3 py-2.5 text-left transition ${
                active
                  ? "border-accent-400/25 bg-white/70 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                  : "border-transparent bg-transparent hover:border-black/6 hover:bg-white/50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-shell-200">{summary.title}</p>
                  <p className="mt-1 text-xs text-shell-500">{summary.messageCount} 条消息</p>
                </div>
                <span className="shrink-0 text-[11px] text-shell-500">{formatRelativeTime(summary.updatedAt)}</span>
              </div>
            </Button>
          );
        })}
      </div>

      <div className="mt-auto border-t border-black/5 px-3 py-3">
        <Button variant="ghost" onClick={onOpenSettings} className="flex w-full justify-start gap-3 rounded-xl px-3 py-2 text-left text-sm text-shell-400 hover:bg-white/50">
          <Cog6ToothIcon className="h-4 w-4" />
          设置
        </Button>
      </div>
    </aside>
  );
}
