import { buildAmbientContextSection } from "../ambient-context.js";
import { getSemanticMemoryPromptSection } from "../memory/service.js";
import {
  assemblePromptSections,
  buildPlatformConstitutionSection,
  buildLearningsSection,
  buildRuntimeCapabilitySection,
  buildSemanticMemorySection,
  buildSessionSnapshotSection,
  buildTalkNormalSection,
  buildTurnIntentPatchSection,
  buildWorkspacePolicySection,
  type PromptSection,
} from "../prompt-control-plane.js";
import { buildSoulPromptSection } from "../soul.js";
import { getSettings } from "../settings.js";
import {
  ensureContextSnapshotCoverage,
  getSessionMemoryPromptSection,
} from "./snapshot.js";

const SYSTEM_PROMPT_RATIO = 0.18;
const MIN_SYSTEM_PROMPT_BUDGET = 1_200;
const MAX_SYSTEM_PROMPT_BUDGET = 12_000;
const MIN_TRIMMABLE_SECTION_TOKENS = 120;
const MIN_SECTION_BODY_CHARS = 160;

export type ContextEnginePromptRuntime = {
  sourceName: string;
  providerType: "anthropic" | "openai" | "google" | "openai-compatible";
  modelName: string;
  modelId: string;
  contextWindow: number | null;
  supportsVision: boolean;
  supportsToolCalling: boolean;
};

export type BuildContextSystemPromptInput = {
  workspacePath: string;
  sessionId: string;
  latestUserText?: string | null;
  toolNames: string[];
  thinkingLevel: string;
  promptRuntime: ContextEnginePromptRuntime;
};

function estimateSectionTokens(section: PromptSection): number {
  return 18 + Math.ceil(section.content.length * 0.8);
}

function estimateSectionsTokens(sections: PromptSection[]): number {
  return sections.reduce((sum, section) => sum + estimateSectionTokens(section), 0);
}

function resolveSystemPromptBudget(contextWindow: number | null): number | null {
  if (typeof contextWindow !== "number" || contextWindow <= 0) {
    return null;
  }

  return Math.max(
    MIN_SYSTEM_PROMPT_BUDGET,
    Math.min(MAX_SYSTEM_PROMPT_BUDGET, Math.floor(contextWindow * SYSTEM_PROMPT_RATIO)),
  );
}

function truncateSectionContent(section: PromptSection, targetTokens: number): PromptSection | null {
  const estimatedTokens = estimateSectionTokens(section);
  if (estimatedTokens <= targetTokens) {
    return section;
  }

  const targetChars = Math.max(
    MIN_SECTION_BODY_CHARS,
    Math.floor(Math.max(targetTokens - 18, 1) / 0.8),
  );
  if (section.content.length <= targetChars) {
    return section;
  }

  const lines = section.content.split("\n");
  const heading = lines[0] ?? "";
  const body = lines.slice(1).join("\n").trim();
  const suffix = "\n[...已按上下文预算截断]";
  const availableBodyChars = targetChars - heading.length - suffix.length - 1;

  if (!body || availableBodyChars < MIN_SECTION_BODY_CHARS / 2) {
    return null;
  }

  return {
    ...section,
    content: `${heading}\n${body.slice(0, availableBodyChars).trimEnd()}${suffix}`,
  };
}

function trimPromptSectionsForBudget(
  sections: PromptSection[],
  budget: number | null,
): PromptSection[] {
  if (!budget) {
    return sections;
  }

  let working = [...sections];
  let estimated = estimateSectionsTokens(working);
  if (estimated <= budget) {
    return working;
  }

  const trimOrder = [...working]
    .map((section) => section.id)
    .sort((leftId, rightId) => {
      const left = working.find((section) => section.id === leftId)!;
      const right = working.find((section) => section.id === rightId)!;
      if (left.trimPriority !== right.trimPriority) {
        return left.trimPriority - right.trimPriority;
      }
      return right.priority - left.priority;
    });

  for (const sectionId of trimOrder) {
    if (estimated <= budget) {
      break;
    }

    const index = working.findIndex((section) => section.id === sectionId);
    if (index < 0) {
      continue;
    }

    const section = working[index];
    const sectionTokens = estimateSectionTokens(section);
    const overflow = estimated - budget;
    const targetTokens = Math.max(
      MIN_TRIMMABLE_SECTION_TOKENS,
      sectionTokens - overflow,
    );

    if (
      section.role === "memory" ||
      section.authority !== "hard" ||
      section.trimPriority < 90
    ) {
      const truncated = truncateSectionContent(section, targetTokens);
      if (truncated) {
        working[index] = truncated;
        estimated = estimateSectionsTokens(working);
        if (estimated <= budget) {
          break;
        }
      }
    }

    if (section.authority !== "hard") {
      working.splice(index, 1);
      estimated = estimateSectionsTokens(working);
    }
  }

  return working;
}

function buildPromptSections(
  input: BuildContextSystemPromptInput,
  semanticMemory: string,
  snapshot: string,
): PromptSection[] {
  const settings = getSettings();

  return [
    buildPlatformConstitutionSection(),
    buildTalkNormalSection(),
    buildWorkspacePolicySection(buildSoulPromptSection(input.workspacePath)),
    buildRuntimeCapabilitySection({
      workspacePath: input.workspacePath,
      shell: settings.terminal.shell,
      sourceName: input.promptRuntime.sourceName,
      providerType: input.promptRuntime.providerType,
      modelName: input.promptRuntime.modelName,
      modelId: input.promptRuntime.modelId,
      contextWindow: input.promptRuntime.contextWindow,
      supportsVision: input.promptRuntime.supportsVision,
      supportsToolCalling: input.promptRuntime.supportsToolCalling,
      thinkingLevel: input.thinkingLevel,
      toolNames: input.toolNames,
    }),
    buildAmbientContextSection(input.workspacePath),
    buildSemanticMemorySection(semanticMemory),
    buildLearningsSection(),
    buildSessionSnapshotSection(snapshot),
    buildTurnIntentPatchSection(input.latestUserText),
  ].filter((section): section is PromptSection => !!section);
}

export async function buildContextSystemPrompt(
  input: BuildContextSystemPromptInput,
): Promise<string> {
  await ensureContextSnapshotCoverage(input.sessionId);

  const [snapshot, semanticMemory] = await Promise.all([
    getSessionMemoryPromptSection(input.sessionId),
    getSemanticMemoryPromptSection({
      sessionId: input.sessionId,
      query: input.latestUserText ?? null,
    }),
  ]);

  const sections = buildPromptSections(input, semanticMemory, snapshot);
  const budget = resolveSystemPromptBudget(input.promptRuntime.contextWindow);
  const trimmedSections = trimPromptSectionsForBudget(sections, budget);

  return assemblePromptSections(trimmedSections);
}
