import type { AgentStep } from "@shared/contracts";

type Props = { step: AgentStep };

export function ThinkingContent({ step }: Props) {
  return (
    <div className="px-4 py-3 text-sm leading-6 text-text-secondary whitespace-pre-wrap">
      {step.thinkingText || "（思考中…）"}
    </div>
  );
}
