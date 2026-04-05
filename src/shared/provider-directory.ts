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

export const CURATED_MODEL_CATALOG: CuratedModelCatalogItem[] = [
  {
    id: createBuiltinEntryId("anthropic", "claude-sonnet-4-20250514"),
    sourceId: BUILTIN_PROVIDER_SOURCE_IDS.anthropic,
    providerType: "anthropic",
    name: "Claude Sonnet 4",
    modelId: "claude-sonnet-4-20250514",
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
  },
  {
    id: createBuiltinEntryId("anthropic", "claude-opus-4-20250514"),
    sourceId: BUILTIN_PROVIDER_SOURCE_IDS.anthropic,
    providerType: "anthropic",
    name: "Claude Opus 4",
    modelId: "claude-opus-4-20250514",
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
  },
  {
    id: createBuiltinEntryId("anthropic", "claude-haiku-3-5-20241022"),
    sourceId: BUILTIN_PROVIDER_SOURCE_IDS.anthropic,
    providerType: "anthropic",
    name: "Claude Haiku 3.5",
    modelId: "claude-haiku-3-5-20241022",
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
  },
  {
    id: createBuiltinEntryId("openai", "gpt-4o"),
    sourceId: BUILTIN_PROVIDER_SOURCE_IDS.openai,
    providerType: "openai",
    name: "GPT-4o",
    modelId: "gpt-4o",
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
  },
  {
    id: createBuiltinEntryId("openai", "gpt-4o-mini"),
    sourceId: BUILTIN_PROVIDER_SOURCE_IDS.openai,
    providerType: "openai",
    name: "GPT-4o Mini",
    modelId: "gpt-4o-mini",
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
  },
  {
    id: createBuiltinEntryId("google", "gemini-2.0-flash"),
    sourceId: BUILTIN_PROVIDER_SOURCE_IDS.google,
    providerType: "google",
    name: "Gemini 2.0 Flash",
    modelId: "gemini-2.0-flash",
    detectedCapabilities: {
      vision: true,
      imageOutput: false,
      toolCalling: true,
      reasoning: true,
      embedding: false,
    },
    detectedLimits: {
      contextWindow: 1_000_000,
      maxOutputTokens: 8_192,
    },
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

