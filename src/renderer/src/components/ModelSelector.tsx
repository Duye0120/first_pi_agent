import { useEffect, useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import type { AvailableModel, ModelSelection, ThinkingLevel } from "@shared/contracts";

type Props = {
  currentModel: ModelSelection;
  thinkingLevel: ThinkingLevel;
  onModelChange: (model: ModelSelection) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
};

const THINKING_LEVELS: { value: ThinkingLevel; label: string }[] = [
  { value: "off", label: "关闭" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
];

function modelLabel(m: ModelSelection): string {
  const parts = m.model.split("/").pop() ?? m.model;
  // Clean up common suffixes for display
  return parts
    .replace(/-\d{8}$/, "")
    .replace("claude-", "Claude ")
    .replace("gpt-", "GPT-")
    .replace("sonnet", "Sonnet")
    .replace("opus", "Opus")
    .replace("haiku", "Haiku");
}

export function ModelSelector({ currentModel, thinkingLevel, onModelChange, onThinkingLevelChange }: Props) {
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [modelOpen, setModelOpen] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(false);

  useEffect(() => {
    void window.desktopApi?.models.listAvailable().then((list) => {
      if (list && list.length > 0) setModels(list);
    });
  }, []);

  return (
    <div className="flex items-center gap-1.5">
      {/* Model selector */}
      <div className="relative">
        <button
          type="button"
          onClick={() => { setModelOpen(!modelOpen); setThinkingOpen(false); }}
          className="status-pill inline-flex items-center gap-1"
        >
          {modelLabel(currentModel)}
          <ChevronDownIcon className="h-3 w-3" />
        </button>

        {modelOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setModelOpen(false)} />
            <div className="absolute bottom-full left-0 z-50 mb-1 min-w-[200px] rounded-lg border border-black/8 bg-white py-1 shadow-lg">
              {models.length > 0 ? (
                models.map((m) => (
                  <button
                    key={`${m.provider}/${m.model}`}
                    type="button"
                    onClick={() => {
                      onModelChange({ provider: m.provider, model: m.model });
                      setModelOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition hover:bg-black/4 ${
                      m.provider === currentModel.provider && m.model === currentModel.model
                        ? "text-accent-500 font-medium"
                        : "text-shell-300"
                    } ${!m.available ? "opacity-50" : ""}`}
                    disabled={!m.available}
                  >
                    <span className="flex-1 truncate">{m.label}</span>
                    {!m.available && <span className="text-[10px] text-shell-500">需配置 Key</span>}
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-[12px] text-shell-500">
                  <p>暂无可用模型</p>
                  <p className="mt-1">请先在设置中配置 API Key</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Thinking level selector */}
      <div className="relative">
        <button
          type="button"
          onClick={() => { setThinkingOpen(!thinkingOpen); setModelOpen(false); }}
          className="status-pill inline-flex items-center gap-1"
        >
          思考: {THINKING_LEVELS.find((l) => l.value === thinkingLevel)?.label ?? "关闭"}
          <ChevronDownIcon className="h-3 w-3" />
        </button>

        {thinkingOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setThinkingOpen(false)} />
            <div className="absolute bottom-full left-0 z-50 mb-1 min-w-[120px] rounded-lg border border-black/8 bg-white py-1 shadow-lg">
              {THINKING_LEVELS.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  onClick={() => {
                    onThinkingLevelChange(level.value);
                    setThinkingOpen(false);
                  }}
                  className={`flex w-full items-center px-3 py-2 text-left text-[12px] transition hover:bg-black/4 ${
                    level.value === thinkingLevel ? "text-accent-500 font-medium" : "text-shell-300"
                  }`}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
