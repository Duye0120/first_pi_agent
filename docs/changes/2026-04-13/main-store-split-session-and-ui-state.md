# Main Store 拆分为 session facade 与 UI state

> 时间：2026-04-13 17:57:44
> 本次变更：把 `src/main/store.ts` 按职责拆成 `src/main/session/facade.ts` 和 `src/main/ui-state.ts`，并同步修正 main 进程相关导入。
> 触发原因：当前 `store.ts` 同时承担 session CRUD、UI 状态和分组存储职责；这次按既有逻辑原样搬迁，降低文件职责混杂度，方便后续继续整理 main 进程模块边界。

## 本轮改了什么

- 新增 `src/main/session/facade.ts`
  - 原样承接 session CRUD 导出：
    `listSessions`、`loadSession`、`saveSession`、`createSession`、`deleteSession`
    `listArchivedSessions`、`archiveSession`、`unarchiveSession`
    `setSessionGroup`、`renameSession`、`setSessionPinned`
- 新增 `src/main/ui-state.ts`
  - 原样承接 UI 与分组导出：
    `getUiState`、`setDiffPanelOpen`
    `listGroups`、`createGroup`、`renameGroup`、`deleteGroup`
  - 同步迁移仅被这组能力使用的私有 helper：
    `getDataDir`、`getUiStatePath`、`getGroupsPath`
    `ensureParentDir`、`atomicWrite`、`readJsonFile`
    `writeUiState`、`writeGroups`
- 删除 `src/main/store.ts`
- 更新 main 进程内引用
  - session 相关调用改指向 `../session/facade.js`
  - UI state / group 相关调用改指向 `../ui-state.js`

## 为什么这么改

- `store.ts` 的职责边界已经自然分成两块：session facade 和本地 UI/group 状态。
- 这次只做文件级搬迁，不改逻辑，能在低风险前提下让后续维护入口更清晰。

## 涉及文件

- `src/main/session/facade.ts`
- `src/main/ui-state.ts`
- `src/main/ipc/sessions.ts`
- `src/main/ipc/workbench.ts`
- `src/main/reflection/service.ts`
- `src/main/chat/types.ts`
- `src/main/chat/prepare.ts`
- `src/main/store.ts`

## 验证

- `2026-04-13 17:57:44`
  `npx tsc --noEmit --pretty false`
