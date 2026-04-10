import { useMemo } from "react";
import type { ThinkingLevel } from "@shared/contracts";
import {
  formatDateTimeInTimeZone,
  getCommonTimeZoneOptions,
  getSystemTimeZone,
  resolveConfiguredTimeZone,
} from "@shared/timezone";
import {
  ModelSelector,
  type ModelOption,
} from "@renderer/components/assistant-ui/model-selector";
import { FieldSelect, SettingsCard, SettingsRow } from "./shared";

export function GeneralSection({
  settings,
  currentModelId,
  thinkingLevel,
  canConfigureThinking,
  thinkingHint,
  thinkingOptions,
  modelOptions,
  onModelChange,
  onThinkingLevelChange,
  onSettingsChange,
}: {
  settings: { timeZone: string };
  currentModelId: string;
  thinkingLevel: ThinkingLevel;
  canConfigureThinking: boolean;
  thinkingHint: string;
  thinkingOptions: { value: ThinkingLevel; label: string }[];
  modelOptions: ModelOption[];
  onModelChange: (modelEntryId: string) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  onSettingsChange: (partial: { timeZone: string }) => void;
}) {
  const currentModel =
    modelOptions.find((option) => option.id === currentModelId) ?? null;
  const systemTimeZone = useMemo(() => getSystemTimeZone(), []);
  const resolvedTimeZone = resolveConfiguredTimeZone(settings.timeZone);
  const timeZoneOptions = useMemo(
    () => getCommonTimeZoneOptions(systemTimeZone, settings.timeZone),
    [settings.timeZone, systemTimeZone],
  );

  return (
    <SettingsCard
      title="默认行为"
      description="默认模型、思考强度、时区都放这。后面的定时任务和心跳也会直接吃这套配置。"
    >
      <SettingsRow
        label="默认模型"
        hint="新会话和后续发送默认会使用这里选择的模型。"
      >
        <ModelSelector.Root
          models={modelOptions}
          value={currentModelId}
          onValueChange={onModelChange}
        >
          <ModelSelector.Trigger
            variant="outline"
            size="default"
            title={currentModel?.name ?? "选择默认模型"}
            aria-label={
              currentModel?.name
                ? `当前默认模型：${currentModel.name}`
                : "选择默认模型"
            }
            className="h-9 w-full justify-between px-3 text-[13px]"
          />
          <ModelSelector.Content
            align="start"
            className="min-w-[var(--radix-select-trigger-width)]"
          />
        </ModelSelector.Root>
      </SettingsRow>

      <SettingsRow label="默认思考强度" hint={thinkingHint}>
        <FieldSelect
          value={canConfigureThinking ? thinkingLevel : "__unsupported__"}
          onChange={(value) => onThinkingLevelChange(value as ThinkingLevel)}
          disabled={!canConfigureThinking}
          options={
            canConfigureThinking
              ? thinkingOptions
              : [
                  {
                    value: "__unsupported__",
                    label: "当前模型不支持单独设置",
                    disabled: true,
                  },
                ]
          }
        />
      </SettingsRow>

      <SettingsRow
        label="时区"
        hint={`当前生效：${resolvedTimeZone} · ${formatDateTimeInTimeZone(new Date(), resolvedTimeZone)}`}
      >
        <FieldSelect
          value={settings.timeZone}
          onChange={(value) => onSettingsChange({ timeZone: value })}
          options={timeZoneOptions}
        />
      </SettingsRow>
    </SettingsCard>
  );
}
