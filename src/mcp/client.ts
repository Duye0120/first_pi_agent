import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpServerConfig } from "./config.js";

export type McpConnection = {
  name: string;
  client: Client;
  transport: StdioClientTransport;
  connected: boolean;
};

export class McpConnectionManager {
  private readonly connections = new Map<string, McpConnection>();

  async connectServer(
    name: string,
    config: McpServerConfig,
  ): Promise<McpConnection> {
    await this.disconnectServer(name);

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
      { name: "pi-desktop-agent", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);

    const conn: McpConnection = { name, client, transport, connected: true };
    this.connections.set(name, conn);

    transport.onclose = () => {
      conn.connected = false;
    };

    transport.onerror = () => {
      conn.connected = false;
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
}
