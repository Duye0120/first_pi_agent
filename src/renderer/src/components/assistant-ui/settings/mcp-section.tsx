import { useCallback, useEffect, useState } from "react";
import { RefreshCwIcon, RotateCcwIcon, UnplugIcon } from "lucide-react";
import type { McpServerStatus } from "@shared/contracts";
import { Button } from "@renderer/components/assistant-ui/button";
import { SettingsCard, StatusBadge } from "./shared";

function formatStatus(status: McpServerStatus) {
  if (status.disabled) return "已停用";
  if (status.connected) return "已连接";
  if (status.status === "connecting") return "连接中";
  if (status.status === "failed") return "失败";
  return "未连接";
}

function formatCount(value: number | null, label: string) {
  return typeof value === "number" ? `${value} ${label}` : `未知 ${label}`;
}

export function McpSection() {
  const desktopApi = window.desktopApi;
  const [statuses, setStatuses] = useState<McpServerStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionName, setActionName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatuses = useCallback(async () => {
    if (!desktopApi?.mcp) return;
    setLoading(true);
    setError(null);
    try {
      setStatuses(await desktopApi.mcp.listStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取 MCP 状态失败");
    } finally {
      setLoading(false);
    }
  }, [desktopApi]);

  const runAction = useCallback(
    async (
      name: string,
      action: () => Promise<McpServerStatus[]>,
    ) => {
      setActionName(name);
      setError(null);
      try {
        setStatuses(await action());
      } catch (err) {
        setError(err instanceof Error ? err.message : "MCP 操作失败");
      } finally {
        setActionName(null);
      }
    },
    [],
  );

  useEffect(() => {
    void loadStatuses();
  }, [loadStatuses]);

  return (
    <SettingsCard
      title="MCP Server"
      description="查看当前 workspace 的 MCP 连接状态，并重载配置或重启单个 server。"
      headerAction={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            void runAction("reload", () => desktopApi.mcp.reloadConfig())
          }
          disabled={loading || !!actionName || !desktopApi?.mcp}
          className="h-8 gap-2 rounded-[var(--radius-shell)] px-3 text-[12px]"
        >
          <RefreshCwIcon className="size-3.5" />
          重载配置
        </Button>
      }
    >
      <div className="space-y-3 px-6 pb-5">
        {error ? (
          <p className="rounded-[var(--radius-shell)] bg-[color:var(--color-shell-panel-muted)] px-3 py-2 text-[12px] leading-5 text-[color:var(--color-status-error)]">
            {error}
          </p>
        ) : null}

        {statuses.length === 0 ? (
          <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-shell-panel-muted)] px-4 py-4 text-[13px] leading-6 text-muted-foreground">
            {loading ? "正在读取 MCP 状态…" : "当前 workspace 未配置 MCP server。"}
          </div>
        ) : (
          statuses.map((status) => (
            <div
              key={status.name}
              className="rounded-[var(--radius-shell)] bg-[color:var(--color-shell-panel-muted)] px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[13px] font-semibold text-foreground">
                      {status.name}
                    </p>
                    <StatusBadge ok={status.connected} text={formatStatus(status)} />
                  </div>
                  <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                    {status.command ?? "未配置命令"}
                    {status.args.length > 0 ? ` ${status.args.join(" ")}` : ""}
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                    {formatCount(status.toolCount, "tools")} · {formatCount(status.resourceCount, "resources")}
                  </p>
                  {status.lastError ? (
                    <p className="mt-2 break-words text-[12px] leading-5 text-[color:var(--color-status-error)]">
                      {status.lastError}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="重启 MCP server"
                    aria-label={`重启 ${status.name}`}
                    onClick={() =>
                      void runAction(`restart:${status.name}`, () =>
                        desktopApi.mcp.restartServer(status.name),
                      )
                    }
                    disabled={!!actionName || status.disabled}
                    className="size-8 rounded-[var(--radius-shell)]"
                  >
                    <RotateCcwIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="断开 MCP server"
                    aria-label={`断开 ${status.name}`}
                    onClick={() =>
                      void runAction(`disconnect:${status.name}`, () =>
                        desktopApi.mcp.disconnectServer(status.name),
                      )
                    }
                    disabled={!!actionName || !status.connected}
                    className="size-8 rounded-[var(--radius-shell)]"
                  >
                    <UnplugIcon className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </SettingsCard>
  );
}
