import { StopCircleIcon } from "@heroicons/react/20/solid";
import type { AgentResponse } from "@shared/contracts";
import { StepCard } from "./StepCard";
import { FinalReply } from "./FinalReply";

type Props = {
  response: AgentResponse;
  onCancel?: () => void;
};

export function AgentResponseBlock({ response, onCancel }: Props) {
  const isRunning = response.status === "running";
  const completedSteps = response.steps.filter((s) => s.status !== "executing").length;
  const totalSteps = response.steps.length;

  return (
    <article className="max-w-4xl">
      {/* Header with status */}
      <div className="mb-3 flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-shell-500">
        <span>Assistant</span>
        {isRunning && (
          <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-pi-accent" />
            {totalSteps > 0
              ? `执行中… 第 ${totalSteps} 步 / 已完成 ${completedSteps} 步`
              : "思考中…"
            }
          </span>
        )}
        {isRunning && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] normal-case tracking-normal text-status-err transition hover:bg-red-50"
          >
            <StopCircleIcon className="h-3.5 w-3.5" />
            取消执行
          </button>
        )}
      </div>

      {/* Step cards */}
      {response.steps.length > 0 && (
        <div className="mb-4 flex flex-col gap-1">
          {response.steps.map((step) => (
            <StepCard key={step.id} step={step} />
          ))}
        </div>
      )}

      {/* Final reply */}
      <FinalReply
        text={response.finalText}
        isStreaming={isRunning}
      />
    </article>
  );
}
