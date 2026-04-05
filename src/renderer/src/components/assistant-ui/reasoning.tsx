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
      className="mb-2 overflow-hidden rounded-[16px] bg-shell-panel-muted/68 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
    >
      <CollapsibleTrigger
        className={cn(
          "group/trigger flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition",
          open ? "bg-white/55" : "hover:bg-white/45",
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
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-[color:var(--color-text-secondary)] transition-transform duration-200",
            "group-data-[state=closed]/trigger:-rotate-90",
            "group-data-[state=open]/trigger:rotate-0",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="px-3.5 pb-3">
          <div className="rounded-[12px] bg-white/74 px-3 py-2.5 text-[12px] leading-5.5 whitespace-pre-wrap text-[color:var(--color-text-secondary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
            {reasoning.text}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export { AssistantUIReasoning as Reasoning };

