import { app } from "electron";
import { join } from "node:path";
import type {
  MemoryAddInput,
  MemoryListInput,
  MemoryRebuildResult,
  MemorySearchResult,
  MemoryStats,
} from "../../shared/contracts.js";
import { MemoryWorkerClient, type EmbeddingProviderInfo } from "./embedding.js";
import { getSettings } from "../settings.js";
import { normalizeMemoryMetadata } from "./metadata.js";
import { isLocalEmbeddingModelId } from "../../shared/memory.js";
import { resolveEmbeddingProvider } from "../providers.js";

function getMemoryDbPath(): string {
  return join(app.getPath("userData"), "chela-memory.db");
}

function getMemoryCacheDir(): string {
  return join(app.getPath("userData"), "cache", "transformers");
}

function resolveProviderInfo(): EmbeddingProviderInfo | null {
  const settings = getSettings();
  if (isLocalEmbeddingModelId(settings.memory.embeddingModelId)) {
    return null;
  }
  if (!settings.memory.embeddingProviderId) {
    return null;
  }
  return resolveEmbeddingProvider(settings.memory.embeddingProviderId);
}

class ChelaMemoryService {
  private readonly workerClient = new MemoryWorkerClient({
    kind: "chela-memory-worker",
    dbPath: getMemoryDbPath(),
    cacheDir: getMemoryCacheDir(),
  });

  async add(input: MemoryAddInput) {
    const settings = getSettings();
    return this.workerClient.add({
      input: {
        ...input,
        metadata: normalizeMemoryMetadata(input.metadata),
      },
      modelId: settings.memory.embeddingModelId,
      provider: resolveProviderInfo(),
    });
  }

  async search(query: string, limit = 5): Promise<MemorySearchResult[]> {
    const settings = getSettings();
    const normalizedLimit = Math.min(20, Math.max(1, Math.round(limit)));
    return this.workerClient.search({
      query,
      limit: normalizedLimit,
      candidateLimit: settings.memory.searchCandidateLimit,
      minScore: Math.max(0, Math.min(1, settings.memory.similarityThreshold / 100)),
      modelId: settings.memory.embeddingModelId,
      provider: resolveProviderInfo(),
    });
  }

  async getStats(): Promise<MemoryStats> {
    const settings = getSettings();
    const stats = await this.workerClient.getStats({
      selectedModelId: settings.memory.embeddingModelId,
      candidateLimit: settings.memory.searchCandidateLimit,
    });

    return {
      ...stats,
      vectorMemoryCount: stats.totalMemories,
      memdirMemoryCount: 0,
      lastAutoRefreshAt: null,
      lastFailureReason: null,
      vectorSyncStatus: "unknown",
      workerState: this.workerClient.getState(),
    };
  }

  async list(input?: MemoryListInput) {
    return this.workerClient.list(input);
  }

  async rebuild(): Promise<MemoryRebuildResult> {
    const settings = getSettings();
    return this.workerClient.rebuild({
      modelId: settings.memory.embeddingModelId,
      provider: resolveProviderInfo(),
    });
  }

  async delete(memoryId: number): Promise<boolean> {
    return this.workerClient.delete(memoryId);
  }

  async feedback(memoryId: number, delta: number): Promise<boolean> {
    return this.workerClient.feedback(memoryId, delta);
  }
}

const chelaMemoryService = new ChelaMemoryService();

export function getChelaMemoryService(): ChelaMemoryService {
  return chelaMemoryService;
}
