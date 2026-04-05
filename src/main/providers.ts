import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { completeSimple, getModel, type Model } from "@mariozechner/pi-ai";
import type {
  ModelCapabilities,
  ModelCapabilitiesOverride,
  ModelEntry,
  ModelEntryDraft,
  ModelLimits,
  ModelLimitsOverride,
  ModelUsageConflict,
  ProviderSource,
  ProviderSourceDraft,
  ProviderType,
  SourceCredentials,
  SourceTestResult,
} from "../shared/contracts.js";
import {
  BUILTIN_SOURCES,
  CURATED_MODEL_CATALOG,
  DEFAULT_MODEL_ENTRY_ID,
  createCuratedEntry,
  createEmptyCapabilitiesOverride,
  createEmptyLimitsOverride,
  getRuntimeApiForProviderType,
} from "../shared/provider-directory.js";
import { getSettings } from "./settings.js";

const SOURCES_FILE = "provider-sources.json";
const ENTRIES_FILE = "model-entries.json";
const CREDENTIALS_FILE = "credentials.json";
const LEGACY_BUILTIN_PROVIDERS = new Set(["anthropic", "openai", "google"]);
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 8_192;

type CredentialsStore = Record<string, { apiKey?: string }>;
type RawCredentialsStore = Record<string, { apiKey?: string; baseUrl?: string }>;

type ProviderState = {
  sources: ProviderSource[];
  entries: ModelEntry[];
  credentials: CredentialsStore;
};

type ResolvedModelEntry = {
  entry: ModelEntry;
  source: ProviderSource;
  apiKey: string;
  model: Model<any>;
  runtimeSignature: string;
};

function getUserDataPath(fileName: string): string {
  return path.join(app.getPath("userData"), fileName);
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
    }
  } catch {
    // ignore corrupt files and fall back
  }
  return fallback;
}

function writeJsonFile(filePath: string, data: unknown): void {
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeCapabilityValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeCapabilitiesOverride(
  value: Partial<ModelCapabilitiesOverride> | null | undefined,
): ModelCapabilitiesOverride {
  return {
    vision: normalizeCapabilityValue(value?.vision),
    imageOutput: normalizeCapabilityValue(value?.imageOutput),
    toolCalling: normalizeCapabilityValue(value?.toolCalling),
    reasoning: normalizeCapabilityValue(value?.reasoning),
    embedding: normalizeCapabilityValue(value?.embedding),
  };
}

function normalizeLimitValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function normalizeLimitsOverride(
  value: Partial<ModelLimitsOverride> | null | undefined,
): ModelLimitsOverride {
  return {
    contextWindow: normalizeLimitValue(value?.contextWindow),
    maxOutputTokens: normalizeLimitValue(value?.maxOutputTokens),
  };
}

function normalizeProviderOptions(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return { ...(value as Record<string, unknown>) };
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 6) + "••••" + key.slice(-4);
}

function sortSources(sources: ProviderSource[]): ProviderSource[] {
  return [...sources].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "builtin" ? -1 : 1;
    }
    return left.name.localeCompare(right.name, "zh-CN");
  });
}

function sortEntries(entries: ModelEntry[], sources: ProviderSource[]): ModelEntry[] {
  const sourceOrder = new Map(sortSources(sources).map((source, index) => [source.id, index]));
  return [...entries].sort((left, right) => {
    const leftOrder = sourceOrder.get(left.sourceId) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = sourceOrder.get(right.sourceId) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    if (left.builtin !== right.builtin) {
      return left.builtin ? -1 : 1;
    }
    return left.name.localeCompare(right.name, "zh-CN");
  });
}

function cloneSource(source: ProviderSource): ProviderSource {
  return { ...source };
}

function cloneEntry(entry: ModelEntry): ModelEntry {
  return {
    ...entry,
    capabilities: { ...entry.capabilities },
    limits: { ...entry.limits },
    providerOptions: entry.providerOptions ? { ...entry.providerOptions } : null,
    detectedCapabilities: { ...entry.detectedCapabilities },
    detectedLimits: { ...entry.detectedLimits },
  };
}

function normalizeDetectedCapabilities(value: Partial<ModelCapabilities> | null | undefined): ModelCapabilities {
  return {
    vision: normalizeCapabilityValue(value?.vision),
    imageOutput: normalizeCapabilityValue(value?.imageOutput),
    toolCalling: normalizeCapabilityValue(value?.toolCalling),
    reasoning: normalizeCapabilityValue(value?.reasoning),
    embedding: normalizeCapabilityValue(value?.embedding),
  };
}

function normalizeDetectedLimits(value: Partial<ModelLimits> | null | undefined): ModelLimits {
  return {
    contextWindow: normalizeLimitValue(value?.contextWindow),
    maxOutputTokens: normalizeLimitValue(value?.maxOutputTokens),
  };
}

function readProviderState(): ProviderState {
  const sourcesPath = getUserDataPath(SOURCES_FILE);
  const entriesPath = getUserDataPath(ENTRIES_FILE);
  const credentialsPath = getUserDataPath(CREDENTIALS_FILE);

  const persistedSources = readJsonFile<ProviderSource[]>(sourcesPath, []);
  const persistedEntries = readJsonFile<ModelEntry[]>(entriesPath, []);
  const rawCredentials = readJsonFile<RawCredentialsStore>(credentialsPath, {});

  const credentials: CredentialsStore = {};
  const legacyBaseUrls = new Map<string, string>();

  for (const [key, value] of Object.entries(rawCredentials)) {
    if (!value || typeof value !== "object") continue;

    const apiKey = typeof value.apiKey === "string" ? value.apiKey.trim() : "";
    const baseUrl = normalizeBaseUrl(value.baseUrl);

    if (LEGACY_BUILTIN_PROVIDERS.has(key)) {
      const sourceId = `builtin:${key}`;
      if (!credentials[sourceId] && apiKey) {
        credentials[sourceId] = { apiKey };
      }
      if (baseUrl) {
        legacyBaseUrls.set(sourceId, baseUrl);
      }
      continue;
    }

    credentials[key] = apiKey ? { apiKey } : {};
  }

  const builtinSources = BUILTIN_SOURCES.map((builtin) => {
    const persisted = persistedSources.find((source) => source.id === builtin.id);
    const legacyBaseUrl = legacyBaseUrls.get(builtin.id);
    const persistedBaseUrl = normalizeBaseUrl(persisted?.baseUrl);
    const baseUrl = persistedBaseUrl ?? legacyBaseUrl ?? null;
    const mode = baseUrl ? "custom" : persisted?.mode === "custom" ? "custom" : "native";

    return {
      ...builtin,
      enabled: persisted?.enabled ?? builtin.enabled,
      mode,
      baseUrl,
    } satisfies ProviderSource;
  });

  const customSources = persistedSources
    .filter((source) => source.kind === "custom")
    .map((source) => ({
      id: source.id,
      name: source.name?.trim() || "Custom Provider",
      kind: "custom" as const,
      providerType:
        source.providerType === "anthropic" ||
        source.providerType === "openai" ||
        source.providerType === "google" ||
        source.providerType === "openai-compatible"
          ? source.providerType
          : "openai-compatible",
      mode: "custom" as const,
      enabled: source.enabled ?? true,
      baseUrl: normalizeBaseUrl(source.baseUrl),
    }));

  const sources = sortSources([...builtinSources, ...customSources]);

  const curatedEntries = CURATED_MODEL_CATALOG.map((catalogItem) => {
    const persisted = persistedEntries.find((entry) => entry.id === catalogItem.id);
    const base = createCuratedEntry(catalogItem);
    return {
      ...base,
      name: persisted?.name?.trim() || base.name,
      enabled: persisted?.enabled ?? base.enabled,
      capabilities: normalizeCapabilitiesOverride(persisted?.capabilities),
      limits: normalizeLimitsOverride(persisted?.limits),
      providerOptions: normalizeProviderOptions(persisted?.providerOptions),
      detectedCapabilities: catalogItem.detectedCapabilities,
      detectedLimits: catalogItem.detectedLimits,
    } satisfies ModelEntry;
  });

  const customSourceIds = new Set(customSources.map((source) => source.id));
  const customEntries = persistedEntries
    .filter((entry) => !entry.builtin && customSourceIds.has(entry.sourceId))
    .map((entry) => ({
      id: entry.id,
      sourceId: entry.sourceId,
      name: entry.name?.trim() || entry.modelId,
      modelId: entry.modelId?.trim() || entry.id,
      enabled: entry.enabled ?? true,
      builtin: false,
      capabilities: normalizeCapabilitiesOverride(entry.capabilities),
      limits: normalizeLimitsOverride(entry.limits),
      providerOptions: normalizeProviderOptions(entry.providerOptions),
      detectedCapabilities: normalizeDetectedCapabilities(entry.detectedCapabilities),
      detectedLimits: normalizeDetectedLimits(entry.detectedLimits),
    }));

  const entries = sortEntries([...curatedEntries, ...customEntries], sources);

  const nextState: ProviderState = {
    sources,
    entries,
    credentials,
  };

  const needsRewrite =
    JSON.stringify(sortSources(persistedSources)) !== JSON.stringify(sources) ||
    JSON.stringify(sortEntries(persistedEntries, sources)) !== JSON.stringify(entries) ||
    JSON.stringify(rawCredentials) !== JSON.stringify(credentials);

  if (needsRewrite) {
    writeProviderState(nextState);
  }

  return nextState;
}

function writeProviderState(state: ProviderState): void {
  writeJsonFile(getUserDataPath(SOURCES_FILE), sortSources(state.sources));
  writeJsonFile(
    getUserDataPath(ENTRIES_FILE),
    sortEntries(state.entries, state.sources),
  );
  writeJsonFile(getUserDataPath(CREDENTIALS_FILE), state.credentials);

  try {
    fs.chmodSync(getUserDataPath(CREDENTIALS_FILE), 0o600);
  } catch {
    // Windows may ignore chmod
  }
}

function requireSource(state: ProviderState, sourceId: string): ProviderSource {
  const source = state.sources.find((item) => item.id === sourceId);
  if (!source) {
    throw new Error("找不到对应的 provider source。");
  }
  return source;
}

function requireEntry(state: ProviderState, entryId: string): ModelEntry {
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) {
    throw new Error("找不到对应的模型条目。");
  }
  return entry;
}

function getModelUsage(entryId: string): ModelUsageConflict[] {
  const settings = getSettings();
  if (settings.defaultModelId === entryId) {
    return [
      {
        scope: "settings",
        referenceType: "default-model",
        referenceId: entryId,
        message: "该模型条目正在被默认模型引用。",
      },
    ];
  }
  return [];
}

function ensureEntryNotInUse(entryId: string): void {
  const conflicts = getModelUsage(entryId);
  if (conflicts.length > 0) {
    throw new Error(conflicts[0]?.message ?? "模型条目仍被引用，无法修改。");
  }
}

function validateSourceDraft(
  draft: ProviderSourceDraft,
  existing?: ProviderSource,
): ProviderSource {
  const kind = existing?.kind ?? "custom";
  const name = draft.name.trim();
  const enabled = draft.enabled ?? true;

  if (kind === "builtin") {
    const providerType = existing?.providerType;
    if (!providerType) {
      throw new Error("内置 provider 无法识别。");
    }

    const mode = draft.mode === "custom" ? "custom" : "native";
    const baseUrl = mode === "custom" ? normalizeBaseUrl(draft.baseUrl) : null;

    if (mode === "custom" && !baseUrl) {
      throw new Error("内置 provider 切到自定义模式时必须填写 Base URL。");
    }

    return {
      id: existing.id,
      name: existing.name,
      kind: "builtin",
      providerType,
      mode,
      enabled,
      baseUrl,
    };
  }

  if (!name) {
    throw new Error("自定义 provider 名称不能为空。");
  }

  if (
    draft.providerType !== "anthropic" &&
    draft.providerType !== "openai" &&
    draft.providerType !== "google" &&
    draft.providerType !== "openai-compatible"
  ) {
    throw new Error("请选择有效的 provider 类型。");
  }

  const baseUrl = normalizeBaseUrl(draft.baseUrl);
  if (!baseUrl) {
    throw new Error("自定义 provider 必须填写 Base URL。");
  }

  return {
    id: existing?.id ?? `custom:${crypto.randomUUID()}`,
    name,
    kind: "custom",
    providerType: draft.providerType,
    mode: "custom",
    enabled,
    baseUrl,
  };
}

function validateEntryDraft(
  state: ProviderState,
  draft: ModelEntryDraft,
  existing?: ModelEntry,
): ModelEntry {
  const source = requireSource(state, draft.sourceId);
  const name = draft.name.trim();
  const modelId = draft.modelId.trim();

  if (!name) {
    throw new Error("模型名称不能为空。");
  }

  if (!modelId) {
    throw new Error("模型 ID 不能为空。");
  }

  if (existing?.builtin) {
    return {
      ...existing,
      enabled: draft.enabled,
      capabilities: normalizeCapabilitiesOverride(draft.capabilities ?? existing.capabilities),
      limits: normalizeLimitsOverride(draft.limits ?? existing.limits),
      providerOptions: normalizeProviderOptions(
        draft.providerOptions ?? existing.providerOptions,
      ),
      name: existing.name,
      modelId: existing.modelId,
      sourceId: existing.sourceId,
    };
  }

  if (source.kind !== "custom") {
    throw new Error("当前 source 不允许新增自定义模型条目。");
  }

  return {
    id: existing?.id ?? `entry:${crypto.randomUUID()}`,
    sourceId: source.id,
    name,
    modelId,
    enabled: draft.enabled,
    builtin: false,
    capabilities: normalizeCapabilitiesOverride(draft.capabilities),
    limits: normalizeLimitsOverride(draft.limits),
    providerOptions: normalizeProviderOptions(draft.providerOptions),
    detectedCapabilities: existing?.detectedCapabilities ?? {
      vision: null,
      imageOutput: null,
      toolCalling: null,
      reasoning: null,
      embedding: null,
    },
    detectedLimits: existing?.detectedLimits ?? {
      contextWindow: null,
      maxOutputTokens: null,
    },
  };
}

function resolveCapabilities(entry: ModelEntry): ModelCapabilities {
  return {
    vision: entry.capabilities.vision ?? entry.detectedCapabilities.vision,
    imageOutput:
      entry.capabilities.imageOutput ?? entry.detectedCapabilities.imageOutput,
    toolCalling:
      entry.capabilities.toolCalling ?? entry.detectedCapabilities.toolCalling,
    reasoning:
      entry.capabilities.reasoning ?? entry.detectedCapabilities.reasoning,
    embedding:
      entry.capabilities.embedding ?? entry.detectedCapabilities.embedding,
  };
}

function resolveLimits(entry: ModelEntry): ModelLimits {
  return {
    contextWindow:
      entry.limits.contextWindow ?? entry.detectedLimits.contextWindow,
    maxOutputTokens:
      entry.limits.maxOutputTokens ?? entry.detectedLimits.maxOutputTokens,
  };
}

function extractCompat(entry: ModelEntry): Record<string, unknown> | undefined {
  const compat = entry.providerOptions?.compat;
  if (!compat || typeof compat !== "object" || Array.isArray(compat)) {
    return undefined;
  }
  return compat as Record<string, unknown>;
}

function extractHeaders(entry: ModelEntry): Record<string, string> | undefined {
  const headers = entry.providerOptions?.headers;
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function buildCustomModel(source: ProviderSource, entry: ModelEntry): Model<any> {
  const capabilities = resolveCapabilities(entry);
  const limits = resolveLimits(entry);
  return {
    id: entry.modelId,
    name: entry.name,
    api: getRuntimeApiForProviderType(source.providerType),
    provider: source.providerType,
    baseUrl: source.baseUrl ?? "",
    reasoning: capabilities.reasoning ?? false,
    input: capabilities.vision ? ["text", "image"] : ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: limits.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: limits.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    headers: extractHeaders(entry),
    compat:
      source.providerType === "openai-compatible"
        ? (extractCompat(entry) as any)
        : undefined,
  };
}

function buildNativeModel(source: ProviderSource, entry: ModelEntry): Model<any> {
  const baseModel = getModel(source.providerType as any, entry.modelId as never);
  if (!baseModel) {
    throw new Error(`找不到内置模型：${entry.modelId}`);
  }
  const limits = resolveLimits(entry);
  return {
    ...baseModel,
    name: entry.name,
    contextWindow: limits.contextWindow ?? baseModel.contextWindow,
    maxTokens: limits.maxOutputTokens ?? baseModel.maxTokens,
    headers: extractHeaders(entry) ?? baseModel.headers,
  };
}

export function listSources(): ProviderSource[] {
  return readProviderState().sources.map(cloneSource);
}

export function getSource(sourceId: string): ProviderSource | null {
  const source = readProviderState().sources.find((item) => item.id === sourceId);
  return source ? cloneSource(source) : null;
}

export function saveSource(draft: ProviderSourceDraft): ProviderSource {
  const state = readProviderState();
  const existing = draft.id
    ? state.sources.find((item) => item.id === draft.id)
    : undefined;
  const normalized = validateSourceDraft(draft, existing);

  if (!normalized.enabled) {
    const activeDefaultEntry = state.entries.find(
      (entry) => entry.id === getSettings().defaultModelId,
    );
    if (activeDefaultEntry?.sourceId === normalized.id) {
      throw new Error("当前默认模型正在使用这个 source，无法直接禁用。");
    }
  }

  const nextSources = existing
    ? state.sources.map((source) =>
        source.id === existing.id ? normalized : source,
      )
    : [...state.sources, normalized];

  writeProviderState({
    ...state,
    sources: sortSources(nextSources),
  });

  return cloneSource(normalized);
}

export function deleteSource(sourceId: string): void {
  const state = readProviderState();
  const source = requireSource(state, sourceId);

  if (source.kind === "builtin") {
    throw new Error("内置 source 不能删除。");
  }

  if (state.entries.some((entry) => entry.sourceId === sourceId)) {
    throw new Error("请先清空该 source 下的模型条目。");
  }

  const nextCredentials = { ...state.credentials };
  delete nextCredentials[sourceId];

  writeProviderState({
    sources: state.sources.filter((item) => item.id !== sourceId),
    entries: state.entries,
    credentials: nextCredentials,
  });
}

export function getCredentials(sourceId: string): SourceCredentials {
  const state = readProviderState();
  requireSource(state, sourceId);
  const apiKey = state.credentials[sourceId]?.apiKey?.trim();
  return {
    sourceId,
    masked: apiKey ? maskKey(apiKey) : "",
    hasKey: !!apiKey,
  };
}

export function setCredentials(sourceId: string, apiKey: string): void {
  const state = readProviderState();
  requireSource(state, sourceId);
  const trimmed = apiKey.trim();
  const nextCredentials = { ...state.credentials };

  if (!trimmed) {
    delete nextCredentials[sourceId];
  } else {
    nextCredentials[sourceId] = { apiKey: trimmed };
  }

  writeProviderState({
    ...state,
    credentials: nextCredentials,
  });
}

export async function testSource(
  draft: ProviderSourceDraft,
): Promise<SourceTestResult> {
  let normalized: ProviderSource;
  try {
    const state = readProviderState();
    const existing = draft.id
      ? state.sources.find((item) => item.id === draft.id)
      : undefined;
    normalized = validateSourceDraft(draft, existing);

    const apiKey = normalized.id ? state.credentials[normalized.id]?.apiKey : undefined;
    if (!apiKey) {
      return draft.id
        ? { success: false, error: "请先保存 API Key。" }
        : { success: true, models: [] };
    }

    const candidateEntry =
      state.entries.find(
        (entry) => entry.sourceId === normalized.id && entry.enabled,
      ) ??
      {
        id: "probe",
        sourceId: normalized.id,
        name: "Probe Model",
        modelId:
          normalized.providerType === "anthropic"
            ? "claude-haiku-3-5-20241022"
            : normalized.providerType === "openai"
              ? "gpt-4o-mini"
              : normalized.providerType === "google"
                ? "gemini-2.0-flash"
                : "",
        enabled: true,
        builtin: false,
        capabilities: createEmptyCapabilitiesOverride(),
        limits: createEmptyLimitsOverride(),
        providerOptions: null,
        detectedCapabilities: {
          vision: null,
          imageOutput: null,
          toolCalling: null,
          reasoning: null,
          embedding: null,
        },
        detectedLimits: {
          contextWindow: null,
          maxOutputTokens: null,
        },
      };

    if (!candidateEntry.modelId) {
      return { success: true, models: [] };
    }

    const model =
      normalized.kind === "builtin" && normalized.mode === "native"
        ? buildNativeModel(normalized, candidateEntry)
        : buildCustomModel(normalized, candidateEntry);

    await completeSimple(
      model,
      {
        systemPrompt: "",
        messages: [{ role: "user", content: "hi", timestamp: Date.now() }],
        tools: [],
      },
      { apiKey, maxTokens: 1 },
    );

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "连接测试失败",
    };
  }
}

export function listEntries(): ModelEntry[] {
  return readProviderState().entries.map(cloneEntry);
}

export function listEntriesBySource(sourceId: string): ModelEntry[] {
  const state = readProviderState();
  requireSource(state, sourceId);
  return state.entries
    .filter((entry) => entry.sourceId === sourceId)
    .map(cloneEntry);
}

export function getEntry(entryId: string): ModelEntry | null {
  const entry = readProviderState().entries.find((item) => item.id === entryId);
  return entry ? cloneEntry(entry) : null;
}

export function saveEntry(draft: ModelEntryDraft): ModelEntry {
  const state = readProviderState();
  const existing = draft.id
    ? state.entries.find((item) => item.id === draft.id)
    : undefined;
  const normalized = validateEntryDraft(state, draft, existing);

  if (!normalized.enabled && getSettings().defaultModelId === normalized.id) {
    throw new Error("该模型条目正在被默认模型引用，无法禁用。");
  }

  const nextEntries = existing
    ? state.entries.map((entry) => (entry.id === existing.id ? normalized : entry))
    : [...state.entries, normalized];

  writeProviderState({
    ...state,
    entries: sortEntries(nextEntries, state.sources),
  });

  return cloneEntry(normalized);
}

export function deleteEntry(entryId: string): void {
  const state = readProviderState();
  const entry = requireEntry(state, entryId);
  ensureEntryNotInUse(entry.id);

  if (entry.builtin) {
    throw new Error("内置 curated 模型条目不能删除，只能禁用。");
  }

  writeProviderState({
    ...state,
    entries: state.entries.filter((item) => item.id !== entryId),
  });
}

export function listSelectableModelEntries(): ModelEntry[] {
  const state = readProviderState();
  const enabledSourceIds = new Set(
    state.sources.filter((source) => source.enabled).map((source) => source.id),
  );
  return state.entries
    .filter((entry) => entry.enabled && enabledSourceIds.has(entry.sourceId))
    .map(cloneEntry);
}

export function resolveModelEntry(entryId: string): ResolvedModelEntry {
  const state = readProviderState();
  const entry =
    state.entries.find((item) => item.id === entryId) ??
    state.entries.find((item) => item.id === DEFAULT_MODEL_ENTRY_ID);

  if (!entry) {
    throw new Error("没有可用的模型条目。");
  }

  const source = requireSource(state, entry.sourceId);
  if (!source.enabled) {
    throw new Error(`当前 source「${source.name}」已被禁用。`);
  }
  if (!entry.enabled) {
    throw new Error(`当前模型条目「${entry.name}」已被禁用。`);
  }

  const apiKey = state.credentials[source.id]?.apiKey?.trim();
  if (!apiKey) {
    throw new Error(`source「${source.name}」尚未配置 API Key。`);
  }

  const model =
    source.kind === "builtin" && source.mode === "native"
      ? buildNativeModel(source, entry)
      : buildCustomModel(source, entry);

  return {
    entry: cloneEntry(entry),
    source: cloneSource(source),
    apiKey,
    model,
    runtimeSignature: JSON.stringify({
      sourceId: source.id,
      sourceEnabled: source.enabled,
      providerType: source.providerType,
      mode: source.mode,
      baseUrl: source.baseUrl,
      entryId: entry.id,
      modelId: entry.modelId,
      entryEnabled: entry.enabled,
      capabilities: entry.capabilities,
      limits: entry.limits,
      providerOptions: entry.providerOptions,
      apiKey,
    }),
  };
}

export { getModelUsage };
