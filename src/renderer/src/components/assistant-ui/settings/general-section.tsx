import type { ThinkingLevel } from "@shared/contracts";
import { FieldSelect, SettingsCard, SettingsRow } from "./shared";

export function GeneralSection({
  currentModelId,
  thinkingLevel,
  canConfigureThinking,
  thinkingHint,
  thinkingOptions,
  modelOptions,
  onModelChange,
  onThinkingLevelChange,
}: {
  currentModelId: string;
  thinkingLevel: ThinkingLevel;
  canConfigureThinking: boolean;
  thinkingHint: string;
  thinkingOptions: { value: ThinkingLevel; label: string }[];
  modelOptions: { value: string; label: string; disabled?: boolean }[];
  onModelChange: (modelEntryId: string) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
}) {
  return (
    <SettingsCard
      title="模型与推理"
      description="这些配置会直接影响新消息默认使用的模型和思考强度。"
    >
      <SettingsRow
        label="默认模型"
        hint="新会话和后续发送默认会使用这里选择的模型。"
      >
        <FieldSelect
          value={currentModelId}
          onChange={onModelChange}
          options={modelOptions}
        />
      </SettingsRow>

      <SettingsRow
        label="默认思考强度"
        hint={thinkingHint}
      >
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
    </SettingsCard>
  );
}
