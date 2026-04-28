import { BotIcon } from "lucide-react";
import type { ModelEntry, ProviderSource } from "@shared/contracts";
import type { ModelOption } from "@renderer/components/assistant-ui/model-selector";
import { buildSelectableModelOptions } from "@renderer/lib/provider-directory";

export function formatStatusTokenCount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  if (value < 1_000) {
    return String(Math.round(value));
  }

  return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1).replace(/\.0$/, "")}k`;
}

export function isBtwCommand(text: string) {
  return /^\/btw(?:\s|$)/i.test(text.trim());
}

export function buildModelOptions(
  sources: ProviderSource[],
  entries: ModelEntry[],
): ModelOption[] {
  return buildSelectableModelOptions(sources, entries).map((model) => ({
    id: model.value,
    name: model.label,
    description: model.description,
    groupId: model.groupId,
    groupLabel: model.groupLabel,
    icon: <BotIcon className="size-4" />,
    disabled: false,
  }));
}

export function collectClipboardFiles(dataTransfer: DataTransfer): File[] {
  const files: File[] = [];
  const seen = new Set<string>();

  const appendFile = (file: File | null) => {
    if (!file) return;

    const fileKey = [file.name, file.size, file.type, file.lastModified].join(
      ":",
    );

    if (seen.has(fileKey)) return;
    seen.add(fileKey);
    files.push(file);
  };

  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== "file") continue;
    appendFile(item.getAsFile());
  }

  for (const file of Array.from(dataTransfer.files)) {
    appendFile(file);
  }

  return files;
}
