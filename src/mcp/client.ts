import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpServerStatus } from "../shared/contracts.js";
import type { McpConfig, McpServerConfig } from "./config.js";

export type McpConnection = {
  name: string;
  client: Client;
  transport: StdioClientTransport;
  connected: boolean;
  command: string;
  args: string[];
  cwd: string | null;
  startedAt: number;
  updatedAt: number;
  lastError: string | null;
  toolCount: number | null;
  resourceCount: number | null;
};

export class McpConnectionManager {
  private readonly connections = new Map<string, McpConnection>();
  private readonly statuses = new Map<string, McpServerStatus>();

  private setStatus(name: string, patch: Partial<McpServerStatus>): void {
    const current = this.statuses.get(name);
    this.statuses.set(name, {
      name,
      configured: current?.configured ?? true,
      disabled: current?.disabled ?? false,
      connected: current?.connected ?? false,
      status: current?.status ?? "disconnected",
      command: current?.command ?? null,
      args: current?.args ?? [],
      cwd: current?.cwd ?? null,
      toolCount: current?.toolCount ?? null,
      resourceCount: current?.resourceCount ?? null,
      startedAt: current?.startedAt ?? null,
      updatedAt: Date.now(),
      lastError: current?.lastError ?? null,
      ...patch,
    });
  }

  async connectServer(
    name: string,
    config: McpServerConfig,
  ): Promise<McpConnection> {
    await this.disconnectServer(name);

    const startedAt = Date.now();
    this.setStatus(name, {
      configured: true,
      disabled: config.disabled === true,
      connected: false,
      status: config.disabled ? "disabled" : "connecting",
      command: config.command,
      args: config.args ?? [],
      cwd: config.cwd ?? null,
      startedAt,
      lastError: null,
      toolCount: null,
      resourceCount: null,
    });

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env
        ? ({ ...process.env, ...config.env } as Record<string, string>)
        : undefined,
      cwd: config.cwd,
      stderr: "pipe",
    });

    const client = new Client(
      { name: "chela-desktop-agent", version: "0.1.0" },
      { capabilities: {} },
    );

    try {
      await client.connect(transport);
    } catch (error) {
      const message = error instanceof Error ? error.message : "MCP 连接失败";
      this.setStatus(name, {
        connected: false,
        status: "failed",
        lastError: message,
      });
      throw error;
    }

    const conn: McpConnection = {
      name,
      client,
      transport,
      connected: true,
      command: config.command,
      args: config.args ?? [],
      cwd: config.cwd ?? null,
      startedAt,
      updatedAt: Date.now(),
      lastError: null,
      toolCount: null,
      resourceCount: null,
    };
    this.connections.set(name, conn);
    this.setStatus(name, {
      connected: true,
      status: "connected",
      lastError: null,
    });

    transport.onclose = () => {
      conn.connected = false;
      conn.updatedAt = Date.now();
      this.setStatus(name, {
        connected: false,
        status: "disconnected",
      });
    };

    transport.onerror = (error) => {
      conn.connected = false;
      conn.updatedAt = Date.now();
      conn.lastError = error instanceof Error ? error.message : "MCP transport error";
      this.setStatus(name, {
        connected: false,
        status: "failed",
        lastError: conn.lastError,
      });
    };

    return conn;
  }

  async disconnectServer(name: string): Promise<void> {
    const conn = this.connections.get(name);
    if (!conn) return;

    try {
      await conn.transport.close();
    } catch {
      /* ignore */
    }

    conn.connected = false;
    conn.updatedAt = Date.now();
    this.setStatus(name, {
      connected: false,
      status: "disconnected",
    });
    this.connections.delete(name);
  }

  async disconnectAll(): Promise<void> {
    const names = [...this.connections.keys()];
    await Promise.allSettled(names.map((name) => this.disconnectServer(name)));
  }

  getConnections(): McpConnection[] {
    return [...this.connections.values()].filter((conn) => conn.connected);
  }

  getConnection(name: string): McpConnection | undefined {
    const conn = this.connections.get(name);
    return conn?.connected ? conn : undefined;
  }

  recordToolCount(name: string, count: number): void {
    const conn = this.connections.get(name);
    if (conn) {
      conn.toolCount = count;
      conn.updatedAt = Date.now();
    }
    this.setStatus(name, { toolCount: count });
  }

  recordResourceCount(name: string, count: number): void {
    const conn = this.connections.get(name);
    if (conn) {
      conn.resourceCount = count;
      conn.updatedAt = Date.now();
    }
    this.setStatus(name, { resourceCount: count });
  }

  getStatuses(config?: McpConfig): McpServerStatus[] {
    const statuses = new Map(this.statuses);

    if (config) {
      for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
        const connected = this.connections.get(name)?.connected === true;
        const conn = this.connections.get(name);
        const current = statuses.get(name);
        statuses.set(name, {
          name,
          configured: true,
          disabled: serverConfig.disabled === true,
          connected,
          status: serverConfig.disabled
            ? "disabled"
            : connected
              ? "connected"
              : current?.status ?? "disconnected",
          command: serverConfig.command,
          args: serverConfig.args ?? [],
          cwd: serverConfig.cwd ?? null,
          toolCount: conn?.toolCount ?? current?.toolCount ?? null,
          resourceCount: conn?.resourceCount ?? current?.resourceCount ?? null,
          startedAt: conn?.startedAt ?? current?.startedAt ?? null,
          updatedAt: conn?.updatedAt ?? current?.updatedAt ?? null,
          lastError: conn?.lastError ?? current?.lastError ?? null,
        });
      }
    }

    return [...statuses.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}
