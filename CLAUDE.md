# CLAUDE.md

alwasy resopnse in chinese.
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Electron desktop chat workbench (Codex-style) — the host shell for a future AI agent. Currently uses mock assistant replies; real agent integration is the next phase. UI and all text are in Chinese.

## Commands

```bash
pnpm install            # Install dependencies
pnpm dev                # Launch Electron app in dev mode (hot reload)
pnpm build              # Production build
pnpm start              # Preview built app
pnpm check              # Type-check both main and renderer tsconfigs
pnpm demo:cli           # Run legacy CLI agent demo
pnpm mcp:dev            # Run legacy MCP ChatGPT app (watch mode)
```

If `pnpm dev` fails with "Electron uninstall", run `node node_modules/electron/install.js` or `pnpm approve-builds`.

## Architecture

Three-process Electron app with type-safe IPC:

```
Main Process (src/main/)       ── IPC ──  Preload (src/preload/)  ── contextBridge ──  Renderer (src/renderer/)
  - Window management                      - Exposes desktopApi                         - React 19 UI
  - IPC handlers                           - Context-isolated                           - Tailwind CSS 4
  - File I/O & session store                                                            - HeroUI components
  - Mock chat (swap point for agent)                                                    - Framer Motion
```

**Shared contracts** (`src/shared/`) define all TypeScript types and IPC channel names used across processes. Both `contracts.ts` and `ipc.ts` are imported by main, preload, and renderer — changes here affect all three.

**Path aliases** (configured in `electron.vite.config.ts` and both tsconfigs):
- `@shared` → `src/shared`
- `@renderer` → `src/renderer/src`

### Key Integration Point

`src/main/index.ts` handles `chat:send` IPC — currently calls `buildMockAssistantReply()` from `src/main/mockChat.ts`. Replace this with real agent/model calls.

### State Persistence

Sessions, messages, drafts, attachments, and UI state are stored as JSON at `${app.getPath('userData')}/desktop-shell-state.json` via `src/main/store.ts`.

### Legacy Code (preserved for migration)

- `src/agent/` — pi-agent-core agent factory
- `src/tools/` — example agent tools
- `src/chatgpt/` — MCP ChatGPT app server
- `src/main.ts` / `src/config.ts` — CLI demo entry and BYOK config

## Conventions

- Package manager: **pnpm**
- Frameless window with custom title bar — window controls are in `TitleBar.tsx`
- Renderer has no Node.js access (context isolation) — all system calls go through `window.desktopApi`
- UI component library: HeroUI + Headless UI + Heroicons
- commit 时不要带上 Co-Authored-By
- 如果没有明确要求，不要build
