export type MemorySaveStatus = "saved" | "duplicate" | "merged" | "conflict";

export type MemoryCandidate = {
  summary: string;
  topic: string;
};

export type MemorySaveDecision = {
  status: MemorySaveStatus;
  matchedSummary?: string;
  reason: string;
};

const NON_CONTENT_PATTERN = /[\p{P}\p{S}\s]+/gu;
const NUMBER_PATTERN = /\d+(?::\d+)?/gu;

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(NON_CONTENT_PATTERN, "");
}

function extractNumbers(value: string): string[] {
  return [...value.matchAll(NUMBER_PATTERN)].map((match) => match[0]);
}

function stripNumbers(value: string): string {
  return normalizeText(value.replace(NUMBER_PATTERN, ""));
}

function isSubsequence(needle: string, haystack: string): boolean {
  if (!needle || !haystack || needle.length > haystack.length) {
    return false;
  }

  let needleIndex = 0;
  for (const char of haystack) {
    if (char === needle[needleIndex]) {
      needleIndex += 1;
    }
    if (needleIndex >= needle.length) {
      return true;
    }
  }
  return false;
}

function toBigrams(value: string): Set<string> {
  if (value.length <= 1) {
    return new Set(value ? [value] : []);
  }

  const grams = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) {
    grams.add(value.slice(index, index + 2));
  }
  return grams;
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) {
      intersection += 1;
    }
  }
  return intersection / (left.size + right.size - intersection);
}

function hasNumberConflict(left: string, right: string): boolean {
  const leftNumbers = extractNumbers(left);
  const rightNumbers = extractNumbers(right);
  if (leftNumbers.length === 0 || rightNumbers.length === 0) {
    return false;
  }

  const sameNumbers =
    leftNumbers.length === rightNumbers.length &&
    leftNumbers.every((value, index) => value === rightNumbers[index]);
  if (sameNumbers) {
    return false;
  }

  const leftCore = stripNumbers(left);
  const rightCore = stripNumbers(right);
  return jaccardSimilarity(toBigrams(leftCore), toBigrams(rightCore)) >= 0.45;
}

function getSimilarity(left: string, right: string): number {
  return jaccardSimilarity(toBigrams(normalizeText(left)), toBigrams(normalizeText(right)));
}

export function classifyMemorySaveCandidate(
  candidate: MemoryCandidate,
  existingCandidates: ReadonlyArray<MemoryCandidate>,
): MemorySaveDecision {
  const sameTopic = existingCandidates.filter(
    (entry) => entry.topic === candidate.topic,
  );
  const normalizedCandidate = normalizeText(candidate.summary);

  for (const existing of sameTopic) {
    const normalizedExisting = normalizeText(existing.summary);
    if (normalizedExisting === normalizedCandidate) {
      return {
        status: "duplicate",
        matchedSummary: existing.summary,
        reason: "exact-match",
      };
    }
  }

  for (const existing of sameTopic) {
    if (hasNumberConflict(existing.summary, candidate.summary)) {
      return {
        status: "conflict",
        matchedSummary: existing.summary,
        reason: "numeric-conflict",
      };
    }
  }

  for (const existing of sameTopic) {
    const normalizedExisting = normalizeText(existing.summary);
    if (
      normalizedCandidate.length > normalizedExisting.length &&
      isSubsequence(normalizedExisting, normalizedCandidate)
    ) {
      return {
        status: "merged",
        matchedSummary: existing.summary,
        reason: "more-specific-subsequence",
      };
    }

    if (
      normalizedExisting.length > normalizedCandidate.length &&
      isSubsequence(normalizedCandidate, normalizedExisting)
    ) {
      return {
        status: "duplicate",
        matchedSummary: existing.summary,
        reason: "covered-by-existing-memory",
      };
    }
  }

  let bestMatch: { summary: string; score: number } | null = null;
  for (const existing of sameTopic) {
    const score = getSimilarity(existing.summary, candidate.summary);
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { summary: existing.summary, score };
    }
  }

  if (bestMatch && bestMatch.score >= 0.82) {
    return {
      status: "duplicate",
      matchedSummary: bestMatch.summary,
      reason: "high-similarity",
    };
  }

  return {
    status: "saved",
    reason: "new-memory",
  };
}
