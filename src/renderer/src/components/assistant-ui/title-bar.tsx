import { ArrowsPointingOutIcon, MinusIcon, RectangleStackIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";

type TitleBarProps = {
  isMaximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
};

export function TitleBar({
  isMaximized,
  onMinimize,
  onToggleMaximize,
  onClose,
  sidebarCollapsed = false,
  onToggleSidebar,
}: TitleBarProps) {
  return (
    <header
      className="app-drag flex h-10 items-center bg-transparent pl-4 pr-1 text-[11px] text-[color:var(--color-text-secondary)]"
      onDoubleClick={onToggleMaximize}
    >
      <div className="no-drag mr-2 flex items-center" onDoubleClick={(event) => event.stopPropagation()}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleSidebar}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[10px] text-[color:var(--chela-text-tertiary)] transition hover:bg-[color:var(--color-control-bg-hover)] hover:text-[color:var(--chela-text-primary)]"
              aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-3.5 w-3.5" strokeWidth={1.9} />
              ) : (
                <PanelLeftClose className="h-3.5 w-3.5" strokeWidth={1.9} />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">切换侧栏 Ctrl+B</TooltipContent>
        </Tooltip>
      </div>
      <div className="app-drag flex-1" />
      <div className="no-drag flex" onDoubleClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={onMinimize} className="titlebar-control h-8 w-8 rounded-[var(--radius-shell)] hover:bg-shell-hover hover:text-foreground" title="最小化" aria-label="最小化">
          <MinusIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggleMaximize}
          className="titlebar-control h-8 w-8 rounded-[var(--radius-shell)] hover:bg-shell-hover hover:text-foreground"
          title={isMaximized ? "还原" : "最大化"}
          aria-label={isMaximized ? "还原" : "最大化"}
        >
          {isMaximized ? <RectangleStackIcon className="h-4 w-4" /> : <ArrowsPointingOutIcon className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="titlebar-control h-8 w-8 rounded-[var(--radius-shell)] hover:bg-destructive hover:text-destructive-foreground"
          title="关闭"
          aria-label="关闭"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
