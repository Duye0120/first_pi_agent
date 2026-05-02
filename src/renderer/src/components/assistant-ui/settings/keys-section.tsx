import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DownloadCloudIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  SlidersHorizontalIcon,
  Trash2Icon,
} from "lucide-react";
import type {
  ModelEntry,
  ProviderSource,
  ProviderType,
  Settings,
  SourceTestResult,
} from "@shared/contracts";
import { Button } from "@renderer/components/assistant-ui/button";
import { Badge } from "@renderer/components/assistant-ui/badge";
import { Switch } from "@renderer/components/assistant-ui/switch";
import { TooltipIconButton } from "@renderer/components/assistant-ui/tooltip-icon-button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@renderer/components/ui/popover";
import {
  getUnknownModelCapabilities,
  getUnknownModelLimits,
} from "@shared/provider-directory";
import type { ProviderErrorCode } from "@shared/provider-errors";
import {
  notifyProviderDirectoryChanged,
  providerTypeLabel,
  sourceModeLabel,
} from "@renderer/lib/provider-directory";
import { FieldInput, FieldSelect, SettingsCard } from "./shared";
import {
  LOCAL_PROVIDER_PRESETS,
  PROVIDER_TYPE_OPTIONS,
  cloneEditableEntry,
  compareSourceWorkspace,
  createLocalProviderWorkspace,
  createNewCustomWorkspace,
  createWorkspaceMap,
  formatProviderError,
  getDefaultSelectedSourceId,
  getDetectedMetadata,
  getEntryDisplayName,
  getEntryNameHint,
  normalizeCapabilitiesOverride,
  parseProviderOptions,
  serializeEditableEntry,
  serializeWorkspace,
  type EditableEntry,
  type LocalProviderPreset,
  type SourceWorkspace,
} from "./keys-section-model";
import { ModelEntryDialog } from "./keys-section-entry-dialog";

type MeasuredSourceTestResult = SourceTestResult & {
  durationMs: number;
};

export function KeysSection({
  settings,
  currentModelId,
  initialSources,
  initialEntries,
  onDirectoryChanged,
  onModelChange,
}: {
  settings: Settings;
  currentModelId: string;
  initialSources: ProviderSource[];
  initialEntries: ModelEntry[];
  onDirectoryChanged: () => void;
  onModelChange: (modelEntryId: string) => void;
}) {
  const desktopApi = window.desktopApi;
  const [search, setSearch] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(
    getDefaultSelectedSourceId(createWorkspaceMap(initialSources, initialEntries)),
  );
  const [workspaces, setWorkspaces] = useState<Record<string, SourceWorkspace>>(
    () => createWorkspaceMap(initialSources, initialEntries),
  );
  const [loading, setLoading] = useState(initialSources.length === 0);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchModelsResult, setFetchModelsResult] = useState<
    | { kind: "success"; appended: number; total: number }
    | { kind: "error"; message: string; errorCode?: ProviderErrorCode }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<MeasuredSourceTestResult | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingEntrySnapshot, setEditingEntrySnapshot] =
    useState<EditableEntry | null>(null);
  const [deleteSourceConfirmOpen, setDeleteSourceConfirmOpen] = useState(false);
  const hasWorkspacesRef = useRef(Object.keys(workspaces).length > 0);

  useEffect(() => {
    hasWorkspacesRef.current = Object.keys(workspaces).length > 0;
  }, [workspaces]);

  useEffect(() => {
    setFetchModelsResult(null);
  }, [selectedSourceId]);

  const reload = useCallback(
    async (preferredSourceId?: string | null) => {
      if (!desktopApi) return;

      setLoading(!hasWorkspacesRef.current);
      setError(null);

      try {
        const sources = await desktopApi.providers.listSources();
        const credentialsList = await Promise.all(
          sources.map((source) =>
            desktopApi.providers.getCredentials(source.id),
          ),
        );
        const credentialsMap = new Map(
          credentialsList.map((item) => [item.sourceId, item]),
        );
        const allEntries = await desktopApi.models.listEntries();
        const nextWorkspaces = createWorkspaceMap(
          sources,
          allEntries,
          credentialsMap,
        );
        const defaultSourceId = getDefaultSelectedSourceId(nextWorkspaces);

        setWorkspaces(nextWorkspaces);
        setSelectedSourceId((current) => {
          if (preferredSourceId && nextWorkspaces[preferredSourceId]) {
            return preferredSourceId;
          }
          if (
            current &&
            nextWorkspaces[current] &&
            nextWorkspaces[current].sourceDraft.enabled
          ) {
            return current;
          }
          return defaultSourceId;
        });
        setTestResult(null);
        onDirectoryChanged();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "加载失败");
      } finally {
        setLoading(false);
      }
    },
    [desktopApi, onDirectoryChanged],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (Object.keys(workspaces).length > 0 || initialSources.length === 0) {
      return;
    }

    const nextWorkspaces = createWorkspaceMap(initialSources, initialEntries);
    setWorkspaces(nextWorkspaces);
    setSelectedSourceId((current) => {
      if (
        current &&
        nextWorkspaces[current] &&
        nextWorkspaces[current].sourceDraft.enabled
      ) {
        return current;
      }

      return getDefaultSelectedSourceId(nextWorkspaces);
    });
    setLoading(false);
  }, [initialEntries, initialSources, workspaces]);

  useEffect(() => {
    setApiKeyVisible(false);
  }, [selectedSourceId]);

  useEffect(() => {
    setDeleteSourceConfirmOpen(false);
  }, [selectedSourceId]);

  const referencedModelLabels = useMemo(() => {
    const result = new Map<string, string>();
    result.set(settings.modelRouting.chat.modelId, "聊天模型");
    if (settings.modelRouting.utility.modelId) {
      result.set(settings.modelRouting.utility.modelId, "工具模型");
    }
    if (settings.modelRouting.subagent.modelId) {
      result.set(settings.modelRouting.subagent.modelId, "Sub-agent 模型");
    }
    if (settings.modelRouting.compact.modelId) {
      result.set(settings.modelRouting.compact.modelId, "Compact 模型");
    }
    return result;
  }, [settings.modelRouting]);

  const sourceList = useMemo(() => {
    const query = search.trim().toLowerCase();

    return Object.values(workspaces)
      .filter((workspace) => {
        if (!query) return true;

        return (
          workspace.sourceDraft.name.toLowerCase().includes(query) ||
          providerTypeLabel(workspace.sourceDraft.providerType)
            .toLowerCase()
            .includes(query)
        );
      })
      .sort(compareSourceWorkspace);
  }, [search, workspaces]);

  const currentWorkspace = selectedSourceId
    ? workspaces[selectedSourceId]
    : null;
  const currentEntry =
    currentWorkspace && editingEntryId
      ? (currentWorkspace.entries.find(
        (entry) => entry.id === editingEntryId,
      ) ?? null)
      : null;
  const entryDialogDirty =
    currentEntry && editingEntrySnapshot
      ? serializeEditableEntry(currentEntry) !==
      serializeEditableEntry(editingEntrySnapshot)
      : false;
  const dirty = currentWorkspace
    ? serializeWorkspace(currentWorkspace) !== currentWorkspace.baseline
    : false;

  const createSourceDraftPayload = useCallback((workspace: SourceWorkspace) => {
    const draft = {
      name:
        workspace.kind === "builtin"
          ? workspace.sourceDraft.name
          : workspace.sourceDraft.name.trim(),
      providerType: workspace.sourceDraft.providerType,
      mode: workspace.kind === "builtin" ? workspace.sourceDraft.mode : "custom",
      enabled: workspace.sourceDraft.enabled,
      baseUrl: workspace.sourceDraft.baseUrl,
    };

    return workspace.persistedSourceId
      ? {
        id: workspace.persistedSourceId,
        ...draft,
      }
      : draft;
  }, []);

  const updateWorkspace = useCallback(
    (
      sourceId: string,
      updater: (workspace: SourceWorkspace) => SourceWorkspace,
    ) => {
      setWorkspaces((current) => {
        const workspace = current[sourceId];
        if (!workspace) {
          return current;
        }

        return {
          ...current,
          [sourceId]: updater(workspace),
        };
      });
    },
    [],
  );

  const handleOpenEntryDialog = useCallback((entry: EditableEntry) => {
    setEditingEntryId(entry.id);
    setEditingEntrySnapshot(cloneEditableEntry(entry));
    setError(null);
  }, []);

  const handleCancelEntryDialog = useCallback(() => {
    if (currentWorkspace && editingEntrySnapshot) {
      updateWorkspace(currentWorkspace.sourceId, (workspace) => ({
        ...workspace,
        entries: workspace.entries.map((entry) =>
          entry.id === editingEntrySnapshot.id
            ? cloneEditableEntry(editingEntrySnapshot)
            : entry,
        ),
      }));
    }

    setEditingEntrySnapshot(null);
    setEditingEntryId(null);
  }, [currentWorkspace, editingEntrySnapshot, updateWorkspace]);

  const handleSaveEntryDialog = useCallback(() => {
    setEditingEntrySnapshot(null);
    setEditingEntryId(null);
  }, []);

  const handleAddCustomSource = useCallback(() => {
    const workspace = createNewCustomWorkspace();
    setWorkspaces((current) => ({
      ...current,
      [workspace.sourceId]: workspace,
    }));
    setSelectedSourceId(workspace.sourceId);
    setTestResult(null);
    setError(null);
  }, []);

  const handleAddLocalProvider = useCallback((preset: LocalProviderPreset) => {
    const workspace = createLocalProviderWorkspace(preset);
    setWorkspaces((current) => ({
      ...current,
      [workspace.sourceId]: workspace,
    }));
    setSelectedSourceId(workspace.sourceId);
    setTestResult(null);
    setError(null);
  }, []);

  const handleDeleteSource = useCallback(async () => {
    if (!desktopApi || !currentWorkspace) return;

    if (!currentWorkspace.persistedSourceId) {
      const nextSourceId =
        Object.keys(workspaces).find(
          (id) => id !== currentWorkspace.sourceId,
        ) ?? null;

      setWorkspaces((current) => {
        const next = { ...current };
        delete next[currentWorkspace.sourceId];
        return next;
      });
      setSelectedSourceId(nextSourceId);
      setError(null);
      setDeleteSourceConfirmOpen(false);
      return;
    }

    try {
      await desktopApi.providers.deleteSource(
        currentWorkspace.persistedSourceId,
      );
      setDeleteSourceConfirmOpen(false);
      await reload();
      notifyProviderDirectoryChanged();
      const nextSettings = await desktopApi.settings.get();
      if (nextSettings.modelRouting.chat.modelId !== currentModelId) {
        onModelChange(nextSettings.modelRouting.chat.modelId);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "删除失败");
    }
  }, [currentModelId, currentWorkspace, desktopApi, onModelChange, reload, workspaces]);

  const handleSave = useCallback(async () => {
    if (!desktopApi || !currentWorkspace) return;

    setSaving(true);
    setError(null);
    setTestResult(null);

    try {
      const savedSource = await desktopApi.providers.saveSource(
        createSourceDraftPayload(currentWorkspace),
      );

      if (currentWorkspace.apiKeyInput.trim()) {
        await desktopApi.providers.setCredentials(
          savedSource.id,
          currentWorkspace.apiKeyInput.trim(),
        );
      }

      for (const entryId of currentWorkspace.deletedEntryIds) {
        await desktopApi.models.deleteEntry(entryId);
      }

      for (const entry of currentWorkspace.entries) {
        const providerOptions = parseProviderOptions(entry.providerOptionsText);
        await desktopApi.models.saveEntry({
          id: entry.persistedId,
          sourceId: savedSource.id,
          name: getEntryDisplayName(entry),
          modelId: entry.modelId,
          enabled: entry.enabled,
          capabilities: normalizeCapabilitiesOverride(entry.capabilities),
          limits: entry.limits,
          providerOptions,
        });
      }

      await reload(savedSource.id);
      notifyProviderDirectoryChanged();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [createSourceDraftPayload, currentWorkspace, desktopApi, reload]);

  const handleTest = useCallback(async () => {
    if (!desktopApi || !currentWorkspace) return;

    const startedAt = performance.now();
    setTesting(true);
    setError(null);

    try {
      const result = await desktopApi.providers.testSource(
        createSourceDraftPayload(currentWorkspace),
      );

      setTestResult({
        ...result,
        durationMs: Math.max(1, Math.round(performance.now() - startedAt)),
      });
    } catch (nextError) {
      setTestResult({
        success: false,
        error: nextError instanceof Error ? nextError.message : "测试失败",
        durationMs: Math.max(1, Math.round(performance.now() - startedAt)),
      });
    } finally {
      setTesting(false);
    }
  }, [createSourceDraftPayload, currentWorkspace, desktopApi]);

  const handleFetchModels = useCallback(async () => {
    if (!desktopApi || !currentWorkspace) return;

    setFetchingModels(true);
    setFetchModelsResult(null);
    setError(null);

    try {
      const result = await desktopApi.providers.fetchModels(
        createSourceDraftPayload(currentWorkspace),
      );

      if (!result.success) {
        setFetchModelsResult({
          kind: "error",
          message: formatProviderError(
            result.error,
            result.errorCode,
            "拉取模型失败",
          ),
          errorCode: result.errorCode,
        });
        return;
      }

      let appended = 0;
      updateWorkspace(currentWorkspace.sourceId, (workspace) => {
        const existingIds = new Set(
          workspace.entries.map((entry) => entry.modelId.trim().toLowerCase()),
        );
        const newEntries: EditableEntry[] = [];
        for (const rawId of result.models) {
          const trimmed = rawId.trim();
          if (!trimmed) continue;
          const lowered = trimmed.toLowerCase();
          if (existingIds.has(lowered)) continue;
          existingIds.add(lowered);
          const detected = getDetectedMetadata(trimmed);
          newEntries.push({
            id: `draft-entry:${crypto.randomUUID()}`,
            sourceId: workspace.persistedSourceId ?? workspace.sourceId,
            name: "",
            modelId: trimmed,
            enabled: true,
            builtin: false,
            capabilities: {
              vision: null,
              imageOutput: null,
              toolCalling: null,
              reasoning: null,
              embedding: null,
            },
            limits: {
              contextWindow: null,
              maxOutputTokens: null,
            },
            detectedCapabilities: detected.detectedCapabilities,
            detectedLimits: detected.detectedLimits,
            providerOptionsText: "",
          });
        }
        appended = newEntries.length;
        return {
          ...workspace,
          entries: [...workspace.entries, ...newEntries],
        };
      });

      setFetchModelsResult({
        kind: "success",
        appended,
        total: result.models.length,
      });
    } catch (nextError) {
      setFetchModelsResult({
        kind: "error",
        message:
          nextError instanceof Error ? nextError.message : "拉取模型失败",
      });
    } finally {
      setFetchingModels(false);
    }
  }, [createSourceDraftPayload, currentWorkspace, desktopApi, updateWorkspace]);

  if (loading) {
    return (
      <div className="grid h-[640px] place-items-center rounded-[var(--radius-shell)] border border-[color:var(--color-control-border)] bg-[color:var(--color-control-panel-bg)] text-sm text-muted-foreground shadow-[var(--color-control-shadow)]">
        正在加载提供商与模型目录…
      </div>
    );
  }

  return (
    <div className="grid h-[680px] min-h-0 grid-cols-[280px_minmax(0,1fr)] gap-4">
      <div className="flex min-h-0 flex-col rounded-[var(--radius-shell)] border border-[color:var(--color-control-border)] bg-[color:var(--color-control-panel-bg)] shadow-[var(--color-control-shadow)]">
        <div className="space-y-3 px-4 py-4">
          <FieldInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索提供商"
          />
          <Button
            type="button"
            onClick={handleAddCustomSource}
            className="h-9 w-full rounded-[var(--radius-shell)] bg-foreground text-background hover:bg-foreground/90"
          >
            添加自定义提供商
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <div className="flex min-h-full flex-col gap-3">
            <div className="space-y-2">
              {sourceList.map((workspace) => {
                const isSelected = workspace.sourceId === selectedSourceId;
                const sourceDirty =
                  serializeWorkspace(workspace) !== workspace.baseline;
                const sourceName = workspace.sourceDraft.name || "未命名提供商";

                return (
                  <button
                    type="button"
                    key={workspace.sourceId}
                    onClick={() => {
                      setSelectedSourceId(workspace.sourceId);
                      setError(null);
                      setTestResult(null);
                    }}
                    className={`w-full rounded-[var(--radius-shell)] px-3 py-2 text-left transition-colors ${isSelected
                      ? "bg-[color:var(--color-control-selected-bg)] text-[color:var(--color-control-selected-text)] font-medium"
                      : "bg-transparent text-foreground hover:bg-[color:var(--color-control-bg-hover)]"
                      }`}
                  >
                    <div className="truncate text-[13px] font-semibold text-foreground">
                      {sourceName}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--color-text-muted)]">
                      <span
                        title={
                          workspace.sourceDraft.enabled
                            ? "已配置/已连接"
                            : "未配置"
                        }
                        className={`inline-block h-2 w-2 rounded-full ${workspace.sourceDraft.enabled
                          ? "bg-[color:var(--chela-status-success-text)]"
                          : "bg-zinc-400"
                          }`}
                      />
                      <span>
                        {providerTypeLabel(workspace.sourceDraft.providerType)}
                      </span>
                      <Badge variant="secondary">
                        {workspace.kind === "builtin" ? "内置" : "自定义"}
                      </Badge>
                      {sourceDirty ? (
                        <Badge variant="warning">未保存</Badge>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-auto px-2 pt-4">
              <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-3 py-3 shadow-[var(--color-control-shadow)]">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold text-foreground">
                    快捷配置
                  </p>
                  <Badge variant="secondary">本地接入</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {LOCAL_PROVIDER_PRESETS.map((preset) => (
                    <Button
                      key={preset.id}
                      type="button"
                      variant="outline"
                      aria-label={`添加 ${preset.label} 本地提供商`}
                      onClick={() => handleAddLocalProvider(preset)}
                      className="h-8 rounded-[var(--radius-shell)] px-2 text-[12px]"
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {currentWorkspace ? (
        <div className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-shell)] border border-[color:var(--color-control-border)] bg-[color:var(--color-control-panel-bg)] shadow-[var(--color-control-shadow)]">
          <div className="flex items-start justify-between border-b border-[color:var(--color-border-light)] px-6 py-5">
            <div>
              <div className="text-[20px] font-semibold text-foreground">
                {currentWorkspace.sourceDraft.name || "未命名提供商"}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                <Badge variant="secondary">
                  {currentWorkspace.kind === "builtin" ? "内置" : "自定义"}
                </Badge>
                <Badge variant="default">
                  {providerTypeLabel(currentWorkspace.sourceDraft.providerType)}
                </Badge>
                <Badge variant="secondary">
                  {sourceModeLabel({
                    id: currentWorkspace.sourceId,
                    name: currentWorkspace.sourceDraft.name,
                    kind: currentWorkspace.kind,
                    providerType: currentWorkspace.sourceDraft.providerType,
                    mode: currentWorkspace.sourceDraft.mode,
                    enabled: currentWorkspace.sourceDraft.enabled,
                    baseUrl: currentWorkspace.sourceDraft.baseUrl ?? null,
                  })}
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                aria-label={`切换 ${currentWorkspace.sourceDraft.name || "当前提供商"} 可用状态`}
                checked={currentWorkspace.sourceDraft.enabled}
                onCheckedChange={(checked) =>
                  updateWorkspace(currentWorkspace.sourceId, (workspace) => ({
                    ...workspace,
                    sourceDraft: {
                      ...workspace.sourceDraft,
                      enabled: checked === true,
                    },
                  }))
                }
              />

              {currentWorkspace.kind === "custom" ? (
                <Popover
                  open={deleteSourceConfirmOpen}
                  onOpenChange={setDeleteSourceConfirmOpen}
                >
                  <PopoverTrigger asChild>
                    <TooltipIconButton
                      type="button"
                      tooltip="删除提供商"
                      aria-label="删除提供商"
                      className="h-9 w-9 rounded-[var(--radius-shell)] text-red-500 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </TooltipIconButton>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="w-[280px] rounded-[var(--radius-shell)] p-3"
                  >
                    <div className="space-y-3">
                      <div>
                        <p className="text-[13px] font-medium text-foreground">
                          确认删除这个提供商？
                        </p>
                        <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                          会一起删掉它下面的 {currentWorkspace.entries.length} 个模型条目。
                        </p>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 px-3 text-[12px]"
                          onClick={() => setDeleteSourceConfirmOpen(false)}
                        >
                          取消
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          className="h-8 px-3 text-[12px]"
                          onClick={() => void handleDeleteSource()}
                        >
                          确认删除
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-4">
              <SettingsCard
                title="连接配置"
                description="这里管理当前提供商的接入方式和认证信息。"
                className="bg-shell-panel"
              >
                <div className="space-y-4 px-5 py-5">
                  {currentWorkspace.kind === "custom" ? (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <div className="mb-2 text-[12px] font-medium text-foreground">
                            提供商类型
                          </div>
                          <FieldSelect
                            value={currentWorkspace.sourceDraft.providerType}
                            onChange={(value) =>
                              updateWorkspace(
                                currentWorkspace.sourceId,
                                (workspace) => ({
                                  ...workspace,
                                  sourceDraft: {
                                    ...workspace.sourceDraft,
                                    providerType: value as ProviderType,
                                  },
                                }),
                              )
                            }
                            options={PROVIDER_TYPE_OPTIONS}
                          />
                        </div>
                        <div>
                          <div className="mb-2 text-[12px] font-medium text-foreground">
                            名称
                          </div>
                          <FieldInput
                            value={currentWorkspace.sourceDraft.name}
                            onChange={(event) =>
                              updateWorkspace(
                                currentWorkspace.sourceId,
                                (workspace) => ({
                                  ...workspace,
                                  sourceDraft: {
                                    ...workspace.sourceDraft,
                                    name: event.target.value,
                                  },
                                }),
                              )
                            }
                            placeholder="例如：公司网关 / 本地中转"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 text-[12px] font-medium text-foreground">
                          Base URL
                        </div>
                        <FieldInput
                          value={currentWorkspace.sourceDraft.baseUrl ?? ""}
                          onChange={(event) =>
                            updateWorkspace(
                              currentWorkspace.sourceId,
                              (workspace) => ({
                                ...workspace,
                                sourceDraft: {
                                  ...workspace.sourceDraft,
                                  baseUrl: event.target.value,
                                },
                              }),
                            )
                          }
                          placeholder="https://api.example.com/v1"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rounded-[var(--radius-shell)] border border-[color:var(--color-control-border)] bg-[color:var(--color-control-bg)] px-4 py-4 shadow-[var(--color-control-shadow)]">
                        <label className="inline-flex items-start gap-3 text-[13px] text-foreground">
                          <Switch
                            checked={
                              currentWorkspace.sourceDraft.mode === "custom"
                            }
                            onCheckedChange={(checked) =>
                              updateWorkspace(
                                currentWorkspace.sourceId,
                                (workspace) => ({
                                  ...workspace,
                                  sourceDraft: {
                                    ...workspace.sourceDraft,
                                    mode:
                                      checked === true ? "custom" : "native",
                                    baseUrl:
                                      checked === true
                                        ? workspace.sourceDraft.baseUrl
                                        : "",
                                  },
                                }),
                              )
                            }
                          />
                          <span>
                            <span className="block font-medium text-foreground">
                              使用自定义中转地址
                            </span>
                            <span className="mt-1 block text-[12px] leading-5 text-muted-foreground">
                              不勾选时使用官方接口；勾选后将通过你填写的 Base
                              URL 请求。
                            </span>
                          </span>
                        </label>
                      </div>

                      {currentWorkspace.sourceDraft.mode === "custom" ? (
                        <div>
                          <div className="mb-2 text-[12px] font-medium text-foreground">
                            Base URL
                          </div>
                          <FieldInput
                            value={currentWorkspace.sourceDraft.baseUrl ?? ""}
                            onChange={(event) =>
                              updateWorkspace(
                                currentWorkspace.sourceId,
                                (workspace) => ({
                                  ...workspace,
                                  sourceDraft: {
                                    ...workspace.sourceDraft,
                                    baseUrl: event.target.value,
                                  },
                                }),
                              )
                            }
                            placeholder="https://api.example.com/v1"
                          />
                        </div>
                      ) : null}
                    </>
                  )}

                  <div>
                    <div className="mb-2 text-[12px] font-medium text-foreground">
                      API Key
                    </div>
                    <div className="relative">
                      <FieldInput
                        type={apiKeyVisible ? "text" : "password"}
                        value={currentWorkspace.apiKeyInput}
                        onChange={(event) =>
                          updateWorkspace(
                            currentWorkspace.sourceId,
                            (workspace) => ({
                              ...workspace,
                              apiKeyInput: event.target.value,
                            }),
                          )
                        }
                        placeholder={
                          currentWorkspace.hasStoredCredential
                            ? `已保存：${currentWorkspace.credentialMasked}`
                            : "输入新的 API Key"
                        }
                        className="pr-11"
                        mono
                      />
                      <TooltipIconButton
                        type="button"
                        tooltip={
                          apiKeyVisible ? "隐藏 API Key" : "显示 API Key"
                        }
                        aria-label={
                          apiKeyVisible ? "隐藏 API Key" : "显示 API Key"
                        }
                        side="left"
                        disabled={!currentWorkspace.apiKeyInput}
                        onClick={() => setApiKeyVisible((current) => !current)}
                        className="absolute right-1 top-1/2 size-7 -translate-y-1/2 rounded-[calc(var(--radius-shell)-2px)] text-[color:var(--color-text-muted)] hover:bg-shell-panel hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {apiKeyVisible ? (
                          <EyeOffIcon className="h-4 w-4" />
                        ) : (
                          <EyeIcon className="h-4 w-4" />
                        )}
                      </TooltipIconButton>
                    </div>
                    <p className="mt-2 text-[12px] text-muted-foreground">
                      {currentWorkspace.apiKeyInput
                        ? "点击右侧眼睛可查看或隐藏当前输入的密钥。"
                        : currentWorkspace.hasStoredCredential
                          ? `当前已保存：${currentWorkspace.credentialMasked}。出于安全考虑，已保存密钥仅显示掩码。`
                          : "输入后可点击右侧眼睛查看；不修改时会保留当前密钥。"}
                    </p>
                  </div>
                </div>
              </SettingsCard>

              <SettingsCard
                title="模型目录"
                description="所有聊天和后续任务都会通过稳定的模型条目来选择模型。"
                className="bg-shell-panel"
                headerAction={
                  currentWorkspace.kind === "custom" ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleFetchModels()}
                      disabled={
                        fetchingModels ||
                        saving ||
                        !currentWorkspace.sourceDraft.enabled
                      }
                      className="h-8 gap-1.5 rounded-[var(--radius-shell)] px-3 text-[12px]"
                    >
                      {fetchingModels ? (
                        <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <DownloadCloudIcon className="h-3.5 w-3.5" />
                      )}
                      {fetchingModels ? "拉取中…" : "拉取模型列表"}
                    </Button>
                  ) : undefined
                }
              >
                <div className="px-5 py-2">
                  {fetchModelsResult ? (
                    <div
                      className={`mb-2 rounded-[var(--radius-shell)] px-3 py-2 text-[12px] ${fetchModelsResult.kind === "success"
                          ? "bg-[color:var(--chela-status-success-bg)] text-[color:var(--chela-status-success-text)]"
                          : "bg-[color:var(--chela-status-warning-bg)] text-[color:var(--chela-status-warning-text)]"
                        }`}
                    >
                      {fetchModelsResult.kind === "success"
                        ? fetchModelsResult.appended > 0
                          ? `已新增 ${fetchModelsResult.appended} 个模型条目（共拉取 ${fetchModelsResult.total} 个），保存后生效。`
                          : `远端返回 ${fetchModelsResult.total} 个模型，全部已存在，未新增条目。`
                        : fetchModelsResult.message}
                    </div>
                  ) : null}
                  {[...currentWorkspace.entries]
                    .sort((a, b) =>
                      a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1,
                    )
                    .map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between gap-3 border-b border-[color:var(--color-border-light)] py-3 last:border-0"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="truncate text-[13px] font-medium text-foreground">
                            {getEntryDisplayName(entry)}
                          </span>
                          {!entry.builtin && (
                            <span className="rounded bg-[color:var(--color-control-bg)] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-[var(--color-control-shadow)]">
                              Manual
                            </span>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <TooltipIconButton
                            type="button"
                            tooltip="模型高级项"
                            size="icon"
                            onClick={() => handleOpenEntryDialog(entry)}
                            className="h-8 w-8 rounded-[var(--radius-shell)] text-muted-foreground hover:bg-[color:var(--color-control-bg-hover)] hover:text-foreground"
                          >
                            <SlidersHorizontalIcon className="h-4 w-4" />
                          </TooltipIconButton>

                          {!entry.builtin ? (
                            <TooltipIconButton
                              type="button"
                              tooltip="删除模型"
                              aria-label="删除模型"
                              onClick={() => {
                                const referencedLabel = referencedModelLabels.get(entry.id);
                                if (referencedLabel) {
                                  setError(
                                    `${referencedLabel}正在使用该条目，无法删除。`,
                                  );
                                  return;
                                }

                                updateWorkspace(
                                  currentWorkspace.sourceId,
                                  (workspace) => ({
                                    ...workspace,
                                    deletedEntryIds: entry.persistedId
                                      ? [
                                        ...workspace.deletedEntryIds,
                                        entry.persistedId,
                                      ]
                                      : workspace.deletedEntryIds,
                                    entries: workspace.entries.filter(
                                      (item) => item.id !== entry.id,
                                    ),
                                  }),
                                );
                              }}
                              className="h-8 w-8 rounded-[var(--radius-shell)] text-muted-foreground hover:bg-red-500/10 hover:text-red-500 dark:hover:bg-red-500/20"
                            >
                              <Trash2Icon className="h-4 w-4" />
                            </TooltipIconButton>
                          ) : null}

                          <Switch
                            aria-label={`${getEntryDisplayName(entry)} 可用开关`}
                            checked={entry.enabled}
                            disabled={!currentWorkspace.sourceDraft.enabled}
                            onCheckedChange={(checked) => {
                              const referencedLabel = referencedModelLabels.get(entry.id);
                              if (checked !== true && referencedLabel) {
                                setError(`${referencedLabel}正在使用该条目，无法禁用。`);
                                return;
                              }

                              updateWorkspace(
                                currentWorkspace.sourceId,
                                (workspace) => ({
                                  ...workspace,
                                  entries: workspace.entries.map((item) =>
                                    item.id === entry.id
                                      ? { ...item, enabled: checked === true }
                                      : item,
                                  ),
                                }),
                              );
                            }}
                          />
                        </div>
                      </div>
                    ))}

                  {currentWorkspace.kind === "custom" ? (
                    <div className="mt-2 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          updateWorkspace(
                            currentWorkspace.sourceId,
                            (workspace) => ({
                              ...workspace,
                              entries: [
                                ...workspace.entries,
                                {
                                  id: `draft-entry:${crypto.randomUUID()}`,
                                  sourceId:
                                    workspace.persistedSourceId ??
                                    workspace.sourceId,
                                  name: "New Model",
                                  modelId: "new-model-id",
                                  enabled: true,
                                  builtin: false,
                                  capabilities: {
                                    vision: null,
                                    imageOutput: null,
                                    toolCalling: null,
                                    reasoning: null,
                                    embedding: null,
                                  },
                                  limits: {
                                    contextWindow: null,
                                    maxOutputTokens: null,
                                  },
                                  detectedCapabilities: {
                                    ...getUnknownModelCapabilities(),
                                  },
                                  detectedLimits: {
                                    ...getUnknownModelLimits(),
                                  },
                                  providerOptionsText: "",
                                },
                              ],
                            }),
                          )
                        }
                        className="h-8 rounded-[var(--radius-shell)] px-3 text-[12px] text-foreground hover:bg-[color:var(--color-control-bg-hover)]"
                      >
                        + 添加模型条目
                      </Button>
                    </div>
                  ) : null}
                </div>
              </SettingsCard>
            </div>
          </div>

          <div className="border-t border-[color:var(--color-border-light)] bg-shell-panel px-6 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-[12px] text-muted-foreground">
                {error ? (
                  <span className="text-red-500">{error}</span>
                ) : testResult ? (
                  <span
                    className={
                      testResult.success ? "text-[color:var(--chela-status-success-text)]" : "text-[color:var(--chela-status-warning-text)]"
                    }
                  >
                    {(testResult.success
                      ? "连接测试通过"
                      : formatProviderError(
                        testResult.error,
                        testResult.errorCode,
                        "连接测试失败",
                      )) + ` · ${testResult.durationMs} ms`}
                  </span>
                ) : dirty ? (
                  "当前提供商有未保存修改。"
                ) : (
                  "当前配置已保存。"
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleTest()}
                  disabled={testing || saving}
                  className="h-9 rounded-[var(--radius-shell)] px-4 text-[12px]"
                >
                  {testing ? "测试中…" : "测试连接"}
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || !dirty}
                  className={`h-9 rounded-[var(--radius-shell)] px-4 text-[12px] ${dirty && !saving
                      ? "animate-pulse bg-[color:var(--color-accent)] text-white hover:bg-[color:var(--color-accent-hover)] shadow-sm"
                      : "bg-foreground text-background hover:bg-foreground/90"
                    }`}
                >
                  {saving ? "保存中…" : "保存修改"}
                </Button>
              </div>
            </div>
          </div>

          <ModelEntryDialog
            currentEntry={currentEntry}
            currentWorkspace={currentWorkspace}
            entryDialogDirty={entryDialogDirty}
            updateWorkspace={updateWorkspace}
            onCancel={handleCancelEntryDialog}
            onSave={handleSaveEntryDialog}
          />
        </div>
      ) : (
        <div className="grid place-items-center rounded-[var(--radius-shell)] border border-[color:var(--color-control-border)] bg-[color:var(--color-control-panel-bg)] text-sm text-muted-foreground shadow-[var(--color-control-shadow)]">
          请选择一个提供商。
        </div>
      )}
    </div>
  );
}
