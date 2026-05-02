import assert from "node:assert/strict";
import { IPC_CHANNELS } from "../src/shared/ipc.ts";
import {
  validateGitBranchNamePayload,
  validateGitCommitPayload,
  validateGitPathsPayload,
  validateMemoryAddPayload,
  validateMemoryFeedbackDeltaPayload,
  validateMemoryIdPayload,
  validateMemoryListPayload,
  validateMemorySearchLimitPayload,
  validateMemorySearchQueryPayload,
  validateMcpServerConfigDraftPayload,
  validatePluginEnabledPayload,
  validatePluginIdPayload,
  validateProviderApiKeyPayload,
  validateProviderSourceDraftPayload,
  validateServerNamePayload,
  validateSourceIdPayload,
  validateSettingsUpdatePayload,
  validateWorkspacePathPayload,
} from "../src/main/ipc/schema.ts";

assert.throws(
  () => validateSettingsUpdatePayload(null),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes(IPC_CHANNELS.settingsUpdate),
);

assert.throws(
  () => validateSettingsUpdatePayload({ unknown: true }),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("unknown"),
);

assert.throws(
  () => validateSettingsUpdatePayload({ workspace: "" }),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("workspace"),
);

assert.throws(
  () => validateSettingsUpdatePayload({ terminal: { fontSize: "large" } }),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("terminal.fontSize"),
);

assert.throws(
  () => validateSettingsUpdatePayload({ network: { proxy: { enabled: "yes" } } }),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("network.proxy.enabled"),
);

assert.deepEqual(validateSettingsUpdatePayload({ memory: { enabled: false } }), {
  memory: { enabled: false },
});

assert.deepEqual(validateSettingsUpdatePayload({ network: { timeoutMs: 120_000 } }), {
  network: { timeoutMs: 120_000 },
});

assert.throws(
  () => validateProviderSourceDraftPayload(IPC_CHANNELS.providersSaveSource, null),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes(IPC_CHANNELS.providersSaveSource),
);

assert.throws(
  () =>
    validateProviderSourceDraftPayload(IPC_CHANNELS.providersTestSource, {
      name: "DashScope",
      providerType: "dashscope",
      mode: "custom",
      enabled: true,
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    }),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("providerType"),
);

assert.throws(
  () =>
    validateProviderSourceDraftPayload(IPC_CHANNELS.providersFetchModels, {
      name: "OpenAI Compatible",
      providerType: "openai-compatible",
      mode: "custom",
      enabled: "yes",
      baseUrl: "https://api.example.com/v1",
    }),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("enabled"),
);

assert.throws(
  () => validateSourceIdPayload(IPC_CHANNELS.providersSetCredentials, ""),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("sourceId"),
);

assert.throws(
  () => validateProviderApiKeyPayload(IPC_CHANNELS.providersSetCredentials, 123),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("apiKey"),
);

assert.deepEqual(
  validateProviderSourceDraftPayload(IPC_CHANNELS.providersSaveSource, {
    id: "custom:source",
    name: "OpenAI Compatible",
    providerType: "openai-compatible",
    mode: "custom",
    enabled: true,
    baseUrl: "https://api.example.com/v1",
  }),
  {
    id: "custom:source",
    name: "OpenAI Compatible",
    providerType: "openai-compatible",
    mode: "custom",
    enabled: true,
    baseUrl: "https://api.example.com/v1",
  },
);

assert.equal(validateProviderApiKeyPayload(IPC_CHANNELS.providersSetCredentials, ""), "");

assert.throws(
  () => validateMemoryAddPayload(null),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes(IPC_CHANNELS.memoryAdd),
);

assert.throws(
  () => validateMemoryAddPayload({ content: "" }),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("content"),
);

assert.throws(
  () => validateMemoryAddPayload({ content: "偏好", metadata: { "bad key": "x" } }),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("metadata"),
);

assert.throws(
  () => validateMemorySearchQueryPayload(""),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("query"),
);

assert.throws(
  () => validateMemorySearchLimitPayload("5"),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("limit"),
);

assert.throws(
  () => validateMemoryListPayload({ sort: "name_asc" }),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("sort"),
);

assert.deepEqual(validateMemoryAddPayload({ content: "用户偏好 pnpm", metadata: { tags: ["tooling"] } }), {
  content: "用户偏好 pnpm",
  metadata: { tags: ["tooling"] },
});

assert.equal(validateMemorySearchLimitPayload(undefined), undefined);
assert.deepEqual(validateMemoryListPayload({ sort: "created_desc", limit: 20 }), {
  sort: "created_desc",
  limit: 20,
});
assert.deepEqual(
  validateMemoryListPayload({
    sort: "confidence_desc",
    limit: 80,
    status: "all",
    source: undefined,
    topic: undefined,
    minConfidence: undefined,
  }),
  {
    sort: "confidence_desc",
    limit: 80,
    status: "all",
    source: undefined,
    topic: undefined,
    minConfidence: undefined,
  },
);

assert.throws(
  () => validateMemoryIdPayload(IPC_CHANNELS.memoryDelete, 0),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("memoryId"),
);

assert.throws(
  () => validateMemoryFeedbackDeltaPayload("down"),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("delta"),
);

assert.equal(validateMemoryIdPayload(IPC_CHANNELS.memoryDelete, 12), 12);
assert.equal(validateMemoryFeedbackDeltaPayload(-3), -3);

assert.throws(
  () => validateGitBranchNamePayload(IPC_CHANNELS.gitSwitchBranch, ""),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("branchName"),
);

assert.throws(
  () => validateGitBranchNamePayload(IPC_CHANNELS.gitCreateBranch, "feature\nbad"),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("branchName"),
);

assert.throws(
  () => validateGitPathsPayload(IPC_CHANNELS.gitStageFiles, ["src/main/index.ts", 42]),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("paths.1"),
);

assert.throws(
  () => validateGitPathsPayload(IPC_CHANNELS.gitUnstageFiles, [""]),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("paths.0"),
);

assert.throws(
  () => validateGitCommitPayload({ message: "", paths: [] }),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("message"),
);

assert.throws(
  () => validateGitCommitPayload({ message: "feat: update", paths: "src/main/index.ts" }),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("paths"),
);

assert.throws(
  () => validateGitCommitPayload({ message: "feat: update\0hidden", paths: [] }),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("message"),
);

assert.equal(validateGitBranchNamePayload(IPC_CHANNELS.gitSwitchBranch, "feature/ipc-contract"), "feature/ipc-contract");
assert.deepEqual(validateGitPathsPayload(IPC_CHANNELS.gitStageFiles, [" src/main/index.ts "]), [" src/main/index.ts "]);
assert.deepEqual(validateGitCommitPayload({ message: "feat: harden ipc", paths: [] }), {
  message: "feat: harden ipc",
  paths: [],
});
assert.deepEqual(
  validateGitCommitPayload({
    message: "feat(ipc): harden contracts\n\nValidate memory, git, workspace and mcp inputs.",
    paths: ["src/main/ipc/schema.ts"],
  }),
  {
    message: "feat(ipc): harden contracts\n\nValidate memory, git, workspace and mcp inputs.",
    paths: ["src/main/ipc/schema.ts"],
  },
);

assert.throws(
  () => validateWorkspacePathPayload("relative/path"),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("workspacePath"),
);

assert.throws(
  () => validateWorkspacePathPayload("D:\\a_github\\first_pi_agent\nnext"),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("workspacePath"),
);

assert.throws(
  () => validateServerNamePayload(IPC_CHANNELS.mcpRestartServer, ""),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("serverName"),
);

assert.throws(
  () => validateServerNamePayload(IPC_CHANNELS.mcpDisconnectServer, "server\nname"),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("serverName"),
);

assert.equal(validateWorkspacePathPayload("D:\\a_github\\first_pi_agent"), "D:\\a_github\\first_pi_agent");
assert.equal(validateServerNamePayload(IPC_CHANNELS.mcpRestartServer, "filesystem"), "filesystem");
assert.deepEqual(
  validateMcpServerConfigDraftPayload({
    originalName: null,
    name: "filesystem",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "D:\\a_project"],
    env: { NODE_ENV: "production" },
    envPassthrough: [],
    cwd: null,
    url: null,
    bearerTokenEnvVar: null,
    headers: {},
    headersFromEnv: {},
    disabled: false,
  }),
  {
    originalName: null,
    name: "filesystem",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "D:\\a_project"],
    env: { NODE_ENV: "production" },
    envPassthrough: [],
    cwd: null,
    url: null,
    bearerTokenEnvVar: null,
    headers: {},
    headersFromEnv: {},
    disabled: false,
  },
);
assert.deepEqual(
  validateMcpServerConfigDraftPayload({
    originalName: null,
    name: "remote",
    type: "streamable-http",
    command: "",
    args: [],
    env: null,
    envPassthrough: [],
    cwd: null,
    url: "https://mcp.example.com/mcp",
    bearerTokenEnvVar: "MCP_BEARER_TOKEN",
    headers: { "X-Chela": "1" },
    headersFromEnv: { "X-Api-Key": "MCP_API_KEY" },
    disabled: false,
  }).type,
  "streamable-http",
);
assert.throws(
  () =>
    validateMcpServerConfigDraftPayload({
      name: "bad\nname",
      type: "stdio",
      command: "npx",
      args: [],
      env: {},
      envPassthrough: [],
      cwd: null,
      url: null,
      bearerTokenEnvVar: null,
      headers: {},
      headersFromEnv: {},
      disabled: false,
    }),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("draft.name"),
);

assert.throws(
  () => validatePluginIdPayload(IPC_CHANNELS.pluginsSetEnabled, "plugin\nbad"),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("pluginId"),
);

assert.throws(
  () => validatePluginEnabledPayload("true"),
  (error) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "INVALID_IPC_PAYLOAD" &&
    String((error as { message?: unknown }).message).includes("enabled"),
);

assert.equal(validatePluginIdPayload(IPC_CHANNELS.pluginsSetEnabled, "demo-plugin"), "demo-plugin");
assert.equal(validatePluginIdPayload(IPC_CHANNELS.pluginsOpenDirectory, "demo-plugin"), "demo-plugin");
assert.equal(validatePluginIdPayload(IPC_CHANNELS.pluginsOpenManifest, "demo-plugin"), "demo-plugin");
assert.equal(validatePluginEnabledPayload(false), false);

console.log("ipc contract regression tests passed");
