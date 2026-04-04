import type { Settings } from "@shared/contracts";
import { parseNumericInput, THEME_OPTIONS } from "./constants";
import { FieldInput, FieldSelect, SettingsCard, SettingsRow } from "./shared";

export function AppearanceSection({
  settings,
  onSettingsChange,
}: {
  settings: Settings;
  onSettingsChange: (partial: Partial<Settings>) => void;
}) {
  return (
    <SettingsCard
      title="外观"
      description="主题、字号和代码字体都从这里统一控制。"
    >
      <SettingsRow label="主题" hint="切换应用主题模式。">
        <FieldSelect
          value={settings.theme}
          onChange={(value) =>
            onSettingsChange({ theme: value as Settings["theme"] })
          }
          options={THEME_OPTIONS}
        />
      </SettingsRow>

      <SettingsRow label="界面字号" hint="控制普通界面文本字号。">
        <FieldInput
          type="number"
          min={12}
          max={20}
          value={settings.ui.fontSize}
          onChange={(event) =>
            onSettingsChange({
              ui: {
                ...settings.ui,
                fontSize: parseNumericInput(
                  event.target.value,
                  settings.ui.fontSize,
                ),
              },
            })
          }
        />
      </SettingsRow>

      <SettingsRow
        label="界面字体"
        hint="整个应用界面会统一使用这里的字体栈。"
      >
        <FieldInput
          value={settings.ui.fontFamily}
          onChange={(event) =>
            onSettingsChange({
              ui: {
                ...settings.ui,
                fontFamily: event.target.value,
              },
            })
          }
        />
      </SettingsRow>

      <SettingsRow label="代码字号" hint="影响代码块和终端外的代码显示。">
        <FieldInput
          type="number"
          min={11}
          max={20}
          value={settings.ui.codeFontSize}
          onChange={(event) =>
            onSettingsChange({
              ui: {
                ...settings.ui,
                codeFontSize: parseNumericInput(
                  event.target.value,
                  settings.ui.codeFontSize,
                ),
              },
            })
          }
        />
      </SettingsRow>

      <SettingsRow label="代码字体" hint="建议保持等宽字体。">
        <FieldInput
          value={settings.ui.codeFontFamily}
          onChange={(event) =>
            onSettingsChange({
              ui: {
                ...settings.ui,
                codeFontFamily: event.target.value,
              },
            })
          }
        />
      </SettingsRow>
    </SettingsCard>
  );
}
