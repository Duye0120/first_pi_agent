import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ThumbsDownIcon,
  ThumbsUpIcon,
  Trash2Icon,
} from "lucide-react";
import type {
  MemoryListSort,
  MemoryMemdirStatus,
  MemoryRecord,
  MemoryRebuildResult,
  MemoryStats,
  ModelEntry,
  ProviderSource,
  Settings,
} from "@shared/contracts";
import type { MemoryEmbeddingModelId } from "@shared/memory";
import { MEMORY_EMBEDDING_MODELS, isLocalEmbeddingModelId } from "@shared/memory";
import { formatDateTimeInTimeZone } from "@shared/timezone";
import { Button } from "@renderer/components/assistant-ui/button";
import { Checkbox } from "@renderer/components/assistant-ui/checkbox";
import { ModelSelector } from "@renderer/components/assistant-ui/model-selector";
import type { ModelOption } from "@renderer/components/assistant-ui/model-selector";
import {
  loadProviderDirectory,
  resolveModelEntryName,
  subscribeProviderDirectoryChanged,
} from "@renderer/lib/provider-directory";
import {
  SettingsCard,
  SettingsBlock,
  StatusBadge,
  FieldInput,
  FieldSelect,
} from "./shared";
import {
  deleteMemoryAndRefresh,
  feedbackMemoryAndRefresh,
} from "./memory-actions";
import {
  formatMemoryErrorMessage,
  getRebuildStatusText,
} from "./memory-status";

function formatTimestamp(value: string | null, timeZone: string): string {
  if (!value) {
    return "—";
  }

  try {
    return formatDateTimeInTimeZone(value, timeZone);
  } catch {
    return value;
  }
}

function getWorkerLabel(state: MemoryStats["workerState"]): string {
  switch (state) {
    case "idle":
      return "未启动";
    case "starting":
      return "启动中";
    case "ready":
      return "已就绪";
    case "error":
      return "异常";
  }
}

function MetaItem({
  label,
  value,
  breakAll = false,
}: {
  label: string;
  value: string;
  breakAll?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-4 py-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={[
          "mt-1 text-[13px] leading-5 text-foreground",
          breakAll ? "break-all" : "",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

const MEMORY_SORT_OPTIONS: Array<{ value: MemoryListSort; label: string }> = [
  { value: "confidence_desc", label: "综合分最高" },
  { value: "match_count_desc", label: "命中次数最高" },
  { value: "feedback_score_desc", label: "反馈分最高" },
  { value: "last_matched_desc", label: "最近命中" },
  { value: "created_desc", label: "最近创建" },
];

const MEMORY_STATUS_OPTIONS: Array<{ value: MemoryMemdirStatus | "all"; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "saved", label: "saved" },
  { value: "merged", label: "merged" },
  { value: "conflict", label: "conflict" },
  { value: "duplicate", label: "duplicate" },
];

function getMemoryTags(memory: MemoryRecord): string[] {
  return Array.isArray(memory.metadata?.tags) ? memory.metadata.tags : [];
}

function getMemorySource(memory: MemoryRecord): string {
  return typeof memory.metadata?.source === "string"
    ? memory.metadata.source
    : "memory";
}

function getMemoryTopic(memory: MemoryRecord): string {
  return typeof memory.metadata?.topic === "string"
    ? memory.metadata.topic
    : "general";
}

function getMemoryStatus(memory: MemoryRecord): MemoryMemdirStatus | null {
  const status = memory.metadata?.memdirStatus;
  return status === "saved" ||
    status === "duplicate" ||
    status === "merged" ||
    status === "conflict"
    ? status
    : null;
}

function getSyncLabel(status: MemoryStats["vectorSyncStatus"]): string {
  switch (status) {
    case "synced":
      return "已同步";
    case "memdir_ahead":
      return "文件领先";
    case "vector_ahead":
      return "向量领先";
    case "unknown":
    default:
      return "未知";
  }
}

function getStatusVariant(status: MemoryMemdirStatus | null) {
  if (status === "conflict") {
    return "warning" as const;
  }
  if (status === "saved" || status === "merged") {
    return "success" as const;
  }
  return "secondary" as const;
}

export function MemorySection({
  settings,
  timeZone,
  modelOptions,
  onSettingsChange,
}: {
  settings: Settings;
  timeZone: string;
  modelOptions: ModelOption[];
  onSettingsChange: (partial: Partial<Settings>) => void;
}) {
  const desktopApi = window.desktopApi;
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [memorySort, setMemorySort] =
    useState<MemoryListSort>("confidence_desc");
  const [statusFilter, setStatusFilter] =
    useState<MemoryMemdirStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [minConfidenceFilter, setMinConfidenceFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [lastRebuildResult, setLastRebuildResult] =
    useState<MemoryRebuildResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memoryAction, setMemoryAction] = useState<{
    id: number;
    kind: "delete" | "feedback";
  } | null>(null);
  const [providerSources, setProviderSources] = useState<ProviderSource[]>([]);
  const [providerEntries, setProviderEntries] = useState<ModelEntry[]>([]);

  useEffect(() => {
    if (!desktopApi) return;
    let cancelled = false;
    const refresh = () => {
      void loadProviderDirectory(desktopApi)
        .then((snapshot) => {
          if (cancelled) return;
          setProviderSources(snapshot.sources);
          setProviderEntries(snapshot.entries);
        })
        .catch(() => {
          /* 忽略加载失败，回落到本地嵌入选项 */
        });
    };
    refresh();
    const unsubscribe = subscribeProviderDirectoryChanged(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [desktopApi]);

  const loadStats = useCallback(async () => {
    if (!desktopApi) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextStats = await desktopApi.memory.getStats();
      setStats(nextStats);
    } catch (err) {
      setError(formatMemoryErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [desktopApi]);

  useEffect(() => {
    void loadStats();
  }, [loadStats, settings.memory.embeddingModelId]);

  const loadMemories = useCallback(async () => {
    if (!desktopApi) {
      return;
    }

    setMemoriesLoading(true);
    setError(null);

    try {
      const parsedMinConfidence = Number(minConfidenceFilter);
      const source = sourceFilter.trim();
      const topic = topicFilter.trim();
      const minConfidence =
        Number.isFinite(parsedMinConfidence) && minConfidenceFilter.trim()
          ? parsedMinConfidence
          : null;
      const nextMemories = await desktopApi.memory.list({
        sort: memorySort,
        limit: 80,
        status: statusFilter,
        ...(source ? { source } : {}),
        ...(topic ? { topic } : {}),
        ...(minConfidence !== null ? { minConfidence } : {}),
      });
      setMemories(nextMemories);
    } catch (err) {
      setError(formatMemoryErrorMessage(err));
    } finally {
      setMemoriesLoading(false);
    }
  }, [
    desktopApi,
    memorySort,
    minConfidenceFilter,
    sourceFilter,
    statusFilter,
    topicFilter,
  ]);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  const modelNeedsRebuild =
    !!stats?.indexedModelId &&
    stats.indexedModelId !== settings.memory.embeddingModelId;
  const selectedEmbeddingProvider = settings.memory.embeddingProviderId
    ? providerSources.find(
      (item) => item.id === settings.memory.embeddingProviderId,
    )
    : null;
  const embeddingProviderUnavailable =
    !!settings.memory.embeddingProviderId &&
    (!selectedEmbeddingProvider || !selectedEmbeddingProvider.enabled);

  const LOCAL_GROUP_LABEL = "本地嵌入模型";

  function buildEmbeddingValue(
    providerId: string | null,
    modelId: string,
  ): string {
    return providerId ? `${providerId}::${modelId}` : `local::${modelId}`;
  }

  function parseEmbeddingValue(value: string): {
    providerId: string | null;
    modelId: string;
  } {
    const [head, ...rest] = value.split("::");
    if (head === "local") {
      return { providerId: null, modelId: rest.join("::") };
    }
    return { providerId: head ?? null, modelId: rest.join("::") };
  }

  const embeddingOptions = useMemo<ModelOption[]>(() => {
    const localOptions: ModelOption[] = MEMORY_EMBEDDING_MODELS.map((entry) => ({
      id: buildEmbeddingValue(null, entry.id),
      name: entry.label,
      description: entry.description,
      groupId: "local",
      groupLabel: LOCAL_GROUP_LABEL,
    }));

    const sourceMap = new Map(
      providerSources.map((source) => [source.id, source]),
    );

    const remoteOptions: ModelOption[] = providerEntries
      .filter((entry) => {
        if (!entry.enabled) return false;
        const source = sourceMap.get(entry.sourceId);
        if (!source || !source.enabled) return false;
        const capability =
          entry.capabilities.embedding ?? entry.detectedCapabilities.embedding;
        if (capability === true) return true;
        // 兜底：模型 ID 含 embed / bge / e5 / m3 时也视为候选嵌入模型，方便用户在未标注 capability 时直接选用。
        const lowered = entry.modelId.toLowerCase();
        return /(embed|bge|e5|m3|gte|nomic)/.test(lowered);
      })
      .map((entry) => {
        const source = sourceMap.get(entry.sourceId);
        const groupLabel = source ? source.name : "其他";
        return {
          id: buildEmbeddingValue(entry.sourceId, entry.modelId),
          name: resolveModelEntryName(entry),
          description: source ? source.name : entry.modelId,
          groupId: entry.sourceId,
          groupLabel,
        } satisfies ModelOption;
      });

    return [...localOptions, ...remoteOptions];
  }, [providerEntries, providerSources]);

  const currentEmbeddingValue = buildEmbeddingValue(
    settings.memory.embeddingProviderId,
    settings.memory.embeddingModelId,
  );

  const currentEmbeddingLabel = useMemo(() => {
    const found = embeddingOptions.find(
      (option) => option.id === currentEmbeddingValue,
    );
    if (found) {
      return found.description
        ? `${found.description} / ${found.name}`
        : found.name;
    }
    if (settings.memory.embeddingProviderId) {
      const source = providerSources.find(
        (item) => item.id === settings.memory.embeddingProviderId,
      );
      const prefix = source ? `${source.name} / ` : "";
      return `${prefix}${settings.memory.embeddingModelId}（未启用或已删除）`;
    }
    return settings.memory.embeddingModelId;
  }, [
    currentEmbeddingValue,
    embeddingOptions,
    providerSources,
    settings.memory.embeddingModelId,
    settings.memory.embeddingProviderId,
  ]);
  const rebuildStatusText = getRebuildStatusText(lastRebuildResult);

  const handleEmbeddingValueChange = useCallback(
    (value: string) => {
      const { providerId, modelId } = parseEmbeddingValue(value);
      onSettingsChange({
        memory: {
          ...settings.memory,
          embeddingModelId: (modelId || settings.memory.embeddingModelId) as MemoryEmbeddingModelId,
          embeddingProviderId: providerId,
        },
      } as Partial<Settings>);
    },
    [onSettingsChange, settings.memory],
  );

  const handleRebuild = useCallback(async () => {
    if (!desktopApi) {
      return;
    }

    setRebuilding(true);
    setError(null);
    try {
      const result = await desktopApi.memory.rebuild();
      setLastRebuildResult(result);
      await Promise.all([loadStats(), loadMemories()]);
    } catch (err) {
      setError(formatMemoryErrorMessage(err));
    } finally {
      setRebuilding(false);
    }
  }, [desktopApi, loadMemories, loadStats]);

  const handleMemoryDelete = useCallback(
    async (memoryId: number) => {
      if (!desktopApi) {
        return;
      }
      const confirmed = window.confirm("确定删除这条记忆吗？");
      if (!confirmed) {
        return;
      }

      setMemoryAction({ id: memoryId, kind: "delete" });
      setError(null);
      try {
        const deleted = await deleteMemoryAndRefresh(desktopApi, memoryId, {
          loadStats,
          loadMemories,
        });
        if (!deleted) {
          setError("删除失败：这条记忆可能已经不存在。");
        }
      } catch (err) {
        setError(formatMemoryErrorMessage(err));
      } finally {
        setMemoryAction(null);
      }
    },
    [desktopApi, loadMemories, loadStats],
  );

  const handleMemoryFeedback = useCallback(
    async (memoryId: number, delta: number) => {
      if (!desktopApi) {
        return;
      }

      setMemoryAction({ id: memoryId, kind: "feedback" });
      setError(null);
      try {
        const updated = await feedbackMemoryAndRefresh(
          desktopApi,
          memoryId,
          delta,
          {
            loadStats,
            loadMemories,
          },
        );
        if (!updated) {
          setError("反馈失败：这条记忆可能已经不存在。");
        }
      } catch (err) {
        setError(formatMemoryErrorMessage(err));
      } finally {
        setMemoryAction(null);
      }
    },
    [desktopApi, loadMemories, loadStats],
  );

  const handleMemorySettingChange = useCallback(
    <K extends keyof Settings["memory"],>(key: K, value: Settings["memory"][K]) => {
      onSettingsChange({
        memory: {
          ...settings.memory,
          [key]: value,
        },
      } as Partial<Settings>);
    },
    [onSettingsChange, settings.memory],
  );

  return (
    <div className="space-y-4">
      <SettingsCard>
        <SettingsBlock label="记忆功能">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={settings.memory.enabled}
              onCheckedChange={(checked: boolean | "indeterminate") => handleMemorySettingChange("enabled", !!checked)}
            />
            <div className="-mt-0.5 space-y-1">
              <p className="text-[13px] font-medium leading-none text-foreground">启用记忆</p>
              <p className="text-[12px] text-muted-foreground">
                启用后，AI 将记住您对话中的重要信息，并使用这些信息提供更个性化的回复。
              </p>
            </div>
          </div>
        </SettingsBlock>
      </SettingsCard>

      <SettingsCard>
        <SettingsBlock label="记忆检索">
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <Checkbox
                checked={settings.memory.autoRetrieve}
                onCheckedChange={(checked: boolean | "indeterminate") => handleMemorySettingChange("autoRetrieve", !!checked)}
              />
              <div className="-mt-0.5 space-y-3 w-full">
                <div>
                  <p className="text-[13px] font-medium leading-none text-foreground">自动检索记忆</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">在每次对话前自动搜索并注入相关记忆以提供上下文。</p>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={settings.memory.queryRewrite}
                    onCheckedChange={(checked: boolean | "indeterminate") => handleMemorySettingChange("queryRewrite", !!checked)}
                  />
                  <div className="-mt-0.5 space-y-1">
                    <p className="text-[13px] font-medium leading-none text-foreground">查询重写</p>
                    <p className="text-[12px] text-muted-foreground">使用大语言模型优化您的消息再进行记忆搜索。这会将对话式查询转换为语义搜索词，以获得更好的匹配效果。</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1 sm:max-w-md">
              <div className="flex items-center justify-between text-[13px] font-medium text-foreground">
                <span>最大检索记忆数：{settings.memory.searchCandidateLimit}</span>
              </div>
              <p className="text-[12px] text-muted-foreground">注入对话上下文的相关记忆最大数量 (1-20)。</p>
              <FieldInput
                type="number"
                min={1}
                max={20}
                value={settings.memory.searchCandidateLimit}
                onChange={(e) => handleMemorySettingChange("searchCandidateLimit", parseInt(e.target.value, 10))}
                className="mt-2 w-full"
              />
            </div>

            <div className="space-y-1 sm:max-w-md">
              <div className="flex items-center justify-between text-[13px] font-medium text-foreground">
                <span>相似度阈值：{settings.memory.similarityThreshold}%</span>
              </div>
              <p className="text-[12px] text-muted-foreground">检索记忆所需的最低相似度分数。值越高，匹配越严格。</p>
              <FieldInput
                type="number"
                min={0}
                max={100}
                value={settings.memory.similarityThreshold}
                onChange={(e) => handleMemorySettingChange("similarityThreshold", parseInt(e.target.value, 10))}
                className="mt-2 w-full"
              />
              <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                <span>宽松 (0%)</span>
                <span>严格 (100%)</span>
              </div>
            </div>
          </div>
        </SettingsBlock>
      </SettingsCard>

      <SettingsCard>
        <SettingsBlock label="记忆总结">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={settings.memory.autoSummarize}
              onCheckedChange={(checked: boolean | "indeterminate") => handleMemorySettingChange("autoSummarize", !!checked)}
            />
            <div className="-mt-0.5 space-y-1">
              <p className="text-[13px] font-medium leading-none text-foreground">自动总结对话</p>
              <p className="text-[12px] text-muted-foreground">自动从对话中提取并存储重要信息作为新记忆。</p>
            </div>
          </div>
        </SettingsBlock>
      </SettingsCard>

      <SettingsCard>
        <SettingsBlock label="记忆工具模型" hint="为记忆操作指定专用工具模型。留空则使用通用工具模型。">
          <div className="sm:max-w-md">
            <ModelSelector.Root
              models={modelOptions}
              value={settings.memory.toolModelId ?? ""}
              onValueChange={(val) => handleMemorySettingChange("toolModelId", val === "" ? null : val)}
            >
              <ModelSelector.Trigger className="h-9 w-full justify-between px-3 text-[13px]" />
              <ModelSelector.Content align="start" className="min-w-[var(--radix-select-trigger-width)]" />
            </ModelSelector.Root>
          </div>
        </SettingsBlock>
      </SettingsCard>

      <SettingsCard>
        <SettingsBlock
          label="嵌入模型"
          hint="可选择本地内置模型，或使用已配置 Provider 中的远端嵌入模型（如 Ollama 的 bge-m3）。"
        >
          <div className="space-y-3 sm:max-w-md">
            <ModelSelector.Root
              models={embeddingOptions}
              value={currentEmbeddingValue}
              onValueChange={handleEmbeddingValueChange}
            >
              <ModelSelector.Trigger placeholder="选择嵌入模型" />
              <ModelSelector.Content />
            </ModelSelector.Root>
            <div className="flex items-center justify-between gap-3 text-[12px] text-muted-foreground">
              <span>当前选择：{currentEmbeddingLabel}</span>
              <StatusBadge
                ok={!modelNeedsRebuild}
                text={modelNeedsRebuild ? "待重建索引" : "索引模型一致"}
              />
            </div>
            {!isLocalEmbeddingModelId(settings.memory.embeddingModelId) &&
              !settings.memory.embeddingProviderId ? (
              <p className="text-[12px] text-[color:var(--chela-status-warning-text)]">
                未绑定 Provider，远端嵌入模型将无法调用，请重新选择。
              </p>
            ) : null}
            {embeddingProviderUnavailable ? (
              <p className="text-[12px] text-[color:var(--chela-status-warning-text)]">
                当前嵌入 Provider 未启用或已删除，请重新选择可用的嵌入模型。
              </p>
            ) : null}
          </div>
        </SettingsBlock>
      </SettingsCard>

      <SettingsCard>
        <SettingsBlock label="操作与统计">
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <MetaItem
                label="向量记忆"
                value={loading && !stats ? "加载中…" : String(stats?.vectorMemoryCount ?? stats?.totalMemories ?? 0)}
              />
              <MetaItem
                label="文件记忆"
                value={loading && !stats ? "加载中…" : String(stats?.memdirMemoryCount ?? 0)}
              />
              <MetaItem
                label="累计命中"
                value={loading && !stats ? "加载中…" : String(stats?.totalMatches ?? 0)}
              />
              <MetaItem
                label="Worker 状态"
                value={stats ? getWorkerLabel(stats.workerState) : "—"}
              />
              <MetaItem
                label="模型状态"
                value={stats ? (stats.modelLoaded ? "已加载" : "未加载") : "—"}
              />
              <MetaItem
                label="候选上限"
                value={stats ? String(stats.candidateLimit) : "—"}
              />
              <MetaItem
                label="同步状态"
                value={stats ? getSyncLabel(stats.vectorSyncStatus) : "—"}
              />
              <MetaItem
                label="当前模型"
                value={stats?.selectedModelId ?? settings.memory.embeddingModelId}
                breakAll
              />
              <MetaItem
                label="索引模型"
                value={stats?.indexedModelId ?? "—"}
                breakAll
              />
              <MetaItem
                label="最近写入"
                value={formatTimestamp(stats?.lastIndexedAt ?? null, timeZone)}
              />
              <MetaItem
                label="最近重建"
                value={formatTimestamp(stats?.lastRebuiltAt ?? null, timeZone)}
              />
              <MetaItem
                label="最近自动提取"
                value={formatTimestamp(stats?.lastAutoRefreshAt ?? null, timeZone)}
              />
              <MetaItem
                label="最近失败"
                value={stats?.lastFailureReason ?? "—"}
                breakAll
              />
              <MetaItem
                label="数据库"
                value={stats?.dbPath ?? "—"}
                breakAll
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void Promise.all([loadStats(), loadMemories()])}
                disabled={loading || memoriesLoading || rebuilding}
              >
                {loading || memoriesLoading ? "刷新中…" : "刷新状态"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleRebuild()}
                disabled={rebuilding}
              >
                {rebuilding ? "重建中…" : "重建所有向量"}
              </Button>
              <span className="text-[12px] leading-5 text-muted-foreground ml-2">
                如有需要，手动重新生成所有记忆的嵌入向量。
              </span>
            </div>

            {rebuilding ? (
              <p className="text-[12px] leading-5 text-muted-foreground">
                正在重建 Memory 向量，完成后会刷新统计和列表。
              </p>
            ) : rebuildStatusText ? (
              <p className="text-[12px] leading-5 text-muted-foreground">
                {rebuildStatusText}
              </p>
            ) : null}

            {error ? (
              <p className="text-[12px] leading-5 text-[color:var(--color-status-danger-fg,#c43d2f)]">
                {error}
              </p>
            ) : null}
          </div>
        </SettingsBlock>
      </SettingsCard>

      <SettingsCard>
        <SettingsBlock
          label="记忆列表"
          hint="查看本地向量记忆与命中强化信号。"
        >
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <FieldSelect
                  value={memorySort}
                  onChange={(value) => setMemorySort(value as MemoryListSort)}
                  options={MEMORY_SORT_OPTIONS}
                />
                <FieldSelect
                  value={statusFilter}
                  onChange={(value) => setStatusFilter(value as MemoryMemdirStatus | "all")}
                  options={MEMORY_STATUS_OPTIONS}
                />
                <FieldInput
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.target.value)}
                  placeholder="source"
                />
                <FieldInput
                  value={topicFilter}
                  onChange={(event) => setTopicFilter(event.target.value)}
                  placeholder="topic"
                />
                <FieldInput
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={minConfidenceFilter}
                  onChange={(event) => setMinConfidenceFilter(event.target.value)}
                  placeholder="confidence ≥"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadMemories()}
                disabled={memoriesLoading}
              >
                {memoriesLoading ? "刷新中…" : "刷新列表"}
              </Button>
            </div>

            <div className="space-y-2">
              {memoriesLoading && memories.length === 0 ? (
                <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-4 py-5 text-[12px] text-muted-foreground">
                  正在读取记忆…
                </div>
              ) : memories.length === 0 ? (
                <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-4 py-5 text-[12px] text-muted-foreground">
                  当前没有已保存的向量记忆。
                </div>
              ) : (
                memories.map((memory) => {
                  const tags = getMemoryTags(memory);
                  const status = getMemoryStatus(memory);
                  const matchedSummary =
                    typeof memory.metadata?.matchedSummary === "string"
                      ? memory.metadata.matchedSummary
                      : null;
                  const conflictWith =
                    typeof memory.metadata?.conflictWith === "string"
                      ? memory.metadata.conflictWith
                      : null;
                  const supersedes =
                    typeof memory.metadata?.supersedes === "string"
                      ? memory.metadata.supersedes
                      : null;
                  const confidence =
                    typeof memory.metadata?.confidence === "number"
                      ? memory.metadata.confidence
                      : null;
                  const confidenceScore = memory.matchCount + memory.feedbackScore;
                  const actionBusy = memoryAction !== null;
                  const rowBusy = memoryAction?.id === memory.id;
                  const deleting =
                    rowBusy && memoryAction?.kind === "delete";
                  const feedbacking =
                    rowBusy && memoryAction?.kind === "feedback";

                  return (
                    <div
                      key={memory.id}
                      className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-4 py-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {status ? (
                              <span className={[
                                "inline-flex rounded-[var(--radius-shell)] px-2 py-1 text-[11px] font-medium",
                                getStatusVariant(status) === "warning"
                                  ? "bg-[color:var(--chela-status-warning-bg)] text-[color:var(--chela-status-warning-text)]"
                                  : getStatusVariant(status) === "success"
                                    ? "bg-[color:var(--chela-status-success-bg)] text-[color:var(--chela-status-success-text)]"
                                    : "bg-[color:var(--color-control-bg-active)] text-muted-foreground",
                              ].join(" ")}
                              >
                                {status}
                              </span>
                            ) : null}
                            <span className="text-[11px] text-muted-foreground">
                              {getMemoryTopic(memory)}
                            </span>
                          </div>
                          <p className="break-words text-[13px] leading-5 text-foreground">
                            {memory.content}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground">
                          <span className="px-1">综合 {confidenceScore}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={() => void handleMemoryFeedback(memory.id, 1)}
                            disabled={actionBusy}
                            aria-label="提升这条记忆"
                            title="提升这条记忆"
                          >
                            <ThumbsUpIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={() => void handleMemoryFeedback(memory.id, -1)}
                            disabled={actionBusy}
                            aria-label="降低这条记忆权重"
                            title="降低这条记忆权重"
                          >
                            <ThumbsDownIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-[color:var(--color-status-danger-fg,#c43d2f)] hover:bg-[color:var(--color-control-bg-hover)]"
                            onClick={() => void handleMemoryDelete(memory.id)}
                            disabled={actionBusy}
                            aria-label="删除这条记忆"
                            title="删除这条记忆"
                          >
                            <Trash2Icon className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {deleting || feedbacking ? (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {deleting ? "正在删除…" : "正在更新反馈…"}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span>命中 {memory.matchCount}</span>
                        <span>反馈 {memory.feedbackScore}</span>
                        <span>来源 {getMemorySource(memory)}</span>
                        {confidence !== null ? (
                          <span>置信 {confidence.toFixed(2)}</span>
                        ) : null}
                        <span>
                          创建 {formatTimestamp(memory.createdAt, timeZone)}
                        </span>
                        <span>
                          最近命中 {formatTimestamp(memory.lastMatchedAt, timeZone)}
                        </span>
                      </div>
                      {conflictWith || supersedes || matchedSummary ? (
                        <div className="mt-3 rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg-active)] px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                          {conflictWith ? (
                            <p>冲突对象：{conflictWith}</p>
                          ) : null}
                          {supersedes ? (
                            <p>升级对象：{supersedes}</p>
                          ) : null}
                          {!conflictWith && !supersedes && matchedSummary ? (
                            <p>命中对象：{matchedSummary}</p>
                          ) : null}
                        </div>
                      ) : null}
                      {tags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {tags.map((tag) => (
                            <span
                              key={`${memory.id}:${tag}`}
                              className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg-active)] px-2 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </SettingsBlock>
      </SettingsCard>
    </div>
  );
}
