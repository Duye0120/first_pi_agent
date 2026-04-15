import type { GenerateCommitMessageRequest, GitDiffFile } from "../../shared/contracts.js";
import { IPC_CHANNELS } from "../../shared/ipc.js";
import { handleIpc } from "./handle.js";
import { WorkerService } from "../worker-service.js";

function buildCommitMessagePrompt(
  selectedFiles: GitDiffFile[],
  diffContent: string,
): string {
  const fileList = selectedFiles
    .map((f) => `[${f.status}] ${f.path} (+${f.additions}/-${f.deletions})`)
    .join("\n");

  return [
    "You are a helpful assistant. Generate a concise git commit message based on the following file changes and diff content.",
    "Format:",
    "<title>",
    "<body>",
    "",
    "Changes:",
    fileList,
    "",
    "Diffs:",
    diffContent,
  ].join("\n");
}

export function registerWorkerIpc(): void {
  handleIpc(
    IPC_CHANNELS.workerGenerateCommitMessage,
    async (_event, request: GenerateCommitMessageRequest) => {
      const prompt = buildCommitMessagePrompt(
        request.selectedFiles,
        request.diffContent,
      );
      return WorkerService.generateText(prompt);
    },
  );
}
