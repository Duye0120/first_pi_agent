import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AvailableModel,
  CredentialTestResult,
  CredentialsSafe,
  SoulFilesStatus,
} from "@shared/contracts";
import {
  fallbackModelLabel,
  getModelValue,
  SECTION_META,
} from "./settings/constants";
import { AboutSection } from "./settings/about-section";
import { AppearanceSection } from "./settings/appearance-section";
import { ArchivedSection } from "./settings/archived-section";
import { GeneralSection } from "./settings/general-section";
import { KeysSection } from "./settings/keys-section";
import { TerminalSection } from "./settings/terminal-section";
import type { SettingsViewProps } from "./settings/types";
import { WorkspaceSection } from "./settings/workspace-section";

export type { SettingsSection, SettingsViewProps } from "./settings/types";
export { SETTINGS_SECTIONS } from "./settings/constants";

export function SettingsView({
  activeSection,
  settings,
  currentModel,
  thinkingLevel,
  onModelChange,
  onThinkingLevelChange,
  onSettingsChange,
  archivedSummaries,
  onOpenArchivedSession,
  onUnarchiveSession,
  onDeleteSession,
}: SettingsViewProps) {
  const desktopApi = window.desktopApi;
  const [credentials, setCredentials] = useState<CredentialsSafe>({});
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [soulStatus, setSoulStatus] = useState<SoulFilesStatus | null>(null);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState("");
  const [testResult, setTestResult] = useState<CredentialTestResult | null>(
    null,
  );
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  const loadCredentials = useCallback(async () => {
    if (!desktopApi) return;
    const nextCredentials = await desktopApi.credentials.get();
    setCredentials(nextCredentials);
  }, [desktopApi]);

  const loadAvailableModels = useCallback(async () => {
    if (!desktopApi) return;
    const models = await desktopApi.models.listAvailable();
    setAvailableModels(models);
  }, [desktopApi]);

  const loadSoulStatus = useCallback(async () => {
    if (!desktopApi) return;
    const status = await desktopApi.workspace.getSoul();
    setSoulStatus(status);
  }, [desktopApi]);

  useEffect(() => {
    if (activeSection === "keys") {
      void loadCredentials();
      setEditingProvider(null);
      setEditingKey("");
      setTestResult(null);
      setTestingProvider(null);
    }
  }, [activeSection, loadCredentials]);

  useEffect(() => {
    if (activeSection === "general") {
      void loadAvailableModels();
    }
    if (activeSection === "workspace") {
      void loadSoulStatus();
    }
  }, [activeSection, loadAvailableModels, loadSoulStatus]);

  const modelOptions = useMemo(() => {
    const nextOptions = availableModels.map((model) => ({
      value: getModelValue(model),
      label: model.available ? model.label : `${model.label}（需配置 Key）`,
      disabled: !model.available,
    }));

    const currentValue = getModelValue(currentModel);
    if (!nextOptions.some((option) => option.value === currentValue)) {
      nextOptions.unshift({
        value: currentValue,
        label: fallbackModelLabel(currentModel),
        disabled: false,
      });
    }

    return nextOptions;
  }, [availableModels, currentModel]);

  const handleSaveKey = useCallback(
    async (provider: string) => {
      if (!desktopApi || !editingKey.trim()) return;

      setTestingProvider(provider);
      setTestResult(null);

      try {
        const result = await desktopApi.credentials.test(provider, editingKey);
        setTestResult(result);

        if (!result.success) {
          return;
        }

        await desktopApi.credentials.set(provider, editingKey);
        await Promise.all([loadCredentials(), loadAvailableModels()]);
        setEditingProvider(null);
        setEditingKey("");
      } catch {
        setTestResult({ success: false, error: "测试请求失败" });
      } finally {
        setTestingProvider(null);
      }
    },
    [desktopApi, editingKey, loadAvailableModels, loadCredentials],
  );

  const handleDeleteKey = useCallback(
    async (provider: string) => {
      if (!desktopApi) return;
      await desktopApi.credentials.delete(provider);
      await Promise.all([loadCredentials(), loadAvailableModels()]);
    },
    [desktopApi, loadAvailableModels, loadCredentials],
  );

  if (!settings) {
    return (
      <div className="grid h-full place-items-center bg-shell-panel px-6 text-sm text-muted-foreground">
        正在加载设置…
      </div>
    );
  }

  const meta = SECTION_META[activeSection];

  return (
    <div className="flex h-full flex-col bg-shell-panel">
      <div className="flex-1 overflow-y-auto px-8 pb-10 pt-4">
        <div className="mx-auto w-full max-w-[56rem]">
          <header className="mb-6">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Settings
            </p>
            <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.02em] text-foreground">
              {meta.label}
            </h1>
            <p className="mt-2 max-w-[640px] text-[13px] leading-6 text-muted-foreground">
              {meta.description}
            </p>
          </header>

          <div className="space-y-3">
            {activeSection === "general" ? (
              <GeneralSection
                currentModel={currentModel}
                thinkingLevel={thinkingLevel}
                modelOptions={modelOptions}
                onModelChange={onModelChange}
                onThinkingLevelChange={onThinkingLevelChange}
              />
            ) : null}

            {activeSection === "keys" ? (
              <KeysSection
                credentials={credentials}
                editingProvider={editingProvider}
                editingKey={editingKey}
                testResult={testResult}
                testingProvider={testingProvider}
                setEditingProvider={setEditingProvider}
                setEditingKey={setEditingKey}
                setTestResult={setTestResult}
                onSaveKey={handleSaveKey}
                onDeleteKey={handleDeleteKey}
              />
            ) : null}

            {activeSection === "appearance" ? (
              <AppearanceSection
                settings={settings}
                onSettingsChange={onSettingsChange}
              />
            ) : null}

            {activeSection === "terminal" ? (
              <TerminalSection
                settings={settings}
                onSettingsChange={onSettingsChange}
              />
            ) : null}

            {activeSection === "workspace" ? (
              <WorkspaceSection settings={settings} soulStatus={soulStatus} />
            ) : null}

            {activeSection === "archived" ? (
              <ArchivedSection
                archivedSummaries={archivedSummaries}
                onOpenArchivedSession={onOpenArchivedSession}
                onUnarchiveSession={onUnarchiveSession}
                onDeleteSession={onDeleteSession}
              />
            ) : null}

            {activeSection === "about" ? <AboutSection /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
