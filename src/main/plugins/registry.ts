import fs from "node:fs";
import path from "node:path";
import type { ChelaPluginManifest } from "../../shared/plugins.js";
import { validateChelaPluginManifest } from "../../shared/plugins.js";

export type ScannedPlugin = {
  directory: string;
  manifestPath: string;
  manifest: ChelaPluginManifest;
};

export type PluginScanError = {
  directory: string;
  manifestPath: string;
  message: string;
};

export type PluginScanResult = {
  plugins: ScannedPlugin[];
  errors: PluginScanError[];
};

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
}

export function scanPluginDirectory(rootDir: string): PluginScanResult {
  if (!fs.existsSync(rootDir)) {
    return { plugins: [], errors: [] };
  }

  const plugins: ScannedPlugin[] = [];
  const errors: PluginScanError[] = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const directory = path.join(rootDir, entry.name);
    const manifestPath = path.join(directory, "plugin.json");
    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    try {
      const result = validateChelaPluginManifest(readJsonFile(manifestPath));
      if (result.ok) {
        plugins.push({ directory, manifestPath, manifest: result.manifest });
      } else {
        errors.push({
          directory,
          manifestPath,
          message: result.errors.join(" "),
        });
      }
    } catch (error) {
      errors.push({
        directory,
        manifestPath,
        message: error instanceof Error ? error.message : "读取 plugin manifest 失败。",
      });
    }
  }

  plugins.sort((left, right) => left.manifest.id.localeCompare(right.manifest.id));
  errors.sort((left, right) => left.directory.localeCompare(right.directory));
  return { plugins, errors };
}

type PersistedPluginState = {
  enabled: Record<string, boolean>;
};

export class PluginStateStore {
  constructor(private readonly filePath: string) {}

  isEnabled(pluginId: string): boolean {
    return this.read().enabled[pluginId] ?? true;
  }

  setEnabled(pluginId: string, enabled: boolean): void {
    const state = this.read();
    state.enabled[pluginId] = enabled;
    this.write(state);
  }

  private read(): PersistedPluginState {
    try {
      if (fs.existsSync(this.filePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as Partial<PersistedPluginState>;
        return {
          enabled:
            parsed.enabled && typeof parsed.enabled === "object"
              ? Object.fromEntries(
                  Object.entries(parsed.enabled).filter(([, value]) => typeof value === "boolean"),
                )
              : {},
        };
      }
    } catch {
      /* fall back to default state */
    }
    return { enabled: {} };
  }

  private write(state: PersistedPluginState): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf-8");
    fs.renameSync(tempPath, this.filePath);
  }
}
