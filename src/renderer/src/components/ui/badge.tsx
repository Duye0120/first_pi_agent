import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@renderer/lib/utils";

const badgeVariants = cva(
  "inline-flex select-none items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/35",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-foreground text-background shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
        secondary:
          "border-[color:var(--color-shell-border)] bg-shell-panel-contrast text-foreground",
        outline:
          "border-[color:var(--color-shell-border)] bg-transparent text-[color:var(--color-text-secondary)]",
        success:
          "border-emerald-200 bg-emerald-100 text-emerald-900",
        warning:
          "border-amber-200 bg-amber-100 text-amber-900",
        destructive:
          "border-rose-200 bg-rose-100 text-rose-900",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
