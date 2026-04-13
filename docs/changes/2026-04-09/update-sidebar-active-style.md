# Update Sidebar Active Style

**Date & Time**: 2026-04-09 06:53 UTC

## What Changed
Updated the active/selected state styling for thread items and settings items in the Chela sidebar.
Replaced the low-opacity accent background (`bg-accent/10 text-accent` / `bg-accent/10 text-[color:var(--color-accent)]`) with an elevated card style (`bg-white dark:bg-shell-panel-elevated shadow-sm text-foreground font-medium`).

## Why it Changed
The previous low-opacity accent background provided poor contrast against the grayish sidebar background (`bg-shell-window` or `bg-secondary`), making the selected thread or setting hard to read. The new elevated card style stands out nicely and improves readability by creating a distinct layered appearance instead of blending into the background.

## Files Modified
- `src/renderer/src/components/assistant-ui/sidebar.tsx`
