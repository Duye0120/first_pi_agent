import { FieldInput, SettingsCard, SettingsRow } from "./shared";

export function AboutSection() {
  return (
    <SettingsCard>
      <SettingsRow label="应用" hint="当前桌面应用版本。">
        <FieldInput value="Chela v0.1.0-dev" readOnly />
      </SettingsRow>

      <SettingsRow label="运行时" hint="前后端主要技术栈。">
        <div className="rounded-[var(--radius-shell)] border border-[color:var(--color-control-border)] bg-[color:var(--color-control-bg)] px-4 py-3 text-[12px] leading-6 text-muted-foreground shadow-[var(--color-control-shadow)]">
          <p>Engine: pi-agent-core</p>
          <p>Runtime: Electron</p>
          <p>UI: React 19 + Tailwind CSS 4</p>
        </div>
      </SettingsRow>

      <SettingsRow label="说明" hint="这一版先解决设置视图体验问题。">
        <div className="rounded-[var(--radius-shell)] border border-[color:var(--color-control-border)] bg-[color:var(--color-control-bg)] px-4 py-3 text-[12px] leading-6 text-muted-foreground shadow-[var(--color-control-shadow)]">
          设置已经从弹窗改成了主界面内嵌页面，后续可以继续把更多配置项逐步补齐。
        </div>
      </SettingsRow>
    </SettingsCard>
  );
}
