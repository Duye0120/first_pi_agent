import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BotIcon } from "lucide-react";
import type { ModelEntry, ProviderSource, SoulFilesStatus } from "@shared/contracts";
import { resolveConfiguredTimeZone } from "@shared/timezone";
import {
  buildSelectableModelOptions,
  findEntryLabel,
  loadProviderDirectory,
  type ProviderDirectorySnapshot,
  subscribeProviderDirectoryChanged,
} from "@renderer/lib/provider-directory";
import type { ModelOption } from "@renderer/components/assistant-ui/model-selector";
import {
  canConfigureThinking,
  getEffectiveThinkingLevel,
  getThinkingHint,
  getThinkingOptionsForModel,
  normalizeThinkingLevel,
} from "@renderer/lib/thinking-levels";
import { SECTION_META } from "./settings/constants";
import { AiModelSection } from "./settings/ai-model-section";
import { InterfaceSection } from "./settings/interface-section";
import { SystemSection } from "./settings/system-section";
import { GeneralSection } from "./settings/general-section";
import { NetworkSection } from "./settings/network-section";
import { McpSection } from "./settings/mcp-section";
import type { SettingsViewProps } from "./settings/types";
import { MemorySection } from "./settings/memory-section";
import { PluginsSection } from "./settings/plugins-section";
import { SkillsSection } from "./settings/skills-section";
import { ArchivedSection } from "./settings/archived-section";
import { WorkspaceSection } from "./settings/workspace-section";

export type { SettingsSection, SettingsViewProps } from "./settings/types";
export { SETTINGS_SECTIONS } from "./settings/constants";

function SettingsViewImpl({
  activeSection,
  settings,
  currentModelId,
  thinkingLevel,
  onModelChange,
  onRoleModelChange,
  onThinkingLevelChange,
  onSettingsChange,
  groups,
  liveSummaries,
  archivedSummaries,
  onCreateProject,
  onOpenArchivedSession,
  onUnarchiveSession,
  onDeleteSession,
}: SettingsViewProps) {
  const desktopApi = window.desktopApi;
  const [sources, setSources] = useState<ProviderSource[]>([]);
  const [entries, setEntries] = useState<ModelEntry[]>([]);
  const [directoryStatus, setDirectoryStatus] =
    useState<Pick<ProviderDirectorySnapshot, "loadedAt" | "stale" | "error"> | null>(null);
  const [soulStatus, setSoulStatus] = useState<SoulFilesStatus | null>(null);
  const directoryLoadedRef = useRef(false);

  const loadDirectory = useCallback(async (force = false) => {
    if (!desktopApi || (directoryLoadedRef.current && !force)) return;
    try {
      const nextDirectory = await loadProviderDirectory(desktopApi, { force });
      setSources(nextDirectory.sources);
      setEntries(nextDirectory.entries);
      setDirectoryStatus({
        loadedAt: nextDirectory.loadedAt,
        stale: nextDirectory.stale,
        error: nextDirectory.error,
      });
      directoryLoadedRef.current = true;
    } catch (error) {
      setDirectoryStatus({
        loadedAt: Date.now(),
        stale: true,
        error: error instanceof Error ? error.message : "模型目录加载失败",
      });
    }
  }, [desktopApi]);

  const loadSoulStatus = useCallback(async () => {
    if (!desktopApi) return;
    const status = await desktopApi.workspace.getSoul();
    setSoulStatus(status);
  }, [desktopApi]);

  const handleDirectoryChanged = useCallback(() => {
    void loadDirectory(true);
  }, [loadDirectory]);

  useEffect(() => {
    if (activeSection === "ai_model" || activeSection === "general") {
      void loadDirectory();
    }
    if (activeSection === "workspace" && settings?.workspace) {
      void loadSoulStatus();
    }
  }, [activeSection, loadDirectory, loadSoulStatus, settings?.workspace]);

  useEffect(() => subscribeProviderDirectoryChanged(handleDirectoryChanged), [
    handleDirectoryChanged,
  ]);

  const modelOptions = useMemo(() => {
    const nextOptions: ModelOption[] = buildSelectableModelOptions(
      sources,
      entries,
    ).map((option) => ({
      id: option.value,
      name: option.label,
      description: option.description,
      groupId: option.groupId,
      groupLabel: option.groupLabel,
      icon: <BotIcon className="size-4" />,
      disabled: false,
    }));

    return nextOptions;
  }, [currentModelId, entries, sources]);

  const currentModelEntry = useMemo(
    () => entries.find((entry) => entry.id === currentModelId) ?? null,
    [currentModelId, entries],
  );
  const normalizedThinkingLevel = normalizeThinkingLevel(thinkingLevel);
  const effectiveThinkingLevel = getEffectiveThinkingLevel(
    currentModelEntry,
    normalizedThinkingLevel,
  );
  const thinkingOptions = useMemo(
    () => getThinkingOptionsForModel(currentModelEntry, effectiveThinkingLevel),
    [currentModelEntry, effectiveThinkingLevel],
  );
  const thinkingEnabled = canConfigureThinking(currentModelEntry);
  const thinkingHint = getThinkingHint(currentModelEntry);

  if (!settings) {
    return (
      <div className="grid h-full place-items-center bg-transparent px-6 text-sm text-muted-foreground">
        正在加载设置…
      </div>
    );
  }

  const resolvedTimeZone = resolveConfiguredTimeZone(settings.timeZone);
  const meta = SECTION_META[activeSection];

  return (
    <div className="flex h-full flex-col bg-transparent">
      <div className="flex-1 overflow-y-auto px-8 pb-12 pt-5">
        <div className="mx-auto h-full w-full max-w-[58rem]">
          <header className="mb-7">
            <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-foreground">
              {meta.label}
            </h1>
            <p className="mt-2.5 max-w-[680px] text-[13px] leading-6 text-muted-foreground">
              {meta.description}
            </p>
            {(activeSection === "ai_model" || activeSection === "general") &&
              directoryStatus ? (
              <p
                className={[
                  "mt-3 inline-flex rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-3 py-1.5 text-[12px] leading-5",
                  directoryStatus.stale
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-muted-foreground",
                ].join(" ")}
              >
                {directoryStatus.stale
                  ? `模型目录使用缓存：${directoryStatus.error ?? "刷新失败"}`
                  : `模型目录已同步：${new Date(directoryStatus.loadedAt).toLocaleTimeString()}`}
              </p>
            ) : null}
          </header>

          <div className="space-y-4 pb-8">
            {activeSection === "general" ? (
              <GeneralSection
                settings={settings}
                currentModelId={currentModelId}
                thinkingLevel={effectiveThinkingLevel}
                canConfigureThinking={thinkingEnabled}
                thinkingHint={thinkingHint}
                thinkingOptions={thinkingOptions}
                modelOptions={modelOptions}
                onModelChange={onModelChange}
                onRoleModelChange={onRoleModelChange}
                onThinkingLevelChange={onThinkingLevelChange}
                onSettingsChange={onSettingsChange}
              />
            ) : null}

            {activeSection === "ai_model" ? (
              <AiModelSection
                settings={settings}
                currentModelId={currentModelId}
                thinkingLevel={effectiveThinkingLevel}
                canConfigureThinking={thinkingEnabled}
                thinkingHint={thinkingHint}
                thinkingOptions={thinkingOptions}
                modelOptions={modelOptions}
                onModelChange={onModelChange}
                onThinkingLevelChange={onThinkingLevelChange}
                onSettingsChange={onSettingsChange}
                sources={sources}
                entries={entries}
                onDirectoryChanged={handleDirectoryChanged}
              />
            ) : null}

            {activeSection === "network" ? (
              <NetworkSection
                settings={settings}
                onSettingsChange={onSettingsChange}
              />
            ) : null}

            {activeSection === "interface" ? (
              <InterfaceSection
                settings={settings}
                onSettingsChange={onSettingsChange}
              />
            ) : null}

            {activeSection === "workspace" ? (
              <WorkspaceSection
                settings={settings}
                groups={groups}
                liveSummaries={liveSummaries}
                archivedSummaries={archivedSummaries}
                soulStatus={soulStatus}
                onSettingsChange={onSettingsChange}
                onCreateProject={onCreateProject}
              />
            ) : null}

            {activeSection === "memory" ? (
              <MemorySection
                settings={settings}
                timeZone={resolvedTimeZone}
                modelOptions={modelOptions}
                onSettingsChange={onSettingsChange}
              />
            ) : null}

            {activeSection === "mcp" ? <McpSection /> : null}

            {activeSection === "plugins" ? <PluginsSection /> : null}

            {activeSection === "skills" ? <SkillsSection /> : null}

            {activeSection === "archived" ? (
              <ArchivedSection
                archivedSummaries={archivedSummaries || []}
                timeZone={resolvedTimeZone}
                onOpenArchivedSession={onOpenArchivedSession}
                onUnarchiveSession={onUnarchiveSession}
                onDeleteSession={onDeleteSession}
              />
            ) : null}

            {activeSection === "system" ? (
              <SystemSection timeZone={resolvedTimeZone} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export const SettingsView = memo(SettingsViewImpl);
