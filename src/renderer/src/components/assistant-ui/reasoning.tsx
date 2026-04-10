"use client";

import {
  BrainCircuitIcon,
  ChevronDownIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { type FC, useState } from "react";
import { useMessagePartReasoning } from "@assistant-ui/react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import { cn } from "@renderer/lib/utils";

export const AssistantUIReasoning: FC = () => {
  const reasoning = useMessagePartReasoning();
  const [open, setOpen] = useState(false);

  if (!reasoning.text?.trim()) return null;

  const isRunning = reasoning.status.type === "running";
  const title = isRunning ? "思考中" : "思考";

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mb-1.5 overflow-hidden rounded-[14px] border border-[color:var(--color-control-border)] bg-[color:var(--color-control-panel-bg)] shadow-[var(--color-control-shadow)]"
    >
      <CollapsibleTrigger
        className={cn(
          "group/trigger flex w-full items-center gap-2 px-3 py-1.5 text-left transition",
          open
            ? "bg-white/52 dark:bg-black/20"
            : "hover:bg-white/42 dark:hover:bg-black/20",
        )}
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-subtle)]/72 text-[var(--color-accent)]">
          {isRunning ? (
            <LoaderCircleIcon className="size-3.5 animate-spin" />
          ) : (
            <BrainCircuitIcon className="size-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {title}
        </span>
        {!isRunning ? (
          <span className="shrink-0 text-[11px] font-medium text-[color:var(--color-text-muted)]">
            已完成
          </span>
        ) : null}
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-[color:var(--color-text-secondary)] transition-transform duration-200",
            "group-data-[state=closed]/trigger:-rotate-90",
            "group-data-[state=open]/trigger:rotate-0",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="px-3 pb-2.5">
          <div className="rounded-[10px] bg-white/70 dark:bg-black/20 px-2.5 py-2 text-[11px] leading-5 whitespace-pre-wrap text-[color:var(--color-text-secondary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            {reasoning.text}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export { AssistantUIReasoning as Reasoning };
