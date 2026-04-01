import { useCallback, useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { XMarkIcon, KeyIcon, InformationCircleIcon, CheckCircleIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";
import type { CredentialsSafe, CredentialTestResult } from "@shared/contracts";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Tab = "keys" | "about";

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { id: "openai", label: "OpenAI", placeholder: "sk-..." },
  { id: "google", label: "Google", placeholder: "AIza..." },
];

export function SettingsModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("keys");
  const [credentials, setCredentials] = useState<CredentialsSafe>({});
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState("");
  const [testResult, setTestResult] = useState<CredentialTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const desktopApi = window.desktopApi;

  const loadCredentials = useCallback(async () => {
    if (!desktopApi) return;
    const creds = await desktopApi.credentials.get();
    setCredentials(creds);
  }, [desktopApi]);

  useEffect(() => {
    if (open) {
      void loadCredentials();
      setEditingProvider(null);
      setTestResult(null);
    }
  }, [open, loadCredentials]);

  const handleSaveKey = async (provider: string) => {
    if (!desktopApi || !editingKey.trim()) return;
    setTesting(true);
    setTestResult(null);

    try {
      const result = await desktopApi.credentials.test(provider, editingKey.trim());
      setTestResult(result);

      if (result.success) {
        await desktopApi.credentials.set(provider, editingKey.trim());
        await loadCredentials();
        setEditingProvider(null);
        setEditingKey("");
      }
    } catch {
      setTestResult({ success: false, error: "测试请求失败" });
    } finally {
      setTesting(false);
    }
  };

  const handleDeleteKey = async (provider: string) => {
    if (!desktopApi) return;
    await desktopApi.credentials.delete(provider);
    await loadCredentials();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-2xl border border-black/8 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/6 px-6 py-4">
          <h2 className="text-lg font-semibold text-shell-100">设置</h2>
          <Button isIconOnly variant="ghost" onClick={onClose} className="h-8 min-w-8 rounded-lg">
            <XMarkIcon className="h-5 w-5" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-black/6 px-6">
          {([
            { id: "keys" as Tab, label: "API Keys", icon: KeyIcon },
            { id: "about" as Tab, label: "关于", icon: InformationCircleIcon },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition ${
                tab === id
                  ? "border-accent-500 text-accent-500"
                  : "border-transparent text-shell-400 hover:text-shell-200"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {tab === "keys" && (
            <div className="space-y-4">
              <p className="text-xs text-shell-500">
                API Key 安全存储在本地，不会发送到任何第三方服务。
              </p>

              {PROVIDERS.map((provider) => {
                const cred = credentials[provider.id];
                const isEditing = editingProvider === provider.id;

                return (
                  <div key={provider.id} className="rounded-lg border border-black/6 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-shell-200">{provider.label}</span>
                        {cred?.hasKey && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-700">
                            <CheckCircleIcon className="h-3 w-3" />
                            已配置
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {cred?.hasKey && !isEditing && (
                          <>
                            <span className="font-mono text-xs text-shell-500">{cred.masked}</span>
                            <Button
                              variant="ghost"
                              onClick={() => void handleDeleteKey(provider.id)}
                              className="h-7 min-w-0 px-2 text-xs text-red-500 hover:bg-red-50"
                            >
                              删除
                            </Button>
                          </>
                        )}
                        {!isEditing && (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setEditingProvider(provider.id);
                              setEditingKey("");
                              setTestResult(null);
                            }}
                            className="h-7 min-w-0 px-2 text-xs text-accent-500"
                          >
                            {cred?.hasKey ? "更换" : "配置"}
                          </Button>
                        )}
                      </div>
                    </div>

                    {isEditing && (
                      <div className="mt-3 space-y-2">
                        <input
                          type="password"
                          value={editingKey}
                          onChange={(e) => setEditingKey(e.target.value)}
                          placeholder={provider.placeholder}
                          className="w-full rounded-lg border border-black/8 bg-white px-3 py-2 font-mono text-sm text-shell-200 outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400/25"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleSaveKey(provider.id);
                            if (e.key === "Escape") { setEditingProvider(null); setTestResult(null); }
                          }}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => void handleSaveKey(provider.id)}
                            isDisabled={testing || !editingKey.trim()}
                            className="h-8 rounded-lg bg-accent-500 px-4 text-xs text-white hover:bg-accent-hover disabled:opacity-50"
                          >
                            {testing ? "验证中…" : "验证并保存"}
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => { setEditingProvider(null); setTestResult(null); }}
                            className="h-8 min-w-0 px-3 text-xs text-shell-400"
                          >
                            取消
                          </Button>
                          {testResult && !testResult.success && (
                            <span className="inline-flex items-center gap-1 text-xs text-red-500">
                              <ExclamationCircleIcon className="h-3.5 w-3.5" />
                              {testResult.error ?? "验证失败"}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === "about" && (
            <div className="space-y-4 text-sm text-shell-300">
              <div>
                <h3 className="font-medium text-shell-200">Pi Desktop Agent</h3>
                <p className="mt-1 text-xs text-shell-500">v1.0.0-dev</p>
              </div>
              <p>
                本地优先的 AI Agent 工作台。所有数据存储在本地，API Key 安全加密存储。
              </p>
              <div className="rounded-lg bg-[var(--color-bg-shell)] p-3 text-xs text-shell-400">
                <p>Engine: pi-agent-core</p>
                <p>Runtime: Electron</p>
                <p>UI: React 19 + Tailwind CSS 4</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
