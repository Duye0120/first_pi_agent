import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateChelaPluginManifest } from "../src/shared/plugins.ts";
import {
  PluginStateStore,
  scanPluginDirectory,
} from "../src/main/plugins/registry.ts";
import { runWorkflow } from "../src/main/plugins/workflow.ts";
import { createExternalApiAdapter } from "../src/main/plugins/external-api.ts";

function withTempDir(test: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chela-plugin-"));
  return Promise.resolve(test(dir)).finally(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

await withTempDir(async (dir) => {
  const validDir = path.join(dir, "hello");
  const invalidDir = path.join(dir, "broken");
  fs.mkdirSync(validDir, { recursive: true });
  fs.mkdirSync(invalidDir, { recursive: true });
  fs.writeFileSync(
    path.join(validDir, "plugin.json"),
    JSON.stringify({
      id: "hello-plugin",
      name: "Hello Plugin",
      version: "1.0.0",
      permissions: {
        tools: ["echo"],
        mcpServers: [],
        uiPanels: ["hello-panel"],
        workflows: ["hello-workflow"],
      },
      workflows: [
        {
          id: "hello-workflow",
          name: "Hello workflow",
          steps: [
            {
              id: "say",
              type: "tool",
              toolName: "echo",
              input: { text: "hi" },
            },
          ],
        },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(invalidDir, "plugin.json"),
    JSON.stringify({ id: "bad plugin", name: "", version: "1.0.0" }),
  );

  const validated = validateChelaPluginManifest(
    JSON.parse(fs.readFileSync(path.join(validDir, "plugin.json"), "utf-8")),
  );
  assert.equal(validated.ok, true);
  assert.equal(validated.manifest?.id, "hello-plugin");

  const scan = scanPluginDirectory(dir);
  assert.equal(scan.plugins.length, 1);
  assert.equal(scan.plugins[0].manifest.id, "hello-plugin");
  assert.equal(scan.errors.length, 1);
  assert.match(scan.errors[0].message, /name|id|permissions/);

  const stateStore = new PluginStateStore(path.join(dir, "plugin-state.json"));
  assert.equal(stateStore.isEnabled("hello-plugin"), true);
  stateStore.setEnabled("hello-plugin", false);
  assert.equal(stateStore.isEnabled("hello-plugin"), false);
  assert.equal(new PluginStateStore(path.join(dir, "plugin-state.json")).isEnabled("hello-plugin"), false);

  const workflowResult = await runWorkflow(scan.plugins[0].manifest.workflows[0], {
    tools: {
      echo: async (input) => ({ echoed: input }),
    },
  });
  assert.deepEqual(workflowResult, {
    success: true,
    steps: [
      {
        id: "say",
        success: true,
        output: { echoed: { text: "hi" } },
      },
    ],
  });

  const failedWorkflow = await runWorkflow(
    {
      id: "fail-workflow",
      name: "Fail workflow",
      steps: [
        { id: "missing", type: "tool", toolName: "missing_tool", input: {} },
      ],
    },
    { tools: {} },
  );
  assert.equal(failedWorkflow.success, false);
  assert.equal(failedWorkflow.steps[0].success, false);
  assert.match(failedWorkflow.steps[0].error ?? "", /missing_tool/);

  const adapter = createExternalApiAdapter({
    id: "demo-api",
    baseUrl: "https://api.example.test/v1",
    headers: { Authorization: "Bearer test" },
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://api.example.test/v1/items");
      assert.equal(init?.method, "POST");
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });
  assert.deepEqual(
    await adapter.request({ path: "/items", method: "POST", body: { id: 1 } }),
    { ok: true },
  );
});

console.log("plugin regression tests passed");
