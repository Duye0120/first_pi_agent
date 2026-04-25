import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import type {
  MemoryAddInput,
  MemoryListInput,
  MemoryRebuildResult,
  MemoryRecord,
  MemorySearchResult,
  MemoryStats,
} from "../../shared/contracts.js";
import type { MemoryEmbeddingModelId } from "../../shared/memory.js";
import { appLogger } from "../logger.js";
import type {
  EmbeddingProviderInfo,
  MemoryWorkerInitData,
  MemoryWorkerRequest,
  MemoryWorkerResponse,
  ReadyMessage,
  WorkerState,
} from "./embedding-types.js";

export type { EmbeddingProviderInfo } from "./embedding-types.js";

type PendingRequest<T> = {
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function isReadyMessage(message: MemoryWorkerResponse): message is ReadyMessage {
  return "type" in message && (message as { type?: unknown }).type === "ready";
}

export class MemoryWorkerClient {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private state: WorkerState = "idle";
  private readonly pending = new Map<string, PendingRequest<unknown>>();

  constructor(private readonly initData: MemoryWorkerInitData) {}

  getState(): WorkerState {
    return this.state;
  }

  async add(input: {
    input: MemoryAddInput;
    modelId: MemoryEmbeddingModelId;
    provider: EmbeddingProviderInfo | null;
  }): Promise<MemoryRecord> {
    return this.call<MemoryRecord>({
      id: randomUUID(),
      type: "add",
      payload: input,
    });
  }

  async search(input: {
    query: string;
    limit: number;
    candidateLimit: number;
    minScore: number;
    modelId: MemoryEmbeddingModelId;
    provider: EmbeddingProviderInfo | null;
  }): Promise<MemorySearchResult[]> {
    return this.call<MemorySearchResult[]>({
      id: randomUUID(),
      type: "search",
      payload: input,
    });
  }

  async getStats(input: {
    selectedModelId: MemoryEmbeddingModelId;
    candidateLimit: number;
  }): Promise<Omit<MemoryStats, "workerState">> {
    return this.call<Omit<MemoryStats, "workerState">>({
      id: randomUUID(),
      type: "stats",
      payload: input,
    });
  }

  async list(input?: MemoryListInput): Promise<MemoryRecord[]> {
    return this.call<MemoryRecord[]>({
      id: randomUUID(),
      type: "list",
      payload: { input },
    });
  }

  async rebuild(input: {
    modelId: MemoryEmbeddingModelId;
    provider: EmbeddingProviderInfo | null;
  }): Promise<MemoryRebuildResult> {
    return this.call<MemoryRebuildResult>({
      id: randomUUID(),
      type: "rebuild",
      payload: input,
    });
  }

  private async ensureWorker(): Promise<Worker> {
    if (this.worker && this.readyPromise) {
      await this.readyPromise;
      return this.worker;
    }

    this.state = "starting";
    // The worker entry is bundled to a sibling chunk by electron-vite (see
    // `electron.vite.config.ts`); resolving relative to the current bundle URL
    // so the worker thread does NOT load the main bundle (which imports
    // `electron` and would crash inside `worker_threads`).
    const workerUrl = new URL("./embedding-worker.js", import.meta.url);
    const worker = new Worker(workerUrl, {
      workerData: this.initData,
      stderr: true,
      stdout: true,
    });
    this.worker = worker;
    const collectStream = (stream: NodeJS.ReadableStream | null, channel: "stdout" | "stderr") => {
      if (!stream) return;
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => {
        appLogger.error({
          scope: "memory.worker",
          message: `worker ${channel}`,
          data: { chunk: chunk.trim() },
        });
      });
    };
    collectStream(worker.stdout, "stdout");
    collectStream(worker.stderr, "stderr");
    this.readyPromise = new Promise<void>((resolve, reject) => {
      const handleMessage = (message: MemoryWorkerResponse) => {
        if (!isReadyMessage(message)) {
          return;
        }

        worker.off("message", handleMessage);
        this.state = "ready";
        resolve();
      };

      worker.on("message", handleMessage);
      worker.once("error", (error) => {
        worker.off("message", handleMessage);
        this.state = "error";
        reject(error);
      });
      worker.once("exit", (code) => {
        if (code !== 0) {
          worker.off("message", handleMessage);
          this.state = "error";
          reject(new Error(`Chela memory worker exited with code ${code}.`));
        }
      });
    });

    worker.on("message", (message: MemoryWorkerResponse) => {
      if (isReadyMessage(message)) {
        return;
      }

      // Worker bootstrap / fatal failures are posted with id="bootstrap" and
      // have no pending caller; surface them so we can debug worker crashes.
      if (!message.ok && message.id === "bootstrap") {
        appLogger.error({
          scope: "memory.worker",
          message: "Chela memory worker bootstrap failed",
          data: { detail: message.error },
        });
        this.rejectPending(new Error(message.error));
        return;
      }

      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      this.pending.delete(message.id);

      if (message.ok) {
        pending.resolve(message.result);
        return;
      }

      pending.reject(new Error(message.error));
    });

    worker.on("error", (error) => {
      this.state = "error";
      this.rejectPending(error);
      appLogger.error({
        scope: "memory.worker",
        message: "Chela memory worker crashed",
        error,
      });
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        this.state = "error";
        this.rejectPending(new Error(`Chela memory worker exited with code ${code}.`));
      } else if (this.state !== "error") {
        this.state = "idle";
      }

      this.worker = null;
      this.readyPromise = null;
    });

    await this.readyPromise;
    return worker;
  }

  private async call<T>(request: MemoryWorkerRequest): Promise<T> {
    const worker = await this.ensureWorker();

    return new Promise<T>((resolve, reject) => {
      this.pending.set(request.id, {
        resolve: resolve as PendingRequest<unknown>["resolve"],
        reject,
      });
      worker.postMessage(request);
    });
  }

  private rejectPending(error: unknown): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}
