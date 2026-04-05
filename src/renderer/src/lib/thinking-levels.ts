import type { ModelEntry, ThinkingLevel } from "@shared/contracts";

export type ThinkingOption = {
  value: ThinkingLevel;
  label: string;
};

export const THINKING_LEVEL_OPTIONS: ThinkingOption[] = [
  { value: "off", label: "自适应" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "xhigh", label: "极高" },
];

const THINKING_LEVEL_LABEL_MAP: Record<ThinkingLevel, string> = Object.fromEntries(
  THINKING_LEVEL_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ThinkingLevel, string>;

const XHIGH_MODEL_MARKERS = [
  "gpt-5.1-codex-max",
  "gpt-5.2",
  "gpt-5.2-codex",
  "gpt-5.3",
  "gpt-5.3-codex",
  "gpt-5.4",
  "gpt-5.4-codex",
  "gpt-5-codex",
] as const;

export function normalizeThinkingLevel(value: unknown): ThinkingLevel {
  switch (value) {
    case "off":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return value;
    case "minimal":
      return "low";
    default:
      return "off";
  }
}

export function getThinkingLevelLabel(level: ThinkingLevel): string {
  return THINKING_LEVEL_LABEL_MAP[level];
}

export function resolveModelReasoningSupport(
  entry?: ModelEntry | null,
): boolean | null {
  if (!entry) {
    return null;
  }

  return entry.capabilities.reasoning ?? entry.detectedCapabilities.reasoning;
}

export function supportsXHighThinking(entry?: ModelEntry | null): boolean {
  if (!entry) {
    return false;
  }

  const modelId = entry.modelId.trim().toLowerCase();
  if (!modelId) {
    return false;
  }

  return XHIGH_MODEL_MARKERS.some((marker) => {
    return (
      modelId === marker ||
      modelId.startsWith(`${marker}-`) ||
      modelId.endsWith(`/${marker}`) ||
      modelId.includes(`/${marker}-`)
    );
  });
}

export function getThinkingOptionsForModel(
  entry?: ModelEntry | null,
  currentLevel?: ThinkingLevel,
): ThinkingOption[] {
  const baseOptions = THINKING_LEVEL_OPTIONS.filter(
    (option) => option.value !== "xhigh",
  );

  if (supportsXHighThinking(entry) || currentLevel === "xhigh") {
    return THINKING_LEVEL_OPTIONS;
  }

  return baseOptions;
}

export function getEffectiveThinkingLevel(
  entry: ModelEntry | null | undefined,
  level: ThinkingLevel,
): ThinkingLevel {
  const normalizedLevel = normalizeThinkingLevel(level);

  if (resolveModelReasoningSupport(entry) === false) {
    return "off";
  }

  if (normalizedLevel === "xhigh" && !supportsXHighThinking(entry)) {
    return "high";
  }

  return normalizedLevel;
}

export function canConfigureThinking(entry?: ModelEntry | null): boolean {
  return resolveModelReasoningSupport(entry) !== false;
}

export function getThinkingHint(entry?: ModelEntry | null): string {
  const reasoningSupport = resolveModelReasoningSupport(entry);

  if (reasoningSupport === false) {
    return "当前模型不支持单独设置思考强度，系统会自动忽略这项配置。";
  }

  if (reasoningSupport === null) {
    return "模型能力未标注时，会按通用思考强度处理；“自适应”表示跟随模型默认策略。";
  }

  return "“自适应”会跟随模型默认策略；越高越偏向深度推理，但响应会更慢。";
}
