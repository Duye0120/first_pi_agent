import type {
  DesktopApi,
  ModelEntry,
  ProviderSource,
  ProviderType,
} from "@shared/contracts";

export type SelectableModelOption = {
  value: string;
  label: string;
  description: string;
  sourceId: string;
  entry: ModelEntry;
  source: ProviderSource;
};

export function deriveModelEntryName(modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) {
    return "未命名模型";
  }

  return trimmed
    .replace(/\//g, " / ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function loadProviderDirectory(desktopApi: DesktopApi) {
  const [sources, entries] = await Promise.all([
    desktopApi.providers.listSources(),
    desktopApi.models.listEntries(),
  ]);

  return { sources, entries };
}

export function buildSelectableModelOptions(
  sources: ProviderSource[],
  entries: ModelEntry[],
): SelectableModelOption[] {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));

  return entries
    .map((entry) => {
      const source = sourceMap.get(entry.sourceId);
      if (!source || !source.enabled || !entry.enabled) {
        return null;
      }

      return {
        value: entry.id,
        label: entry.name,
        description: `${source.name} · ${providerTypeLabel(source.providerType)}`,
        sourceId: source.id,
        entry,
        source,
      } satisfies SelectableModelOption;
    })
    .filter((option): option is SelectableModelOption => !!option)
    .sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
}

export function findEntryLabel(
  entryId: string,
  sources: ProviderSource[],
  entries: ModelEntry[],
): string {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const entry = entries.find((item) => item.id === entryId);
  const source = entry ? sourceMap.get(entry.sourceId) : undefined;

  if (!entry) {
    return "当前模型";
  }

  return source ? `${entry.name} · ${source.name}` : entry.name;
}

export function providerTypeLabel(providerType: ProviderType): string {
  switch (providerType) {
    case "anthropic":
      return "Anthropic";
    case "openai":
      return "OpenAI";
    case "google":
      return "Google";
    case "openai-compatible":
      return "OpenAI Compatible";
  }
}

export function sourceModeLabel(source: ProviderSource): string {
  if (source.kind === "custom") {
    return "自定义接入";
  }

  return source.mode === "native" ? "官方接口" : "自定义中转";
}
