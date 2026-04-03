import { useCallback, useEffect, useRef, useState } from "react";
import {
  XMarkIcon,
  PlusIcon,
  CommandLineIcon,
} from "@heroicons/react/24/outline";
import { TerminalTab } from "@renderer/components/assistant-ui/terminal-tab";
import { Button } from "@renderer/components/assistant-ui/button";

type Props = {
  open: boolean;
  onToggle: () => void;
};

type Tab = {
  id: string;
  terminalId: string;
  label: string;
};

export function TerminalDrawer({ open, onToggle }: Props) {
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
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }, [desktopApi, tabs.length]);

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
      className={`shrink-0 overflow-hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      style={{
        height: visibleHeight,
        opacity: open ? 1 : 0,
        transition: isResizing
          ? "none"
          : "height 240ms linear, opacity 180ms ease-out",
      }}
    >
      <div className="relative flex h-full flex-col bg-shell-terminal">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 z-20 h-3 cursor-ns-resize bg-transparent"
          onMouseDown={handleMouseDown}
        />

        {/* Zed-like Header */}
        <div className="flex min-w-0 items-center justify-between border-b border-shell-border bg-black/[0.03] pr-2">
          <div className="flex min-w-0 flex-1 flex-nowrap items-end gap-1 overflow-x-auto overflow-y-hidden pt-1.5 pl-2 whitespace-nowrap [&::-webkit-scrollbar]:h-[3px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-black/20 [&::-webkit-scrollbar-track]:bg-transparent">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTabId(tab.id)}
                className={`group relative -mb-px flex shrink-0 items-center gap-2 rounded-t-[6px] border border-b-0 px-3 py-1 text-[11px] font-medium transition-colors ${
                  tab.id === activeTabId
                    ? "z-10 border-shell-border bg-[#f8f9fc] text-foreground shadow-[0_-2px_6px_rgba(0,0,0,0.06)]"
                    : "border-transparent text-muted-foreground hover:bg-black/5 hover:text-foreground/80"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <CommandLineIcon className="h-3.5 w-3.5 text-muted-foreground/70" />
                  <span className="truncate max-w-[120px] text-foreground/90">
                    {tab.label}
                  </span>
                  <span className="text-[10px] font-normal text-muted-foreground/50">
                    — pwsh
                  </span>
                </span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    void closeTab(tab.id);
                    if (tabs.length <= 1 && open) onToggle();
                  }}
                  className={`rounded p-0.5 hover:bg-black/10 ${tab.id === activeTabId ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                >
                  <XMarkIcon className="h-3 w-3" />
                </span>
              </button>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1 pb-0.5 pl-2 text-muted-foreground/50">
            <button
              type="button"
              onClick={() => void createTab()}
              className="rounded-md p-1 transition hover:bg-black/5 hover:text-foreground"
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
              className="rounded-md p-1 transition hover:bg-black/5 hover:text-foreground"
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
