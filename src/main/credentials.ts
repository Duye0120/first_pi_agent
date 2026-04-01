import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { CredentialsSafe, CredentialTestResult } from "../shared/contracts.js";

const CREDENTIALS_FILE = "credentials.json";

type CredentialsStore = Record<string, { apiKey?: string; baseUrl?: string }>;

function getCredentialsPath(): string {
  return path.join(app.getPath("userData"), CREDENTIALS_FILE);
}

function readStore(): CredentialsStore {
  const filePath = getCredentialsPath();
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8")) as CredentialsStore;
    }
  } catch {
    // Corrupt file
  }
  return {};
}

function writeStore(store: CredentialsStore): void {
  const filePath = getCredentialsPath();
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
  // Set restrictive permissions (owner read/write only)
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Windows may not support chmod
  }
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 6) + "••••" + key.slice(-4);
}

export function getApiKey(provider: string): string | undefined {
  const store = readStore();
  return store[provider]?.apiKey;
}

export function getMaskedCredentials(): CredentialsSafe {
  const store = readStore();
  const result: CredentialsSafe = {};
  for (const [provider, entry] of Object.entries(store)) {
    result[provider] = {
      masked: entry.apiKey ? maskKey(entry.apiKey) : "",
      hasKey: !!entry.apiKey,
    };
  }
  return result;
}

export function setCredential(provider: string, apiKey: string): void {
  const store = readStore();
  store[provider] = { ...store[provider], apiKey };
  writeStore(store);
}

export function deleteCredential(provider: string): void {
  const store = readStore();
  delete store[provider];
  writeStore(store);
}

export async function testCredential(
  provider: string,
  apiKey: string,
): Promise<CredentialTestResult> {
  try {
    // Lightweight validation: try to import getModel and make a minimal call
    const { getModel, completeSimple } = await import("@mariozechner/pi-ai");

    // Pick a small model for testing
    const testModels: Record<string, [string, string]> = {
      anthropic: ["anthropic", "claude-haiku-3-20241022"],
      openai: ["openai", "gpt-4o-mini"],
      google: ["google", "gemini-2.0-flash-lite"],
    };

    const pair = testModels[provider];
    if (!pair) {
      // Unknown provider — just save the key, can't test
      return { success: true, models: [] };
    }

    const model = getModel(pair[0] as any, pair[1] as any);
    const result = await completeSimple(model, {
      systemPrompt: "",
      messages: [{ role: "user", content: "hi", timestamp: Date.now() }],
      tools: [],
    }, { apiKey, maxTokens: 1 });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "验证失败",
    };
  }
}
