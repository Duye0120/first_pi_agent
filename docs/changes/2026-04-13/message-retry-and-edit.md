# 聊天消息重试与编辑

> 更新时间：2026-04-13 18:54:17

## 这次做了什么

- 给 assistant 消息补上了 `重试` 和 `复制` 动作，沿用消息 hover 后出现的 action bar 交互。
- 给 user 消息补上了 `编辑` 和 `复制` 动作，保持和现有 thread 控件一致的轻量 ghost 风格，不额外加重描边。
- 新增 main/preload/shared 的消息裁剪接口，支持按 `messageId` 把会话 transcript 从该消息开始截断，并同步清理相关 run 事件、meta 和 snapshot。
- `重试` 现在会回退到对应 assistant 之前的那条 user 消息，再重新发送同一轮输入，避免在 transcript 里留下重复的 user bubble。
- `编辑` 现在会先从该 user 消息处分叉，再创建并切到新的 Git branch，随后把原消息内容和附件回填到 composer，方便继续改写后重发。
- 修了同一 session 裁剪后的 thread 刷新问题，避免 assistant-ui 继续显示旧消息快照。

## 为什么这样改

- 之前 thread 只有 assistant copy，没有 user 侧动作，做回溯修改时必须手动复制、删消息、重输，非常断。
- 现有 session 不是直接存一份 messages 数组，而是由 transcript materialize 出来，所以编辑/重试不能只改 renderer，必须把 transcript、run 事件和 snapshot 一起裁掉。
- `重试` 如果只删 assistant 消息再重发，会额外追加一条重复 user 消息；这轮改成从上一条 user 消息一起回退，结果上仍然是“重跑这一轮”，但 transcript 更干净。
- `编辑` 这里保留为“预填 composer 后等待用户继续改写再发送”，因为它更符合 `编辑` 语义，也和你给出的详细步骤里“focus composer so user can edit and re-send”一致。

## 涉及文件

- `src/main/session/service.ts`
- `src/main/session/facade.ts`
- `src/main/ipc/chat.ts`
- `src/preload/index.ts`
- `src/shared/contracts.ts`
- `src/shared/ipc.ts`
- `src/renderer/src/components/AssistantThreadPanel.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`
- `docs/changes/2026-04-13/message-retry-and-edit.md`

## 验证

- 已运行 `npx tsc --noEmit --pretty false`
