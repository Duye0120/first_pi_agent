import { parentPort, workerData } from "node:worker_threads";
import type { MemoryEmbeddingModelId } from "../../shared/memory.js";
import { QueryVectorCache, rankMemories } from "./retrieval.js";
import type {
  EmbeddingProviderInfo,
  ErrorResponse,
  MemoryWorkerInitData,
  MemoryWorkerRequest,
  MemoryWorkerResultResponse,
  ReadyMessage,
} from "./embedding-types.js";

// Surface any uncaught crash back to the main thread, otherwise the worker
// just exits with code 1 and the parent has no clue what happened.
function reportFatal(error: unknown): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
  try {
    process.stderr.write(`[memory-worker] FATAL ${message}\n`);
  } catch {
    /* ignore */
  }
  if (parentPort) {
    parentPort.postMessage({
      id: "bootstrap",
      ok: false,
      error: message,
    } satisfies ErrorResponse);
  }
}

function reportFatalAndExit(error: unknown): void {
  reportFatal(error);
  // Give the parent a tick to receive the message before tearing down the
  // worker; otherwise process.exit can race the postMessage and the parent
  // only sees a bare "exited with code 1".
  setTimeout(() => process.exit(1), 50);
}

process.on("uncaughtException", (error) => {
  reportFatalAndExit(error);
});
process.on("unhandledRejection", (reason) => {
  reportFatalAndExit(reason);
});

type FeatureExtractionResult = {
  data: ArrayLike<number>;
};

type FeatureExtractionPipeline = (
  input: string,
  options: { pooling: "mean"; normalize: boolean },
) => Promise<FeatureExtractionResult>;

type TransformersModule = {
  env: {
    allowLocalModels?: boolean;
    allowRemoteModels?: boolean;
    cacheDir?: string;
  };
  pipeline: (
    task: "feature-extraction",
    modelId: string,
  ) => Promise<FeatureExtractionPipeline>;
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeVector(vector: number[]): number[] {
  let magnitude = 0;
  for (const value of vector) {
    magnitude += value * value;
  }

  if (magnitude === 0) {
    return vector.map(() => 0);
  }

  const denominator = Math.sqrt(magnitude);
  return vector.map((value) => value / denominator);
}

async function encodeViaProvider(
  text: string,
  modelId: string,
  provider: EmbeddingProviderInfo,
): Promise<number[]> {
  const trimmedBase = provider.baseUrl.replace(/\/+$/u, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    // OpenAI / OpenAI-compatible / Ollama (OpenAI 兼容端点) 统一走 /embeddings。
    // 若 baseUrl 已含 /v1，则直接 /embeddings；否则补 /v1/embeddings。
    const url = /\/v\d+(\/.*)?$/u.test(trimmedBase)
      ? `${trimmedBase}/embeddings`
      : `${trimmedBase}/v1/embeddings`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({ model: modelId, input: text }),
      signal: controller.signal,
    });
    const responseText = await response.text();
    if (!response.ok) {
      const snippet = responseText.slice(0, 240).trim();
      throw new Error(
        snippet
          ? `远端嵌入接口失败 ${response.status}: ${snippet}`
          : `远端嵌入接口失败 ${response.status}`,
      );
    }
    let json: unknown = {};
    if (responseText) {
      try {
        json = JSON.parse(responseText) as unknown;
      } catch {
        throw new Error("远端嵌入响应不是合法的 JSON。");
      }
    }
    const data = (json as { data?: unknown }).data;
    let vector: unknown;
    if (Array.isArray(data) && data.length > 0) {
      vector = (data[0] as { embedding?: unknown }).embedding;
    } else {
      // Ollama 原生 /api/embeddings 兜底（理论上当前不会走到这里，但留一个保险）。
      vector = (json as { embedding?: unknown }).embedding;
    }
    if (!Array.isArray(vector)) {
      throw new Error("远端嵌入响应缺少 embedding 字段。");
    }
    const numbers = vector.map((value) => Number(value));
    if (numbers.some((value) => !Number.isFinite(value))) {
      throw new Error("远端嵌入响应包含非数值。");
    }
    return normalizeVector(numbers);
  } finally {
    clearTimeout(timer);
  }
}

async function createEmbeddingRuntime(cacheDir: string) {
  let activeModelId: string | null = null;
  let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;
  let modelLoaded = false;

  async function getPipeline(
    modelId: MemoryEmbeddingModelId,
  ): Promise<FeatureExtractionPipeline> {
    if (activeModelId === modelId && pipelinePromise) {
      return pipelinePromise;
    }

    pipelinePromise = (async () => {
      try {
        const transformers = (await import("@xenova/transformers")) as unknown as TransformersModule;
        transformers.env.cacheDir = cacheDir;
        transformers.env.allowLocalModels = true;
        transformers.env.allowRemoteModels = true;
        const pipeline = await transformers.pipeline("feature-extraction", modelId);
        modelLoaded = true;
        return pipeline;
      } catch (error) {
        activeModelId = null;
        pipelinePromise = null;
        modelLoaded = false;
        throw error;
      }
    })();
    activeModelId = modelId;
    return pipelinePromise;
  }

  return {
    async encode(
      text: string,
      modelId: MemoryEmbeddingModelId,
      provider: EmbeddingProviderInfo | null,
    ): Promise<number[]> {
      if (provider) {
        const vector = await encodeViaProvider(text, modelId, provider);
        modelLoaded = true;
        return vector;
      }
      const pipeline = await getPipeline(modelId);
      const result = await pipeline(text, {
        pooling: "mean",
        normalize: true,
      });
      return normalizeVector(Array.from(result.data, (value) => Number(value)));
    },
    isModelLoaded(): boolean {
      return modelLoaded;
    },
  };
}

async function startMemoryWorker(data: MemoryWorkerInitData): Promise<void> {
  const port = parentPort;
  if (!port) {
    throw new Error("Chela memory worker missing parent port.");
  }

  // Dynamic import so that any failure to load `better-sqlite3` (e.g. native
  // binding mismatch) surfaces as a Promise rejection we can forward to the
  // main thread instead of a silent worker exit.
  const { MemoryStore } = await import("./store.js");
  const store = new MemoryStore(data.dbPath);
  const embeddingRuntime = await createEmbeddingRuntime(data.cacheDir);
  const queryCache = new QueryVectorCache();
  let queue = Promise.resolve();

  const getQueryVector = async (
    query: string,
    modelId: MemoryEmbeddingModelId,
    provider: EmbeddingProviderInfo | null,
  ): Promise<number[]> => {
    const cached = queryCache.get(query, modelId);
    if (cached) {
      return cached;
    }

    const nextVector = await embeddingRuntime.encode(query, modelId, provider);
    queryCache.set(query, modelId, nextVector);
    return nextVector;
  };

  const handleRequest = async (
    request: MemoryWorkerRequest,
  ): Promise<MemoryWorkerResultResponse> => {
    switch (request.type) {
      case "add": {
        const content = normalizeText(request.payload.input.content);
        if (!content) {
          throw new Error("Memory content cannot be empty.");
        }

        const record = store.add(
          {
            content,
            metadata: request.payload.input.metadata ?? null,
          },
          await embeddingRuntime.encode(
            content,
            request.payload.modelId,
            request.payload.provider,
          ),
          request.payload.modelId,
        );

        return { id: request.id, ok: true, result: record };
      }

      case "search": {
        const query = normalizeText(request.payload.query);
        if (!query) {
          return { id: request.id, ok: true, result: [] };
        }

        const queryVector = await getQueryVector(
          query,
          request.payload.modelId,
          request.payload.provider,
        );
        const candidates = store.listCandidates(request.payload.candidateLimit);
        const results = rankMemories(
          queryVector,
          candidates,
          request.payload.limit,
        ).filter((result) => result.score >= request.payload.minScore);
        store.recordMatches(results.map((result) => result.id));

        return { id: request.id, ok: true, result: results };
      }

      case "stats": {
        const stats = store.getStats();
        return {
          id: request.id,
          ok: true,
          result: {
            ...stats,
            dbPath: store.getPath(),
            selectedModelId: request.payload.selectedModelId,
            modelLoaded: embeddingRuntime.isModelLoaded(),
            candidateLimit: request.payload.candidateLimit,
          },
        };
      }

      case "list": {
        const limit = Math.min(
          200,
          Math.max(1, Math.round(request.payload.input?.limit ?? 80)),
        );
        const sort = request.payload.input?.sort ?? "confidence_desc";
        return {
          id: request.id,
          ok: true,
          result: store.listMemories({
            sort,
            limit,
            filters: request.payload.input,
          }),
        };
      }

      case "rebuild": {
        const candidates = store.listAllCandidates();
        const updates: Array<{ id: number; embedding: number[] }> = [];
        let failedCount = 0;

        for (const candidate of candidates) {
          try {
            updates.push({
              id: candidate.id,
              embedding: await embeddingRuntime.encode(
                candidate.content,
                request.payload.modelId,
                request.payload.provider,
              ),
            });
          } catch {
            failedCount += 1;
          }
        }

        queryCache.clear();
        const updatedCount = store.rebuildEmbeddings(updates, request.payload.modelId);
        const completedAt = new Date().toISOString();
        return {
          id: request.id,
          ok: true,
          result: {
            rebuiltCount: updatedCount,
            failedCount,
            modelId: request.payload.modelId,
            completedAt,
          },
        };
      }

      case "delete": {
        return {
          id: request.id,
          ok: true,
          result: store.deleteMemory(request.payload.memoryId),
        };
      }

      case "feedback": {
        return {
          id: request.id,
          ok: true,
          result: store.adjustFeedback(
            request.payload.memoryId,
            request.payload.delta,
          ),
        };
      }
    }
  };

  port.postMessage({ type: "ready" } satisfies ReadyMessage);

  port.on("message", (request: MemoryWorkerRequest) => {
    queue = queue
      .then(async () => {
        try {
          port.postMessage(await handleRequest(request));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Chela memory worker failed.";
          port.postMessage({
            id: request.id,
            ok: false,
            error: message,
          } satisfies ErrorResponse);
        }
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Chela memory worker queue failed.";
        port.postMessage({
          id: request.id,
          ok: false,
          error: message,
        } satisfies ErrorResponse);
      });
  });
}

function isWorkerBootstrapData(value: unknown): value is MemoryWorkerInitData {
  return (
    !!value &&
    typeof value === "object" &&
    "kind" in value &&
    (value as { kind?: unknown }).kind === "chela-memory-worker"
  );
}

if (isWorkerBootstrapData(workerData)) {
  void startMemoryWorker(workerData).catch((error) => {
    reportFatalAndExit(error);
  });
}
