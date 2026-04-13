import type { InterruptedApprovalNotice } from "./contracts.js";

export type InterruptedApprovalRecoveryPromptInput = Omit<
  InterruptedApprovalNotice,
  "recoveryPrompt"
>;

function formatNullable(value: string | number | null): string {
  return value === null ? "unknown" : String(value);
}

export function buildInterruptedApprovalRecoveryPrompt(
  approval: InterruptedApprovalRecoveryPromptInput,
): string {
  const lines = [
    "请基于以下中断审批上下文继续处理当前任务。",
    "",
    "恢复原则：",
    "- 先说明你准备继续做什么。",
    "- 需要再次执行工具时重新走审批链。",
    "- 使用当前工作区真实状态判断下一步。",
    "",
    "中断审批上下文：",
    `- sessionId: ${approval.sessionId}`,
    `- runId: ${approval.runId}`,
    `- ownerId: ${approval.ownerId}`,
    `- modelEntryId: ${formatNullable(approval.modelEntryId)}`,
    `- runKind: ${formatNullable(approval.runKind)}`,
    `- runSource: ${formatNullable(approval.runSource)}`,
    `- lane: ${formatNullable(approval.lane)}`,
    `- state: ${formatNullable(approval.state)}`,
    `- currentStepId: ${formatNullable(approval.currentStepId)}`,
    `- interruptedAt: ${approval.interruptedAt}`,
    "",
    "待确认操作：",
    `- kind: ${approval.approval.kind}`,
    `- title: ${approval.approval.title}`,
    `- description: ${approval.approval.description}`,
    `- reason: ${approval.approval.reason}`,
  ];

  if (approval.approval.detail?.trim()) {
    lines.push("", "detail:", "```", approval.approval.detail, "```");
  }

  return lines.join("\n");
}
