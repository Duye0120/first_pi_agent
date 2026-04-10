import type { Settings } from "@shared/contracts";
import { parseNumericInput, TERMINAL_SHELL_OPTIONS } from "./constants";
import { FieldInput, FieldSelect, SettingsCard, SettingsRow } from "./shared";

export function TerminalSection({
  settings,
  onSettingsChange,
}: {
  settings: Settings;
  onSettingsChange: (partial: Partial<Settings>) => void;
}) {
  return (
    <SettingsCard>
      <SettingsRow label="Shell" hint="选择内置终端默认使用的 shell。">
        <FieldSelect
          value={settings.terminal.shell}
          onChange={(value) =>
            onSettingsChange({
              terminal: {
                ...settings.terminal,
                shell: value,
              },
            })
          }
          options={TERMINAL_SHELL_OPTIONS}
        />
      </SettingsRow>

      <SettingsRow label="终端字体" hint="优先使用等宽字体。">
        <FieldInput
          value={settings.terminal.fontFamily}
          onChange={(event) =>
            onSettingsChange({
              terminal: {
                ...settings.terminal,
                fontFamily: event.target.value,
              },
            })
          }
        />
      </SettingsRow>

      <SettingsRow label="终端字号" hint="默认字号会在新开终端时生效。">
        <FieldInput
          type="number"
          min={10}
          max={22}
          value={settings.terminal.fontSize}
          onChange={(event) =>
            onSettingsChange({
              terminal: {
                ...settings.terminal,
                fontSize: parseNumericInput(
                  event.target.value,
                  settings.terminal.fontSize,
                ),
              },
            })
          }
        />
      </SettingsRow>

      <SettingsRow label="历史行数" hint="保留更多行会占用更多内存。">
        <FieldInput
          type="number"
          min={500}
          step={100}
          value={settings.terminal.scrollback}
          onChange={(event) =>
            onSettingsChange({
              terminal: {
                ...settings.terminal,
                scrollback: parseNumericInput(
                  event.target.value,
                  settings.terminal.scrollback,
                ),
              },
            })
          }
        />
      </SettingsRow>
    </SettingsCard>
  );
}
