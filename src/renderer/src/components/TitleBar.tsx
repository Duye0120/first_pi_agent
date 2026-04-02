import { ArrowsPointingOutIcon, MinusIcon, RectangleStackIcon, SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";

type TitleBarProps = {
  isMaximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
};

export function TitleBar({ isMaximized, onMinimize, onToggleMaximize, onClose }: TitleBarProps) {
  return (
    <header className="app-drag flex h-8 items-center border-b border-black/5 bg-[#f3f3f1] px-3 text-[11px] text-gray-400">
      <div className="no-drag flex items-center gap-2">
        <div className="grid h-4 w-4 place-items-center rounded bg-white text-gray-500 shadow-[0_0_0_1px_rgba(0,0,0,0.06)]">
          <SparklesIcon className="h-2.5 w-2.5" />
        </div>
        <nav className="flex items-center gap-4">
          <span>File</span>
          <span>Edit</span>
          <span>View</span>
          <span>Window</span>
          <span>Help</span>
        </nav>
      </div>
      <div className="app-drag flex-1" />
      <div className="no-drag flex">
        <button type="button" onClick={onMinimize} className="titlebar-control h-8 w-8 hover:text-gray-700" title="最小化" aria-label="最小化">
          <MinusIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggleMaximize}
          className="titlebar-control h-8 w-8 hover:text-gray-700"
          title={isMaximized ? "还原" : "最大化"}
          aria-label={isMaximized ? "还原" : "最大化"}
        >
          {isMaximized ? <RectangleStackIcon className="h-4 w-4" /> : <ArrowsPointingOutIcon className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="titlebar-control h-8 w-8 hover:bg-rose-500 hover:text-white"
          title="关闭"
          aria-label="关闭"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
