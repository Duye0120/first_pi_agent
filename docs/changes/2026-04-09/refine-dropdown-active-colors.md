# Refine Dropdown Active Colors

**Date:** 2026-04-09
**Time:** 16:30:00

## What Changed
Replaced hardcoded `bg-accent/10` and `text-accent` utility classes with `bg-accent-subtle` and `text-accent-text` for the selected/active states in dropdown and selector components.

## Why
Using `bg-accent/10` over dropdown backgrounds (`bg-shell-panel`, which are white/dark) occasionally resulted in light and less legible contrast, particularly with the orange accent color (`#f97316`). Utilizing the explicitly defined CSS variables (`--chela-accent-subtle` and `--chela-accent-text`) from `theme.css` provides better contrast and centralized control over the active/selected states, aligning with Chela's design system rather than relying on arbitrary opacities.

## Files Modified
- `src/renderer/src/components/assistant-ui/model-selector.tsx`
- `src/renderer/src/components/assistant-ui/branch-switcher.tsx`
- `src/renderer/src/components/assistant-ui/select.tsx`
