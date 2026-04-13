import { memo, useCallback, useMemo } from "react";
import {
  Cog6ToothIcon,
  CommandLineIcon,
  RectangleGroupIcon,
} from "@heroicons/react/24/outline";
import {
  MessageSquareIcon,
  Settings2Icon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  TerminalIcon,
  GitBranchIcon,
} from "lucide-react";

type IconSidebarProps = {
  activeView: "chat" | "settings";
  onViewChange: (view: "chat" | "settings") => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  connected: boolean;
  version?: string;
  terminalOpen?: boolean;
  onToggleTerminal?: () => void;
  diffPanelOpen?: boolean;
  onToggleDiffPanel?: () => void;
};

type NavItemDef = {
  id: string;
  label: string;
  iconCollapsed: React.ComponentType<{ className?: string }>;
  iconExpanded?: React.ComponentType<{ className?: string }>;
};

function IconSidebarImpl({
  activeView,
  onViewChange,
  collapsed,
  onToggleCollapsed,
  connected,
  version,
  terminalOpen,
  onToggleTerminal,
  diffPanelOpen,
  onToggleDiffPanel,
}: IconSidebarProps) {
  const navItems = useMemo<NavItemDef[]>(() => {
    const items: NavItemDef[] = [
      {
        id: "chat",
        label: "聊天",
        iconCollapsed: MessageSquareIcon,
        iconExpanded: MessageSquareIcon,
      },
    ];

    if (onToggleTerminal) {
      items.push({
        id: "terminal",
        label: "终端",
        iconCollapsed: TerminalIcon,
        iconExpanded: TerminalIcon,
      });
    }

    if (onToggleDiffPanel) {
      items.push({
        id: "diff",
        label: "Diff",
        iconCollapsed: GitBranchIcon,
        iconExpanded: GitBranchIcon,
      });
    }

    items.push({
      id: "settings",
      label: "设置",
      iconCollapsed: Settings2Icon,
      iconExpanded: Cog6ToothIcon,
    });

    return items;
  }, [onToggleTerminal, onToggleDiffPanel]);

  const handleNavClick = useCallback(
    (id: string) => {
      if (id === "terminal") {
        onToggleTerminal?.();
        return;
      }
      if (id === "diff") {
        onToggleDiffPanel?.();
        return;
      }
      onViewChange(id as "chat" | "settings");
    },
    [onViewChange, onToggleTerminal, onToggleDiffPanel],
  );

  const isActiveNav = useCallback(
    (id: string) => {
      if (id === "chat") return activeView === "chat";
      if (id === "settings") return activeView === "settings";
      if (id === "terminal") return terminalOpen;
      if (id === "diff") return diffPanelOpen;
      return false;
    },
    [activeView, terminalOpen, diffPanelOpen],
  );

  return (
    <aside
      className="chela-icon-sidebar flex h-full flex-col border-r border-[color:var(--chela-border)] bg-[color:var(--chela-bg-iconbar)]"
      style={{
        width: collapsed ? "64px" : "240px",
        transition: "width 250ms cubic-bezier(0.2, 0, 0, 1)",
      }}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-4">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--chela-accent)] text-[11px] font-bold text-white">
          C
        </div>
        <span
          className="text-base font-semibold tracking-tight text-[color:var(--chela-text-primary)] transition-opacity duration-200"
          style={{
            opacity: collapsed ? 0 : 1,
            width: collapsed ? 0 : "auto",
            overflow: "hidden",
          }}
        >
          Chela
        </span>
      </div>

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="mx-2 mb-2 flex h-8 w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md px-2 text-xs text-[color:var(--chela-text-secondary)] transition-colors hover:bg-[color:var(--chela-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
      >
        {collapsed ? (
          <PanelLeftOpenIcon className="size-4" />
        ) : (
          <PanelLeftCloseIcon className="size-4" />
        )}
        {!collapsed && <span className="text-[11px]">收起导航</span>}
      </button>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 px-2">
        {navItems.map((item) => {
          const IconComp = isActiveNav(item.id)
            ? item.iconExpanded || item.iconCollapsed
            : item.iconCollapsed;
          const active = isActiveNav(item.id);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`chela-icon-sidebar-nav-item group flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors ${
                active
                  ? "bg-[color:var(--chela-accent-subtle)] font-medium text-[color:var(--chela-accent)]"
                  : "text-[color:var(--chela-text-secondary)] hover:bg-[color:var(--chela-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <IconComp className="size-[18px] shrink-0" />
              <span
                className="truncate transition-opacity duration-200"
                style={{
                  opacity: collapsed ? 0 : 1,
                  width: collapsed ? 0 : "auto",
                  overflow: "hidden",
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer */}
      <div className="border-t border-[color:var(--chela-border)] px-3 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`size-2 shrink-0 rounded-full transition-colors ${
              connected
                ? "bg-[color:var(--chela-success)] shadow-[0_0_6px_rgba(46,125,50,0.5)]"
                : "bg-[color:var(--chela-error)]"
            }`}
          />
          <span
            className="text-[11px] text-[color:var(--chela-text-secondary)] transition-opacity duration-200"
            style={{
              opacity: collapsed ? 0 : 1,
              width: collapsed ? 0 : "auto",
              overflow: "hidden",
            }}
          >
            {connected ? "已连接" : "未连接"}
          </span>
        </div>
        {version && (
          <div
            className="mt-1 text-[10px] text-[color:var(--chela-text-muted)] transition-opacity duration-200"
            style={{
              opacity: collapsed ? 0 : 1,
              width: collapsed ? 0 : "auto",
              overflow: "hidden",
            }}
          >
            Chela {version}
          </div>
        )}
      </div>
    </aside>
  );
}

export const IconSidebar = memo(IconSidebarImpl);
