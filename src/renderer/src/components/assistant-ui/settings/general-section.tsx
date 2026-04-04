import type { ModelSelection, ThinkingLevel } from "@shared/contracts";
import { getModelValue, THINKING_LEVELS } from "./constants";
import { FieldSelect, SettingsCard, SettingsRow } from "./shared";

export function GeneralSection({
  currentModel,
  thinkingLevel,
  modelOptions,
  onModelChange,
  onThinkingLevelChange,
}: {
  currentModel: ModelSelection;
  thinkingLevel: ThinkingLevel;
  modelOptions: { value: string; label: string; disabled?: boolean }[];
  onModelChange: (model: ModelSelection) => void;
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
          value={getModelValue(currentModel)}
          onChange={(value) => {
            const [provider, ...modelParts] = value.split("/");
            const model = modelParts.join("/");
            if (!provider || !model) return;
            onModelChange({ provider, model });
          }}
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
