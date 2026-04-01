import type { AgentTool } from "@mariozechner/pi-agent-core";
import { getTimeTool } from "../../tools/getTime.js";
import { createFileReadTool } from "./file-read.js";
import { createFileWriteTool } from "./file-write.js";
import { createShellExecTool } from "./shell-exec.js";
import { createWebFetchTool } from "./web-fetch.js";

/**
 * Returns all built-in tools configured for the given workspace.
 */
export function getBuiltinTools(workspacePath: string): AgentTool<any, any>[] {
  return [
    getTimeTool,
    createFileReadTool(workspacePath),
    createFileWriteTool(workspacePath),
    createShellExecTool(workspacePath),
    createWebFetchTool(),
  ];
}
