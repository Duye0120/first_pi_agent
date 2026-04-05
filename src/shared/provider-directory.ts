import type {
  ModelCapabilities,
  ModelCapabilitiesOverride,
  ModelEntry,
  ModelLimits,
  ModelLimitsOverride,
  ProviderSource,
  ProviderType,
} from "./contracts.js";

export const BUILTIN_PROVIDER_SOURCE_IDS = {
  anthropic: "builtin:anthropic",
  openai: "builtin:openai",
  google: "builtin:google",
} as const;

export const DEFAULT_MODEL_ENTRY_ID =
  "builtin:anthropic:claude-sonnet-4-20250514";

export function createBuiltinEntryId(
  providerType: Extract<ProviderType, "anthropic" | "openai" | "google">,
  modelId: string,
): string {
  return `builtin:${providerType}:${modelId}`;
}

export function getRuntimeApiForProviderType(providerType: ProviderType):
  | "anthropic-messages"
  | "openai-responses"
  | "google-generative-ai"
  | "openai-completions" {
  switch (providerType) {
    case "anthropic":
      return "anthropic-messages";
    case "openai":
      return "openai-responses";
    case "google":
      return "google-generative-ai";
    case "openai-compatible":
      return "openai-completions";
  }
}

export function createEmptyCapabilitiesOverride(): ModelCapabilitiesOverride {
  return {
    vision: null,
    imageOutput: null,
    toolCalling: null,
    reasoning: null,
    embedding: null,
  };
}

export function createEmptyLimitsOverride(): ModelLimitsOverride {
  return {
    contextWindow: null,
    maxOutputTokens: null,
  };
}

export function getUnknownModelCapabilities(): ModelCapabilities {
  return {
    vision: null,
    imageOutput: null,
    toolCalling: null,
    reasoning: null,
    embedding: null,
  };
}

export function getUnknownModelLimits(): ModelLimits {
  return {
    contextWindow: null,
    maxOutputTokens: null,
  };
}

function cloneDetectedCapabilities(capabilities: ModelCapabilities): ModelCapabilities {
  return { ...capabilities };
}

function cloneDetectedLimits(limits: ModelLimits): ModelLimits {
  return { ...limits };
}

export type KnownModelMetadata = {
  modelId: string;
  name: string;
  aliases?: string[];
  detectedCapabilities: ModelCapabilities;
  detectedLimits: ModelLimits;
};

function defineKnownModelMetadata(item: KnownModelMetadata): KnownModelMetadata {
  return {
    ...item,
    aliases: item.aliases ? [...item.aliases] : undefined,
    detectedCapabilities: cloneDetectedCapabilities(item.detectedCapabilities),
    detectedLimits: cloneDetectedLimits(item.detectedLimits),
  };
}

export function normalizeKnownModelId(modelId: string): string {
  const trimmed = modelId.trim().toLowerCase();
  return trimmed.startsWith("models/") ? trimmed.slice("models/".length) : trimmed;
}

// Most provider model-list APIs still do not expose reliable limits/capabilities,
// so we keep a compact catalog here for mainstream stable model IDs and aliases.
export const KNOWN_MODEL_METADATA_CATALOG: KnownModelMetadata[] = [
  defineKnownModelMetadata({
    modelId: "gpt-5.2",
    name: "GPT-5.2",
    aliases: ["gpt-5.2-2025-12-11"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 400_000,
      maxOutputTokens: 128_000,
    },
  }),
  defineKnownModelMetadata({
    modelId: "gpt-5-mini",
    name: "GPT-5 Mini",
    aliases: ["gpt-5-mini-2025-08-07"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 400_000,
      maxOutputTokens: 128_000,
    },
  }),
  defineKnownModelMetadata({
    modelId: "gpt-4.1",
    name: "GPT-4.1",
    aliases: ["gpt-4.1-2025-04-14"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: false,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 1_047_576,
      maxOutputTokens: 32_768,
    },
  }),
  defineKnownModelMetadata({
    modelId: "gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    aliases: ["gpt-4.1-mini-2025-04-14"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: false,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 1_047_576,
      maxOutputTokens: 32_768,
    },
  }),
  defineKnownModelMetadata({
    modelId: "gpt-4o",
    name: "GPT-4o",
    aliases: ["gpt-4o-2024-11-20"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
    },
  }),
  defineKnownModelMetadata({
    modelId: "gpt-4o-mini",
    name: "GPT-4o Mini",
    aliases: ["gpt-4o-mini-2024-07-18"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
    },
  }),
  defineKnownModelMetadata({
    modelId: "o4-mini",
    name: "o4-mini",
    aliases: ["o4-mini-2025-04-16"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 200_000,
      maxOutputTokens: 100_000,
    },
  }),
  defineKnownModelMetadata({
    modelId: "claude-opus-4-1-20250805",
    name: "Claude Opus 4.1",
    aliases: ["claude-opus-4-1"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 200_000,
      maxOutputTokens: 32_000,
    },
  }),
  defineKnownModelMetadata({
    modelId: "claude-opus-4-20250514",
    name: "Claude Opus 4",
    aliases: ["claude-opus-4-0"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 200_000,
      maxOutputTokens: 32_000,
    },
  }),
  defineKnownModelMetadata({
    modelId: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    aliases: ["claude-sonnet-4-0"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 200_000,
      maxOutputTokens: 64_000,
    },
  }),
  defineKnownModelMetadata({
    modelId: "claude-3-7-sonnet-20250219",
    name: "Claude 3.7 Sonnet",
    aliases: ["claude-3-7-sonnet-latest"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 200_000,
      maxOutputTokens: 64_000,
    },
  }),
  defineKnownModelMetadata({
    modelId: "claude-haiku-3-5-20241022",
    name: "Claude Haiku 3.5",
    aliases: ["claude-3-5-haiku-latest"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: false,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
    },
  }),
  defineKnownModelMetadata({
    modelId: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    aliases: ["gemini-2.5-pro-preview-06-05"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 1_048_576,
      maxOutputTokens: 65_536,
    },
  }),
  defineKnownModelMetadata({
    modelId: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    aliases: ["gemini-2.5-flash-preview-09-2025"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 1_048_576,
      maxOutputTokens: 65_536,
    },
  }),
  defineKnownModelMetadata({
    modelId: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    aliases: ["gemini-2.0-flash-001"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 1_048_576,
      maxOutputTokens: 8_192,
    },
  }),
  defineKnownModelMetadata({
    modelId: "kimi-k2.5",
    name: "Kimi K2.5",
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 256_000,
      maxOutputTokens: null,
    },
  }),
  defineKnownModelMetadata({
    modelId: "kimi-k2-thinking",
    name: "Kimi K2 Thinking",
    aliases: ["kimi-k2-thinking-turbo"],
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 256_000,
      maxOutputTokens: null,
    },
  }),
  defineKnownModelMetadata({
    modelId: "kimi-k2",
    name: "Kimi K2",
    aliases: ["kimi-k2-0905-preview", "kimi-k2-turbo-preview"],
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: false,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 256_000,
      maxOutputTokens: null,
    },
  }),
  defineKnownModelMetadata({
    modelId: "deepseek-chat",
    name: "DeepSeek Chat",
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: false,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 128_000,
      maxOutputTokens: 8_192,
    },
  }),
  defineKnownModelMetadata({
    modelId: "deepseek-reasoner",
    name: "DeepSeek Reasoner",
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 128_000,
      maxOutputTokens: 64_000,
    },
  }),
  defineKnownModelMetadata({
    modelId: "qwen3-max",
    name: "Qwen3 Max",
    aliases: ["qwen3-max-2025-09-23"],
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 262_144,
      maxOutputTokens: 65_536,
    },
  }),
  defineKnownModelMetadata({
    modelId: "qwen3.5-plus",
    name: "Qwen3.5 Plus",
    aliases: ["qwen3.5-plus-2026-02-15"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 1_000_000,
      maxOutputTokens: 65_536,
    },
  }),
  defineKnownModelMetadata({
    modelId: "qwen3.5-flash",
    name: "Qwen3.5 Flash",
    aliases: ["qwen3.5-flash-2026-02-23"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 1_000_000,
      maxOutputTokens: 65_536,
    },
  }),
  defineKnownModelMetadata({
    modelId: "qwen-plus",
    name: "Qwen Plus",
    aliases: ["qwen-plus-2025-12-01"],
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 995_904,
      maxOutputTokens: 32_768,
    },
  }),
  defineKnownModelMetadata({
    modelId: "qwen-flash",
    name: "Qwen Flash",
    aliases: ["qwen-flash-2025-07-28"],
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 995_904,
      maxOutputTokens: 32_768,
    },
  }),
  defineKnownModelMetadata({
    modelId: "glm-5",
    name: "GLM-5",
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 200_000,
      maxOutputTokens: 128_000,
    },
  }),
  defineKnownModelMetadata({
    modelId: "glm-4.7",
    name: "GLM-4.7",
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 200_000,
      maxOutputTokens: 128_000,
    },
  }),
  defineKnownModelMetadata({
    modelId: "glm-4.6",
    name: "GLM-4.6",
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 200_000,
      maxOutputTokens: 128_000,
    },
  }),
  defineKnownModelMetadata({
    modelId: "glm-4.5-air",
    name: "GLM-4.5 Air",
    detectedCapabilities: {
      vision: false,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 128_000,
      maxOutputTokens: 96_000,
    },
  }),
  defineKnownModelMetadata({
    modelId: "glm-5v-turbo",
    name: "GLM-5V Turbo",
    aliases: ["glm-5v"],
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 200_000,
      maxOutputTokens: 128_000,
    },
  }),
];

const KNOWN_MODEL_METADATA_BY_ID = new Map<string, KnownModelMetadata>();

for (const metadata of KNOWN_MODEL_METADATA_CATALOG) {
  KNOWN_MODEL_METADATA_BY_ID.set(normalizeKnownModelId(metadata.modelId), metadata);

  for (const alias of metadata.aliases ?? []) {
    KNOWN_MODEL_METADATA_BY_ID.set(normalizeKnownModelId(alias), metadata);
  }
}

const KNOWN_MODEL_PREFIX_ALIASES = [
  { prefix: "gpt-5.2-", targetModelId: "gpt-5.2" },
  { prefix: "gpt-5-mini-", targetModelId: "gpt-5-mini" },
  { prefix: "gpt-4.1-", targetModelId: "gpt-4.1" },
  { prefix: "gpt-4.1-mini-", targetModelId: "gpt-4.1-mini" },
  { prefix: "gpt-4o-", targetModelId: "gpt-4o" },
  { prefix: "gpt-4o-mini-", targetModelId: "gpt-4o-mini" },
  { prefix: "o4-mini-", targetModelId: "o4-mini" },
  { prefix: "gemini-2.5-pro-preview", targetModelId: "gemini-2.5-pro" },
  { prefix: "gemini-2.5-flash-preview", targetModelId: "gemini-2.5-flash" },
  { prefix: "gemini-2.0-flash-", targetModelId: "gemini-2.0-flash" },
  { prefix: "qwen3-max-", targetModelId: "qwen3-max" },
  { prefix: "qwen3.5-plus-", targetModelId: "qwen3.5-plus" },
  { prefix: "qwen3.5-flash-", targetModelId: "qwen3.5-flash" },
  { prefix: "qwen-plus-", targetModelId: "qwen-plus" },
  { prefix: "qwen-flash-", targetModelId: "qwen-flash" },
];

export function findKnownModelMetadata(modelId: string): KnownModelMetadata | null {
  const normalizedModelId = normalizeKnownModelId(modelId);
  if (!normalizedModelId) {
    return null;
  }

  const directMatch = KNOWN_MODEL_METADATA_BY_ID.get(normalizedModelId);
  if (directMatch) {
    return defineKnownModelMetadata(directMatch);
  }

  const prefixMatch = KNOWN_MODEL_PREFIX_ALIASES.find(({ prefix }) =>
    normalizedModelId.startsWith(prefix),
  );
  if (!prefixMatch) {
    return null;
  }

  const matchedMetadata = KNOWN_MODEL_METADATA_BY_ID.get(prefixMatch.targetModelId);
  return matchedMetadata ? defineKnownModelMetadata(matchedMetadata) : null;
}

export type CuratedModelCatalogItem = {
  id: string;
  sourceId: string;
  providerType: Extract<ProviderType, "anthropic" | "openai" | "google">;
  name: string;
  modelId: string;
  detectedCapabilities: ModelCapabilities;
  detectedLimits: ModelLimits;
};

export const BUILTIN_SOURCES: ProviderSource[] = [
  {
    id: BUILTIN_PROVIDER_SOURCE_IDS.anthropic,
    name: "Anthropic",
    kind: "builtin",
    providerType: "anthropic",
    mode: "native",
    enabled: true,
    baseUrl: null,
  },
  {
    id: BUILTIN_PROVIDER_SOURCE_IDS.openai,
    name: "OpenAI",
    kind: "builtin",
    providerType: "openai",
    mode: "native",
    enabled: true,
    baseUrl: null,
  },
  {
    id: BUILTIN_PROVIDER_SOURCE_IDS.google,
    name: "Google",
    kind: "builtin",
    providerType: "google",
    mode: "native",
    enabled: true,
    baseUrl: null,
  },
];

function requireKnownModelMetadata(modelId: string): KnownModelMetadata {
  const metadata = findKnownModelMetadata(modelId);
  if (!metadata) {
    throw new Error(`Known model metadata is missing for ${modelId}.`);
  }
  return metadata;
}

export const CURATED_MODEL_CATALOG: CuratedModelCatalogItem[] = [
  {
    id: createBuiltinEntryId("anthropic", "claude-sonnet-4-20250514"),
    sourceId: BUILTIN_PROVIDER_SOURCE_IDS.anthropic,
    providerType: "anthropic",
    name: "Claude Sonnet 4",
    modelId: "claude-sonnet-4-20250514",
    detectedCapabilities: requireKnownModelMetadata("claude-sonnet-4-20250514")
      .detectedCapabilities,
    detectedLimits: requireKnownModelMetadata("claude-sonnet-4-20250514")
      .detectedLimits,
  },
  {
    id: createBuiltinEntryId("anthropic", "claude-opus-4-20250514"),
    sourceId: BUILTIN_PROVIDER_SOURCE_IDS.anthropic,
    providerType: "anthropic",
    name: "Claude Opus 4",
    modelId: "claude-opus-4-20250514",
    detectedCapabilities: requireKnownModelMetadata("claude-opus-4-20250514")
      .detectedCapabilities,
    detectedLimits: requireKnownModelMetadata("claude-opus-4-20250514")
      .detectedLimits,
  },
  {
    id: createBuiltinEntryId("anthropic", "claude-haiku-3-5-20241022"),
    sourceId: BUILTIN_PROVIDER_SOURCE_IDS.anthropic,
    providerType: "anthropic",
    name: "Claude Haiku 3.5",
    modelId: "claude-haiku-3-5-20241022",
    detectedCapabilities: requireKnownModelMetadata("claude-haiku-3-5-20241022")
      .detectedCapabilities,
    detectedLimits: requireKnownModelMetadata("claude-haiku-3-5-20241022")
      .detectedLimits,
  },
  {
    id: createBuiltinEntryId("openai", "gpt-4o"),
    sourceId: BUILTIN_PROVIDER_SOURCE_IDS.openai,
    providerType: "openai",
    name: "GPT-4o",
    modelId: "gpt-4o",
    detectedCapabilities: requireKnownModelMetadata("gpt-4o").detectedCapabilities,
    detectedLimits: requireKnownModelMetadata("gpt-4o").detectedLimits,
  },
  {
    id: createBuiltinEntryId("openai", "gpt-4o-mini"),
    sourceId: BUILTIN_PROVIDER_SOURCE_IDS.openai,
    providerType: "openai",
    name: "GPT-4o Mini",
    modelId: "gpt-4o-mini",
    detectedCapabilities: requireKnownModelMetadata("gpt-4o-mini")
      .detectedCapabilities,
    detectedLimits: requireKnownModelMetadata("gpt-4o-mini").detectedLimits,
  },
  {
    id: createBuiltinEntryId("google", "gemini-2.0-flash"),
    sourceId: BUILTIN_PROVIDER_SOURCE_IDS.google,
    providerType: "google",
    name: "Gemini 2.0 Flash",
    modelId: "gemini-2.0-flash",
    detectedCapabilities: requireKnownModelMetadata("gemini-2.0-flash")
      .detectedCapabilities,
    detectedLimits: requireKnownModelMetadata("gemini-2.0-flash")
      .detectedLimits,
  },
];

export function createCuratedEntry(catalogItem: CuratedModelCatalogItem): ModelEntry {
  return {
    id: catalogItem.id,
    sourceId: catalogItem.sourceId,
    name: catalogItem.name,
    modelId: catalogItem.modelId,
    enabled: true,
    builtin: true,
    capabilities: createEmptyCapabilitiesOverride(),
    limits: createEmptyLimitsOverride(),
    providerOptions: null,
    detectedCapabilities: catalogItem.detectedCapabilities,
    detectedLimits: catalogItem.detectedLimits,
  };
}

