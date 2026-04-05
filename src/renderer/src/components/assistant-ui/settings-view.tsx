import { useCallback, useEffect, useMemo, useState } from "react";
import type { ModelEntry, ProviderSource, SoulFilesStatus } from "@shared/contracts";
import { buildSelectableModelOptions, findEntryLabel, loadProviderDirectory } from "@renderer/lib/provider-directory";
import { SECTION_META } from "./settings/constants";
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
  currentModelId,
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
  const [sources, setSources] = useState<ProviderSource[]>([]);
  const [entries, setEntries] = useState<ModelEntry[]>([]);
  const [soulStatus, setSoulStatus] = useState<SoulFilesStatus | null>(null);

  const loadDirectory = useCallback(async () => {
    if (!desktopApi) return;
    const nextDirectory = await loadProviderDirectory(desktopApi);
    setSources(nextDirectory.sources);
    setEntries(nextDirectory.entries);
  }, [desktopApi]);

  const loadSoulStatus = useCallback(async () => {
    if (!desktopApi) return;
    const status = await desktopApi.workspace.getSoul();
    setSoulStatus(status);
  }, [desktopApi]);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    if (activeSection === "general" || activeSection === "keys") {
      void loadDirectory();
    }
    if (activeSection === "workspace") {
      void loadSoulStatus();
    }
  }, [activeSection, loadDirectory, loadSoulStatus]);

  const modelOptions = useMemo(() => {
    const nextOptions = buildSelectableModelOptions(sources, entries).map(
      (option) => ({
        value: option.value,
        label: option.label,
        disabled: false,
      }),
    );

    if (!nextOptions.some((option) => option.value === currentModelId)) {
      nextOptions.unshift({
        value: currentModelId,
        label: findEntryLabel(currentModelId, sources, entries),
        disabled: false,
      });
    }

    return nextOptions;
  }, [currentModelId, entries, sources]);

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
            <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-text-secondary)]">
              设置
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
                currentModelId={currentModelId}
                thinkingLevel={thinkingLevel}
                modelOptions={modelOptions}
                onModelChange={onModelChange}
                onThinkingLevelChange={onThinkingLevelChange}
              />
            ) : null}

            {activeSection === "keys" ? (
              <KeysSection
                currentModelId={currentModelId}
                initialSources={sources}
                initialEntries={entries}
                onDirectoryChanged={loadDirectory}
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
