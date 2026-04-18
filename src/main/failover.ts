// ---------------------------------------------------------------------------
// Failover — Provider 级别的故障转移
// ---------------------------------------------------------------------------
//
// 当主模型 API 不可用时，自动尝试备选模型。
// 与 providers.ts 的 resolveModelEntry 配合使用。
// ---------------------------------------------------------------------------

import { net } from "electron";
import { DEFAULT_MODEL_ENTRY_ID } from "../shared/provider-directory.js";
import {
  listSelectableModelEntries,
  resolveModelEntry,
} from "./providers.js";
import { appLogger } from "./logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FailoverResult = {
  entryId: string;
  entryName: string;
  failedEntries: string[];
  isFailover: boolean;
};

// ---------------------------------------------------------------------------
// 网络检测
// ---------------------------------------------------------------------------

export function isOnline(): boolean {
  return net.isOnline();
}

// ---------------------------------------------------------------------------
// Provider 错误分类
// ---------------------------------------------------------------------------

const RETRIABLE_PATTERNS = [
  "econnrefused",
  "enotfound",
  "etimedout",
  "econnreset",
  "socket hang up",
  "fetch failed",
  "network",
  "rate limit",
  "overloaded",
  "capacity",
];

const RETRIABLE_HTTP_STATUS_REGEX = /\b(?:5\d{2}|429)\b/;

export function isProviderTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  if (RETRIABLE_HTTP_STATUS_REGEX.test(msg)) return true;
  return RETRIABLE_PATTERNS.some((p) => msg.includes(p));
}

export function listFailoverCandidateEntryIds(primaryEntryId: string): string[] {
  const preferred = [primaryEntryId, DEFAULT_MODEL_ENTRY_ID];
  const enabledEntries = listSelectableModelEntries().map((entry) => entry.id);

  return [...preferred, ...enabledEntries].filter(
    (entryId, index, all): entryId is string =>
      typeof entryId === "string" &&
      entryId.trim().length > 0 &&
      all.indexOf(entryId) === index,
  );
}

// ---------------------------------------------------------------------------
// Failover 解析
// ---------------------------------------------------------------------------

/**
 * 尝试解析主模型，失败时依次尝试其他已启用的模型。
 * 返回第一个成功解析的模型信息。
 */
export function resolveWithFailover(
  primaryEntryId: string,
): FailoverResult & { resolved: ReturnType<typeof resolveModelEntry> } {
  const failedEntries: string[] = [];
  const candidateEntryIds = listFailoverCandidateEntryIds(primaryEntryId);

  for (const entryId of candidateEntryIds) {
    try {
      const resolved = resolveModelEntry(entryId);
      return {
        entryId: resolved.entry.id,
        entryName: resolved.entry.name,
        failedEntries,
        isFailover: resolved.entry.id !== primaryEntryId,
        resolved,
      };
    } catch (error) {
      failedEntries.push(entryId);
      appLogger.warn({
        scope: "failover",
        message:
          entryId === primaryEntryId
            ? "主模型解析失败，准备尝试候选模型"
            : "候选模型解析失败，继续尝试下一个",
        data: {
          primaryEntryId,
          entryId,
        },
        error,
      });
    }
  }

  throw new Error(
    `所有模型均不可用（已尝试 ${failedEntries.length} 个）。请检查 API Key 和网络连接。`,
  );
}

// ---------------------------------------------------------------------------
// Retry with failover（包装 async 操作）
// ---------------------------------------------------------------------------

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; retryDelayMs?: number } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.retryDelayMs ?? 1000;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (!isProviderTransientError(err) || attempt === maxRetries) {
        throw err;
      }

      // 指数退避 + 满抖动，避免多个会话同时重试时撞到 provider 的同一窗口。
      const exponential = baseDelayMs * 2 ** attempt;
      const jitter = Math.floor(Math.random() * baseDelayMs);
      const waitMs = Math.min(exponential + jitter, 15_000);

      appLogger.info({
        scope: "failover",
        message: `暂时性错误，${waitMs}ms 后重试 (${attempt + 1}/${maxRetries})`,
      });

      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError;
}
