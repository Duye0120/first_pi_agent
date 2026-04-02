# UI Redesign — Codex-Style Compact & Clean

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the current loose, oversized UI into a Codex-style compact, clean interface with archive feature.

**Architecture:** Pure frontend restyling (7 components) + archive feature (data layer → IPC → UI). No changes to agent engine, MCP, or terminal logic.

**Tech Stack:** React 19, Tailwind CSS 4, HeroUI, Heroicons, Framer Motion, Electron IPC

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/shared/contracts.ts` | Modify | Add `archived` field to ChatSession/ChatSessionSummary, add archive methods to DesktopApi |
| `src/shared/ipc.ts` | Modify | Add 4 archive IPC channel names |
| `src/main/store.ts` | Modify | Add archiveSession, unarchiveSession, listArchivedSessions; filter archived from listSessions |
| `src/main/index.ts` | Modify | Register 4 archive IPC handlers, update backgroundColor |
| `src/preload/index.ts` | Modify | Expose 4 archive methods via contextBridge |
| `src/renderer/index.html` | Modify | Change body bg color |
| `src/renderer/src/styles/theme.css` | Modify | Change `--color-bg-shell` |
| `src/renderer/src/styles.css` | Modify | Scrollbar width, floating-workspace border-radius |
| `src/renderer/src/App.tsx` | Modify | rightPanelOpen default, padding/font sizes on boot/error screens, sidebar width |
| `src/renderer/src/components/Sidebar.tsx` | Rewrite | Compact layout, archive entry, archive list view |
| `src/renderer/src/components/Composer.tsx` | Modify | Tighten padding, merge toolbar rows |
| `src/renderer/src/components/MessageList.tsx` | Modify | User msg right-align gray bubble, assistant msg no label |

---

### Task 1: Archive Data Layer (contracts + store + IPC + preload)

**Files:**
- Modify: `src/shared/contracts.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/store.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add `archived` field to contracts.ts**

In `src/shared/contracts.ts`, add `archived?: boolean` to both `ChatSession` and `ChatSessionSummary`:

```ts
// ChatSession — add after `updatedAt: string;`
  archived?: boolean;

// ChatSessionSummary — add after `messageCount: number;`
  archived?: boolean;
```

Update `summarizeSession` to include archived:

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

In `src/main/store.ts`:

Update `listSessions` to filter out archived:

```ts
export function listSessions(): ChatSessionSummary[] {
  const index = readIndex();
  return [...index.summaries]
    .filter((s) => !s.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
```

Add three new functions after `deleteSession`:

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

Update import in `src/main/index.ts` — will be done in next step.

- [ ] **Step 4: Register IPC handlers in main/index.ts**

In `src/main/index.ts`, update the import from `./store.js`:

```ts
import { archiveSession, createSession, deleteSession, getUiState, listArchivedSessions, listSessions, loadSession, saveSession, setRightPanelOpen, unarchiveSession } from "./store.js";
```

Add after the `sessionsCreate` handler (line ~79):

```ts
  ipcMain.handle(IPC_CHANNELS.sessionsArchive, async (_event, sessionId: string) => archiveSession(sessionId));
  ipcMain.handle(IPC_CHANNELS.sessionsUnarchive, async (_event, sessionId: string) => unarchiveSession(sessionId));
  ipcMain.handle(IPC_CHANNELS.sessionsListArchived, async () => listArchivedSessions());
  ipcMain.handle(IPC_CHANNELS.sessionsDelete, async (_event, sessionId: string) => deleteSession(sessionId));
```

- [ ] **Step 5: Expose archive methods in preload/index.ts**

In `src/preload/index.ts`, add to the `sessions` object after `create`:

```ts
    archive: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.sessionsArchive, sessionId),
    unarchive: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.sessionsUnarchive, sessionId),
    listArchived: () => ipcRenderer.invoke(IPC_CHANNELS.sessionsListArchived),
    delete: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.sessionsDelete, sessionId),
```

- [ ] **Step 6: Type-check**

Run: `pnpm check`
Expected: No errors

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
- Modify: `src/main/index.ts` (backgroundColor)

- [ ] **Step 1: Update theme.css shell background**

In `src/renderer/src/styles/theme.css`, change:

```css
  --color-bg-shell:          #f0f0f0;
```

(from `#e8ecf2`)

- [ ] **Step 2: Update styles.css scrollbar and floating-workspace**

In `src/renderer/src/styles.css`, change scrollbar width:

```css
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
```

(from `10px`)

- [ ] **Step 3: Update index.html body background**

In `src/renderer/index.html`, change:

```html
  <body class="bg-[#f0f0f0]">
```

(from `bg-[#e8ecf2]`)

- [ ] **Step 4: Update Electron window backgroundColor**

In `src/main/index.ts`, in `createMainWindow()`, change:

```ts
    backgroundColor: "#f0f0f0",
```

(from `#e8ecf2`)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/styles/theme.css src/renderer/src/styles.css src/renderer/index.html src/main/index.ts
git commit -m "style: update shell background to neutral gray, slim scrollbar"
```

---

### Task 3: App.tsx — Default Panel State, Boot/Error Screens, Sidebar Width

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Change rightPanelOpen default to false**

In `src/renderer/src/App.tsx`, line 41, change:

```ts
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
```

(from `true`)

- [ ] **Step 2: Compact the booting screen**

Replace the booting return block (lines 344-353) with:

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

Replace the bootError return block (lines 355-366) with:

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

- [ ] **Step 4: Shrink sidebar width and tighten main layout**

In the main return, change the grid from `grid-cols-[220px_minmax(0,1fr)]` to `grid-cols-[200px_minmax(0,1fr)]`:

```tsx
      <div className="grid min-h-0 flex-1 grid-cols-[200px_minmax(0,1fr)]">
```

Change the floating-workspace rounded corner from `rounded-tl-2xl` to `rounded-tl-xl`:

```tsx
          <div className="floating-workspace flex min-h-0 flex-1 flex-col overflow-hidden rounded-tl-xl border-l border-black/8 bg-white">
```

Tighten the thread title header padding from `px-5 py-3` to `px-4 py-2`:

```tsx
            <div className="flex items-center justify-between border-b border-black/6 px-4 py-2">
              <h1 className="text-[13px] font-medium text-gray-500">{activeSession?.title ?? "新线程"}</h1>
```

Change `bg-[#e8ecf2]` to `bg-[#f0f0f0]` in the main return:

```tsx
    <main className="flex h-screen flex-col bg-[#f0f0f0] text-gray-800">
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "style: compact App layout, default right panel closed"
```

---

### Task 4: Sidebar Rewrite

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Modify: `src/renderer/src/App.tsx` (add archive callbacks)

- [ ] **Step 1: Rewrite Sidebar.tsx**

Replace the entire content of `src/renderer/src/components/Sidebar.tsx`:

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

- [ ] **Step 2: Wire archive callbacks in App.tsx**

In `src/renderer/src/App.tsx`, add state and callbacks. After the `summaries` state (line 39), add:

```tsx
  const [archivedSummaries, setArchivedSummaries] = useState<ChatSessionSummary[]>([]);
```

In `bootApp`, after `setSummaries(sessionSummaries)` add:

```tsx
      const archivedList = await desktopApi.sessions.listArchived();
      setArchivedSummaries(archivedList);
```

Add these callbacks before the `return` block (near the other callbacks):

```tsx
  const archiveSession = useCallback(async (sessionId: string) => {
    if (!desktopApi) return;
    await desktopApi.sessions.archive(sessionId);
    setSummaries((current) => current.filter((s) => s.id !== sessionId));
    const archived = current.find((s) => s.id === sessionId);
    if (archived) {
      setArchivedSummaries((prev) => [{ ...archived, archived: true }, ...prev]);
    }
    // If we archived the active session, switch to another
    if (sessionId === activeSessionId) {
      const remaining = summaries.filter((s) => s.id !== sessionId);
      if (remaining.length > 0) {
        void selectSession(remaining[0].id);
      } else {
        void createNewSession();
      }
    }
  }, [desktopApi, activeSessionId, summaries, selectSession, createNewSession]);
```

Wait — the closure over `current` won't work like that. Let me write it correctly:

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
    // Reload active list
    const freshList = await desktopApi.sessions.list();
    setSummaries(freshList);
  }, [desktopApi]);

  const deleteSessionPermanently = useCallback(async (sessionId: string) => {
    if (!desktopApi) return;
    await desktopApi.sessions.delete(sessionId);
    setArchivedSummaries((current) => current.filter((s) => s.id !== sessionId));
  }, [desktopApi]);
```

Update the `<Sidebar>` component usage to pass the new props:

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

Remove the unused imports that the old Sidebar used: `AdjustmentsHorizontalIcon`, `BoltIcon`, `Squares2X2Icon` — these are no longer imported by Sidebar.

- [ ] **Step 3: Type-check**

Run: `pnpm check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx src/renderer/src/App.tsx
git commit -m "feat: rewrite Sidebar with compact layout and archive feature"
```

---

### Task 5: Composer — Tighten Padding, Merge Toolbar

**Files:**
- Modify: `src/renderer/src/components/Composer.tsx`

- [ ] **Step 1: Rewrite Composer layout**

Replace the entire `return` in `Composer.tsx` (from line 51 `<section>` to end `</section>`) with:

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

Remove unused `Button` import from `@heroui/react` (keep `Chip` and `TextArea`). Remove the `composer-ghost-button` class usage — we're using plain buttons now.

- [ ] **Step 2: Type-check**

Run: `pnpm check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Composer.tsx
git commit -m "style: compact Composer with merged toolbar"
```

---

### Task 6: MessageList — Compact Messages

**Files:**
- Modify: `src/renderer/src/components/MessageList.tsx`

- [ ] **Step 1: Update empty state**

Replace the empty state return (lines 93-109) with:

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

- [ ] **Step 2: Update user message rendering**

Replace the user message block (inside `renderItem`, the `message.role === "user"` branch) with:

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

- [ ] **Step 3: Update assistant message rendering**

Replace the assistant message fallback block (the last return in renderItem, lines 81-89) with:

```tsx
    return (
      <article className="px-8 py-2">
        <FinalReply text={message.content} />
      </article>
    );
```

- [ ] **Step 4: Update system message padding**

Change the system message padding from `px-12 py-4` to `px-8 py-2`:

```tsx
        <div className="px-8 py-2">
          <div className="rounded-xl border border-amber-400/20 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            {message.content}
          </div>
        </div>
```

- [ ] **Step 5: Update streaming and agent response padding**

Change the streaming response wrapper from `max-w-4xl px-12 py-4` to `px-8 py-2`:

```tsx
        <div className="px-8 py-2">
          <AgentResponseBlock response={item.response} onCancel={onCancelAgent} />
        </div>
```

Same for the persisted assistant with steps:

```tsx
        <div className="px-8 py-2">
          <AgentResponseBlock
            response={{...}}
          />
        </div>
```

- [ ] **Step 6: Update Virtuoso container class**

Change from `max-w-4xl` to `max-w-3xl`:

```tsx
      className="mx-auto w-full max-w-3xl"
```

- [ ] **Step 7: Remove unused imports**

Remove `ChevronDownIcon` from the heroicons import (was used in the old empty state button).

Remove `formatTime` import if no longer used (we removed timestamp display from user messages).

- [ ] **Step 8: Type-check**

Run: `pnpm check`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/components/MessageList.tsx
git commit -m "style: compact message list with right-aligned user bubbles"
```

---

### Task 7: Visual QA — Launch, Screenshot, Fix

- [ ] **Step 1: Launch dev server**

Run: `pnpm dev`

Open the app in browser at `http://localhost:5173` (or in Electron window).

- [ ] **Step 2: Visual check — empty state**

Verify:
- Sidebar is compact with single-line thread items
- "新线程" button is small
- Empty state shows small icon + "开始构建" in 18px
- Right panel is hidden by default
- Background is neutral gray `#f0f0f0`

- [ ] **Step 3: Visual check — composer**

Verify:
- Composer card is narrower (max-w-3xl)
- Attachment button is icon-only
- Model selector and send button are on the same row
- Send button is 28px circle

- [ ] **Step 4: Visual check — archive**

Verify:
- Sidebar shows "已归档" entry above settings
- Hovering a thread shows archive icon
- Clicking archive moves thread to archive list
- Archive view shows restore and delete buttons
- "← 返回" button works

- [ ] **Step 5: Fix any visual issues found**

Address any spacing, alignment, or overflow issues discovered during QA.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "fix: visual QA adjustments for compact UI"
```
