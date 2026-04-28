import type {
  PluginStatus,
  PluginStatusBundle,
} from "../../shared/contracts.js";
import { PluginStateStore, scanPluginDirectory } from "./registry.js";

export type PluginStatusInput = {
  rootDir: string;
  statePath: string;
};

function toPluginStatus(
  input: PluginStatusInput,
  pluginId: string,
  manifest: PluginStatus["manifest"],
  directory: string,
  manifestPath: string,
): PluginStatus {
  const stateStore = new PluginStateStore(input.statePath);

  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description ?? null,
    directory,
    manifestPath,
    enabled: stateStore.isEnabled(pluginId),
    toolCount: manifest.permissions.tools.length,
    mcpServerCount: manifest.permissions.mcpServers.length,
    uiPanelCount: manifest.permissions.uiPanels.length,
    workflowCount: manifest.workflows.length,
    manifest,
  };
}

export function listPluginStatuses(input: PluginStatusInput): PluginStatusBundle {
  const scan = scanPluginDirectory(input.rootDir);

  return {
    rootDir: input.rootDir,
    statePath: input.statePath,
    plugins: scan.plugins.map((plugin) =>
      toPluginStatus(
        input,
        plugin.manifest.id,
        plugin.manifest,
        plugin.directory,
        plugin.manifestPath,
      ),
    ),
    errors: scan.errors,
  };
}

export function setPluginEnabled(input: PluginStatusInput & {
  pluginId: string;
  enabled: boolean;
}): PluginStatusBundle {
  const stateStore = new PluginStateStore(input.statePath);
  stateStore.setEnabled(input.pluginId, input.enabled);
  return listPluginStatuses(input);
}

