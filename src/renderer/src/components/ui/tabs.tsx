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
      "inline-flex items-center gap-1 rounded-[18px] bg-shell-panel-elevated p-1",
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
      "hover:bg-shell-panel hover:text-foreground",
      "data-[state=active]:bg-foreground data-[state=active]:text-background",
      "focus-visible:ring-1 focus-visible:ring-ring/35",
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
