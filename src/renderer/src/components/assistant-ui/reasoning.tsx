"use client";

import { BrainCircuitIcon, ChevronDownIcon } from "lucide-react";
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

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mb-3 overflow-hidden rounded-[var(--radius-shell)] border border-border/70 bg-slate-50/90"
    >
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground transition hover:bg-slate-100/80",
          open && "border-b border-border/70",
        )}
      >
        <BrainCircuitIcon className="size-3.5 shrink-0 text-slate-500" />
        <span className="flex-1 font-medium">Reasoning</span>
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="px-3 py-2.5 text-sm leading-6 whitespace-pre-wrap text-slate-600">
          {reasoning.text}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export { AssistantUIReasoning as Reasoning };

