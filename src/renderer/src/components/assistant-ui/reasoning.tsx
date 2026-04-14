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
      className="mb-2"
    >
      <CollapsibleTrigger
        className={cn(
          "group/trigger flex w-auto items-center gap-2.5 py-1 px-1 text-left transition-all duration-200 select-none",
        )}
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full transition-colors",
            isRunning
              ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
              : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
          )}
        >
          {isRunning ? (
            <LoaderCircleIcon className="size-3 animate-spin" />
          ) : (
            <BrainCircuitIcon className="size-3" />
          )}
        </span>
        <span className="text-[13px] font-medium text-foreground/80 transition-colors group-hover/trigger:text-foreground">
          {title}
        </span>
        {!isRunning ? (
          <span className="text-[11px] font-medium text-muted-foreground/60 transition-colors">
            已完成
          </span>
        ) : null}
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-200",
            "group-data-[state=closed]/trigger:-rotate-90",
            "group-data-[state=open]/trigger:rotate-0",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="pl-[1.625rem] pr-2 pb-2 pt-1">
          <div className="border-l-2 border-slate-200/60 dark:border-slate-800/60 pl-4 py-0.5 text-[12px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {reasoning.text}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export { AssistantUIReasoning as Reasoning };
