import { SparklesIcon } from "lucide-react";
import type { RuntimeSkillUsage } from "@shared/contracts";
import { cn } from "@renderer/lib/utils";

type SkillUsageStripProps = {
  skillUsages: RuntimeSkillUsage[];
  leadLabel?: string;
  className?: string;
  showEntryLabel?: boolean;
};

export function SkillUsageStrip({
  skillUsages,
  leadLabel = "已使用",
  className,
  showEntryLabel = false,
}: SkillUsageStripProps) {
  if (skillUsages.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {skillUsages.map((usage) => (
        <div
          key={`${usage.skillId}:${usage.entryPointId}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--color-control-bg)] px-2.5 py-1 text-[11px] text-muted-foreground shadow-[var(--color-control-shadow)]"
        >
          <SparklesIcon className="size-3.5 text-[color:var(--color-accent)]" />
          <span>{leadLabel}</span>
          <span className="font-medium text-foreground">{usage.skillLabel}</span>
          {showEntryLabel ? (
            <span className="text-muted-foreground/80">{usage.label}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
