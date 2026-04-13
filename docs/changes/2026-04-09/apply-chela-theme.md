# Apply Chela Theme and Refine UI

**Time:** 2026-04-09 14:48:37

## What Changed
1. **Color Palette Update:**
   - Replaced old arbitrary color variables with the Chela palette (`--chela-50` to `950`, `--chela-slate-50` to `950`, etc.) in `theme.css`.
   - Updated `tailwind.config.ts` to map the `chela` color tokens.
   - Mapped legacy semantic variables (e.g., `bg-primary`, `bg-secondary`, `bg-shell-window`) to the new Chela tokens in both Light and Dark mode to ensure seamless transition without breaking UI layouts.
2. **UI Border and Structure Refinement:**
   - Removed unnecessary borders from `Badge`, `Switch`, `Checkbox`, and Settings panels (`about-section.tsx`, `keys-section.tsx`, etc.).
   - Transitioned these components to use background colors (`bg-shell-panel-muted`, etc.) and padding/margins for visual hierarchy instead of heavy outlines.
3. **Unified Selection States:**
   - Updated `Sidebar`, `Model Selector`, `Select`, and `Branch Switcher` to use a consistent `bg-accent/10 text-accent` for selected/active states, replacing various legacy inset shadows and inconsistent highlights.
4. **Context Summary Shadows Refined:**
   - Removed hardcoded heavy box-shadow arrays (`shadow-[0_12px_28px_rgba(0,0,0,0.12)]`) and inset borders (`shadow-[inset_...]`) from `context-summary-trigger.tsx`.
   - Replaced them with standard tailwind shadows (`shadow-lg`, `shadow-xl`) and semantic backgrounds (`bg-shell-panel-elevated`) to maintain a lighter, cleaner appearance in light mode.

## Why Changed
- To align the frontend UI with the newly introduced `chela-theme-tokens.md` ("蟹壳橙" and "深海蓝灰").
- To strictly adhere to UI design project rules: "UI 设计默认谨慎使用 border", "选择态的视觉语言要统一", and "context 浮层在浅色模式下不要用发黑、发重的阴影".

## Files Modified
- `src/renderer/src/styles/theme.css`
- `tailwind.config.ts`
- `src/renderer/src/components/ui/badge.tsx`
- `src/renderer/src/components/ui/switch.tsx`
- `src/renderer/src/components/ui/checkbox.tsx`
- `src/renderer/src/components/assistant-ui/settings/*.tsx`
- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `src/renderer/src/components/assistant-ui/model-selector.tsx`
- `src/renderer/src/components/assistant-ui/branch-switcher.tsx`
- `src/renderer/src/components/assistant-ui/select.tsx`
- `src/renderer/src/components/assistant-ui/context-summary-trigger.tsx`
