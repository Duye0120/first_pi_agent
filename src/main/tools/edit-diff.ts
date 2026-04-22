/**
 * Shared diff/edit utilities adapted from pi-mono coding-agent.
 *
 * Goals:
 * - Multiple disjoint edits in a single tool call (matched against the original).
 * - Fuzzy matching against minor whitespace / Unicode quote / dash differences.
 * - Preserve BOM and original line endings (CRLF on Windows files).
 *
 * Source reference: badlogic/pi-mono packages/coding-agent/src/core/tools/edit-diff.ts (MIT).
 */

import { createTwoFilesPatch, parsePatch } from "../diff-shim.js";

export type Edit = {
  oldText: string;
  newText: string;
};

export type StructuredPatchHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
};

export type AppliedEditsResult = {
  baseContent: string;
  newContent: string;
  usedFuzzy: boolean;
};

export function detectLineEnding(content: string): "\r\n" | "\n" {
  const crlfIdx = content.indexOf("\r\n");
  const lfIdx = content.indexOf("\n");
  if (lfIdx === -1) return "\n";
  if (crlfIdx === -1) return "\n";
  return crlfIdx < lfIdx ? "\r\n" : "\n";
}

export function normalizeToLF(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function restoreLineEndings(text: string, ending: "\r\n" | "\n"): string {
  return ending === "\r\n" ? text.replace(/\n/g, "\r\n") : text;
}

export function stripBom(content: string): { bom: string; text: string } {
  return content.startsWith("\uFEFF")
    ? { bom: "\uFEFF", text: content.slice(1) }
    : { bom: "", text: content };
}

/**
 * Normalize text for fuzzy matching:
 * - NFKC Unicode normalize
 * - Strip trailing whitespace per line
 * - Smart quotes -> ASCII
 * - Various dashes -> ASCII hyphen
 * - Unicode spaces -> regular space
 */
export function normalizeForFuzzyMatch(text: string): string {
  return text
    .normalize("NFKC")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ");
}

type FuzzyMatchResult = {
  found: boolean;
  index: number;
  matchLength: number;
  usedFuzzyMatch: boolean;
  contentForReplacement: string;
};

function fuzzyFindText(content: string, oldText: string): FuzzyMatchResult {
  const exactIndex = content.indexOf(oldText);
  if (exactIndex !== -1) {
    return {
      found: true,
      index: exactIndex,
      matchLength: oldText.length,
      usedFuzzyMatch: false,
      contentForReplacement: content,
    };
  }

  const fuzzyContent = normalizeForFuzzyMatch(content);
  const fuzzyOldText = normalizeForFuzzyMatch(oldText);
  const fuzzyIndex = fuzzyContent.indexOf(fuzzyOldText);

  if (fuzzyIndex === -1) {
    return {
      found: false,
      index: -1,
      matchLength: 0,
      usedFuzzyMatch: false,
      contentForReplacement: content,
    };
  }

  return {
    found: true,
    index: fuzzyIndex,
    matchLength: fuzzyOldText.length,
    usedFuzzyMatch: true,
    contentForReplacement: fuzzyContent,
  };
}

function countOccurrences(content: string, oldText: string): number {
  // Count fuzzy occurrences so the duplicate-detection mirrors how we match.
  const fuzzyContent = normalizeForFuzzyMatch(content);
  const fuzzyOldText = normalizeForFuzzyMatch(oldText);
  if (!fuzzyOldText.length) return 0;
  return fuzzyContent.split(fuzzyOldText).length - 1;
}

type MatchedEdit = {
  editIndex: number;
  matchIndex: number;
  matchLength: number;
  newText: string;
};

function notFoundError(path: string, editIndex: number, total: number): Error {
  if (total === 1) {
    return new Error(
      `未在 ${path} 中找到 oldText。请确保完全匹配（含空白与换行）。`,
    );
  }
  return new Error(
    `未在 ${path} 中找到 edits[${editIndex}].oldText。每段 oldText 都需与原文完全匹配。`,
  );
}

function duplicateError(
  path: string,
  editIndex: number,
  total: number,
  occurrences: number,
): Error {
  if (total === 1) {
    return new Error(
      `在 ${path} 中找到 ${occurrences} 处匹配，oldText 必须唯一。请加入更多上下文使其唯一。`,
    );
  }
  return new Error(
    `在 ${path} 中找到 ${occurrences} 处 edits[${editIndex}] 匹配。每段 oldText 都必须唯一，请加入更多上下文。`,
  );
}

function emptyOldTextError(path: string, editIndex: number, total: number): Error {
  if (total === 1) return new Error(`oldText 不能为空（${path}）。`);
  return new Error(`edits[${editIndex}].oldText 不能为空（${path}）。`);
}

function noChangeError(path: string, total: number): Error {
  if (total === 1) {
    return new Error(
      `${path} 替换前后内容相同，未产生改动。请检查 newText 是否真的与 oldText 不同。`,
    );
  }
  return new Error(`${path} 替换前后内容相同，未产生任何改动。`);
}

/**
 * Apply one or more edits against LF-normalized content. Each edit's oldText is
 * matched against the same baseline (no incremental matching). If any edit
 * needs fuzzy matching, the entire operation runs in fuzzy-normalized space.
 */
export function applyEditsToNormalizedContent(
  normalizedContent: string,
  edits: Edit[],
  path: string,
): AppliedEditsResult {
  const normalizedEdits = edits.map((edit) => ({
    oldText: normalizeToLF(edit.oldText),
    newText: normalizeToLF(edit.newText),
  }));

  for (let i = 0; i < normalizedEdits.length; i += 1) {
    if (!normalizedEdits[i].oldText.length) {
      throw emptyOldTextError(path, i, normalizedEdits.length);
    }
  }

  const initialMatches = normalizedEdits.map((edit) =>
    fuzzyFindText(normalizedContent, edit.oldText),
  );
  const usedFuzzy = initialMatches.some((match) => match.usedFuzzyMatch);
  const baseContent = usedFuzzy
    ? normalizeForFuzzyMatch(normalizedContent)
    : normalizedContent;

  const matched: MatchedEdit[] = [];
  for (let i = 0; i < normalizedEdits.length; i += 1) {
    const edit = normalizedEdits[i];
    const result = fuzzyFindText(baseContent, edit.oldText);
    if (!result.found) {
      throw notFoundError(path, i, normalizedEdits.length);
    }

    const occurrences = countOccurrences(baseContent, edit.oldText);
    if (occurrences > 1) {
      throw duplicateError(path, i, normalizedEdits.length, occurrences);
    }

    matched.push({
      editIndex: i,
      matchIndex: result.index,
      matchLength: result.matchLength,
      newText: edit.newText,
    });
  }

  matched.sort((a, b) => a.matchIndex - b.matchIndex);
  for (let i = 1; i < matched.length; i += 1) {
    const prev = matched[i - 1];
    const cur = matched[i];
    if (prev.matchIndex + prev.matchLength > cur.matchIndex) {
      throw new Error(
        `edits[${prev.editIndex}] 与 edits[${cur.editIndex}] 在 ${path} 中重叠，请合并或拆成不相交区域。`,
      );
    }
  }

  let newContent = baseContent;
  for (let i = matched.length - 1; i >= 0; i -= 1) {
    const edit = matched[i];
    newContent =
      newContent.substring(0, edit.matchIndex) +
      edit.newText +
      newContent.substring(edit.matchIndex + edit.matchLength);
  }

  if (baseContent === newContent) {
    throw noChangeError(path, normalizedEdits.length);
  }

  return { baseContent, newContent, usedFuzzy };
}

/** Build a simple structured patch consumable by the renderer DiffView. */
export function buildStructuredPatch(
  filePath: string,
  oldContent: string,
  newContent: string,
): StructuredPatchHunk[] {
  const patch = createTwoFilesPatch(
    filePath,
    filePath,
    oldContent,
    newContent,
    "original",
    "updated",
    { context: 3 },
  );
  return parsePatch(patch).flatMap((entry) =>
    entry.hunks.map((hunk) => ({
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      lines: hunk.lines,
    })),
  );
}
