import { useCallback, useEffect, useRef, useState } from "react";
import {
  XMarkIcon,
  PlusIcon,
  CommandLineIcon,
} from "@heroicons/react/24/outline";
import type { Settings } from "@shared/contracts";
import { TerminalTab } from "@renderer/components/assistant-ui/terminal-tab";

type Props = {
  open: boolean;
  onToggle: () => void;
  settings: Settings | null;
};

type Tab = {
  id: string;
  terminalId: string;
  label: string;
  shellLabel: string;
};

function getShellLabel(shell: string | undefined) {
  switch (shell) {
    case "powershell":
      return "PowerShell";
    case "cmd":
      return "Command Prompt";
    case "git-bash":
      return "Git Bash";
    case "wsl":
      return "WSL";
    default:
      return "System";
  }
}

export function TerminalDrawer({ open, onToggle, settings }: Props) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [drawerHeight, setDrawerHeight] = useState(200);
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const desktopApi = window.desktopApi;

  const createTab = useCallback(async () => {
    if (!desktopApi) return;
    const terminalId = await desktopApi.terminal.create();
    const tab: Tab = {
      id: crypto.randomUUID(),
      terminalId,
      label: `Terminal ${tabs.length + 1}`,
      shellLabel: getShellLabel(settings?.terminal.shell),
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }, [desktopApi, settings?.terminal.shell, tabs.length]);

  const closeTab = useCallback(
    async (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (tab && desktopApi) {
        await desktopApi.terminal.destroy(tab.terminalId);
      }
      setTabs((prev) => prev.filter((t) => t.id !== tabId));
      setActiveTabId((prev) => {
        if (prev === tabId) {
          const remaining = tabs.filter((t) => t.id !== tabId);
          return remaining.length > 0
            ? remaining[remaining.length - 1].id
            : null;
        }
        return prev;
      });
    },
    [tabs, desktopApi],
  );

  // Auto-create first tab when opened
  useEffect(() => {
    if (open && tabs.length === 0) {
      void createTab();
    }
  }, [open, tabs.length, createTab]);

  // Drag to resize
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      dragRef.current = { startY: e.clientY, startHeight: drawerHeight };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startY - ev.clientY;
        const newHeight = Math.max(
          150,
          Math.min(600, dragRef.current.startHeight + delta),
        );
        setDrawerHeight(newHeight);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        dragRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [drawerHeight],
  );

  const visibleHeight = open ? drawerHeight : 0;

  return (
    <div
      className={`shrink-0 overflow-hidden border-t border-[color:var(--color-control-border)] shadow-[0_-4px_16px_rgba(0,0,0,0.03)] dark:shadow-[0_-4px_16px_rgba(0,0,0,0.2)] ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      style={{
        height: visibleHeight,
        opacity: open ? 1 : 0,
        transition: isResizing
          ? "none"
          : "height 240ms linear, opacity 180ms ease-out",
      }}
    >
      <div className="relative flex h-full flex-col bg-[color:var(--color-control-panel-bg)]">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 z-20 h-3 cursor-ns-resize bg-transparent"
          onMouseDown={handleMouseDown}
        />

        {/* Zed-like Header */}
        <div className="flex min-w-0 items-center justify-between bg-transparent pr-2 border-b border-[color:var(--color-control-border)]">
          <div className="flex min-w-0 flex-1 flex-nowrap items-end gap-1 overflow-x-auto overflow-y-hidden pt-1.5 pl-2 whitespace-nowrap [&::-webkit-scrollbar]:h-[3px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color:var(--color-text-tertiary)] [&::-webkit-scrollbar-track]:bg-transparent">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTabId(tab.id)}
                className={`group relative -mb-px flex shrink-0 items-center gap-2 rounded-t-[6px] px-3 py-1.5 text-[11px] font-medium transition-colors ${tab.id === activeTabId
                  ? "z-10 bg-[color:var(--color-control-tab-bg)] text-[color:var(--color-text-primary)] shadow-sm border border-b-0 border-[color:var(--color-control-border)]"
                  : "border-transparent border overflow-visible border-b-0 text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-control-toolbar-hover)] hover:text-[color:var(--color-text-primary)]"
                  }`}
              >
                <span className="flex items-center gap-1.5">
                  <CommandLineIcon className="h-3.5 w-3.5 text-[color:var(--color-text-secondary)]" />
                  <span className="truncate max-w-[120px]">
                    {tab.label}
                  </span>
                  <span className="text-[10px] font-normal text-[color:var(--color-text-muted)]">
                    - {tab.shellLabel}
                  </span>
                </span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    void closeTab(tab.id);
                    if (tabs.length <= 1 && open) onToggle();
                  }}
                  className={`rounded p-0.5 text-[color:var(--color-text-muted)] hover:bg-shell-hover hover:text-foreground ${tab.id === activeTabId ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                >
                  <XMarkIcon className="h-3 w-3" />
                </span>
              </button>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1 pb-0.5 pl-2 text-[color:var(--color-text-secondary)]">
            <button
              type="button"
              onClick={() => void createTab()}
              className="rounded-md p-1 transition hover:bg-shell-hover hover:text-foreground"
              aria-label="新终端"
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (activeTabId) void closeTab(activeTabId);
                if (tabs.length <= 1 && open) onToggle();
              }}
              className="rounded-md p-1 transition hover:bg-shell-hover hover:text-foreground"
              aria-label="关闭当前终端"
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Terminal content */}
        <div className="relative flex-1 overflow-hidden">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`absolute inset-0 ${tab.id === activeTabId ? "block" : "hidden"}`}
            >
              <TerminalTab
                terminalId={tab.terminalId}
                visible={open && tab.id === activeTabId}
                settings={settings}
              />
            </div>
          ))}

          {tabs.length === 0 && (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              暂无终端
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
