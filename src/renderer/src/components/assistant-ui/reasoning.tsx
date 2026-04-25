"use client";

import { ChevronDownIcon } from "lucide-react";
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
  const statusLabel = isRunning ? "进行中" : "已完成";

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mb-3 w-full max-w-[760px]"
    >
      <CollapsibleTrigger
        className={cn(
          "group/trigger inline-flex max-w-full items-center gap-2.5 py-1 text-left transition-colors duration-200 select-none",
          "text-[color:var(--chela-text-secondary)] hover:text-[color:var(--chela-text-primary)]",
        )}
        aria-label={open ? "收起思考内容" : "展开思考内容"}
      >
        <span
          className={cn(
            "flex h-5 shrink-0 items-center justify-center rounded-full px-2 font-mono text-[10px] font-medium leading-none transition-colors",
            isRunning
              ? "bg-[var(--color-accent-subtle)] text-[color:var(--color-accent)]"
              : "bg-[color:var(--color-control-bg)] text-[color:var(--chela-text-tertiary)]"
          )}
        >
          think
        </span>
        <span className="text-[13px] font-medium text-[color:var(--chela-text-primary)] transition-colors">
          思考
        </span>
        <span className="text-[11px] font-medium text-[color:var(--chela-text-tertiary)] transition-colors">
          {statusLabel}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 text-[color:var(--chela-text-tertiary)] transition-transform duration-200",
            "group-data-[state=closed]/trigger:-rotate-90",
            "group-data-[state=open]/trigger:rotate-0",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="pl-[1.625rem] pr-2 pb-2 pt-1">
          <div className="max-h-[320px] overflow-y-auto rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-3 py-2 text-[12px] leading-6 whitespace-pre-wrap text-[color:var(--chela-text-secondary)]">
            {reasoning.text}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export { AssistantUIReasoning as Reasoning };
