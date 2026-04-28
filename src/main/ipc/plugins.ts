import { app } from "electron";
import path from "node:path";
import { IPC_CHANNELS } from "../../shared/ipc.js";
import {
  listPluginStatuses,
  setPluginEnabled,
} from "../plugins/service.js";
import { getSettings } from "../settings.js";
import { handleIpc } from "./handle.js";
import { validatePluginEnabledPayload, validatePluginIdPayload } from "./schema.js";

function resolvePluginStatusPaths() {
  const settings = getSettings();
  return {
    rootDir: path.join(settings.workspace, ".agents", "plugins"),
    statePath: path.join(app.getPath("userData"), "data", "plugin-state.json"),
  };
}

export function registerPluginsIpc(): void {
  handleIpc(IPC_CHANNELS.pluginsListStatus, async () =>
    listPluginStatuses(resolvePluginStatusPaths()),
  );
  handleIpc(
    IPC_CHANNELS.pluginsSetEnabled,
    async (_event, pluginId: string, enabled: boolean) =>
      setPluginEnabled({
        ...resolvePluginStatusPaths(),
        pluginId: validatePluginIdPayload(IPC_CHANNELS.pluginsSetEnabled, pluginId),
        enabled: validatePluginEnabledPayload(enabled),
      }),
  );
}

