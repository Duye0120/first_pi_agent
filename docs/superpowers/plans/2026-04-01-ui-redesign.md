# UI Redesign — 1:1 复刻 Codex 设计语言

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Design spec:** `docs/superpowers/specs/2026-04-01-ui-redesign-design.md` — 每个组件的字号、间距、圆角、配色都在 spec 里写死了，照着来。

**Goal:** 把当前松散、粗糙的 UI 1:1 改造成 Codex 风格的紧凑、干净、精致界面，并新增归档功能。

**Architecture:** 数据层（归档 CRUD） → 全局样式 → 逐组件重写。不改 agent/MCP/terminal 逻辑。

**Tech Stack:** React 19, Tailwind CSS 4, HeroUI, Heroicons, Framer Motion, Electron IPC

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/shared/contracts.ts` | Modify | Add `archived` field, add archive methods to DesktopApi |
| `src/shared/ipc.ts` | Modify | Add 4 archive IPC channel names |
| `src/main/store.ts` | Modify | Archive/unarchive/listArchived functions, filter archived from listSessions, getUiState default |
| `src/main/index.ts` | Modify | Register archive IPC handlers, update backgroundColor |
| `src/preload/index.ts` | Modify | Expose archive methods via contextBridge |
| `src/renderer/index.html` | Modify | Body bg color `#f0f0f0` |
| `src/renderer/src/styles/theme.css` | Modify | `--color-bg-shell: #f0f0f0` |
| `src/renderer/src/styles.css` | Modify | Scrollbar 6px |
| `src/renderer/src/App.tsx` | Modify | rightPanelOpen=false, layout padding, boot/error compact, archive callbacks |
| `src/renderer/src/components/Sidebar.tsx` | Rewrite | Compact Codex-style, archive UI |
| `src/renderer/src/components/Composer.tsx` | Rewrite | Compact card, merged toolbar |
| `src/renderer/src/components/MessageList.tsx` | Modify | Right-aligned user bubbles, no labels, compact padding |

---

### Task 1: Archive Data Layer (contracts + store + IPC + preload)

**Files:**
- Modify: `src/shared/contracts.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/store.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add `archived` field to contracts.ts**

In `src/shared/contracts.ts`, add `archived?: boolean` to both `ChatSession` (after `updatedAt: string;`) and `ChatSessionSummary` (after `messageCount: number;`).

Update `summarizeSession`:

```ts
export function summarizeSession(session: ChatSession): ChatSessionSummary {
  return {
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
    archived: session.archived,
  };
}
```

Add archive methods to `DesktopApi.sessions`:

```ts
  sessions: {
    list: () => Promise<ChatSessionSummary[]>;
    load: (sessionId: string) => Promise<ChatSession | null>;
    save: (session: ChatSession) => Promise<void>;
    create: () => Promise<ChatSession>;
    archive: (sessionId: string) => Promise<void>;
    unarchive: (sessionId: string) => Promise<void>;
    listArchived: () => Promise<ChatSessionSummary[]>;
    delete: (sessionId: string) => Promise<void>;
  };
```

- [ ] **Step 2: Add IPC channels in ipc.ts**

In `src/shared/ipc.ts`, add after `sessionsCreate`:

```ts
  sessionsArchive: "sessions:archive",
  sessionsUnarchive: "sessions:unarchive",
  sessionsListArchived: "sessions:list-archived",
  sessionsDelete: "sessions:delete",
```

- [ ] **Step 3: Add store functions in store.ts**

Update `listSessions` to filter out archived:

```ts
export function listSessions(): ChatSessionSummary[] {
  const index = readIndex();
  return [...index.summaries]
    .filter((s) => !s.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
```

Add three new exports after `deleteSession`:

```ts
export function listArchivedSessions(): ChatSessionSummary[] {
  const index = readIndex();
  return [...index.summaries]
    .filter((s) => s.archived === true)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function archiveSession(sessionId: string): void {
  const session = loadSession(sessionId);
  if (!session) return;
  session.archived = true;
  saveSession(session);
}

export function unarchiveSession(sessionId: string): void {
  const session = loadSession(sessionId);
  if (!session) return;
  session.archived = false;
  saveSession(session);
}
```

Update `getUiState()` default return to `{ rightPanelOpen: false }`.

- [ ] **Step 4: Register IPC handlers in main/index.ts**

Update import:

```ts
import { archiveSession, createSession, deleteSession, getUiState, listArchivedSessions, listSessions, loadSession, saveSession, setRightPanelOpen, unarchiveSession } from "./store.js";
```

Add after `sessionsCreate` handler:

```ts
  ipcMain.handle(IPC_CHANNELS.sessionsArchive, async (_event, sessionId: string) => archiveSession(sessionId));
  ipcMain.handle(IPC_CHANNELS.sessionsUnarchive, async (_event, sessionId: string) => unarchiveSession(sessionId));
  ipcMain.handle(IPC_CHANNELS.sessionsListArchived, async () => listArchivedSessions());
  ipcMain.handle(IPC_CHANNELS.sessionsDelete, async (_event, sessionId: string) => deleteSession(sessionId));
```

Update `backgroundColor` in `createMainWindow()` to `"#f0f0f0"`.

- [ ] **Step 5: Expose archive methods in preload/index.ts**

Add to `sessions` object after `create`:

```ts
    archive: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.sessionsArchive, sessionId),
    unarchive: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.sessionsUnarchive, sessionId),
    listArchived: () => ipcRenderer.invoke(IPC_CHANNELS.sessionsListArchived),
    delete: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.sessionsDelete, sessionId),
```

- [ ] **Step 6: Type-check**

Run: `pnpm check`

- [ ] **Step 7: Commit**

```bash
git add src/shared/contracts.ts src/shared/ipc.ts src/main/store.ts src/main/index.ts src/preload/index.ts
git commit -m "feat: add session archive/unarchive/delete data layer"
```

---

### Task 2: Global Styles — Theme, Scrollbar, Background

**Files:**
- Modify: `src/renderer/src/styles/theme.css`
- Modify: `src/renderer/src/styles.css`
- Modify: `src/renderer/index.html`

- [ ] **Step 1: Update theme.css**

Change `--color-bg-shell` to `#f0f0f0` (from `#e8ecf2`).

- [ ] **Step 2: Update styles.css scrollbar**

Change scrollbar width/height to `6px` (from `10px`).

- [ ] **Step 3: Update index.html**

Change body class to `bg-[#f0f0f0]` (from `bg-[#e8ecf2]`).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/styles/theme.css src/renderer/src/styles.css src/renderer/index.html
git commit -m "style: neutral gray shell background, slim scrollbar"
```

---

### Task 3: App.tsx — Layout, Boot/Error, Panel Default, Archive Wiring

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Change rightPanelOpen default to `false`**

- [ ] **Step 2: Compact the booting screen**

```tsx
  if (booting) {
    return (
      <main className="grid h-screen place-items-center bg-[#f0f0f0] text-gray-400">
        <div className="rounded-xl border border-black/6 bg-white/80 px-6 py-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400">Booting</p>
          <h1 className="mt-2 text-lg font-medium text-gray-800">正在拉起桌面聊天壳…</h1>
          <p className="mt-1 text-xs text-gray-400">会话状态、窗口状态和本地文件能力正在就位。</p>
        </div>
      </main>
    );
  }
```

- [ ] **Step 3: Compact the error screen**

```tsx
  if (bootError) {
    return (
      <main className="grid h-screen place-items-center bg-[#f0f0f0] px-6 text-gray-400">
        <div className="max-w-lg rounded-xl border border-rose-400/20 bg-rose-50 px-6 py-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.2em] text-rose-300">Renderer Error</p>
          <h1 className="mt-2 text-lg font-medium text-gray-800">界面初始化失败</h1>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-gray-500">{bootError}</p>
          <p className="mt-2 text-xs text-gray-400">现在就算 preload 出问题，也不会再整窗发黑，而是直接显示诊断信息。</p>
        </div>
      </main>
    );
  }
```

- [ ] **Step 4: Tighten main layout**

- Main bg: `bg-[#f0f0f0] text-gray-800`
- Sidebar grid: `grid-cols-[200px_minmax(0,1fr)]` (from 220px)
- Floating workspace: `rounded-tl-xl` (from `rounded-tl-2xl`)
- Header: `px-4 py-2` (from `px-5 py-3`), title `text-[13px] font-medium text-gray-500`

- [ ] **Step 5: Add archived state and callbacks**

Add state:

```tsx
const [archivedSummaries, setArchivedSummaries] = useState<ChatSessionSummary[]>([]);
```

In `bootApp`, after `setSummaries(sessionSummaries)`:

```tsx
const archivedList = await desktopApi.sessions.listArchived();
setArchivedSummaries(archivedList);
```

Add callbacks:

```tsx
const archiveSession = useCallback(async (sessionId: string) => {
  if (!desktopApi) return;
  await desktopApi.sessions.archive(sessionId);

  let archivedItem: ChatSessionSummary | undefined;
  setSummaries((current) => {
    archivedItem = current.find((s) => s.id === sessionId);
    return current.filter((s) => s.id !== sessionId);
  });

  if (archivedItem) {
    setArchivedSummaries((prev) => [{ ...archivedItem!, archived: true }, ...prev]);
  }

  if (sessionId === activeSessionId) {
    const remaining = summaries.filter((s) => s.id !== sessionId);
    if (remaining.length > 0) {
      void selectSession(remaining[0].id);
    } else {
      void createNewSession();
    }
  }
}, [desktopApi, activeSessionId, summaries, selectSession, createNewSession]);

const unarchiveSession = useCallback(async (sessionId: string) => {
  if (!desktopApi) return;
  await desktopApi.sessions.unarchive(sessionId);
  setArchivedSummaries((current) => current.filter((s) => s.id !== sessionId));
  const freshList = await desktopApi.sessions.list();
  setSummaries(freshList);
}, [desktopApi]);

const deleteSessionPermanently = useCallback(async (sessionId: string) => {
  if (!desktopApi) return;
  await desktopApi.sessions.delete(sessionId);
  setArchivedSummaries((current) => current.filter((s) => s.id !== sessionId));
}, [desktopApi]);
```

- [ ] **Step 6: Update Sidebar props**

```tsx
<Sidebar
  summaries={summaries}
  activeSessionId={activeSessionId}
  onSelectSession={selectSession}
  onNewSession={createNewSession}
  onOpenSettings={() => setSettingsOpen(true)}
  onArchiveSession={archiveSession}
  onUnarchiveSession={unarchiveSession}
  onDeleteSession={deleteSessionPermanently}
  archivedSummaries={archivedSummaries}
/>
```

- [ ] **Step 7: Type-check**

Run: `pnpm check`

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "style: compact App layout + archive wiring"
```

---

### Task 4: Sidebar Rewrite

**Files:**
- Rewrite: `src/renderer/src/components/Sidebar.tsx`

- [ ] **Step 1: Replace Sidebar.tsx entirely**

```tsx
import { useState } from "react";
import {
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  Cog6ToothIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import type { ChatSessionSummary } from "@shared/contracts";
import { formatRelativeTime } from "@renderer/lib/session";

type SidebarProps = {
  summaries: ChatSessionSummary[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
  onArchiveSession: (sessionId: string) => void;
  onUnarchiveSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  archivedSummaries: ChatSessionSummary[];
};

export function Sidebar({
  summaries,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onOpenSettings,
  onArchiveSession,
  onUnarchiveSession,
  onDeleteSession,
  archivedSummaries,
}: SidebarProps) {
  const [showArchived, setShowArchived] = useState(false);

  return (
    <aside className="flex h-full flex-col bg-transparent text-[13px]">
      {/* Top: New thread */}
      <div className="px-2 pb-1 pt-2">
        <button
          type="button"
          onClick={onNewSession}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-gray-600 transition hover:bg-white/50"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          <span>新线程</span>
        </button>
      </div>

      {/* Threads header */}
      <div className="px-3 pb-1 pt-2">
        {showArchived ? (
          <button
            type="button"
            onClick={() => setShowArchived(false)}
            className="flex items-center gap-1.5 text-[11px] text-gray-400 transition hover:text-gray-600"
          >
            <ArrowUturnLeftIcon className="h-3 w-3" />
            <span>返回</span>
          </button>
        ) : (
          <span className="text-[11px] font-medium text-gray-400">线程</span>
        )}
      </div>

      {/* Thread list */}
      <div className="flex-1 space-y-px overflow-y-auto px-2 pb-2">
        {showArchived ? (
          archivedSummaries.length === 0 ? (
            <p className="px-2 py-4 text-center text-[11px] text-gray-300">没有已归档的线程</p>
          ) : (
            archivedSummaries.map((summary) => (
              <div
                key={summary.id}
                className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-white/50"
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectSession(summary.id);
                    setShowArchived(false);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-[12px] text-gray-500">{summary.title}</span>
                </button>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => onUnarchiveSession(summary.id)}
                    className="rounded p-0.5 text-gray-400 hover:bg-black/5 hover:text-gray-600"
                    title="恢复"
                  >
                    <ArrowUturnLeftIcon className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSession(summary.id)}
                    className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    title="永久删除"
                  >
                    <TrashIcon className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))
          )
        ) : (
          summaries.map((summary) => {
            const active = summary.id === activeSessionId;
            return (
              <div
                key={summary.id}
                className={`group flex items-center rounded-md px-2 py-1.5 transition ${
                  active ? "bg-white/60" : "hover:bg-white/40"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectSession(summary.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-[12px] ${active ? "text-gray-800" : "text-gray-500"}`}>
                      {summary.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-gray-300">
                      {formatRelativeTime(summary.updatedAt)}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchiveSession(summary.id);
                  }}
                  className="ml-1 shrink-0 rounded p-0.5 text-gray-300 opacity-0 transition hover:bg-black/5 hover:text-gray-500 group-hover:opacity-100"
                  title="归档"
                >
                  <ArchiveBoxIcon className="h-3 w-3" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom: Archive entry + Settings */}
      <div className="border-t border-black/4 px-2 py-1.5">
        {!showArchived && (
          <button
            type="button"
            onClick={() => setShowArchived(true)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-gray-400 transition hover:bg-white/50 hover:text-gray-600"
          >
            <ArchiveBoxIcon className="h-3.5 w-3.5" />
            已归档
            {archivedSummaries.length > 0 && (
              <span className="ml-auto text-[10px] text-gray-300">{archivedSummaries.length}</span>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-gray-400 transition hover:bg-white/50 hover:text-gray-600"
        >
          <Cog6ToothIcon className="h-3.5 w-3.5" />
          设置
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm check`

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx
git commit -m "feat: rewrite Sidebar — Codex-style compact layout with archive"
```

---

### Task 5: Composer Rewrite

**Files:**
- Rewrite: `src/renderer/src/components/Composer.tsx`

- [ ] **Step 1: Replace Composer return JSX**

Replace the entire `return` block (the `<section>` element) with:

```tsx
    <section className="px-6 pb-4 pt-1">
      <div className="mx-auto max-w-3xl rounded-xl border border-black/8 bg-white px-4 py-3 shadow-[0_2px_8px_rgba(99,117,145,0.04)]">
        {attachments.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((attachment) => (
              <Chip
                key={attachment.id}
                variant="tertiary"
                className="border-black/8 bg-white text-[11px] text-gray-500"
              >
                <span className="inline-flex items-center gap-1.5">
                  <PaperClipIcon className="h-3 w-3 text-gray-400" />
                  <span className="max-w-32 truncate">{attachment.name}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(attachment.id)}
                    className="rounded-full p-0.5 text-gray-400 transition hover:bg-black/5 hover:text-gray-600"
                  >
                    <XMarkIcon className="h-3 w-3" />
                  </button>
                </span>
              </Chip>
            ))}
          </div>
        ) : null}

        <TextArea
          ref={textareaRef}
          value={draft}
          rows={1}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder="向 Pi Agent 提问..."
          variant="secondary"
          className="w-full border-none bg-transparent text-[13px] leading-7 text-gray-800 shadow-none outline-none placeholder:text-gray-300"
        />

        <div className="mt-2 flex items-center justify-between gap-2 border-t border-black/4 pt-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onAttachFiles}
              disabled={isPickingFiles}
              className="rounded p-1 text-gray-400 transition hover:bg-black/4 hover:text-gray-600 disabled:cursor-not-allowed disabled:text-gray-200"
              title="添加文件"
            >
              <PaperClipIcon className="h-3.5 w-3.5" />
            </button>
            <ModelSelector
              currentModel={currentModel}
              thinkingLevel={thinkingLevel}
              onModelChange={onModelChange}
              onThinkingLevelChange={onThinkingLevelChange}
            />
          </div>

          {isAgentRunning ? (
            <button
              type="button"
              onClick={onCancel}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-600"
            >
              <StopCircleIcon className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={isSending || (!draft.trim() && attachments.length === 0)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-800 text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            >
              <PaperAirplaneIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </section>
```

Remove unused `Button` import from `@heroui/react` (keep `Chip` and `TextArea`).

- [ ] **Step 2: Type-check**

Run: `pnpm check`

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Composer.tsx
git commit -m "style: compact Composer — Codex-style merged toolbar"
```

---

### Task 6: MessageList — Compact Messages

**Files:**
- Modify: `src/renderer/src/components/MessageList.tsx`

- [ ] **Step 1: Update empty state**

Replace the empty state return (`items.length === 0` block) with:

```tsx
  if (items.length === 0) {
    return (
      <section className="flex min-h-full flex-col items-center justify-center px-8 py-8">
        <div className="flex flex-col items-center text-center">
          <div className="grid h-10 w-10 place-items-center rounded-full border border-black/6 bg-gray-50 text-gray-400">
            <CloudIcon className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-medium text-gray-700">开始构建</h2>
          <p className="mt-1 text-[13px] text-gray-300">first_pi_agent</p>
        </div>
      </section>
    );
  }
```

- [ ] **Step 2: Update user message**

Replace the `message.role === "user"` branch:

```tsx
    if (message.role === "user") {
      return (
        <article className="flex justify-end px-8 py-2">
          <div className="max-w-[75%] rounded-2xl bg-gray-100 px-3.5 py-2 text-[13px] leading-7 text-gray-800">
            {message.content}
          </div>
        </article>
      );
    }
```

- [ ] **Step 3: Update assistant message (no steps)**

Replace the fallback assistant return:

```tsx
    return (
      <article className="px-8 py-2">
        <FinalReply text={message.content} />
      </article>
    );
```

- [ ] **Step 4: Update system message**

```tsx
        <div className="px-8 py-2">
          <div className="rounded-xl border border-amber-400/20 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            {message.content}
          </div>
        </div>
```

- [ ] **Step 5: Update streaming/agent response wrappers**

All `<AgentResponseBlock>` wrappers: change to `<div className="px-8 py-2">`.

- [ ] **Step 6: Update Virtuoso container**

Change to `className="mx-auto w-full max-w-3xl"`.

- [ ] **Step 7: Remove unused imports**

Remove `ChevronDownIcon`. Remove `formatTime` if no longer used.

- [ ] **Step 8: Type-check**

Run: `pnpm check`

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/components/MessageList.tsx
git commit -m "style: compact messages — right-aligned user bubbles, no labels"
```

---

### Task 7: Visual QA

- [ ] **Step 1:** Run `pnpm dev`, open in Electron
- [ ] **Step 2:** Verify sidebar: compact items, "新线程" small, "已归档" entry, hover archive icon
- [ ] **Step 3:** Verify empty state: small icon + "开始构建" 18px
- [ ] **Step 4:** Verify composer: narrow card, merged toolbar, 28px send button
- [ ] **Step 5:** Verify messages: user right-aligned gray bubble, no labels
- [ ] **Step 6:** Verify right panel hidden by default
- [ ] **Step 7:** Verify archive: archive → appears in archive list → restore/delete works
- [ ] **Step 8:** Fix any visual issues found
- [ ] **Step 9:** Final commit

```bash
git add -A
git commit -m "fix: visual QA adjustments"
```
