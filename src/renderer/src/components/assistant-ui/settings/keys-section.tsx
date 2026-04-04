import type {
  CredentialTestResult,
  CredentialsSafe,
} from "@shared/contracts";
import { ExclamationCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@renderer/components/assistant-ui/button";
import { PROVIDERS } from "./constants";
import { FieldInput, SettingsCard, StatusBadge } from "./shared";

export function KeysSection({
  credentials,
  editingProvider,
  editingKey,
  testResult,
  testingProvider,
  setEditingProvider,
  setEditingKey,
  setTestResult,
  onSaveKey,
  onDeleteKey,
}: {
  credentials: CredentialsSafe;
  editingProvider: string | null;
  editingKey: string;
  testResult: CredentialTestResult | null;
  testingProvider: string | null;
  setEditingProvider: (provider: string | null) => void;
  setEditingKey: (value: string) => void;
  setTestResult: (result: CredentialTestResult | null) => void;
  onSaveKey: (provider: string) => Promise<void>;
  onDeleteKey: (provider: string) => Promise<void>;
}) {
  return (
    <SettingsCard
      title="API Keys"
      description="密钥会保存在本地，不会直接展示明文。保存前会先做一次轻量验证。"
    >
      <div className="space-y-4 px-6 py-5">
        {PROVIDERS.map((provider) => {
          const cred = credentials[provider.id];
          const isEditing = editingProvider === provider.id;
          const isTesting = testingProvider === provider.id;
          const providerResult =
            testResult && editingProvider === provider.id ? testResult : null;

          return (
            <div
              key={provider.id}
              className="rounded-[var(--radius-shell)] border border-shell-border bg-shell-panel-muted px-4 py-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14px] font-semibold text-foreground">
                      {provider.label}
                    </h3>
                    {cred?.hasKey ? (
                      <StatusBadge ok text="已配置" />
                    ) : (
                      <StatusBadge ok={false} text="未配置" />
                    )}
                  </div>
                  {cred?.hasKey ? (
                    <p className="mt-2 font-mono text-[12px] text-muted-foreground">
                      {cred.masked}
                    </p>
                  ) : (
                    <p className="mt-2 text-[12px] text-muted-foreground">
                      还没有配置 {provider.label} 的 API Key。
                    </p>
                  )}
                </div>

                {!isEditing ? (
                  <div className="flex items-center gap-2">
                    {cred?.hasKey ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void onDeleteKey(provider.id)}
                        className="h-8 rounded-[var(--radius-shell)] px-3 text-[12px] text-red-500 hover:bg-red-50"
                      >
                        删除
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditingProvider(provider.id);
                        setEditingKey("");
                        setTestResult(null);
                      }}
                      className="h-8 rounded-[var(--radius-shell)] border border-shell-border bg-shell-panel-contrast px-3 text-[12px]"
                    >
                      {cred?.hasKey ? "更换" : "配置"}
                    </Button>
                  </div>
                ) : null}
              </div>

              {isEditing ? (
                <div className="mt-4 space-y-3">
                  <FieldInput
                    type="password"
                    value={editingKey}
                    onChange={(event) => setEditingKey(event.target.value)}
                    placeholder={provider.placeholder}
                    mono
                    autoFocus
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void onSaveKey(provider.id);
                      }
                      if (event.key === "Escape") {
                        setEditingProvider(null);
                        setEditingKey("");
                        setTestResult(null);
                      }
                    }}
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      onClick={() => void onSaveKey(provider.id)}
                      disabled={isTesting || !editingKey.trim()}
                      className="h-8 rounded-[var(--radius-shell)] bg-foreground px-4 text-[12px] text-background hover:bg-foreground/90"
                    >
                      {isTesting ? "验证中…" : "验证并保存"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setEditingProvider(null);
                        setEditingKey("");
                        setTestResult(null);
                      }}
                      className="h-8 rounded-[var(--radius-shell)] px-3 text-[12px] text-muted-foreground"
                    >
                      取消
                    </Button>
                    {providerResult && !providerResult.success ? (
                      <span className="inline-flex items-center gap-1 text-[12px] text-red-500">
                        <ExclamationCircleIcon className="h-4 w-4" />
                        {providerResult.error ?? "验证失败"}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </SettingsCard>
  );
}
