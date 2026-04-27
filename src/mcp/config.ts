import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type McpServerConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  disabled?: boolean;
};

export type McpConfig = {
  mcpServers: Record<string, McpServerConfig>;
};

const MCP_CONFIG_FILE = "mcp.json";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function warnMcpConfig(configPath: string, message: string, data?: unknown): void {
  console.warn("[mcp.config]", message, {
    configPath,
    ...(data && typeof data === "object" ? (data as Record<string, unknown>) : {}),
  });
}

export function normalizeMcpIdentifier(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || fallback;
}

function normalizeStringArray(
  value: unknown,
): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const result = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return result.length > 0 ? result : undefined;
}

function normalizeStringRecord(
  value: unknown,
): Record<string, string> | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const result: Record<string, string> = {};

  for (const [key, nested] of Object.entries(value)) {
    if (typeof nested !== "string") {
      continue;
    }

    const trimmed = nested.trim();
    if (!trimmed) {
      continue;
    }
    result[key] = trimmed;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeServerConfig(
  configPath: string,
  serverName: string,
  value: unknown,
): McpServerConfig | null {
  if (!isPlainObject(value)) {
    warnMcpConfig(configPath, "MCP server 配置格式无效，已忽略。", {
      serverName,
    });
    return null;
  }

  const command = typeof value.command === "string" ? value.command.trim() : "";
  if (!command) {
    warnMcpConfig(configPath, "MCP server 缺少有效 command，已忽略。", {
      serverName,
    });
    return null;
  }

  const args = normalizeStringArray(value.args);
  const env = normalizeStringRecord(value.env);
  const cwd =
    typeof value.cwd === "string" && value.cwd.trim()
      ? value.cwd.trim()
      : undefined;

  return {
    command,
    args,
    env,
    cwd,
    disabled: value.disabled === true,
  };
}

/**
 * Read and parse the mcp.json config from workspace.
 */
export function loadMcpConfig(workspacePath: string): McpConfig {
  const configPath = join(workspacePath, MCP_CONFIG_FILE);
  if (!existsSync(configPath)) {
    return { mcpServers: {} };
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<McpConfig>;
    if (!isPlainObject(parsed)) {
      warnMcpConfig(configPath, "MCP 配置根对象无效，已回退为空配置。");
      return { mcpServers: {} };
    }

    const rawServers = isPlainObject(parsed.mcpServers)
      ? parsed.mcpServers
      : isPlainObject((parsed as { servers?: unknown }).servers)
        ? (parsed as { servers: Record<string, unknown> }).servers
        : parsed.mcpServers;
    if (!isPlainObject(rawServers)) {
      if (rawServers != null) {
        warnMcpConfig(configPath, "mcpServers 字段无效，已回退为空配置。");
      }
      return { mcpServers: {} };
    }

    const normalizedServers: Record<string, McpServerConfig> = {};
    const seenIdentifiers = new Map<string, string>();

    for (const [serverName, serverConfig] of Object.entries(rawServers)) {
      const normalized = normalizeServerConfig(configPath, serverName, serverConfig);
      if (!normalized) {
        continue;
      }

      const normalizedIdentifier = normalizeMcpIdentifier(serverName, "server");
      const existingOwner = seenIdentifiers.get(normalizedIdentifier);
      if (existingOwner && existingOwner !== serverName) {
        warnMcpConfig(
          configPath,
          "MCP server 名称归一化后发生冲突，后续冲突项已忽略。",
          {
            serverName,
            conflictingWith: existingOwner,
            normalizedIdentifier,
          },
        );
        continue;
      }

      seenIdentifiers.set(normalizedIdentifier, serverName);
      normalizedServers[serverName] = normalized;
    }

    return {
      mcpServers: normalizedServers,
    };
  } catch (err) {
    console.warn("[mcp.config] 解析 MCP 配置失败，已回退为空配置。", {
      configPath,
      error: err instanceof Error ? err.message : String(err),
    });
    return { mcpServers: {} };
  }
}

/**
 * Get active (non-disabled) server entries.
 */
export function getActiveServers(config: McpConfig): [string, McpServerConfig][] {
  return Object.entries(config.mcpServers).filter(
    ([, cfg]) => !cfg.disabled
  );
}
