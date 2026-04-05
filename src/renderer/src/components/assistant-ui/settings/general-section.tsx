import type { ThinkingLevel } from "@shared/contracts";
import { THINKING_LEVELS } from "./constants";
import { FieldSelect, SettingsCard, SettingsRow } from "./shared";

export function GeneralSection({
  currentModelId,
  thinkingLevel,
  modelOptions,
  onModelChange,
  onThinkingLevelChange,
}: {
  currentModelId: string;
  thinkingLevel: ThinkingLevel;
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
        hint="越高越偏向深度推理，但响应会更慢。"
      >
        <FieldSelect
          value={thinkingLevel}
          onChange={(value) => onThinkingLevelChange(value as ThinkingLevel)}
          options={THINKING_LEVELS.map((level) => ({
            value: level.value,
            label: level.label,
          }))}
        />
      </SettingsRow>
    </SettingsCard>
  );
}
