import { classifyProviderError, type ProviderErrorCode } from "../shared/provider-errors.js";
import { pathToFileURL } from "node:url";

type FetchLike = typeof fetch;

export type ProviderChatSmokeInput = {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
};

export type ProviderChatSmokeResult = {
  success: boolean;
  skipped: boolean;
  model?: string;
  content?: string;
  usage?: unknown;
  errorCode?: ProviderErrorCode;
  error?: string;
};

const DEFAULT_SMOKE_PROMPT = "Reply with exactly: pong";
const DEFAULT_SMOKE_TIMEOUT_MS = 30_000;

function joinPath(baseUrl: string, suffix: string): string {
  const trimmedBase = baseUrl.replace(/\/+$/u, "");
  const trimmedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${trimmedBase}${trimmedSuffix}`;
}

function createTimeoutSignal(timeoutMs: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

export function readProviderChatSmokeEnv(
  env: Record<string, string | undefined>,
): ProviderChatSmokeInput {
  return {
    baseUrl: env.CHELA_SMOKE_BASE_URL?.trim() ?? "",
    apiKey: env.CHELA_SMOKE_API_KEY?.trim() ?? "",
    model: env.CHELA_SMOKE_MODEL?.trim() ?? "",
    prompt: env.CHELA_SMOKE_PROMPT?.trim() || DEFAULT_SMOKE_PROMPT,
  };
}

export async function runProviderChatSmoke(
  input: ProviderChatSmokeInput,
): Promise<ProviderChatSmokeResult> {
  const baseUrl = input.baseUrl.trim();
  const apiKey = input.apiKey.trim();
  const model = input.model.trim();
  if (!baseUrl || !apiKey || !model) {
    return {
      success: false,
      skipped: true,
      errorCode: "configuration",
      error: "缺少 CHELA_SMOKE_BASE_URL、CHELA_SMOKE_API_KEY 或 CHELA_SMOKE_MODEL。",
    };
  }

  const timeout = createTimeoutSignal(input.timeoutMs ?? DEFAULT_SMOKE_TIMEOUT_MS);
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(joinPath(baseUrl, "/chat/completions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: input.prompt ?? DEFAULT_SMOKE_PROMPT }],
        temperature: 0,
        max_tokens: 16,
      }),
      signal: timeout.signal,
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        responseText.trim()
          ? `请求失败 ${response.status}: ${responseText.slice(0, 240).trim()}`
          : `请求失败 ${response.status}`,
      );
    }

    const json = responseText ? (JSON.parse(responseText) as Record<string, unknown>) : {};
    const choices = Array.isArray(json.choices) ? json.choices : [];
    const firstChoice = choices[0] as { message?: { content?: unknown }; text?: unknown } | undefined;
    const content =
      typeof firstChoice?.message?.content === "string"
        ? firstChoice.message.content
        : typeof firstChoice?.text === "string"
          ? firstChoice.text
          : "";
    if (!content.trim()) {
      throw new Error("聊天响应缺少 assistant content。");
    }

    return {
      success: true,
      skipped: false,
      model,
      content,
      usage: json.usage,
    };
  } catch (error) {
    return {
      success: false,
      skipped: false,
      ...classifyProviderError(error),
    };
  } finally {
    timeout.clear();
  }
}

export function isProviderChatSmokeCliEntry(
  moduleUrl: string,
  argvPath: string | undefined,
): boolean {
  return !!argvPath && moduleUrl === pathToFileURL(argvPath).href;
}

if (isProviderChatSmokeCliEntry(import.meta.url, process.argv[1])) {
  const result = await runProviderChatSmoke(readProviderChatSmokeEnv(process.env));
  console.log(JSON.stringify(result, null, 2));
  if (!result.success && !result.skipped) {
    process.exitCode = 1;
  }
}
