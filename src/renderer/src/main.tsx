import { Component, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { TooltipProvider } from "@renderer/components/ui/tooltip";
import "./styles.css";

type BoundaryState = {
  hasError: boolean;
  message: string;
};

class RenderErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.stack ?? error.message : String(error),
    };
  }

  override componentDidCatch(error: unknown) {
    console.error("Renderer crashed:", error);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <main className="grid h-screen place-items-center bg-[#f0f0f0] px-6 text-gray-400">
          <div className="max-w-xl rounded-xl border border-rose-400/20 bg-rose-50 px-6 py-4 shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.2em] text-rose-300">Render Crash</p>
            <h1 className="mt-2 text-lg font-medium text-gray-800">界面渲染失败</h1>
            <pre className="mt-2 whitespace-pre-wrap break-all text-xs leading-6 text-gray-500">
              {this.state.message}
            </pre>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <RenderErrorBoundary>
    <HashRouter>
      <TooltipProvider delayDuration={150}>
        <App />
      </TooltipProvider>
    </HashRouter>
  </RenderErrorBoundary>,
);
