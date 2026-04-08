export type T1MemoryQuery = {
  sessionId: string;
  query: string;
  limit?: number;
};

export type T1MemoryHit = {
  id: string;
  summary: string;
  score: number;
  source: string;
};

export interface T1MemoryStore {
  isEnabled(): boolean;
  search(input: T1MemoryQuery): Promise<T1MemoryHit[]>;
}

class DisabledT1MemoryStore implements T1MemoryStore {
  isEnabled(): boolean {
    return false;
  }

  async search(): Promise<T1MemoryHit[]> {
    return [];
  }
}

const t1MemoryStore: T1MemoryStore = new DisabledT1MemoryStore();

export async function getSemanticMemoryPromptSection(input: {
  sessionId: string;
  query: string | null;
}): Promise<string> {
  const query = input.query?.trim();
  if (!query || !t1MemoryStore.isEnabled()) {
    return "";
  }

  const hits = await t1MemoryStore.search({
    sessionId: input.sessionId,
    query,
    limit: 3,
  });
  if (hits.length === 0) {
    return "";
  }

  const lines = hits.map((hit, index) => `${index + 1}. ${hit.summary}`);
  return [
    "## Semantic Memory",
    "以下是系统检索到的长期记忆摘要：",
    ...lines,
  ].join("\n");
}

export function getT1MemoryStore(): T1MemoryStore {
  return t1MemoryStore;
}
