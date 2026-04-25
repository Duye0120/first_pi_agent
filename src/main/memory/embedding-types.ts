import type {
  MemoryAddInput,
  MemoryListInput,
  MemoryRebuildResult,
  MemoryRecord,
  MemorySearchResult,
  MemoryStats,
} from "../../shared/contracts.js";
import type { MemoryEmbeddingModelId } from "../../shared/memory.js";

export type WorkerState = MemoryStats["workerState"];

export type MemoryWorkerInitData = {
  kind: "chela-memory-worker";
  dbPath: string;
  cacheDir: string;
};

export type EmbeddingProviderInfo = {
  providerType: "openai" | "openai-compatible" | "anthropic" | "google";
  baseUrl: string;
  apiKey: string;
};

export type AddRequest = {
  id: string;
  type: "add";
  payload: {
    input: MemoryAddInput;
    modelId: MemoryEmbeddingModelId;
    provider: EmbeddingProviderInfo | null;
  };
};

export type SearchRequest = {
  id: string;
  type: "search";
  payload: {
    query: string;
    limit: number;
    candidateLimit: number;
    minScore: number;
    modelId: MemoryEmbeddingModelId;
    provider: EmbeddingProviderInfo | null;
  };
};

export type StatsRequest = {
  id: string;
  type: "stats";
  payload: {
    selectedModelId: MemoryEmbeddingModelId;
    candidateLimit: number;
  };
};

export type ListRequest = {
  id: string;
  type: "list";
  payload: {
    input?: MemoryListInput;
  };
};

export type RebuildRequest = {
  id: string;
  type: "rebuild";
  payload: {
    modelId: MemoryEmbeddingModelId;
    provider: EmbeddingProviderInfo | null;
  };
};

export type MemoryWorkerRequest =
  | AddRequest
  | SearchRequest
  | StatsRequest
  | ListRequest
  | RebuildRequest;

export type ReadyMessage = {
  type: "ready";
};

export type SuccessResponse =
  | {
      id: string;
      ok: true;
      result: MemoryRecord;
    }
  | {
      id: string;
      ok: true;
      result: MemorySearchResult[];
    }
  | {
      id: string;
      ok: true;
      result: MemoryRecord[];
    }
  | {
      id: string;
      ok: true;
      result: Omit<MemoryStats, "workerState">;
    }
  | {
      id: string;
      ok: true;
      result: MemoryRebuildResult;
    };

export type ErrorResponse = {
  id: string;
  ok: false;
  error: string;
};

export type MemoryWorkerResultResponse = SuccessResponse | ErrorResponse;
export type MemoryWorkerResponse = MemoryWorkerResultResponse | ReadyMessage;
