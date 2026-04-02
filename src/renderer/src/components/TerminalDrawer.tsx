import { useCallback, useEffect, useRef, useState } from "react";
import { XMarkIcon, PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/react";
import { TerminalTab } from "./TerminalTab";

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
  const [drawerHeight, setDrawerHeight] = useState(280);
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

  const closeTab = useCallback(async (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (tab && desktopApi) {
      await desktopApi.terminal.destroy(tab.terminalId);
    }
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    setActiveTabId((prev) => {
      if (prev === tabId) {
        const remaining = tabs.filter((t) => t.id !== tabId);
        return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      }
      return prev;
    });
  }, [tabs, desktopApi]);

  // Auto-create first tab when opened
  useEffect(() => {
    if (open && tabs.length === 0) {
      void createTab();
    }
  }, [open, tabs.length, createTab]);

  // Drag to resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: drawerHeight };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      const newHeight = Math.max(150, Math.min(600, dragRef.current.startHeight + delta));
      setDrawerHeight(newHeight);
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [drawerHeight]);

  if (!open) return null;

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div
      className="flex flex-col border-t border-shell-border bg-shell-terminal"
      style={{ height: drawerHeight }}
    >
      {/* Resize handle */}
      <div
        className="h-1 cursor-ns-resize bg-transparent transition hover:bg-shell-toolbar-hover"
        onMouseDown={handleMouseDown}
      />

      {/* Tab bar */}
      <div className="flex items-center border-b border-shell-border px-3 py-1.5">
        <div className="flex flex-1 items-center gap-0.5 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              className={`group flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs transition ${
                tab.id === activeTabId
                  ? "bg-shell-panel text-foreground shadow-sm ring-1 ring-shell-border"
                  : "text-muted-foreground hover:bg-shell-hover hover:text-foreground"
              }`}
            >
              <span>{tab.label}</span>
              <span
                onClick={(e) => { e.stopPropagation(); void closeTab(tab.id); }}
                className="rounded p-0.5 opacity-0 transition group-hover:opacity-100 hover:bg-black/10"
              >
                <XMarkIcon className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Button
            isIconOnly
            variant="ghost"
            onClick={() => void createTab()}
            className="h-7 min-w-7 rounded-md p-0 text-muted-foreground"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </Button>
          <Button
            isIconOnly
            variant="ghost"
            onClick={onToggle}
            className="h-7 min-w-7 rounded-md p-0 text-muted-foreground"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Terminal content */}
      <div className="relative flex-1 overflow-hidden">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`absolute inset-0 ${tab.id === activeTabId ? "block" : "hidden"}`}
          >
            <TerminalTab terminalId={tab.terminalId} visible={tab.id === activeTabId} />
          </div>
        ))}

        {tabs.length === 0 && (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            暂无终端
          </div>
        )}
      </div>
    </div>
  );
}
