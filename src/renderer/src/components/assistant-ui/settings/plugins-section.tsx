import { useCallback, useEffect, useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import type { PluginStatusBundle } from "@shared/contracts";
import { Button } from "@renderer/components/assistant-ui/button";
import { Switch } from "@renderer/components/assistant-ui/switch";
import { SettingsCard, StatusBadge } from "./shared";

function formatPluginSummary(plugin: PluginStatusBundle["plugins"][number]) {
  return [
    `${plugin.toolCount} tools`,
    `${plugin.mcpServerCount} MCP`,
    `${plugin.workflowCount} workflows`,
  ].join(" · ");
}

export function PluginsSection() {
  const desktopApi = window.desktopApi;
  const [bundle, setBundle] = useState<PluginStatusBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPlugins = useCallback(async () => {
    if (!desktopApi?.plugins) return;
    setLoading(true);
    setError(null);
    try {
      setBundle(await desktopApi.plugins.listStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取插件状态失败");
    } finally {
      setLoading(false);
    }
  }, [desktopApi]);

  const setEnabled = useCallback(
    async (pluginId: string, enabled: boolean) => {
      if (!desktopApi?.plugins) return;
      setActionId(pluginId);
      setError(null);
      try {
        setBundle(await desktopApi.plugins.setEnabled(pluginId, enabled));
      } catch (err) {
        setError(err instanceof Error ? err.message : "更新插件状态失败");
      } finally {
        setActionId(null);
      }
    },
    [desktopApi],
  );

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  const plugins = bundle?.plugins ?? [];
  const errors = bundle?.errors ?? [];

  return (
    <SettingsCard
      title="插件"
      description="查看当前 workspace 的 Chela 插件，控制插件启停状态。"
      headerAction={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadPlugins()}
          disabled={loading || !!actionId || !desktopApi?.plugins}
          className="h-8 gap-2 rounded-[var(--radius-shell)] px-3 text-[12px]"
        >
          <RefreshCwIcon className="size-3.5" />
          刷新
        </Button>
      }
    >
      <div className="space-y-3 px-6 pb-5">
        {error ? (
          <p className="rounded-[var(--radius-shell)] bg-[color:var(--color-shell-panel-muted)] px-3 py-2 text-[12px] leading-5 text-[color:var(--color-status-error)]">
            {error}
          </p>
        ) : null}

        <p className="rounded-[var(--radius-shell)] bg-[color:var(--color-shell-panel-muted)] px-3 py-2 font-mono text-[12px] leading-5 text-muted-foreground">
          {bundle?.rootDir ?? "正在读取插件目录…"}
        </p>

        {plugins.length === 0 ? (
          <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-shell-panel-muted)] px-4 py-4 text-[13px] leading-6 text-muted-foreground">
            {loading ? "正在读取插件…" : "当前 workspace 未发现 Chela 插件。"}
          </div>
        ) : (
          plugins.map((plugin) => (
            <div
              key={plugin.id}
              className="rounded-[var(--radius-shell)] bg-[color:var(--color-shell-panel-muted)] px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[13px] font-semibold text-foreground">
                      {plugin.name}
                    </p>
                    <StatusBadge ok={plugin.enabled} text={plugin.enabled ? "已启用" : "已停用"} />
                  </div>
                  <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                    {plugin.id} · v{plugin.version}
                  </p>
                  {plugin.description ? (
                    <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                      {plugin.description}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                    {formatPluginSummary(plugin)}
                  </p>
                </div>

                <Switch
                  checked={plugin.enabled}
                  disabled={!!actionId}
                  aria-label={`${plugin.enabled ? "停用" : "启用"} ${plugin.name}`}
                  onCheckedChange={(checked) => void setEnabled(plugin.id, checked)}
                />
              </div>
            </div>
          ))
        )}

        {errors.length > 0 ? (
          <div className="space-y-2">
            {errors.map((item) => (
              <p
                key={item.manifestPath}
                className="rounded-[var(--radius-shell)] bg-[color:var(--color-shell-panel-muted)] px-3 py-2 text-[12px] leading-5 text-[color:var(--color-status-error)]"
              >
                {item.directory}: {item.message}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </SettingsCard>
  );
}

