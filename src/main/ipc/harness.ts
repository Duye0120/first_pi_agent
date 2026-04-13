import { IPC_CHANNELS } from "../../shared/ipc.js";
import {
  dismissInterruptedApproval,
  listInterruptedApprovalGroups,
  listInterruptedApprovals,
  resumeInterruptedApproval,
  resolveApprovalResponse,
} from "../harness/approvals.js";
import { handleIpc } from "./handle.js";

export function registerHarnessIpc(): void {
  handleIpc(
    IPC_CHANNELS.agentConfirmResponse,
    async (_event, response) => resolveApprovalResponse(response),
  );
  handleIpc(
    IPC_CHANNELS.agentListInterruptedApprovals,
    async (_event, sessionId?: string) => listInterruptedApprovals(sessionId),
  );
  handleIpc(
    IPC_CHANNELS.agentListInterruptedApprovalGroups,
    async (_event, sessionId?: string) => listInterruptedApprovalGroups(sessionId),
  );
  handleIpc(
    IPC_CHANNELS.agentDismissInterruptedApproval,
    async (_event, runId: string) => dismissInterruptedApproval(runId),
  );
  handleIpc(
    IPC_CHANNELS.agentResumeInterruptedApproval,
    async (_event, runId: string) => resumeInterruptedApproval(runId),
  );
}
