"use client";

import type { ComponentPropsWithoutRef } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@renderer/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = ({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List
    data-slot="tabs-list"
    className={cn(
      "inline-flex items-center gap-1 rounded-[18px] border border-[color:var(--color-control-border)] bg-[color:var(--color-control-panel-bg)] p-1 shadow-[var(--color-control-shadow)]",
      className,
    )}
    {...props}
  />
);

const TabsTrigger = ({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    data-slot="tabs-trigger"
    className={cn(
      "inline-flex min-w-0 cursor-pointer items-center justify-center gap-2 rounded-[14px] px-4 py-2.5 text-[12px] font-medium text-muted-foreground outline-none transition-colors",
      "hover:bg-[color:var(--color-control-bg-hover)] hover:text-foreground",
      "data-[state=active]:bg-[color:var(--color-control-selected-bg)] data-[state=active]:text-[color:var(--color-control-selected-text)]",
      "focus-visible:ring-2 focus-visible:ring-[color:var(--color-control-focus-ring)]",
      className,
    )}
    {...props}
  />
);

const TabsContent = ({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content
    data-slot="tabs-content"
    className={cn("min-h-0 flex-1 outline-none", className)}
    {...props}
  />
);

export { Tabs, TabsContent, TabsList, TabsTrigger };
