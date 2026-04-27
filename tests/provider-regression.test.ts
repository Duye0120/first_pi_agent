import assert from "node:assert/strict";
import {
  classifyProviderError,
  createProviderErrorResult,
  createProviderModelsResult,
  getProviderErrorLabel,
} from "../src/shared/provider-errors.ts";
import { fetchProviderModelIds } from "../src/main/provider-model-fetch.ts";
import {
  isProviderChatSmokeCliEntry,
  runProviderChatSmoke,
  readProviderChatSmokeEnv,
} from "../src/main/provider-chat-smoke.ts";
import type { ProviderSource } from "../src/shared/contracts.ts";

const openAiCompatibleSource: ProviderSource = {
  id: "local",
  name: "Local",
  kind: "custom",
  providerType: "openai-compatible",
  mode: "custom",
  enabled: true,
  baseUrl: "http://127.0.0.1:11434/v1",
};

assert.deepEqual(classifyProviderError(new Error("请求失败 401: invalid api key")), {
  errorCode: "authentication",
  error: "请求失败 401: invalid api key",
});

assert.deepEqual(classifyProviderError(new Error("fetch failed: ECONNREFUSED 127.0.0.1")), {
  errorCode: "network",
  error: "fetch failed: ECONNREFUSED 127.0.0.1",
});

assert.deepEqual(classifyProviderError(new DOMException("The operation was aborted.", "AbortError")), {
  errorCode: "timeout",
  error: "The operation was aborted.",
});

assert.deepEqual(classifyProviderError(new Error("响应不是合法的 JSON。")), {
  errorCode: "protocol",
  error: "响应不是合法的 JSON。",
});

assert.deepEqual(createProviderErrorResult(new Error("请求失败 403")), {
  success: false,
  errorCode: "authentication",
  error: "请求失败 403",
});

assert.deepEqual(createProviderModelsResult([]), {
  success: false,
  errorCode: "empty_models",
  error: "模型列表为空。",
  models: [],
});

assert.deepEqual(createProviderModelsResult(["gpt-4o-mini"]), {
  success: true,
  models: ["gpt-4o-mini"],
});

assert.equal(getProviderErrorLabel("authentication"), "认证失败");
assert.equal(getProviderErrorLabel("empty_models"), "模型为空");

{
  const ids = await fetchProviderModelIds(openAiCompatibleSource, "local", {
    timeoutMs: 100,
    fetchImpl: async (url, init) => {
      assert.equal(url, "http://127.0.0.1:11434/v1/models");
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer local");
      assert.ok(init?.signal instanceof AbortSignal);
      return new Response(
        JSON.stringify({ data: [{ id: "qwen2.5:7b" }, { model: "bge-m3" }] }),
        { status: 200 },
      );
    },
  });
  assert.deepEqual(ids, ["qwen2.5:7b", "bge-m3"]);
}

{
  let aborted = false;
  await assert.rejects(
    () =>
      fetchProviderModelIds(openAiCompatibleSource, "local", {
        timeoutMs: 5,
        fetchImpl: (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              aborted = true;
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      }),
    /aborted/,
  );
  assert.equal(aborted, true);
}

{
  const requestBodies: unknown[] = [];
  const result = await runProviderChatSmoke({
    baseUrl: "https://dashscope.example.test/compatible-mode/v1",
    apiKey: "sk-test",
    model: "qwen-plus",
    prompt: "ping",
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://dashscope.example.test/compatible-mode/v1/chat/completions");
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer sk-test");
      requestBodies.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "pong" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
        { status: 200 },
      );
    },
  });
  assert.deepEqual(requestBodies, [
    {
      model: "qwen-plus",
      messages: [{ role: "user", content: "ping" }],
      temperature: 0,
      max_tokens: 16,
    },
  ]);
  assert.deepEqual(result, {
    success: true,
    skipped: false,
    model: "qwen-plus",
    content: "pong",
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  });
}

{
  const skipped = await runProviderChatSmoke({
    baseUrl: "",
    apiKey: "",
    model: "",
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
  });
  assert.equal(skipped.success, false);
  assert.equal(skipped.skipped, true);
}

{
  const env = readProviderChatSmokeEnv({
    CHELA_SMOKE_BASE_URL: "https://api.example.test/v1",
    CHELA_SMOKE_API_KEY: "token",
    CHELA_SMOKE_MODEL: "demo-model",
  });
  assert.equal(env.baseUrl, "https://api.example.test/v1");
  assert.equal(env.apiKey, "token");
  assert.equal(env.model, "demo-model");
  assert.equal(
    isProviderChatSmokeCliEntry(
      "file:///D:/a_github/first_pi_agent/src/main/provider-chat-smoke.ts",
      "D:\\a_github\\first_pi_agent\\src\\main\\provider-chat-smoke.ts",
    ),
    true,
  );
}

console.log("provider regression tests passed");
