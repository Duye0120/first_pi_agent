import type { Settings, SoulFilesStatus } from "@shared/contracts";
import { FieldInput, SettingsCard, SettingsRow, StatusBadge } from "./shared";

export function WorkspaceSection({
  settings,
  soulStatus,
}: {
  settings: Settings;
  soulStatus: SoulFilesStatus | null;
}) {
  return (
    <>
      <SettingsCard
        title="当前工作区"
        description="目前这里先展示状态；目录选择器后面再补进来。"
      >
        <SettingsRow label="路径" hint="Agent 默认在这个目录下执行。">
          <FieldInput value={settings.workspace} mono readOnly />
        </SettingsRow>
      </SettingsCard>

      <SettingsCard
        title="Soul 文件"
        description="帮助 Agent 理解项目约束和用户偏好的本地文件状态。"
      >
        <div className="space-y-3 px-6 py-5">
          {soulStatus ? (
            [
              { label: "SOUL.md", status: soulStatus.soul },
              { label: "USER.md", status: soulStatus.user },
              { label: "AGENTS.md", status: soulStatus.agents },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-[var(--radius-shell)] border border-shell-border bg-shell-panel-muted px-4 py-3"
              >
                <div>
                  <p className="text-[13px] font-medium text-foreground">
                    {item.label}
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {item.status.exists
                      ? `已加载 · ${item.status.sizeBytes} bytes`
                      : "未找到"}
                  </p>
                </div>
                <StatusBadge
                  ok={item.status.exists}
                  text={item.status.exists ? "可用" : "缺失"}
                />
              </div>
            ))
          ) : (
            <p className="text-[12px] text-muted-foreground">
              正在读取 Soul 文件状态…
            </p>
          )}
        </div>
      </SettingsCard>
    </>
  );
}
