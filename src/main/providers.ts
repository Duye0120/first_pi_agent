import { app, safeStorage } from "electron";
import { createHash } from "node:crypto";
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
  ModelRoutingRole,
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
  findKnownModelMetadata,
  getUnknownModelCapabilities,
  getUnknownModelLimits,
  getRuntimeApiForProviderType,
  normalizeKnownModelId,
} from "../shared/provider-directory.js";
import { getSettings, updateSettings } from "./settings.js";
import { appLogger } from "./logger.js";

const SOURCES_FILE = "provider-sources.json";
const ENTRIES_FILE = "model-entries.json";
const CREDENTIALS_FILE = "credentials.json";
const LEGACY_BUILTIN_PROVIDERS = new Set(["anthropic", "openai", "google"]);
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 8_192;

type CredentialsStore = Record<string, { apiKey?: string }>;
type PersistedCredentialRecord = {
  apiKey?: string;
  encryptedApiKey?: string;
  storage?: "plain" | "safeStorage";
  baseUrl?: string;
};
type RawCredentialsStore = Record<string, PersistedCredentialRecord>;

type ProviderState = {
  sources: ProviderSource[];
  entries: ModelEntry[];
  credentials: CredentialsStore;
};

type ResolvedModelEntry = {
  entry: ModelEntry;
  source: ProviderSource;
  getApiKey: () => string;
  model: Model<any>;
  runtimeSignature: string;
};

type ReadCredentialsResult = {
  credentials: CredentialsStore;
  legacyBaseUrls: Map<string, string>;
  needsRewrite: boolean;
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

function canEncryptCredentials(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function decryptStoredApiKey(
  sourceKey: string,
  record: PersistedCredentialRecord,
): { apiKey: string; needsRewrite: boolean } | null {
  if (typeof record.encryptedApiKey === "string" && record.encryptedApiKey.trim()) {
    try {
      const decrypted = safeStorage.decryptString(
        Buffer.from(record.encryptedApiKey, "base64"),
      ).trim();
      if (!decrypted) {
        return null;
      }
      return {
        apiKey: decrypted,
        needsRewrite:
          record.storage !== "safeStorage" ||
          typeof record.apiKey === "string",
      };
    } catch (error) {
      appLogger.warn({
        scope: "providers",
        message: "读取加密 API Key 失败，当前 source 将被视为未配置。",
        data: { sourceKey },
        error,
      });
      return null;
    }
  }

  const apiKey = typeof record.apiKey === "string" ? record.apiKey.trim() : "";
  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    needsRewrite: canEncryptCredentials() || record.storage === "safeStorage",
  };
}

function readCredentialsStore(filePath: string): ReadCredentialsResult {
  const rawCredentials = readJsonFile<RawCredentialsStore>(filePath, {});
  const credentials: CredentialsStore = {};
  const legacyBaseUrls = new Map<string, string>();
  let needsRewrite = false;

  for (const [key, value] of Object.entries(rawCredentials)) {
    if (!value || typeof value !== "object") {
      needsRewrite = true;
      continue;
    }

    const decrypted = decryptStoredApiKey(key, value);
    const baseUrl = normalizeBaseUrl(value.baseUrl);
    const targetKey = LEGACY_BUILTIN_PROVIDERS.has(key) ? `builtin:${key}` : key;

    if (targetKey !== key) {
      needsRewrite = true;
    }

    if (decrypted?.apiKey) {
      credentials[targetKey] = { apiKey: decrypted.apiKey };
    }

    if (decrypted?.needsRewrite) {
      needsRewrite = true;
    }

    if (baseUrl) {
      if (LEGACY_BUILTIN_PROVIDERS.has(key)) {
        legacyBaseUrls.set(targetKey, baseUrl);
        needsRewrite = true;
      } else {
        needsRewrite = true;
      }
    }
  }

  return { credentials, legacyBaseUrls, needsRewrite };
}

function serializeCredentialsStore(credentials: CredentialsStore): RawCredentialsStore {
  const canEncrypt = canEncryptCredentials();
  const persisted: RawCredentialsStore = {};

  for (const [sourceId, value] of Object.entries(credentials)) {
    const apiKey = value.apiKey?.trim();
    if (!apiKey) {
      continue;
    }

    if (canEncrypt) {
      persisted[sourceId] = {
        storage: "safeStorage",
        encryptedApiKey: safeStorage.encryptString(apiKey).toString("base64"),
      };
      continue;
    }

    persisted[sourceId] = {
      storage: "plain",
      apiKey,
    };
  }

  return persisted;
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  // M25: 校验合法 http(s) URL；非法值降级为 null，避免后续 fetch 抛 TypeError 阻塞链路。
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
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

function fingerprintKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
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

function resolveKnownDetectedMetadata(
  modelId: string,
): { detectedCapabilities: ModelCapabilities; detectedLimits: ModelLimits } | null {
  const metadata = findKnownModelMetadata(modelId);
  if (!metadata) {
    return null;
  }

  return {
    detectedCapabilities: metadata.detectedCapabilities,
    detectedLimits: metadata.detectedLimits,
  };
}

function readProviderState(): ProviderState {
  const sourcesPath = getUserDataPath(SOURCES_FILE);
  const entriesPath = getUserDataPath(ENTRIES_FILE);
  const credentialsPath = getUserDataPath(CREDENTIALS_FILE);

  const persistedSources = readJsonFile<ProviderSource[]>(sourcesPath, []);
  const persistedEntries = readJsonFile<ModelEntry[]>(entriesPath, []);
  const credentialsResult = readCredentialsStore(credentialsPath);
  const { credentials, legacyBaseUrls } = credentialsResult;

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
    .map((entry) => {
      const modelId = entry.modelId?.trim() || entry.id;
      const knownDetectedMetadata = resolveKnownDetectedMetadata(modelId);

      return {
        id: entry.id,
        sourceId: entry.sourceId,
        name: entry.name?.trim() || modelId,
        modelId,
        enabled: entry.enabled ?? true,
        builtin: false,
        capabilities: normalizeCapabilitiesOverride(entry.capabilities),
        limits: normalizeLimitsOverride(entry.limits),
        providerOptions: normalizeProviderOptions(entry.providerOptions),
        detectedCapabilities:
          knownDetectedMetadata?.detectedCapabilities ??
          normalizeDetectedCapabilities(entry.detectedCapabilities),
        detectedLimits:
          knownDetectedMetadata?.detectedLimits ??
          normalizeDetectedLimits(entry.detectedLimits),
      } satisfies ModelEntry;
    });

  const entries = sortEntries([...curatedEntries, ...customEntries], sources);

  const nextState: ProviderState = {
    sources,
    entries,
    credentials,
  };

  const needsRewrite =
    JSON.stringify(sortSources(persistedSources)) !== JSON.stringify(sources) ||
    JSON.stringify(sortEntries(persistedEntries, sources)) !== JSON.stringify(entries) ||
    credentialsResult.needsRewrite;

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
  writeJsonFile(
    getUserDataPath(CREDENTIALS_FILE),
    serializeCredentialsStore(state.credentials),
  );

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

function getRoleDisplayLabel(role: ModelRoutingRole): string {
  switch (role) {
    case "chat":
      return "聊天模型";
    case "utility":
      return "工具模型";
    case "subagent":
      return "Sub-agent 模型";
    case "compact":
      return "Compact 模型";
    default:
      return "模型";
  }
}

function getReferenceType(role: ModelRoutingRole): ModelUsageConflict["referenceType"] {
  switch (role) {
    case "chat":
      return "chat-model";
    case "utility":
      return "utility-model";
    case "subagent":
      return "subagent-model";
    case "compact":
      return "compact-model";
    default:
      return "chat-model";
  }
}

function getExplicitRoleModelIds(
  settings = getSettings(),
): Array<{ role: ModelRoutingRole; modelId: string }> {
  return [
    { role: "chat", modelId: settings.modelRouting.chat.modelId },
    { role: "utility", modelId: settings.modelRouting.utility.modelId ?? "" },
    { role: "subagent", modelId: settings.modelRouting.subagent.modelId ?? "" },
    { role: "compact", modelId: settings.modelRouting.compact.modelId ?? "" },
  ].filter((item): item is { role: ModelRoutingRole; modelId: string } =>
    item.modelId.trim().length > 0,
  );
}

function updateModelRoutingFallback(
  entryIdsToRemove: Set<string>,
  fallbackEntryId: string | null,
): void {
  const settings = getSettings();
  const currentRouting = settings.modelRouting;
  const nextRouting = {
    chat: {
      modelId: entryIdsToRemove.has(currentRouting.chat.modelId)
        ? fallbackEntryId ?? currentRouting.chat.modelId
        : currentRouting.chat.modelId,
    },
    utility: {
      modelId:
        currentRouting.utility.modelId &&
          entryIdsToRemove.has(currentRouting.utility.modelId)
          ? fallbackEntryId
          : currentRouting.utility.modelId,
    },
    subagent: {
      modelId:
        currentRouting.subagent.modelId &&
          entryIdsToRemove.has(currentRouting.subagent.modelId)
          ? fallbackEntryId
          : currentRouting.subagent.modelId,
    },
    compact: {
      modelId:
        currentRouting.compact.modelId &&
          entryIdsToRemove.has(currentRouting.compact.modelId)
          ? fallbackEntryId
          : currentRouting.compact.modelId,
    },
  };

  updateSettings({
    modelRouting: nextRouting,
  });
}

function getModelUsage(entryId: string): ModelUsageConflict[] {
  return getExplicitRoleModelIds().flatMap(({ role, modelId }) =>
    modelId === entryId
      ? [
        {
          scope: "settings",
          referenceType: getReferenceType(role),
          referenceId: entryId,
          message: `该模型条目正在被${getRoleDisplayLabel(role)}引用。`,
        } satisfies ModelUsageConflict,
      ]
      : [],
  );
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

  if (modelId === "new-model-id") {
    throw new Error("请先填写真实的模型 ID，再保存模型条目。");
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

  const knownDetectedMetadata = resolveKnownDetectedMetadata(modelId);
  const shouldReuseExistingDetectedMetadata =
    !!existing &&
    normalizeKnownModelId(existing.modelId) === normalizeKnownModelId(modelId);
  const detectedCapabilities =
    knownDetectedMetadata?.detectedCapabilities ??
    (shouldReuseExistingDetectedMetadata
      ? normalizeDetectedCapabilities(existing?.detectedCapabilities)
      : getUnknownModelCapabilities());
  const detectedLimits =
    knownDetectedMetadata?.detectedLimits ??
    (shouldReuseExistingDetectedMetadata
      ? normalizeDetectedLimits(existing?.detectedLimits)
      : getUnknownModelLimits());

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
    detectedCapabilities,
    detectedLimits,
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

function inferOpenAiCompatibleCompat(
  source: ProviderSource,
): Record<string, unknown> | undefined {
  if (source.providerType !== "openai-compatible") {
    return undefined;
  }

  const baseUrl = source.baseUrl?.trim().toLowerCase();
  if (!baseUrl) {
    return undefined;
  }

  // DashScope's OpenAI-compatible endpoints reject the `developer` role and
  // follow the older `max_tokens` style rather than newer OpenAI defaults.
  if (baseUrl.includes("dashscope.aliyuncs.com")) {
    return {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    };
  }

  if (isLocalOpenAiCompatibleSource(source)) {
    return {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    };
  }

  return undefined;
}

function isLocalOpenAiCompatibleSource(source: ProviderSource): boolean {
  if (source.providerType !== "openai-compatible" || !source.baseUrl) {
    return false;
  }

  try {
    const url = new URL(source.baseUrl);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1" ||
      url.hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

function getApiKeyForSource(
  credentials: ProviderState["credentials"],
  source: ProviderSource,
): string {
  const apiKey = credentials[source.id]?.apiKey?.trim();
  if (apiKey) {
    return apiKey;
  }

  return isLocalOpenAiCompatibleSource(source) ? "local" : "";
}

function resolveCompat(
  source: ProviderSource,
  entry: ModelEntry,
): Record<string, unknown> | undefined {
  const inferredCompat = inferOpenAiCompatibleCompat(source);
  const explicitCompat = extractCompat(entry);

  if (!inferredCompat && !explicitCompat) {
    return undefined;
  }

  return {
    ...(inferredCompat ?? {}),
    ...(explicitCompat ?? {}),
  };
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
        ? (resolveCompat(source, entry) as any)
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
    const referencedRoleEntry = getExplicitRoleModelIds().find(({ modelId }) => {
      const entry = state.entries.find((candidate) => candidate.id === modelId);
      return entry?.sourceId === normalized.id;
    });
    if (referencedRoleEntry) {
      throw new Error(
        `当前${getRoleDisplayLabel(referencedRoleEntry.role)}正在使用这个 source，无法直接禁用。`,
      );
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

  const entriesToDelete = state.entries.filter((entry) => entry.sourceId === sourceId);
  const nextSources = state.sources.filter((item) => item.id !== sourceId);
  const nextEntries = state.entries.filter((entry) => entry.sourceId !== sourceId);
  const entryIdsToDelete = new Set(entriesToDelete.map((entry) => entry.id));
  const needsChatFallback = entryIdsToDelete.has(getSettings().modelRouting.chat.modelId);
  const fallbackEntry = sortEntries(nextEntries, nextSources).find((entry) => {
    if (!entry.enabled) {
      return false;
    }

    return nextSources.some(
      (candidate) => candidate.id === entry.sourceId && candidate.enabled,
    );
  });

  if (needsChatFallback && !fallbackEntry) {
    throw new Error("当前聊天模型也在这个提供商里，且没有其它可用模型可切换，无法删除。");
  }

  if (entryIdsToDelete.size > 0) {
    updateModelRoutingFallback(entryIdsToDelete, fallbackEntry?.id ?? null);
  }

  const nextCredentials = { ...state.credentials };
  delete nextCredentials[sourceId];

  writeProviderState({
    sources: nextSources,
    entries: nextEntries,
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

    const apiKey = getApiKeyForSource(state.credentials, normalized);
    if (!apiKey) {
      return draft.id
        ? { success: false, error: "请先保存 API Key。" }
        : { success: true, models: [] };
    }

    const candidateEntry =
      state.entries.find(
        (entry) => entry.sourceId === normalized.id && entry.enabled,
      ) ??
      (() => {
        const modelId =
          normalized.providerType === "anthropic"
            ? "claude-haiku-3-5-20241022"
            : normalized.providerType === "openai"
              ? "gpt-4o-mini"
              : normalized.providerType === "google"
                ? "gemini-2.0-flash"
                : "";
        const knownDetectedMetadata = resolveKnownDetectedMetadata(modelId);

        return {
          id: "probe",
          sourceId: normalized.id,
          name: "Probe Model",
          modelId,
          enabled: true,
          builtin: false,
          capabilities: createEmptyCapabilitiesOverride(),
          limits: createEmptyLimitsOverride(),
          providerOptions: null,
          detectedCapabilities:
            knownDetectedMetadata?.detectedCapabilities ??
            getUnknownModelCapabilities(),
          detectedLimits:
            knownDetectedMetadata?.detectedLimits ?? getUnknownModelLimits(),
        } satisfies ModelEntry;
      })();

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

export async function fetchSourceModels(
  draft: ProviderSourceDraft,
): Promise<import("../shared/contracts.js").SourceModelsResult> {
  let normalized: ProviderSource;
  try {
    const state = readProviderState();
    const existing = draft.id
      ? state.sources.find((item) => item.id === draft.id)
      : undefined;
    normalized = validateSourceDraft(draft, existing);
  } catch (error) {
    return {
      success: false,
      models: [],
      error: error instanceof Error ? error.message : "拉取模型失败",
    };
  }

  const apiKey = (() => {
    const stored = readProviderState().credentials[normalized.id]?.apiKey?.trim();
    if (stored) return stored;
    return isLocalOpenAiCompatibleSource(normalized) ? "local" : "";
  })();

  if (!apiKey) {
    return { success: false, models: [], error: "请先保存 API Key。" };
  }

  try {
    const ids = await callListModels(normalized, apiKey);
    const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
    unique.sort((a, b) => a.localeCompare(b));
    return { success: true, models: unique };
  } catch (error) {
    return {
      success: false,
      models: [],
      error: error instanceof Error ? error.message : "拉取模型失败",
    };
  }
}

async function callListModels(
  source: ProviderSource,
  apiKey: string,
): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    if (source.providerType === "anthropic") {
      const baseUrl = source.baseUrl ?? "https://api.anthropic.com";
      const url = joinPath(baseUrl, "/v1/models");
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: controller.signal,
      });
      const json = await readJson(response);
      const data = Array.isArray((json as { data?: unknown }).data)
        ? ((json as { data: unknown[] }).data)
        : [];
      return data
        .map((item) => (item as { id?: unknown }).id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
    }

    if (source.providerType === "google") {
      const baseUrl = source.baseUrl ?? "https://generativelanguage.googleapis.com";
      const url = `${joinPath(baseUrl, "/v1beta/models")}?key=${encodeURIComponent(apiKey)}&pageSize=200`;
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });
      const json = await readJson(response);
      const models = Array.isArray((json as { models?: unknown }).models)
        ? ((json as { models: unknown[] }).models)
        : [];
      return models
        .map((item) => (item as { name?: unknown }).name)
        .filter((name): name is string => typeof name === "string" && name.length > 0)
        .map((name) => name.replace(/^models\//, ""));
    }

    // openai 与 openai-compatible 都按 OpenAI 协议走 /models
    const baseUrl = source.baseUrl ?? "https://api.openai.com/v1";
    const url = joinPath(baseUrl, "/models");
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });
    const json = await readJson(response);
    const data = Array.isArray((json as { data?: unknown }).data)
      ? ((json as { data: unknown[] }).data)
      : Array.isArray((json as { models?: unknown }).models)
        ? ((json as { models: unknown[] }).models)
        : [];
    return data
      .map((item) => {
        if (typeof item === "string") return item;
        const obj = item as { id?: unknown; name?: unknown; model?: unknown };
        if (typeof obj.id === "string") return obj.id;
        if (typeof obj.model === "string") return obj.model;
        if (typeof obj.name === "string") return obj.name;
        return "";
      })
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  } finally {
    clearTimeout(timer);
  }
}

function joinPath(baseUrl: string, suffix: string): string {
  const trimmedBase = baseUrl.replace(/\/+$/u, "");
  const trimmedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${trimmedBase}${trimmedSuffix}`;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    const snippet = text.slice(0, 240).trim();
    throw new Error(
      snippet
        ? `请求失败 ${response.status}: ${snippet}`
        : `请求失败 ${response.status}`,
    );
  }
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("响应不是合法的 JSON。");
  }
}

export function listEntries(): ModelEntry[] {
  return readProviderState().entries.map(cloneEntry);
}

export function resolveEmbeddingProvider(
  sourceId: string,
): {
  providerType: "openai" | "openai-compatible" | "anthropic" | "google";
  baseUrl: string;
  apiKey: string;
} | null {
  const state = readProviderState();
  const source = state.sources.find((item) => item.id === sourceId);
  if (!source || !source.enabled) {
    return null;
  }
  const baseUrl =
    source.baseUrl ??
    (source.providerType === "openai"
      ? "https://api.openai.com/v1"
      : source.providerType === "anthropic"
        ? "https://api.anthropic.com"
        : source.providerType === "google"
          ? "https://generativelanguage.googleapis.com"
          : null);
  if (!baseUrl) {
    return null;
  }
  const apiKey = getApiKeyForSource(state.credentials, source);
  if (!apiKey) {
    return null;
  }
  return {
    providerType: source.providerType,
    baseUrl,
    apiKey,
  };
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

  if (!normalized.enabled) {
    const conflict = getModelUsage(normalized.id)[0];
    if (conflict) {
      throw new Error(conflict.message);
    }
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

  const apiKey = getApiKeyForSource(state.credentials, source);
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
    getApiKey: () => apiKey,
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
      apiKeyFingerprint: fingerprintKey(apiKey),
    }),
  };
}

export { getModelUsage };
